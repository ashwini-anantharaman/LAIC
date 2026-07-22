// The fixed semantic set (spec §8): draft amber, reviewed neutral, approved
// green, deprecated stone; valid/invalid; extracted-vs-fellow provenance.

import type { ItemStatus, KnowledgeType, PlayerValidationStatus } from "@bridge/kb";

// Precedence bands, mirrored from the compiler (packages/bridge-kb/src/compile.ts
// BAND). Kept as a local literal — this module is imported by client components,
// so it must NOT pull the @bridge/kb runtime barrel (which reaches node:fs).
const BAND: Partial<Record<KnowledgeType, number>> = {
  exception: 0,
  convention: 1,
  fallback_rule: 9,
};
function bandOf(type: KnowledgeType): number | null {
  if (type === "concept" || type === "judgment_guideline") return null;
  return BAND[type] ?? 2;
}

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

/** Owner terminology (2026-07-17): players are "complete"/"incomplete" in the
 *  UI — the model's valid/invalid stays as the storage value. */
export const VALIDITY_LABEL: Record<PlayerValidationStatus, string> = {
  valid: "complete",
  invalid: "incomplete",
  draft: "draft",
  published: "published",
};

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
      {VALIDITY_LABEL[status]}
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

export const BAND_TEXT: Record<number, { name: string; blurb: string }> = {
  0: { name: "exception", blurb: "band 0 — outranks everything; outranked by nothing" },
  1: { name: "convention", blurb: "band 1 — outranked by exceptions; outranks system rules and fallbacks" },
  2: { name: "system", blurb: "band 2 — outranked by exceptions and conventions; outranks fallbacks" },
  9: { name: "fallback", blurb: "band 9 — tried dead last, when nothing else applies" },
};

/** One line naming the type's priority band; null for teaching-only types
 *  (caller renders "teaching prose — never plays"). */
export function bandLine(type: KnowledgeType): string | null {
  const band = bandOf(type);
  if (band === null) return null;
  const text = BAND_TEXT[band] ?? BAND_TEXT[2]!;
  return `${text.name} (${text.blurb})`;
}

/** One-sentence tooltip per kind, phrased for a bridge player. */
export const TYPE_DESCRIPTION: Record<KnowledgeType, string> = {
  concept: "Teaching prose that explains an idea — it never makes a call at the table.",
  bidding_rule: "A natural bidding rule: when the auction and my hand look like this, make this call.",
  convention: "An artificial agreement like Stayman — carries an on/off toggle and outranks natural bidding.",
  agreement: "A partnership understanding about natural bidding, such as opening ranges or raise structures.",
  declarer_technique: "A card-play habit for declarer — drawing trumps, finessing, setting up a long suit.",
  defensive_technique: "A card-play habit on defense — second hand low, returning partner's suit, holding up an ace.",
  lead_agreement: "Which card the partnership leads against suit or notrump contracts (e.g. fourth best).",
  signal_agreement: "How defenders' spot cards carry meaning — attitude, count, and the first discard.",
  judgment_guideline: "Teaching guidance for close decisions — advice a player weighs, never a rule that fires.",
  exception: "An override that outranks everything else when its narrow situation comes up.",
  fallback_rule: "The action of last resort — tried only when nothing else applies, so the player always has a call.",
};

export function TypeChip({ type }: Readonly<{ type: KnowledgeType }>) {
  return (
    <span className="inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-600">
      {TYPE_LABEL[type]}
    </span>
  );
}
