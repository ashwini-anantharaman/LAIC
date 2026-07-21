// The floor: explicit fallbacks under everything. The completeness spec
// blesses "always pass, lowest card" as minimally complete — these three make
// every player carrying the Floor set able to act at any table moment.

import { item, type TemplateItem } from "../dsl";

export const FLOOR: TemplateItem[] = [
  item(
    "floor-auction-pass",
    "Auction fallback: pass",
    "When no agreement applies to the auction, pass. The floor under every convention — it guarantees the player always has a legal call.",
    "fallback_rule",
    "auction",
    { kind: "fallback", fallback: { phase: "auction", behavior: "pass" } },
    { sets: ["floor"] },
  ),
  item(
    "floor-lead-longest",
    "Lead fallback: low from longest",
    "When no lead agreement applies, lead low from the longest suit.",
    "fallback_rule",
    "opening_lead",
    { kind: "fallback", fallback: { phase: "opening_lead", behavior: "low_from_longest" } },
    { sets: ["floor"] },
  ),
  item(
    "floor-play-lowest",
    "Play fallback: lowest legal card",
    "When no play technique applies, play the lowest legal card (following suit when possible).",
    "fallback_rule",
    "declarer_play",
    { kind: "fallback", fallback: { phase: "card_play", behavior: "lowest_legal" } },
    { sets: ["floor"] },
  ),
];
