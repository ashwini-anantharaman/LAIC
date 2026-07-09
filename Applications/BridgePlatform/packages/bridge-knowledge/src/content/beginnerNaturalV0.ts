// Beginner Natural v0 — the first real knowledge-base content, hand-authored
// through the pipeline (execution plan Phase 3 task 5).
//
// HONESTY NOTES
// - Citations marked "paraphrase:" summarize the cited section from the
//   workstream developer's knowledge of the source; gap
//   `gap_bn_citation_verification` stays open until a bridge fellow verifies
//   each passage against the physical documents.
// - Approval below is the dev-world reviewer (stub user Rhea Kapoor). Every
//   item's reviewerNotes flag that bridge-fellow re-review is pending; any
//   item can be edited and regenerated (correction loop, Bridge plan §12.10
//   step 10).
// - Teaching-level simplifications are EXPERT DECISIONS with their own items
//   and gap entries — never silently blended into source claims.

import type {
  BidRulePayload,
  BridgeKnowledgeGap,
  BridgeKnowledgeSource,
  BridgeReadableKnowledgeItem,
  Citation,
  PlayRulePayload,
} from "../model";
import type { KnowledgeStoreData } from "../store";

const NOW = "2026-07-08T00:00:00.000Z";
const AUTHOR = "bridge_workstream_dev";
const REVIEWER = "user_reviewer_rhea"; // dev-world stub reviewer

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export const SOURCES: BridgeKnowledgeSource[] = [
  {
    sourceId: "src_sayc_booklet",
    title: "ACBL Standard American Yellow Card (SAYC) System Booklet",
    sourceType: "standard_doc",
    systemFamily: "SAYC",
    rightsStatus: "public_reference",
    uploadedBy: AUTHOR,
    uploadedAt: NOW,
    status: "registered",
    locator: "ACBL published SAYC pamphlet (acbl.org)",
    notes:
      "Baseline reference for natural/SAYC agreements. Beginner Natural v0 simplifies from it via explicit expert decisions.",
  },
  {
    sourceId: "src_laws_duplicate",
    title: "Laws of Duplicate Bridge 2017 (WBF)",
    sourceType: "standard_doc",
    rightsStatus: "public_reference",
    uploadedBy: AUTHOR,
    uploadedAt: NOW,
    status: "registered",
    locator: "worldbridge.org — Laws of Duplicate Bridge 2017",
    notes:
      "Cited for game mechanics implemented in the engine's predicate/legality layer (legal calls, follow suit, trick winner).",
  },
  {
    sourceId: "src_bn_expert_notes",
    title: "LAIC Bridge fellow / expert notes — Beginner Natural teaching system",
    sourceType: "expert_notes",
    systemFamily: "natural",
    rightsStatus: "owned",
    uploadedBy: AUTHOR,
    uploadedAt: NOW,
    status: "registered",
    notes:
      "Placeholder for the fellows' teaching decisions. v0 expert decisions were drafted by the workstream developer and await fellow ratification.",
  },
  {
    sourceId: "src_prototype_artifacts",
    title: "bridgebot prototype rule/configuration artifacts",
    sourceType: "code",
    rightsStatus: "owned",
    uploadedBy: AUTHOR,
    uploadedAt: NOW,
    status: "registered",
    locator: "../bridgebot (src/player, src/vendor/config/data)",
    notes:
      "Registered for Phase 9 reconciliation: each prototype rule/setting becomes a candidate item to be source-matched or rejected. Not used by Beginner Natural v0.",
  },
];

// ---------------------------------------------------------------------------
// Gap registry
// ---------------------------------------------------------------------------

export const GAPS: BridgeKnowledgeGap[] = [
  {
    gapId: "gap_bn_citation_verification",
    systemFamily: "natural",
    area: "citation",
    description:
      "All v0 citations are paraphrases from developer knowledge. A bridge fellow must verify each passage against the physical SAYC booklet / Laws and replace paraphrases with exact section references.",
    detectedFrom: ["src_sayc_booklet", "src_laws_duplicate"],
    severity: "important",
    resolutionStatus: "expert_decision_needed",
    createdAt: NOW,
  },
  {
    gapId: "gap_bn_no_nt_openings",
    systemFamily: "natural",
    area: "bidding",
    description:
      "NT openings (and Stayman/transfers) are excluded from Beginner Natural v0. This is a teaching-level decision, not missing knowledge — SAYC defines 1NT 15-17.",
    detectedFrom: ["src_sayc_booklet"],
    severity: "important",
    resolutionStatus: "resolved",
    expertResolution: "Excluded at Level 1 by expert decision ed_bn_scope; returns at Level 2.",
    resolvedBy: REVIEWER,
    resolvedAt: NOW,
    createdAt: NOW,
  },
  {
    gapId: "gap_bn_equal_minors",
    systemFamily: "natural",
    area: "bidding",
    description:
      "SAYC opens 1D with 4-4 in the minors and 1C with 3-3. v0 uses one teachable rule: with equal-length minors open 1C — deviating from SAYC in the 4-4 case.",
    detectedFrom: ["src_sayc_booklet"],
    severity: "minor",
    resolutionStatus: "resolved",
    expertResolution: "Accepted v0 simplification (ed_bn_equal_minors); revisit at Level 2.",
    resolvedBy: REVIEWER,
    resolvedAt: NOW,
    createdAt: NOW,
  },
  {
    gapId: "gap_bn_opener_rebids",
    systemFamily: "natural",
    area: "bidding",
    description:
      "Opener rebids are undefined in v0: after a raise or response, opener passes via the no-agreement rule. Auctions end early by design; rebid rules arrive with Level 2 content.",
    detectedFrom: ["ki_bn_pass_otherwise"],
    severity: "important",
    resolutionStatus: "deferred",
    createdAt: NOW,
  },
  {
    gapId: "gap_bn_competitive",
    systemFamily: "natural",
    area: "bidding",
    description:
      "Competitive actions (overcalls, doubles) are undefined in v0 — opponents stay silent via the no-agreement rule. Required before mixed-strength play.",
    detectedFrom: ["ki_bn_pass_otherwise"],
    severity: "important",
    resolutionStatus: "deferred",
    createdAt: NOW,
  },
  {
    gapId: "gap_bn_play_technique",
    systemFamily: "natural",
    area: "play",
    description:
      "v0 play is deliberately crude: top-of-longest lead and lowest-card follow. No third-hand-high, no second-hand-low, no win-cheaply, no signals. Play technique items arrive with the registry ingestion (Phase 9).",
    detectedFrom: ["ki_bn_lead_longest", "ki_bn_follow_low"],
    severity: "important",
    resolutionStatus: "deferred",
    createdAt: NOW,
  },
];

// ---------------------------------------------------------------------------
// Item helpers
// ---------------------------------------------------------------------------

const sayc = (passage: string): Citation => ({
  sourceId: "src_sayc_booklet",
  passage: `paraphrase: ${passage}`,
});
const expertNote = (passage: string): Citation => ({
  sourceId: "src_bn_expert_notes",
  passage,
});

const PENDING = "Initial v0 approval by workstream developer in the dev store; bridge-fellow re-review pending (gap_bn_citation_verification).";

type ItemSeed = Omit<
  BridgeReadableKnowledgeItem,
  "version" | "createdBy" | "createdAt" | "approvedBy" | "approvedAt" | "status" | "systemFamily"
> & { systemFamily?: BridgeReadableKnowledgeItem["systemFamily"] };

const approved = (seed: ItemSeed): BridgeReadableKnowledgeItem => ({
  systemFamily: "natural",
  ...seed,
  status: "approved",
  version: "1",
  createdBy: AUTHOR,
  createdAt: NOW,
  approvedBy: REVIEWER,
  approvedAt: NOW,
  reviewerNotes: seed.reviewerNotes ? `${seed.reviewerNotes} ${PENDING}` : PENDING,
});

const bidRule = (rule: BidRulePayload) => ({ rule });
const playRule = (rule: PlayRulePayload) => ({ rule });

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export const ITEMS: BridgeReadableKnowledgeItem[] = [
  // ---- expert decisions ---------------------------------------------------
  approved({
    itemId: "ed_bn_scope",
    itemType: "expert_decision",
    title: "Beginner Natural v0 teaching scope",
    humanReadableRule:
      "Level 1 teaches only: one-of-a-suit openings, the single raise, one-level new-suit responses, and the 1NT response. Excluded: NT openings, strong 2♣, preempts, all conventions, and all competitive actions. Where no agreement is defined, players pass.",
    structuredFields: {},
    sourceIds: ["src_bn_expert_notes"],
    citations: [expertNote("Level-1 scope decision drafted for fellow ratification.")],
    gapIds: ["gap_bn_no_nt_openings", "gap_bn_competitive", "gap_bn_opener_rebids"],
  }),
  approved({
    itemId: "ed_bn_hcp_only",
    itemType: "expert_decision",
    title: "v0 uses HCP-only ranges",
    humanReadableRule:
      "SAYC evaluates openings with total points (HCP + distribution). v0 uses HCP only — open with 12–21 HCP — because beginners learn HCP first. Distribution points return at Level 2.",
    structuredFields: {},
    sourceIds: ["src_bn_expert_notes"],
    citations: [
      expertNote("HCP-only simplification for Level 1."),
      sayc("Opening bids are evaluated with high-card points plus length points; about 13 points opens the bidding."),
    ],
    gapIds: [],
  }),
  approved({
    itemId: "ed_bn_equal_minors",
    itemType: "expert_decision",
    title: "Equal-length minors open 1♣",
    humanReadableRule:
      "With minors of equal length, open 1♣. (SAYC: 3-3 opens 1♣ but 4-4 opens 1♦ — v0 accepts the deviation for one teachable rule.)",
    structuredFields: {},
    sourceIds: ["src_bn_expert_notes"],
    citations: [
      expertNote("One-rule simplification accepted for Level 1."),
      sayc("With no five-card major, open the longer minor; open 1C with 3-3, 1D with 4-4 in the minors."),
    ],
    gapIds: ["gap_bn_equal_minors"],
  }),

  // ---- system + settings --------------------------------------------------
  approved({
    itemId: "ki_bn_system",
    itemType: "system",
    title: "Beginner Natural (Level 1) system definition",
    humanReadableRule:
      "A five-card-major natural system reduced to Level-1 scope (see ed_bn_scope). Intended learner level: new/beginner. Package: bridge_system_beginner_natural.",
    structuredFields: { packageId: "bridge_system_beginner_natural" },
    sourceIds: ["src_sayc_booklet", "src_bn_expert_notes"],
    citations: [sayc("SAYC is a five-card major system.")],
    relatedItemIds: ["ed_bn_scope"],
    gapIds: [],
  }),
  approved({
    itemId: "ki_bn_setting_1nt_response",
    itemType: "setting_definition",
    title: "Setting: 1NT response to a suit opening",
    humanReadableRule:
      "Toggle whether the 1NT response (6–10 HCP catch-all over partner's suit opening) is part of the system. Default on.",
    structuredFields: {
      setting: {
        key: "bn_1nt_response",
        label: "1NT response (6–10)",
        control: "toggle",
        default: true,
        module: "bn_responses",
        exclusive_group: null,
        depends_on: null,
        skill_level: "Beginner",
        coach_supported: true,
        binds_to: "convention_rules",
        aliases: [],
        description: "Respond 1NT with 6–10 HCP when no raise or new suit at the one level is available.",
        origin: "SAYC",
      },
    },
    sourceIds: ["src_sayc_booklet"],
    citations: [sayc("A 1NT response to a suit opening shows 6–10 points.")],
    gapIds: [],
  }),

  approved({
    itemId: "ki_bn_scope_level1",
    itemType: "teaching_scope",
    title: "SUGGESTED Level-1 scope: dealer holds a one-of-a-suit opening",
    humanReadableRule:
      "FELLOW-SUGGESTED DEFAULT — there is no objective Level 1: coaches own their teaching scopes and set levels per their judgment (this item only seeds the system-default scope record). Suggested Level-1 practice deals are constrained so the dealer's systemic action is a one-of-a-suit opening (1\u2663/1\u2666/1\u2665/1\u2660) \u2014 never pass, and never an action outside Level-1 scope (no NT openings by system definition; enforced by evaluator filter so it stays true even when later systems add NT openings). Learners therefore always practice opening or responding.",
    structuredFields: {
      scope: {
        scopeId: "bn_level1",
        levelBand: "new",
        evaluatorFilter: {
          seats: "dealer",
          requireSystemicActionIn: ["1C", "1D", "1H", "1S"],
        },
        targetConceptIds: ["bn_opening_bids", "bn_responses"],
      },
    },
    sourceIds: ["src_bn_expert_notes"],
    citations: [expertNote("Level-1 dealing constraint drafted for fellow ratification.")],
    relatedItemIds: ["ed_bn_scope"],
    gapIds: [],
  }),

  // ---- bidding rules -------------------------------------------------------
  approved({
    itemId: "ki_bn_open_major",
    itemType: "bidding_rule",
    title: "Open the longest major (12–21 HCP, 5+ cards)",
    humanReadableRule:
      "With 12–21 HCP and a five-card or longer major, open one of your longest major. With two five-card majors, open the higher-ranking (spades).",
    structuredFields: bidRule({
      ruleId: "bn_open_major",
      title: "Open the longest major (12–21 HCP, 5+ cards)",
      priority: 10,
      settingGates: [],
      auctionContext: { role: "opening" },
      handConditions: {
        all: [
          { predicate: "hcpRange", params: { min: 12, max: 21 } },
          { predicate: "longestAmong", params: { among: "majors", min: 5 } },
        ],
      },
      action: { kind: "openLongest", among: "majors", level: 1, tieBreak: "higher" },
    }),
    sourceIds: ["src_sayc_booklet", "src_bn_expert_notes"],
    citations: [
      sayc("Major-suit openings promise at least a five-card suit; with two five-card suits open the higher-ranking."),
    ],
    relatedItemIds: ["ed_bn_hcp_only"],
    gapIds: [],
  }),
  approved({
    itemId: "ki_bn_open_minor",
    itemType: "bidding_rule",
    title: "Open the longer minor (12–21 HCP, no 5-card major)",
    humanReadableRule:
      "With 12–21 HCP and no five-card major, open your longer minor; with equal-length minors open 1♣ (v0 simplification, see ed_bn_equal_minors).",
    structuredFields: bidRule({
      ruleId: "bn_open_minor",
      title: "Open the longer minor (12–21 HCP, no 5-card major)",
      priority: 20,
      settingGates: [],
      auctionContext: { role: "opening" },
      handConditions: {
        all: [
          { predicate: "hcpRange", params: { min: 12, max: 21 } },
          { not: { predicate: "longestAmong", params: { among: "majors", min: 5 } } },
        ],
      },
      action: { kind: "openLongest", among: "minors", level: 1, tieBreak: "lower" },
    }),
    sourceIds: ["src_sayc_booklet", "src_bn_expert_notes"],
    citations: [sayc("With no five-card major, open the longer minor.")],
    relatedItemIds: ["ed_bn_hcp_only", "ed_bn_equal_minors"],
    gapIds: ["gap_bn_equal_minors"],
  }),
  approved({
    itemId: "ki_bn_open_pass",
    itemType: "bidding_rule",
    title: "Pass in opening position with 0–11 HCP",
    humanReadableRule: "With fewer than 12 HCP, pass in opening position.",
    structuredFields: bidRule({
      ruleId: "bn_open_pass",
      title: "Pass in opening position with 0–11 HCP",
      priority: 30,
      settingGates: [],
      auctionContext: { role: "opening" },
      handConditions: { predicate: "hcpRange", params: { min: 0, max: 11 } },
      action: { kind: "pass" },
    }),
    sourceIds: ["src_sayc_booklet", "src_bn_expert_notes"],
    citations: [sayc("Hands below opening strength pass.")],
    relatedItemIds: ["ed_bn_hcp_only"],
    gapIds: [],
  }),
  approved({
    itemId: "ki_bn_raise_partner",
    itemType: "bidding_rule",
    title: "Single raise of partner's suit opening (6–10 HCP, 3+ support)",
    humanReadableRule:
      "Over partner's one-of-a-suit opening, raise to the two level with 6–10 HCP and at least three-card support.",
    structuredFields: bidRule({
      ruleId: "bn_single_raise",
      title: "Single raise of partner's suit opening (6–10 HCP, 3+ support)",
      priority: 10,
      settingGates: [],
      auctionContext: { role: "response", partnerLastBidRegex: "^1[CDHS]$" },
      handConditions: {
        all: [
          { predicate: "hcpRange", params: { min: 6, max: 10 } },
          { predicate: "supportForPartner", params: { min: 3 } },
        ],
      },
      action: { kind: "raisePartner", toLevel: 2 },
    }),
    sourceIds: ["src_sayc_booklet"],
    citations: [sayc("A single raise shows 6–10 points and adequate trump support (three cards for a major).")],
    gapIds: [],
  }),
  approved({
    itemId: "ki_bn_new_suit",
    itemType: "bidding_rule",
    title: "New suit at the one level (6+ HCP, 4+ cards)",
    humanReadableRule:
      "Without a raise available, respond in a new suit at the one level with 6 or more HCP and at least four cards. Bid the longest such suit; with equal lengths bid the cheaper.",
    structuredFields: bidRule({
      ruleId: "bn_new_suit_1level",
      title: "New suit at the one level (6+ HCP, 4+ cards)",
      priority: 20,
      settingGates: [],
      auctionContext: { role: "response", partnerLastBidRegex: "^1[CDHS]$" },
      handConditions: { predicate: "hcpRange", params: { min: 6, max: 40 } },
      action: { kind: "newSuitAtLevel", level: 1, minLength: 4 },
    }),
    sourceIds: ["src_sayc_booklet", "src_bn_expert_notes"],
    citations: [
      sayc("A new suit at the one level shows 6+ points and four or more cards."),
      expertNote("v0 orders candidates longest-first, cheaper suit on ties (up-the-line refinement deferred)."),
    ],
    gapIds: [],
  }),
  approved({
    itemId: "ki_bn_1nt_response",
    itemType: "bidding_rule",
    title: "1NT response (6–10 HCP catch-all)",
    humanReadableRule:
      "Over partner's suit opening, with 6–10 HCP and neither a raise nor a one-level new suit available, respond 1NT.",
    structuredFields: bidRule({
      ruleId: "bn_1nt_response",
      title: "1NT response (6–10 HCP catch-all)",
      priority: 30,
      settingGates: [{ key: "bn_1nt_response" }],
      auctionContext: { role: "response", partnerLastBidRegex: "^1[CDHS]$" },
      handConditions: { predicate: "hcpRange", params: { min: 6, max: 10 } },
      action: { kind: "call", call: "1N" },
    }),
    sourceIds: ["src_sayc_booklet"],
    citations: [sayc("A 1NT response to a suit opening shows 6–10 points.")],
    gapIds: [],
  }),
  approved({
    itemId: "ki_bn_response_pass",
    itemType: "bidding_rule",
    title: "Pass partner's opening with 0–5 HCP",
    humanReadableRule: "With 0–5 HCP, pass partner's opening bid.",
    structuredFields: bidRule({
      ruleId: "bn_response_pass",
      title: "Pass partner's opening with 0–5 HCP",
      priority: 40,
      settingGates: [],
      auctionContext: { role: "response" },
      handConditions: { predicate: "hcpRange", params: { min: 0, max: 5 } },
      action: { kind: "pass" },
    }),
    sourceIds: ["src_sayc_booklet"],
    citations: [sayc("Responder needs about 6 points to respond.")],
    gapIds: [],
  }),
  approved({
    itemId: "ki_bn_pass_otherwise",
    itemType: "bidding_rule",
    title: "No agreement defined: pass",
    humanReadableRule:
      "Beginner Natural v0 defines no agreements outside opening and first-response positions (no opener rebids, no competitive actions). Where no other rule applies, pass. This is an explicit teaching-scope agreement — not a fallback.",
    structuredFields: bidRule({
      ruleId: "bn_pass_otherwise",
      title: "No agreement defined: pass",
      priority: 900,
      noAgreement: true,
      settingGates: [],
      auctionContext: { role: "any" },
      handConditions: { predicate: "hcpRange", params: { min: 0, max: 40 } },
      action: { kind: "pass" },
    }),
    sourceIds: ["src_bn_expert_notes"],
    citations: [expertNote("Level-1 scope: silent outside defined positions (ed_bn_scope).")],
    relatedItemIds: ["ed_bn_scope"],
    gapIds: ["gap_bn_opener_rebids", "gap_bn_competitive"],
  }),

  // ---- play rules ----------------------------------------------------------
  approved({
    itemId: "ki_bn_lead_longest",
    itemType: "lead_rule",
    title: "Lead from your longest suit (v0: top card)",
    humanReadableRule:
      "On lead, lead from your longest suit. v0 leads the top card — a deliberate simplification; honor-sequence and fourth-best refinements are deferred (gap_bn_play_technique).",
    structuredFields: playRule({
      ruleId: "bn_lead_top_longest",
      title: "Lead from your longest suit (v0: top card)",
      priority: 10,
      settingGates: [],
      when: { role: "lead" },
      action: { kind: "topOfLongestSuit" },
    }),
    sourceIds: ["src_bn_expert_notes"],
    citations: [expertNote("Simplified Level-1 lead rule; refinement deferred.")],
    gapIds: ["gap_bn_play_technique"],
  }),
  approved({
    itemId: "ki_bn_follow_low",
    itemType: "play_rule",
    title: "Follow suit with your lowest card (v0)",
    humanReadableRule:
      "When not on lead, follow suit (or discard) with your lowest card. Deliberately crude — third-hand-high and win-cheaply are deferred (gap_bn_play_technique).",
    structuredFields: playRule({
      ruleId: "bn_follow_low",
      title: "Follow suit with your lowest card (v0)",
      priority: 20,
      settingGates: [],
      when: { role: "follow" },
      action: { kind: "lowestFollowing" },
    }),
    sourceIds: ["src_bn_expert_notes"],
    citations: [expertNote("Simplified Level-1 follow rule; refinement deferred.")],
    gapIds: ["gap_bn_play_technique"],
  }),
];

/** Seed for dev stores and tests. */
export const BEGINNER_NATURAL_V0_SEED: Partial<KnowledgeStoreData> = {
  sources: SOURCES,
  items: ITEMS,
  gaps: GAPS,
};

export const BEGINNER_NATURAL_PACKAGE_ID = "bridge_system_beginner_natural";
