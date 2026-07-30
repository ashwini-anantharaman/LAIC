// Competitive bidding, exactly as the training notes write it up
// (pages 4-5, page 15, the conventional table on pages 16-17, page 25 and
// page 26).
//
// THIS IS THE MOST DISTINCTIVE CHAPTER IN THE DOCUMENT. Page 15 states a
// SYSTEMIC rule that has no counterpart in the sibling deck:
//
//   "WHEN OPPONENTS INTERFERE, LIMIT RAISE, JACOBY 2NT, INVERTED MINORS AND
//    FORCING NT ARE OFF. Use the cuebid to show those hands. Also, the 2/1 bids
//    are not GF but show 10+ pts."
//
// So under interference the whole responding structure changes shape, and the
// NATURAL meanings come back:
//   · the CUEBID carries every hand that wanted a limit raise, Jacoby 2NT, an
//     inverted minor raise, or a forcing 1NT with 3-card support and 10-11;
//   · 1M-(x)-2M is a weak 3+ card raise (6-9) and 1M-(x)-3M is preemptive 4+
//     support (0-5);
//   · 1m-(x)-2m is weak 5+ support (6-9) and 1m-(x)-3m preemptive 5+ (0-5);
//   · 1x-(x)-2NT is a NATURAL 10-11 with no support and a control in their suit;
//   · 1M-(x)-1NT is a NATURAL 6-9 with no support and a control in their suit;
//   · 1x-(x)-X is a NEGATIVE double;
//   · a 2/1 bid shows 10+ and a real 5-card suit, forcing for one round;
//   · only SPLINTERS survive unchanged (shortness, game-forcing values).
// Each of those is its own item, so the interference structure can be read (and
// switched) one piece at a time. The "conventions are off" side is not authored
// as a suppression: the uncontested items in ntResponses/suitResponses carry
// their own uncontested contexts, and these items carry the contested ones.
//
// BAND / PRIORITY DISCIPLINE (same convention as the sibling template:
// artificial calls take the LOW numbers so they are considered before the
// natural ladder; `concept` and `judgment_guideline` items produce no rules at
// all):
//   20-23 the cuebid under interference · 24 opener/overcaller answering a
//   cuebid with NT · 25-26 negative double · 27-29 Michaels · 30-32 advancing
//   Michaels · 33-37 Unusual NT · 38-41 Unusual vs Unusual · 42 takeout double ·
//   43-45 the doubler's second call · 46-53 advancer over a takeout double ·
//   54-55 redouble · 56 advancer's cuebid over partner's overcall ·
//   57-58 splinters under interference ·
//   then the natural ladder: 60 the 2/1 under interference · 61-64 natural
//   raises under interference · 65-68 natural NT under interference ·
//   69-70 natural overcalls.
//
// EVERY number the notes state is a setting. Where the notes state NO number
// (the negative double's floor, advancer's invitational band, the strength of
// advancer's cuebid over an overcall) the item text says so and the value is a
// setting with the inference named, never a silent constant.

import {
  all,
  any,
  anyBid,
  auctionItem,
  bid,
  bidAt,
  bidLongest,
  bidSuit,
  ctx,
  dbl,
  doubled,
  firstLegal,
  forcing,
  hcp,
  high,
  is,
  item,
  len,
  low,
  noCall,
  not,
  pass,
  passed,
  quality,
  raise,
  range,
  rdbl,
  rule,
  stopper,
  toggle,
  tp,
  type TemplateItem,
} from "@bridge/sayc-template/dsl";

/** Their opening, one level, any suit — the direct-seat trigger. */
const THEIR_1_SUIT = bidAt({ level: 1, strains: ["C", "D", "H", "S"] });
/** An opening from 1♣ through 3♠ (a weak two/three is still an opening). */
const THEIR_OPENING_1_3 = bidAt({ min: 1, max: 3, strains: ["C", "D", "H", "S"] });
/** The rest of the takeout double's range: 4♣, 4♦ and 4♥ but NOT 4♠ ("up to 4h"). */
const THEIR_OPENING_4 = bidAt({ level: 4, strains: ["C", "D", "H"] });
/** Partner's one-level opening (the responder contexts of page 15). */
const OUR_1_SUIT = bidAt({ level: 1, strains: ["C", "D", "H", "S"] });
const OUR_1_MAJOR = bidAt({ level: 1, strains: ["H", "S"] });
const OUR_1_MINOR = bidAt({ level: 1, strains: ["C", "D"] });
/** Partner's opening at any level a takeout double can be aimed at. */
const OUR_OPENING = bidAt({ min: 1, max: 4, strains: ["C", "D", "H", "S"] });
/** A suit bid at the one level (partner's overcall, their intervention…). */
const ONE_LEVEL = bidAt({ level: 1, strains: ["C", "D", "H", "S"] });
const TWO_LEVEL = bidAt({ level: 2, strains: ["C", "D", "H", "S"] });

/**
 * Page 15's interference bullets are written "1M - (??) - 2M": the ?? is ANY
 * interference, and the notes say so explicitly for the double ("other bids are
 * similar to when the opponent overcalls a suit but without a cuebid being
 * available"). So each natural-meaning rule is emitted twice — once over their
 * BID, once over their DOUBLE. Rules that reference `rho_bid_suit` (the cuebid,
 * the control in their suit) are NOT duplicated: there is no suit to cue or to
 * hold a control in when the interference is a double.
 */
const overInterference = (r: ReturnType<typeof rule>): ReturnType<typeof rule>[] => [
  { ...r, context: { ...r.context, rhoLast: anyBid } },
  { ...r, key: `${r.key}-x`, context: { ...r.context, rhoLast: doubled } },
];

export const COMPETITIVE: TemplateItem[] = [
  // -------------------------------------------------------------------------
  // Page 15 — the systemic rule, and the cuebid that carries its load
  // -------------------------------------------------------------------------
  item(
    "cmp-interference-conventions-off",
    "When the opponents interfere, the conventions are OFF",
    "Page 15 states the rule in capitals: WHEN OPPONENTS INTERFERE, LIMIT RAISE, JACOBY 2NT, INVERTED MINORS AND FORCING NT ARE OFF — and the 2/1 bids stop being game forcing, showing 10+ instead. This is the single biggest difference between this system and any other 2/1 write-up: the moment RHO bids or doubles, four conventions vanish and the calls they occupied go back to meaning what they say. 1M-(x)-2M is a weak raise, 1M-(x)-3M is a preempt, 1m-(x)-2m is a weak minor raise, 1M-(x)-1NT is a natural 6-9, 1x-(x)-2NT is a natural 10-11, and a 2/1 shows 10+ with a real suit rather than a game force. Everything the four dead conventions used to say is carried by ONE call: the CUEBID of the opponents' suit. So the cuebid is not a nicety here, it is load-bearing — with 10+ points and any hand that wanted a limit raise, Jacoby 2NT, an inverted minor raise, or a forcing 1NT with three-card support, you cuebid and describe next turn. Only SPLINTERS survive interference untouched. Over a takeout double the same map applies with one hole: there is no suit to cue, so the 10+ hands use the REDOUBLE instead.",
    "concept",
    "auction",
    { kind: "none" },
  ),

  auctionItem(
    "cmp-cuebid-interference",
    "Cuebid under interference — the hands the conventions used to hold",
    "Page 15: \"Cuebid with any hand that was good for a limit raise, Jacoby 2NT, inverted minors or Forcing NT with 3M support (10-11 pts)\", and \"If none of the other bids are suitable then cuebid with 10+ pts and then rebid based on partner's response.\" Four rules, one per lost convention, plus that catch-all. With four-plus support for partner's major and 10+, the cuebid covers BOTH the dead limit raise (10-11) and the dead Jacoby 2NT (12+) — the notes deliberately merge them, and partner learns which on the next round. With exactly three-card support and 10-11 it covers the hand that would have started with a forcing 1NT and jumped in the major later. With five-plus cards in partner's minor and 10+ it covers the dead inverted-minor raise. The floor is 10 throughout (page 15's \"ADVANCED\" paragraph: \"Cuebid shows 10+ pts, very likely with a support for the partner's suit\") and is exposed as a setting; the notes give no ceiling, so none is imposed. The cuebid is forcing for one round.",
    "convention",
    [
      rule(
        "cue-major-support",
        "Cuebid: 4+ support for partner's major, 10+ (limit raise or Jacoby 2NT)",
        ctx("responder", { partnerLast: OUR_1_MAJOR, rhoLast: anyBid, contested: true }),
        all(len("partner_last_bid_suit", 4), hcp(low("b_cmp_cuebid_hcp"))),
        bidSuit("rho_bid_suit"),
        20,
        { shows: { hcp: { min: 10 }, forcing: true } },
      ),
      rule(
        "cue-three-card-support",
        "Cuebid: exactly 3-card major support, 10-11 (the dead forcing 1NT hand)",
        ctx("responder", { partnerLast: OUR_1_MAJOR, rhoLast: anyBid, contested: true }),
        all(
          len("partner_last_bid_suit", 3, 3),
          hcp(low("b_cmp_cuebid_3card_hcp"), high("b_cmp_cuebid_3card_hcp")),
        ),
        bidSuit("rho_bid_suit"),
        21,
        { shows: { hcp: { min: 10, max: 11 }, forcing: true } },
      ),
      rule(
        "cue-minor-support",
        "Cuebid: 5+ support for partner's minor, 10+ (the dead inverted minor)",
        ctx("responder", { partnerLast: OUR_1_MINOR, rhoLast: anyBid, contested: true }),
        all(len("partner_last_bid_suit", 5), hcp(low("b_cmp_cuebid_hcp"))),
        bidSuit("rho_bid_suit"),
        22,
        { shows: { hcp: { min: 10 }, forcing: true } },
      ),
      rule(
        "cue-catch-all",
        "Cuebid: nothing else fits, 10+ — describe next turn",
        ctx("responder", { partnerLast: OUR_1_SUIT, rhoLast: anyBid, contested: true }),
        hcp(low("b_cmp_cuebid_hcp")),
        bidSuit("rho_bid_suit"),
        23,
        { shows: { hcp: { min: 10 }, forcing: true } },
      ),
    ],
    {
      settings: [
        toggle(
          "b_cmp_interference_cuebid_on",
          "Cuebid under interference (page 15)",
          true,
          "The notes' systemic rule: limit raise, Jacoby 2NT, inverted minors and the forcing 1NT are OFF under interference and the cuebid carries those hands.",
        ),
        range("b_cmp_cuebid_hcp", "Cuebid under interference (HCP, notes say 10+)", 10, 21, {
          min: 6,
          max: 24,
        }),
        range(
          "b_cmp_cuebid_3card_hcp",
          "Cuebid with exactly 3-card major support (HCP)",
          10,
          11,
          { min: 6, max: 16 },
        ),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "cmp-cuebid-nt-reply",
    "Answering a cuebid: bid NT with a control in their suit",
    "Page 15's ADVANCED paragraph: \"If the partner has control in the opponent's suit then they should bid NT to show the control. Sometimes the cuebid is not made immediately but later after showing your own suit. This cuebid clearly asks the partner to bid NT at the right level if they have control in the opponent's suit.\" The worked example is 1♣-(1♥)-1♠; 3♣-3♥; 3NT — the 3♥ bid is a DELAYED cuebid asking exactly that question. So whenever partner has cued the opponents' suit, holding a stopper in it is an instruction to bid notrump at the cheapest available level. Two rules, because the seat that answers a cuebid can be the OPENER (partner is responder, the opponent who bid sits to my left) or the OVERCALLER (partner is advancer, the opener sits to my right) — the suit whose control matters is a different reference in each. \"At the right level\" is mechanized as the cheapest legal notrump: the notes give no ladder, and bidding notrump one level higher than necessary is not something the language can decide from a stopper alone.",
    "convention",
    [
      rule(
        "opener-answers-with-nt",
        "Opener answers responder's cuebid: NT with a control in their suit",
        ctx("opener", { partnerCued: true, contested: true, roundMin: 2 }),
        stopper("lho_bid_suit"),
        firstLegal("2N", "3N"),
        24,
      ),
      rule(
        "overcaller-answers-with-nt",
        "Overcaller answers advancer's cuebid: NT with a control in opener's suit",
        ctx("overcaller", { partnerCued: true, contested: true, roundMin: 2 }),
        stopper("rho_bid_suit"),
        firstLegal("2N", "3N"),
        24,
      ),
    ],
    {
      settings: [
        toggle(
          "b_cmp_cuebid_nt_reply_on",
          "Answer a cuebid with NT when you hold their suit (page 15)",
        ),
      ],
      sets: ["conventions"],
    },
  ),
  auctionItem(
    "cmp-negative-double",
    "Negative double",
    "Page 15: \"1a - (??) - X is NEGATIVE DOUBLE. It shows support for the other unbid suits or a very strong hand.\" Pages 16-17 add the boundary: a double of the opponents' suit OVERCALL, up to 2♠, over partner's opening suit bid. Both halves are mechanized. The SHAPE half needs the two unbid suits named, and the language has no \"both unbid suits\" reference (only `only_unbid_suit`, which needs three suits bid), so the twelve (our opening × their overcall) combinations are written out one rule each. What counts as \"support\" for each unbid suit is taken from the takeout double on page 4 — four-plus in an unbid major, three-plus in an unbid minor — because that is the only place these notes define support for unbid suits; the inference is stated here rather than hidden. The STRONG half (\"or a very strong hand\") gets no number from the notes: it is a setting defaulting to 16, the point at which responder is too strong to risk a natural call being passed. The floor for the shape half is also unstated and defaults to 6, the notes' general \"pass with < 6 pts\" discipline.",
    "convention",
    [
      // Our 1♣: their D/H/S overcall leaves {H,S} / {D,S} / {D,H} unbid.
      rule(
        "over-1c-their-d",
        "1♣-(1♦/2♦)-X — hearts and spades",
        ctx("responder", {
          partnerLast: is("1C"),
          rhoLast: bidAt({ min: 1, max: 2, strains: ["D"] }),
          contested: true,
        }),
        all(hcp(low("b_cmp_neg_dbl_hcp"), high("b_cmp_neg_dbl_hcp")), len("H", 4), len("S", 4)),
        dbl,
        25,
        { shows: { hcp: { min: 6 }, suits: [{ suit: "H", min: 4 }, { suit: "S", min: 4 }] } },
      ),
      rule(
        "over-1c-their-h",
        "1♣-(1♥/2♥)-X — spades and diamonds",
        ctx("responder", {
          partnerLast: is("1C"),
          rhoLast: bidAt({ min: 1, max: 2, strains: ["H"] }),
          contested: true,
        }),
        all(hcp(low("b_cmp_neg_dbl_hcp"), high("b_cmp_neg_dbl_hcp")), len("S", 4), len("D", 3)),
        dbl,
        25,
        { shows: { hcp: { min: 6 }, suits: [{ suit: "S", min: 4 }, { suit: "D", min: 3 }] } },
      ),
      rule(
        "over-1c-their-s",
        "1♣-(1♠/2♠)-X — hearts and diamonds",
        ctx("responder", {
          partnerLast: is("1C"),
          rhoLast: bidAt({ min: 1, max: 2, strains: ["S"] }),
          contested: true,
        }),
        all(hcp(low("b_cmp_neg_dbl_hcp"), high("b_cmp_neg_dbl_hcp")), len("H", 4), len("D", 3)),
        dbl,
        25,
        { shows: { hcp: { min: 6 }, suits: [{ suit: "H", min: 4 }, { suit: "D", min: 3 }] } },
      ),
      // Our 1♦: their C/H/S overcall leaves {H,S} / {C,S} / {C,H} unbid.
      rule(
        "over-1d-their-c",
        "1♦-(2♣)-X — hearts and spades",
        ctx("responder", {
          partnerLast: is("1D"),
          rhoLast: bidAt({ min: 1, max: 2, strains: ["C"] }),
          contested: true,
        }),
        all(hcp(low("b_cmp_neg_dbl_hcp"), high("b_cmp_neg_dbl_hcp")), len("H", 4), len("S", 4)),
        dbl,
        25,
        { shows: { hcp: { min: 6 }, suits: [{ suit: "H", min: 4 }, { suit: "S", min: 4 }] } },
      ),
      rule(
        "over-1d-their-h",
        "1♦-(1♥/2♥)-X — spades and clubs",
        ctx("responder", {
          partnerLast: is("1D"),
          rhoLast: bidAt({ min: 1, max: 2, strains: ["H"] }),
          contested: true,
        }),
        all(hcp(low("b_cmp_neg_dbl_hcp"), high("b_cmp_neg_dbl_hcp")), len("S", 4), len("C", 3)),
        dbl,
        25,
        { shows: { hcp: { min: 6 }, suits: [{ suit: "S", min: 4 }, { suit: "C", min: 3 }] } },
      ),
      rule(
        "over-1d-their-s",
        "1♦-(1♠/2♠)-X — hearts and clubs",
        ctx("responder", {
          partnerLast: is("1D"),
          rhoLast: bidAt({ min: 1, max: 2, strains: ["S"] }),
          contested: true,
        }),
        all(hcp(low("b_cmp_neg_dbl_hcp"), high("b_cmp_neg_dbl_hcp")), len("H", 4), len("C", 3)),
        dbl,
        25,
        { shows: { hcp: { min: 6 }, suits: [{ suit: "H", min: 4 }, { suit: "C", min: 3 }] } },
      ),
      // Our 1♥: their C/D/S overcall leaves {D,S} / {C,S} / {C,D} unbid.
      rule(
        "over-1h-their-c",
        "1♥-(2♣)-X — spades and diamonds",
        ctx("responder", {
          partnerLast: is("1H"),
          rhoLast: bidAt({ min: 1, max: 2, strains: ["C"] }),
          contested: true,
        }),
        all(hcp(low("b_cmp_neg_dbl_hcp"), high("b_cmp_neg_dbl_hcp")), len("S", 4), len("D", 3)),
        dbl,
        26,
        { shows: { hcp: { min: 6 }, suits: [{ suit: "S", min: 4 }, { suit: "D", min: 3 }] } },
      ),
      rule(
        "over-1h-their-d",
        "1♥-(2♦)-X — spades and clubs",
        ctx("responder", {
          partnerLast: is("1H"),
          rhoLast: bidAt({ min: 1, max: 2, strains: ["D"] }),
          contested: true,
        }),
        all(hcp(low("b_cmp_neg_dbl_hcp"), high("b_cmp_neg_dbl_hcp")), len("S", 4), len("C", 3)),
        dbl,
        26,
        { shows: { hcp: { min: 6 }, suits: [{ suit: "S", min: 4 }, { suit: "C", min: 3 }] } },
      ),
      rule(
        "over-1h-their-s",
        "1♥-(1♠/2♠)-X — both minors",
        ctx("responder", {
          partnerLast: is("1H"),
          rhoLast: bidAt({ min: 1, max: 2, strains: ["S"] }),
          contested: true,
        }),
        all(hcp(low("b_cmp_neg_dbl_hcp"), high("b_cmp_neg_dbl_hcp")), len("D", 3), len("C", 3)),
        dbl,
        26,
        { shows: { hcp: { min: 6 }, suits: [{ suit: "D", min: 3 }, { suit: "C", min: 3 }] } },
      ),
      // Our 1♠: their C/D/H overcall leaves {D,H} / {C,H} / {C,D} unbid.
      rule(
        "over-1s-their-c",
        "1♠-(2♣)-X — hearts and diamonds",
        ctx("responder", {
          partnerLast: is("1S"),
          rhoLast: bidAt({ min: 1, max: 2, strains: ["C"] }),
          contested: true,
        }),
        all(hcp(low("b_cmp_neg_dbl_hcp"), high("b_cmp_neg_dbl_hcp")), len("H", 4), len("D", 3)),
        dbl,
        26,
        { shows: { hcp: { min: 6 }, suits: [{ suit: "H", min: 4 }, { suit: "D", min: 3 }] } },
      ),
      rule(
        "over-1s-their-d",
        "1♠-(2♦)-X — hearts and clubs",
        ctx("responder", {
          partnerLast: is("1S"),
          rhoLast: bidAt({ min: 1, max: 2, strains: ["D"] }),
          contested: true,
        }),
        all(hcp(low("b_cmp_neg_dbl_hcp"), high("b_cmp_neg_dbl_hcp")), len("H", 4), len("C", 3)),
        dbl,
        26,
        { shows: { hcp: { min: 6 }, suits: [{ suit: "H", min: 4 }, { suit: "C", min: 3 }] } },
      ),
      rule(
        "over-1s-their-h",
        "1♠-(2♥)-X — both minors",
        ctx("responder", {
          partnerLast: is("1S"),
          rhoLast: bidAt({ min: 1, max: 2, strains: ["H"] }),
          contested: true,
        }),
        all(hcp(low("b_cmp_neg_dbl_hcp"), high("b_cmp_neg_dbl_hcp")), len("D", 3), len("C", 3)),
        dbl,
        26,
        { shows: { hcp: { min: 6 }, suits: [{ suit: "D", min: 3 }, { suit: "C", min: 3 }] } },
      ),
      rule(
        "very-strong-hand",
        "Negative double with a VERY STRONG hand (notes state no number)",
        ctx("responder", {
          partnerLast: OUR_1_SUIT,
          rhoLast: bidAt({ min: 1, max: 2, strains: ["C", "D", "H", "S"] }),
          contested: true,
        }),
        hcp(low("b_cmp_neg_dbl_strong_hcp")),
        dbl,
        26,
        { shows: { hcp: { min: 16 } } },
      ),
    ],
    {
      settings: [
        toggle("b_cmp_neg_dbl_on", "Negative doubles (pages 15, 16-17)"),
        range("b_cmp_neg_dbl_hcp", "Negative double range (HCP, notes state none)", 6, 21, {
          min: 0,
          max: 24,
        }),
        range(
          "b_cmp_neg_dbl_strong_hcp",
          "Negative double: the \"very strong hand\" floor (HCP, notes state none)",
          16,
          21,
          { min: 11, max: 24 },
        ),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "cmp-two-over-one-interference",
    "The 2/1 under interference: 10+ and a real 5-card suit",
    "Page 15: \"Make a 2/1 bid to show 10+ pts and your own 5+ card suit (forcing 1 round)\". Uncontested, the six 2/1 bids are GAME FORCING and a 2/1 in a minor may be a four-carder (page 3). Under interference both of those change: the point requirement drops from 12+ to 10+, the bid promises a genuine FIVE-card suit, and it is forcing for ONE ROUND rather than to game. That single sentence is why a fellow cannot reuse the uncontested 2/1 item here — it is a different bid with the same name.",
    "bidding_rule",
    [
      rule(
        "two-over-one",
        "2/1 under interference (10+, 5+ suit, forcing one round)",
        ctx("responder", { partnerLast: OUR_1_SUIT, rhoLast: anyBid, contested: true }),
        all(hcp(low("b_cmp_two_over_one_hcp")), len("own_longest_suit", 5)),
        bidLongest(["S", "H", "D", "C"], 2),
        60,
        { shows: { hcp: { min: 10 }, forcing: true } },
      ),
    ],
    {
      settings: [
        range(
          "b_cmp_two_over_one_hcp",
          "2/1 under interference (HCP, notes say 10+ not 12+)",
          10,
          21,
          { min: 6, max: 24 },
        ),
      ],
    },
  ),

  auctionItem(
    "cmp-raises-interference",
    "Natural raises under interference (2M/3M and 2m/3m)",
    "Page 15, verbatim: \"1M - (??) - 2M shows 3+ card weak support (6-9 pts), and 3M is used for preemptive 4+ card support (0-5 pts)\" and \"1m - (??) - 2m is available for weak support (6-9 pts). Use it to show 5+ card support and use 3m to show 5+ card preemptive support with 0-5 pts.\" Note what the minor raises do: with the inverted-minor scheme switched off, 2m goes back to being the WEAK raise and 3m becomes the preempt — the exact opposite of the uncontested auction, where 2m shows 10+ and 3m shows 6-9. Both raises need FIVE-card support in a minor and only three in a major (four for the major preempt), as the notes state. Each rule is emitted twice, once over their bid and once over their double, because page 15 says the map over a double is the same one minus the cuebid.",
    "bidding_rule",
    [
      ...overInterference(
        rule(
          "weak-major-raise",
          "1M-(x)-2M — weak 3+ card support (6-9)",
          ctx("responder", { partnerLast: OUR_1_MAJOR, contested: true }),
          all(
            len("partner_last_bid_suit", 3),
            hcp(low("b_cmp_weak_raise_hcp"), high("b_cmp_weak_raise_hcp")),
          ),
          raise(2),
          61,
          { shows: { hcp: { min: 6, max: 9 } } },
        ),
      ),
      ...overInterference(
        rule(
          "preemptive-major-raise",
          "1M-(x)-3M — preemptive 4+ card support (0-5)",
          ctx("responder", { partnerLast: OUR_1_MAJOR, contested: true }),
          all(
            len("partner_last_bid_suit", 4),
            hcp(low("b_cmp_preempt_raise_hcp"), high("b_cmp_preempt_raise_hcp")),
          ),
          raise(3),
          62,
          { shows: { hcp: { min: 0, max: 5 } } },
        ),
      ),
      ...overInterference(
        rule(
          "weak-minor-raise",
          "1m-(x)-2m — weak 5+ card support (6-9), inverted minors OFF",
          ctx("responder", { partnerLast: OUR_1_MINOR, contested: true }),
          all(
            len("partner_last_bid_suit", 5),
            hcp(low("b_cmp_weak_raise_hcp"), high("b_cmp_weak_raise_hcp")),
          ),
          raise(2),
          63,
          { shows: { hcp: { min: 6, max: 9 } } },
        ),
      ),
      ...overInterference(
        rule(
          "preemptive-minor-raise",
          "1m-(x)-3m — preemptive 5+ card support (0-5)",
          ctx("responder", { partnerLast: OUR_1_MINOR, contested: true }),
          all(
            len("partner_last_bid_suit", 5),
            hcp(low("b_cmp_preempt_raise_hcp"), high("b_cmp_preempt_raise_hcp")),
          ),
          raise(3),
          64,
          { shows: { hcp: { min: 0, max: 5 } } },
        ),
      ),
    ],
    {
      settings: [
        range("b_cmp_weak_raise_hcp", "Weak raise under interference (HCP)", 6, 9, {
          min: 0,
          max: 12,
        }),
        range("b_cmp_preempt_raise_hcp", "Preemptive raise under interference (HCP)", 0, 5, {
          min: 0,
          max: 10,
        }),
      ],
    },
  ),

  auctionItem(
    "cmp-nt-interference",
    "Natural 1NT and 2NT under interference",
    "Page 15: \"1a - (??) - 2N is available as a natural NT. Use it to show 10-11 pts, with no support for partner and control in the opponent's suit\" and \"1M - (??) - 1N is not Forcing NT but a natural NT with 6-9 pts, with no support for partner and control in the opponent's suit.\" So both notrump responses mean what they say: 1NT is 6-9, 2NT is 10-11, both deny support and both promise a CONTROL in the suit the opponents bid. \"No support\" is mechanized as at most two cards in partner's suit — the raise items own three-plus (a major) and five-plus (a minor). Over a DOUBLE there is no opponents' suit to hold a control in, so those rules drop the stopper requirement and keep the point bands; that is page 15's own \"other bids are similar … but without a cuebid being available\", read the only way it can be read.",
    "bidding_rule",
    [
      rule(
        "one-nt-over-bid",
        "1M-(bid)-1NT — natural 6-9, no support, control in their suit",
        ctx("responder", { partnerLast: OUR_1_MAJOR, rhoLast: anyBid, contested: true }),
        all(
          len("partner_last_bid_suit", undefined, 2),
          hcp(low("b_cmp_nt_1level_hcp"), high("b_cmp_nt_1level_hcp")),
          stopper("rho_bid_suit"),
        ),
        bid(1, "N"),
        65,
        { shows: { hcp: { min: 6, max: 9 }, forcing: false } },
      ),
      rule(
        "one-nt-over-double",
        "1M-(X)-1NT — natural 6-9, no support (no suit to control)",
        ctx("responder", { partnerLast: OUR_1_MAJOR, rhoLast: doubled, contested: true }),
        all(
          len("partner_last_bid_suit", undefined, 2),
          hcp(low("b_cmp_nt_1level_hcp"), high("b_cmp_nt_1level_hcp")),
        ),
        bid(1, "N"),
        66,
        { shows: { hcp: { min: 6, max: 9 }, forcing: false } },
      ),
      rule(
        "two-nt-over-bid",
        "1x-(bid)-2NT — natural 10-11, no support, control in their suit",
        ctx("responder", { partnerLast: OUR_1_SUIT, rhoLast: anyBid, contested: true }),
        all(
          len("partner_last_bid_suit", undefined, 2),
          hcp(low("b_cmp_nt_2level_hcp"), high("b_cmp_nt_2level_hcp")),
          stopper("rho_bid_suit"),
        ),
        bid(2, "N"),
        67,
        { shows: { hcp: { min: 10, max: 11 }, forcing: false } },
      ),
      rule(
        "two-nt-over-double",
        "1x-(X)-2NT — natural 10-11, no support (no suit to control)",
        ctx("responder", { partnerLast: OUR_1_SUIT, rhoLast: doubled, contested: true }),
        all(
          len("partner_last_bid_suit", undefined, 2),
          hcp(low("b_cmp_nt_2level_hcp"), high("b_cmp_nt_2level_hcp")),
        ),
        bid(2, "N"),
        68,
        { shows: { hcp: { min: 10, max: 11 }, forcing: false } },
      ),
    ],
    {
      settings: [
        range("b_cmp_nt_1level_hcp", "1NT under interference (HCP)", 6, 9, { min: 0, max: 12 }),
        range("b_cmp_nt_2level_hcp", "2NT under interference (HCP)", 10, 11, { min: 6, max: 16 }),
      ],
    },
  ),

  auctionItem(
    "cmp-splinter-interference",
    "Splinters survive interference",
    "Page 15's list of what changes ends with one line about what does NOT: \"Splinter bids: shows shortness in the bid suit with GF values\". Every other convention is off, the splinter stays on — so a double jump into a singleton or void still shows game-forcing support for partner's major. Pages 16-17 supply the definition the page-15 line assumes: \"Double jump in a suit that is short (void or singleton)\". Because a double jump is a LEVEL relative to the suit, the rules are written per opening: over 1♠ the splinters are 4♣/4♦/4♥, over 1♥ they are 3♠ and 4♣/4♦. Game-forcing values are measured in TOTAL points, not HCP, because a splinter hand is a shape hand — the notes' own bands are point bands including distribution.",
    "convention",
    [
      ...overInterference(
        rule(
          "splinter-over-1s",
          "1♠-(x)-4 of my short suit — GF spade support with shortness",
          ctx("responder", { partnerLast: is("1S"), contested: true }),
          all(
            len("S", 4),
            tp(low("b_cmp_splinter_tp")),
            len("own_shortest_suit", undefined, 1),
          ),
          bidSuit("own_shortest_suit", 4),
          57,
          { shows: { tp: { min: 12 }, suits: [{ suit: "S", min: 4 }], forcing: true } },
        ),
      ),
      ...overInterference(
        rule(
          "splinter-over-1h-spades",
          "1♥-(x)-3♠ — GF heart support with spade shortness",
          ctx("responder", { partnerLast: is("1H"), contested: true }),
          all(len("H", 4), tp(low("b_cmp_splinter_tp")), len("S", undefined, 1)),
          bid(3, "S"),
          57,
          { shows: { tp: { min: 12 }, suits: [{ suit: "H", min: 4 }], forcing: true } },
        ),
      ),
      ...overInterference(
        rule(
          "splinter-over-1h-minor",
          "1♥-(x)-4 of a short minor — GF heart support with minor shortness",
          ctx("responder", { partnerLast: is("1H"), contested: true }),
          all(
            len("H", 4),
            tp(low("b_cmp_splinter_tp")),
            len("own_shortest_suit", undefined, 1),
            not(len("S", undefined, 1)),
          ),
          bidSuit("own_shortest_suit", 4),
          58,
          { shows: { tp: { min: 12 }, suits: [{ suit: "H", min: 4 }], forcing: true } },
        ),
      ),
    ],
    {
      settings: [
        toggle("b_cmp_splinter_on", "Splinters stay ON under interference (page 15)"),
        range(
          "b_cmp_splinter_tp",
          "Splinter: game-forcing values (total points)",
          12,
          21,
          { min: 9, max: 24 },
        ),
      ],
      sets: ["conventions"],
    },
  ),

  // -------------------------------------------------------------------------
  // Pages 15 and 26 — redouble of a takeout double
  // -------------------------------------------------------------------------
  auctionItem(
    "cmp-redouble",
    "Redouble of a takeout double — \"this is our hand\"",
    "Page 26 is a whole page on one call. The redouble of an opponent's takeout double of partner's opening promises 10+ HCP, says the majority of the strength is OURS, is FORCING for one round (partner cannot simply pass), and — the part that outlives the auction — makes EVERY later double by our partnership a PENALTY double. Page 26 adds that it \"typically DENIES a fit in your partner's opening suit\", and that with a preference for an unbid suit you bid that suit AFTER the redouble. THE TWO PAGES DISAGREE ABOUT SUPPORT. Page 15 says \"REDOUBLE to show any 10+ pts hand (may have support). Later we will add separate bids to handle 10+ pts with support so that redouble will show 10+ pts with no support. For now, redouble and then show support later.\" Page 26 says it usually denies a fit. Page 15's reading is the one encoded, because it is the explicit instruction for what to do NOW (\"for now, redouble and then show support later\") while page 26's is a tendency (\"often\") — and because with the cuebid unavailable over a double, the 10+ hands have nowhere else to go. The other reading is one dial away: `b_cmp_redouble_max_support` is the most cards allowed in partner's suit, default 13 (no restriction, page 15); set it to 2 and the redouble denies a fit exactly as page 26 describes.",
    "convention",
    [
      rule(
        "redouble",
        "Redouble their takeout double (10+, forcing one round)",
        ctx("responder", { partnerLast: OUR_OPENING, rhoLast: doubled, contested: true }),
        all(
          hcp(low("b_cmp_redouble_hcp")),
          len("partner_last_bid_suit", undefined, high("b_cmp_redouble_max_support")),
        ),
        rdbl,
        54,
        { shows: { hcp: { min: 10 }, forcing: true } },
      ),
      rule(
        "bid-unbid-suit-later",
        "After the redouble, bid your unbid suit (page 26)",
        ctx("responder", { ownFirst: is("XX"), contested: true, roundMin: 2 }),
        len("own_longest_suit", 5),
        bidLongest(["S", "H", "D", "C"]),
        55,
        { shows: { hcp: { min: 10 } } },
      ),
    ],
    {
      settings: [
        toggle("b_cmp_redouble_on", "Redouble of a takeout double (pages 15, 26)"),
        range("b_cmp_redouble_hcp", "Redouble range (HCP, notes say 10+)", 10, 21, {
          min: 6,
          max: 24,
        }),
        range(
          "b_cmp_redouble_max_support",
          "Redouble: most cards allowed in partner's suit (13 = page 15, 2 = page 26's \"denies a fit\")",
          0,
          13,
          { min: 0, max: 13 },
        ),
      ],
      sets: ["conventions"],
    },
  ),

  item(
    "cmp-redouble-aftermath",
    "What the redouble does to the rest of the auction",
    "Page 26 spells out the follow-up, and it is all judgment rather than a rule. Partner will typically PASS, trusting the redouble; the opponents must bid to escape the double; and once they do, our next double is the penalty double the redouble promised. Two things here the knowledge language cannot say: a double cannot be TAGGED \"penalty\" for the inference pass (there is no such field on a rule's meaning, only forcing/points/lengths), and \"we are beating this contract\" is not a hand condition. So the penalty-double consequence is documented for the player and deliberately NOT mechanized — a rule that doubled on strength alone would double the wrong contracts. Page 15's companion line, \"all other bids are weak except when you bid a suit and keep bidding later\", is what the natural-raise and natural-NT items encode: over a double, 2M/3M and 1NT/2NT keep their weak natural meanings and only the redouble shows real values.",
    "judgment_guideline",
    "auction",
    { kind: "none" },
  ),
  // -------------------------------------------------------------------------
  // Page 4 — the takeout double (two hand types), and the doubler's discipline
  // -------------------------------------------------------------------------
  auctionItem(
    "cmp-takeout-double",
    "Takeout double — two hand types",
    "Page 4 gives the takeout double exactly two hand types, and the second one is a shape promise, not a strength promise. When an opponent opens with a suit bid UP TO 4♥ you may double to show either: (1) 18+ points with ANY pattern — plan to bid or double again to show the strong hand; or (2) 12-17 points with support for all unbid suits, \"typically at least 4 cards in each unbid major and 3 cards in each unbid minor\". The 12-17 shape rules are written out per opening suit because the unbid suits differ: over 1♣ that is four spades, four hearts and three diamonds; over 1♠ it is four hearts, three diamonds and three clubs. \"Up to 4♥\" is encoded exactly — openings 1♣ through 3♠, plus 4♣, 4♦ and 4♥, and never 4♠. Above the one level the unbid suits cannot be enumerated the same way (a weak two leaves three suits open and no reference names them all), so those rules use shortness in their suit plus the point band and the item says so rather than pretending otherwise.",
    "convention",
    [
      rule(
        "strong-any-pattern",
        "Takeout double: 18+, any pattern (1♣ through 3♠)",
        ctx("overcaller", { rhoLast: THEIR_OPENING_1_3 }),
        hcp(low("b_cmp_takeout_dbl_strong_hcp")),
        dbl,
        42,
        { shows: { hcp: { min: 18 }, forcing: true } },
      ),
      rule(
        "strong-any-pattern-four",
        "Takeout double: 18+, any pattern (4♣/4♦/4♥ — never 4♠)",
        ctx("overcaller", { rhoLast: THEIR_OPENING_4 }),
        hcp(low("b_cmp_takeout_dbl_strong_hcp")),
        dbl,
        42,
        { shows: { hcp: { min: 18 }, forcing: true } },
      ),
      rule(
        "shape-over-1c",
        "Takeout double of 1♣: 12-17 with 4♠, 4♥ and 3♦",
        ctx("overcaller", { rhoLast: is("1C") }),
        all(
          hcp(low("b_cmp_takeout_dbl_hcp"), high("b_cmp_takeout_dbl_hcp")),
          len("S", 4),
          len("H", 4),
          len("D", 3),
        ),
        dbl,
        42,
        { shows: { hcp: { min: 12, max: 17 }, forcing: true } },
      ),
      rule(
        "shape-over-1d",
        "Takeout double of 1♦: 12-17 with 4♠, 4♥ and 3♣",
        ctx("overcaller", { rhoLast: is("1D") }),
        all(
          hcp(low("b_cmp_takeout_dbl_hcp"), high("b_cmp_takeout_dbl_hcp")),
          len("S", 4),
          len("H", 4),
          len("C", 3),
        ),
        dbl,
        42,
        { shows: { hcp: { min: 12, max: 17 }, forcing: true } },
      ),
      rule(
        "shape-over-1h",
        "Takeout double of 1♥: 12-17 with 4♠, 3♦ and 3♣",
        ctx("overcaller", { rhoLast: is("1H") }),
        all(
          hcp(low("b_cmp_takeout_dbl_hcp"), high("b_cmp_takeout_dbl_hcp")),
          len("S", 4),
          len("D", 3),
          len("C", 3),
        ),
        dbl,
        42,
        { shows: { hcp: { min: 12, max: 17 }, forcing: true } },
      ),
      rule(
        "shape-over-1s",
        "Takeout double of 1♠: 12-17 with 4♥, 3♦ and 3♣",
        ctx("overcaller", { rhoLast: is("1S") }),
        all(
          hcp(low("b_cmp_takeout_dbl_hcp"), high("b_cmp_takeout_dbl_hcp")),
          len("H", 4),
          len("D", 3),
          len("C", 3),
        ),
        dbl,
        42,
        { shows: { hcp: { min: 12, max: 17 }, forcing: true } },
      ),
      rule(
        "shape-over-preempt",
        "Takeout double of a 2/3-level opening: 12-17, short in their suit",
        ctx("overcaller", { rhoLast: bidAt({ min: 2, max: 3, strains: ["C", "D", "H", "S"] }) }),
        all(
          hcp(low("b_cmp_takeout_dbl_hcp"), high("b_cmp_takeout_dbl_hcp")),
          len("rho_bid_suit", undefined, 2),
        ),
        dbl,
        42,
        { shows: { hcp: { min: 12, max: 17 }, forcing: true } },
      ),
      rule(
        "shape-over-four",
        "Takeout double of 4♣/4♦/4♥: 12-17, short in their suit",
        ctx("overcaller", { rhoLast: THEIR_OPENING_4 }),
        all(
          hcp(low("b_cmp_takeout_dbl_hcp"), high("b_cmp_takeout_dbl_hcp")),
          len("rho_bid_suit", undefined, 2),
        ),
        dbl,
        42,
        { shows: { hcp: { min: 12, max: 17 }, forcing: true } },
      ),
    ],
    {
      settings: [
        toggle("b_cmp_takeout_dbl_on", "Takeout doubles (pages 4, 16-17)"),
        range("b_cmp_takeout_dbl_hcp", "Takeout double: the shape hand (HCP)", 12, 17, {
          min: 9,
          max: 21,
        }),
        range(
          "b_cmp_takeout_dbl_strong_hcp",
          "Takeout double: the strong hand, any pattern (HCP, notes say 18+)",
          18,
          24,
          { min: 14, max: 30 },
        ),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "cmp-takeout-double-rebids",
    "The doubler's second call — and the discipline of not making one",
    "Page 4's instruction to the doubler is a prohibition: with the 12-17 shape hand, \"do not bid again unless the partner (called advancer) makes an invitational or a forcing bid\". The double has already shown the hand; bidding again over-describes it and gets the partnership too high, because advancer has been bidding on the assumption that the doubler holds 12-17 and will pass. With 18+ the opposite is true: the notes say to \"plan to bid or double again to show the strong hand\", so the strong hand names its own suit if it has a five-carder and otherwise doubles again. ONE LANGUAGE LIMIT, stated plainly: the language cannot test whether partner's call was a JUMP, so \"unless the advancer makes an invitational bid\" is not machine-detectable — the pass rule fires on the 12-17 band alone. Advancer's FORCING call (the cuebid) is handled properly, by the forcing-situations item, which removes pass from the doubler's options.",
    "convention",
    [
      rule(
        "bid-own-suit-strong",
        "Double, then bid my own 5+ suit (18+)",
        ctx("overcaller", { ownFirst: doubled, roundMin: 2 }),
        all(hcp(low("b_cmp_takeout_dbl_strong_hcp")), len("own_longest_suit", 5)),
        bidLongest(["S", "H", "D", "C"]),
        43,
        { shows: { hcp: { min: 18 } } },
      ),
      rule(
        "double-again-strong",
        "Double, then double again (18+, they bid on)",
        ctx("overcaller", { ownFirst: doubled, rhoLast: anyBid, roundMin: 2 }),
        hcp(low("b_cmp_takeout_dbl_strong_hcp")),
        dbl,
        44,
        { shows: { hcp: { min: 18 } } },
      ),
      rule(
        "pass-the-shape-hand",
        "Double, then PASS (12-17 — the notes' discipline)",
        ctx("overcaller", { ownFirst: doubled, partnerLast: anyBid, roundMin: 2 }),
        hcp(undefined, high("b_cmp_takeout_dbl_hcp")),
        pass,
        45,
        { shows: { hcp: { max: 17 } } },
      ),
    ],
    {
      settings: [
        toggle("b_cmp_takeout_dbl_rebids_on", "The doubler's second call (page 4)"),
      ],
      sets: ["conventions"],
    },
  ),

  item(
    "cmp-advance-assumption",
    "How the advancer thinks about partner's takeout double",
    "Page 4 tells the advancer what to ASSUME before it tells them what to bid, and the assumption is the whole method: \"The ADVANCER bids assuming the doubler has the 12-17 points hand and is going to pass at the next turn.\" Everything follows from that. If the doubler will pass, then a cheap bid ends the auction — so advancer must bid the level the hand is worth, invite when game is LIKELY and force when game is CERTAIN, rather than making a minimum noise and hoping to be asked again. Partner has promised support for the unbid suits, so bidding one of them is safe even on rubbish. And advancer is FORCED to bid unless the right-hand opponent has bid: if RHO speaks, advancer is off the hook and may pass a hand with fewer than six points, but should still bid at the right level with 6+.",
    "judgment_guideline",
    "auction",
    { kind: "none" },
  ),

  auctionItem(
    "cmp-advance-takeout-double",
    "Advancing partner's takeout double",
    "Page 4's advancer, fully. FORCED to bid when RHO has not bid, so with 0-8 and nothing better, name your best suit at the CHEAPEST level. INVITATIONAL when game is likely: \"jump bid in their best suit or in NT\" — the jump in a suit is written out per opening suit, because which level IS a jump depends on their opening (over 1♣ every jump is at the two level; over 1♠ every jump is at the three level), and the jump in notrump is 2NT with a control in opener's suit. FORCING when game is certain: the CUEBID of opener's suit. PASS in two places only — off the hook with fewer than six points once RHO has bid, and the rare PENALTY PASS \"when they think it is more profitable to let the opponents play the doubled contract, hoping to defeat them by at least 2 tricks\". The notes give no numbers for the invitational band, the forcing floor or the penalty pass, so all three are settings with the reasoning named: invitational 9-11 (above the 6-9 low band, below the 12+ high band the notes use for a responder), forcing 12+ (the notes' own \"high\" band, which opposite a promised 12-17 makes game certain), penalty pass 8+ with five-plus cards in opener's suit (defensive strength plus the trump length that beats a contract by two).",
    "convention",
    [
      rule(
        "penalty-pass",
        "PENALTY PASS — five of their suit and defensive values",
        ctx("advancer", { partnerLast: doubled, lhoLast: anyBid }),
        all(len("lho_bid_suit", 5), hcp(low("b_cmp_advance_penalty_pass_hcp"))),
        pass,
        46,
      ),
      rule(
        "off-the-hook-pass",
        "RHO bid — off the hook, pass with fewer than six",
        ctx("advancer", { partnerLast: doubled, rhoLast: anyBid }),
        hcp(undefined, 5),
        pass,
        47,
        { shows: { hcp: { max: 5 } } },
      ),
      rule(
        "cue-game-force",
        "CUEBID opener's suit — forcing, game is certain",
        ctx("advancer", { partnerLast: doubled, lhoLast: anyBid }),
        hcp(low("b_cmp_advance_force_hcp")),
        bidSuit("lho_bid_suit"),
        48,
        { shows: { hcp: { min: 12 }, forcing: true } },
      ),
      rule(
        "jump-notrump",
        "Jump to 2NT — invitational, with a control in opener's suit",
        ctx("advancer", { partnerLast: doubled, lhoLast: THEIR_1_SUIT }),
        all(
          hcp(low("b_cmp_advance_invite_hcp"), high("b_cmp_advance_invite_hcp")),
          stopper("lho_bid_suit"),
        ),
        bid(2, "N"),
        49,
        { shows: { hcp: { min: 9, max: 11 } } },
      ),
      rule(
        "jump-over-1c",
        "Jump in a new suit over their 1♣ — invitational",
        ctx("advancer", { partnerLast: doubled, lhoLast: is("1C") }),
        all(
          hcp(low("b_cmp_advance_invite_hcp"), high("b_cmp_advance_invite_hcp")),
          len("own_longest_suit", 4),
        ),
        bidLongest(["S", "H", "D"], 2),
        50,
        { shows: { hcp: { min: 9, max: 11 } } },
      ),
      rule(
        "jump-over-1d-major",
        "Jump in a major over their 1♦ — invitational",
        ctx("advancer", { partnerLast: doubled, lhoLast: is("1D") }),
        all(
          hcp(low("b_cmp_advance_invite_hcp"), high("b_cmp_advance_invite_hcp")),
          any(len("S", 4), len("H", 4)),
        ),
        bidLongest(["S", "H"], 2),
        50,
        { shows: { hcp: { min: 9, max: 11 } } },
      ),
      rule(
        "jump-over-1h-spades",
        "Jump to 2♠ over their 1♥ — invitational",
        ctx("advancer", { partnerLast: doubled, lhoLast: is("1H") }),
        all(
          hcp(low("b_cmp_advance_invite_hcp"), high("b_cmp_advance_invite_hcp")),
          len("S", 4),
        ),
        bid(2, "S"),
        50,
        { shows: { hcp: { min: 9, max: 11 }, suits: [{ suit: "S", min: 4 }] } },
      ),
      rule(
        "jump-over-1d-clubs",
        "Jump to 3♣ over their 1♦ — invitational",
        ctx("advancer", { partnerLast: doubled, lhoLast: is("1D") }),
        all(
          hcp(low("b_cmp_advance_invite_hcp"), high("b_cmp_advance_invite_hcp")),
          len("C", 4),
        ),
        bid(3, "C"),
        51,
        { shows: { hcp: { min: 9, max: 11 }, suits: [{ suit: "C", min: 4 }] } },
      ),
      rule(
        "jump-over-1h-minor",
        "Jump in a minor over their 1♥ — invitational",
        ctx("advancer", { partnerLast: doubled, lhoLast: is("1H") }),
        all(
          hcp(low("b_cmp_advance_invite_hcp"), high("b_cmp_advance_invite_hcp")),
          any(len("D", 4), len("C", 4)),
        ),
        bidLongest(["D", "C"], 3),
        51,
        { shows: { hcp: { min: 9, max: 11 } } },
      ),
      rule(
        "jump-over-1s",
        "Jump in a new suit over their 1♠ — invitational",
        ctx("advancer", { partnerLast: doubled, lhoLast: is("1S") }),
        all(
          hcp(low("b_cmp_advance_invite_hcp"), high("b_cmp_advance_invite_hcp")),
          any(len("H", 4), len("D", 4), len("C", 4)),
        ),
        bidLongest(["H", "D", "C"], 3),
        51,
        { shows: { hcp: { min: 9, max: 11 } } },
      ),
      rule(
        "cheapest-suit",
        "Best suit at the cheapest level (0-8) — advancer is forced to bid",
        ctx("advancer", { partnerLast: doubled }),
        len("own_longest_suit", 4),
        bidLongest(["S", "H", "D", "C"]),
        52,
      ),
      rule(
        "cheapest-suit-any",
        "Best suit at the cheapest level (no four-card suit anywhere)",
        ctx("advancer", { partnerLast: doubled }),
        { all: [] },
        bidLongest(["S", "H", "D", "C"]),
        53,
      ),
    ],
    {
      settings: [
        toggle("b_cmp_advance_dbl_on", "Advancer's actions over a takeout double (page 4)"),
        range(
          "b_cmp_advance_invite_hcp",
          "Advancer's invitational jump (HCP, notes state none)",
          9,
          11,
          { min: 6, max: 15 },
        ),
        range(
          "b_cmp_advance_force_hcp",
          "Advancer's forcing cuebid (HCP, notes say \"game is certain\")",
          12,
          21,
          { min: 9, max: 24 },
        ),
        range(
          "b_cmp_advance_penalty_pass_hcp",
          "Advancer's penalty pass (HCP, notes state none)",
          8,
          21,
          { min: 0, max: 24 },
        ),
      ],
      sets: ["conventions"],
    },
  ),

  // -------------------------------------------------------------------------
  // Pages 4-5 — overcalls
  // -------------------------------------------------------------------------
  auctionItem(
    "cmp-overcall-one-level",
    "One-level overcall (8-17)",
    "Page 4: \"when an opponent opens the bidding, and if a Takeout Double is not appropriate, consider bidding your 5+ card suit. At one level, you can overcall with as little as 8 points. The overcall range would be 8-17 since they would have Doubled with 18+ points.\" The notes DERIVE the ceiling rather than assert it, and they name the floor deliberately: 8 is where the range starts because the takeout double owns everything from 18 up, and a one-level overcall is a cheap descriptive call, not an opening bid. The whole 8-17 band is a setting so a partnership that wants sounder overcalls raises the floor instead of the item being quietly \"corrected\" — the notes' own choice is encoded as written. Five-plus cards is page 1's rule that a first natural suit bid shows 5+, restated here.",
    "agreement",
    [
      rule(
        "one-level",
        "One-level overcall (5+ suit, 8-17)",
        ctx("overcaller", { rhoLast: THEIR_1_SUIT }),
        all(
          hcp(low("b_cmp_overcall_1lvl_hcp"), high("b_cmp_overcall_1lvl_hcp")),
          len("own_longest_suit", 5),
        ),
        bidLongest(["S", "H", "D", "C"], 1),
        69,
        { shows: { hcp: { min: 8, max: 17 } } },
      ),
    ],
    {
      settings: [
        range("b_cmp_overcall_1lvl_hcp", "One-level overcall range (HCP)", 8, 17, {
          min: 4,
          max: 20,
        }),
      ],
    },
  ),

  auctionItem(
    "cmp-overcall-two-level",
    "Two-level overcall (12+ and a GOOD suit)",
    "Page 5: \"To overcall at a 2-level, you need 12+ pts and a good suit.\" Four points more than the one-level floor, and the suit itself has to be worth the level — \"good suit\" is mechanized as two of the top three honors, the language's own suit-quality test. The notes state no ceiling here; the 18+ hands double instead (page 4), so the setting's default upper bound is 17 and the item says where that came from rather than pretending the notes wrote it.",
    "agreement",
    [
      rule(
        "two-level",
        "Two-level overcall (5+ good suit, 12-17)",
        ctx("overcaller", { rhoLast: bidAt({ min: 1, max: 2, strains: ["C", "D", "H", "S"] }) }),
        all(
          hcp(low("b_cmp_overcall_2lvl_hcp"), high("b_cmp_overcall_2lvl_hcp")),
          len("own_longest_suit", 5),
          quality("own_longest_suit"),
        ),
        bidLongest(["S", "H", "D", "C"], 2),
        70,
        { shows: { hcp: { min: 12, max: 17 } } },
      ),
    ],
    {
      settings: [
        range("b_cmp_overcall_2lvl_hcp", "Two-level overcall range (HCP)", 12, 17, {
          min: 8,
          max: 20,
        }),
      ],
    },
  ),

  item(
    "cmp-overcall-vulnerability",
    "Vulnerable overcalls: do not shade",
    "Page 5, immediately after the two-level overcall: \"If you are Vul, do not cheat on the points or the suit quality as the opponents can double you and defeat you for a huge loss.\" This is a prohibition rather than a table, and it is honoured here by what the rules do NOT contain: there is no lighter vulnerable variant of either overcall, and no vulnerability-relaxed suit-quality test. The 8-17 one-level band and the 12+ two-level band with two of the top three honors apply at every vulnerability, and a hand that only qualifies by shading simply has no overcall. Page 5's related judgment about sacrifices sits with the preempt material: down two vulnerable or down three non-vulnerable is a good save against a vulnerable game, down one vulnerable or down two non-vulnerable against a non-vulnerable game.",
    "judgment_guideline",
    "auction",
    { kind: "none" },
  ),

  auctionItem(
    "cmp-advance-overcall",
    "Advancing partner's overcall: the cuebid is the strong raise",
    "Page 5: \"The advancer can show a strong raise for the overcaller's suit by CUE-BIDDING the opponent's suit. That is stronger than a single raise or a double raise.\" Page 15 adds the follow-up: \"If the partner has overcalled, you can cuebid the opener's suit to show a strong hand, very likely with a support for your partner's suit … The partner is forced to bid something and then your second rebid will clarify your hand further. You can show support, bid your own suit or bid NT. Example: (1♣) - 1M - 2♣; 2NT - 3M.\" So the cuebid is authored here; the plain single and double raises are NOT, because these notes give them no point bands anywhere — inventing two bands to sit under a bid the notes only call \"stronger\" would be exactly the silent correction this template avoids, and the natural raise ladder in the responses chapters already covers a fit at the right level. The cuebid's own floor is a setting: the notes say only \"strong\", and 12 is chosen because page 15 prices the responder's cuebid at 10+ and page 5 says advancer's cuebid is stronger than a double raise.",
    "agreement",
    [
      rule(
        "cue-strong-raise",
        "Cuebid opener's suit — strong raise of partner's overcall",
        ctx("advancer", { partnerLast: anyBid, lhoLast: anyBid }),
        all(
          hcp(low("b_cmp_advance_overcall_cue_hcp")),
          len("partner_last_bid_suit", 3),
        ),
        bidSuit("lho_bid_suit"),
        56,
        { shows: { hcp: { min: 12 }, forcing: true } },
      ),
    ],
    {
      settings: [
        range(
          "b_cmp_advance_overcall_cue_hcp",
          "Advancer's cuebid over an overcall (HCP, notes say only \"strong\")",
          12,
          21,
          { min: 8, max: 24 },
        ),
      ],
    },
  ),

  // -------------------------------------------------------------------------
  // Pages 16-17 and 25 — Michaels, the Unusual NT, and the defence to both
  // -------------------------------------------------------------------------
  auctionItem(
    "cmp-michaels",
    "Michaels cuebid",
    "Pages 16-17: \"(1M) - 2M to show other major and a minor. (1m) - 2m to show both majors.\" Page 25 repeats the same two rows before giving the advancer's actions. A direct cuebid of their opening suit is therefore never natural: over a minor it is both majors, over a major it is the OTHER major plus an unspecified minor. These notes state neither a point range nor an exact shape for Michaels, so the rules test shape only, and the five-card requirement comes from page 1's rule that a first natural suit bid or implied suit shows five-plus — the suits Michaels implies are named suits, so each promises five. That inference is why the item requires 5-5 rather than, say, 5-4: it is the notes' own general rule applied to a bid they did not qualify, and it is stated here rather than buried. Michaels applies only while the opponents have shown ONE suit.",
    "convention",
    [
      rule(
        "over-minor",
        "Michaels over a minor — both majors",
        ctx("overcaller", {
          rhoLast: bidAt({ level: 1, strains: ["C", "D"] }),
          oppSuitsBidMax: 1,
        }),
        all(len("S", 5), len("H", 5)),
        bidSuit("rho_bid_suit"),
        27,
        { shows: { suits: [{ suit: "S", min: 5 }, { suit: "H", min: 5 }] } },
      ),
      rule(
        "over-1h",
        "Michaels over 1♥ — spades plus a minor",
        ctx("overcaller", { rhoLast: is("1H"), oppSuitsBidMax: 1 }),
        all(len("S", 5), any(len("C", 5), len("D", 5))),
        bidSuit("rho_bid_suit"),
        28,
        { shows: { suits: [{ suit: "S", min: 5 }] } },
      ),
      rule(
        "over-1s",
        "Michaels over 1♠ — hearts plus a minor",
        ctx("overcaller", { rhoLast: is("1S"), oppSuitsBidMax: 1 }),
        all(len("H", 5), any(len("C", 5), len("D", 5))),
        bidSuit("rho_bid_suit"),
        29,
        { shows: { suits: [{ suit: "H", min: 5 }] } },
      ),
    ],
    {
      settings: [toggle("b_cmp_michaels_on", "Michaels cuebid (pages 16-17, 25)")],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "cmp-advance-two-suiter",
    "Advancing partner's Michaels or Unusual 2NT",
    "Page 25, all three rows. After (1m)-2m (both majors): advancer can CUEBID (3m, or 4m with more) with strong support in one major, or simply bid 2M/3M. After (1M)-2M (the other major plus a minor): raise the other major, CUEBID (3M) with a strong hand, or bid 2NT to ask which minor partner holds. After (1x)-2NT (the two lowest unbid suits): support one of partner's suits, or CUEBID (3x) with a strong hand. Which call IS the raise depends on their opening — over (1♥)-2♥ partner's major is spades and the raise is 2♠, over (1♠)-2♠ partner's major is hearts and the raise costs the three level — so the rows are written out per opening suit. Page 25 says \"strong\" and \"strong support\" without numbers: the cuebid floor is a setting defaulting to 10, matching the floor page 15 puts on every other cuebid in this system, and the 3M jump band is a setting defaulting to 8-9, the notes' own medium band for a responder.",
    "convention",
    [
      rule(
        "michaels-minor-cue",
        "(1m)-2m: cuebid 3m with strong support in one major",
        ctx("advancer", { partnerCued: true, lhoLast: bidAt({ level: 1, strains: ["C", "D"] }) }),
        all(hcp(low("b_cmp_advance_two_suiter_cue_hcp")), any(len("S", 3), len("H", 3))),
        bidSuit("lho_bid_suit", 3),
        30,
        { shows: { hcp: { min: 10 }, forcing: true } },
      ),
      rule(
        "michaels-major-cue",
        "(1M)-2M: cuebid 3M with a strong hand",
        ctx("advancer", { partnerCued: true, lhoLast: bidAt({ level: 1, strains: ["H", "S"] }) }),
        hcp(low("b_cmp_advance_two_suiter_cue_hcp")),
        bidSuit("lho_bid_suit", 3),
        30,
        { shows: { hcp: { min: 10 }, forcing: true } },
      ),
      rule(
        "unusual-nt-cue",
        "(1x)-2NT: cuebid 3x with a strong hand",
        ctx("advancer", { partnerLast: is("2N"), lhoLast: THEIR_1_SUIT }),
        hcp(low("b_cmp_advance_two_suiter_cue_hcp")),
        bidSuit("lho_bid_suit", 3),
        30,
        { shows: { hcp: { min: 10 }, forcing: true } },
      ),
      rule(
        "michaels-minor-jump",
        "(1m)-2m: jump to 3M with support and 8-9",
        ctx("advancer", { partnerCued: true, lhoLast: bidAt({ level: 1, strains: ["C", "D"] }) }),
        all(
          hcp(
            low("b_cmp_advance_two_suiter_jump_hcp"),
            high("b_cmp_advance_two_suiter_jump_hcp"),
          ),
          any(len("S", 3), len("H", 3)),
        ),
        bidLongest(["S", "H"], 3),
        31,
        { shows: { hcp: { min: 8, max: 9 } } },
      ),
      rule(
        "michaels-1h-raise-spades",
        "(1♥)-2♥: raise partner's spades to 2♠",
        ctx("advancer", { partnerCued: true, lhoLast: is("1H") }),
        all(len("S", 3), hcp(undefined, high("b_cmp_advance_two_suiter_jump_hcp"))),
        bid(2, "S"),
        31,
        { shows: { suits: [{ suit: "S", min: 3 }] } },
      ),
      rule(
        "michaels-1s-raise-hearts",
        "(1♠)-2♠: raise partner's hearts to 3♥",
        ctx("advancer", { partnerCued: true, lhoLast: is("1S") }),
        all(len("H", 3), hcp(undefined, high("b_cmp_advance_two_suiter_jump_hcp"))),
        bid(3, "H"),
        31,
        { shows: { suits: [{ suit: "H", min: 3 }] } },
      ),
      rule(
        "michaels-minor-two-major",
        "(1m)-2m: bid 2M with a weak hand",
        ctx("advancer", { partnerCued: true, lhoLast: bidAt({ level: 1, strains: ["C", "D"] }) }),
        any(len("S", 3), len("H", 3)),
        bidLongest(["S", "H"], 2),
        32,
      ),
      rule(
        "michaels-1h-ask-minor",
        "(1♥)-2♥: 2NT asks which minor (no spade support)",
        ctx("advancer", { partnerCued: true, lhoLast: is("1H") }),
        len("S", undefined, 2),
        bid(2, "N"),
        32,
        { shows: { forcing: true } },
      ),
      rule(
        "michaels-1s-ask-minor",
        "(1♠)-2♠: 2NT asks which minor (no heart support)",
        ctx("advancer", { partnerCued: true, lhoLast: is("1S") }),
        len("H", undefined, 2),
        bid(2, "N"),
        32,
        { shows: { forcing: true } },
      ),
      rule(
        "unusual-nt-support-over-1c",
        "(1♣)-2NT: support diamonds or hearts at the three level",
        ctx("advancer", { partnerLast: is("2N"), lhoLast: is("1C") }),
        any(len("D", 3), len("H", 3)),
        bidLongest(["D", "H"], 3),
        32,
      ),
      rule(
        "unusual-nt-support-over-1d",
        "(1♦)-2NT: support clubs or hearts at the three level",
        ctx("advancer", { partnerLast: is("2N"), lhoLast: is("1D") }),
        any(len("C", 3), len("H", 3)),
        bidLongest(["C", "H"], 3),
        32,
      ),
      rule(
        "unusual-nt-support-over-major",
        "(1M)-2NT: support clubs or diamonds at the three level",
        ctx("advancer", {
          partnerLast: is("2N"),
          lhoLast: bidAt({ level: 1, strains: ["H", "S"] }),
        }),
        any(len("C", 3), len("D", 3)),
        bidLongest(["C", "D"], 3),
        32,
      ),
    ],
    {
      settings: [
        toggle("b_cmp_advance_two_suiter_on", "Advancing Michaels / the Unusual 2NT (page 25)"),
        range(
          "b_cmp_advance_two_suiter_cue_hcp",
          "Advancer's cuebid over a two-suiter (HCP, notes say only \"strong\")",
          10,
          21,
          { min: 6, max: 24 },
        ),
        range(
          "b_cmp_advance_two_suiter_jump_hcp",
          "Advancer's jump raise of a two-suiter (HCP, notes state none)",
          8,
          9,
          { min: 5, max: 13 },
        ),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "cmp-unusual-nt",
    "Unusual NT",
    "Pages 16-17 give the Unusual NT three separate shapes, and only the first is the familiar one. (1m/1M)-2NT shows the TWO LOWEST UNBID SUITS: over a major that is clubs and diamonds, over 1♦ clubs and hearts, over 1♣ diamonds and hearts. Then two more rows that most write-ups omit. \"NT bid by a PASSED hand and partner has not overcalled: P - (1a) - P - (1b); 1N shows the other 2 suits.\" And \"NT bid by a NON-PASSED hand and partner has not overcalled: (1a) - P - (1b) - 1N shows the other 2 suits.\" Both of those are a ONE-level notrump that is not notrump at all — it is a two-suiter in the suits the opponents have not bid. The language has no reference for \"the two suits neither opponent bid\" (only `only_unbid_suit`, which needs three suits bid), so those two rules are encoded as: at most two cards in each opponent's suit, plus a five-card suit of my own. That is a faithful but looser test than the notes' intent, and it is named here rather than left for a fellow to discover.",
    "convention",
    [
      rule(
        "over-major",
        "(1M)-2NT — clubs and diamonds",
        ctx("overcaller", { rhoLast: bidAt({ level: 1, strains: ["H", "S"] }) }),
        all(len("C", 5), len("D", 5)),
        bid(2, "N"),
        33,
        { shows: { suits: [{ suit: "C", min: 5 }, { suit: "D", min: 5 }] } },
      ),
      rule(
        "over-1d",
        "(1♦)-2NT — clubs and hearts",
        ctx("overcaller", { rhoLast: is("1D") }),
        all(len("C", 5), len("H", 5)),
        bid(2, "N"),
        34,
        { shows: { suits: [{ suit: "C", min: 5 }, { suit: "H", min: 5 }] } },
      ),
      rule(
        "over-1c",
        "(1♣)-2NT — diamonds and hearts",
        ctx("overcaller", { rhoLast: is("1C") }),
        all(len("D", 5), len("H", 5)),
        bid(2, "N"),
        35,
        { shows: { suits: [{ suit: "D", min: 5 }, { suit: "H", min: 5 }] } },
      ),
      rule(
        "one-nt-passed-hand",
        "P-(1a)-P-(1b)-1NT by a PASSED hand — the other two suits",
        ctx("overcaller", {
          ownLast: passed,
          partnerLast: passed,
          lhoLast: ONE_LEVEL,
          rhoLast: ONE_LEVEL,
        }),
        all(
          len("lho_bid_suit", undefined, 2),
          len("rho_bid_suit", undefined, 2),
          len("own_longest_suit", 5),
        ),
        bid(1, "N"),
        36,
      ),
      rule(
        "one-nt-non-passed-hand",
        "(1a)-P-(1b)-1NT by a NON-PASSED hand — the other two suits",
        ctx("overcaller", {
          ownLast: noCall,
          partnerLast: passed,
          lhoLast: ONE_LEVEL,
          rhoLast: ONE_LEVEL,
        }),
        all(
          len("lho_bid_suit", undefined, 2),
          len("rho_bid_suit", undefined, 2),
          len("own_longest_suit", 5),
        ),
        bid(1, "N"),
        37,
      ),
    ],
    {
      settings: [toggle("b_cmp_unusual_nt_on", "Unusual NT (pages 16-17)")],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "cmp-unusual-vs-unusual",
    "Unusual vs Unusual — defending against their two-suiter",
    "Pages 16-17 state the method and page 25 works it out. \"When opponent bids Michael's cuebid or unusual NT then: if only one of their suits is known then cuebid that to show limit raise or better support for partner's suit; if two of their suits are known then cue bidding their lower suit shows our lower suit and cue bidding their higher suit shows our higher suit. Limit raise or better points.\" Page 25's rows: 1M-(2M) shows a major plus a minor, so only their major is known and responder cuebids the OTHER major to show invitational-plus support (3+ cards and 10+); 1m-(2m) shows both majors, so responder cuebids hearts to show clubs and spades to show diamonds; and 1x-(2NT) shows their two lowest unbid suits, so responder cuebids their lower to show our lower unbid suit and their higher to show our higher. Page 25's two worked examples are encoded verbatim: after 1♥-(2NT) — they have shown clubs and diamonds — 3♣ = 3+ hearts and 10+, 3♦ = 5+ spades and 10+; after 1♦-(2NT) — they have shown clubs and hearts — 3♣ = 5+ diamonds and 10+, 3♥ = 5+ spades and 10+. The 1♣ and 1♠ rows are the same formula applied to the two openings page 25 does not print, and are marked as such. One consequence page 25 states and this item does NOT mechanize: \"Since cuebid is available, 3H or 3S is not forcing\" — a natural three-level bid here is competitive, so no forcing rule is declared for it, which is precisely how the language says \"not forcing\".",
    "convention",
    [
      rule(
        "vs-michaels-over-1h",
        "1♥-(2♥)-2♠: cuebid the other major — 3+ hearts, 10+",
        ctx("responder", { partnerLast: is("1H"), rhoLast: is("2H"), contested: true }),
        all(len("H", 3), hcp(low("b_cmp_uvu_hcp"))),
        bid(2, "S"),
        38,
        { shows: { hcp: { min: 10 }, suits: [{ suit: "H", min: 3 }], forcing: true } },
      ),
      rule(
        "vs-michaels-over-1s",
        "1♠-(2♠)-3♥: cuebid the other major — 3+ spades, 10+",
        ctx("responder", { partnerLast: is("1S"), rhoLast: is("2S"), contested: true }),
        all(len("S", 3), hcp(low("b_cmp_uvu_hcp"))),
        bid(3, "H"),
        38,
        { shows: { hcp: { min: 10 }, suits: [{ suit: "S", min: 3 }], forcing: true } },
      ),
      rule(
        "vs-michaels-1c-cue-hearts",
        "1♣-(2♣)-2♥: their lower shows our lower — 5+ clubs, 10+",
        ctx("responder", { partnerLast: is("1C"), rhoLast: is("2C"), contested: true }),
        all(len("C", 5), hcp(low("b_cmp_uvu_hcp"))),
        bid(2, "H"),
        39,
        { shows: { hcp: { min: 10 }, suits: [{ suit: "C", min: 5 }], forcing: true } },
      ),
      rule(
        "vs-michaels-1c-cue-spades",
        "1♣-(2♣)-2♠: their higher shows our higher — 5+ diamonds, 10+",
        ctx("responder", { partnerLast: is("1C"), rhoLast: is("2C"), contested: true }),
        all(len("D", 5), hcp(low("b_cmp_uvu_hcp"))),
        bid(2, "S"),
        39,
        { shows: { hcp: { min: 10 }, suits: [{ suit: "D", min: 5 }], forcing: true } },
      ),
      rule(
        "vs-michaels-1d-cue-hearts",
        "1♦-(2♦)-2♥: their lower shows our lower — 5+ clubs, 10+",
        ctx("responder", { partnerLast: is("1D"), rhoLast: is("2D"), contested: true }),
        all(len("C", 5), hcp(low("b_cmp_uvu_hcp"))),
        bid(2, "H"),
        39,
        { shows: { hcp: { min: 10 }, suits: [{ suit: "C", min: 5 }], forcing: true } },
      ),
      rule(
        "vs-michaels-1d-cue-spades",
        "1♦-(2♦)-2♠: their higher shows our higher — 5+ diamonds, 10+",
        ctx("responder", { partnerLast: is("1D"), rhoLast: is("2D"), contested: true }),
        all(len("D", 5), hcp(low("b_cmp_uvu_hcp"))),
        bid(2, "S"),
        39,
        { shows: { hcp: { min: 10 }, suits: [{ suit: "D", min: 5 }], forcing: true } },
      ),
      // Page 25's first worked example, verbatim.
      rule(
        "vs-unt-over-1h-cue-clubs",
        "1♥-(2NT)-3♣ — 3+ hearts, 10+ (page 25's example)",
        ctx("responder", { partnerLast: is("1H"), rhoLast: is("2N"), contested: true }),
        all(len("H", 3), hcp(low("b_cmp_uvu_hcp"))),
        bid(3, "C"),
        40,
        { shows: { hcp: { min: 10 }, suits: [{ suit: "H", min: 3 }], forcing: true } },
      ),
      rule(
        "vs-unt-over-1h-cue-diamonds",
        "1♥-(2NT)-3♦ — 5+ spades, 10+ (page 25's example)",
        ctx("responder", { partnerLast: is("1H"), rhoLast: is("2N"), contested: true }),
        all(len("S", 5), hcp(low("b_cmp_uvu_hcp"))),
        bid(3, "D"),
        40,
        { shows: { hcp: { min: 10 }, suits: [{ suit: "S", min: 5 }], forcing: true } },
      ),
      // Page 25's second worked example, verbatim.
      rule(
        "vs-unt-over-1d-cue-clubs",
        "1♦-(2NT)-3♣ — 5+ diamonds, 10+ (page 25's example)",
        ctx("responder", { partnerLast: is("1D"), rhoLast: is("2N"), contested: true }),
        all(len("D", 5), hcp(low("b_cmp_uvu_hcp"))),
        bid(3, "C"),
        40,
        { shows: { hcp: { min: 10 }, suits: [{ suit: "D", min: 5 }], forcing: true } },
      ),
      rule(
        "vs-unt-over-1d-cue-hearts",
        "1♦-(2NT)-3♥ — 5+ spades, 10+ (page 25's example)",
        ctx("responder", { partnerLast: is("1D"), rhoLast: is("2N"), contested: true }),
        all(len("S", 5), hcp(low("b_cmp_uvu_hcp"))),
        bid(3, "H"),
        40,
        { shows: { hcp: { min: 10 }, suits: [{ suit: "S", min: 5 }], forcing: true } },
      ),
      // The two openings page 25 does not print, by the same formula: their 2NT
      // over 1♣ shows diamonds+hearts, so 3♦ (their lower) shows our lower unbid
      // suit, clubs — partner's suit — and 3♥ (their higher) shows spades. Over
      // 1♠ their 2NT shows clubs+diamonds, so 3♣ shows hearts and 3♦ shows spades.
      rule(
        "vs-unt-over-1c-cue-diamonds",
        "1♣-(2NT)-3♦ — 5+ clubs, 10+ (same formula, page 25's row)",
        ctx("responder", { partnerLast: is("1C"), rhoLast: is("2N"), contested: true }),
        all(len("C", 5), hcp(low("b_cmp_uvu_hcp"))),
        bid(3, "D"),
        41,
        { shows: { hcp: { min: 10 }, suits: [{ suit: "C", min: 5 }], forcing: true } },
      ),
      rule(
        "vs-unt-over-1c-cue-hearts",
        "1♣-(2NT)-3♥ — 5+ spades, 10+ (same formula, page 25's row)",
        ctx("responder", { partnerLast: is("1C"), rhoLast: is("2N"), contested: true }),
        all(len("S", 5), hcp(low("b_cmp_uvu_hcp"))),
        bid(3, "H"),
        41,
        { shows: { hcp: { min: 10 }, suits: [{ suit: "S", min: 5 }], forcing: true } },
      ),
      rule(
        "vs-unt-over-1s-cue-clubs",
        "1♠-(2NT)-3♣ — 5+ hearts, 10+ (same formula, page 25's row)",
        ctx("responder", { partnerLast: is("1S"), rhoLast: is("2N"), contested: true }),
        all(len("H", 5), hcp(low("b_cmp_uvu_hcp"))),
        bid(3, "C"),
        41,
        { shows: { hcp: { min: 10 }, suits: [{ suit: "H", min: 5 }], forcing: true } },
      ),
      rule(
        "vs-unt-over-1s-cue-diamonds",
        "1♠-(2NT)-3♦ — 3+ spades, 10+ (same formula, page 25's row)",
        ctx("responder", { partnerLast: is("1S"), rhoLast: is("2N"), contested: true }),
        all(len("S", 3), hcp(low("b_cmp_uvu_hcp"))),
        bid(3, "D"),
        41,
        { shows: { hcp: { min: 10 }, suits: [{ suit: "S", min: 3 }], forcing: true } },
      ),
    ],
    {
      settings: [
        toggle("b_cmp_unusual_vs_unusual_on", "Unusual vs Unusual (pages 16-17, 25)"),
        range(
          "b_cmp_uvu_hcp",
          "Unusual vs Unusual: limit raise or better (HCP, notes say 10+)",
          10,
          21,
          { min: 6, max: 24 },
        ),
      ],
      sets: ["conventions"],
    },
  ),

  // -------------------------------------------------------------------------
  // Forcing situations this chapter creates (pages 4, 15, 26)
  // -------------------------------------------------------------------------
  item(
    "cmp-forcing-competitive",
    "Forcing situations in competition",
    "Five places in this chapter where PASS is not an available call, each a plain editable rule. (1) Page 4: the ADVANCER is forced to bid over partner's takeout double unless RHO has bid — so pass is suppressed only when RHO passed. (2) Page 4: advancer's CUEBID of opener's suit is the forcing bid, so the doubler must speak again — which is also the exception to the doubler's \"do not bid again\" discipline. (3) Page 5 and 15: advancer's cuebid over partner's OVERCALL — \"the partner is forced to bid something and then your second rebid will clarify your hand further\". (4) Page 15: responder's cuebid under interference is forcing for one round, so opener must describe. (5) Page 15: the 2/1 under interference shows 10+ and is \"forcing 1 round\" rather than to game, and page 26: the REDOUBLE is \"forcing for one round, meaning your partner can't simply pass\".",
    "agreement",
    "auction",
    {
      kind: "forcing_rules",
      rules: [
        forcing(
          "advancer-must-bid-over-double",
          "Advancer must bid over partner's takeout double (RHO passed)",
          ctx("advancer", { partnerLast: doubled, rhoLast: passed }),
          10,
        ),
        forcing(
          "advancer-cue-forces-doubler",
          "Advancer's cuebid forces the doubler / overcaller to bid again",
          ctx("overcaller", { partnerCued: true, roundMin: 2 }),
          11,
        ),
        forcing(
          "responder-cue-forces-opener",
          "Responder's cuebid under interference forces opener",
          ctx("opener", { partnerCued: true, contested: true, roundMin: 2 }),
          12,
        ),
        forcing(
          "two-over-one-forces-one-round",
          "The 2/1 under interference is forcing for one round",
          ctx("opener", { partnerLast: TWO_LEVEL, contested: true, roundMin: 2 }),
          13,
        ),
        forcing(
          "redouble-forces-one-round",
          "The redouble is forcing for one round (page 26)",
          ctx("opener", { partnerLast: is("XX"), roundMin: 2 }),
          14,
        ),
      ],
    },
  ),
];

/** Page(s) each item was authored from — install.ts turns these into citations. */
export const COMPETITIVE_PAGES: Record<string, number[]> = {
  "cmp-interference-conventions-off": [15],
  "cmp-cuebid-interference": [15],
  "cmp-cuebid-nt-reply": [15],
  // The negative double's boundary ("double of opponent's suit overcall up to
  // 2♠, over partner's opening suit bid") is the pages 16-17 table row; page 15
  // is where it is named as the meaning of 1a-(??)-X.
  "cmp-negative-double": [15, 16],
  "cmp-two-over-one-interference": [15],
  "cmp-raises-interference": [15],
  "cmp-nt-interference": [15],
  // Page 15 says splinters survive; pages 16-17 define what a splinter IS.
  "cmp-splinter-interference": [15, 17],
  "cmp-redouble": [15, 26],
  "cmp-redouble-aftermath": [15, 26],
  "cmp-takeout-double": [4, 16],
  "cmp-takeout-double-rebids": [4],
  "cmp-advance-assumption": [4],
  "cmp-advance-takeout-double": [4],
  "cmp-overcall-one-level": [4],
  "cmp-overcall-two-level": [5],
  "cmp-overcall-vulnerability": [5],
  // Page 5 names advancer's cuebid; page 15 gives the follow-up auction.
  "cmp-advance-overcall": [5, 15],
  "cmp-michaels": [16, 25],
  "cmp-advance-two-suiter": [25],
  "cmp-unusual-nt": [16],
  "cmp-unusual-vs-unusual": [17, 25],
  "cmp-forcing-competitive": [4, 15, 26],
};
