#!/usr/bin/env bash
# Publish this v3 kit to a container registry.
#
# In v3 there is NO `sbx kit push`: publishing IS the build. The frontend has
# already written the kit's annotations, so the thing in the registry is the
# kit. We just add --push to the same `docker buildx build` that builds it.
#
# Run from the kit root (the directory containing my-kit.yaml):
#
#   ./scripts/push-kit.sh <docker-hub-user>          # -> docker.io/<user>/<kit>:<version>
#   ./scripts/push-kit.sh <docker-hub-user> 1.0.0    # explicit version
#   ./scripts/push-kit.sh ghcr.io/org/<kit> 1.0.0    # full OCI ref (anything with a '/')
#
# The kit name is the descriptor filename stem (my-kit.yaml -> my-kit); override
# with NAME=<kit> ./scripts/push-kit.sh ...
#
# Requires:
#   - docker buildx (ships with modern Docker; the frontend is pulled from the
#     `# syntax=docker/sandbox-kit:3` line, nothing to install)
#   - a prior 'docker login'  (Docker Hub: 'docker login -u <user>')
set -euo pipefail

# Resolve the kit root (parent of this script's dir) so it works from anywhere.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Kit name: explicit NAME env > descriptor filename stem > directory basename.
if [[ -n "${NAME:-}" ]]; then
  KIT_NAME="$NAME"
elif DESC="$(ls "${KIT_DIR}"/*.yaml 2>/dev/null | head -1)" && [[ -n "$DESC" ]]; then
  KIT_NAME="$(basename "$DESC" .yaml)"
else
  KIT_NAME="$(basename "${KIT_DIR}")"
fi

DESCRIPTOR="${KIT_DIR}/${KIT_NAME}.yaml"
[[ -f "$DESCRIPTOR" ]] || { echo "descriptor not found: ${DESCRIPTOR}" >&2; exit 1; }

TARGET="${1:?usage: push-kit.sh <docker-hub-user | full-oci-ref> [version]}"
# <version> should match the descriptor's expanded version:. Defaults to the
# `version` arg default in the descriptor if you don't pass one.
VERSION="${2:-$(grep -E '^[[:space:]]*default:' "$DESCRIPTOR" | head -1 | sed -E 's/.*default:[[:space:]]*//; s/["'\'']//g')}"
VERSION="${VERSION:-1.0.0}"

# A TARGET containing '/' is a full registry path, used verbatim; otherwise it's
# a Docker Hub username and we build docker.io/<user>/<name>.
if [[ "$TARGET" == */* ]]; then
  REF="$TARGET"
else
  REF="docker.io/${TARGET}/${KIT_NAME}"
fi

echo "Publishing ${KIT_NAME} -> ${REF}:${VERSION} (and :latest)"

# One invocation builds BOTH platforms and pushes the index consumers resolve
# through. Two single-platform pushes to the same tag would replace each other.
docker buildx build "${KIT_DIR}" -f "${DESCRIPTOR}" \
  --platform linux/amd64,linux/arm64 \
  --push \
  -t "${REF}:${VERSION}" \
  -t "${REF}:latest" \
  --metadata-file "/tmp/${KIT_NAME}-push.json"

echo
echo "Pushed. Consumers reference the kit by digest, not by tag:"
echo "  sbx kit inspect ${REF}:${VERSION}    # resolve the sha256 digest"
echo "  sbx run <workload> --kit oci://${REF}@sha256:<digest> ."
