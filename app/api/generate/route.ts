import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { fetchRepoContext, type RepoContext } from "@/lib/github";
import { emptyKit, type KitSpec } from "@/lib/schema-v2";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The kit generator's AI backend. Uses any OpenAI-compatible chat endpoint:
 *   OPENAI_API_KEY   (required)
 *   OPENAI_BASE_URL  (optional — point at Azure OpenAI, a local server, or a
 *                     Docker Model Runner, e.g. http://localhost:12434/engines/v1)
 *   OPENAI_MODEL     (optional — defaults to gpt-4o)
 *
 * We use JSON mode (response_format: json_object) for the widest compatibility
 * across providers, and describe the target shape in the prompt. The result is
 * merged defensively into a full KitSpec, so a missing field never breaks it.
 */
const DEFAULT_MODEL = "gpt-4o";

/** The target shape, described for the model (JSON mode doesn't enforce a schema). */
const KIT_SHAPE = `Return a single JSON object with these fields:
{
  "kind": "mixin" | "sandbox",              // required — prefer "mixin"
  "name": string,                            // required — lowercase-with-hyphens, 1-64 chars
  "displayName": string,
  "description": string,                     // required
  "licenses": string[],                      // SPDX identifiers
  "networkAllow": string[],                  // ONLY the exact hosts needed (api domains, package registries, host.docker.internal:PORT)
  "environment": [{ "key": string, "value": string }],
  "install": [{ "command": string, "user": string, "description": string }],   // user "1000" for agent, "0" for root
  "files": [{ "path": string, "content": string, "mode": string, "onlyIfMissing": boolean, "description": string }],
  "credentials": [{ "service": string, "description": string, "required": boolean, "envVarName": string, "injectDomain": string, "scheme": "bearer" | "basic" }],
  "agentInstructions": string,               // required — Markdown addressed to the coding agent
  "sandboxImage": string,                    // only for kind "sandbox"
  "notes": string                            // short note about assumptions to review
}
Include only the fields that apply. Every injectDomain MUST also appear in networkAllow.`;

interface GeneratedKit {
  kind: "mixin" | "sandbox";
  name: string;
  displayName?: string;
  description: string;
  licenses?: string[];
  networkAllow?: string[];
  environment?: { key: string; value: string }[];
  install?: { command: string; user?: string; description?: string }[];
  files?: { path: string; content: string; mode?: string; onlyIfMissing?: boolean; description?: string }[];
  credentials?: {
    service: string;
    description?: string;
    required?: boolean;
    envVarName?: string;
    injectDomain?: string;
    scheme?: "bearer" | "basic" | "";
  }[];
  agentInstructions: string;
  sandboxImage?: string;
  notes?: string;
}

function systemPrompt(): string {
  return `You are an expert author of Docker Sandboxes (sbx) kits, schema version 2. You reply with a single JSON object and nothing else.

An sbx kit is a declarative artifact that extends a sandbox coding agent with a product's capabilities. A "mixin" adds capabilities (packages, env vars, network access, credentials, agent instructions) onto any base agent; a "sandbox" ships its own base image.

${KIT_SHAPE}

Design principles, mirroring the mem0 and litellm reference kits:
- networkAllow: least privilege — only the product's own API domain(s), the package registries needed to install it (pypi.org + files.pythonhosted.org for Python; registry.npmjs.org for Node), and host.docker.internal:PORT if it talks to a host service. Never allow-all.
- Prefer a local Docker Model Runner (host.docker.internal:12434, OPENAI_BASE_URL=http://host.docker.internal:12434/engines/v1, OPENAI_API_KEY=dmr) or a host gateway over embedding cloud credentials, when the product is an LLM tool.
- install: the minimal commands to install the product's library, pinned where possible. Use user "1000" for pip/npm user installs; add --break-system-packages for pip.
- Do NOT hardcode real secrets. If the product needs a real API key, declare it under credentials with envVarName + injectDomain (which must be in networkAllow), scheme "bearer".
- agentInstructions is the most valuable field: concise, accurate Markdown telling the agent what is installed, how it's wired, and how to use it.
- Never invent capabilities the product doesn't have — base everything on the provided repository context. Note assumptions in "notes".`;
}

function userPrompt(ctx: RepoContext): string {
  const manifests = ctx.manifests
    .map((m) => `### ${m.path}\n\`\`\`\n${m.content}\n\`\`\``)
    .join("\n\n");
  return `Generate a schema-v2 kit as JSON for this product.

Repository: ${ctx.url}
Name: ${ctx.owner}/${ctx.repo}
Description: ${ctx.description ?? "(none)"}
Primary language: ${ctx.language ?? "(unknown)"}
License: ${ctx.license ?? "(none)"}
Topics: ${ctx.topics.join(", ") || "(none)"}

## README
${ctx.readme || "(no README found)"}

## Package manifests
${manifests || "(none found)"}`;
}

/** Merge the model's JSON into a full KitSpec. */
function toKitSpec(g: GeneratedKit, ctx: RepoContext): KitSpec {
  const kit = emptyKit(g.kind === "sandbox" ? "sandbox" : "mixin");
  kit.name = (g.name || ctx.repo).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  kit.displayName = g.displayName || ctx.repo;
  kit.description = g.description || ctx.description || "";
  kit.sourceURL = ctx.url;
  kit.licenses = g.licenses?.length ? g.licenses : ctx.license ? [ctx.license] : [];
  kit.network = { allow: g.networkAllow ?? [], deny: [] };
  kit.environment = g.environment ?? [];
  kit.setup = {
    install: (g.install ?? []).map((s) => ({ command: s.command, user: s.user ?? "1000", description: s.description })),
    startup: [],
    files: (g.files ?? []).map((f) => ({
      path: f.path,
      content: f.content,
      mode: f.mode,
      onlyIfMissing: f.onlyIfMissing,
      description: f.description,
    })),
  };
  kit.credentials = (g.credentials ?? []).map((c) => ({
    service: c.service,
    description: c.description,
    required: c.required,
    apiKey: c.envVarName
      ? {
          name: c.envVarName,
          inject: c.injectDomain ? [{ domain: c.injectDomain, scheme: c.scheme || "bearer" }] : [],
        }
      : undefined,
  }));
  kit.agentInstructions = g.agentInstructions || "";
  if (kit.kind === "sandbox") {
    kit.sandbox = { image: g.sandboxImage || "docker.io/library/debian:stable-slim" };
  }
  return kit;
}

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set on the server. Add it to .env and restart." },
      { status: 501 },
    );
  }

  let body: { repo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const repo = body.repo?.trim();
  if (!repo) return NextResponse.json({ error: "Provide a repository." }, { status: 400 });

  let ctx: RepoContext;
  try {
    ctx = await fetchRepoContext(repo);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to read repository.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });

  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      max_tokens: 4000,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: userPrompt(ctx) },
      ],
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) {
      return NextResponse.json({ error: "No content returned by the model." }, { status: 502 });
    }

    const generated = JSON.parse(text) as GeneratedKit;
    const kit = toKitSpec(generated, ctx);
    return NextResponse.json({
      kit,
      notes: generated.notes ?? null,
      context: { url: ctx.url, name: `${ctx.owner}/${ctx.repo}` },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
