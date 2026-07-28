// The "applies when" facet: buckets a knowledge item by the moment at the
// table it speaks to (whose turn / which phase), derived from the payload's
// auction roles rather than stored metadata. Pure — no JSX, no store access.

import type { KnowledgeItem } from "@bridge/kb";

export type WhenGroup =
  | "opening"
  | "responding"
  | "rebidding"
  | "competing"
  | "mixed"
  | "leads"
  | "declarer"
  | "defense"
  | "prose";

export const WHEN_ORDER: WhenGroup[] = [
  "opening",
  "responding",
  "rebidding",
  "competing",
  "mixed",
  "leads",
  "declarer",
  "defense",
  "prose",
];

export const WHEN_LABEL: Record<WhenGroup, string> = {
  opening: "Opening — first to act",
  responding: "Responding — partner opened",
  rebidding: "Rebidding — you opened",
  competing: "Competing — they opened",
  mixed: "Several seats / whole auction",
  leads: "Opening leads",
  declarer: "Declarer play",
  defense: "Defense",
  prose: "Teaching prose",
};

/** Every auction role the item's rules mention (auction + forcing payloads). */
export function whenRoles(item: KnowledgeItem): Set<string> {
  const p = item.payload;
  if (p.kind === "auction_rules" || p.kind === "forcing_rules") {
    return new Set(p.rules.map((r) => r.context.role));
  }
  return new Set();
}

export function whenOf(item: KnowledgeItem): WhenGroup {
  const p = item.payload;
  if ((p.kind === "auction_rules" || p.kind === "forcing_rules") && p.rules.length > 0) {
    const roles = whenRoles(item);
    if (roles.has("any")) return "mixed";
    const only = (...allowed: string[]) => [...roles].every((r) => allowed.includes(r));
    if (only("opening")) return "opening";
    if (only("responder")) return "responding";
    if (only("opener")) return "rebidding";
    if (only("overcaller", "advancer")) return "competing";
    return "mixed";
  }
  if (p.kind === "lead_rules" || item.phase === "opening_lead") return "leads";
  if (item.phase === "declarer_play") return "declarer";
  if (item.phase === "defense" || p.kind === "signals") return "defense";
  if (p.kind === "fallback") {
    if (p.fallback.phase === "auction") return "mixed";
    if (p.fallback.phase === "opening_lead") return "leads";
    return "declarer";
  }
  return "prose";
}
