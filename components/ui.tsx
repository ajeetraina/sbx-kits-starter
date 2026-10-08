"use client";

import React from "react";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">
        {label}
        {hint && <span className="ml-2 normal-case tracking-normal text-sbx-muted/70">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      className={`input ${mono ? "font-mono" : ""}`}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      className="input resize-y font-mono leading-relaxed"
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** An editable list of short string values (e.g. allowed domains, licenses). */
export function StringList({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const set = (i: number, v: string) => {
    const next = [...values];
    next[i] = v;
    onChange(next);
  };
  const remove = (i: number) => onChange(values.filter((_, j) => j !== i));
  const add = () => onChange([...values, ""]);

  return (
    <div className="space-y-2">
      {values.map((v, i) => (
        <div key={i} className="flex gap-2">
          <input
            className="input font-mono"
            value={v}
            placeholder={placeholder}
            onChange={(e) => set(i, e.target.value)}
          />
          <button
            type="button"
            className="btn-ghost btn-sm shrink-0"
            onClick={() => remove(i)}
            aria-label="Remove"
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn-ghost btn-sm" onClick={add}>
        + Add
      </button>
    </div>
  );
}

export function Section({
  title,
  subtitle,
  right,
  children,
  defaultOpen = true,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className="panel overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          className="flex items-center gap-2 text-left"
          onClick={() => setOpen((o) => !o)}
        >
          <span className={`text-sbx-muted transition ${open ? "rotate-90" : ""}`}>›</span>
          <span>
            <span className="text-sm font-semibold text-sbx-text">{title}</span>
            {subtitle && <span className="ml-2 text-xs text-sbx-muted">{subtitle}</span>}
          </span>
        </button>
        {right}
      </header>
      {open && <div className="border-t border-sbx-border px-4 py-4">{children}</div>}
    </section>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-sbx-text">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-sbx-border bg-sbx-panel2 accent-sbx-accent"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
