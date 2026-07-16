// TEST FIXTURE ONLY — a tiny SAYC-flavored KB exercising every mechanism:
// inline settings ($setting ranges + enable gates), bands, packs/ladder,
// edges, fallbacks. This is dev fixture data (cited to the Claude source),
// NOT platform content: real knowledge enters via extraction from uploaded
// sources (spec §4).

import type { Citation, KbEdge, KbPack, KnowledgeItem } from "./model";

const NOW = "2026-07-14T00:00:00.000Z";
const claude: Citation[] = [{ sourceId: "src_claude", anchor: "test fixture judgment" }];

const base = {
  sourceReferences: claude,
  supportedLevels: [],
  status: "approved" as const,
  version: 1,
  createdBy: "u_fixture",
  createdAt: NOW,
  updatedAt: NOW,
  settings: [],
};

export const FIXTURE_ITEMS: KnowledgeItem[] = [
  {
    ...base,
    itemId: "ki_fb_auction",
    title: "Auction fallback: pass",
    humanReadableText: "With no agreement that applies, pass.",
    knowledgeType: "fallback_rule",
    phase: "auction",
    payload: { kind: "fallback", fallback: { phase: "auction", behavior: "pass" } },
  },
  {
    ...base,
    itemId: "ki_fb_lead",
    title: "Lead fallback: low from longest",
    humanReadableText: "With no lead agreement, lead low from your longest suit.",
    knowledgeType: "fallback_rule",
    phase: "opening_lead",
    payload: {
      kind: "fallback",
      fallback: { phase: "opening_lead", behavior: "low_from_longest" },
    },
  },
  {
    ...base,
    itemId: "ki_fb_play",
    title: "Play fallback: lowest legal card",
    humanReadableText: "With no technique that applies, play your lowest legal card.",
    knowledgeType: "fallback_rule",
    phase: "declarer_play",
    payload: { kind: "fallback", fallback: { phase: "card_play", behavior: "lowest_legal" } },
  },
  {
    ...base,
    itemId: "ki_signals_none",
    title: "No signals",
    humanReadableText: "This partnership plays no defensive signals.",
    knowledgeType: "signal_agreement",
    phase: "defense",
    payload: {
      kind: "signals",
      signals: { attitude: "none", count: "none", firstDiscard: "none" },
    },
  },
  {
    ...base,
    itemId: "ki_open_1nt",
    title: "1NT opening",
    humanReadableText: "Open 1NT with a balanced hand in the notrump range (default 15–17).",
    knowledgeType: "agreement",
    phase: "auction",
    settings: [
      {
        key: "nt_range",
        label: "1NT range",
        control: "range_hcp",
        role: "parameter",
        default: { low: 15, high: 17 },
        min: 8,
        max: 26,
      },
    ],
    payload: {
      kind: "auction_rules",
      rules: [
        {
          key: "open",
          label: "Open 1NT",
          context: { role: "opening" },
          conditions: {
            all: [
              { balanced: true },
              {
                hcp: {
                  min: { $setting: "nt_range", field: "low" },
                  max: { $setting: "nt_range", field: "high" },
                },
              },
            ],
          },
          action: { type: "bid", level: 1, strain: "N" },
          priority: 10,
        },
      ],
    },
  },
  {
    ...base,
    itemId: "ki_open_2c",
    title: "Strong 2♣ opening",
    humanReadableText: "Open 2♣ with 22 or more HCP.",
    knowledgeType: "agreement",
    phase: "auction",
    payload: {
      kind: "auction_rules",
      rules: [
        {
          key: "open",
          label: "Strong 2♣",
          context: { role: "opening" },
          conditions: { hcp: { min: 22 } },
          action: { type: "bid", level: 2, strain: "C" },
          priority: 5,
        },
      ],
    },
  },
  {
    ...base,
    itemId: "ki_open_major",
    title: "Five-card major openings",
    humanReadableText: "With 13+ points and a five-card major, open it at the one level.",
    knowledgeType: "bidding_rule",
    phase: "auction",
    payload: {
      kind: "auction_rules",
      rules: [
        {
          key: "open",
          label: "Open five-card major",
          context: { role: "opening" },
          conditions: {
            all: [
              { totalPoints: { min: 13 } },
              {
                any: [
                  { suitLength: { suit: "S", min: 5 } },
                  { suitLength: { suit: "H", min: 5 } },
                ],
              },
            ],
          },
          action: { type: "bid_longest", among: ["S", "H"], level: 1 },
          priority: 20,
        },
      ],
    },
  },
  {
    ...base,
    itemId: "ki_stayman",
    title: "Stayman",
    humanReadableText:
      "Over partner's 1NT, bid 2♣ with 8+ HCP and a four-card major to ask for majors.",
    knowledgeType: "convention",
    phase: "auction",
    settings: [
      {
        key: "stayman_on",
        label: "Stayman",
        control: "toggle",
        role: "enable",
        default: true,
      },
    ],
    payload: {
      kind: "auction_rules",
      rules: [
        {
          key: "ask",
          label: "Stayman 2♣ ask",
          context: {
            role: "responder",
            opening: { kind: "bid", levelMin: 1, levelMax: 1, strains: ["N"] },
            contested: false,
            roundMin: 1,
            roundMax: 1,
          },
          conditions: {
            all: [
              { hcp: { min: 8 } },
              {
                any: [
                  { suitLength: { suit: "S", min: 4 } },
                  { suitLength: { suit: "H", min: 4 } },
                ],
              },
            ],
          },
          action: { type: "bid", level: 2, strain: "C" },
          priority: 5,
        },
      ],
    },
  },
  {
    ...base,
    itemId: "ki_nat_2c_resp",
    title: "Natural 2♣ response to 1NT",
    humanReadableText: "Over partner's 1NT, 2♣ shows long clubs (sign-off).",
    knowledgeType: "agreement",
    phase: "auction",
    payload: {
      kind: "auction_rules",
      rules: [
        {
          key: "signoff",
          label: "Natural 2♣ sign-off",
          context: {
            role: "responder",
            opening: { kind: "bid", levelMin: 1, levelMax: 1, strains: ["N"] },
            contested: false,
          },
          conditions: { suitLength: { suit: "C", min: 6 } },
          action: { type: "bid", level: 2, strain: "C" },
          priority: 8,
        },
      ],
    },
  },
  {
    ...base,
    itemId: "ki_lead_4th",
    title: "Fourth-best leads",
    humanReadableText: "Against notrump, lead fourth-best from your longest suit.",
    knowledgeType: "lead_agreement",
    phase: "opening_lead",
    payload: { kind: "lead_rules", leads: [{ versus: "notrump", style: "fourth_best" }] },
  },
  {
    ...base,
    itemId: "ki_second_low",
    title: "Second hand low",
    humanReadableText: "In second seat, play low.",
    knowledgeType: "defensive_technique",
    phase: "defense",
    payload: {
      kind: "play_rules",
      rules: [{ position: "second", side: "defense", behavior: "second_hand_low", priority: 10 }],
    },
  },
];

export const FIXTURE_EDGES: KbEdge[] = [
  {
    edgeId: "ke_stayman_requires_1nt",
    fromItemId: "ki_stayman",
    edgeType: "requires",
    toItemId: "ki_open_1nt",
    origin: "fellow",
    confirmed: true,
    createdBy: "u_fixture",
    createdAt: NOW,
  },
  {
    edgeId: "ke_stayman_conflicts_nat2c",
    fromItemId: "ki_stayman",
    edgeType: "conflicts_with",
    toItemId: "ki_nat_2c_resp",
    origin: "fellow",
    confirmed: true,
    createdBy: "u_fixture",
    createdAt: NOW,
  },
];

export function fixturePacks(kbId: string): KbPack[] {
  const base = { kbId, createdBy: "u_fixture", createdAt: NOW, updatedAt: NOW };
  return [
    {
      ...base,
      packId: "pk_floor",
      name: "Minimal complete",
      ordinal: 0,
      itemIds: ["ki_fb_auction", "ki_fb_lead", "ki_fb_play", "ki_signals_none"],
    },
    {
      ...base,
      packId: "pk_openings",
      name: "Openings",
      ordinal: 1,
      extendsPackId: "pk_floor",
      itemIds: ["ki_open_1nt", "ki_open_2c", "ki_open_major", "ki_lead_4th", "ki_second_low"],
    },
    {
      ...base,
      packId: "pk_conventions",
      name: "Conventions",
      ordinal: 2,
      extendsPackId: "pk_openings",
      itemIds: ["ki_stayman"],
    },
    // Deliberately incomplete: openings with NO fallbacks (drill material).
    {
      ...base,
      packId: "pk_bare_openings",
      name: "Bare openings (incomplete)",
      ordinal: 1,
      itemIds: ["ki_open_1nt", "ki_open_2c", "ki_open_major"],
    },
  ];
}
