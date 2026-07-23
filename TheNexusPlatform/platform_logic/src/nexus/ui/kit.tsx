/**
 * Minimal page-composition primitives — the restrained, un-narrated building
 * blocks the plan's §6 calls for. No gradients, few borders, one accent, quiet
 * type. Built on the existing shadcn tokens (theme.css).
 */
import type { ReactNode } from "react";

import { cn } from "@/app/components/ui/utils";

/** Page header: a short title, an optional one-line subtitle, optional actions. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:mb-10 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1>
        {subtitle ? <p className="mt-2 text-[15px] text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div> : null}
    </div>
  );
}

/** A stat tile — the number is the hero; label + optional hint sit beneath. */
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="glass-card flex flex-col justify-center px-5 py-4">
      <div className="text-4xl font-semibold leading-none text-foreground tabular-nums tracking-tight">{value}</div>
      <div className="mt-2 text-sm font-medium text-muted-foreground">{label}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground/70">{hint}</div> : null}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-12", className)}>
      {title || action ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title ? <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

type Tone = "neutral" | "accent" | "positive" | "warn" | "danger";
const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  accent: "bg-primary/10 text-foreground",
  positive: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  warn: "bg-amber-500/14 text-amber-700 dark:text-amber-400",
  danger: "bg-red-500/12 text-red-600 dark:text-red-400",
};

/** Status pill — used only for genuine status, not decoration. */
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Map a status string to a pill tone. */
export function statusTone(status?: string): Tone {
  switch (status) {
    case "active":
    case "open":
    case "published":
    case "approved":
    case "accepted":
      return "positive";
    case "private_beta":
    case "preview":
    case "pending_review":
    case "pending":
    case "trial":
    case "draft":
      return "warn";
    case "rejected":
    case "revoked":
    case "closed":
      return "danger";
    default:
      return "neutral";
  }
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="glass-card border-dashed bg-card/40 px-6 py-12 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
      {label ?? "Loading…"}
    </div>
  );
}
