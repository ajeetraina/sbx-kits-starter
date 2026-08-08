"use client";

import React from "react";
import type { KitSpec } from "@/lib/schema-v2";

export function RepoImport({ onGenerated }: { onGenerated: (kit: KitSpec, notes: string | null) => void }) {
  const [repo, setRepo] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function generate() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status}).`);
        return;
      }
      onGenerated(data.kit as KitSpec, data.notes ?? null);
    } catch {
      setError("Network error. Is the dev server running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sbx-accent">✦</span>
        <h2 className="text-sm font-semibold">Turn your repository into a kit</h2>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-sbx-muted">
        Paste a GitHub repo (or <code className="text-sbx-text">owner/repo</code>). Claude reads its
        README and manifests and drafts a schema-v2 kit — then you refine it below.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="input flex-1"
          placeholder="https://github.com/ajeetraina/sbx-kits-mem0"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && repo.trim() && !loading) generate();
          }}
        />
        <button
          className="btn-primary shrink-0"
          disabled={loading || !repo.trim()}
          onClick={generate}
        >
          {loading ? (
            <>
              <Spinner /> Generating…
            </>
          ) : (
            <>✦ Generate kit</>
          )}
        </button>
      </div>
      {error && (
        <div className="mt-3 rounded-lg border border-sbx-bad/40 bg-sbx-bad/10 px-3 py-2 text-xs text-sbx-bad">
          {error}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-sbx-muted">
        <span>Try:</span>
        {["ajeetraina/sbx-kits-mem0", "ajeetraina/sbx-kits-litellm", "mem0ai/mem0"].map((ex) => (
          <button
            key={ex}
            className="chip hover:border-sbx-accent/60"
            onClick={() => setRepo(ex)}
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
  );
}
