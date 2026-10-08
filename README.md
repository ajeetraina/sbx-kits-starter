# sbx kit starter

A minimal starter template for authoring a **Docker Sandbox (sbx) kit** (schema
**v3**, the current descriptor) for your product, the same shape as the examples
in [docker/sandbox-kit-spec](https://github.com/docker/sandbox-kit-spec/tree/main/examples).

Use it as a **template** ("Use this template" on GitHub, or just copy the files),
edit `my-kit.yaml` / `my-kit.dockerfile`, and publish.

## What's an sbx kit?

A kit is **one OCI image**. Its layers are the content; a manifest annotation
carries the **descriptor** describing what the kit offers, the typed
capabilities it requests from the host, and what it needs from other kits. There
are two kinds:

- **`kind: mixin`**: an overlay that adds a tool, env vars, network access,
  credentials, and agent instructions onto *any* workload. This starter is a
  mixin (most products want this).
- **`kind: workload`**: owns the whole root filesystem and the agent entrypoint.

## v3 at a glance (what changed from v2)

v2 was a single `spec.yaml` whose `setup.install` steps the engine ran. v3
splits into two files, found as a **companion pair by filename stem**:

| | file |
|---|---|
| **descriptor** — what the kit offers + typed capability requests | `my-kit.yaml` |
| **content recipe** — the install, as an ordinary OCI build | `my-kit.dockerfile` |

Other moves: `permissions.network` → a **phase-scoped** `network-policy@1`
capability (`install:` vs `runtime:`); `environment` → `ENV` in the dockerfile;
`agentInstructions` → an `agent-context@1` capability; `credentials` →
`credential@1`. Publishing is now just `docker buildx build --push` — there is
no `sbx kit push`.

## What's in here

```
my-kit.yaml                   # the descriptor (schema v3); edit this
my-kit.dockerfile             # the content recipe (the install); edit this
my-kit-context.md             # instructions merged into the agent's context
files/
  home/                       # optional content; COPY it in the dockerfile
scripts/
  push-kit.sh                 # publish via `docker buildx build --push`
.github/workflows/
  publish.yml                 # publish automatically on a v* tag
README.md                     # this file
PUBLISHING.md                 # the two ways to publish a kit
```

The kit **name is the filename stem** (`my-kit`). To rename the kit, rename all
three `my-kit.*` files together.

## Get started

1. **Edit `my-kit.yaml`**: set `displayName`, `description`, `sourceUrl`, the
   `version` arg, `provides`, and the `capabilities` block — the
   `network-policy` allow-lists (least privilege, per phase), and the optional
   `credential` block. Inline comments explain each field. The authoritative
   reference is
   [SPEC-v3.md](https://github.com/docker/sandbox-kit-spec/blob/main/docs/spec/SPEC-v3.md).

2. **Edit `my-kit.dockerfile`**: replace `<your-package>` / `<your-cli>` with
   what you install. It stages everything under `/out` and copies it into
   `scratch` so the overlay lands on any base.

3. **Add injected content** (optional) under `files/home/`, then uncomment the
   `COPY files/home/ ...` block in the dockerfile.

4. **Validate, build, and run locally** (requires
   [`docker buildx`](https://docs.docker.com/ai/sandboxes/install/), the
   [sbx CLI](https://github.com/docker/sbx-releases), and `kit-tck`):

   ```sh
   # validate the descriptor in ~1s (no content build)
   docker buildx build . -f my-kit.yaml --output type=cacheonly

   # build, exporting an OCI layout kit-tck can judge without a registry
   docker buildx build . -f my-kit.yaml -t my-kit:1.0.0 \
     --output type=oci,dest=/tmp/my-kit-layout,tar=false
   kit-tck validate --layout /tmp/my-kit-layout 1.0.0

   # compose the mixin onto a workload and run the tool
   sbx run <workload> --kit ./ --name probe .
   sbx exec probe <your-cli> --version
   ```

5. **Publish it:**

   ```sh
   docker login                                   # Docker Hub (or your registry)
   ./scripts/push-kit.sh <your-docker-hub-user> 1.0.0   # -> docker.io/<user>/my-kit:1.0.0
   ```

   Or push a tag (`git tag v1.0.0 && git push --tags`) to publish via
   `.github/workflows/publish.yml`; set the `DOCKERHUB_USERNAME` /
   `DOCKERHUB_TOKEN` repo secrets first.

   Consumers reference the published kit **by digest**, not by tag:

   ```sh
   sbx kit inspect docker.io/<user>/my-kit:1.0.0     # prints the sha256 digest
   sbx run <workload> --kit oci://docker.io/<user>/my-kit@sha256:<digest> .
   ```

See [PUBLISHING.md](./PUBLISHING.md) for the full picture, including multi-arch
and signing.
