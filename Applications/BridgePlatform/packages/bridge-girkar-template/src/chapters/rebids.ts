// Rebids — teaching deck slides 28–31. Four pictures, in this order:
//
//   s28  1♥–1NT–?   opener's rebid after the FORCING 1NT response
//   s29  1♣–1♥–?    opener's rebid after a one-level major response to a minor
//   s30  1♥–2♣–?    opener's rebid after a game-forcing 2/1 (everything forcing)
//   s31  the combined opener-band × responder-band decision matrix
//
// HOW THE DECK'S TABLES BECOME RULES
//
//  * ONE ROW = ONE RULE. Every row of all three rebid tables is authored, in
//    the deck's own band order (12–14 min / 15–17 med / 18–21 max), and each
//    band is exposed as a range setting so a partnership can move the deck's
//    boundaries without editing a rule. Where the deck's band is unusual or
//    wide (the 2♦ reverse = 16–21, 2NT over a 2/1 = 12–14 OR 18–21, the 4♣ max
//    rebid stopping at 19) the deck's own choice is encoded and the setting is
//    the escape hatch — nothing is silently "corrected".
//
//  * EXPLICIT `shows` EVERYWHERE. Because the bands are $setting-bound, the
//    compiler cannot derive meaning from the conditions (derivation only reads
//    literal numbers), so every rule carries an explicit `shows` written with
//    the deck's default numbers. That is what the partnership-inference layer
//    reads when partner has to work out what a call meant.
//
//  * ORANGE = FORCING. The orange rows (the 2♠ reverse on s28, both 2NT rows on
//    s30) carry `shows.forcing` AND an entry in this chapter's forcing catalog
//    (`rb-forcing-rebids`), so pass is removed from the answering seat's
//    choices. 3NT on s30 is deliberately NOT in that catalog — the deck says it
//    "can be passed".
//
//  * PRIORITY = THE LADDER. Lower fires first. Descriptive/strong rows sit
//    above the residual notrump rows, and the "forced" minimum rows sit at the
//    bottom, so a hand always finds the most descriptive row the deck allows.
//
//  * "Others: Undiscussed, DON'T USE THEM!" IS CONTENT. Each table's red row
//    becomes a concept item naming the calls the deck forbids — and the holes
//    the table itself leaves. No rules are written for them.
//
//  * SLIDE 31 IS ABOUT THE PAIR, not one hand, so it is authored in the
//    partnership vocabulary — partnerHcp / combHcp / fit / unshown /
//    agreed_suit — and its game-driving cells key off the COMBINED count
//    (slide 15: 25 for 3NT, 26 for four of a major) rather than a band table.

import {
  all,
  any,
  auctionItem,
  bal,
  bid,
  bidAt,
  bidLongest,
  bidSuit,
  combHcp,
  ctx,
  fit,
  forcing,
  hcp,
  high,
  is,
  item,
  len,
  low,
  not,
  partnerHcp,
  pass as passAction,
  quality,
  raise,
  range,
  rule,
  toggle,
  tp,
  unshown,
  type TemplateItem,
} from "@bridge/sayc-template/dsl";
import type {
  AuctionContext,
  AuctionRuleSpec,
  CallPattern,
  HandCondition,
  Suit,
} from "@bridge/kb";

const GLYPH: Record<Suit, string> = { C: "♣", D: "♦", H: "♥", S: "♠" };

// ---------------------------------------------------------------------------
// Setting keys — every band on every slide is a dial (all `g_rb_`-prefixed)
// ---------------------------------------------------------------------------

// slide 28 — after the forcing 1NT
const FN_MIN = "g_rb_fn_min_band";
const FN_MED = "g_rb_fn_med_band";
const FN_MAX = "g_rb_fn_max_band";
const FN_REVERSE = "g_rb_fn_reverse_band";

// slide 29 — after a one-level major response to a minor
const M_RAISE_MIN = "g_rb_1m_raise_min_band";
const M_RAISE_INV = "g_rb_1m_raise_inv_band";
const M_RAISE_MAX = "g_rb_1m_raise_max_band";
const M_NEW_MAJOR = "g_rb_1m_new_major_band";
const M_1NT = "g_rb_1m_1nt_band";
const M_2NT = "g_rb_1m_2nt_band";
const M_OWN_MIN = "g_rb_1m_own_min_band";
const M_OWN_MED = "g_rb_1m_own_med_band";
const M_OWN_MAX = "g_rb_1m_own_max_band";
const M_REVERSE = "g_rb_1m_reverse_band";
const M_JUMPSHIFT = "g_rb_1m_jumpshift_band";

// slide 30 — after a game-forcing 2/1
const GF_RANGE = "g_rb_21_range";
const GF_MED = "g_rb_21_med_band";
const GF_2NT_MIN = "g_rb_21_2nt_min_band";
const GF_2NT_MAX = "g_rb_21_2nt_max_band";

// slide 31 — the combined band matrix
const OP_MIN = "g_rb_op_min_band";
const OP_MED = "g_rb_op_med_band";
const OP_MAX = "g_rb_op_max_band";
const RESP_MIN = "g_rb_resp_min_band";
const RESP_MED = "g_rb_resp_med_band";
const RESP_MAX = "g_rb_resp_max_band";
const COMB_GAME = "g_rb_comb_game";

/** `hcp` bound to one of the band settings above. */
const band = (key: string): HandCondition => hcp(low(key), high(key));

/**
 * The deck's "self sufficient suit" (slide 28's 4♥ row, AKJTxx): six cards with
 * two of the top three honors INCLUDING the king. The very next row — the
 * orange 2♠ reverse, "not self-sufficient suit" — holds AQTxxx, which has two
 * of the top three but no king, so the king is exactly the line the deck draws
 * between its two 18–21 examples.
 */
const selfSufficient = (suit: Suit): HandCondition =>
  all(len(suit, 6), quality(suit, "two_of_top_three"), { holds: { suit, rank: 13 } });

// ---------------------------------------------------------------------------
// Slide 28 — 1♥–1NT–? (opener's rebid over the FORCING 1NT)
// ---------------------------------------------------------------------------

const fnCtx = (opening: CallPattern): AuctionContext =>
  ctx("opener", { opening, partnerLast: is("1N"), roundMin: 2, contested: false });

/**
 * Slide 28's rows for ONE major opening. The table is drawn from 1♥–1NT; the
 * rows that do not mention spades generalize to 1♠–1NT unchanged. `lower`
 * carries the suits opener can introduce at the two level without reversing
 * (♦/♣ over 1♥; ♥/♦/♣ over 1♠).
 */
const forcingNtRows = (suffix: string, major: Suit, lower: Suit[]): AuctionRuleSpec[] => {
  const context = fnCtx(is(`1${major}`));
  const g = GLYPH[major];
  const rows: AuctionRuleSpec[] = [
    // "18-21 | 6+ in own suit | 4h | Self sufficient suit"
    rule(
      `game-${suffix}`,
      `4${g} — self-sufficient suit (18–21)`,
      context,
      all(band(FN_MAX), selfSufficient(major)),
      bid(4, major),
      30,
      { shows: { hcp: { min: 18, max: 21 }, suits: [{ suit: major, min: 6 }] } },
    ),
    // "15-17 | 6+ in own suit | 3h | Medium"
    rule(
      `jump-${suffix}`,
      `3${g} — medium with a six-card suit (15–17)`,
      context,
      all(band(FN_MED), len(major, 6)),
      bid(3, major),
      32,
      { shows: { hcp: { min: 15, max: 17 }, suits: [{ suit: major, min: 6 }] } },
    ),
    // "12-14 | 6+ in own suit | 2h | Min"
    rule(
      `rebid-${suffix}`,
      `2${g} — minimum with a six-card suit (12–14)`,
      context,
      all(band(FN_MIN), len(major, 6)),
      bid(2, major),
      34,
      { shows: { hcp: { min: 12, max: 14 }, suits: [{ suit: major, min: 6 }] } },
    ),
    // "18-21 | No new suit | 3n"
    rule(
      `three-nt-${suffix}`,
      "3NT — maximum with nothing else to show (18–21)",
      context,
      band(FN_MAX),
      bid(3, "N"),
      36,
      { shows: { hcp: { min: 18, max: 21 } } },
    ),
    // "15-17 | No new suit | 2n"
    rule(
      `two-nt-${suffix}`,
      "2NT — medium with nothing else to show (15–17)",
      context,
      band(FN_MED),
      bid(2, "N"),
      38,
      { shows: { hcp: { min: 15, max: 17 } } },
    ),
  ];
  // "12-14 | 3+ in suit | 2c" and "12-14 | 3+ in suit | 2d" — the FORCED
  // minimum. Responder's 1NT cannot be passed, so opener names a side suit at
  // the two level with as few as three cards. Four-card holdings first, then
  // the deck's bare three-card holding; inside each group the higher-ranking
  // (dearer) suit first, which leaves 2♣ as the last resort.
  lower.forEach((s, i) => {
    rows.push(
      rule(
        `min-four-${s.toLowerCase()}-${suffix}`,
        `2${GLYPH[s]} — minimum, forced (four-card suit)`,
        context,
        all(band(FN_MIN), len(s, 4)),
        bid(2, s),
        40 + i,
        { shows: { hcp: { min: 12, max: 14 }, suits: [{ suit: s, min: 4 }] } },
      ),
    );
  });
  lower.forEach((s, i) => {
    rows.push(
      rule(
        `min-three-${s.toLowerCase()}-${suffix}`,
        `2${GLYPH[s]} — minimum, forced (three-card suit)`,
        context,
        all(band(FN_MIN), len(s, 3)),
        bid(2, s),
        44 + i,
        { shows: { hcp: { min: 12, max: 14 }, suits: [{ suit: s, min: 3 }] } },
      ),
    );
  });
  return rows;
};

// ---------------------------------------------------------------------------
// Slide 29 — 1♣–1♥–? (opener's rebid after a one-level major response)
// ---------------------------------------------------------------------------

/** Opener bid a minor; responder answered one of a major. */
const MINOR_REBID = ctx("opener", {
  opening: bidAt({ level: 1, strains: ["C", "D"] }),
  partnerLast: bidAt({ level: 1, strains: ["H", "S"] }),
  roundMin: 2,
  contested: false,
});

/** …the same seat, but only over a 1♥ response (the deck's own auction). */
const MINOR_REBID_OVER_1H = ctx("opener", {
  opening: bidAt({ level: 1, strains: ["C", "D"] }),
  partnerLast: is("1H"),
  roundMin: 2,
  contested: false,
});

// ---------------------------------------------------------------------------
// Slide 30 — 1♥–2♣–? (opener's rebid after a game-forcing 2/1)
// ---------------------------------------------------------------------------

/** Opener's seat after a game-forcing two-over-one response. */
const gfCtx = (major: Suit, responses: Suit[]): AuctionContext =>
  ctx("opener", {
    opening: is(`1${major}`),
    partnerLast: bidAt({ level: 2, strains: responses }),
    roundMin: 2,
    contested: false,
  });

/**
 * Slide 30's rows for ONE major opening. `responses` are the strains a 2/1 can
 * take over that opening (a two-level bid of a LOWER-ranking suit — 2♥ over 1♠
 * is a 2/1, 2♥ over 1♥ is a raise); `newSuits` are the suits opener can still
 * introduce at the two level. Unrealizable calls are never made — the engine
 * drops a rule whose action is illegal — so the 2♦ rule simply does not act
 * when responder has already bid 2♦.
 */
const twoOverOneRows = (
  suffix: string,
  major: Suit,
  responses: Suit[],
  newSuits: Suit[],
): AuctionRuleSpec[] => {
  const context = gfCtx(major, responses);
  const g = GLYPH[major];
  const rows: AuctionRuleSpec[] = [
    // "12-21 | 4+ card support | Raise to 3 | forcing"
    rule(
      `raise-${suffix}`,
      "Raise responder's suit to the three level (forcing)",
      context,
      all(band(GF_RANGE), len("partner_last_bid_suit", 4)),
      raise(3),
      30,
      { shows: { hcp: { min: 12, max: 21 }, forcing: true } },
    ),
  ];
  // "12-21 | New 4 card suit | 2d" and "…| 2s" — natural and forcing, bid up
  // the line (cheapest first).
  newSuits.forEach((s, i) => {
    rows.push(
      rule(
        `new-suit-${s.toLowerCase()}-${suffix}`,
        `2${GLYPH[s]} — natural new four-card suit (forcing)`,
        context,
        all(band(GF_RANGE), len(s, 4)),
        bid(2, s),
        31 + i,
        { shows: { hcp: { min: 12, max: 21 }, suits: [{ suit: s, min: 4 }], forcing: true } },
      ),
    );
  });
  rows.push(
    // "15-17 | 6+ in own suit | 2h | Forcing, Rebid own suit"
    //
    // This is the ONE row in slides 28–30 whose own example does not fit a
    // high-card reading: xxx AKxxxx Ax Qxx is 13 HCP, and it is 15 only once
    // slide 32's length points for the six-card suit are added. So the band is
    // tested BOTH ways — 15–17 high-card points OR 15–17 total points — which
    // admits the deck's example without evicting a 15–17 HCP hand (whose total
    // count, 17–19 with six cards, would fall out the top of a tp-only test).
    rule(
      `rebid-own-${suffix}`,
      `2${g} — rebid a six-card suit (15–17, forcing)`,
      context,
      all(any(band(GF_MED), tp(low(GF_MED), high(GF_MED))), len(major, 6)),
      bid(2, major),
      34,
      { shows: { hcp: { min: 15, max: 17 }, suits: [{ suit: major, min: 6 }], forcing: true } },
    ),
    // "15-17 | No support | 3N | Can be passed" — the one non-forcing rebid.
    rule(
      `three-nt-${suffix}`,
      "3NT — 15–17 without support (can be passed)",
      context,
      all(band(GF_MED), len("partner_last_bid_suit", undefined, 3)),
      bid(3, "N"),
      36,
      { shows: { hcp: { min: 15, max: 17 } } },
    ),
  );
  return rows;
};

/**
 * The two ORANGE 2NT rows: the deck gives 2NT over a game-forcing 2/1 TWO
 * strengths, 12–14 and 18–21, both forcing, separated on the NEXT round — the
 * 18–21 hand bids 4NT. Both rules therefore publish the same `shows`, the union
 * 12–21, so responder's inference never reads a strength the call does not
 * actually promise.
 */
const twoWayNtRows = (suffix: string, major: Suit, responses: Suit[]): AuctionRuleSpec[] => {
  const context = gfCtx(major, responses);
  const noSupport = len("partner_last_bid_suit", undefined, 3);
  const union = { hcp: { min: 12, max: 21 }, forcing: true };
  return [
    rule(
      `two-nt-min-${suffix}`,
      "2NT — minimum without support (12–14, forcing)",
      context,
      all(band(GF_2NT_MIN), noSupport),
      bid(2, "N"),
      37,
      { shows: { ...union } },
    ),
    rule(
      `two-nt-max-${suffix}`,
      "2NT — maximum without support (18–21, forcing; 4NT next round)",
      context,
      all(band(GF_2NT_MAX), noSupport),
      bid(2, "N"),
      38,
      { shows: { ...union } },
    ),
    rule(
      `four-nt-${suffix}`,
      "4NT on the next round — the 18–21 half of the two-way 2NT",
      ctx("opener", {
        opening: is(`1${major}`),
        ownLast: is("2N"),
        roundMin: 3,
        contested: false,
      }),
      band(GF_2NT_MAX),
      bid(4, "N"),
      39,
      { shows: { hcp: { min: 18, max: 21 } } },
    ),
  ];
};

// ---------------------------------------------------------------------------
// Slide 31 — the combined opener-band × responder-band matrix
// ---------------------------------------------------------------------------

/** Responder's second call, any one-level opening, no interference. */
const RESP_REBID = ctx("responder", {
  opening: bidAt({ level: 1 }),
  roundMin: 2,
  contested: false,
});

/** Responder's second call over a particular rebid by opener. */
const respOver = (partnerLast: CallPattern): AuctionContext =>
  ctx("responder", {
    opening: bidAt({ level: 1 }),
    partnerLast,
    roundMin: 2,
    contested: false,
  });

/** "Is opener min (12-14)?" — partner's shown CEILING sits inside the min band. */
const openerMin = partnerHcp(undefined, high(OP_MIN));
/** "…med (15-17)?" — partner has promised at least the medium floor. */
const openerMed = partnerHcp(low(OP_MED));
/** "…or max (18+)?" */
const openerMax = partnerHcp(low(OP_MAX));

const SUIT_STRAINS: Suit[] = ["C", "D", "H", "S"];

// ---------------------------------------------------------------------------

export const REBIDS: TemplateItem[] = [
  // =========================================================================
  // Slide 28 — 1♥–1NT–?
  // =========================================================================
  auctionItem(
    "rb-fn-opener-rebid",
    "Opener's rebid after the forcing 1NT",
    "Slide 28 (1♥–1NT–?). Responder's 1NT is FORCING, so opener always bids again. The ladder, by band: 18–21 with a self-sufficient six-card suit jumps to four of the major (AKJTxx); 15–17 with six cards jumps to three; 12–14 with six cards rebids two. With nothing further to show it is 3NT with 18–21 and 2NT with 15–17. Otherwise the minimum is FORCED to name a side suit at the two level holding as few as three cards — 2♣/2♦ over 1♥, 2♥/2♦/2♣ over 1♠ — which is why that call promises almost nothing beyond 12–14; four-card side suits are preferred to the deck's bare three-card holding. Two honest notes on reading the picture: 'No new suit' on the 2NT/3NT rows means 'no new suit this hand is strong enough to introduce' (2♣/2♦ would show a minimum and 2♠ needs 18), so a 15–17 hand with four spades still rebids 2NT; and after 1♠–1NT there is no two-level reverse at all, so an 18–21 hand without a self-sufficient suit lands on 3NT — the deck never writes that row and nothing here invents a better one.",
    "agreement",
    [...forcingNtRows("1h", "H", ["D", "C"]), ...forcingNtRows("1s", "S", ["H", "D", "C"])],
    {
      settings: [
        range(FN_MIN, "Minimum rebid band after the forcing 1NT (HCP)", 12, 14, { min: 10, max: 16 }),
        range(FN_MED, "Medium rebid band after the forcing 1NT (HCP)", 15, 17, { min: 13, max: 19 }),
        range(FN_MAX, "Maximum rebid band after the forcing 1NT (HCP)", 18, 21, { min: 16, max: 24 }),
      ],
      sets: ["core"],
    },
  ),

  auctionItem(
    "rb-fn-reverse",
    "The 2♠ reverse over 1♥–1NT",
    "Slide 28's two ORANGE rows — both 18–21, both forcing. 1♥–1NT–2♠ is a reverse: a maximum opening that could not be described any other way. The deck gives it two shapes: a genuine new four-card spade suit (AKxx AQTxx xx AK), and — this is the deck's own, unusual choice — a SIX-card heart suit that is not self-sufficient (AKx AQTxxx AQx x, with a SINGLETON spade). Because of that second reading 2♠ does not promise spades at all, so the strength-showing rule publishes 18–21, six hearts and 'forcing' with no spade length; only the four-card row promises the suit. Responder must bid again (see the forcing catalog). Both rows are ordinary rows of the deck's table rather than an optional gadget, so there is no on/off switch here — the band setting is the only dial, and a partnership that wants a narrower reverse moves it.",
    "agreement",
    [
      rule(
        "strength",
        "2♠ reverse — 18–21, six hearts, not self-sufficient",
        fnCtx(is("1H")),
        all(band(FN_REVERSE), len("H", 6)),
        bid(2, "S"),
        31,
        { shows: { hcp: { min: 18, max: 21 }, suits: [{ suit: "H", min: 6 }], forcing: true } },
      ),
      rule(
        "new-suit",
        "2♠ reverse — 18–21 with a new four-card spade suit",
        fnCtx(is("1H")),
        all(band(FN_REVERSE), len("S", 4)),
        bid(2, "S"),
        33,
        { shows: { hcp: { min: 18, max: 21 }, suits: [{ suit: "S", min: 4 }], forcing: true } },
      ),
    ],
    {
      settings: [
        range(FN_REVERSE, "2♠ reverse band over 1♥–1NT (HCP)", 18, 21, { min: 16, max: 24 }),
      ],
      sets: ["core"],
    },
  ),

  item(
    "rb-fn-undiscussed",
    "Undiscussed rebids after the forcing 1NT",
    "Slide 28's red row: 'Others — Undiscussed, DON'T USE THEM!'. After 1♥–1NT the table's whole vocabulary is 2♣/2♦ (the forced minimum), 2♥/3♥/4♥ (own suit by band), 2♠ (the 18–21 reverse), 2NT (15–17) and 3NT (18–21). Everything else is undiscussed and must not be used: 3♣/3♦ jump shifts, 3♠, 4♣/4♦, 4NT, and PASS — the 1NT response is forcing, so passing it is not one of opener's calls at all. The partnership that wants any of those sequences has to agree a meaning first; until then the bid says nothing and partner cannot read it.",
    "concept",
    "auction",
    { kind: "none" },
    { sets: ["core"] },
  ),

  // =========================================================================
  // Slide 29 — 1♣–1♥–?
  // =========================================================================
  auctionItem(
    "rb-1m-raise-major",
    "Raising responder's major after a minor opening",
    "Slide 29, the three raise rows (1♣–1♥–?). With four-card support opener raises straight to the level its band is worth: 12–14 raises to two (minimum raise), 15–17 raises to three (invitational), 18–21 raises to four (maximum raise). The band IS the message — responder has already shown 6+ and a four-card major, so the raise sets the level and responder only has to add.",
    "agreement",
    [
      rule(
        "raise-max",
        "Raise to four — maximum raise (18–21)",
        MINOR_REBID,
        all(band(M_RAISE_MAX), len("partner_last_bid_suit", 4)),
        raise(4),
        30,
        { shows: { hcp: { min: 18, max: 21 } } },
      ),
      rule(
        "raise-invitational",
        "Raise to three — invitational (15–17)",
        MINOR_REBID,
        all(band(M_RAISE_INV), len("partner_last_bid_suit", 4)),
        raise(3),
        31,
        { shows: { hcp: { min: 15, max: 17 } } },
      ),
      rule(
        "raise-min",
        "Raise to two — minimum raise (12–14)",
        MINOR_REBID,
        all(band(M_RAISE_MIN), len("partner_last_bid_suit", 4)),
        raise(2),
        32,
        { shows: { hcp: { min: 12, max: 14 } } },
      ),
    ],
    {
      settings: [
        range(M_RAISE_MIN, "Minimum raise of responder's major (HCP)", 12, 14, { min: 10, max: 16 }),
        range(M_RAISE_INV, "Invitational raise of responder's major (HCP)", 15, 17, { min: 13, max: 19 }),
        range(M_RAISE_MAX, "Maximum raise of responder's major (HCP)", 18, 21, { min: 16, max: 24 }),
      ],
      sets: ["core"],
    },
  ),

  auctionItem(
    "rb-1m-new-major",
    "A new four-card major at the one level",
    "Slide 29: '12-17 | New 4 card M | 1M | New suit allowing sign off in 2 of orig suit'. Over a 1♥ response opener with four spades and 12–17 bids 1♠ rather than notrump — the cheapest call there is, so responder can still sign off in two of opener's minor. It covers the whole 12–17 range precisely because it costs nothing; the stronger hands with four spades use the 19–21 jump shift instead. There is no mirror row: over a 1♠ response four hearts cannot be shown at the one level, and 2♥ would be a reverse needing 16+, so the deck simply writes no call for a 12–15 hand with four hearts after 1♣/1♦–1♠. It is not covered by the notrump rows either — those deny a four-card major in EITHER major, which is what 'Denies 4 card M' means in the deck's own 1♥ auction. That hole is the deck's, and it is named with the other gaps in 'Undiscussed rebids after a minor opening' rather than filled with an invented call.",
    "agreement",
    [
      rule(
        "one-spade",
        "1♠ — a new four-card major, cheapest call (12–17)",
        MINOR_REBID_OVER_1H,
        all(band(M_NEW_MAJOR), len("S", 4)),
        bid(1, "S"),
        33,
        { shows: { hcp: { min: 12, max: 17 }, suits: [{ suit: "S", min: 4 }] } },
      ),
    ],
    {
      settings: [
        range(M_NEW_MAJOR, "New four-card major at the one level (HCP)", 12, 17, { min: 10, max: 19 }),
      ],
      sets: ["core"],
    },
  ),

  auctionItem(
    "rb-1m-jumpshift",
    "Jump shift after a minor opening (game force)",
    "Slide 29: '19-21 | New 4 card suit | 2s | Jump-shift, game force'. With 19–21 and four spades over a 1♥ response opener jumps to 2♠, skipping the available 1♠ — that jump is what makes it a game force rather than the ordinary 12–17 1♠ rebid. The partnership is going to game; responder may not pass (see the forcing catalog).",
    "agreement",
    [
      rule(
        "jump-two-spades",
        "2♠ jump shift — game force (19–21)",
        MINOR_REBID_OVER_1H,
        all(band(M_JUMPSHIFT), len("S", 4)),
        bid(2, "S"),
        34,
        { shows: { hcp: { min: 19, max: 21 }, suits: [{ suit: "S", min: 4 }], forcing: true } },
      ),
    ],
    {
      settings: [
        range(M_JUMPSHIFT, "Jump-shift band after a minor opening (HCP)", 19, 21, { min: 17, max: 24 }),
      ],
      sets: ["core"],
    },
  ),

  auctionItem(
    "rb-1m-reverse",
    "Reverse after a minor opening (forcing one round)",
    "Slide 29: '16-21 | New 4 card suit | 2d | Reverse, can't sign off in 2c, forcing one round'. After 1♣–1♥ a 2♦ rebid is a reverse — it takes the partnership past two of the opening suit, so it needs 16–21 and forces one more round. The deck's band is deliberately WIDE (16–21 overlaps the 18–21 maximum raise and the 19–21 jump shift); the shape decides which row applies, and the band setting is here for a partnership that prefers a tighter reverse. The second rule is the exact structural analogue after a 1♦ opening (1♦–1♠–2♥), which the deck's 1♣ table does not draw but which is the same call in the same position.",
    "agreement",
    [
      rule(
        "two-diamonds",
        "2♦ reverse after 1♣ (16–21, forcing one round)",
        ctx("opener", {
          opening: is("1C"),
          partnerLast: bidAt({ level: 1, strains: ["H", "S"] }),
          roundMin: 2,
          contested: false,
        }),
        all(band(M_REVERSE), len("D", 4)),
        bid(2, "D"),
        35,
        { shows: { hcp: { min: 16, max: 21 }, suits: [{ suit: "D", min: 4 }], forcing: true } },
      ),
      rule(
        "two-hearts",
        "2♥ reverse after 1♦–1♠ (16–21, forcing one round)",
        ctx("opener", {
          opening: is("1D"),
          partnerLast: is("1S"),
          roundMin: 2,
          contested: false,
        }),
        all(band(M_REVERSE), len("H", 4)),
        bid(2, "H"),
        35,
        { shows: { hcp: { min: 16, max: 21 }, suits: [{ suit: "H", min: 4 }], forcing: true } },
      ),
    ],
    {
      settings: [
        range(M_REVERSE, "Reverse band after a minor opening (HCP)", 16, 21, { min: 14, max: 24 }),
      ],
      sets: ["core"],
    },
  ),

  auctionItem(
    "rb-1m-rebid-own",
    "Rebidding a six-card minor",
    "Slide 29's three own-suit rows (1♣–1♥–?): with six or more of the opening minor opener rebids it at the level its band is worth — 2♣ with 12–14 (minimum rebid), 3♣ with 15–17 (medium), 4♣ with 18–19 (maximum). The deck's maximum row stops at 19 and writes nothing for 20–21 with a long minor; that hole is the deck's, and the band setting is the place to close it rather than a rule that invents a call the slide never shows.",
    "agreement",
    [
      rule(
        "own-max",
        "Jump to four of the minor — maximum rebid (18–19)",
        MINOR_REBID,
        all(band(M_OWN_MAX), len("own_first_bid_suit", 6)),
        bidSuit("own_first_bid_suit", 4),
        36,
        { shows: { hcp: { min: 18, max: 19 } } },
      ),
      rule(
        "own-med",
        "Jump to three of the minor — medium rebid (15–17)",
        MINOR_REBID,
        all(band(M_OWN_MED), len("own_first_bid_suit", 6)),
        bidSuit("own_first_bid_suit", 3),
        37,
        { shows: { hcp: { min: 15, max: 17 } } },
      ),
      rule(
        "own-min",
        "Rebid two of the minor — minimum rebid (12–14)",
        MINOR_REBID,
        all(band(M_OWN_MIN), len("own_first_bid_suit", 6)),
        bidSuit("own_first_bid_suit", 2),
        38,
        { shows: { hcp: { min: 12, max: 14 } } },
      ),
    ],
    {
      settings: [
        range(M_OWN_MIN, "Minimum six-card minor rebid (HCP)", 12, 14, { min: 10, max: 16 }),
        range(M_OWN_MED, "Medium six-card minor rebid (HCP)", 15, 17, { min: 13, max: 19 }),
        range(M_OWN_MAX, "Maximum six-card minor rebid (HCP)", 18, 19, { min: 16, max: 24 }),
      ],
      sets: ["core"],
    },
  ),

  auctionItem(
    "rb-1m-notrump",
    "Notrump rebids after a minor opening",
    "Slide 29's two notrump rows: 1NT with 12–14 and 2NT with 18–19, each one 'Denies 4 card M'. Both therefore promise at most three cards in EITHER major — responder can trust that and stop looking for a major fit. The deck leaves a real hole between them: 15–17 balanced with no support and no four-card major has NO row on this slide, and nothing here fills it with a call the deck does not teach. The 2NT band setting is the honest place for a partnership that wants 15–17 to have an answer.",
    "agreement",
    [
      rule(
        "one-nt",
        "1NT rebid — 12–14, denies a four-card major",
        MINOR_REBID,
        all(band(M_1NT), not(any(len("H", 4), len("S", 4)))),
        bid(1, "N"),
        40,
        {
          shows: {
            hcp: { min: 12, max: 14 },
            suits: [
              { suit: "H", max: 3 },
              { suit: "S", max: 3 },
            ],
          },
        },
      ),
      rule(
        "two-nt",
        "2NT rebid — 18–19, denies a four-card major",
        MINOR_REBID,
        all(band(M_2NT), not(any(len("H", 4), len("S", 4)))),
        bid(2, "N"),
        41,
        {
          shows: {
            hcp: { min: 18, max: 19 },
            suits: [
              { suit: "H", max: 3 },
              { suit: "S", max: 3 },
            ],
          },
        },
      ),
    ],
    {
      settings: [
        range(M_1NT, "1NT rebid after a minor opening (HCP)", 12, 14, { min: 10, max: 16 }),
        range(M_2NT, "2NT rebid after a minor opening (HCP)", 18, 19, { min: 15, max: 21 }),
      ],
      sets: ["core"],
    },
  ),

  item(
    "rb-1m-undiscussed",
    "Undiscussed rebids after a minor opening",
    "Slide 29's red row: 'Others — Undiscussed, DON'T USE THEM!'. After 1♣–1♥ the table's whole vocabulary is 2♥/3♥/4♥ (the raises), 1♠ (a new four-card major), 1NT and 2NT (denying a major), 2♣/3♣/4♣ (the six-card minor), 2♦ (the reverse) and 2♠ (the game-forcing jump shift). Everything else is undiscussed: 3♦, 3♠, 3NT, 4♦, jumps in a suit nobody has shown, and — the three holes the table itself leaves — a 2NT rebid on 15–17 (the deck's 2NT is 18–19), any rebid at all for 20–21 with a long minor (the 4♣ row stops at 19), and a 12–15 hand with four HEARTS after 1♣/1♦–1♠, for which the slide writes nothing (1♥ is unavailable, 2♥ is a reverse needing 16+, and the notrump rows deny a four-card major). Do not use those sequences until the partnership has agreed what they mean.",
    "concept",
    "auction",
    { kind: "none" },
    { sets: ["core"] },
  ),

  // =========================================================================
  // Slide 30 — 1♥–2♣–?
  // =========================================================================
  auctionItem(
    "rb-2over1-rebid",
    "Opener's rebid after a game-forcing 2/1",
    "Slide 30 (1♥–2♣–?). Responder's two-over-one is a GAME FORCE, so every call in this table except one is forcing and opener is simply describing on the way to game: raise responder's suit to three with four-card support (12–21, forcing), bid a natural new four-card suit at the two level (12–21, forcing), or rebid a six-card major at the two level with 15–17 (forcing). The single exception is 3NT, which the deck marks 'Can be passed' — 15–17 with no support and nothing else to say. Note what is NOT here: the deck gives no six-card rebid row for 12–14 or 18–21 in this auction (those hands use the two-way 2NT) and teaches fast arrival separately, on slide 47. One reading note: every band in slides 28–30 is authored as HIGH-CARD points because that is what fits the deck's own examples everywhere but one — the example on THIS table's 2♥ row (xxx AKxxxx Ax Qxx) is only 13 HCP, and reaches 15 only once slide 32's length points for a six-card suit are added. That single row therefore accepts 15–17 by EITHER count, so the deck's own example does bid 2♥ while a plain 15–17 high-card hand with six of them still does too.",
    "agreement",
    [
      ...twoOverOneRows("1h", "H", ["C", "D"], ["D", "S"]),
      ...twoOverOneRows("1s", "S", ["C", "D", "H"], ["D", "H"]),
    ],
    {
      settings: [
        range(GF_RANGE, "Opener's full range in a 2/1 auction (HCP)", 12, 21, { min: 10, max: 24 }),
        range(GF_MED, "Medium rebid band in a 2/1 auction (HCP)", 15, 17, { min: 13, max: 19 }),
      ],
      sets: ["core"],
    },
  ),

  auctionItem(
    "rb-2over1-2nt",
    "The two-way 2NT over a game-forcing 2/1",
    "Slide 30's two ORANGE rows give 2NT TWO meanings by strength: 12–14 with no support, and 18–21 with no support. Both are forcing; the deck resolves the ambiguity a round later — 'Bid 4N next round' — so the strong hand identifies itself by continuing with 4NT while the minimum does not. Because a single call carries both bands, both rules publish the same meaning, the union 12–21 and forcing, rather than a range 2NT does not promise: responder must not read 2NT as a minimum. It is an unusual treatment (most systems make 2NT one strength) but it is the deck's own row and not an optional gadget, so it carries no on/off switch: 2NT is the ONLY call slide 30 gives a 12–14 or 18–21 hand with no support, no four-card side suit and no six-card suit, and pass is not available in a game-forcing auction. The two band settings are the dials.",
    "agreement",
    [...twoWayNtRows("1h", "H", ["C", "D"]), ...twoWayNtRows("1s", "S", ["C", "D", "H"])],
    {
      settings: [
        range(GF_2NT_MIN, "Minimum half of the two-way 2NT (HCP)", 12, 14, { min: 10, max: 16 }),
        range(GF_2NT_MAX, "Maximum half of the two-way 2NT (HCP)", 18, 21, { min: 16, max: 24 }),
      ],
      sets: ["core"],
    },
  ),

  item(
    "rb-2over1-undiscussed",
    "Undiscussed rebids after a game-forcing 2/1",
    "Slide 30's red row: 'Others — Undiscussed, DON'T USE THEM!'. In 1♥–2♣ the table's whole vocabulary is 3♣ (the raise), 2♦ and 2♠ (natural new four-card suits), 2♥ (a six-card rebid, 15–17), 2NT (12–14 or 18–21) and 3NT (15–17). Everything else is undiscussed: 3♦/3♠ jumps, 3♥, 4♣, 4♥, 4NT on this round — and above all PASS. Responder's 2/1 is a game force, so with the single exception of 3NT every call in this auction is forcing and passing is never one of opener's choices.",
    "concept",
    "auction",
    { kind: "none" },
    { sets: ["core"] },
  ),

  // =========================================================================
  // Slide 31 — the combined band matrix
  // =========================================================================
  item(
    "rb-band-matrix",
    "The combined-strength matrix: who bids what on the second round",
    "Slide 31 asks the two questions the whole system turns on: 'Are you min (6-9), med (10-11) or max (12+)? Is opener min (12-14), med (15-17) or max (18+)?' The nine answers, verbatim in substance. OPENER MIN × responder min: stay below 2NT — pass opener's 1NT, choose between opener's two suits at the two level, or rebid your own six-card suit at the two level. OPENER MIN × med: invite with 2NT, rebid your own suit or support opener's suit below 3NT; a new suit at the three level would be a game force. OPENER MIN × max: must bid game — make a forcing bid, usually a two-level bid of a new suit above your first suit, or a three-level bid of a new suit. OPENER MED × min: pass, or bid 3NT over opener's 3♣/3♦; pass or raise opener's 3♥/3♠ with support, or bid 3NT with a maximum. OPENER MED × med: must bid game or make a game-forcing bid. OPENER MED × max: must bid game; consider exploring slam with 16+. OPENER MAX × min: opener's rebid is 2NT or higher — pass with a minimum, because any rebid of yours will likely force to game unless it is the same suit. OPENER MAX × med: game, and explore slam. OPENER MAX × max: slam is likely. This is the slide the platform's partnership-inference layer exists for: nothing in it can be decided from one hand — every cell is a statement about the PAIR.",
    "judgment_guideline",
    "auction",
    { kind: "none" },
    { sets: ["core"] },
  ),

  auctionItem(
    "rb-band-decisions",
    "Deciding the second round from the combined count",
    "Slide 31 made executable, in the partnership vocabulary rather than as prose. Opener's band is read from what opener's calls have SHOWN (partnerHcp), responder's from its own hand, and the game cells from the two together (combHcp) against the deck's own thresholds on slide 15 — 25 for 3NT, 26 for four of a major. So: every 'must bid game' cell (min×max, med×med, med×max, max×med, max×max) becomes the same three rules — bid game in an established major fit at 26, force with a new suit at the three level with 12+, or bid 3NT at 25 — with one deliberate exception for the min×max cell: 12+ opposite a partner LIMITED to 12–14 must bid game even though the pair's shown floor is only 12+12 = 24, so both the forcing new suit and (when no new suit can be named) 3NT fire on the limited-partner reading alone rather than waiting for the combined threshold. Otherwise that cell would end in a pass, which is the one thing the slide forbids. The partscore and invitational cells stay band-specific: with opener limited to 12–14 a 6–9 responder stays below 2NT (pass 1NT, give preference to opener's first suit at the two level, or rebid a six-card suit) and a 10–11 responder invites below 3NT (raise opener's first suit to three with hidden support, rebid a six-card suit at the three level, else 2NT). Over a medium opener's three-level rebid, 6–9 raises a major to game with support, bids 3NT at the top of the band, and passes at the bottom; over a maximum opener's 2NT/3NT rebid, responder passes whenever the combined count is still short of game. Two things the deck says here that this item does NOT execute: 'consider exploring slam with 16+' and 'slam likely' are left to the slam machinery (slide 49), and the deck's preference for a two-level forcing bid 'above your first suit' needs a suit comparison the language cannot express, so the executable force is the three-level new suit. That force also has a reach limit worth knowing: 'a new suit' can only be named when exactly one suit is still unbid, so in an auction like 1♣–1♥–1NT (two suits unbid) the forcing bid cannot be built and the cell is executed by 3NT on balanced hands instead. An UNBALANCED 12+ in that position has no call here and falls through to the response chapters.",
    "judgment_guideline",
    [
      // ---- every "must bid game" cell -------------------------------------
      rule(
        "game-in-the-fit",
        "Bid game in the agreed major (26+ combined)",
        RESP_REBID,
        all(fit("any_major", 8), combHcp(high(COMB_GAME))),
        bidSuit("agreed_suit", 4),
        40,
      ),
      rule(
        "game-force-new-suit",
        "Force game with a new suit at the three level (12+)",
        RESP_REBID,
        // Slide 31's MIN × MAX cell — "Must bid game. Make forcing bid." —
        // applies at 12+ opposite a 12–14 opener, where the pair's SHOWN floor
        // is only 12+12 = 24 and the two combined-count game rules below
        // therefore cannot fire. So the forcing new suit must not be gated on
        // the combined count alone: a limited (12–14) partner is reason enough.
        // The MED × MAX and MAX × MAX cells reach the combined threshold on
        // their own and come in through the second branch.
        all(hcp(low(RESP_MAX)), any(openerMin, combHcp(low(COMB_GAME)))),
        bidSuit("only_unbid_suit", 3),
        41,
        { shows: { hcp: { min: 12 }, forcing: true } },
      ),
      rule(
        "game-in-notrump",
        "Bid 3NT (25+ combined, or 12+ facing a limited opener)",
        RESP_REBID,
        // 25+ combined is slide 15's own 3NT threshold. The second branch is
        // slide 31's MIN × MAX cell again: 12+ opposite a 12–14 opener "must
        // bid game", and once the forcing new suit above cannot be named (two
        // suits still unbid — see that rule) 3NT is the only game call left in
        // the deck's vocabulary. Without it the seat would PASS a hand the
        // slide says must reach game.
        all(bal(), any(combHcp(low(COMB_GAME)), all(openerMin, hcp(low(RESP_MAX))))),
        bid(3, "N"),
        42,
      ),
      // ---- opener MED (15-17) × responder MIN (6-9) ------------------------
      rule(
        "med-raise-major-to-game",
        "Raise opener's three-level major to game with support",
        respOver(bidAt({ level: 3, strains: ["H", "S"] })),
        all(openerMed, band(RESP_MIN), len("partner_last_bid_suit", 3)),
        raise(4),
        44,
      ),
      rule(
        "med-three-nt-with-maximum",
        "3NT over opener's three-level rebid with the top of the band",
        respOver(bidAt({ level: 3, strains: SUIT_STRAINS })),
        all(openerMed, hcp(8, high(RESP_MIN))),
        bid(3, "N"),
        45,
        { shows: { hcp: { min: 8, max: 9 } } },
      ),
      rule(
        "med-pass-minimum",
        "Pass opener's three-level rebid with a bare minimum",
        respOver(bidAt({ level: 3, strains: SUIT_STRAINS })),
        all(openerMed, hcp(low(RESP_MIN), 7)),
        passAction,
        46,
      ),
      // ---- opener MAX (18+) × responder MIN (6-9) --------------------------
      rule(
        "max-pass-notrump",
        "Pass opener's 2NT/3NT rebid when the pair is still short of game",
        respOver(bidAt({ min: 2, max: 3, strains: ["N"] })),
        all(openerMax, not(combHcp(low(COMB_GAME)))),
        passAction,
        48,
      ),
      // ---- opener MIN (12-14) × responder MED (10-11): invite below 3NT ----
      rule(
        "min-invite-support",
        "Invite by raising opener's first suit to three (hidden support)",
        RESP_REBID,
        all(openerMin, band(RESP_MED), unshown("partner_first_bid_suit", 3)),
        bidSuit("partner_first_bid_suit", 3),
        50,
        { shows: { hcp: { min: 10, max: 11 } } },
      ),
      rule(
        "min-invite-own-suit",
        "Invite by rebidding a six-card suit at the three level",
        RESP_REBID,
        all(openerMin, band(RESP_MED), len("own_first_bid_suit", 6)),
        bidSuit("own_first_bid_suit", 3),
        51,
        { shows: { hcp: { min: 10, max: 11 } } },
      ),
      rule(
        "min-invite-two-nt",
        "Invite with 2NT (10–11)",
        RESP_REBID,
        all(openerMin, band(RESP_MED)),
        bid(2, "N"),
        52,
        { shows: { hcp: { min: 10, max: 11 } } },
      ),
      // ---- opener MIN (12-14) × responder MIN (6-9): stay below 2NT --------
      rule(
        "min-pass-one-nt",
        "Pass opener's 1NT rebid (6–9 opposite 12–14)",
        respOver(is("1N")),
        all(openerMin, band(RESP_MIN)),
        passAction,
        60,
      ),
      rule(
        "min-preference",
        "Choose between opener's two suits — preference at the two level",
        respOver(bidAt({ level: 2, strains: SUIT_STRAINS })),
        all(openerMin, band(RESP_MIN), len("partner_first_bid_suit", 3)),
        bidSuit("partner_first_bid_suit", 2),
        61,
      ),
      rule(
        "min-rebid-own-six",
        "Rebid your own six-card suit at the two level",
        respOver(bidAt({ level: 2, strains: SUIT_STRAINS })),
        all(
          openerMin,
          band(RESP_MIN),
          any(len("C", 6), len("D", 6), len("H", 6), len("S", 6)),
        ),
        bidLongest(["S", "H", "D", "C"], 2),
        62,
      ),
      rule(
        "min-pass-second-suit",
        "Pass opener's second suit (nothing better below 2NT)",
        respOver(bidAt({ level: 2, strains: SUIT_STRAINS })),
        all(openerMin, band(RESP_MIN)),
        passAction,
        63,
      ),
    ],
    {
      settings: [
        range(OP_MIN, "Opener minimum band (HCP)", 12, 14, { min: 10, max: 16 }),
        range(OP_MED, "Opener medium band (HCP)", 15, 17, { min: 13, max: 19 }),
        range(OP_MAX, "Opener maximum band (HCP)", 18, 21, { min: 16, max: 24 }),
        range(RESP_MIN, "Responder minimum band (HCP)", 6, 9, { min: 4, max: 11 }),
        range(RESP_MED, "Responder medium band (HCP)", 10, 11, { min: 8, max: 13 }),
        range(RESP_MAX, "Responder maximum band (HCP)", 12, 21, { min: 10, max: 24 }),
        range(COMB_GAME, "Combined points for game — 3NT / four of a major", 25, 26, {
          min: 22,
          max: 30,
        }),
      ],
      sets: ["core"],
    },
  ),

  // =========================================================================
  // The forcing catalog for slides 28–31
  // =========================================================================
  item(
    "rb-forcing-rebids",
    "Forcing situations in the rebid tables",
    "The colored rows of slides 28–30 say a call cannot be passed, and this catalog is how the engine knows. Opener must rebid over responder's FORCING 1NT (slide 28's minimum rows are literally labelled 'forced'). Responder must bid again over opener's reverse — 1♥–1NT–2♠ (slide 28, orange), 1♣–1M–2♦ and 1♦–1♠–2♥ (slide 29, 'forcing one round') — and over the 19–21 jump shift 1m–1♥–2♠, which forces to game. In a game-forcing 2/1 auction (slide 30) BOTH seats are locked in: opener must rebid over the 2/1, and responder must bid over opener's suit rebid at the two or three level and over the two-way 2NT. The one call on slide 30 deliberately absent from this catalog is 3NT, which the deck marks 'Can be passed'. Slide 31's 'must bid game' cells are not listed here either: a forcing situation carries no hand conditions, so making those cells unconditional would gag every weak hand in the same auction — they are executed as combined-count rules in 'Deciding the second round from the combined count' instead.",
    "agreement",
    "auction",
    {
      kind: "forcing_rules",
      rules: [
        forcing(
          "opener-over-forcing-1nt",
          "Opener must rebid over the forcing 1NT",
          ctx("opener", {
            opening: bidAt({ level: 1, strains: ["H", "S"] }),
            partnerLast: is("1N"),
            roundMin: 2,
            contested: false,
          }),
          10,
        ),
        forcing(
          "responder-over-2s-reverse",
          "Responder must bid over the 2♠ reverse (1♥–1NT–2♠)",
          ctx("responder", {
            opening: is("1H"),
            ownFirst: is("1N"),
            partnerLast: is("2S"),
            contested: false,
          }),
          11,
        ),
        forcing(
          "responder-over-2d-reverse",
          "Responder must bid over the 2♦ reverse (1♣–1M–2♦)",
          ctx("responder", {
            opening: is("1C"),
            ownFirst: bidAt({ level: 1, strains: ["H", "S"] }),
            partnerLast: is("2D"),
            contested: false,
          }),
          12,
        ),
        forcing(
          "responder-over-2h-reverse",
          "Responder must bid over the 2♥ reverse (1♦–1♠–2♥)",
          ctx("responder", {
            opening: is("1D"),
            ownFirst: is("1S"),
            partnerLast: is("2H"),
            contested: false,
          }),
          13,
        ),
        forcing(
          "responder-over-jump-shift",
          "Responder must bid over the game-forcing jump shift (1m–1♥–2♠)",
          ctx("responder", {
            opening: bidAt({ level: 1, strains: ["C", "D"] }),
            ownFirst: is("1H"),
            partnerLast: is("2S"),
            contested: false,
          }),
          14,
        ),
        forcing(
          "opener-over-2over1-1h",
          "Opener must rebid over a game-forcing 2/1 (after 1♥)",
          ctx("opener", {
            opening: is("1H"),
            partnerLast: bidAt({ level: 2, strains: ["C", "D"] }),
            roundMin: 2,
            contested: false,
          }),
          15,
        ),
        forcing(
          "opener-over-2over1-1s",
          "Opener must rebid over a game-forcing 2/1 (after 1♠)",
          ctx("opener", {
            opening: is("1S"),
            partnerLast: bidAt({ level: 2, strains: ["C", "D", "H"] }),
            roundMin: 2,
            contested: false,
          }),
          16,
        ),
        forcing(
          "responder-over-2over1-suit-1h",
          "Responder must bid on in a 2/1 auction (after 1♥)",
          ctx("responder", {
            opening: is("1H"),
            ownFirst: bidAt({ level: 2, strains: ["C", "D"] }),
            partnerLast: bidAt({ min: 2, max: 3, strains: ["C", "D", "H", "S"] }),
            contested: false,
          }),
          17,
        ),
        forcing(
          "responder-over-2over1-2nt-1h",
          "Responder must bid over the forcing 2NT (after 1♥)",
          ctx("responder", {
            opening: is("1H"),
            ownFirst: bidAt({ level: 2, strains: ["C", "D"] }),
            partnerLast: is("2N"),
            contested: false,
          }),
          18,
        ),
        forcing(
          "responder-over-2over1-suit-1s",
          "Responder must bid on in a 2/1 auction (after 1♠)",
          ctx("responder", {
            opening: is("1S"),
            ownFirst: bidAt({ level: 2, strains: ["C", "D", "H"] }),
            partnerLast: bidAt({ min: 2, max: 3, strains: ["C", "D", "H", "S"] }),
            contested: false,
          }),
          19,
        ),
        forcing(
          "responder-over-2over1-2nt-1s",
          "Responder must bid over the forcing 2NT (after 1♠)",
          ctx("responder", {
            opening: is("1S"),
            ownFirst: bidAt({ level: 2, strains: ["C", "D", "H"] }),
            partnerLast: is("2N"),
            contested: false,
          }),
          20,
        ),
      ],
    },
    {
      settings: [toggle("g_rb_forcing_on", "Forcing situations in the rebid tables")],
      sets: ["core"],
    },
  ),
];

/** Slide(s) each item was authored from — install.ts turns these into citations. */
export const REBIDS_SLIDES: Record<string, number[]> = {
  "rb-fn-opener-rebid": [28],
  "rb-fn-reverse": [28],
  "rb-fn-undiscussed": [28],
  "rb-1m-raise-major": [29],
  "rb-1m-new-major": [29],
  "rb-1m-jumpshift": [29],
  "rb-1m-reverse": [29],
  "rb-1m-rebid-own": [29],
  "rb-1m-notrump": [29],
  "rb-1m-undiscussed": [29],
  "rb-2over1-rebid": [30],
  "rb-2over1-2nt": [30],
  "rb-2over1-undiscussed": [30],
  "rb-band-matrix": [31],
  // The matrix's game cells are keyed to slide 15's own thresholds (3NT = 25,
  // 4M = 26), so this item is authored from both pictures.
  "rb-band-decisions": [31, 15],
  "rb-forcing-rebids": [28, 29, 30],
};
