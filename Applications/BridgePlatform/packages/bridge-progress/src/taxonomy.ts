// Bridge skill taxonomy reference data (Bridge plan §13.5 — the v0 subset
// exercised by Beginner Natural). Domain-scoped: domainId is always "bridge".
// The rule->skill mapping is transitional content: skill tagging moves onto
// knowledge items with the Phase 9 registry ingestion.

export interface BridgeSkill {
  skillId: string;
  domainId: "bridge";
  category: "bidding" | "play" | "defense" | "system_familiarity";
  name: string;
  levelBand: "new" | "beginner" | "intermediate" | "advanced";
}

export const BRIDGE_SKILLS: BridgeSkill[] = [
  { skillId: "sk_hand_evaluation", domainId: "bridge", category: "bidding", name: "Hand evaluation (HCP)", levelBand: "new" },
  { skillId: "sk_opening_bid_selection", domainId: "bridge", category: "bidding", name: "Opening bid selection", levelBand: "new" },
  { skillId: "sk_response_selection", domainId: "bridge", category: "bidding", name: "Response selection", levelBand: "new" },
  { skillId: "sk_major_suit_raises", domainId: "bridge", category: "bidding", name: "Major/minor suit raises", levelBand: "new" },
  { skillId: "sk_opening_leads", domainId: "bridge", category: "defense", name: "Opening leads", levelBand: "new" },
  { skillId: "sk_following_suit", domainId: "bridge", category: "play", name: "Following suit / legal play", levelBand: "new" },
];

/** Which skills a Beginner Natural rule exercises (transitional mapping). */
export const RULE_SKILL_MAP: Record<string, string[]> = {
  bn_open_major: ["sk_hand_evaluation", "sk_opening_bid_selection"],
  bn_open_minor: ["sk_hand_evaluation", "sk_opening_bid_selection"],
  bn_open_pass: ["sk_hand_evaluation", "sk_opening_bid_selection"],
  bn_single_raise: ["sk_response_selection", "sk_major_suit_raises"],
  bn_new_suit_1level: ["sk_response_selection"],
  bn_1nt_response: ["sk_response_selection"],
  bn_response_pass: ["sk_hand_evaluation", "sk_response_selection"],
  bn_pass_otherwise: [],
  bn_lead_top_longest: ["sk_opening_leads"],
  bn_follow_low: ["sk_following_suit"],
};

export const skillsForRules = (ruleIds: string[]): string[] => [
  ...new Set(ruleIds.flatMap((r) => RULE_SKILL_MAP[r] ?? [])),
];
