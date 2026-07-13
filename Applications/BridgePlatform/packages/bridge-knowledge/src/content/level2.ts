// Beginner Natural Level 2 slice: the 1NT opening returns (it was excluded at
// Level 1 by ed_bn_scope). Same honesty posture as v0: citations anchor to
// the published ACBL SAYC booklet PDF (see src_sayc_booklet's locator);
// responses to 1NT are an explicit deferred gap (the no-agreement rule
// covers them, honestly).

import type { BridgeKnowledgeGap, BridgeReadableKnowledgeItem } from "../model";

const NOW = "2026-07-09T00:00:00.000Z";
const AUTHOR = "bridge_workstream_dev";
const PENDING =
  "Citations verified against the published SAYC booklet PDF (gap_bn_citation_verification); fellows adjust by editing this item.";

export const LEVEL2_GAPS: BridgeKnowledgeGap[] = [
  {
    gapId: "gap_bn2_nt_responses",
    systemFamily: "natural",
    area: "bidding",
    description:
      "Responses to the 1NT opening (Stayman, transfers, raises) are undefined at Level 2 — responder passes via the no-agreement rule. Level 3 content.",
    detectedFrom: ["ki_bn2_open_1nt"],
    severity: "important",
    resolutionStatus: "deferred",
    createdAt: NOW,
  },
];

export const LEVEL2_ITEMS: BridgeReadableKnowledgeItem[] = [
  {
    itemId: "ki_bn2_setting_nt1_range",
    systemFamily: "natural",
    itemType: "setting_definition",
    title: "Setting: 1NT opening range",
    humanReadableRule:
      "The HCP range for the 1NT opening. The rule reads this range directly (numeric-parameter binding), so changing it changes what the AI opens 1NT on.",
    structuredFields: {
      setting: {
        key: "nt1_range",
        label: "1NT opening range",
        control: "range_hcp",
        default: { low: 15, high: 17 },
        module: "bn2_nt_toolkit",
        exclusive_group: null,
        depends_on: null,
        skill_level: "Beginner",
        coach_supported: true,
        binds_to: "numeric_parameter",
        aliases: ["nt range", "1nt range"],
        description: "Low and high HCP bounds for opening 1NT.",
        min: 10,
        max: 22,
        origin: "SAYC",
      },
    },
    sourceIds: ["src_sayc_booklet"],
    citations: [
      {
        sourceId: "src_sayc_booklet",
        passage: "p.2, notrump openings: paraphrase: 1NT shows 15–17 balanced (the default bounds; the range is the partnership's to tune)",
      },
    ],
    relatedSkillIds: ["sk_notrump_ranges"],
    relatedConceptIds: ["bn2_nt_opening"],
    gapIds: [],
    status: "active",
    version: "1",
    createdBy: AUTHOR,
    createdAt: NOW,
    reviewerNotes: PENDING,
  },
  {
    itemId: "ki_bn2_setting_1nt_open",
    systemFamily: "natural",
    itemType: "setting_definition",
    title: "Setting: 1NT opening (15–17 balanced)",
    humanReadableRule:
      "Toggle whether the 15–17 balanced 1NT opening is part of the system. Default on at Level 2.",
    structuredFields: {
      setting: {
        key: "bn2_1nt_opening",
        label: "1NT opening (15–17 balanced)",
        control: "toggle",
        default: true,
        module: "bn_openings",
        exclusive_group: null,
        depends_on: null,
        skill_level: "Beginner",
        coach_supported: true,
        binds_to: "convention_rules",
        aliases: [],
        description: "Open 1NT with 15–17 HCP and balanced shape.",
        origin: "SAYC",
      },
    },
    sourceIds: ["src_sayc_booklet"],
    citations: [
      { sourceId: "src_sayc_booklet", passage: 'SAYC booklet p.1, General Approach: "Notrump openings show a balanced hand… 1NT = 15–17."' },
    ],
    gapIds: [],
    reviewerNotes: PENDING,
    status: "active",
    version: "1",
    createdBy: AUTHOR,
    createdAt: NOW,
  },
  {
    itemId: "ki_bn2_open_1nt",
    systemFamily: "natural",
    itemType: "bidding_rule",
    title: "Open 1NT with 15–17 HCP, balanced",
    humanReadableRule:
      "With 15–17 HCP and a balanced hand (4-3-3-3, 4-4-3-2, or 5-3-3-2), open 1NT — even with a five-card major (v0.2 keeps SAYC's balanced-hand preference simple: 1NT ranks above the major openings).",
    structuredFields: {
      rule: {
        ruleId: "bn2_open_1nt",
        title: "Open 1NT with 15–17 HCP, balanced",
        priority: 5,
        settingGates: [{ key: "bn2_1nt_opening" }],
        auctionContext: { role: "opening" },
        handConditions: {
          all: [
            { predicate: "hcpRange", params: { min: { $setting: "nt1_range", field: "low" }, max: { $setting: "nt1_range", field: "high" } } },
            { predicate: "balanced" },
          ],
        },
        action: { kind: "call", call: "1N" },
      },
    },
    sourceIds: ["src_sayc_booklet"],
    citations: [
      { sourceId: "src_sayc_booklet", passage: 'SAYC booklet p.1, General Approach: "Notrump openings show a balanced hand and may be made with a five-card major suit or a five-card minor suit. 1NT = 15–17."' },
    ],
    relatedSkillIds: ["sk_hand_evaluation", "sk_notrump_ranges"],
    relatedConceptIds: ["bn2_nt_opening"],
    gapIds: ["gap_bn2_nt_responses"],
    reviewerNotes: PENDING,
    status: "active",
    version: "1",
    createdBy: AUTHOR,
    createdAt: NOW,
  },
  {
    itemId: "ki_bn2_scope_level2",
    systemFamily: "natural",
    itemType: "teaching_scope",
    title: "SUGGESTED Level-2 scope: dealer opens a suit or 1NT",
    humanReadableRule:
      "FELLOW-SUGGESTED DEFAULT — coaches own their teaching scopes; this only seeds the system default. Suggested Level-2 practice deals: the dealer's systemic action is any Level-2 opening (1♣/1♦/1♥/1♠/1NT) — never pass. Sets can also be generated EXCLUDING 1NT-best hands via the reject filter when drilling suit openings specifically.",
    structuredFields: {
      scope: {
        scopeId: "bn_level2",
        levelBand: "beginner",
        evaluatorFilter: {
          seats: "dealer",
          requireSystemicActionIn: ["1C", "1D", "1H", "1S", "1N"],
        },
        targetConceptIds: ["bn_opening_bids", "bn2_nt_opening"],
      },
    },
    sourceIds: ["src_bn_expert_notes"],
    citations: [{ sourceId: "src_bn_expert_notes", passage: "Level-2 dealing constraint drafted for fellow ratification." }],
    relatedItemIds: ["ed_bn_scope"],
    gapIds: [],
    reviewerNotes: PENDING,
    status: "active",
    version: "1",
    createdBy: AUTHOR,
    createdAt: NOW,
  },
];
