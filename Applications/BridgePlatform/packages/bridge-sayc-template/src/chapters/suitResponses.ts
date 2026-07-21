// Responding to suit openings (SAYC booklet ch. 3–4): major raises and the
// forcing 1NT-ish response, new suits up the line over minors, Jacoby 2NT,
// two-over-one values, and responses to weak twos (RONF + feature ask).

import {
  all,
  any,
  auctionItem,
  bal,
  bid,
  bidAt,
  bidSuit,
  ctx,
  hcp,
  is,
  len,
  not,
  raise,
  rule,
  toggle,
  tp,
  type TemplateItem,
} from "../dsl";

const MAJOR_OPENING = bidAt({ level: 1, strains: ["H", "S"] });
const MINOR_OPENING = bidAt({ level: 1, strains: ["C", "D"] });
const WEAK_TWO = bidAt({ level: 2, strains: ["D", "H", "S"] });

export const SUIT_RESPONSES: TemplateItem[] = [
  auctionItem(
    "major-raises",
    "Raises of a major opening",
    "With three-card support raise 1♥/1♠ to two (6–10) or jump to three as a limit raise (10–12). With five trumps and a weak hand, jump straight to game preemptively.",
    "agreement",
    [
      rule(
        "limit",
        "Limit raise",
        ctx("responder", { opening: MAJOR_OPENING, partnerLast: MAJOR_OPENING }),
        all(len("partner_last_bid_suit", 3), tp(10, 12)),
        raise(3),
        30,
      ),
      rule(
        "preempt-game",
        "Preemptive game raise",
        ctx("responder", { opening: MAJOR_OPENING, partnerLast: MAJOR_OPENING }),
        all(len("partner_last_bid_suit", 5), hcp(undefined, 9)),
        raise(4),
        31,
      ),
      rule(
        "single",
        "Single raise",
        ctx("responder", { opening: MAJOR_OPENING, partnerLast: MAJOR_OPENING }),
        all(len("partner_last_bid_suit", 3), tp(6, 9)),
        raise(2),
        32,
      ),
    ],
  ),

  auctionItem(
    "jacoby-2nt",
    "Jacoby 2NT",
    "Over 1♥/1♠, 2NT shows four-card support and game-forcing values (13+). Opener rebids game with a minimum and three of the major with extras (slam interest).",
    "convention",
    [
      rule(
        "raise",
        "Jacoby 2NT raise",
        ctx("responder", { opening: MAJOR_OPENING, partnerLast: MAJOR_OPENING, contested: false }),
        all(len("partner_last_bid_suit", 4), hcp(13)),
        bid(2, "N"),
        40,
      ),
      // Opener's rebids (booklet): show a singleton/void at the three level;
      // with no short suit, show strength — 3M max (18+), 3NT medium
      // (15–17), game in the major with a minimum.
      rule(
        "rebid-shortness",
        "Show the short suit",
        ctx("opener", { ownFirst: MAJOR_OPENING, partnerLast: is("2N") }),
        len("own_shortest_suit", undefined, 1),
        bidSuit("own_shortest_suit"),
        41,
      ),
      rule(
        "rebid-max",
        "Opener shows a maximum (3 of the major)",
        ctx("opener", { ownFirst: MAJOR_OPENING, partnerLast: is("2N") }),
        tp(18),
        bidSuit("own_first_bid_suit", 3),
        42,
      ),
      rule(
        "rebid-medium",
        "Opener shows a medium hand (3NT)",
        ctx("opener", { ownFirst: MAJOR_OPENING, partnerLast: is("2N") }),
        tp(15, 17),
        bid(3, "N"),
        43,
      ),
      rule(
        "rebid-min",
        "Opener signs off in game",
        ctx("opener", { ownFirst: MAJOR_OPENING, partnerLast: is("2N") }),
        { all: [] },
        bidSuit("own_first_bid_suit", 4),
        44,
      ),
    ],
    { settings: [toggle("jacoby2nt_on", "Jacoby 2NT")], sets: ["conventions"] },
  ),

  auctionItem(
    "strong-jump-shifts",
    "Strong jump shifts",
    "A jump in a new suit over partner's opening (1♥–2♠, 1♥–3♣…) is a strong jump shift: 17+ points with a good five-card or longer suit, inviting slam.",
    "convention",
    [
      rule(
        "sjs-spades",
        "2♠ jump shift over 1♥",
        ctx("responder", { opening: is("1H"), partnerLast: is("1H"), contested: false }),
        all(tp(17), len("S", 5)),
        bid(2, "S"),
        26,
      ),
      rule(
        "sjs-club",
        "3♣ jump shift",
        ctx("responder", { opening: MAJOR_OPENING, partnerLast: MAJOR_OPENING, contested: false }),
        all(tp(17), len("C", 5)),
        bid(3, "C"),
        27,
      ),
      rule(
        "sjs-diamond",
        "3♦ jump shift",
        ctx("responder", { opening: MAJOR_OPENING, partnerLast: MAJOR_OPENING, contested: false }),
        all(tp(17), len("D", 5)),
        bid(3, "D"),
        28,
      ),
      rule(
        "sjs-major-over-minor",
        "2♥/2♠ jump shift over a minor",
        ctx("responder", { opening: MINOR_OPENING, partnerLast: MINOR_OPENING, contested: false }),
        all(tp(17), any(len("H", 5), len("S", 5))),
        { type: "bid_longest", among: ["S", "H"], level: 2 },
        29,
      ),
    ],
    { settings: [toggle("sjs_on", "Strong jump shifts")], sets: ["conventions"] },
  ),

  auctionItem(
    "major-3nt-response",
    "3NT response to a major",
    "Over 1♥/1♠, 3NT shows 15–17 HCP, a balanced hand and exactly two-card support.",
    "agreement",
    [
      rule(
        "respond",
        "3NT response",
        ctx("responder", { opening: MAJOR_OPENING, partnerLast: MAJOR_OPENING, contested: false }),
        all(bal(), hcp(15, 17), len("partner_last_bid_suit", 2, 2)),
        bid(3, "N"),
        29,
      ),
    ],
  ),

  auctionItem(
    "major-1nt-response",
    "1NT response to a major",
    "Without support or a biddable spade suit, respond 1NT to 1♥/1♠ with 6–10 points.",
    "agreement",
    [
      rule(
        "respond",
        "1NT response",
        ctx("responder", { opening: MAJOR_OPENING, partnerLast: MAJOR_OPENING }),
        all(hcp(6, 10), len("partner_last_bid_suit", undefined, 2)),
        bid(1, "N"),
        45,
      ),
    ],
  ),

  auctionItem(
    "major-new-suits",
    "New-suit responses to a major",
    "Over 1♥, bid 1♠ with four-plus spades and 6+ points. A new suit at the two level shows 11+ points (two-over-one values in SAYC).",
    "agreement",
    [
      rule(
        "one-spade",
        "1♠ over 1♥",
        ctx("responder", { opening: is("1H"), partnerLast: is("1H") }),
        all(len("S", 4), hcp(6)),
        bid(1, "S"),
        33,
      ),
      rule(
        "two-hearts",
        "2♥ over 1♠ (five-card suit, 11+)",
        ctx("responder", { opening: is("1S"), partnerLast: is("1S") }),
        all(len("H", 5), tp(11)),
        bid(2, "H"),
        34,
      ),
      rule(
        "two-minor",
        "Two of a minor (11+)",
        ctx("responder", { opening: MAJOR_OPENING, partnerLast: MAJOR_OPENING }),
        all(tp(11), any(len("C", 4), len("D", 4))),
        { type: "bid_longest", among: ["D", "C"], level: 2 },
        35,
      ),
    ],
  ),

  auctionItem(
    "minor-responses",
    "Responses to a minor opening",
    "Over 1♣/1♦, show a four-card major up the line (spades first only with five), raise with five-card support and no major, or respond in notrump by range.",
    "agreement",
    [
      rule(
        "five-spades",
        "1♠ with five spades",
        ctx("responder", { opening: MINOR_OPENING, partnerLast: MINOR_OPENING }),
        all(len("S", 5), hcp(6)),
        bid(1, "S"),
        30,
      ),
      rule(
        "up-line-h",
        "1♥ with four hearts",
        ctx("responder", { opening: MINOR_OPENING, partnerLast: MINOR_OPENING }),
        all(len("H", 4), hcp(6)),
        bid(1, "H"),
        31,
      ),
      rule(
        "up-line-s",
        "1♠ with four spades",
        ctx("responder", { opening: MINOR_OPENING, partnerLast: MINOR_OPENING }),
        all(len("S", 4), hcp(6)),
        bid(1, "S"),
        32,
      ),
      rule(
        "raise-d",
        "Raise 1♦ (four-card support)",
        ctx("responder", { opening: is("1D"), partnerLast: is("1D") }),
        all(len("D", 4), tp(6, 9), not(any(len("S", 4), len("H", 4)))),
        raise(2),
        33,
      ),
      rule(
        "raise-c",
        "Raise 1♣ (five-card support)",
        ctx("responder", { opening: is("1C"), partnerLast: is("1C") }),
        all(len("C", 5), tp(6, 9), not(any(len("S", 4), len("H", 4)))),
        raise(2),
        34,
      ),
      rule(
        "one-nt",
        "1NT response",
        ctx("responder", { opening: MINOR_OPENING, partnerLast: MINOR_OPENING }),
        all(hcp(6, 10), not(any(len("S", 4), len("H", 4)))),
        bid(1, "N"),
        35,
      ),
      rule(
        "two-nt",
        "2NT response (13–15, game forcing)",
        ctx("responder", { opening: MINOR_OPENING, partnerLast: MINOR_OPENING, contested: false }),
        all(bal(), hcp(13, 15), not(any(len("S", 4), len("H", 4)))),
        bid(2, "N"),
        36,
      ),
      rule(
        "three-nt",
        "3NT response (16–18)",
        ctx("responder", { opening: MINOR_OPENING, partnerLast: MINOR_OPENING, contested: false }),
        all(bal(), hcp(16, 18), not(any(len("S", 4), len("H", 4)))),
        bid(3, "N"),
        37,
      ),
    ],
  ),

  auctionItem(
    "weak-two-responses",
    "Responses to a weak two (RONF)",
    "Raises of a weak two are preemptive; a new suit is forcing for one round. 2NT asks for a feature: opener rebids the suit with a minimum and bids 3NT with a maximum.",
    "convention",
    [
      rule(
        "raise",
        "Raise the preempt",
        ctx("responder", { opening: WEAK_TWO, partnerLast: WEAK_TWO }),
        len("partner_last_bid_suit", 3),
        raise(3),
        50,
      ),
      rule(
        "ask",
        "2NT feature ask",
        ctx("responder", { opening: WEAK_TWO, partnerLast: WEAK_TWO }),
        tp(15),
        bid(2, "N"),
        49,
      ),
      rule(
        "answer-max",
        "Show a maximum",
        ctx("opener", { ownFirst: WEAK_TWO, partnerLast: is("2N") }),
        hcp(9),
        bid(3, "N"),
        51,
      ),
      rule(
        "answer-min",
        "Sign off with a minimum",
        ctx("opener", { ownFirst: WEAK_TWO, partnerLast: is("2N") }),
        { all: [] },
        bidSuit("own_first_bid_suit", 3),
        52,
      ),
      // RONF: a new suit is forcing — opener raises a major with three-card
      // support, else rebids the suit with a minimum.
      rule(
        "ronf-raise",
        "Raise responder's forcing major",
        ctx("opener", {
          ownFirst: WEAK_TWO,
          partnerLast: bidAt({ min: 2, max: 3, strains: ["H", "S"] }),
        }),
        len("partner_last_bid_suit", 3),
        bidSuit("partner_last_bid_suit"),
        53,
      ),
      rule(
        "ronf-rebid",
        "Rebid the suit (minimum, no fit)",
        ctx("opener", {
          ownFirst: WEAK_TWO,
          partnerLast: bidAt({ min: 2, max: 3, strains: ["C", "D", "H", "S"] }),
        }),
        hcp(undefined, 8),
        bidSuit("own_first_bid_suit"),
        54,
      ),
    ],
    { settings: [toggle("weak2_ask_on", "2NT feature ask over weak twos")], sets: ["conventions"] },
  ),
];
