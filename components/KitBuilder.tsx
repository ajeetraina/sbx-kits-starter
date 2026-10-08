"use client";

import React from "react";
import type {
  KitSpec,
  KitKind,
  EnvVar,
  InstallStep,
  StartupStep,
  FileWrite,
  Credential,
  PortMapping,
  VolumeMount,
} from "@/lib/schema-v2";
import { Field, TextInput, TextArea, StringList, Section, Toggle } from "./ui";

type Update = (mut: (draft: KitSpec) => void) => void;

export function KitBuilder({ kit, setKit }: { kit: KitSpec; setKit: (k: KitSpec) => void }) {
  const update: Update = (mut) => {
    const draft: KitSpec = structuredClone(kit);
    mut(draft);
    setKit(draft);
  };

  return (
    <div className="space-y-4">
      <BasicsSection kit={kit} update={update} />
      {kit.kind === "sandbox" && <SandboxSection kit={kit} update={update} />}
      <NetworkSection kit={kit} update={update} />
      <EnvironmentSection kit={kit} update={update} />
      <SetupSection kit={kit} update={update} />
      <CredentialsSection kit={kit} update={update} />
      <AdvancedSection kit={kit} update={update} />
      <AgentInstructionsSection kit={kit} update={update} />
    </div>
  );
}

/* ---------------- Basics ---------------- */

function BasicsSection({ kit, update }: { kit: KitSpec; update: Update }) {
  const setKind = (kind: KitKind) => update((d) => (d.kind = kind));
  return (
    <Section title="Basics" subtitle="identity & metadata">
      <div className="space-y-4">
        <Field label="Kind">
          <div className="flex gap-2">
            {(["mixin", "sandbox"] as KitKind[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`btn flex-1 border ${
                  kit.kind === k
                    ? "border-sbx-accent bg-sbx-accent/15 text-sbx-text"
                    : "border-sbx-border bg-sbx-panel2 text-sbx-muted hover:border-sbx-accent/50"
                }`}
                onClick={() => setKind(k)}
              >
                {k === "mixin" ? "Mixin — add to any agent" : "Sandbox — ship a base image"}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" hint="lowercase-with-hyphens">
            <TextInput
              value={kit.name}
              onChange={(v) => update((d) => (d.name = v))}
              placeholder="my-kit"
              mono
            />
          </Field>
          <Field label="Display name">
            <TextInput
              value={kit.displayName ?? ""}
              onChange={(v) => update((d) => (d.displayName = v))}
              placeholder="My Kit"
            />
          </Field>
        </div>

        <Field label="Description">
          <TextArea
            value={kit.description ?? ""}
            onChange={(v) => update((d) => (d.description = v))}
            placeholder="What does this kit add, and how is it wired?"
            rows={3}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Version" hint="optional">
            <TextInput
              value={kit.version ?? ""}
              onChange={(v) => update((d) => (d.version = v))}
              placeholder="1.0.0"
              mono
            />
          </Field>
          <Field label="Source URL" hint="optional">
            <TextInput
              value={kit.sourceURL ?? ""}
              onChange={(v) => update((d) => (d.sourceURL = v))}
              placeholder="https://github.com/you/your-product"
              mono
            />
          </Field>
        </div>

        <Field label="Licenses" hint="SPDX identifiers">
          <StringList
            values={kit.licenses ?? []}
            onChange={(v) => update((d) => (d.licenses = v))}
            placeholder="Apache-2.0"
          />
        </Field>

        {kit.kind === "mixin" && (
          <Field label="Requires agent" hint="optional — pin to a base agent">
            <TextInput
              value={kit.requiresAgent ?? ""}
              onChange={(v) => update((d) => (d.requiresAgent = v))}
              placeholder="claude"
              mono
            />
          </Field>
        )}
      </div>
    </Section>
  );
}

/* ---------------- Sandbox ---------------- */

function SandboxSection({ kit, update }: { kit: KitSpec; update: Update }) {
  const s = kit.sandbox ?? {};
  const r = s.resources ?? {};
  return (
    <Section title="Sandbox" subtitle="base image & resources">
      <div className="space-y-4">
        <Field label="Image" hint="required unless inherited via extends">
          <TextInput
            value={s.image ?? ""}
            onChange={(v) => update((d) => ((d.sandbox ??= {}).image = v))}
            placeholder="docker.io/library/debian:stable-slim"
            mono
          />
        </Field>
        <Field label="Extends" hint="optional parent kit">
          <TextInput
            value={kit.extends ?? ""}
            onChange={(v) => update((d) => (d.extends = v))}
            placeholder="oci://registry/base-agent:1"
            mono
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="CPU">
            <TextInput
              value={r.cpu != null ? String(r.cpu) : ""}
              onChange={(v) =>
                update((d) => {
                  (d.sandbox ??= {}).resources ??= {};
                  d.sandbox.resources.cpu = v ? Number(v) : undefined;
                })
              }
              placeholder="2"
              mono
            />
          </Field>
          <Field label="Memory">
            <TextInput
              value={r.memory ?? ""}
              onChange={(v) =>
                update((d) => {
                  (d.sandbox ??= {}).resources ??= {};
                  d.sandbox.resources.memory = v;
                })
              }
              placeholder="4g"
              mono
            />
          </Field>
          <Field label="GPU">
            <TextInput
              value={r.gpu ?? ""}
              onChange={(v) =>
                update((d) => {
                  (d.sandbox ??= {}).resources ??= {};
                  d.sandbox.resources.gpu = v;
                })
              }
              placeholder="all"
              mono
            />
          </Field>
        </div>
      </div>
    </Section>
  );
}

/* ---------------- Network ---------------- */

function NetworkSection({ kit, update }: { kit: KitSpec; update: Update }) {
  const count = (kit.network?.allow ?? []).filter(Boolean).length;
  return (
    <Section
      title="Network"
      subtitle="permissions.network"
      right={<span className="chip">{count} allowed</span>}
    >
      <div className="space-y-4">
        <p className="text-xs text-sbx-muted">
          List only the exact hosts the sandbox needs. Examples: <code>pypi.org</code>,{" "}
          <code>api.example.com</code>, <code>host.docker.internal:4000</code>, <code>*.example.com</code>.
        </p>
        <Field label="Allow">
          <StringList
            values={kit.network?.allow ?? []}
            onChange={(v) => update((d) => ((d.network ??= {}).allow = v))}
            placeholder="api.example.com"
          />
        </Field>
        <Field label="Deny" hint="takes precedence on overlap">
          <StringList
            values={kit.network?.deny ?? []}
            onChange={(v) => update((d) => ((d.network ??= {}).deny = v))}
            placeholder="metadata.google.internal"
          />
        </Field>
      </div>
    </Section>
  );
}

/* ---------------- Environment ---------------- */

function EnvironmentSection({ kit, update }: { kit: KitSpec; update: Update }) {
  const env = kit.environment ?? [];
  const setRow = (i: number, patch: Partial<EnvVar>) =>
    update((d) => {
      d.environment ??= [];
      d.environment[i] = { ...d.environment[i], ...patch };
    });
  return (
    <Section title="Environment" subtitle="environment.variables" right={<span className="chip">{env.length}</span>}>
      <div className="space-y-2">
        {env.map((v, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="input w-1/3 font-mono"
              value={v.key}
              placeholder="OPENAI_BASE_URL"
              onChange={(e) => setRow(i, { key: e.target.value })}
            />
            <input
              className="input flex-1 font-mono"
              value={v.value}
              placeholder="http://host.docker.internal:12434/engines/v1"
              onChange={(e) => setRow(i, { value: e.target.value })}
            />
            <button
              className="btn-ghost btn-sm shrink-0"
              onClick={() => update((d) => (d.environment = env.filter((_, j) => j !== i)))}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          className="btn-ghost btn-sm"
          onClick={() => update((d) => ((d.environment ??= []).push({ key: "", value: "" })))}
        >
          + Add variable
        </button>
      </div>
    </Section>
  );
}

/* ---------------- Setup ---------------- */

function SetupSection({ kit, update }: { kit: KitSpec; update: Update }) {
  const install = kit.setup?.install ?? [];
  const startup = kit.setup?.startup ?? [];
  const files = kit.setup?.files ?? [];

  const ensure = (d: KitSpec) => (d.setup ??= { install: [], startup: [], files: [] });

  return (
    <Section title="Setup" subtitle="install · startup · files">
      <div className="space-y-6">
        {/* install */}
        <div>
          <div className="label">Install commands <span className="normal-case text-sbx-muted/70">— run once at creation (sh -c)</span></div>
          <div className="space-y-3">
            {install.map((s, i) => (
              <StepCard key={i} onRemove={() => update((d) => (ensure(d).install = install.filter((_, j) => j !== i)))}>
                <input
                  className="input font-mono"
                  value={s.command}
                  placeholder="pip install --break-system-packages 'mylib==1.0'"
                  onChange={(e) => update((d) => (ensure(d).install![i] = { ...s, command: e.target.value } as InstallStep))}
                />
                <div className="mt-2 flex gap-2">
                  <input
                    className="input w-24 font-mono"
                    value={s.user ?? ""}
                    placeholder="user"
                    onChange={(e) => update((d) => (ensure(d).install![i] = { ...s, user: e.target.value } as InstallStep))}
                  />
                  <input
                    className="input flex-1"
                    value={s.description ?? ""}
                    placeholder="description (optional)"
                    onChange={(e) => update((d) => (ensure(d).install![i] = { ...s, description: e.target.value } as InstallStep))}
                  />
                </div>
              </StepCard>
            ))}
            <button
              className="btn-ghost btn-sm"
              onClick={() => update((d) => ensure(d).install!.push({ command: "", user: "1000" }))}
            >
              + Add install step
            </button>
          </div>
        </div>

        {/* startup */}
        <div>
          <div className="label">Startup commands <span className="normal-case text-sbx-muted/70">— run every start (exec argv)</span></div>
          <div className="space-y-3">
            {startup.map((s, i) => (
              <StepCard key={i} onRemove={() => update((d) => (ensure(d).startup = startup.filter((_, j) => j !== i)))}>
                <input
                  className="input font-mono"
                  value={s.command}
                  placeholder="my-daemon --serve"
                  onChange={(e) => update((d) => (ensure(d).startup![i] = { ...s, command: e.target.value } as StartupStep))}
                />
                <div className="mt-2 flex items-center gap-3">
                  <input
                    className="input w-24 font-mono"
                    value={s.user ?? ""}
                    placeholder="user"
                    onChange={(e) => update((d) => (ensure(d).startup![i] = { ...s, user: e.target.value } as StartupStep))}
                  />
                  <Toggle
                    checked={!!s.background}
                    onChange={(v) => update((d) => (ensure(d).startup![i] = { ...s, background: v } as StartupStep))}
                    label="background"
                  />
                </div>
              </StepCard>
            ))}
            <button
              className="btn-ghost btn-sm"
              onClick={() => update((d) => ensure(d).startup!.push({ command: "", user: "1000" }))}
            >
              + Add startup step
            </button>
          </div>
        </div>

        {/* files */}
        <div>
          <div className="label">Files <span className="normal-case text-sbx-muted/70">— written into the sandbox at startup</span></div>
          <div className="space-y-3">
            {files.map((f, i) => (
              <StepCard key={i} onRemove={() => update((d) => (ensure(d).files = files.filter((_, j) => j !== i)))}>
                <div className="flex gap-2">
                  <input
                    className="input flex-1 font-mono"
                    value={f.path}
                    placeholder="/home/agent/.config/tool.json"
                    onChange={(e) => update((d) => (ensure(d).files![i] = { ...f, path: e.target.value } as FileWrite))}
                  />
                  <input
                    className="input w-24 font-mono"
                    value={f.mode ?? ""}
                    placeholder="0644"
                    onChange={(e) => update((d) => (ensure(d).files![i] = { ...f, mode: e.target.value } as FileWrite))}
                  />
                </div>
                <textarea
                  className="input mt-2 resize-y font-mono text-xs"
                  rows={4}
                  value={f.content}
                  placeholder={"file contents…"}
                  onChange={(e) => update((d) => (ensure(d).files![i] = { ...f, content: e.target.value } as FileWrite))}
                />
                <div className="mt-2">
                  <Toggle
                    checked={!!f.onlyIfMissing}
                    onChange={(v) => update((d) => (ensure(d).files![i] = { ...f, onlyIfMissing: v } as FileWrite))}
                    label="only if missing (editable config)"
                  />
                </div>
              </StepCard>
            ))}
            <button
              className="btn-ghost btn-sm"
              onClick={() => update((d) => ensure(d).files!.push({ path: "", content: "", mode: "0644" }))}
            >
              + Add file
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ---------------- Credentials ---------------- */

function CredentialsSection({ kit, update }: { kit: KitSpec; update: Update }) {
  const creds = kit.credentials ?? [];
  const setCred = (i: number, patch: Partial<Credential>) =>
    update((d) => {
      d.credentials ??= [];
      d.credentials[i] = { ...d.credentials[i], ...patch };
    });
  return (
    <Section
      title="Credentials"
      subtitle="proxy-injected API keys"
      defaultOpen={creds.length > 0}
      right={<span className="chip">{creds.length}</span>}
    >
      <div className="space-y-3">
        <p className="text-xs text-sbx-muted">
          Declared keys are injected by the proxy for a specific domain — real secrets never enter the
          spec. The inject domain must also be in <code>permissions.network.allow</code>.
        </p>
        {creds.map((c, i) => {
          const inj = c.apiKey?.inject?.[0];
          return (
            <StepCard key={i} onRemove={() => update((d) => (d.credentials = creds.filter((_, j) => j !== i)))}>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className="input font-mono"
                  value={c.service}
                  placeholder="service (lowercase-kebab)"
                  onChange={(e) => setCred(i, { service: e.target.value })}
                />
                <input
                  className="input font-mono"
                  value={c.apiKey?.name ?? ""}
                  placeholder="ENV_VAR_NAME"
                  onChange={(e) =>
                    setCred(i, { apiKey: { ...(c.apiKey ?? { inject: [] }), name: e.target.value } })
                  }
                />
                <input
                  className="input font-mono"
                  value={inj?.domain ?? ""}
                  placeholder="inject domain (api.example.com)"
                  onChange={(e) =>
                    setCred(i, {
                      apiKey: {
                        name: c.apiKey?.name ?? "",
                        ...c.apiKey,
                        inject: [{ ...(inj ?? {}), domain: e.target.value }],
                      },
                    })
                  }
                />
                <select
                  className="input"
                  value={inj?.scheme ?? "bearer"}
                  onChange={(e) =>
                    setCred(i, {
                      apiKey: {
                        name: c.apiKey?.name ?? "",
                        ...c.apiKey,
                        inject: [{ domain: inj?.domain ?? "", scheme: e.target.value as "bearer" | "basic" }],
                      },
                    })
                  }
                >
                  <option value="bearer">scheme: bearer</option>
                  <option value="basic">scheme: basic</option>
                </select>
              </div>
              <div className="mt-2">
                <Toggle
                  checked={!!c.required}
                  onChange={(v) => setCred(i, { required: v })}
                  label="required"
                />
              </div>
            </StepCard>
          );
        })}
        <button
          className="btn-ghost btn-sm"
          onClick={() =>
            update((d) => (d.credentials ??= []).push({ service: "", apiKey: { name: "", inject: [] } }))
          }
        >
          + Add credential
        </button>
      </div>
    </Section>
  );
}

/* ---------------- Advanced (ports + volumes) ---------------- */

function AdvancedSection({ kit, update }: { kit: KitSpec; update: Update }) {
  const ports = kit.ports ?? [];
  const volumes = kit.volumes ?? [];
  const hasAny = ports.length + volumes.length > 0;
  return (
    <Section title="Ports & volumes" subtitle="optional" defaultOpen={hasAny}>
      <div className="space-y-6">
        <div>
          <div className="label">Ports</div>
          <div className="space-y-2">
            {ports.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="input w-28 font-mono"
                  value={p.container ? String(p.container) : ""}
                  placeholder="8080"
                  onChange={(e) =>
                    update((d) => ((d.ports ??= [])[i] = { ...p, container: Number(e.target.value) } as PortMapping))
                  }
                />
                <input
                  className="input flex-1"
                  value={p.name ?? ""}
                  placeholder="name (optional)"
                  onChange={(e) => update((d) => ((d.ports ??= [])[i] = { ...p, name: e.target.value } as PortMapping))}
                />
                <button className="btn-ghost btn-sm shrink-0" onClick={() => update((d) => (d.ports = ports.filter((_, j) => j !== i)))}>
                  ✕
                </button>
              </div>
            ))}
            <button className="btn-ghost btn-sm" onClick={() => update((d) => (d.ports ??= []).push({ container: 0 }))}>
              + Add port
            </button>
          </div>
        </div>

        <div>
          <div className="label">Volumes</div>
          <div className="space-y-2">
            {volumes.map((v, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="input flex-1 font-mono"
                  value={v.path}
                  placeholder="/home/agent/.cache"
                  onChange={(e) => update((d) => ((d.volumes ??= [])[i] = { ...v, path: e.target.value } as VolumeMount))}
                />
                <input
                  className="input w-24 font-mono"
                  value={v.size ?? ""}
                  placeholder="1g"
                  onChange={(e) => update((d) => ((d.volumes ??= [])[i] = { ...v, size: e.target.value } as VolumeMount))}
                />
                <button className="btn-ghost btn-sm shrink-0" onClick={() => update((d) => (d.volumes = volumes.filter((_, j) => j !== i)))}>
                  ✕
                </button>
              </div>
            ))}
            <button className="btn-ghost btn-sm" onClick={() => update((d) => (d.volumes ??= []).push({ path: "" }))}>
              + Add volume
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ---------------- Agent instructions ---------------- */

function AgentInstructionsSection({ kit, update }: { kit: KitSpec; update: Update }) {
  return (
    <Section title="Agent instructions" subtitle="agentInstructions.content — Markdown for the agent">
      <TextArea
        value={kit.agentInstructions ?? ""}
        onChange={(v) => update((d) => (d.agentInstructions = v))}
        placeholder={"## My Tool\n\nThe `mylib` package is installed and pre-wired to …"}
        rows={8}
      />
    </Section>
  );
}

/* ---------------- shared card ---------------- */

function StepCard({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <div className="rounded-lg border border-sbx-border bg-sbx-panel2/60 p-3">
      <div className="flex items-start gap-2">
        <div className="flex-1">{children}</div>
        <button className="btn-ghost btn-sm shrink-0" onClick={onRemove} aria-label="Remove">
          ✕
        </button>
      </div>
    </div>
  );
}
