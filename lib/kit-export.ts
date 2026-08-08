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
# Mixin: compose onto a base agent
sbx run --kit oci://<your-registry>/${name}:1 -- claude

# or from a local checkout
sbx run --kit ./ -- claude
\`\`\`

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
- \`scripts/push-kit.sh\` — publish to an OCI registry
- \`.github/workflows/publish.yml\` — publish on tag

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

      - name: Log in to registry
        run: echo "\${{ secrets.REGISTRY_TOKEN }}" | docker login \${{ vars.REGISTRY }} -u \${{ vars.REGISTRY_USER }} --password-stdin

      - name: Push ${name}
        run: ./scripts/push-kit.sh "\${{ vars.REGISTRY }}/${name}" "\${GITHUB_REF_NAME#v}"
`;
}

function pushScript(name: string): string {
  return `#!/usr/bin/env bash
# Publish this kit to an OCI registry.
#
#   ./scripts/push-kit.sh <registry>/${name} <version>
#
# Requires the sbx CLI (see github.com/docker/sbx-kits-contrib for install + the
# exact 'sbx kit push' invocation for your version).
set -euo pipefail

REF="\${1:?usage: push-kit.sh <registry>/${name} <version>}"
VERSION="\${2:-latest}"

echo "Publishing ${name} -> \${REF}:\${VERSION}"
# sbx kit push --tag "\${REF}:\${VERSION}" .
echo "Uncomment the 'sbx kit push' line above once the sbx CLI is installed."
`;
}
