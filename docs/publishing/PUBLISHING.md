# Publishing an sbx kit

There are **two independent ways** to publish a kit. They are not a two-step
process — pick the one that matches your goal.

| | 1. Your own namespace (self-service) | 2. Official catalog (`docker/sbx-kits-contrib`) |
|---|---|---|
| **Goal** | Make your kit usable by anyone, now | Get your kit listed in the official Docker catalog |
| **Where it lands** | `docker.io/<your-user>/<kit>` | `docker.io/sbx/<kit>` (Docker-owned namespace) |
| **How** | `sbx kit push` from your machine | Open a PR to `docker/sbx-kits-contrib` |
| **Who publishes** | You | Docker's CI, on merge |
| **Review** | None | PR review + merge |

You do **not** need to do both. Publishing to your own namespace does not require
the contrib repo, and contributing to the catalog does not require you to push to
Docker Hub yourself.

---

## Route 1 — Publish to your own Docker Hub namespace (self-service)

This is what most partners want: it makes the kit immediately consumable by
anyone, with no gatekeeping.

**Prerequisites**
- The [sbx CLI](https://github.com/docker/sbx-kits-contrib) on your PATH.
- A Docker Hub account and `docker login` (sbx reuses your docker credentials).

**Publish**

```sh
docker login                                    # your own Docker Hub account
sbx kit push . docker.io/<your-user>/<kit>:1.0
```

Or use the bundled helper (see [`push-kit.sh`](./push-kit.sh)), run from the kit
root:

```sh
./scripts/push-kit.sh <your-user>       # -> docker.io/<your-user>/<kit>:latest
./scripts/push-kit.sh <your-user> 1.0   # -> docker.io/<your-user>/<kit>:1.0
./scripts/push-kit.sh ghcr.io/org/<kit> 1.0   # a full ref (with '/') targets any registry
```

`sbx kit push` uploads the kit as an OCI artifact (via ORAS), rewrites the spec
to its distribution form (image pinned to digest, `sandbox.build` stripped —
your source `spec.yaml` is never modified), and builds multi-arch
(`linux/amd64,linux/arm64`) by default.

**Consumers reference by digest, not by tag.** A tag is accepted when *pushing*
(for human ergonomics), but the `:latest` / `:1.0` form is **rejected** on
consumption — mutable references are a security no-go. Resolve the digest and
hand that out:

```sh
sbx kit inspect docker.io/<your-user>/<kit>:1.0    # prints the sha256 digest
sbx run --kit oci://docker.io/<your-user>/<kit>@sha256:<digest> -- claude
```

---

## Route 2 — Contribute to the official catalog (`docker/sbx-kits-contrib`)

Do this only if you want the kit **listed in the official Docker catalog** under
the Docker-owned `docker.io/sbx` namespace.

1. Open a **PR** to
   [`docker/sbx-kits-contrib`](https://github.com/docker/sbx-kits-contrib) adding
   your kit directory: `spec.yaml`, `files/`, and — for a `kind: sandbox` kit
   that ships its own image — a `Dockerfile` and `README.image.md`.
2. CI **discovers** the kit by its `spec.yaml` alone. There's no matrix to
   register and no per-kit workflow to add.
3. On **merge to `main`**, Docker's CI builds and pushes the image to the
   `docker.io/sbx` namespace.

**You cannot push to `docker.io/sbx` yourself.** Those push credentials are held
by Docker and withheld from PRs — PR builds compile the image but never publish
it. The first publish happens when your PR merges. So there is no "push to the
sbx namespace" step on your side; the CI owns it.

Before opening the PR, validate and smoke-test locally:

```sh
sbx kit validate ./<kit>/
sbx kit inspect  ./<kit>/ --output json | jq
sbx run claude --kit ./<kit>/ --name probe . && \
  sbx exec probe -- <expected-binary> --version && sbx rm probe
```

(And run the TCK suite — `scripts/test-kit.sh <kit>` in the contrib repo.)

---

## FAQ

**Do I push to contrib *and* my Docker Hub namespace?**
No. They're independent. Own namespace = self-service, immediate. Contrib = a PR
that lands the kit in the official catalog, with Docker's CI doing the
`sbx/`-namespace publish.

**I don't have the `push-kit.sh` script.**
It's a thin convenience wrapper generated inside kits exported from the sbx Kit
Builder portal — a hand-authored kit won't have it. You don't need it: the real
work is one line, `sbx kit push . <ref>:<version>`. A standalone copy lives at
[`push-kit.sh`](./push-kit.sh) — drop it into your kit's `scripts/` folder.

**Which registry can I use?**
Any OCI registry accepts kit artifacts (Docker Hub, GHCR, ECR, ...). Pass a full
ref (anything containing `/`) to `push-kit.sh` to target one other than Docker
Hub.
