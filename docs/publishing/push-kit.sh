#!/usr/bin/env bash
# Publish an sbx kit to a container registry as an OCI artifact.
# Docker Hub is the default; any OCI registry (GHCR, ECR, ...) works too.
#
# Standalone version — drop this into any hand-authored kit's scripts/ folder.
# Run it from the kit root (the directory containing spec.yaml).
#
#   ./scripts/push-kit.sh <docker-hub-user>          # -> docker.io/<user>/<kit>:latest
#   ./scripts/push-kit.sh <docker-hub-user> 1.0      # -> docker.io/<user>/<kit>:1.0
#   ./scripts/push-kit.sh ghcr.io/org/<kit> 1.0      # full OCI ref (anything with a '/')
#
# The kit name is read from spec.yaml (falling back to the directory name).
# Override with NAME=<kit> ./scripts/push-kit.sh ...
#
# Requires:
#   - the sbx CLI on PATH        (see github.com/docker/sbx-kits-contrib to install)
#   - a prior 'docker login'     (Docker Hub: 'docker login -u <user>')
#     'sbx kit push' reuses your existing docker credentials.
set -euo pipefail

# Resolve the kit root (parent of this script's dir) so it works from anywhere.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Kit name: explicit NAME env > spec.yaml 'name:' field > directory basename.
if [[ -n "${NAME:-}" ]]; then
  KIT_NAME="$NAME"
elif [[ -f "${KIT_DIR}/spec.yaml" ]] && grep -qE '^name:[[:space:]]*' "${KIT_DIR}/spec.yaml"; then
  KIT_NAME="$(grep -E '^name:[[:space:]]*' "${KIT_DIR}/spec.yaml" | head -1 | sed -E 's/^name:[[:space:]]*//; s/["'\'']//g; s/[[:space:]]+$//')"
else
  KIT_NAME="$(basename "${KIT_DIR}")"
fi

TARGET="${1:?usage: push-kit.sh <docker-hub-user | full-oci-ref> [version]}"
VERSION="${2:-latest}"

# A TARGET containing '/' is treated as a full registry path and used verbatim;
# otherwise it's a Docker Hub username and we build docker.io/<user>/<name>.
if [[ "$TARGET" == */* ]]; then
  REF="$TARGET"
else
  REF="docker.io/${TARGET}/${KIT_NAME}"
fi

echo "Publishing ${KIT_NAME} -> ${REF}:${VERSION}"
sbx kit push "${KIT_DIR}" "${REF}:${VERSION}"

echo
echo "Pushed. Consumers must reference the kit by digest, not by tag:"
echo "  sbx kit inspect ${REF}:${VERSION}   # resolve the sha256 digest"
echo "  sbx run --kit oci://${REF}@sha256:<digest> -- claude"
