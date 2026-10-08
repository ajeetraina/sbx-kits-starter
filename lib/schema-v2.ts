/**
 * Docker Sandboxes (sbx) Kit — Schema v2 model, serializer, and validator.
 *
 * This is the single source of truth for what a kit is in this portal. It mirrors
 * the official field reference in docker/sbx-kits-contrib (spec/SPEC-v2.md):
 *   - top-level: schemaVersion "2", kind (mixin | sandbox), name, version,
 *     displayName, description, sourceURL, licenses
 *   - shared blocks: permissions.network, environment.variables, setup
 *     (install/startup/files), credentials, ports, volumes, agentInstructions
 *   - mixin-only: requires.agent
 *   - sandbox-only: sandbox (image/entrypoint/command/resources), extends, mixins
 *
 * Note vs schema v1 (e.g. the mem0 kit): v1 used `network.allowedDomains`,
 * `commands.install`, `initFiles`, and `memory`. v2 renames these to
 * `permissions.network.allow`, `setup.install`, `setup.files`, and
 * `agentInstructions.content`.
 */

import { stringify } from "yaml";

export type KitKind = "mixin" | "sandbox";

export interface EnvVar {
  key: string;
  value: string;
}

export interface InstallStep {
  command: string;
  /** Default "0" (root). */
  user?: string;
  description?: string;
}

export interface StartupStep {
  /** Exec-style argv, no shell processing. Stored here as a single string the
   *  user types; serialized as a YAML list split on spaces unless it contains
   *  a JSON array. Kept simple for the portal. */
  command: string;
  /** Default "1000" (agent). */
  user?: string;
  background?: boolean;
  description?: string;
}

export interface FileWrite {
  /** Absolute path inside the sandbox. */
  path: string;
  content: string;
  /** Octal, default "0644". */
  mode?: string;
  onlyIfMissing?: boolean;
  description?: string;
}

export interface ApiKeyInject {
  domain: string;
  /** Sugar: "bearer" | "basic" (mutually exclusive with header/format). */
  scheme?: "bearer" | "basic" | "";
  header?: string;
  /** Must contain exactly one %s. */
  format?: string;
  username?: string;
}

export interface Credential {
  service: string;
  description?: string;
  required?: boolean;
  /** API-key style injection. */
  apiKey?: {
    /** Environment variable name the key is exposed as. */
    name: string;
    proxyManaged?: boolean;
    inject?: ApiKeyInject[];
  };
}

export interface PortMapping {
  container: number;
  protocol?: "" | "tcp" | "udp";
  name?: string;
}

export interface VolumeMount {
  path: string;
  type?: "" | "tmpfs";
  size?: string;
  mode?: string;
}

export interface KitSpec {
  schemaVersion: "2";
  kind: KitKind;
  name: string;
  version?: string;
  displayName?: string;
  description?: string;
  sourceURL?: string;
  licenses?: string[];

  /** mixin-only: pin an affinity to a base agent. */
  requiresAgent?: string;

  /** sandbox-only. */
  sandbox?: {
    image?: string;
    entrypoint?: string[];
    command?: string;
    resources?: { cpu?: number; memory?: string; gpu?: string };
  };
  extends?: string;

  network?: {
    allow?: string[];
    deny?: string[];
  };

  environment?: EnvVar[];

  setup?: {
    install?: InstallStep[];
    startup?: StartupStep[];
    files?: FileWrite[];
  };

  credentials?: Credential[];
  ports?: PortMapping[];
  volumes?: VolumeMount[];

  agentInstructions?: string;
}

export const NAME_PATTERN = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;

export function emptyKit(kind: KitKind = "mixin"): KitSpec {
  return {
    schemaVersion: "2",
    kind,
    name: "",
    displayName: "",
    description: "",
    version: "",
    sourceURL: "",
    licenses: [],
    network: { allow: [], deny: [] },
    environment: [],
    setup: { install: [], startup: [], files: [] },
    credentials: [],
    ports: [],
    volumes: [],
    agentInstructions: "",
    sandbox: { image: "" },
  };
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export type Severity = "error" | "warning";

export interface Issue {
  severity: Severity;
  path: string;
  message: string;
}

export function validateKit(kit: KitSpec): Issue[] {
  const issues: Issue[] = [];
  const err = (path: string, message: string) =>
    issues.push({ severity: "error", path, message });
  const warn = (path: string, message: string) =>
    issues.push({ severity: "warning", path, message });

  if (kit.schemaVersion !== "2")
    err("schemaVersion", 'schemaVersion must be exactly "2".');

  if (kit.kind !== "mixin" && kit.kind !== "sandbox")
    err("kind", 'kind must be "mixin" or "sandbox".');

  if (!kit.name) {
    err("name", "name is required.");
  } else if (!NAME_PATTERN.test(kit.name)) {
    err(
      "name",
      "name must be lowercase alphanumeric with hyphens (1–64 chars), e.g. my-kit.",
    );
  }

  if (!kit.description) warn("description", "A description helps users pick your kit.");

  if (kit.licenses) {
    const seen = new Set<string>();
    for (const l of kit.licenses) {
      if (!l) continue;
      if (seen.has(l)) err("licenses", `Duplicate license "${l}".`);
      seen.add(l);
    }
  }

  // Kind-specific fields.
  if (kit.kind === "sandbox") {
    const hasImage = kit.sandbox?.image?.trim();
    if (!hasImage && !kit.extends)
      err(
        "sandbox.image",
        "A sandbox kit needs sandbox.image (or must inherit one via extends).",
      );
    if (kit.requiresAgent)
      err("requires.agent", "requires.agent is only valid on mixin kits.");
    if (kit.sandbox?.resources?.cpu != null && kit.sandbox.resources.cpu < 0)
      err("sandbox.resources.cpu", "cpu must be >= 0.");
  } else {
    if (kit.sandbox?.image?.trim())
      warn("sandbox.image", "sandbox.image is ignored on mixin kits.");
    if (kit.extends)
      warn("extends", "extends is only meaningful on sandbox kits.");
  }

  // Network patterns feeding credentials.
  const allow = new Set((kit.network?.allow ?? []).filter(Boolean));

  // Environment variable keys.
  for (const v of kit.environment ?? []) {
    if (v.key && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(v.key))
      err("environment", `"${v.key}" is not a valid environment variable name.`);
  }

  // Setup.
  (kit.setup?.install ?? []).forEach((s, i) => {
    if (!s.command?.trim())
      err(`setup.install[${i}]`, "install command cannot be empty.");
  });
  (kit.setup?.startup ?? []).forEach((s, i) => {
    if (!s.command?.trim())
      err(`setup.startup[${i}]`, "startup command cannot be empty.");
  });
  (kit.setup?.files ?? []).forEach((f, i) => {
    if (!f.path?.trim()) err(`setup.files[${i}]`, "file path is required.");
    else if (!f.path.startsWith("/"))
      err(`setup.files[${i}]`, "file path must be absolute.");
    if (f.mode && !/^[0-7]{3,4}$/.test(f.mode))
      err(`setup.files[${i}].mode`, `mode "${f.mode}" must be octal, e.g. 0644.`);
  });

  // Credentials.
  (kit.credentials ?? []).forEach((c, i) => {
    if (!c.service?.trim())
      err(`credentials[${i}]`, "credential service is required.");
    (c.apiKey?.inject ?? []).forEach((inj, j) => {
      if (!inj.domain?.trim())
        err(`credentials[${i}].apiKey.inject[${j}]`, "inject domain is required.");
      else if (!allow.has(inj.domain))
        warn(
          `credentials[${i}].apiKey.inject[${j}]`,
          `Domain "${inj.domain}" should also appear in permissions.network.allow.`,
        );
      if (inj.scheme && inj.format)
        err(
          `credentials[${i}].apiKey.inject[${j}]`,
          "scheme and format are mutually exclusive.",
        );
      if (inj.format && !inj.format.includes("%s"))
        err(
          `credentials[${i}].apiKey.inject[${j}].format`,
          "format must contain exactly one %s.",
        );
    });
  });

  // Ports.
  (kit.ports ?? []).forEach((p, i) => {
    if (!(p.container >= 1 && p.container <= 65535))
      err(`ports[${i}].container`, "container port must be 1–65535.");
  });

  // Volumes.
  (kit.volumes ?? []).forEach((v, i) => {
    if (!v.path?.trim()) err(`volumes[${i}].path`, "volume path is required.");
    else if (!v.path.startsWith("/"))
      err(`volumes[${i}].path`, "volume path must be absolute.");
  });

  return issues;
}

/* ------------------------------------------------------------------ *
 * YAML serialization
 * ------------------------------------------------------------------ */

/** Build a plain object in the canonical field order used by real kits, omitting
 *  empty sections, then serialize with the `yaml` library. */
export function kitToYaml(kit: KitSpec): string {
  const doc: Record<string, unknown> = {};

  doc.schemaVersion = "2";
  doc.kind = kit.kind;
  doc.name = kit.name || "unnamed-kit";
  if (kit.version) doc.version = kit.version;
  if (kit.displayName) doc.displayName = kit.displayName;
  if (kit.description) doc.description = kit.description;
  if (kit.sourceURL) doc.sourceURL = kit.sourceURL;
  const licenses = (kit.licenses ?? []).filter(Boolean);
  if (licenses.length) doc.licenses = licenses;

  if (kit.kind === "mixin" && kit.requiresAgent) {
    doc.requires = { agent: kit.requiresAgent };
  }

  if (kit.kind === "sandbox") {
    if (kit.extends) doc.extends = kit.extends;
    const s = kit.sandbox ?? {};
    const sandbox: Record<string, unknown> = {};
    if (s.image) sandbox.image = s.image;
    if (s.entrypoint?.length) sandbox.entrypoint = s.entrypoint;
    if (s.command) sandbox.command = s.command;
    if (s.resources) {
      const r: Record<string, unknown> = {};
      if (s.resources.cpu != null) r.cpu = s.resources.cpu;
      if (s.resources.memory) r.memory = s.resources.memory;
      if (s.resources.gpu) r.gpu = s.resources.gpu;
      if (Object.keys(r).length) sandbox.resources = r;
    }
    if (Object.keys(sandbox).length) doc.sandbox = sandbox;
  }

  const allow = (kit.network?.allow ?? []).filter(Boolean);
  const deny = (kit.network?.deny ?? []).filter(Boolean);
  if (allow.length || deny.length) {
    const net: Record<string, unknown> = {};
    if (allow.length) net.allow = allow;
    if (deny.length) net.deny = deny;
    doc.permissions = { network: net };
  }

  const envVars = (kit.environment ?? []).filter((v) => v.key);
  if (envVars.length) {
    const variables: Record<string, string> = {};
    for (const v of envVars) variables[v.key] = v.value;
    doc.environment = { variables };
  }

  const install = (kit.setup?.install ?? []).filter((s) => s.command?.trim());
  const startup = (kit.setup?.startup ?? []).filter((s) => s.command?.trim());
  const files = (kit.setup?.files ?? []).filter((f) => f.path?.trim());
  if (install.length || startup.length || files.length) {
    const setup: Record<string, unknown> = {};
    if (install.length) {
      setup.install = install.map((s) => {
        const o: Record<string, unknown> = { command: s.command };
        if (s.user) o.user = s.user;
        if (s.description) o.description = s.description;
        return o;
      });
    }
    if (startup.length) {
      setup.startup = startup.map((s) => {
        const o: Record<string, unknown> = { command: splitArgv(s.command) };
        if (s.user) o.user = s.user;
        if (s.background) o.background = true;
        if (s.description) o.description = s.description;
        return o;
      });
    }
    if (files.length) {
      setup.files = files.map((f) => {
        const o: Record<string, unknown> = { path: f.path };
        if (f.mode) o.mode = f.mode;
        if (f.onlyIfMissing) o.onlyIfMissing = true;
        if (f.description) o.description = f.description;
        o.content = f.content ?? "";
        return o;
      });
    }
    doc.setup = setup;
  }

  const creds = (kit.credentials ?? []).filter((c) => c.service?.trim());
  if (creds.length) {
    doc.credentials = creds.map((c) => {
      const o: Record<string, unknown> = { service: c.service };
      if (c.description) o.description = c.description;
      if (c.required) o.required = true;
      if (c.apiKey?.name) {
        const apiKey: Record<string, unknown> = { name: c.apiKey.name };
        if (c.apiKey.proxyManaged) apiKey.proxyManaged = true;
        const inject = (c.apiKey.inject ?? []).filter((i) => i.domain?.trim());
        if (inject.length) {
          apiKey.inject = inject.map((i) => {
            const io: Record<string, unknown> = { domain: i.domain };
            if (i.scheme) io.scheme = i.scheme;
            if (i.header) io.header = i.header;
            if (i.format) io.format = i.format;
            if (i.username) io.username = i.username;
            return io;
          });
        }
        o.apiKey = apiKey;
      }
      return o;
    });
  }

  const ports = (kit.ports ?? []).filter((p) => p.container);
  if (ports.length) {
    doc.ports = ports.map((p) => {
      const o: Record<string, unknown> = { container: p.container };
      if (p.protocol) o.protocol = p.protocol;
      if (p.name) o.name = p.name;
      return o;
    });
  }

  const volumes = (kit.volumes ?? []).filter((v) => v.path?.trim());
  if (volumes.length) {
    doc.volumes = volumes.map((v) => {
      const o: Record<string, unknown> = { path: v.path };
      if (v.type) o.type = v.type;
      if (v.size) o.size = v.size;
      if (v.mode) o.mode = v.mode;
      return o;
    });
  }

  if (kit.agentInstructions?.trim()) {
    doc.agentInstructions = { content: kit.agentInstructions };
  }

  return stringify(doc, {
    lineWidth: 0,
    defaultStringType: "PLAIN",
    defaultKeyType: "PLAIN",
  });
}

/** Split a startup command string into argv. Accepts a JSON array too. */
function splitArgv(cmd: string): string[] {
  const trimmed = cmd.trim();
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) return arr.map(String);
    } catch {
      /* fall through */
    }
  }
  return trimmed.split(/\s+/).filter(Boolean);
}
