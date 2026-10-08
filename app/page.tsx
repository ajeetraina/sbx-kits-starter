"use client";

import React from "react";
import { KitBuilder } from "@/components/KitBuilder";
import { SpecPreview } from "@/components/SpecPreview";
import { RepoImport } from "@/components/RepoImport";
import { emptyKit, type KitSpec } from "@/lib/schema-v2";
import { templates } from "@/lib/templates";

export default function Home() {
  const [kit, setKit] = React.useState<KitSpec>(() => emptyKit("mixin"));
  const [notes, setNotes] = React.useState<string | null>(null);

  function applyTemplate(id: string) {
    const t = templates.find((t) => t.id === id);
    if (t) {
      setKit(t.build());
      setNotes(null);
    }
  }

  function onGenerated(k: KitSpec, n: string | null) {
    setKit(k);
    setNotes(n);
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
      <Header onTemplate={applyTemplate} />

      <div className="mt-6">
        <RepoImport onGenerated={onGenerated} />
      </div>

      {notes && (
        <div className="mt-4 rounded-xl border border-sbx-accent/40 bg-sbx-accent/10 px-4 py-3 text-sm">
          <span className="font-semibold text-sbx-accent2">✦ Notes from generation:</span>{" "}
          <span className="text-sbx-text/90">{notes}</span>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <KitBuilder kit={kit} setKit={setKit} />
        </div>
        <div className="min-w-0 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
          <SpecPreview kit={kit} />
        </div>
      </div>

      <Footer />
    </div>
  );
}

function Header({ onTemplate }: { onTemplate: (id: string) => void }) {
  return (
    <header className="flex flex-col gap-4 border-b border-sbx-border pb-5 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-sbx-accent/15 text-lg text-sbx-accent2">
            ⬢
          </span>
          <h1 className="text-xl font-semibold tracking-tight">sbx Kit Builder</h1>
          <span className="chip text-sbx-muted">schema v2</span>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-sbx-muted">
          Build a Docker Sandbox kit for your product — the way{" "}
          <a className="text-sbx-accent2 hover:underline" href="https://github.com/ajeetraina/sbx-kits-mem0" target="_blank" rel="noreferrer">mem0</a>,{" "}
          <a className="text-sbx-accent2 hover:underline" href="https://github.com/ajeetraina/sbx-kits-litellm" target="_blank" rel="noreferrer">litellm</a>, and{" "}
          <a className="text-sbx-accent2 hover:underline" href="https://github.com/docker/sbx-kits-contrib" target="_blank" rel="noreferrer">others</a>{" "}
          did. Start from your repo, a template, or scratch — then download <code className="text-sbx-text">spec.yaml</code> or the full kit.
        </p>
      </div>

      <div className="shrink-0">
        <div className="label">Start from a template</div>
        <div className="flex flex-wrap gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              className="chip hover:border-sbx-accent/60"
              title={t.blurb}
              onClick={() => onTemplate(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-10 border-t border-sbx-border pt-5 text-xs text-sbx-muted">
      <p>
        Kits follow the schema-v2 field reference in{" "}
        <a className="text-sbx-accent2 hover:underline" href="https://github.com/docker/sbx-kits-contrib" target="_blank" rel="noreferrer">
          docker/sbx-kits-contrib
        </a>
        . AI generation uses an OpenAI-compatible model and needs <code className="text-sbx-text">OPENAI_API_KEY</code>; repo import
        works without a key but a <code className="text-sbx-text">GITHUB_TOKEN</code> raises the rate limit.
      </p>
    </footer>
  );
}
