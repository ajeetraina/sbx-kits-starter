# sbx kit starter

A minimal starter template for authoring a **Docker Sandbox (sbx) kit** (schema v2)
for your product — the same shape as the reference kits
[mem0](https://github.com/ajeetraina/sbx-kits-mem0),
[litellm](https://github.com/ajeetraina/sbx-kits-litellm), and the kits in
[docker/sbx-kits-contrib](https://github.com/docker/sbx-kits-contrib).

Use it as a **template** ("Use this template" on GitHub, or just copy the files),
edit `spec.yaml`, and publish.

## What's an sbx kit?

A declarative artifact that extends a sandbox coding agent with your product's
capabilities:

- **`kind: mixin`** — adds packages, env vars, network access, credentials, and
  agent instructions onto *any* base agent. This starter is a mixin (most products
  want this).
- **`kind: sandbox`** — ships its own base image and launch config.

## What's in here

```
spec.yaml                     # the kit definition (schema v2) — edit this
files/
  home/                       # content copied into /home/agent/ in the sandbox
scripts/
  push-kit.sh                 # publish to Docker Hub (or any OCI registry)
.github/workflows/
  publish.yml                 # publish automatically on a v* tag
README.md                     # this file
PUBLISHING.md                 # the two ways to publish a kit
```

## Get started

1. **Edit `spec.yaml`** — set `name`, `description`, the `permissions.network`
   allow-list (least privilege), any `environment` variables, `setup.install`
   commands, and `agentInstructions`. Inline comments explain each block. The
   authoritative field reference is `spec/SPEC-v2.md` in
   [docker/sbx-kits-contrib](https://github.com/docker/sbx-kits-contrib).

2. **Add injected content** (optional) under `files/home/` — anything there lands
   in `/home/agent/` inside the sandbox.

3. **Try it locally** (requires the [sbx CLI](https://github.com/docker/sbx-kits-contrib)):

   ```sh
   sbx kit validate ./
   sbx run --kit ./ -- claude
   ```

4. **Publish it:**

   ```sh
   docker login                              # Docker Hub (or your registry)
   ./scripts/push-kit.sh <your-docker-hub-user>       # -> docker.io/<user>/<kit>:latest
   ./scripts/push-kit.sh <your-docker-hub-user> 1.0
   ```

   Or push a tag (`git tag v1.0 && git push --tags`) to publish via
   `.github/workflows/publish.yml` — set the `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN`
   repo secrets first.

   Consumers reference the published kit **by digest**, not by tag:

   ```sh
   sbx kit inspect docker.io/<user>/<kit>:1.0     # prints the sha256 digest
   sbx run --kit oci://docker.io/<user>/<kit>@sha256:<digest> -- claude
   ```

See [PUBLISHING.md](./PUBLISHING.md) for the full picture — including how the
official catalog (`docker/sbx-kits-contrib`) differs from publishing to your own
Docker Hub namespace.
