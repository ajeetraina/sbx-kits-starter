"use client";

import React from "react";
import JSZip from "jszip";
import type { KitSpec, Issue } from "@/lib/schema-v2";
import { kitToYaml, validateKit } from "@/lib/schema-v2";
import { buildKitFiles } from "@/lib/kit-export";

export function SpecPreview({ kit }: { kit: KitSpec }) {
  const yaml = React.useMemo(() => kitToYaml(kit), [kit]);
  const issues = React.useMemo(() => validateKit(kit), [kit]);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    await navigator.clipboard.writeText(yaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadSpec() {
    downloadBlob(new Blob([yaml], { type: "text/yaml" }), "spec.yaml");
  }

  async function downloadKit() {
    const zip = new JSZip();
    const root = kit.name || "my-kit";
    for (const f of buildKitFiles(kit)) zip.file(`${root}/${f.path}`, f.content);
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, `${root}.zip`);
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <ValidationBar errors={errors} warnings={warnings} />

      <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-sbx-border px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-sbx-good">▸</span>
            <span className="font-semibold">spec.yaml</span>
            <span className="text-xs text-sbx-muted">schema v2</span>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost btn-sm" onClick={copy}>
              {copied ? "✓ Copied" : "Copy"}
            </button>
            <button className="btn-ghost btn-sm" onClick={downloadSpec}>
              spec.yaml
            </button>
            <button className="btn-primary btn-sm" onClick={downloadKit}>
              ⬇ Kit .zip
            </button>
          </div>
        </div>
        <pre className="min-h-0 flex-1 overflow-auto px-4 py-3 text-xs leading-relaxed text-sbx-text/95">
          <code>{yaml}</code>
        </pre>
      </div>
    </div>
  );
}

function ValidationBar({ errors, warnings }: { errors: Issue[]; warnings: Issue[] }) {
  const [open, setOpen] = React.useState(true);
  const ok = errors.length === 0;
  return (
    <div className="panel overflow-hidden">
      <button
        className="flex w-full items-center justify-between px-4 py-2.5"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2 text-sm">
          {ok ? (
            <span className="text-sbx-good">● valid</span>
          ) : (
            <span className="text-sbx-bad">● {errors.length} error{errors.length > 1 ? "s" : ""}</span>
          )}
          {warnings.length > 0 && (
            <span className="text-sbx-warn">▲ {warnings.length} warning{warnings.length > 1 ? "s" : ""}</span>
          )}
        </span>
        {(errors.length > 0 || warnings.length > 0) && (
          <span className="text-xs text-sbx-muted">{open ? "hide" : "show"}</span>
        )}
      </button>
      {open && (errors.length > 0 || warnings.length > 0) && (
        <ul className="space-y-1.5 border-t border-sbx-border px-4 py-3 text-xs">
          {[...errors, ...warnings].map((i, idx) => (
            <li key={idx} className="flex gap-2">
              <span className={i.severity === "error" ? "text-sbx-bad" : "text-sbx-warn"}>
                {i.severity === "error" ? "✕" : "▲"}
              </span>
              <span className="text-sbx-muted">
                <code className="text-sbx-text/90">{i.path}</code> — {i.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
