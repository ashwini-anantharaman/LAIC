// The fixed semantic set (spec §8): draft amber, reviewed neutral, approved
// green, deprecated stone; valid/invalid; extracted-vs-fellow provenance.

import type { ItemStatus, KnowledgeType, PlayerValidationStatus } from "@bridge/kb";

const STATUS_STYLE: Record<ItemStatus, string> = {
  draft: "bg-amber-50 text-[color:var(--color-draft)] border-amber-200",
  reviewed: "bg-neutral-100 text-neutral-700 border-neutral-200",
  approved: "bg-emerald-50 text-[color:var(--color-approved)] border-emerald-200",
  deprecated: "bg-neutral-100 text-neutral-400 border-neutral-200 line-through",
};

export function StatusBadge({ status }: Readonly<{ status: ItemStatus }>) {
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_STYLE[status]}`}
    >
      {status}
    </span>
  );
}

export function ValidityBadge({ status }: Readonly<{ status: PlayerValidationStatus }>) {
  const style =
    status === "valid" || status === "published"
      ? "bg-emerald-50 text-[color:var(--color-approved)] border-emerald-200"
      : status === "invalid"
        ? "bg-red-50 text-[color:var(--color-invalid)] border-red-200"
        : "bg-neutral-100 text-neutral-600 border-neutral-200";
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${style}`}
    >
      {status}
    </span>
  );
}

export const TYPE_LABEL: Record<KnowledgeType, string> = {
  concept: "concept",
  bidding_rule: "bidding rule",
  convention: "convention",
  agreement: "agreement",
  declarer_technique: "declarer technique",
  defensive_technique: "defensive technique",
  lead_agreement: "lead agreement",
  signal_agreement: "signal agreement",
  judgment_guideline: "judgment guideline",
  exception: "exception",
  fallback_rule: "fallback rule",
};

export function TypeChip({ type }: Readonly<{ type: KnowledgeType }>) {
  return (
    <span className="inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-600">
      {TYPE_LABEL[type]}
    </span>
  );
}
