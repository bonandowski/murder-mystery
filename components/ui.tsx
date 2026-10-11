"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-gold text-gold-ink hover:brightness-110 font-semibold",
  secondary: "bg-surface-2 text-ink border border-line hover:border-gold/60",
  danger: "bg-crimson text-white hover:brightness-110 font-semibold",
  ghost: "text-muted hover:text-ink",
};

export function Button({
  variant = "primary",
  className = "",
  loading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    >
      {loading ? <span className="animate-pulse-soft">…</span> : null}
      {children}
    </button>
  );
}

export function Card({ children, className = "", tone }: { children: ReactNode; className?: string; tone?: "gold" | "crimson" }) {
  const border = tone === "gold" ? "border-gold/50" : tone === "crimson" ? "border-crimson/60" : "border-line";
  return <section className={`rounded-2xl border ${border} bg-surface/90 p-4 shadow-lg shadow-black/30 ${className}`}>{children}</section>;
}

export function Title({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`font-display text-xl text-ink ${className}`}>{children}</h2>;
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted">{children}</span>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "gold" | "crimson" | "green" }) {
  const cls = {
    neutral: "bg-surface-2 text-muted border-line",
    gold: "bg-gold/15 text-gold border-gold/40",
    crimson: "bg-crimson/15 text-red-300 border-crimson/50",
    green: "bg-green/15 text-green-300 border-green/40",
  }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cls}`}>{children}</span>;
}

export const inputClass =
  "w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base text-ink placeholder:text-muted/60 focus:border-gold focus:outline-none";

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="mt-2 rounded-lg bg-crimson/15 px-3 py-2 text-sm text-red-200">{children}</p>;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-flow-col auto-cols-fr gap-1 rounded-xl border border-line bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`min-h-9 rounded-lg px-2 text-sm transition ${o.value === value ? "bg-gold text-gold-ink font-semibold" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-28 pt-4">{children}</main>;
}
