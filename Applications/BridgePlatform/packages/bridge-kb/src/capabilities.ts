// The minimum full-game capability set (Knowledge Rework spec §3, from the
// owner's PDF). A player is `valid` only when every category is satisfied by
// at least one applicable item or an explicit fallback in its effective item
// set. Categories are matched by phase + a structural predicate over the
// item's payload (Stage B implements the checker).

import type { KnowledgePhase } from "./model";

export interface CapabilityCategory {
  categoryId: string;
  name: string;
  phase: KnowledgePhase;
  /** Satisfiable by a phase fallback item alone. */
  fallbackSatisfies: boolean;
}

export const CAPABILITY_CATEGORIES: CapabilityCategory[] = [
  // Auction
  { categoryId: "auction.opening", name: "Opening bid policy", phase: "auction", fallbackSatisfies: false },
  { categoryId: "auction.pass", name: "Pass policy", phase: "auction", fallbackSatisfies: true },
  { categoryId: "auction.responses_suit", name: "Responses to suit openings", phase: "auction", fallbackSatisfies: true },
  { categoryId: "auction.responses_nt", name: "Responses to notrump openings", phase: "auction", fallbackSatisfies: true },
  { categoryId: "auction.opener_rebids", name: "Opener rebids", phase: "auction", fallbackSatisfies: true },
  { categoryId: "auction.responder_rebids", name: "Responder rebids", phase: "auction", fallbackSatisfies: true },
  { categoryId: "auction.competitive", name: "Competitive auction fallback", phase: "auction", fallbackSatisfies: true },
  { categoryId: "auction.doubles", name: "Doubles/redoubles policy", phase: "auction", fallbackSatisfies: true },
  { categoryId: "auction.preempts", name: "Preempt handling", phase: "auction", fallbackSatisfies: true },
  // Opening lead
  { categoryId: "lead.policy", name: "Opening lead policy", phase: "opening_lead", fallbackSatisfies: false },
  // Declarer play
  { categoryId: "declarer.legal_card", name: "Choose legal card / follow suit", phase: "declarer_play", fallbackSatisfies: false },
  { categoryId: "declarer.cash_winners", name: "Cash winners", phase: "declarer_play", fallbackSatisfies: true },
  { categoryId: "declarer.fallback", name: "Safe declarer fallback", phase: "declarer_play", fallbackSatisfies: false },
  // Defense
  { categoryId: "defense.second_hand", name: "Second-hand policy", phase: "defense", fallbackSatisfies: true },
  { categoryId: "defense.third_hand", name: "Third-hand policy", phase: "defense", fallbackSatisfies: true },
  { categoryId: "defense.follow_discard", name: "Follow-suit & discard policy", phase: "defense", fallbackSatisfies: false },
  { categoryId: "defense.signals", name: "Signal policy (or explicit none)", phase: "defense", fallbackSatisfies: true },
];

export const CATEGORY_BY_ID = new Map(
  CAPABILITY_CATEGORIES.map((c) => [c.categoryId, c]),
);
