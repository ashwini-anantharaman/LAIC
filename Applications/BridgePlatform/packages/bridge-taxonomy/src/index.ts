/**
 * @bridge/taxonomy
 *
 * The full Bridge skill taxonomy (Bridge plan §13.5) and the concept
 * taxonomy (§15.1) as domain-scoped reference data, mirrored to SQL in
 * db/migrations/0009_taxonomy.sql. This package stores REFERENCES only —
 * full learning-path design belongs to the Learning Platform.
 *
 * Knowledge items tag themselves with these ids (relatedSkillIds /
 * relatedConceptIds); generation copies the tags onto rule entries, so the
 * evaluator and progress layers derive skills from the session's pinned
 * package instead of any hardcoded rule→skill map.
 */

export type SkillCategory = "bidding" | "play" | "defense" | "system_familiarity";
export type LevelBand = "new" | "beginner" | "intermediate" | "advanced";

export interface BridgeSkill {
  skillId: string;
  domainId: "bridge";
  category: SkillCategory;
  name: string;
  description?: string;
  levelBand: LevelBand;
}

export interface BridgeConcept {
  conceptId: string;
  domainId: "bridge";
  name: string;
  description?: string;
  /** Skills this teaching concept primarily exercises. */
  relatedSkillIds: string[];
}

const sk = (
  skillId: string,
  category: SkillCategory,
  name: string,
  levelBand: LevelBand,
): BridgeSkill => ({ skillId, domainId: "bridge", category, name, levelBand });

/** Full §13.5 taxonomy. Ids are stable API — never renumber, only add. */
export const BRIDGE_SKILLS: BridgeSkill[] = [
  // Bidding
  sk("sk_hand_evaluation", "bidding", "Hand evaluation (HCP)", "new"),
  sk("sk_opening_bid_selection", "bidding", "Opening bid selection", "new"),
  sk("sk_response_selection", "bidding", "Response selection", "new"),
  sk("sk_opener_rebid", "bidding", "Opener rebid", "beginner"),
  sk("sk_responder_rebid", "bidding", "Responder rebid", "beginner"),
  sk("sk_notrump_ranges", "bidding", "Notrump ranges", "beginner"),
  sk("sk_major_suit_raises", "bidding", "Major suit raises", "new"),
  sk("sk_minor_suit_handling", "bidding", "Minor suit handling", "beginner"),
  sk("sk_competitive_bidding", "bidding", "Competitive bidding", "intermediate"),
  sk("sk_preempts", "bidding", "Preempts", "intermediate"),
  sk("sk_slam_exploration", "bidding", "Slam exploration", "advanced"),
  sk("sk_convention_recognition", "bidding", "Convention recognition", "intermediate"),
  // Play
  sk("sk_counting_winners_losers", "play", "Counting winners/losers", "beginner"),
  sk("sk_declarer_planning", "play", "Declarer planning", "beginner"),
  sk("sk_following_suit", "play", "Following suit / legal play", "new"),
  sk("sk_establishing_suits", "play", "Establishing suits", "intermediate"),
  sk("sk_finesses", "play", "Finesses", "intermediate"),
  sk("sk_ruffing_losers", "play", "Ruffing losers", "intermediate"),
  sk("sk_entry_management", "play", "Entry management", "advanced"),
  // Defense
  sk("sk_opening_leads", "defense", "Opening leads", "new"),
  sk("sk_second_hand_play", "defense", "Second hand play", "intermediate"),
  sk("sk_third_hand_play", "defense", "Third hand play", "intermediate"),
  sk("sk_signals", "defense", "Signals", "intermediate"),
  sk("sk_count_attitude", "defense", "Count/attitude", "intermediate"),
  sk("sk_defensive_inferences", "defense", "Defensive inferences", "advanced"),
  // System familiarity
  sk("sk_sayc_basics", "system_familiarity", "SAYC basics", "beginner"),
  sk("sk_two_over_one_basics", "system_familiarity", "2/1 basics", "intermediate"),
  sk("sk_stayman", "system_familiarity", "Stayman", "beginner"),
  sk("sk_transfers", "system_familiarity", "Transfers", "beginner"),
  sk("sk_weak_twos", "system_familiarity", "Weak twos", "intermediate"),
  sk("sk_doubles", "system_familiarity", "Doubles", "intermediate"),
  sk("sk_cue_bids", "system_familiarity", "Cue bids", "advanced"),
];

/**
 * Teaching concepts referenced by teaching scopes, boards, and knowledge
 * items (targetConceptIds / relatedConceptIds). Concepts are content topics
 * — coarser than skills; a concept exercises one or more skills.
 */
export const BRIDGE_CONCEPTS: BridgeConcept[] = [
  { conceptId: "bn_opening_bids", domainId: "bridge", name: "Opening bids (natural)", relatedSkillIds: ["sk_hand_evaluation", "sk_opening_bid_selection"] },
  { conceptId: "bn_responses", domainId: "bridge", name: "Responding to partner's opening", relatedSkillIds: ["sk_response_selection", "sk_major_suit_raises"] },
  { conceptId: "bn_opener_rebids", domainId: "bridge", name: "Opener's rebid", relatedSkillIds: ["sk_opener_rebid"] },
  { conceptId: "bn_responder_rebids", domainId: "bridge", name: "Responder's rebid", relatedSkillIds: ["sk_responder_rebid"] },
  { conceptId: "bn2_nt_opening", domainId: "bridge", name: "1NT opening and responses", relatedSkillIds: ["sk_notrump_ranges", "sk_hand_evaluation"] },
  { conceptId: "bn2_stayman", domainId: "bridge", name: "Stayman over 1NT", relatedSkillIds: ["sk_stayman", "sk_convention_recognition"] },
  { conceptId: "bn2_transfers", domainId: "bridge", name: "Jacoby transfers", relatedSkillIds: ["sk_transfers", "sk_convention_recognition"] },
  { conceptId: "bn2_weak_twos", domainId: "bridge", name: "Weak two openings", relatedSkillIds: ["sk_weak_twos", "sk_preempts"] },
  { conceptId: "bn2_overcalls", domainId: "bridge", name: "Overcalls and takeout doubles", relatedSkillIds: ["sk_competitive_bidding", "sk_doubles"] },
  { conceptId: "bn_opening_leads", domainId: "bridge", name: "Opening leads", relatedSkillIds: ["sk_opening_leads"] },
  { conceptId: "bn_declarer_basics", domainId: "bridge", name: "Declarer play basics", relatedSkillIds: ["sk_counting_winners_losers", "sk_declarer_planning", "sk_following_suit"] },
  { conceptId: "bn_defense_basics", domainId: "bridge", name: "Defense basics", relatedSkillIds: ["sk_second_hand_play", "sk_third_hand_play", "sk_signals"] },
];

const SKILL_BY_ID = new Map(BRIDGE_SKILLS.map((s) => [s.skillId, s]));
const CONCEPT_BY_ID = new Map(BRIDGE_CONCEPTS.map((c) => [c.conceptId, c]));

export const getSkill = (skillId: string): BridgeSkill | undefined => SKILL_BY_ID.get(skillId);
export const getConcept = (conceptId: string): BridgeConcept | undefined => CONCEPT_BY_ID.get(conceptId);
export const isKnownSkillId = (id: string): boolean => SKILL_BY_ID.has(id);
export const isKnownConceptId = (id: string): boolean => CONCEPT_BY_ID.has(id);

/** Display name with a graceful fallback for ids from newer content. */
export const skillName = (skillId: string): string => SKILL_BY_ID.get(skillId)?.name ?? skillId;
export const conceptName = (conceptId: string): string =>
  CONCEPT_BY_ID.get(conceptId)?.name ?? conceptId;

/** The unknown ids in a tag list (for generation warnings / scope checks). */
export const unknownSkillIds = (ids: readonly string[]): string[] =>
  ids.filter((id) => !SKILL_BY_ID.has(id));
export const unknownConceptIds = (ids: readonly string[]): string[] =>
  ids.filter((id) => !CONCEPT_BY_ID.has(id));
