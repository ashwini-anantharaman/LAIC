// The competitive seat (SAYC booklet ch. 7–8): overcalls, takeout doubles
// and their advances (including the cue-bid via the contextual bid_suit
// action), negative doubles, Michaels and the Unusual 2NT, weak jump
// overcalls, Jordan 2NT, the 10+ redouble, and balancing — the last two
// finally expressible with LHO in the auction memory.

import {
  all,
  any,
  anyBid,
  auctionItem,
  bal,
  bid,
  bidAt,
  bidLongest,
  bidSuit,
  ctx,
  dbl,
  hcp,
  is,
  len,
  low,
  high,
  passed,
  quality,
  range,
  rdbl,
  rule,
  stopper,
  toggle,
  tp,
  type TemplateItem,
} from "../dsl";

const THEIR_ONE_LEVEL = bidAt({ level: 1, strains: ["C", "D", "H", "S"] });

export const COMPETITIVE: TemplateItem[] = [
  auctionItem(
    "overcalls",
    "Simple overcalls",
    "Overcall a good five-card suit: 8–16 HCP at the one level, 11–16 with a good suit at the two level. Quality matters more than points.",
    "agreement",
    [
      rule(
        "one-level",
        "One-level overcall",
        ctx("overcaller", { rhoLast: THEIR_ONE_LEVEL }),
        all(
          hcp(low("overcall_range"), high("overcall_range")),
          len("own_longest_suit", 5),
          any(quality("own_longest_suit"), quality("own_longest_suit", "three_of_top_five")),
        ),
        bidLongest(["S", "H", "D", "C"], 1),
        40,
      ),
      rule(
        "two-level",
        "Two-level overcall",
        ctx("overcaller", { rhoLast: anyBid }),
        all(hcp(11, high("overcall_range")), len("own_longest_suit", 5), any(quality("own_longest_suit"), quality("own_longest_suit", "three_of_top_five"))),
        bidLongest(["S", "H", "D", "C"], 2),
        41,
      ),
    ],
    {
      settings: [range("overcall_range", "Simple overcall range (HCP)", 8, 16, { min: 6, max: 18 })],
    },
  ),

  auctionItem(
    "nt-overcall",
    "1NT overcall",
    "A direct 1NT overcall shows 15–18 balanced with a stopper in their suit.",
    "agreement",
    [
      rule(
        "overcall",
        "1NT overcall",
        ctx("overcaller", { rhoLast: THEIR_ONE_LEVEL }),
        all(bal(), hcp(15, 18), stopper("rho_bid_suit")),
        bid(1, "N"),
        39,
      ),
    ],
  ),

  auctionItem(
    "takeout-double",
    "Takeout doubles",
    "Double their suit opening for takeout with opening values and shortness in their suit (or 17+ with any shape). Partner MUST advance: cheapest suit with a weak hand, a cue-bid of their suit with 12+.",
    "convention",
    [
      rule(
        "double",
        "Takeout double",
        ctx("overcaller", { rhoLast: bidAt({ max: 2, strains: ["C", "D", "H", "S"] }) }),
        any(all(hcp(12), len("rho_bid_suit", undefined, 2)), hcp(17)),
        dbl,
        30,
      ),
      rule(
        "advance-cue",
        "Advance with a cue-bid (12+)",
        ctx("advancer", { partnerLast: { kind: "double" } }),
        tp(12),
        bidSuit("lho_bid_suit"),
        31,
      ),
      rule(
        "advance",
        "Advance to the cheapest suit",
        ctx("advancer", { partnerLast: { kind: "double" } }),
        { all: [] },
        bidLongest(["S", "H", "D", "C"]),
        32,
      ),
    ],
    { settings: [toggle("takeout_dbl_on", "Takeout doubles")], sets: ["conventions"] },
  ),

  auctionItem(
    "negative-double",
    "Negative doubles",
    "When partner opens and RHO overcalls (through 2♠), double shows the unbid major(s) and 6+ points instead of a penalty.",
    "convention",
    [
      rule(
        "double",
        "Negative double",
        ctx("responder", { contested: true, rhoLast: bidAt({ max: 2, strains: ["C", "D", "H", "S"] }) }),
        all(hcp(6), any(len("S", 4), len("H", 4))),
        dbl,
        35,
      ),
    ],
    { settings: [toggle("neg_dbl_on", "Negative doubles")], sets: ["conventions"] },
  ),

  auctionItem(
    "michaels",
    "Michaels cue-bid",
    "A direct cue-bid of their opening shows five-five: both majors over a minor, the other major plus a minor over a major.",
    "convention",
    [
      rule(
        "over-minor",
        "Michaels over a minor",
        ctx("overcaller", { rhoLast: bidAt({ level: 1, strains: ["C", "D"] }) }),
        all(len("S", 5), len("H", 5), hcp(8)),
        bidSuit("rho_bid_suit"),
        25,
      ),
      rule(
        "over-hearts",
        "Michaels over 1♥",
        ctx("overcaller", { rhoLast: is("1H") }),
        all(len("S", 5), any(len("C", 5), len("D", 5)), hcp(8)),
        bidSuit("rho_bid_suit"),
        26,
      ),
      rule(
        "over-spades",
        "Michaels over 1♠",
        ctx("overcaller", { rhoLast: is("1S") }),
        all(len("H", 5), any(len("C", 5), len("D", 5)), hcp(8)),
        bidSuit("rho_bid_suit"),
        27,
      ),
    ],
    { settings: [toggle("michaels_on", "Michaels cue-bid")], sets: ["conventions"] },
  ),

  auctionItem(
    "unusual-2nt",
    "Unusual 2NT",
    "A jump to 2NT over their major opening shows at least five-five in the minors.",
    "convention",
    [
      rule(
        "jump",
        "Unusual 2NT",
        ctx("overcaller", { rhoLast: bidAt({ level: 1, strains: ["H", "S"] }) }),
        all(len("C", 5), len("D", 5), hcp(6)),
        bid(2, "N"),
        28,
      ),
    ],
    { settings: [toggle("unt_on", "Unusual 2NT")], sets: ["conventions"] },
  ),

  auctionItem(
    "weak-jump-overcall",
    "Weak jump overcalls",
    "A jump overcall is preemptive — a good six-card suit with 5–10 HCP, like a weak two.",
    "convention",
    [
      rule(
        "jump",
        "Weak jump overcall",
        ctx("overcaller", { rhoLast: THEIR_ONE_LEVEL }),
        all(hcp(5, 10), len("own_longest_suit", 6), any(quality("own_longest_suit"), quality("own_longest_suit", "three_of_top_five"))),
        bidLongest(["S", "H", "D"], 2),
        29,
      ),
    ],
    { settings: [toggle("wjo_on", "Weak jump overcalls")], sets: ["conventions"] },
  ),

  auctionItem(
    "jordan-2nt",
    "Jordan 2NT and the 10+ redouble",
    "When partner's opening is doubled for takeout: 2NT shows a limit raise or better with support (Jordan/Truscott); redouble shows 10+ points and usually no fit.",
    "convention",
    [
      rule(
        "jordan",
        "Jordan 2NT",
        ctx("responder", { rhoLast: { kind: "double" } }),
        all(len("partner_last_bid_suit", 3), tp(10)),
        bid(2, "N"),
        33,
      ),
      rule(
        "redouble",
        "Redouble (10+)",
        ctx("responder", { rhoLast: { kind: "double" } }),
        all(hcp(10), len("partner_last_bid_suit", undefined, 2)),
        rdbl,
        34,
      ),
    ],
    { settings: [toggle("jordan_on", "Jordan 2NT over doubles")], sets: ["conventions"] },
  ),

  auctionItem(
    "cue-bid-raise",
    "Cue-bid raise by advancer",
    "After partner overcalls, a cue-bid of the opponents' suit shows a good raise (11+ with support); a direct raise is merely competitive.",
    "agreement",
    [
      rule(
        "cue",
        "Cue-bid the good raise",
        ctx("advancer", { partnerLast: anyBid, lhoLast: anyBid }),
        all(len("partner_last_bid_suit", 3), tp(11)),
        bidSuit("lho_bid_suit"),
        36,
      ),
      rule(
        "raise",
        "Competitive raise",
        ctx("advancer", { partnerLast: bidAt({ max: 2, strains: ["C", "D", "H", "S"] }) }),
        all(len("partner_last_bid_suit", 3), tp(6, 10)),
        { type: "raise_partner", toLevel: 2 },
        37,
      ),
    ],
  ),

  auctionItem(
    "balancing",
    "Balancing",
    "In the pass-out seat, compete with less than a direct action would need: a balancing 1NT shows 11–14 with a stopper.",
    "agreement",
    [
      rule(
        "balance-nt",
        "Balancing 1NT",
        ctx("overcaller", { rhoLast: passed, lhoLast: THEIR_ONE_LEVEL, partnerLast: passed }),
        all(bal(), hcp(11, 14), stopper("lho_bid_suit")),
        bid(1, "N"),
        50,
      ),
      rule(
        "balance-suit",
        "Balancing overcall",
        ctx("overcaller", { rhoLast: passed, lhoLast: THEIR_ONE_LEVEL, partnerLast: passed }),
        all(hcp(8), len("own_longest_suit", 5)),
        bidLongest(["S", "H", "D", "C"]),
        51,
      ),
    ],
  ),
];
