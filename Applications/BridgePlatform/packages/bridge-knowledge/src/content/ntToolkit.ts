// NT toolkit + two-level openings, ported from the bridgebot prototype's
// registry into readable knowledge items (resolves gap_bn2_nt_responses).
//
// Sourcing policy (owner decision 2026-07-12): agreements that appear in the
// published ACBL SAYC booklet cite it with "paraphrase:" page anchors (no
// invented verbatim quotes); ranges/priorities/orderings that were authored
// in the prototype WITHOUT a published source cite src_claude — Claude is
// named as the source rather than leaving the judgment unattributed.
//
// Every setting here defaults OFF, so existing packages, golden boards, and
// pinned sessions are untouched; the "Beginner Natural + NT toolkit" preset
// (also content) switches the whole kit on at once.

import type {
  BridgeKnowledgeSource,
  BridgeReadableKnowledgeItem,
  Citation,
} from "../model";

const NOW = "2026-07-12T00:00:00.000Z";
const AUTHOR = "bridge_workstream_dev";

const sayc = (anchor: string, note: string): Citation => ({
  sourceId: "src_sayc_booklet",
  passage: `${anchor}: paraphrase: ${note}`,
});
const claude = (note: string): Citation => ({
  sourceId: "src_claude",
  passage: `paraphrase: ${note}`,
});

export const NT_TOOLKIT_SOURCES: BridgeKnowledgeSource[] = [
  {
    sourceId: "src_claude",
    title: "Claude (Anthropic AI) — prototype-derived agreement judgments",
    sourceType: "expert_notes",
    rightsStatus: "owned",
    uploadedBy: AUTHOR,
    uploadedAt: NOW,
    status: "registered",
    locator: "bridgebot prototype (no external publication)",
    notes:
      "Named attribution for ranges, priorities, and orderings authored by Claude in the bridgebot prototype where no published source exists. Booklet-backed agreements cite src_sayc_booklet instead; anything citing this source is an editable judgment, not published doctrine.",
  },
];

const toggle = (
  key: string,
  label: string,
  module: string,
  description: string,
  skill: "Beginner" | "Intermediate",
) => ({
  setting: {
    key,
    label,
    control: "toggle" as const,
    default: false,
    module,
    exclusive_group: null,
    depends_on: null,
    skill_level: skill,
    coach_supported: true,
    binds_to: "convention_rules" as const,
    aliases: [],
    description,
    origin: "bridgebot prototype",
  },
});

const item = (
  seed: Omit<
    BridgeReadableKnowledgeItem,
    "systemFamily" | "status" | "version" | "createdBy" | "createdAt"
  >,
): BridgeReadableKnowledgeItem => ({
  systemFamily: "natural",
  status: "active",
  version: "1",
  createdBy: AUTHOR,
  createdAt: NOW,
  ...seed,
});

export const NT_TOOLKIT_ITEMS: BridgeReadableKnowledgeItem[] = [
  // ---- settings (all default OFF) -----------------------------------------
  item({
    itemId: "ki_nt2_setting_strong_2c",
    itemType: "setting_definition",
    title: "Setting: strong 2♣ opening (22+)",
    humanReadableRule:
      "Toggle the strong, artificial 2♣ opening for hands of 22+ HCP. Off by default at this level.",
    structuredFields: toggle(
      "bn2_strong_2c",
      "Strong 2♣ opening (22+)",
      "bn2_two_level",
      "Open 2♣ with 22 or more HCP; stronger than any one-level opening.",
      "Intermediate",
    ),
    sourceIds: ["src_sayc_booklet"],
    citations: [sayc("p.5, strong artificial 2C", "2♣ is the strong, artificial opening for big hands")],
    relatedSkillIds: ["sk_opening_bid_selection", "sk_convention_recognition"],
    relatedConceptIds: ["bn_opening_bids"],
    gapIds: [],
  }),
  item({
    itemId: "ki_nt2_setting_2nt_open",
    itemType: "setting_definition",
    title: "Setting: 2NT opening (20–21 balanced)",
    humanReadableRule:
      "Toggle the natural 2NT opening showing 20–21 HCP and balanced shape.",
    structuredFields: toggle(
      "bn2_2nt_open",
      "2NT opening (20–21 balanced)",
      "bn2_two_level",
      "Open 2NT with a balanced 20–21 HCP hand.",
      "Intermediate",
    ),
    sourceIds: ["src_sayc_booklet"],
    citations: [sayc("p.2, notrump openings", "2NT shows 20–21 balanced")],
    relatedSkillIds: ["sk_notrump_ranges", "sk_opening_bid_selection"],
    relatedConceptIds: ["bn2_nt_opening"],
    gapIds: [],
  }),
  item({
    itemId: "ki_nt2_setting_weak_twos",
    itemType: "setting_definition",
    title: "Setting: weak two-bids in the majors",
    humanReadableRule:
      "Toggle weak two-bids: 2♥/2♠ openings on a good six-card suit with 5–10 HCP.",
    structuredFields: toggle(
      "bn2_weak_twos",
      "Weak twos in the majors (5–10, 6-card suit)",
      "bn2_two_level",
      "Open 2♥/2♠ preemptively with a six-card major and 5–10 HCP.",
      "Intermediate",
    ),
    sourceIds: ["src_sayc_booklet", "src_claude"],
    citations: [
      sayc("p.5, weak two-bids", "2♦/2♥/2♠ are weak two-bids on six-card suits"),
      claude("the 5–10 HCP band and majors-only restriction follow the prototype's beginner tuning"),
    ],
    relatedSkillIds: ["sk_weak_twos", "sk_preempts"],
    relatedConceptIds: ["bn2_weak_twos"],
    gapIds: [],
  }),
  item({
    itemId: "ki_nt2_setting_stayman",
    itemType: "setting_definition",
    title: "Setting: Stayman 2♣ over 1NT",
    humanReadableRule:
      "Toggle Stayman: responder's artificial 2♣ over a 1NT opening, asking opener for a four-card major.",
    structuredFields: toggle(
      "bn2_stayman",
      "Stayman 2♣ over 1NT",
      "bn2_nt_toolkit",
      "2♣ over partner's 1NT asks for a four-card major; opener answers 2♦ without one.",
      "Beginner",
    ),
    sourceIds: ["src_sayc_booklet"],
    citations: [sayc("p.3, responding to 1NT", "2♣ is Stayman, asking for a four-card major; 2♦ denies one")],
    relatedSkillIds: ["sk_stayman", "sk_convention_recognition"],
    relatedConceptIds: ["bn2_stayman"],
    gapIds: ["gap_bn2_nt_responses"],
  }),
  item({
    itemId: "ki_nt2_setting_transfers",
    itemType: "setting_definition",
    title: "Setting: Jacoby transfers over 1NT",
    humanReadableRule:
      "Toggle Jacoby transfers: over 1NT, responder's 2♦ shows hearts and 2♥ shows spades; opener completes the transfer.",
    structuredFields: toggle(
      "bn2_transfers",
      "Jacoby transfers over 1NT",
      "bn2_nt_toolkit",
      "2♦/2♥ over 1NT transfer to hearts/spades with a five-card or longer major.",
      "Beginner",
    ),
    sourceIds: ["src_sayc_booklet"],
    citations: [sayc("p.4, Jacoby transfers", "2♦ shows hearts, 2♥ shows spades; opener accepts the transfer")],
    relatedSkillIds: ["sk_transfers", "sk_convention_recognition"],
    relatedConceptIds: ["bn2_transfers"],
    gapIds: ["gap_bn2_nt_responses"],
  }),

  // ---- opening rules --------------------------------------------------------
  item({
    itemId: "ki_nt2_open_2c",
    itemType: "bidding_rule",
    title: "Open a strong 2♣ with 22+ HCP",
    humanReadableRule: "With 22 or more HCP, open a strong, artificial 2♣.",
    structuredFields: {
      rule: {
        ruleId: "bn2_open_2c_strong",
        title: "Open a strong 2♣ with 22+ HCP",
        priority: 4,
        settingGates: [{ key: "bn2_strong_2c" }],
        auctionContext: { role: "opening" },
        handConditions: { predicate: "hcpRange", params: { min: 22, max: 37 } },
        action: { kind: "call", call: "2C" },
      },
    },
    sourceIds: ["src_sayc_booklet"],
    citations: [sayc("p.5, strong artificial 2C", "22+ HCP opens 2♣ regardless of shape")],
    relatedSkillIds: ["sk_opening_bid_selection", "sk_convention_recognition"],
    relatedConceptIds: ["bn_opening_bids"],
    gapIds: [],
  }),
  item({
    itemId: "ki_nt2_open_2nt",
    itemType: "bidding_rule",
    title: "Open 2NT with 20–21 HCP, balanced",
    humanReadableRule: "With a balanced hand of 20–21 HCP, open 2NT.",
    structuredFields: {
      rule: {
        ruleId: "bn2_open_2nt",
        title: "Open 2NT with 20–21 HCP, balanced",
        priority: 5,
        settingGates: [{ key: "bn2_2nt_open" }],
        auctionContext: { role: "opening" },
        handConditions: {
          all: [
            { predicate: "hcpRange", params: { min: 20, max: 21 } },
            { predicate: "balanced", params: {} },
          ],
        },
        action: { kind: "call", call: "2N" },
      },
    },
    sourceIds: ["src_sayc_booklet"],
    citations: [sayc("p.2, notrump openings", "2NT = 20–21 balanced")],
    relatedSkillIds: ["sk_notrump_ranges", "sk_opening_bid_selection"],
    relatedConceptIds: ["bn2_nt_opening"],
    gapIds: [],
  }),
  item({
    itemId: "ki_nt2_open_weak2",
    itemType: "bidding_rule",
    title: "Weak two in a major (5–10 HCP, 6-card suit)",
    humanReadableRule:
      "With 5–10 HCP and a six-card major, open two of that major (higher-ranking with equal length).",
    structuredFields: {
      rule: {
        ruleId: "bn2_open_weak2_major",
        title: "Weak two in a major (5–10 HCP, 6-card suit)",
        priority: 8,
        settingGates: [{ key: "bn2_weak_twos" }],
        auctionContext: { role: "opening" },
        handConditions: {
          all: [
            { predicate: "hcpRange", params: { min: 5, max: 10 } },
            { predicate: "longestAmong", params: { among: "majors", min: 6 } },
          ],
        },
        action: { kind: "openLongest", among: "majors", level: 2, tieBreak: "higher" },
      },
    },
    sourceIds: ["src_sayc_booklet", "src_claude"],
    citations: [
      sayc("p.5, weak two-bids", "weak twos show a good six-card suit below opening strength"),
      claude("the exact 5–10 band and the higher-suit tiebreak follow the prototype"),
    ],
    relatedSkillIds: ["sk_weak_twos", "sk_preempts"],
    relatedConceptIds: ["bn2_weak_twos"],
    gapIds: [],
  }),

  // ---- responses to 1NT ------------------------------------------------------
  item({
    itemId: "ki_nt2_transfer_hearts",
    itemType: "bidding_rule",
    title: "Transfer to hearts: 2♦ over partner's 1NT",
    humanReadableRule:
      "Over partner's 1NT opening, bid 2♦ with five or more hearts — a Jacoby transfer.",
    structuredFields: {
      rule: {
        ruleId: "bn2_transfer_hearts",
        title: "Transfer to hearts: 2♦ over partner's 1NT",
        priority: 21,
        settingGates: [{ key: "bn2_transfers" }],
        auctionContext: { role: "response", auctionRegex: "^(P )*1N P$" },
        handConditions: { predicate: "suitLength", params: { suit: "H", min: 5 } },
        action: { kind: "call", call: "2D" },
      },
    },
    sourceIds: ["src_sayc_booklet"],
    citations: [sayc("p.4, Jacoby transfers", "2♦ over 1NT shows five or more hearts")],
    relatedSkillIds: ["sk_transfers"],
    relatedConceptIds: ["bn2_transfers"],
    gapIds: ["gap_bn2_nt_responses"],
  }),
  item({
    itemId: "ki_nt2_transfer_spades",
    itemType: "bidding_rule",
    title: "Transfer to spades: 2♥ over partner's 1NT",
    humanReadableRule:
      "Over partner's 1NT opening, bid 2♥ with five or more spades — a Jacoby transfer. With five hearts and five spades, this package transfers to hearts first.",
    structuredFields: {
      rule: {
        ruleId: "bn2_transfer_spades",
        title: "Transfer to spades: 2♥ over partner's 1NT",
        priority: 22,
        settingGates: [{ key: "bn2_transfers" }],
        auctionContext: { role: "response", auctionRegex: "^(P )*1N P$" },
        handConditions: { predicate: "suitLength", params: { suit: "S", min: 5 } },
        action: { kind: "call", call: "2H" },
      },
    },
    sourceIds: ["src_sayc_booklet", "src_claude"],
    citations: [
      sayc("p.4, Jacoby transfers", "2♥ over 1NT shows five or more spades"),
      claude("hearts-first ordering with 5-5 majors is a prototype judgment, not booklet doctrine"),
    ],
    relatedSkillIds: ["sk_transfers"],
    relatedConceptIds: ["bn2_transfers"],
    gapIds: ["gap_bn2_nt_responses"],
  }),
  item({
    itemId: "ki_nt2_stayman_ask",
    itemType: "bidding_rule",
    title: "Stayman: 2♣ over partner's 1NT with a 4-card major",
    humanReadableRule:
      "Over partner's 1NT opening, with 8+ HCP and a four-card major (and no five-card major, which transfers first), bid 2♣ to ask for a major.",
    structuredFields: {
      rule: {
        ruleId: "bn2_stayman_ask",
        title: "Stayman: 2♣ over partner's 1NT with a 4-card major",
        priority: 23,
        settingGates: [{ key: "bn2_stayman" }],
        auctionContext: { role: "response", auctionRegex: "^(P )*1N P$" },
        handConditions: {
          all: [
            { predicate: "hcpRange", params: { min: 8, max: 37 } },
            { predicate: "longestAmong", params: { among: "majors", min: 4 } },
          ],
        },
        action: { kind: "call", call: "2C" },
      },
    },
    sourceIds: ["src_sayc_booklet", "src_claude"],
    citations: [
      sayc("p.3, responding to 1NT", "2♣ Stayman asks opener for a four-card major"),
      claude("the 8+ HCP floor for the ask follows the prototype's beginner tuning"),
    ],
    relatedSkillIds: ["sk_stayman"],
    relatedConceptIds: ["bn2_stayman"],
    gapIds: ["gap_bn2_nt_responses"],
  }),

  // ---- opener's replies -------------------------------------------------------
  item({
    itemId: "ki_nt2_stayman_answer_major",
    itemType: "bidding_rule",
    title: "Answer Stayman: bid your four-card major",
    humanReadableRule:
      "After 1NT – 2♣ (Stayman), opener bids a four-card major (the longer one, higher-ranking first with equal length).",
    structuredFields: {
      rule: {
        ruleId: "bn2_stayman_answer_major",
        title: "Answer Stayman: bid your four-card major",
        priority: 15,
        settingGates: [{ key: "bn2_stayman" }],
        auctionContext: { role: "any", auctionRegex: "^(P )*1N P 2C P$" },
        handConditions: { predicate: "longestAmong", params: { among: "majors", min: 4 } },
        action: { kind: "openLongest", among: "majors", level: 2, tieBreak: "higher" },
      },
    },
    sourceIds: ["src_sayc_booklet"],
    citations: [sayc("p.3, responding to 1NT", "opener shows a four-card major over Stayman")],
    relatedSkillIds: ["sk_stayman"],
    relatedConceptIds: ["bn2_stayman"],
    gapIds: ["gap_bn2_nt_responses"],
  }),
  item({
    itemId: "ki_nt2_stayman_answer_2d",
    itemType: "bidding_rule",
    title: "Answer Stayman: 2♦ with no four-card major",
    humanReadableRule: "After 1NT – 2♣ (Stayman), opener bids 2♦ without a four-card major.",
    structuredFields: {
      rule: {
        ruleId: "bn2_stayman_answer_2d",
        title: "Answer Stayman: 2♦ with no four-card major",
        priority: 16,
        settingGates: [{ key: "bn2_stayman" }],
        auctionContext: { role: "any", auctionRegex: "^(P )*1N P 2C P$" },
        handConditions: {
          not: { predicate: "longestAmong", params: { among: "majors", min: 4 } },
        },
        action: { kind: "call", call: "2D" },
      },
    },
    sourceIds: ["src_sayc_booklet"],
    citations: [sayc("p.3, responding to 1NT", "2♦ denies a four-card major")],
    relatedSkillIds: ["sk_stayman"],
    relatedConceptIds: ["bn2_stayman"],
    gapIds: ["gap_bn2_nt_responses"],
  }),
  item({
    itemId: "ki_nt2_transfer_complete_h",
    itemType: "bidding_rule",
    title: "Complete the transfer: 2♥ after 1NT – 2♦",
    humanReadableRule: "After 1NT – 2♦ (transfer), opener completes to 2♥.",
    structuredFields: {
      rule: {
        ruleId: "bn2_transfer_complete_hearts",
        title: "Complete the transfer: 2♥ after 1NT – 2♦",
        priority: 15,
        settingGates: [{ key: "bn2_transfers" }],
        auctionContext: { role: "any", auctionRegex: "^(P )*1N P 2D P$" },
        handConditions: { predicate: "hcpRange", params: { min: 0, max: 37 } },
        action: { kind: "call", call: "2H" },
      },
    },
    sourceIds: ["src_sayc_booklet"],
    citations: [sayc("p.4, Jacoby transfers", "opener accepts the transfer by bidding the shown major")],
    relatedSkillIds: ["sk_transfers"],
    relatedConceptIds: ["bn2_transfers"],
    gapIds: ["gap_bn2_nt_responses"],
  }),
  item({
    itemId: "ki_nt2_transfer_complete_s",
    itemType: "bidding_rule",
    title: "Complete the transfer: 2♠ after 1NT – 2♥",
    humanReadableRule: "After 1NT – 2♥ (transfer), opener completes to 2♠.",
    structuredFields: {
      rule: {
        ruleId: "bn2_transfer_complete_spades",
        title: "Complete the transfer: 2♠ after 1NT – 2♥",
        priority: 15,
        settingGates: [{ key: "bn2_transfers" }],
        auctionContext: { role: "any", auctionRegex: "^(P )*1N P 2H P$" },
        handConditions: { predicate: "hcpRange", params: { min: 0, max: 37 } },
        action: { kind: "call", call: "2S" },
      },
    },
    sourceIds: ["src_sayc_booklet"],
    citations: [sayc("p.4, Jacoby transfers", "opener accepts the transfer by bidding the shown major")],
    relatedSkillIds: ["sk_transfers"],
    relatedConceptIds: ["bn2_transfers"],
    gapIds: ["gap_bn2_nt_responses"],
  }),

  // ---- the preset that turns the kit on ---------------------------------------
  item({
    itemId: "ki_nt2_preset_toolkit",
    itemType: "configuration_preset",
    title: "Preset: Beginner Natural + NT toolkit",
    humanReadableRule:
      "Beginner Natural with the ported prototype kit switched on: strong 2♣, 2NT opening, weak twos, Stayman, and Jacoby transfers.",
    structuredFields: {
      preset: {
        presetId: "bn_nt_toolkit",
        name: "Beginner Natural + NT toolkit",
        description: "Level-1 agreements plus 2♣/2NT/weak twos and the 1NT response kit.",
        values: {
          bn2_strong_2c: true,
          bn2_2nt_open: true,
          bn2_weak_twos: true,
          bn2_stayman: true,
          bn2_transfers: true,
        },
      },
    },
    sourceIds: ["src_claude"],
    citations: [claude("bundling these five agreements as one teaching step is a prototype judgment")],
    relatedSkillIds: ["sk_convention_recognition"],
    relatedConceptIds: ["bn2_stayman", "bn2_transfers", "bn2_weak_twos"],
    gapIds: [],
  }),
];
