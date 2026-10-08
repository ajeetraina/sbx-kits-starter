/**
 * Quick-start kit templates, modeled on the reference kits:
 *   - mem0  (local Docker Model Runner mixin) — github.com/ajeetraina/sbx-kits-mem0
 *   - litellm (host router mixin)             — github.com/ajeetraina/sbx-kits-litellm
 * Plus a blank mixin and a blank sandbox.
 */

import type { KitSpec } from "./schema-v2";
import { emptyKit } from "./schema-v2";

export interface Template {
  id: string;
  label: string;
  blurb: string;
  build: () => KitSpec;
}

export const templates: Template[] = [
  {
    id: "blank-mixin",
    label: "Blank mixin",
    blurb: "Start from scratch. A mixin adds capabilities to any base agent.",
    build: () => emptyKit("mixin"),
  },
  {
    id: "local-dmr",
    label: "Local model (DMR)",
    blurb:
      "Wire a Python library to a local Docker Model Runner — no cloud keys. Modeled on the mem0 kit.",
    build: () => ({
      ...emptyKit("mixin"),
      name: "my-tool",
      displayName: "My Tool (Docker Model Runner)",
      description:
        "Adds <library> to an agent, pre-wired to a local Docker Model Runner for the LLM and embedder — no cloud credentials, no external services.",
      licenses: ["Apache-2.0"],
      network: {
        allow: [
          "pypi.org",
          "files.pythonhosted.org",
          "github.com",
          "raw.githubusercontent.com",
          "localhost:12434",
        ],
        deny: [],
      },
      environment: [
        { key: "OPENAI_BASE_URL", value: "http://host.docker.internal:12434/engines/v1" },
        { key: "OPENAI_API_KEY", value: "dmr" },
        { key: "NO_PROXY", value: "localhost,127.0.0.1,host.docker.internal" },
      ],
      setup: {
        install: [
          {
            command: "pip install --break-system-packages '<library>'",
            user: "1000",
            description: "Install the library into the agent user's site-packages",
          },
        ],
        startup: [],
        files: [],
      },
      agentInstructions:
        "## <library>\n\nThe `<library>` package is installed and pre-wired to a local Docker Model Runner (OpenAI-compatible endpoint at `$OPENAI_BASE_URL`), so it works with no cloud keys.",
    }),
  },
  {
    id: "host-router",
    label: "Host gateway (LiteLLM)",
    blurb:
      "Point the agent at an OpenAI-compatible gateway on the host. Modeled on the litellm kit.",
    build: () => ({
      ...emptyKit("mixin"),
      name: "litellm",
      displayName: "LiteLLM Gateway (host router)",
      description:
        "Points the agent at a LiteLLM proxy on the host at host.docker.internal:4000 — one OpenAI-compatible endpoint with routing, fallbacks, and spend tracking. The sandbox holds only a virtual key; real provider credentials never enter the sandbox.",
      licenses: ["Apache-2.0"],
      network: { allow: ["host.docker.internal:4000"], deny: [] },
      environment: [
        { key: "OPENAI_BASE_URL", value: "http://host.docker.internal:4000/v1" },
        { key: "OPENAI_API_KEY", value: "sk-sandbox-litellm" },
        { key: "NO_PROXY", value: "localhost,127.0.0.1,host.docker.internal" },
      ],
      setup: { install: [], startup: [], files: [] },
      agentInstructions:
        "## Host gateway\n\nAn OpenAI-compatible gateway runs on the host and is reachable at `$OPENAI_BASE_URL`. Authenticate with `$OPENAI_API_KEY` (a virtual key). Call `GET /v1/models` to see available models. Do NOT start or manage the gateway from inside the sandbox — it runs on the host.",
    }),
  },
  {
    id: "cloud-api",
    label: "Cloud API + credentials",
    blurb:
      "A SaaS product that needs an API key injected only for its own domain.",
    build: () => ({
      ...emptyKit("mixin"),
      name: "my-service",
      displayName: "My Service",
      description:
        "Adds the <service> SDK to an agent and injects its API key only for the service's own domain.",
      licenses: ["Apache-2.0"],
      network: { allow: ["api.example.com"], deny: [] },
      environment: [],
      setup: {
        install: [
          {
            command: "pip install --break-system-packages '<sdk>'",
            user: "1000",
            description: "Install the service SDK",
          },
        ],
        startup: [],
        files: [],
      },
      credentials: [
        {
          service: "my-service",
          description: "API key for <service>",
          required: true,
          apiKey: {
            name: "MY_SERVICE_API_KEY",
            inject: [
              { domain: "api.example.com", scheme: "bearer", header: "", format: "", username: "" },
            ],
          },
        },
      ],
      agentInstructions:
        "## <service>\n\nThe `<sdk>` package is installed. The API key is injected automatically for requests to `api.example.com` — you do not need to handle it directly.",
    }),
  },
  {
    id: "blank-sandbox",
    label: "Blank sandbox",
    blurb: "A full sandbox kit that ships its own base image and launch config.",
    build: () => ({
      ...emptyKit("sandbox"),
      name: "my-sandbox",
      displayName: "My Sandbox",
      description: "A custom sandbox base with <toolchain> preinstalled.",
      licenses: ["Apache-2.0"],
      sandbox: {
        image: "docker.io/library/debian:stable-slim",
        resources: { cpu: 2, memory: "4g" },
      },
    }),
  },
];
