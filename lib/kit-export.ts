/**
 * Build the set of files that make up a distributable kit repository, matching
 * the layout of the reference kits (spec.yaml at the root, a README, a LICENSE
 * pointer, a files/ tree, and a CI workflow + push script). Returns a path→content
 * map that the client zips with JSZip.
 */

import type { KitSpec } from "./schema-v2";
import { kitToYaml } from "./schema-v2";

export interface KitFile {
  path: string;
  content: string;
}

export function buildKitFiles(kit: KitSpec): KitFile[] {
  const name = kit.name || "my-kit";
  const files: KitFile[] = [];

  files.push({ path: "spec.yaml", content: kitToYaml(kit) });
  files.push({ path: "README.md", content: readme(kit) });
  files.push({ path: ".gitignore", content: ".env\n*.log\n.DS_Store\n" });

  // files/ tree scaffolding (home + workspace). Real kits drop injected content here.
  files.push({
    path: "files/home/.keep",
    content:
      "# Files under files/home/ are copied into /home/agent/ in the sandbox.\n",
  });

  // Any setup.files with content also get materialized as a convenient reference.
  (kit.setup?.files ?? []).forEach((f) => {
    if (f.path?.trim() && f.content) {
      const rel = f.path.replace(/^\/home\/agent\//, "files/home/").replace(/^\//, "files/root/");
      files.push({ path: rel, content: f.content });
    }
  });

  files.push({ path: ".github/workflows/publish.yml", content: workflow(name) });
  files.push({ path: "scripts/push-kit.sh", content: pushScript(name) });

  return files;
}

function readme(kit: KitSpec): string {
  const name = kit.name || "my-kit";
  const title = kit.displayName || name;
  const kindLine =
    kit.kind === "mixin"
      ? "This is a **mixin** — it composes onto any base sandbox agent with `--kit`."
      : "This is a **sandbox** kit — it ships its own base image and launch configuration.";
  const netAllow = (kit.network?.allow ?? []).filter(Boolean);
  const env = (kit.environment ?? []).filter((v) => v.key);

  return `# ${title}

${kit.description || "_Add a description._"}

${kindLine}

## Use it

\`\`\`sh
# From a local checkout
sbx run --kit ./ -- claude

# Published to a registry — consumers reference by digest, not by tag
sbx run --kit oci://docker.io/<your-user>/${name}@sha256:<digest> -- claude
\`\`\`

## Publish it

\`\`\`sh
docker login                                   # Docker Hub (or your registry)
./scripts/push-kit.sh <your-docker-hub-user>   # -> docker.io/<user>/${name}:latest
./scripts/push-kit.sh <your-docker-hub-user> 1.0
\`\`\`

The script prints the \`sbx kit inspect\` command to resolve the published digest,
which is what consumers pin to. Tagging \`v*\` also publishes via
\`.github/workflows/publish.yml\` (set the \`DOCKERHUB_USERNAME\`/\`DOCKERHUB_TOKEN\`
secrets).

## What it does

${
  netAllow.length
    ? `**Network** — the sandbox is allowed to reach:\n${netAllow.map((d) => `- \`${d}\``).join("\n")}\n`
    : ""
}${
    env.length
      ? `\n**Environment** — sets:\n${env.map((v) => `- \`${v.key}\``).join("\n")}\n`
      : ""
  }
## Files

- \`spec.yaml\` — the kit definition (schema v2)
- \`files/\` — content injected into the sandbox (\`home/\` → \`/home/agent/\`)
- \`scripts/push-kit.sh\` — publish to Docker Hub (or any OCI registry)
- \`.github/workflows/publish.yml\` — publish on \`v*\` tag

## Author

Generated with the sbx-kits-starter portal. Edit \`spec.yaml\` and re-publish.
`;
}

function workflow(name: string): string {
  return `name: Publish kit

on:
  push:
    tags:
      - "v*"

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install sbx
        run: |
          echo "Install the sbx CLI here (see docker/sbx-kits-contrib for the current install command)."

      # Publishes to Docker Hub by default using the DOCKERHUB_USERNAME /
      # DOCKERHUB_TOKEN secrets. To use a different registry (e.g. ghcr.io),
      # set the repo variables REGISTRY and REGISTRY_USER.
      - name: Log in to registry
        run: |
          echo "\${{ secrets.DOCKERHUB_TOKEN }}" \\
            | docker login "\${{ vars.REGISTRY || 'docker.io' }}" \\
                -u "\${{ vars.REGISTRY_USER || secrets.DOCKERHUB_USERNAME }}" --password-stdin

      - name: Push ${name}
        run: |
          if [ -n "\${{ vars.REGISTRY }}" ]; then
            TARGET="\${{ vars.REGISTRY }}/\${{ vars.REGISTRY_USER }}/${name}"
          else
            TARGET="\${{ secrets.DOCKERHUB_USERNAME }}"
          fi
          ./scripts/push-kit.sh "\$TARGET" "\${GITHUB_REF_NAME#v}"
`;
}

function pushScript(name: string): string {
  return `#!/usr/bin/env bash
# Publish this kit to a container registry as an OCI artifact.
# Docker Hub is the default; any OCI registry (GHCR, ECR, ...) works too.
#
#   ./scripts/push-kit.sh <docker-hub-user>          # -> docker.io/<user>/${name}:latest
#   ./scripts/push-kit.sh <docker-hub-user> 1.0      # -> docker.io/<user>/${name}:1.0
#   ./scripts/push-kit.sh ghcr.io/org/${name} 1.0    # full OCI ref (anything with a '/')
#
# Requires:
#   - the sbx CLI on PATH (see github.com/docker/sbx-kits-contrib to install)
#   - a prior 'docker login' — for Docker Hub: 'docker login -u <user>'.
#     'sbx kit push' reuses your existing docker credentials.
set -euo pipefail

NAME="${name}"
TARGET="\${1:?usage: push-kit.sh <docker-hub-user | full-oci-ref> [version]}"
VERSION="\${2:-latest}"

# A TARGET containing '/' is treated as a full registry path and used verbatim;
# otherwise it's a Docker Hub username and we build docker.io/<user>/<name>.
if [[ "\$TARGET" == */* ]]; then
  REF="\$TARGET"
else
  REF="docker.io/\${TARGET}/\${NAME}"
fi

echo "Publishing \${NAME} -> \${REF}:\${VERSION}"
sbx kit push . "\${REF}:\${VERSION}"

echo
echo "Pushed. Consumers must reference the kit by digest, not by tag:"
echo "  sbx kit inspect \${REF}:\${VERSION}   # resolve the sha256 digest"
echo "  sbx run --kit oci://\${REF}@sha256:<digest> -- claude"
`;
}
