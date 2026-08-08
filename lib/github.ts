/**
 * Minimal GitHub repository reader used to gather context for AI kit generation.
 * Runs server-side only (uses GITHUB_TOKEN if present). Fetches the repo's
 * metadata, README, and a handful of package manifests that reveal the
 * ecosystem and dependencies — enough for Claude to draft a schema-v2 kit.
 */

const GH_API = "https://api.github.com";
const GH_RAW = "https://raw.githubusercontent.com";

export interface RepoContext {
  owner: string;
  repo: string;
  url: string;
  description: string | null;
  license: string | null;
  language: string | null;
  topics: string[];
  defaultBranch: string;
  readme: string;
  manifests: { path: string; content: string }[];
}

const MANIFEST_CANDIDATES = [
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "requirements.txt",
  "package.json",
  "Cargo.toml",
  "go.mod",
  "Gemfile",
  "composer.json",
  "docker-compose.yml",
  "compose.yaml",
  "Dockerfile",
];

export function parseRepoUrl(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  // owner/repo shorthand
  const short = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (short) return { owner: short[1], repo: short[2] };
  try {
    const u = new URL(trimmed);
    if (u.hostname !== "github.com" && u.hostname !== "www.github.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

function ghHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "sbx-kits-starter",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function tryRaw(owner: string, repo: string, branch: string, path: string) {
  try {
    const res = await fetch(`${GH_RAW}/${owner}/${repo}/${branch}/${path}`, {
      headers: { "User-Agent": "sbx-kits-starter" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    // Cap size so a giant lockfile doesn't blow up the prompt.
    return text.slice(0, 8000);
  } catch {
    return null;
  }
}

export async function fetchRepoContext(input: string): Promise<RepoContext> {
  const parsed = parseRepoUrl(input);
  if (!parsed) throw new Error("Could not parse that as a GitHub repository (owner/repo or a github.com URL).");
  const { owner, repo } = parsed;

  const metaRes = await fetch(`${GH_API}/repos/${owner}/${repo}`, {
    headers: ghHeaders(),
  });
  if (metaRes.status === 404)
    throw new Error(`Repository ${owner}/${repo} not found (or private without a GITHUB_TOKEN).`);
  if (metaRes.status === 403)
    throw new Error("GitHub API rate limit hit. Set GITHUB_TOKEN in your environment and retry.");
  if (!metaRes.ok) throw new Error(`GitHub API error ${metaRes.status}.`);

  const meta = await metaRes.json();
  const defaultBranch: string = meta.default_branch || "main";

  // README (rendered via the raw endpoint).
  let readme = "";
  const readmeRes = await fetch(`${GH_API}/repos/${owner}/${repo}/readme`, {
    headers: ghHeaders(),
  });
  if (readmeRes.ok) {
    const j = await readmeRes.json();
    if (j.content) readme = Buffer.from(j.content, "base64").toString("utf8").slice(0, 12000);
  }

  // Manifests — fetch in parallel, keep the ones that exist.
  const manifestResults = await Promise.all(
    MANIFEST_CANDIDATES.map(async (path) => {
      const content = await tryRaw(owner, repo, defaultBranch, path);
      return content ? { path, content } : null;
    }),
  );
  const manifests = manifestResults.filter(Boolean) as { path: string; content: string }[];

  return {
    owner,
    repo,
    url: meta.html_url,
    description: meta.description ?? null,
    license: meta.license?.spdx_id ?? null,
    language: meta.language ?? null,
    topics: meta.topics ?? [],
    defaultBranch,
    readme,
    manifests,
  };
}
