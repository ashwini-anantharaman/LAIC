// The minimum full-game capability set (Knowledge Rework spec §3, from the
// owner's PDF). A player is `valid` only when every category is satisfied by
// an applicable item or an explicit fallback in its effective item set.
//
// The PDF explicitly blesses "always pass, lowest card" as minimally
// complete, so each phase's fallback item satisfies that phase's categories —
// EXCEPT signals, where the PDF demands a policy or an explicit "no signals"
// agreement (absence is not a policy).

import type { KnowledgePhase } from "./model";

export interface CapabilityCategory {
  categoryId: string;
  name: string;
  phase: KnowledgePhase;
  /** Which fallback phase covers this category when no rule speaks to it. */
  fallbackPhase?: "auction" | "opening_lead" | "card_play";
}

export const CAPABILITY_CATEGORIES: CapabilityCategory[] = [
  // Auction
  { categoryId: "auction.opening", name: "Opening bid policy", phase: "auction", fallbackPhase: "auction" },
  { categoryId: "auction.pass", name: "Pass policy", phase: "auction", fallbackPhase: "auction" },
  { categoryId: "auction.responses_suit", name: "Responses to suit openings", phase: "auction", fallbackPhase: "auction" },
  { categoryId: "auction.responses_nt", name: "Responses to notrump openings", phase: "auction", fallbackPhase: "auction" },
  { categoryId: "auction.opener_rebids", name: "Opener rebids", phase: "auction", fallbackPhase: "auction" },
  { categoryId: "auction.responder_rebids", name: "Responder rebids", phase: "auction", fallbackPhase: "auction" },
  { categoryId: "auction.competitive", name: "Competitive auction fallback", phase: "auction", fallbackPhase: "auction" },
  { categoryId: "auction.doubles", name: "Doubles/redoubles policy", phase: "auction", fallbackPhase: "auction" },
  { categoryId: "auction.preempts", name: "Preempt handling", phase: "auction", fallbackPhase: "auction" },
  // Opening lead
  { categoryId: "lead.policy", name: "Opening lead policy", phase: "opening_lead", fallbackPhase: "opening_lead" },
  // Declarer play
  { categoryId: "declarer.legal_card", name: "Choose legal card / follow suit", phase: "declarer_play", fallbackPhase: "card_play" },
  { categoryId: "declarer.cash_winners", name: "Cash winners", phase: "declarer_play", fallbackPhase: "card_play" },
  { categoryId: "declarer.fallback", name: "Safe declarer fallback", phase: "declarer_play", fallbackPhase: "card_play" },
  // Defense
  { categoryId: "defense.second_hand", name: "Second-hand policy", phase: "defense", fallbackPhase: "card_play" },
  { categoryId: "defense.third_hand", name: "Third-hand policy", phase: "defense", fallbackPhase: "card_play" },
  { categoryId: "defense.follow_discard", name: "Follow-suit & discard policy", phase: "defense", fallbackPhase: "card_play" },
  // The one category a fallback can never satisfy: a signal POLICY is
  // required, even if that policy is an explicit "no signals".
  { categoryId: "defense.signals", name: "Signal policy (or explicit none)", phase: "defense" },
];

export const CATEGORY_BY_ID = new Map(
  CAPABILITY_CATEGORIES.map((c) => [c.categoryId, c]),
);
