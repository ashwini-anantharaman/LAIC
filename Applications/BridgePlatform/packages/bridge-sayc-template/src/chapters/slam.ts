// Slam bidding (SAYC booklet ch. 9): Blackwood with real ace-counted
// responses (the new `aces`/`keycards` predicates), the asker's own
// continuation, the 5NT king ask, DOPI over interference, and the RKCB
// variants as separate toggleable items (classic is the SAYC default; the
// three response schemes conflict and are wired with conflicts_with edges).

import {
  aces,
  quality,
  all,
  any,
  anyBid,
  auctionItem,
  bid,
  bidAt,
  bidSuit,
  ctx,
  dbl,
  hcp,
  is,
  keycards,
  kings,
  len,
  pass as passAction,
  rule,
  toggle,
  tp,
  type TemplateItem,
  type TemplateEdge,
} from "../dsl";

/** The asked seat's first call was a SUIT — distinguishes ace-asking 4NT from
 *  the quantitative 4NT over a notrump opening (ownFirst strains N). */
const SUIT_FIRST = bidAt({ strains: ["C", "D", "H", "S"] });
const FOUR_NT = is("4N");

export const SLAM: TemplateItem[] = [
  auctionItem(
    "blackwood",
    "Blackwood (classic responses)",
    "With a fit agreed and slam values, 4NT asks for aces: 5♣ shows 0 or 4, 5♦ one, 5♥ two, 5♠ three. The asker signs off at five with two aces missing or bids the slam.",
    "convention",
    [
      rule(
        "ask",
        "Blackwood 4NT ask",
        ctx("any", { partnerLast: bidAt({ min: 2, max: 4, strains: ["C", "D", "H", "S"] }), contested: false }),
        all(tp(18), len("partner_last_bid_suit", 4)),
        bid(4, "N"),
        10,
      ),
      rule(
        "r0",
        "0 or 4 aces",
        ctx("any", { partnerLast: FOUR_NT, ownFirst: SUIT_FIRST, contested: false }),
        any(aces(undefined, 0), aces(4)),
        bid(5, "C"),
        11,
      ),
      rule("r1", "One ace", ctx("any", { partnerLast: FOUR_NT, ownFirst: SUIT_FIRST, contested: false }), aces(1, 1), bid(5, "D"), 12),
      rule("r2", "Two aces", ctx("any", { partnerLast: FOUR_NT, ownFirst: SUIT_FIRST, contested: false }), aces(2, 2), bid(5, "H"), 13),
      rule("r3", "Three aces", ctx("any", { partnerLast: FOUR_NT, ownFirst: SUIT_FIRST, contested: false }), aces(3, 3), bid(5, "S"), 14),
      // Asker's continuation: sign off missing two aces, bid six otherwise.
      rule(
        "cont-signoff-0",
        "Sign off (partner showed none)",
        ctx("any", { ownLast: FOUR_NT, partnerLast: is("5C") }),
        aces(undefined, 2),
        bidSuit("own_first_bid_suit", 5),
        15,
      ),
      rule(
        "cont-slam-1",
        "Slam (one missing at most)",
        ctx("any", { ownLast: FOUR_NT, partnerLast: is("5D") }),
        aces(2),
        bidSuit("own_first_bid_suit", 6),
        16,
      ),
      rule(
        "cont-signoff-1",
        "Sign off after 5♦",
        ctx("any", { ownLast: FOUR_NT, partnerLast: is("5D") }),
        { all: [] },
        bidSuit("own_first_bid_suit", 5),
        17,
      ),
      rule(
        "cont-slam-2",
        "Slam after 5♥",
        ctx("any", { ownLast: FOUR_NT, partnerLast: is("5H") }),
        aces(1),
        bidSuit("own_first_bid_suit", 6),
        18,
      ),
      rule(
        "cont-signoff-2",
        "Sign off after 5♥",
        ctx("any", { ownLast: FOUR_NT, partnerLast: is("5H") }),
        { all: [] },
        bidSuit("own_first_bid_suit", 5),
        19,
      ),
      rule(
        "cont-slam-3",
        "Slam after 5♠",
        ctx("any", { ownLast: FOUR_NT, partnerLast: is("5S") }),
        { all: [] },
        bidSuit("own_first_bid_suit", 6),
        20,
      ),
    ],
    { settings: [toggle("blackwood_on", "Blackwood (classic)")], sets: ["conventions"] },
  ),

  auctionItem(
    "rkcb-1430",
    "Roman Keycard Blackwood (1430)",
    "RKCB counts five keycards (four aces plus the trump king). 1430 responses: 5♣ = 1 or 4, 5♦ = 0 or 3, 5♥ = 2 without the trump queen, 5♠ = 2 with it. Off by default — turn off classic Blackwood when enabling.",
    "convention",
    [
      rule(
        "r14",
        "1 or 4 keycards",
        ctx("any", { partnerLast: FOUR_NT, ownFirst: SUIT_FIRST, contested: false }),
        any(keycards("own_first_bid_suit", 1, 1), keycards("own_first_bid_suit", 4, 4)),
        bid(5, "C"),
        11,
      ),
      rule(
        "r30",
        "0 or 3 keycards",
        ctx("any", { partnerLast: FOUR_NT, ownFirst: SUIT_FIRST, contested: false }),
        any(keycards("own_first_bid_suit", undefined, 0), keycards("own_first_bid_suit", 3, 3)),
        bid(5, "D"),
        12,
      ),
      rule(
        "r2q",
        "2 with the trump queen",
        ctx("any", { partnerLast: FOUR_NT, ownFirst: SUIT_FIRST, contested: false }),
        all(keycards("own_first_bid_suit", 2, 2), { holds: { suit: "own_first_bid_suit", rank: 12 } }),
        bid(5, "S"),
        13,
      ),
      rule(
        "r2",
        "2 without the trump queen",
        ctx("any", { partnerLast: FOUR_NT, ownFirst: SUIT_FIRST, contested: false }),
        keycards("own_first_bid_suit", 2, 2),
        bid(5, "H"),
        14,
      ),
    ],
    { settings: [toggle("rkcb1430_on", "RKCB 1430 responses", false)], sets: ["conventions"] },
  ),

  auctionItem(
    "rkcb-0314",
    "Roman Keycard Blackwood (0314)",
    "RKCB with 0314 steps: 5♣ = 0 or 3 keycards, 5♦ = 1 or 4, 5♥ = 2 without the trump queen, 5♠ = 2 with it. Off by default.",
    "convention",
    [
      rule(
        "r03",
        "0 or 3 keycards",
        ctx("any", { partnerLast: FOUR_NT, ownFirst: SUIT_FIRST, contested: false }),
        any(keycards("own_first_bid_suit", undefined, 0), keycards("own_first_bid_suit", 3, 3)),
        bid(5, "C"),
        11,
      ),
      rule(
        "r14",
        "1 or 4 keycards",
        ctx("any", { partnerLast: FOUR_NT, ownFirst: SUIT_FIRST, contested: false }),
        any(keycards("own_first_bid_suit", 1, 1), keycards("own_first_bid_suit", 4, 4)),
        bid(5, "D"),
        12,
      ),
      rule(
        "r2q",
        "2 with the trump queen",
        ctx("any", { partnerLast: FOUR_NT, ownFirst: SUIT_FIRST, contested: false }),
        all(keycards("own_first_bid_suit", 2, 2), { holds: { suit: "own_first_bid_suit", rank: 12 } }),
        bid(5, "S"),
        13,
      ),
      rule(
        "r2",
        "2 without the trump queen",
        ctx("any", { partnerLast: FOUR_NT, ownFirst: SUIT_FIRST, contested: false }),
        keycards("own_first_bid_suit", 2, 2),
        bid(5, "H"),
        14,
      ),
    ],
    { settings: [toggle("rkcb0314_on", "RKCB 0314 responses", false)], sets: ["conventions"] },
  ),

  auctionItem(
    "five-nt-kings",
    "5NT king ask",
    "After Blackwood confirms all the aces, 5NT asks for kings by steps: 6♣ = 0 or 4, 6♦ = 1, 6♥ = 2, 6♠ = 3. (A JUMP to 5NT without Blackwood is the Grand Slam Force instead.)",
    "convention",
    [
      rule("k0", "No kings", ctx("any", { partnerLast: is("5N"), ownLast: bidAt({ level: 5, strains: ["C", "D", "H", "S"] }), contested: false }), kings(undefined, 0), bid(6, "C"), 12),
      rule("k1", "One king", ctx("any", { partnerLast: is("5N"), ownLast: bidAt({ level: 5, strains: ["C", "D", "H", "S"] }), contested: false }), kings(1, 1), bid(6, "D"), 13),
      rule("k2", "Two kings", ctx("any", { partnerLast: is("5N"), ownLast: bidAt({ level: 5, strains: ["C", "D", "H", "S"] }), contested: false }), kings(2, 2), bid(6, "H"), 14),
      rule("k3", "Three kings", ctx("any", { partnerLast: is("5N"), ownLast: bidAt({ level: 5, strains: ["C", "D", "H", "S"] }), contested: false }), kings(3, 3), bid(6, "S"), 15),
    ],
    { settings: [toggle("king_ask_on", "5NT king ask")], sets: ["conventions"] },
  ),

  auctionItem(
    "grand-slam-force",
    "Grand Slam Force",
    "A jump to 5NT (not preceded by Blackwood) asks partner to bid a grand slam holding two of the three top trump honors (A, K, Q of the agreed suit), else six.",
    "convention",
    [
      rule(
        "gsf-seven",
        "Bid seven with two top honors",
        ctx("any", { partnerLast: is("5N"), ownLast: bidAt({ max: 4, strains: ["C", "D", "H", "S"] }), contested: false }),
        quality("own_last_bid_suit"),
        bidSuit("own_last_bid_suit", 7),
        21,
      ),
      rule(
        "gsf-six",
        "Sign off at six without them",
        ctx("any", { partnerLast: is("5N"), ownLast: bidAt({ max: 4, strains: ["C", "D", "H", "S"] }), contested: false }),
        { all: [] },
        bidSuit("own_last_bid_suit", 6),
        22,
      ),
    ],
    { settings: [toggle("gsf_on", "Grand Slam Force")], sets: ["conventions"] },
  ),

  auctionItem(
    "dopi",
    "DOPI over Blackwood interference",
    "When the opponents bid over partner's 4NT: double with no aces, pass with one, and bid up the line with more (DOPI).",
    "convention",
    [
      rule(
        "double-0",
        "Double with none",
        ctx("any", { partnerLast: FOUR_NT, contested: true, rhoLast: anyBid }),
        aces(undefined, 0),
        dbl,
        8,
      ),
      rule(
        "pass-1",
        "Pass with one",
        ctx("any", { partnerLast: FOUR_NT, contested: true, rhoLast: anyBid }),
        aces(1, 1),
        passAction,
        9,
      ),
    ],
    { settings: [toggle("dopi_on", "DOPI")], sets: ["conventions"] },
  ),

  auctionItem(
    "grand-slam-values",
    "When to look for slam",
    "Slam needs roughly 33 combined points (37 for a grand) plus controls: check aces before bidding past game, and prefer asking with a source of tricks and no two quick losers in any suit. This is judgment — the asks above are the machinery.",
    "judgment_guideline",
    [],
  ),
];

// Judgment guideline carries no rules — override its payload to teaching prose.
SLAM[SLAM.length - 1]!.payload = { kind: "none" };

export const SLAM_EDGES: TemplateEdge[] = [
  { from: "rkcb-1430", edgeType: "conflicts_with", to: "blackwood" },
  { from: "rkcb-0314", edgeType: "conflicts_with", to: "blackwood" },
  { from: "rkcb-1430", edgeType: "conflicts_with", to: "rkcb-0314" },
  { from: "five-nt-kings", edgeType: "requires", to: "blackwood" },
  { from: "dopi", edgeType: "requires", to: "blackwood" },
];
