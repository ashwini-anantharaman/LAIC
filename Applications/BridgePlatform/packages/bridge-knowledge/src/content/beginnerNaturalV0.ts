// Beginner Natural v0 — the first real knowledge-base content, hand-authored
// through the pipeline (execution plan Phase 3 task 5).
//
// HONESTY NOTES
// - Sources are real published documents with working URLs (the ACBL SAYC
//   System Booklet PDF and the WBF Laws of Duplicate Bridge 2017 PDF).
//   Citations carry page/section anchors verified against those PDFs on
//   2026-07-09 (gap_bn_citation_verification records the verification).
// - Teaching-level simplifications are EXPERT DECISIONS with their own items
//   and gap entries — never silently blended into source claims. Those cite
//   src_bn_expert_notes, the workstream's own decision record: the decisions
//   are OURS, and pinning them on an external source would be false
//   provenance. Fellows ratify or overturn them by editing the items.

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
    title: "ACBL SAYC System Booklet (Revised January 2006, SP3 #170358)",
    sourceType: "standard_doc",
    systemFamily: "SAYC",
    rightsStatus: "public_reference",
    uploadedBy: AUTHOR,
    uploadedAt: NOW,
    status: "registered",
    locator:
      "https://web2.acbl.org/documentlibrary/play/SP3%20(bk)%20single%20pages.pdf",
    notes:
      "The ACBL's published SAYC system booklet (8-page PDF). Baseline reference for natural/SAYC agreements; Beginner Natural v0 simplifies from it via explicit expert decisions. Page anchors in citations refer to this PDF's printed page numbers.",
  },
  {
    sourceId: "src_laws_duplicate",
    title: "Laws of Duplicate Bridge 2017 (World Bridge Federation)",
    sourceType: "standard_doc",
    rightsStatus: "public_reference",
    uploadedBy: AUTHOR,
    uploadedAt: NOW,
    status: "registered",
    locator:
      "https://www.worldbridge.org/wp-content/uploads/2017/03/2017LawsofDuplicateBridge-nohighlights.pdf",
    notes:
      "Official WBF PDF (overview page: https://www.worldbridge.org/regulations/2017-laws-of-duplicate-bridge/). Cited for game mechanics implemented in the engine's predicate/legality layer (legal calls, follow suit, trick winner).",
  },
  {
    sourceId: "src_bn_expert_notes",
    title: "Bridge workstream teaching decisions — Beginner Natural",
    sourceType: "expert_notes",
    systemFamily: "natural",
    rightsStatus: "owned",
    uploadedBy: AUTHOR,
    uploadedAt: NOW,
    status: "registered",
    locator: "this repository — the expert_decision items themselves are the record",
    notes:
      "Internal decision record for deliberate teaching simplifications (e.g. HCP-only ranges, equal-minors 1C, crude v0 play rules). These decisions are the workstream's own — citing an external document for them would be false provenance. Underlying bridge facts cite the published sources; fellows ratify or overturn decisions by editing the items.",
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
      "v0 citations were originally paraphrases from developer knowledge without locators. Resolved: sources now carry working URLs to the published PDFs, and every citation was checked against the ACBL SAYC booklet (Rev. 1/06) and given a page/section anchor. One real discrepancy was found and fixed: the 1NT response range is 6-9 per the booklet (p.3), not the 6-10 originally written.",
    detectedFrom: ["src_sayc_booklet", "src_laws_duplicate"],
    severity: "important",
    resolutionStatus: "resolved",
    expertResolution:
      "Verified against the published PDFs on 2026-07-09; citations updated to page/section anchors; 1NT response corrected to 6-9.",
    resolvedBy: AUTHOR,
    resolvedAt: "2026-07-09T00:00:00.000Z",
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

/** Citation into the ACBL SAYC booklet PDF, anchored to a printed page/section. */
const sayc = (ref: string, passage: string): Citation => ({
  sourceId: "src_sayc_booklet",
  passage: `SAYC booklet ${ref}: ${passage}`,
});
const laws = (ref: string, passage: string): Citation => ({
  sourceId: "src_laws_duplicate",
  passage: `Laws of Duplicate Bridge 2017, ${ref}: ${passage}`,
});
const expertNote = (passage: string): Citation => ({
  sourceId: "src_bn_expert_notes",
  passage,
});

const PENDING = "Citations verified against the published PDFs (see gap_bn_citation_verification); fellows adjust by editing this item.";

type ItemSeed = Omit<
  BridgeReadableKnowledgeItem,
  "version" | "createdBy" | "createdAt" | "status" | "systemFamily"
> & { systemFamily?: BridgeReadableKnowledgeItem["systemFamily"] };

const item = (seed: ItemSeed): BridgeReadableKnowledgeItem => ({
  systemFamily: "natural",
  ...seed,
  status: "active",
  version: "1",
  createdBy: AUTHOR,
  createdAt: NOW,
  reviewerNotes: seed.reviewerNotes ? `${seed.reviewerNotes} ${PENDING}` : PENDING,
});

const bidRule = (rule: BidRulePayload) => ({ rule });
const playRule = (rule: PlayRulePayload) => ({ rule });

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export const ITEMS: BridgeReadableKnowledgeItem[] = [
  // ---- expert decisions ---------------------------------------------------
  item({
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
  item({
    itemId: "ed_bn_hcp_only",
    itemType: "expert_decision",
    title: "v0 uses HCP-only ranges",
    humanReadableRule:
      "SAYC evaluates hands in total points (HCP + length); its opener-rebid ranges start at a 13–15 point minimum, i.e. openings begin around 13 total points. v0 uses HCP only with a 12-HCP opening threshold — beginners learn HCP first, and 12 HCP approximates 13 total points. Distribution points return at Level 2.",
    structuredFields: {},
    sourceIds: ["src_bn_expert_notes"],
    citations: [
      expertNote("HCP-only ranges and the 12-HCP threshold are Level-1 simplification decisions."),
      sayc("p.3, opener's rebids", "\"Rebids with a minimum hand (13–15 points)\" — openings are counted in total points starting around 13."),
    ],
    gapIds: [],
  }),
  item({
    itemId: "ed_bn_equal_minors",
    itemType: "expert_decision",
    title: "Equal-length minors open 1♣",
    humanReadableRule:
      "With minors of equal length, open 1♣. (SAYC: 3-3 opens 1♣ but 4-4 opens 1♦ — v0 accepts the deviation for one teachable rule.)",
    structuredFields: {},
    sourceIds: ["src_bn_expert_notes"],
    citations: [
      expertNote("One-rule simplification accepted for Level 1 (deviates from SAYC in the 4-4 case)."),
      sayc("p.1, General Approach", "\"Normally open 1D with 4–4 in the minors. Normally open 1C with 3–3 in the minors.\""),
    ],
    gapIds: ["gap_bn_equal_minors"],
  }),

  // ---- system + settings --------------------------------------------------
  item({
    itemId: "ki_bn_system",
    itemType: "system",
    title: "Beginner Natural (Level 1) system definition",
    humanReadableRule:
      "A five-card-major natural system reduced to Level-1 scope (see ed_bn_scope). Intended learner level: new/beginner. Package: bridge_system_beginner_natural.",
    structuredFields: { packageId: "bridge_system_beginner_natural" },
    sourceIds: ["src_sayc_booklet", "src_bn_expert_notes"],
    citations: [sayc("p.1, General Approach", "\"Normally open five-card majors in all seats.\"")],
    relatedItemIds: ["ed_bn_scope"],
    gapIds: [],
  }),
  item({
    itemId: "ki_bn_setting_1nt_response",
    itemType: "setting_definition",
    title: "Setting: 1NT response to a suit opening",
    humanReadableRule:
      "Toggle whether the 1NT response (6–9 HCP catch-all over partner's suit opening) is part of the system. Default on.",
    structuredFields: {
      setting: {
        key: "bn_1nt_response",
        label: "1NT response (6–9)",
        control: "toggle",
        default: true,
        module: "bn_responses",
        exclusive_group: null,
        depends_on: null,
        skill_level: "Beginner",
        coach_supported: true,
        binds_to: "convention_rules",
        aliases: [],
        description: "Respond 1NT with 6–9 HCP when no raise or new suit at the one level is available.",
        origin: "SAYC",
      },
    },
    sourceIds: ["src_sayc_booklet"],
    citations: [sayc("p.3, responses to 1H/1S", "\"1NT = 6–9 points, denies four spades or three hearts. NOT forcing.\"")],
    gapIds: [],
  }),

  // §11.3: presets are content — explicit value maps, never just labels.
  item({
    itemId: "ki_bn_preset_default",
    itemType: "configuration_preset",
    title: "Preset: Beginner Natural (standard)",
    humanReadableRule:
      "The standard Beginner Natural configuration: every Level-1 agreement on, exactly the package defaults.",
    structuredFields: {
      preset: {
        presetId: "bn_default",
        name: "Beginner Natural (standard)",
        description: "Package defaults: all Level-1 agreements on.",
        values: {},
      },
    },
    sourceIds: ["src_bn_expert_notes"],
    citations: [
      {
        sourceId: "src_bn_expert_notes",
        passage: "Fellow decision: the teaching default is the full Level-1 agreement set.",
      },
    ],
    gapIds: [],
  }),
  item({
    itemId: "ki_bn_preset_no_1nt",
    itemType: "configuration_preset",
    title: "Preset: Beginner Natural without the 1NT response",
    humanReadableRule:
      "Beginner Natural with the 6–9 1NT response switched off — weak responding hands pass instead. For groups introducing responses one agreement at a time.",
    structuredFields: {
      preset: {
        presetId: "bn_no_1nt",
        name: "Beginner Natural — without the 1NT response",
        description: "The 6–9 1NT response is off; weak responding hands pass.",
        values: { bn_1nt_response: false },
      },
    },
    sourceIds: ["src_bn_expert_notes"],
    citations: [
      {
        sourceId: "src_bn_expert_notes",
        passage:
          "Fellow decision: staged introduction — the 1NT response is the first agreement coaches may defer.",
      },
    ],
    gapIds: [],
  }),

  item({
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
  item({
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
      sayc("p.1, General Approach", "\"Normally open five-card majors in all seats. Open the higher of long suits of equal length: 5–5 or 6–6.\""),
    ],
    relatedItemIds: ["ed_bn_hcp_only"],
    relatedSkillIds: ["sk_hand_evaluation", "sk_opening_bid_selection"],
    relatedConceptIds: ["bn_opening_bids"],
    gapIds: [],
  }),
  item({
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
    citations: [
      sayc("p.5, responses to 1C/1D", "\"A 1D opener suggests a four-card or longer suit, since 1C is preferred on hands where a three-card minor suit must be opened.\""),
      sayc("p.1, General Approach", "1D with 4–4 in the minors, 1C with 3–3 (v0 deviates in the 4–4 case — see ed_bn_equal_minors)."),
    ],
    relatedItemIds: ["ed_bn_hcp_only", "ed_bn_equal_minors"],
    relatedSkillIds: ["sk_hand_evaluation", "sk_opening_bid_selection", "sk_minor_suit_handling"],
    relatedConceptIds: ["bn_opening_bids"],
    gapIds: ["gap_bn_equal_minors"],
  }),
  item({
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
    citations: [sayc("p.3, opener's rebids", "opening strength starts around 13 total points (\"minimum hand (13–15 points)\") — hands below it pass.")],
    relatedItemIds: ["ed_bn_hcp_only"],
    relatedSkillIds: ["sk_hand_evaluation", "sk_opening_bid_selection"],
    relatedConceptIds: ["bn_opening_bids"],
    gapIds: [],
  }),
  item({
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
    citations: [sayc("p.3, responses to 1H/1S", "\"2H = three-card or longer heart support; 6–10 dummy points.\"")],
    relatedSkillIds: ["sk_response_selection", "sk_major_suit_raises"],
    relatedConceptIds: ["bn_responses"],
    gapIds: [],
  }),
  item({
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
      sayc("p.3, responses to 1H/1S", "\"1S = at least four spades, 6 or more points.\""),
      sayc("p.5, responses to 1C/1D", "\"Bidding at the one level is up-the-line in principle.\""),
      expertNote("v0 deviates from up-the-line: candidates are ordered longest-first, cheaper suit on ties (refinement deferred)."),
    ],
    relatedSkillIds: ["sk_response_selection"],
    relatedConceptIds: ["bn_responses"],
    gapIds: [],
  }),
  item({
    itemId: "ki_bn_1nt_response",
    itemType: "bidding_rule",
    title: "1NT response (6–9 HCP catch-all)",
    humanReadableRule:
      "Over partner's suit opening, with 6–9 HCP and neither a raise nor a one-level new suit available, respond 1NT.",
    structuredFields: bidRule({
      ruleId: "bn_1nt_response",
      title: "1NT response (6–9 HCP catch-all)",
      priority: 30,
      settingGates: [{ key: "bn_1nt_response" }],
      auctionContext: { role: "response", partnerLastBidRegex: "^1[CDHS]$" },
      handConditions: { predicate: "hcpRange", params: { min: 6, max: 9 } },
      action: { kind: "call", call: "1N" },
    }),
    sourceIds: ["src_sayc_booklet"],
    citations: [sayc("p.3, responses to 1H/1S", "\"1NT = 6–9 points, denies four spades or three hearts. NOT forcing.\"")],
    relatedSkillIds: ["sk_response_selection", "sk_notrump_ranges"],
    relatedConceptIds: ["bn_responses"],
    gapIds: [],
  }),
  item({
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
    citations: [sayc("p.3, responses to 1H/1S", "responses start at 6 points (e.g. \"1S = at least four spades, 6 or more points\") — with less, pass.")],
    relatedSkillIds: ["sk_hand_evaluation", "sk_response_selection"],
    relatedConceptIds: ["bn_responses"],
    gapIds: [],
  }),
  item({
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
  item({
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
    sourceIds: ["src_sayc_booklet", "src_bn_expert_notes"],
    citations: [
      sayc("p.8, Defensive Leads and Signals", "\"From four cards or longer lead fourth best\" — leading from length is standard; v0 simplifies to the TOP card."),
      expertNote("Top-of-longest is a Level-1 simplification; fourth-best and honor-sequence leads are deferred."),
    ],
    relatedSkillIds: ["sk_opening_leads"],
    relatedConceptIds: ["bn_opening_leads"],
    gapIds: ["gap_bn_play_technique"],
  }),
  item({
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
    sourceIds: ["src_laws_duplicate", "src_bn_expert_notes"],
    citations: [
      laws("Law 44C", "\"In playing to a trick, each player must follow suit if possible.\" Which card to follow with is agreement, not law."),
      expertNote("Lowest-card follow/discard is a Level-1 simplification; third-hand-high and win-cheaply are deferred."),
    ],
    relatedSkillIds: ["sk_following_suit"],
    relatedConceptIds: ["bn_declarer_basics"],
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
