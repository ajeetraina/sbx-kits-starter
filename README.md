# sbx Kit Builder

A super-simple portal for building **Docker Sandbox (sbx) kits** for your product —
following **schema v2** — the same way [mem0](https://github.com/ajeetraina/sbx-kits-mem0),
[litellm](https://github.com/ajeetraina/sbx-kits-litellm), and the kits in
[docker/sbx-kits-contrib](https://github.com/docker/sbx-kits-contrib) are built.

Paste a GitHub repository and Claude drafts a complete `spec.yaml` for you; refine it
in a guided form with a live preview and validation; then download `spec.yaml` or a
ready-to-publish kit `.zip`.

## What's an sbx kit?

A declarative artifact that extends a sandbox coding agent with your product's
capabilities. This portal produces schema-v2 kits:

- **`kind: mixin`** — adds packages, env vars, network access, credentials, and
  agent instructions onto *any* base agent (most products want this).
- **`kind: sandbox`** — ships its own base image and launch config.

## Features

- **Repo → kit (AI):** paste `owner/repo` or a `github.com` URL. The server reads the
  README + package manifests and Claude ([`claude-opus-4-8`](https://www.anthropic.com))
  generates a schema-v2 kit — name, description, least-privilege network allow-list,
  environment, install commands, credentials, and agent instructions.
- **Guided editor** for every v2 block: basics, sandbox image/resources,
  `permissions.network`, `environment.variables`, `setup` (install / startup / files),
  `credentials`, ports, volumes, and `agentInstructions`.
- **Live `spec.yaml` preview** with schema-v2 **validation** (name pattern, required
  fields, octal file modes, port ranges, credential inject domains that must appear in
  the network allow-list, and more).
- **One-click export:** copy YAML, download `spec.yaml`, or download the full kit
  `.zip` (spec + README + `files/` tree + publish workflow + push script).
- **Templates** modeled on the reference kits: local Docker Model Runner mixin
  (mem0-style), host gateway mixin (litellm-style), cloud-API-with-credentials, and
  blank mixin / sandbox.

## Getting started

```sh
npm install

# AI generation needs an Anthropic key; repo import optionally uses a GitHub token
cp .env.example .env      # then edit .env
#   ANTHROPIC_API_KEY=sk-ant-...
#   GITHUB_TOKEN=ghp_...   (optional)

npm run dev               # http://localhost:3000
```

Without `ANTHROPIC_API_KEY` the AI "Generate kit" button returns a clear error, but the
templates and the whole editor/preview/export flow work fully offline.

## How the schema maps (v1 → v2)

The mem0 kit is schema **v1**; litellm is **v2**. This portal always emits v2, which
renames a few blocks:

| v1 | v2 (what this portal emits) |
| --- | --- |
| `network.allowedDomains` | `permissions.network.allow` |
| `commands.install` | `setup.install` |
| `initFiles` | `setup.files` |
| `memory` | `agentInstructions.content` |

## Project layout

```
app/
  page.tsx              # the builder UI (client)
  api/import/route.ts   # GitHub repo → context
  api/generate/route.ts # Claude → schema-v2 kit (structured output)
lib/
  schema-v2.ts          # types, validation, YAML serializer (source of truth)
  templates.ts          # quick-start templates
  github.ts             # repo reader
  kit-export.ts         # build the distributable kit file set
components/              # RepoImport, KitBuilder, SpecPreview, ui
```

## Notes

- The generator is grounded in the repository you provide — it won't invent
  capabilities the product doesn't have, and it favors least-privilege network rules and
  local model runners over embedding cloud credentials (mirroring the reference kits).
- Field reference and the authoritative spec live in
  [docker/sbx-kits-contrib](https://github.com/docker/sbx-kits-contrib) (`spec/SPEC-v2.md`
  and the `kit-author` skill).
