// Slam bidding (SAYC booklet ch. 9), rebuilt on the partnership-inference
// language (Pillar A / Pillar C). The old chapter faked the missing layer:
// "fit" = 4 cards in partner's last suit, responses decided off the ASKER's own
// aces, and continuations decoded partner's reply by matching the literal call
// (partnerLast: is("5D")) then bid "own_first_bid_suit" — the wrong-suit bug.
//
// Now:
//  · the ASK fires on a real fit + combined slam values (fitEstablished +
//    combinedHcp), never "4+ in partner's suit + 18 TP";
//  · the ask declares machine meanings for every response (ask.responses), so
//    the inference decodes partner's reply into keycards;
//  · continuations do COMBINED keycard arithmetic (combinedKeycards /
//    keycardsMissing) — sign off at the five level missing two, bid the small
//    slam missing at most one, try for grand holding all five, and prefer 6NT
//    over six of a minor — and every contract bid targets the AGREED suit.
//
// Granularity (one item per convention stage): the ask (trigger), the responses,
// and the asker's continuations are three separate items. blackwood_on gates the
// TRIGGER only; with the ask disabled it never enters the inference surface, so
// the response/continuation rules (which only match an ask-in-progress or a
// decoded reply) are inert — no separate toggle needed, and turning Blackwood
// off cascades correctly.

import {
  all,
  any,
  anyBid,
  ask,
  auctionItem,
  bid,
  bidAt,
  bidSuit,
  combHcp,
  combKc,
  ctx,
  dbl,
  fit,
  is,
  kcMissing,
  keycards,
  kings,
  not,
  pass as passAction,
  quality,
  rule,
  toggle,
  type TemplateItem,
  type TemplateEdge,
} from "../dsl";

/** Partner's last call was a natural suit bid (a raise / suit rebid) — the
 *  fit-showing shape that turns 4NT into keycard Blackwood rather than a
 *  natural/quantitative 4NT (which follows a notrump bid, never a suit). */
const PARTNER_SUIT = bidAt({ strains: ["C", "D", "H", "S"] });
const FOUR_NT = is("4N");
const FIVE_SUIT = bidAt({ level: 5, strains: ["C", "D", "H", "S"] });

export const SLAM: TemplateItem[] = [
  // ---- STAGE 1: the ask (trigger) -----------------------------------------
  auctionItem(
    "blackwood-ask",
    "Blackwood 4NT ask (trigger)",
    "When a trump fit is agreed and the combined values make slam likely, 4NT is Roman Keycard Blackwood: it asks for the five keycards (the four aces plus the king of the agreed trump suit). The ask fires on the FIT plus the combined point count — never on a raw one-hand rule — and it is unambiguously the ask, not a natural 4NT (which follows a notrump bid, never a raised suit).",
    "convention",
    [
      rule(
        "ask",
        "Roman Keycard 4NT ask",
        ctx("any", { partnerLast: PARTNER_SUIT, contested: false }),
        all(fit("agreed_suit"), combHcp(30)),
        bid(4, "N"),
        10,
        {
          // Each response's decoded meaning (1430 steps). The inference reads
          // this to turn partner's reply into partnerShownKeycards.
          ask: ask("rkc", {
            "5C": { keycards: [1, 4] },
            "5D": { keycards: [0, 3] },
            "5H": { keycards: [2] },
            "5S": { keycards: [2] },
          }),
        },
      ),
    ],
    { settings: [toggle("blackwood_on", "Roman Keycard Blackwood")], sets: ["conventions"] },
  ),

  // ---- STAGE 2: the responses ---------------------------------------------
  // Keyed on askInProgress = "rkc" (never on a raw call), so these can only
  // fire when the ask actually posed the question. 1430 responses count
  // keycards for the AGREED suit. Ungated: inert unless the trigger is live.
  auctionItem(
    "blackwood-responses",
    "Blackwood responses (1430 keycard steps)",
    "Answering the keycard ask, counting the four aces plus the king of the agreed trump suit: 5♣ = 1 or 4, 5♦ = 0 or 3, 5♥ = 2 without the trump queen, 5♠ = 2 with the trump queen. Steps are read off the AGREED suit, and each carries the machine meaning the asker decodes.",
    "convention",
    [
      rule(
        "r14",
        "1 or 4 keycards",
        ctx("any", { askInProgress: "rkc", contested: false }),
        any(keycards("agreed_suit", 1, 1), keycards("agreed_suit", 4, 4)),
        bid(5, "C"),
        20,
      ),
      rule(
        "r03",
        "0 or 3 keycards",
        ctx("any", { askInProgress: "rkc", contested: false }),
        any(keycards("agreed_suit", undefined, 0), keycards("agreed_suit", 3, 3)),
        bid(5, "D"),
        21,
      ),
      rule(
        "r2q",
        "2 keycards with the trump queen",
        ctx("any", { askInProgress: "rkc", contested: false }),
        all(keycards("agreed_suit", 2, 2), { holds: { suit: "agreed_suit", rank: 12 } }),
        bid(5, "S"),
        22,
      ),
      rule(
        "r2",
        "2 keycards without the trump queen",
        ctx("any", { askInProgress: "rkc", contested: false }),
        keycards("agreed_suit", 2, 2),
        bid(5, "H"),
        23,
      ),
      // Totality guard: a five-keycard responder (partner asked with none) is a
      // theoretical edge, but the reply must be defined so self-play never floors.
      rule(
        "r5",
        "All five keycards",
        ctx("any", { askInProgress: "rkc", contested: false }),
        keycards("agreed_suit", 5),
        bid(5, "C"),
        24,
      ),
    ],
    { sets: ["conventions"] },
  ),

  // ---- STAGE 3: the asker's continuations ---------------------------------
  // COMBINED keycard arithmetic. Every contract bid targets agreed_suit (the
  // old chapter's "own_first_bid_suit" was the wrong-suit bug). Ungated: these
  // only match after the asker's own 4NT with a decoded reply, so they are
  // inert unless the trigger fired.
  auctionItem(
    "blackwood-continuations",
    "Blackwood continuations (combined keycards)",
    "Having decoded partner's reply, the asker signs off at the five level in the agreed suit when the partnership is missing two or more keycards, bids the small slam in the agreed suit missing at most one, and — for a MINOR-suit fit with 33+ combined points — prefers 6NT to six of the minor. (Holding all five keycards it tries for grand with the 5NT king ask.) When the reply is two-way and the exact count is unclear, it signs off safely at five.",
    "convention",
    [
      rule(
        "cont-6nt-minor",
        "Prefer 6NT over six of a minor",
        ctx("any", { ownLast: FOUR_NT, partnerLast: FIVE_SUIT, contested: false }),
        all(kcMissing(undefined, 1), combHcp(33), fit("any"), not(fit("any_major"))),
        bid(6, "N"),
        31,
      ),
      rule(
        "cont-small-slam",
        "Bid the small slam in the agreed suit",
        ctx("any", { ownLast: FOUR_NT, partnerLast: FIVE_SUIT, contested: false }),
        kcMissing(undefined, 1),
        bidSuit("agreed_suit", 6),
        32,
      ),
      rule(
        "cont-signoff",
        "Sign off at five missing two keycards",
        ctx("any", { ownLast: FOUR_NT, partnerLast: FIVE_SUIT, contested: false }),
        kcMissing(2),
        bidSuit("agreed_suit", 5),
        33,
      ),
      // Totality guard: a two-way reply (0/3, 1/4) leaves the exact count
      // ambiguous — sign off safely at five rather than gamble past game.
      rule(
        "cont-signoff-safe",
        "Sign off at five (count unclear)",
        ctx("any", { ownLast: FOUR_NT, partnerLast: FIVE_SUIT, contested: false }),
        { all: [] },
        bidSuit("agreed_suit", 5),
        40,
      ),
    ],
    { sets: ["conventions"] },
  ),

  // ---- The 5NT king ask (grand-slam try) ----------------------------------
  // The grand-try 5NT itself lives here (gated by king_ask_on): holding all
  // five keycards the asker asks for kings; with the ask off it falls through
  // to the small slam — never floors. The king responses show kings by steps.
  auctionItem(
    "blackwood-king-ask",
    "5NT king ask (grand-slam try)",
    "With all five keycards accounted for, 5NT asks for kings to judge a grand slam: 6♣ = 0 or 4, 6♦ = 1, 6♥ = 2, 6♠ = 3. (A JUMP to 5NT without Blackwood is the Grand Slam Force instead.)",
    "convention",
    [
      rule(
        "grand-try",
        "Ask for kings holding all five keycards",
        ctx("any", { ownLast: FOUR_NT, partnerLast: FIVE_SUIT, contested: false }),
        combKc(5),
        bid(5, "N"),
        30,
        {
          ask: ask("rkc-kings", {
            "6C": { kings: [0, 4] },
            "6D": { kings: [1] },
            "6H": { kings: [2] },
            "6S": { kings: [3] },
          }),
        },
      ),
      rule(
        "k04",
        "0 or 4 kings",
        ctx("any", { ownLast: FIVE_SUIT, partnerLast: is("5N"), contested: false }),
        any(kings(undefined, 0), kings(4)),
        bid(6, "C"),
        34,
      ),
      rule(
        "k1",
        "One king",
        ctx("any", { ownLast: FIVE_SUIT, partnerLast: is("5N"), contested: false }),
        kings(1, 1),
        bid(6, "D"),
        35,
      ),
      rule(
        "k2",
        "Two kings",
        ctx("any", { ownLast: FIVE_SUIT, partnerLast: is("5N"), contested: false }),
        kings(2, 2),
        bid(6, "H"),
        36,
      ),
      rule(
        "k3",
        "Three kings",
        ctx("any", { ownLast: FIVE_SUIT, partnerLast: is("5N"), contested: false }),
        kings(3),
        bid(6, "S"),
        37,
      ),
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
        45,
      ),
      rule(
        "gsf-six",
        "Sign off at six without them",
        ctx("any", { partnerLast: is("5N"), ownLast: bidAt({ max: 4, strains: ["C", "D", "H", "S"] }), contested: false }),
        { all: [] },
        bidSuit("own_last_bid_suit", 6),
        46,
      ),
    ],
    { settings: [toggle("gsf_on", "Grand Slam Force")], sets: ["conventions"] },
  ),

  auctionItem(
    "dopi",
    "DOPI over Blackwood interference",
    "When the opponents bid over partner's 4NT keycard ask: double with no keycards, pass with one, and bid the steps with more (DOPI).",
    "convention",
    [
      rule(
        "double-0",
        "Double with none",
        ctx("any", { partnerLast: FOUR_NT, contested: true, rhoLast: anyBid }),
        keycards("agreed_suit", undefined, 0),
        dbl,
        8,
      ),
      rule(
        "pass-1",
        "Pass with one",
        ctx("any", { partnerLast: FOUR_NT, contested: true, rhoLast: anyBid }),
        keycards("agreed_suit", 1, 1),
        passAction,
        9,
      ),
    ],
    { settings: [toggle("dopi_on", "DOPI")], sets: ["conventions"] },
  ),

  auctionItem(
    "grand-slam-values",
    "When to look for slam",
    "Slam needs roughly 33 combined points (37 for a grand) plus controls: with a fit agreed, use the keycard ask to check that the partnership is not missing two of the five keycards before committing past game. This is judgment — the asks above are the machinery.",
    "judgment_guideline",
    [],
  ),
];

// Judgment guideline carries no rules — override its payload to teaching prose.
SLAM[SLAM.length - 1]!.payload = { kind: "none" };

export const SLAM_EDGES: TemplateEdge[] = [
  { from: "blackwood-king-ask", edgeType: "requires", to: "blackwood-ask" },
  { from: "dopi", edgeType: "requires", to: "blackwood-ask" },
];
