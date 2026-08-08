import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchRepoContext, type RepoContext } from "@/lib/github";
import { emptyKit, type KitSpec } from "@/lib/schema-v2";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-opus-4-8";

/**
 * JSON schema constraining Claude's output to a schema-v2 kit. Structured outputs
 * require additionalProperties:false on every object. We keep the shape flat and
 * merge the result into a full KitSpec server-side.
 */
const KIT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["mixin", "sandbox"] },
    name: {
      type: "string",
      description: "lowercase-with-hyphens, 1-64 chars, matching ^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$",
    },
    displayName: { type: "string" },
    description: { type: "string" },
    licenses: { type: "array", items: { type: "string" } },
    networkAllow: {
      type: "array",
      items: { type: "string" },
      description: "hostnames/domains the sandbox may reach, e.g. pypi.org, api.example.com, host.docker.internal:4000",
    },
    environment: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: { type: "string" },
          value: { type: "string" },
        },
        required: ["key", "value"],
      },
    },
    install: {
      type: "array",
      description: "one-time install commands run via sh -c at kit creation",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          command: { type: "string" },
          user: { type: "string", description: '"1000" for the agent user, "0" for root' },
          description: { type: "string" },
        },
        required: ["command"],
      },
    },
    files: {
      type: "array",
      description: "config files written into the sandbox at startup",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", description: "absolute path, e.g. /home/agent/.config/tool.json" },
          content: { type: "string" },
          mode: { type: "string" },
          onlyIfMissing: { type: "boolean" },
          description: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
    credentials: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          service: { type: "string" },
          description: { type: "string" },
          required: { type: "boolean" },
          envVarName: { type: "string", description: "environment variable the key is exposed as" },
          injectDomain: { type: "string", description: "domain the key is injected for (must be in networkAllow)" },
          scheme: { type: "string", enum: ["bearer", "basic", ""] },
        },
        required: ["service"],
      },
    },
    agentInstructions: {
      type: "string",
      description: "Markdown telling the agent what this kit provides and how to use it. Written for the model, not humans.",
    },
    sandboxImage: {
      type: "string",
      description: "only for kind=sandbox: base image reference",
    },
    notes: {
      type: "string",
      description: "short note to the user about assumptions made or what to review",
    },
  },
  required: ["kind", "name", "description", "agentInstructions"],
} as const;

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
  return `You are an expert author of Docker Sandboxes (sbx) kits, schema version 2.

An sbx kit is a declarative artifact that extends a sandbox coding agent with a product's capabilities. A "mixin" adds capabilities (packages, env vars, network access, credentials, agent instructions) onto any base agent; a "sandbox" ships its own base image.

Schema v2 shape you are producing (via the structured output tool):
- kind: "mixin" (default — prefer this) or "sandbox".
- name: lowercase-with-hyphens, derived from the product.
- description: one or two sentences on what the kit adds and how it's wired.
- networkAllow: ONLY the exact hosts the product needs — its API domain(s), package registries needed to install it (pypi.org + files.pythonhosted.org for Python; registry.npmjs.org for Node), and host.docker.internal:PORT if it talks to a host service. Never allow-all.
- environment: variables the SDK/tool reads (e.g. OPENAI_BASE_URL, <PRODUCT>_API_KEY). Do NOT hardcode real secrets — use placeholder values or leave secrets to credentials.
- install: the minimal commands to install the product's library. Prefer pinning a version. Use user "1000" (the agent user) for pip/npm user installs; add --break-system-packages for pip. Keep it to what's necessary.
- files: config files the product needs, written to absolute paths under /home/agent. Use onlyIfMissing: true for editable config.
- credentials: if the product needs a real API key, declare it here with envVarName and injectDomain (which MUST also be in networkAllow), scheme "bearer" typically. This keeps real keys out of the spec.
- agentInstructions: concise Markdown, addressed to the coding agent, explaining what is installed, how it's wired, and how to use it. This is the single most valuable field — make it accurate and practical.

Design principles, mirroring the mem0 and litellm reference kits:
- Prefer local Docker Model Runner (host.docker.internal:12434, OPENAI_BASE_URL=http://host.docker.internal:12434/engines/v1, OPENAI_API_KEY=dmr) or a host gateway over embedding cloud credentials, when the product is an LLM tool.
- Least privilege: allow only the domains actually required.
- Never invent capabilities the product doesn't have. Base everything on the provided repository context.

Produce a correct, minimal, working kit. Note any assumptions in "notes".`;
}

function userPrompt(ctx: RepoContext): string {
  const manifests = ctx.manifests
    .map((m) => `### ${m.path}\n\`\`\`\n${m.content}\n\`\`\``)
    .join("\n\n");
  return `Generate a schema-v2 kit for this product.

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

/** Merge the model's structured output into a full KitSpec. */
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
          inject: c.injectDomain
            ? [{ domain: c.injectDomain, scheme: c.scheme || "bearer" }]
            : [],
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
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set on the server. Add it to .env and restart." },
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

  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: KIT_JSON_SCHEMA },
      },
      system: systemPrompt(),
      messages: [{ role: "user", content: userPrompt(ctx) }],
    } as Anthropic.MessageCreateParamsNonStreaming);

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "The model declined to generate a kit for this repository." },
        { status: 422 },
      );
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No content returned by the model." }, { status: 502 });
    }

    const generated = JSON.parse(textBlock.text) as GeneratedKit;
    const kit = toKitSpec(generated, ctx);
    return NextResponse.json({ kit, notes: generated.notes ?? null, context: { url: ctx.url, name: `${ctx.owner}/${ctx.repo}` } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
