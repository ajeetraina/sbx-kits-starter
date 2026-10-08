# Publishing an sbx kit (v3)

**Publishing is the build.** A v3 kit is an OCI artifact and the
`# syntax=docker/sandbox-kit:3` frontend has already written its annotations,
staged sources, and config — so the thing in the registry *is* the kit. There is
no pack step, no sidecar artifact, and no `sbx kit push` subcommand. You add
`--push` to the same `docker buildx build` that produced the kit you verified.

There are **two independent ways** to publish. They are not a two-step process.
Pick the one that matches your goal.

| | 1. Your own namespace (self-service) | 2. Official catalog (`docker/sbx-kits-contrib`) |
|---|---|---|
| **Goal** | Make your kit usable by anyone, now | Get your kit listed in the official Docker catalog |
| **Where it lands** | `docker.io/<your-user>/<kit>` | Docker-owned namespace |
| **How** | `docker buildx build --push` from your machine | Open a PR to `docker/sbx-kits-contrib` |
| **Who publishes** | You | Docker's CI, on merge |
| **Review** | None | PR review + merge |

You do **not** need to do both.

---

## Route 1: Publish to your own namespace (self-service)

**Prerequisites**
- `docker buildx` (ships with modern Docker; the frontend is pulled from the
  `# syntax=` line, nothing else to install).
- A registry account and `docker login`.

**Publish** (from the kit root, the directory containing `my-kit.yaml`)

```sh
docker login
./scripts/push-kit.sh <your-user> 1.0.0            # -> docker.io/<your-user>/my-kit:1.0.0
./scripts/push-kit.sh ghcr.io/org/my-kit 1.0.0     # a full ref (with '/') targets any registry
```

`scripts/push-kit.sh` is a thin wrapper around:

```sh
docker buildx build . -f my-kit.yaml --platform linux/amd64,linux/arm64 --push \
  -t <registry>/my-kit:1.0.0 -t <registry>/my-kit:latest \
  --metadata-file /tmp/my-kit-push.json
```

**Push both platforms in one invocation.** That single build writes the index
consumers resolve through; two single-platform builds pushed to the same tag
replace each other, leaving a tag that works on only one architecture.

**`<version>` is the descriptor's expanded `version:`.** Tag the version and
`latest` together so the immutable tag says exactly what the image contains.

**Consumers reference by digest, not by tag.** A tag is accepted when *pushing*
for ergonomics, but a mutable `:latest` / `:1.0.0` reference is rejected on
consumption. Resolve the digest and hand that out:

```sh
sbx kit inspect docker.io/<your-user>/my-kit:1.0.0    # prints the sha256 digest
sbx run <workload> --kit oci://docker.io/<your-user>/my-kit@sha256:<digest> .
```

### Signing (optional, orthogonal)

A signature is a separate object in the repository — it changes neither the
kit's digest nor its annotations. Sign the **digest** the push reported, never
the mutable tag:

```sh
digest=$(jq -r '."containerimage.digest"' /tmp/my-kit-push.json)
cosign sign --yes --recursive docker.io/<your-user>/my-kit@"$digest"
```

For a multi-platform build that digest is the **index's**; `--recursive` also
signs each per-platform manifest, so a consumer verifying a platform digest
directly still finds a signature.

---

## Route 2: Contribute to the official catalog (`docker/sbx-kits-contrib`)

Do this only if you want the kit **listed in the official Docker catalog**.

1. Open a **PR** to
   [`docker/sbx-kits-contrib`](https://github.com/docker/sbx-kits-contrib)
   adding your kit's companion files (`my-kit.yaml`, `my-kit.dockerfile`,
   `my-kit-context.md`, `files/`).
2. CI discovers and builds the kit; conformance is checked with `kit-tck`.
3. On **merge to `main`**, Docker's CI builds and pushes to the Docker-owned
   namespace.

**You cannot push to the Docker namespace yourself.** Those credentials are held
by Docker; PR builds compile the kit but never publish it. The first publish
happens when your PR merges.

Before opening the PR, validate and conformance-test locally:

```sh
docker buildx build . -f my-kit.yaml --output type=cacheonly        # descriptor
docker buildx build . -f my-kit.yaml -t my-kit:1.0.0 \
  --output type=oci,dest=/tmp/my-kit-layout,tar=false
kit-tck validate --layout /tmp/my-kit-layout 1.0.0                  # conformance
sbx run <workload> --kit ./ --name probe . && \
  sbx exec probe <your-cli> --version && sbx rm probe               # real composition
```

---

## FAQ

**Do I push to contrib *and* my own namespace?**
No. They're independent. Own namespace = self-service, immediate. Contrib = a PR
that lands the kit in the official catalog, with Docker's CI doing the publish.

**Which registry can I use?**
Any OCI registry (Docker Hub, GHCR, ECR, ...). Pass a full ref (anything
containing `/`) to `push-kit.sh` to target one other than Docker Hub.

**Is there a `kit-tck`?**
Yes — `go install github.com/docker/sandbox-kit-spec/v3/cmd/kit-tck@latest`. It
judges the exported OCI layout for conformance (overlay ownership, link
resolution, and more) without needing a registry.
