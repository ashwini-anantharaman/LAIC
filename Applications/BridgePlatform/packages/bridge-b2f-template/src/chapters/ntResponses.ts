// Responding to a notrump (and to the 2♣) opening — the notes' pages 1-2 (the
// 1NT response tree), pages 10-11 (the summary lists for 1NT, 2NT and 2♣) and
// the page-16 convention table rows that define these gadgets.
//
// BAND DISCIPLINE (see @bridge/kb compile.ts): `convention` items compile into
// band 1 and are consulted BEFORE `agreement`/`bidding_rule` items (band 2), so
// every named gadget here (Texas, Jacoby, the minor-suit transfer, Stayman,
// Gerber) wins over the natural quantitative ladder. `concept` and
// `judgment_guideline` items carry no rules at all — they are the notes' prose.
// Page 2 states the reason for that ordering outright: "If there is a
// conventional bid that can accurately describe your hand, you should use that."
//
// PRIORITY ORDERING inside band 1: Texas first (10-16, it is the most specific
// row — a six-card major with exactly game or slam values), then Jacoby (15-22),
// then the minor-suit transfer (17-38), then Stayman (24-47), then Gerber (60+).
// Where two printed rows overlap, the more specific one carries the lower number
// and no extra negative condition is written.
//
// THE NOTES' NUMBERS, NOT THE OTHER TEMPLATE'S. Responder's bands over 1NT are
// 0-7 / 8-9 / 10-14 / 15-16 / 17+; over 2NT they are 0-4 / 5-11 / 12-13; the 1NT
// opening is 15-17 and is opened EVEN WITH A FIVE-CARD MAJOR (page 10), so
// responder must expect a five-card major opposite. Every one of those numbers is
// a `b_nt_*` range setting.
//
// CONTRADICTION A — THE MINOR-SUIT TRANSFER — is encoded, not hidden. Pages 2
// and 10 both wire it 2♠ -> 3♣ and 2NT -> 3♦; page 16's table says 2♠ -> ♣ and
// 3♣ -> ♦. This chapter encodes the pages-2-and-10 reading (two pages against
// one, and it is the reading whose consequences pages 2 and 16 then discuss at
// length — the "8-9 with no four-card major cannot invite with 2NT" oddity only
// exists if 2NT is the diamond transfer). Page 16's reading ships as a separate
// item, `nt-1n-minor-transfer-p16`, whose toggle defaults OFF: one dial away.
//
// PRINTED OVERLAPS AND HOLES, kept as printed and named in the item text:
//  * Texas over 1NT is 10-14 or 17+ — a deliberate HOLE at 15-16, which page 2
//    fills with "Jacoby transfer then jump to 4M to show mild slam interest".
//  * the quantitative rungs are "4NT 15-17" and "6NT 17+", which overlap at
//    exactly 17. A 17-count is routed to 6NT, because page 2's own six-card-major
//    ladder makes 17+ the slam band and 15-16 the slam-invitational one. Both
//    rungs are settings, so the seam moves without touching code.
//  * the five-card-major ladder is "10-15 -> 3NT or a second suit" and "15+ ->
//    second suit to explore slam", overlapping at 15; a 15-count with a side
//    four-card suit bids the second suit.
//  * Texas over 2NT is printed as "5-9 or 10+", which unions to 5+ with NO hole
//    — the 2NT version does not repeat the 1NT version's 15-16 gap.
//  * over 2♣, "0-4 -> cheapest minor" and "4+ -> support / own suit / NT"
//    overlap at 4; the constructive branch is consulted first, so 4 is
//    constructive.
//
// SETTINGS. The `b_nt_1n_*` bands are declared once, on `nt-1n-framework` (the
// 2NT and 2♣ bands on their own ladder items), and the rules in the convention
// items reference them — settings are KB-global, so a band lives in exactly one
// place and every item that needs it points at that one.
//
// INFERRED, AND SAID SO IN THE ITEM TEXT: opener's accept/decline of an
// invitation over 1NT/2NT (the notes print opener's rebids only after suit
// raises, page 11), Stayman's "hearts first holding both majors", the 2NT
// Stayman answers, and Gerber's step meanings (page 16 says only "similar to RKC
// w/o agreed upon trump suit").

import {
  ALWAYS,
  aces,
  all,
  any,
  ask,
  auctionItem,
  bal,
  bid,
  bidAt,
  bidLongest,
  bidSuit,
  ctx,
  dbl,
  firstLegal,
  forcing,
  hcp,
  high,
  is,
  item,
  len,
  longestAmong,
  low,
  not,
  overPassOrDouble,
  pass as passAction,
  quality,
  raise,
  range,
  rule,
  stopper,
  toggle,
  type TemplateItem,
} from "@bridge/sayc-template/dsl";

// --- local type aliases (so helpers can be typed without new imports) ------
type Pattern = ReturnType<typeof is>;
type Cond = ReturnType<typeof all>;

// --- setting keys ----------------------------------------------------------
const PARTIAL = "b_nt_1n_partial_range"; // 0-7
const INVITE = "b_nt_1n_invite_range"; // 8-9
const GAME = "b_nt_1n_game_range"; // 10-14
const SLAM_INV = "b_nt_1n_slam_invite_range"; // 15-16
const SLAM = "b_nt_1n_slam_range"; // 17+
const OPENER_1N = "b_nt_1n_opener_range"; // 15-17
const QUANT_4N = "b_nt_1n_quant_4n_range"; // 15-17
const N2_PARTIAL = "b_nt_2n_partial_range"; // 0-4
const N2_GAME = "b_nt_2n_game_range"; // 5-11
const N2_QUANT_4N = "b_nt_2n_quant_4n_range"; // 12-13
const OPENER_2N = "b_nt_2n_opener_range"; // 20-21
const N2_TEXAS_LOW = "b_nt_2n_texas_low_range"; // 5-9
const N2_TEXAS_HIGH = "b_nt_2n_texas_high_range"; // 10+
const C2_POSITIVE = "b_nt_2c_positive_range"; // 8+
const C2_MIN = "b_nt_2c_min_range"; // 0-4
const C2_SECOND = "b_nt_2c_second_range"; // 4+
const C2N_PARTIAL = "b_nt_2c_2n_partial_range"; // 0-2
const C2N_GAME = "b_nt_2c_2n_game_range"; // 3-9
const C2N_QUANT_4N = "b_nt_2c_2n_quant_4n_range"; // 10-11
const GERBER_MIN = "b_nt_gerber_min_range"; // 15+

// --- shared shorthands -----------------------------------------------------

/** Responder over partner's 1NT / 2NT / 2♣ opening. */
const OVER_1N = { opening: is("1N"), partnerLast: is("1N") } as const;
const OVER_2N = { opening: is("2N"), partnerLast: is("2N") } as const;
const OVER_2C = { opening: is("2C"), partnerLast: is("2C") } as const;
/** Opener, having opened 1NT / 2NT / 2♣. */
const AS_1N_OPENER = { ownFirst: is("1N") } as const;
const AS_2N_OPENER = { ownFirst: is("2N") } as const;
const AS_2C_OPENER = { ownFirst: is("2C") } as const;
/** Responder's Jacoby transfer bid over 1NT (2♦/2♥) and over 2NT (3♦/3♥). */
const JACOBY_1N = bidAt({ level: 2, strains: ["D", "H"] });
const JACOBY_2N = bidAt({ level: 3, strains: ["D", "H"] });
/** Responder's Texas transfer bid (4♦/4♥), over either notrump opening. */
const TEXAS = bidAt({ level: 4, strains: ["D", "H"] });
/** Responder's minor-suit transfer bid over 1NT (2♠ = clubs, 2NT = diamonds). */
const MINOR_XFER = bidAt({ min: 2, max: 2, strains: ["S", "N"] });
/** A major at the two / three / four level. */
const MAJOR_2 = bidAt({ level: 2, strains: ["H", "S"] });
const MAJOR_3 = bidAt({ level: 3, strains: ["H", "S"] });
const MAJOR_4 = bidAt({ level: 4, strains: ["H", "S"] });
/** Opener's reply to 2♠ (2NT "I like clubs", or the 3♣ completion). */
const CLUB_REPLY = bidAt({ min: 2, max: 3, strains: ["N", "C"] });
/** Opener's reply to 2NT (3♣ "I like diamonds", or the 3♦ completion). */
const DIAMOND_REPLY = bidAt({ level: 3, strains: ["C", "D"] });
/** Any natural suit bid (used for opener's rebid after the 2♣-2♦ waiting bid). */
const SUIT_BID = bidAt({ strains: ["C", "D", "H", "S"] });
/** A minor at the three level (responder's retreat in the transferred minor). */
const MINOR_3 = bidAt({ level: 3, strains: ["C", "D"] });

/** Page 2's "no four-card major" / "no five-card major" columns. */
const NO_4_MAJOR = not(any(len("S", 4), len("H", 4)));
const NO_5_MAJOR = not(any(len("S", 5), len("H", 5)));
const NO_6_MINOR = not(any(len("C", 6), len("D", 6)));

/**
 * Page 1's tie-break ("longer suit first, higher ranking with 5-5 or 6-6") for
 * the two majors, as a condition on the HIGHER suit: spades qualify when spades
 * are (equal-)longest, or when hearts are not longer. The heart rule then needs
 * no negative condition — it is only reached when this one fails. The language
 * cannot compare two suit lengths directly, so a freak with six spades and seven
 * hearts still routes to spades; noted rather than papered over.
 */
const spadesFirst = (min: number): Cond =>
  all(len("S", min), any(longestAmong("S"), not(len("H", min + 1))));
/** Same tie-break for the minors, as a condition on diamonds. */
const diamondsFirst = (min: number): Cond =>
  all(len("D", min), any(longestAmong("D"), not(len("C", min + 1))));

/**
 * Page 11's "strong suit": two or more honours, or six-plus cards with one
 * honour. The language cannot COUNT honours, so `two_of_top_three` stands in for
 * "2+ honours" and the six-card alternative degrades to bare length.
 */
const strongMajor = (s: "H" | "S"): Cond => any(quality(s), len(s, 6));
/** For the minors page 11 gives only "2+ honours". */
const strongMinor = (s: "C" | "D"): Cond => quality(s);

/** "The opener can show whether they like your suit" — the notes never define
 *  "like", so: four cards, or three to two of the top three. */
const likesMinor = (s: "C" | "D"): Cond =>
  any(len(s, 4), all(len(s, 3), quality(s)));

/**
 * Page 2's "give up on M" rungs after Stayman: 2NT 8-9, 3NT 10-14, 4NT 15-17,
 * 6NT 17+. Emitted once per opener reply, with the "no fit" test that reply
 * needs. 6NT is tested before 4NT so the printed 17 overlap resolves upward.
 */
const giveUpRungs = (tag: string, reply: Pattern, noFit: Cond, pri: number) => {
  const at = ctx("responder", { opening: is("1N"), ownLast: is("2C"), partnerLast: reply });
  return [
    rule(`${tag}-6n`, "No fit, 17+: 6NT", at, all(noFit, hcp(low(SLAM))), bid(6, "N"), pri, {
      shows: { hcp: { min: 17 } },
    }),
    rule(
      `${tag}-4n`,
      "No fit, 15-17: 4NT",
      at,
      all(noFit, hcp(low(QUANT_4N), high(QUANT_4N))),
      bid(4, "N"),
      pri + 1,
      { shows: { hcp: { min: 15, max: 17 } } },
    ),
    rule(
      `${tag}-3n`,
      "No fit, 10-14: 3NT",
      at,
      all(noFit, hcp(low(GAME), high(GAME))),
      bid(3, "N"),
      pri + 2,
      { shows: { hcp: { min: 10, max: 14 } } },
    ),
    rule(
      `${tag}-2n`,
      "No fit, 8-9: 2NT",
      at,
      all(noFit, hcp(low(INVITE), high(INVITE))),
      bid(2, "N"),
      pri + 3,
      { shows: { hcp: { min: 8, max: 9 } } },
    ),
  ];
};

const GERBER = "b2f-gerber-aces";
/**
 * The decoded meaning of each Gerber answer. The language carries ace counts in
 * the `keycards` channel (there is no separate aces channel in an ask decode),
 * so the asker's inference reads "0 or 4 keycards" for 4♦ and so on.
 */
const GERBER_RESPONSES = {
  "4D": { keycards: [0, 4] },
  "4H": { keycards: [1] },
  "4S": { keycards: [2] },
  "4N": { keycards: [3] },
};

export const NT_RESPONSES: TemplateItem[] = [
  // =========================================================================
  // Pages 1-2, 10-11 — the framework every response row is measured against.
  // =========================================================================
  item(
    "nt-1n-framework",
    "Responding to notrump: the notes' point bands",
    "A 1NT opening is 15-17 balanced and is opened EVEN WITH A FIVE-CARD MAJOR (page 10, \"balanced hand -> " +
      "bid 1N with 15-17 pts, bid 2N with 20-21 pts, EVEN WITH 5M\"), so responder must expect a five-card " +
      "major opposite and may be facing two to five cards in any suit. A 2NT opening is 20-21 balanced. " +
      "Responder's bands over 1NT are 0-7 (partial), 8-9 (invitational), 10-14 (game), 15-16 (mild slam " +
      "interest) and 17+ (slam); over 2NT they are 0-4, 5-11 and 12-13. Page 1 fixes the order of priority " +
      "for exploring game — 4M first, then 3NT, then 5m — which is why a six-card major transfers to game " +
      "rather than bidding 3NT, and why the minor-suit transfer is only for hands too weak or too strong for " +
      "3NT. Page 1 also fixes the suit-length promises used throughout: the suit implied by a Jacoby or Texas " +
      "transfer is a FIRST natural suit bid and so promises five or more cards, while a second natural suit " +
      "bid promises four or more.",
    "concept",
    "auction",
    { kind: "none" },
    {
      settings: [
        range(PARTIAL, "Responder: partial, over 1NT (HCP)", 0, 7, { min: 0, max: 12 }),
        range(INVITE, "Responder: invitational, over 1NT (HCP)", 8, 9, { min: 5, max: 13 }),
        range(GAME, "Responder: game, over 1NT (HCP)", 10, 14, { min: 8, max: 18 }),
        range(SLAM_INV, "Responder: mild slam interest, over 1NT (HCP)", 15, 16, { min: 12, max: 20 }),
        range(SLAM, "Responder: slam, over 1NT (HCP)", 17, 40, { min: 14, max: 40 }),
        range(OPENER_1N, "1NT opening range (HCP)", 15, 17, { min: 12, max: 20 }),
      ],
    },
  ),

  item(
    "nt-use-conventions-first",
    "If a conventional bid describes your hand, use it",
    "Page 2 closes the response tree with the rule that orders everything else: \"Most common conventional " +
      "bids are 2c opening, 1M-1N (Forcing NT), 1M-2N (Jacoby 2N), 1N-2d & 1N-2h (Jacoby Transfer), 1N-4d & " +
      "1N-4h (Texas Transfer), 1N-2c (Stayman), Takeout Double, Negative Double, and 1m-2m (Inverted " +
      "Minors). You need to remember these bids by rote memory. If there is a conventional bid that can " +
      "accurately describe your hand, you should use that.\" That is the notes' own statement of the band " +
      "discipline this chapter compiles to: the artificial calls are consulted before the natural " +
      "quantitative ladder, and the ladder only ever sees hands no gadget wanted.",
    "judgment_guideline",
    "auction",
    { kind: "none" },
  ),

  // =========================================================================
  // Pages 2, 10, 16 — TEXAS transfers. The most specific 1NT row: a six-card
  // major with EXACTLY game values or EXACTLY slam values.
  // =========================================================================
  auctionItem(
    "nt-1n-texas",
    "Texas transfer over 1NT (4♦/4♥)",
    "With a six-card or longer major, 4♦ asks opener for 4♥ and 4♥ asks for 4♠ — page 10: \"6+M, 10-14 or " +
      "17+ pts -> TEXAS transfer: bid 4d with h and 4h with s\". The point requirement is two SEPARATE bands, " +
      "not one: 10-14 (game, and responder passes the completion) or 17+ (slam, and responder carries on with " +
      "keycards or a cuebid — page 2: \"Texas Transfer and then continue to explore slam, e.g. using RKC or " +
      "cuebid\"). Between them is a deliberate hole at 15-16, which page 2 fills through Jacoby instead; see " +
      "`nt-1n-texas-hole`. The transfer is forcing: opener always completes it, and completing leaves the 1NT " +
      "hand as declarer. With six cards in both majors the higher-ranking suit is shown first, per page 1's " +
      "\"higher ranking with 5-5 or 6-6\". The slam continuation itself is not mechanized here: RKC and the " +
      "cuebid are the conventions chapter's items.",
    "convention",
    [
      ...overPassOrDouble(
        rule(
          "xfer-s-game",
          "4♥ Texas to spades, game values",
          ctx("responder", { ...OVER_1N }),
          all(spadesFirst(6), hcp(low(GAME), high(GAME))),
          bid(4, "H"),
          10,
          { shows: { hcp: { min: 10, max: 14 }, suits: [{ suit: "S", min: 6 }], forcing: true } },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "xfer-s-slam",
          "4♥ Texas to spades, slam values",
          ctx("responder", { ...OVER_1N }),
          all(spadesFirst(6), hcp(low(SLAM))),
          bid(4, "H"),
          11,
          { shows: { hcp: { min: 17 }, suits: [{ suit: "S", min: 6 }], forcing: true } },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "xfer-h-game",
          "4♦ Texas to hearts, game values",
          ctx("responder", { ...OVER_1N }),
          all(len("H", 6), hcp(low(GAME), high(GAME))),
          bid(4, "D"),
          12,
          { shows: { hcp: { min: 10, max: 14 }, suits: [{ suit: "H", min: 6 }], forcing: true } },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "xfer-h-slam",
          "4♦ Texas to hearts, slam values",
          ctx("responder", { ...OVER_1N }),
          all(len("H", 6), hcp(low(SLAM))),
          bid(4, "D"),
          13,
          { shows: { hcp: { min: 17 }, suits: [{ suit: "H", min: 6 }], forcing: true } },
        ),
      ),
      // `partnerFirst` matters: only a DIRECT 4♦/4♥ is Texas. Without it these
      // would also fire on 1NT-2♦-2♥-4♥ (the Jacoby jump to game) and pull that
      // 4♥ to 4♠.
      rule(
        "complete-h",
        "Complete 4♦ to 4♥",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("4D"), partnerLast: is("4D") }),
        ALWAYS,
        bid(4, "H"),
        14,
      ),
      rule(
        "complete-s",
        "Complete 4♥ to 4♠",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("4H"), partnerLast: is("4H") }),
        ALWAYS,
        bid(4, "S"),
        15,
      ),
      rule(
        "cont-pass",
        "Game values: pass the completed Texas transfer",
        ctx("responder", { opening: is("1N"), ownLast: TEXAS, partnerLast: MAJOR_4 }),
        hcp(undefined, high(GAME)),
        passAction,
        16,
        { shows: { hcp: { max: 14 } } },
      ),
    ],
    {
      settings: [
        toggle(
          "b_nt_1n_texas_on",
          "Texas transfer over 1NT (4♦/4♥)",
          true,
          "Page 10's row: 6+ card major with 10-14 or 17+ points.",
        ),
      ],
      sets: ["conventions"],
    },
  ),

  item(
    "nt-1n-texas-hole",
    "The deliberate 15-16 hole in Texas, and how page 2 fills it",
    "Texas over 1NT is 10-14 OR 17+ — the notes state two bands and leave 15-16 out, and the gap is not a " +
      "transcription slip: page 2 gives 15-16 its own route. \"15-16 pts: Jacoby Transfer and then jump to 4M " +
      "to show mild slam interest with a 6-carder major.\" The logic is that a 15-16 hand wants to invite " +
      "slam, and Texas (which lands in 4M immediately) has no room to invite, whereas the two-level Jacoby " +
      "transfer followed by a JUMP to 4M says \"game, and I have more than game values\" while leaving opener " +
      "room to move. So the three six-card-major rungs above game are: 10-14 Texas and pass; 15-16 Jacoby " +
      "then jump to 4M; 17+ Texas then explore slam. The mechanism for the middle rung lives on the Jacoby " +
      "item (`cont-slam-invite-jump`), because the bid that starts it is a Jacoby transfer.",
    "concept",
    "auction",
    { kind: "none" },
  ),

  // =========================================================================
  // Pages 1-2, 10, 16 — JACOBY transfers and every continuation the notes print
  // for both the six-card ladder and the five-card ladder.
  // =========================================================================
  auctionItem(
    "nt-1n-jacoby",
    "Jacoby transfer over 1NT (2♦/2♥)",
    "Over 1NT, 2♦ shows five or more hearts and 2♥ shows five or more spades, with ZERO OR MORE points — " +
      "page 2: \"5+M: Jacoby transfer with 0+ pts (it's easier to play in M than in NT)\". Page 16 adds the " +
      "rule that orders it against Texas — Jacoby is for \"5+ card M and hand not suitable for Texas " +
      "Transfer\" — which is why Texas carries the lower priority number here and is consulted first. " +
      "Opener completes " +
      "with 2♥/2♠; the transfer is forcing and the 1NT hand declares. Responder then clarifies on the ladder " +
      "the notes print twice. With a SIX-card major: 0-7 pass the completion; 8-9 bid 3M; 15-16 JUMP to 4M " +
      "(mild slam interest — the rung Texas deliberately skips). With a FIVE-card major: 0-7 pass next; 8-9 " +
      "invite with a choice of games by bidding 2NT; 10-15 offer a choice of games with 3NT or bid a second " +
      "suit; 15+ bid the second suit to explore slam. The 10-15 and 15+ rungs overlap at 15, so a 15-count " +
      "with a four-card side suit shows the side suit (the slam try) and a 15-count without one bids 3NT. A " +
      "second suit needs only four cards (page 1's second-natural-suit rule) and is bid at the cheapest " +
      "level. Two rungs here are only reachable when Texas is switched off — a six-card major with 10-14 or " +
      "17+ normally never gets this far — and they degrade to a jump to 4M. Opener's side of the two " +
      "invitations is NOT printed anywhere in the notes (page 11 gives opener's rebids only after suit " +
      "raises), so the standard reading is used and flagged: pass with a minimum, bid game with a maximum, " +
      "and treat 3NT as the promised \"choice of games\" by correcting to 4M with three-card support.",
    "convention",
    [
      ...overPassOrDouble(
        rule(
          "xfer-s",
          "2♥ transfer to spades (5+ spades, 0+)",
          ctx("responder", { ...OVER_1N }),
          spadesFirst(5),
          bid(2, "H"),
          15,
          { shows: { suits: [{ suit: "S", min: 5 }], forcing: true } },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "xfer-h",
          "2♦ transfer to hearts (5+ hearts, 0+)",
          ctx("responder", { ...OVER_1N }),
          len("H", 5),
          bid(2, "D"),
          16,
          { shows: { suits: [{ suit: "H", min: 5 }], forcing: true } },
        ),
      ),
      rule(
        "complete-h",
        "Complete the transfer to 2♥",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2D"), partnerLast: is("2D") }),
        ALWAYS,
        bid(2, "H"),
        20,
      ),
      rule(
        "complete-s",
        "Complete the transfer to 2♠",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2H"), partnerLast: is("2H") }),
        ALWAYS,
        bid(2, "S"),
        21,
      ),
      // ---- responder's clarification (page 2's two ladders) ----------------
      rule(
        "cont-pass",
        "0-7: pass the completion",
        ctx("responder", { opening: is("1N"), ownLast: JACOBY_1N, partnerLast: MAJOR_2 }),
        hcp(undefined, high(PARTIAL)),
        passAction,
        30,
        { shows: { hcp: { max: 7 } } },
      ),
      rule(
        "cont-inv-3m",
        "8-9 with six: 3M",
        ctx("responder", { opening: is("1N"), ownLast: JACOBY_1N, partnerLast: MAJOR_2 }),
        all(hcp(low(INVITE), high(INVITE)), len("partner_last_bid_suit", 6)),
        raise(3),
        31,
        { shows: { hcp: { min: 8, max: 9 }, forcing: false } },
      ),
      rule(
        "cont-inv-2n",
        "8-9 with five: 2NT, choice of games",
        ctx("responder", { opening: is("1N"), ownLast: JACOBY_1N, partnerLast: MAJOR_2 }),
        all(hcp(low(INVITE), high(INVITE)), len("partner_last_bid_suit", 5, 5)),
        bid(2, "N"),
        32,
        { shows: { hcp: { min: 8, max: 9 } } },
      ),
      rule(
        "cont-slam-invite-jump",
        "15-16 with six: jump to 4M, mild slam interest",
        ctx("responder", { opening: is("1N"), ownLast: JACOBY_1N, partnerLast: MAJOR_2 }),
        all(hcp(low(SLAM_INV), high(SLAM_INV)), len("partner_last_bid_suit", 6)),
        raise(4),
        33,
        { shows: { hcp: { min: 15, max: 16 } } },
      ),
      rule(
        "cont-slam-2nd-suit-after-2h",
        "15+: show the second suit to explore slam (hearts transferred)",
        ctx("responder", { opening: is("1N"), ownLast: is("2D"), partnerLast: is("2H") }),
        all(hcp(low(SLAM_INV)), any(len("S", 4), len("D", 4), len("C", 4))),
        bidLongest(["S", "D", "C"]),
        34,
        { shows: { hcp: { min: 15 }, suits: [{ suit: "H", min: 5 }] } },
      ),
      rule(
        "cont-slam-2nd-suit-after-2s",
        "15+: show the second suit to explore slam (spades transferred)",
        ctx("responder", { opening: is("1N"), ownLast: is("2H"), partnerLast: is("2S") }),
        all(hcp(low(SLAM_INV)), any(len("H", 4), len("D", 4), len("C", 4))),
        bidLongest(["H", "D", "C"]),
        35,
        { shows: { hcp: { min: 15 }, suits: [{ suit: "S", min: 5 }] } },
      ),
      rule(
        "cont-game-4m",
        "Game values with six (Texas off): 4M",
        ctx("responder", { opening: is("1N"), ownLast: JACOBY_1N, partnerLast: MAJOR_2 }),
        all(hcp(low(GAME)), len("partner_last_bid_suit", 6)),
        raise(4),
        36,
        { shows: { hcp: { min: 10 } } },
      ),
      rule(
        "cont-game-3n",
        "10-15 with five: 3NT, choice of games",
        ctx("responder", { opening: is("1N"), ownLast: JACOBY_1N, partnerLast: MAJOR_2 }),
        all(hcp(low(GAME)), len("partner_last_bid_suit", 5, 5)),
        bid(3, "N"),
        37,
        { shows: { hcp: { min: 10 } } },
      ),
      // ---- opener's side of the invitations (inferred; see the item text) --
      rule(
        "accept-2n-4m",
        "Maximum with three-card support: 4M",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: JACOBY_1N,
          ownLast: MAJOR_2,
          partnerLast: is("2N"),
        }),
        all(hcp(high(OPENER_1N)), len("own_last_bid_suit", 3)),
        bidSuit("own_last_bid_suit", 4),
        40,
      ),
      rule(
        "accept-2n-3n",
        "Accept the 2NT invitation with a maximum",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: JACOBY_1N,
          ownLast: MAJOR_2,
          partnerLast: is("2N"),
        }),
        hcp(high(OPENER_1N)),
        bid(3, "N"),
        41,
      ),
      rule(
        "decline-2n",
        "Pass the 2NT invitation with a minimum",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: JACOBY_1N,
          ownLast: MAJOR_2,
          partnerLast: is("2N"),
        }),
        ALWAYS,
        passAction,
        42,
      ),
      rule(
        "accept-3m",
        "Accept the 3M invitation with a maximum",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: JACOBY_1N,
          ownLast: MAJOR_2,
          partnerLast: MAJOR_3,
        }),
        hcp(high(OPENER_1N)),
        raise(4),
        43,
      ),
      rule(
        "decline-3m",
        "Pass the 3M invitation with a minimum",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: JACOBY_1N,
          ownLast: MAJOR_2,
          partnerLast: MAJOR_3,
        }),
        ALWAYS,
        passAction,
        44,
      ),
      rule(
        "choice-3n-to-4m",
        "Take the choice of games into 4M with three-card support",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: JACOBY_1N,
          ownLast: MAJOR_2,
          partnerLast: is("3N"),
        }),
        len("own_last_bid_suit", 3),
        bidSuit("own_last_bid_suit", 4),
        45,
      ),
      rule(
        "choice-3n-pass",
        "Pass 3NT with a doubleton in responder's major",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: JACOBY_1N,
          ownLast: MAJOR_2,
          partnerLast: is("3N"),
        }),
        ALWAYS,
        passAction,
        46,
      ),
    ],
    {
      settings: [
        toggle(
          "b_nt_1n_jacoby_on",
          "Jacoby transfer over 1NT (2♦/2♥)",
          true,
          "Page 2: five or more in a major, zero or more points.",
        ),
      ],
      sets: ["conventions"],
    },
  ),

  // =========================================================================
  // Pages 2, 10, 16 — THE MINOR-SUIT TRANSFER. CONTRADICTION A.
  //
  // Pages 2 and 10 both wire it 2♠ -> 3♣ and 2NT -> 3♦. Page 16's table wires
  // it 2♠ -> ♣ and 3♣ -> ♦. This item is the pages-2-and-10 reading; the
  // page-16 reading is `nt-1n-minor-transfer-p16` with its toggle off.
  // =========================================================================
  auctionItem(
    "nt-1n-minor-transfer",
    "Minor-suit transfer over 1NT (2♠ = clubs, 2NT = diamonds)",
    "CONTRADICTION IN THE NOTES, encoded with the majority reading and flagged. Page 2 says \"6+m (0-9 or " +
      "15+ pts): MINOR SUIT TRANSFER, bid 2s as xfr to C and 2NT as xfr to D\", and page 10 repeats it: " +
      "\"6+m -> transfer: bid 2s xfr to 3c and 2NT xfr to 3d\". Page 16's convention table instead says " +
      "\"bid 2s to transfer to C and bid 3c to transfer to 3d\". This item encodes PAGES 2 AND 10 — two pages " +
      "against one, and it is the reading the notes then reason from at length: page 2's whole \"8-9 with no " +
      "four-card major cannot invite with 2NT\" paragraph only makes sense if 2NT is the diamond transfer. " +
      "Page 16's reading is available as a separate item whose toggle is off by default. " +
      "POINTS: 0-9 or 15+ (page 2, and page 16 agrees — \"either less than 10 pts or mild slam interest (15+ " +
      "pts)\"). A 10-14 game-forcing hand IGNORES the minor entirely and bids the quantitative ladder — page " +
      "2 says so outright: \"Note: 10-14 pts (Game Forcing hand), ignore the minor suit\". Page 10's looser " +
      "\"6+m, 0+ pts\" row is treated as shorthand for the same thing. " +
      "OPENER MAY DECLINE TO COMPLETE: \"The opener can show whether they like your suit or not by bidding 2N " +
      "or 3c respectively instead of completing the transfer\" — so over 2♠ opener bids 2NT to show a liking " +
      "for clubs (3♣ completes), and over 2NT opener bids 3♣ to show a liking for diamonds (3♦ completes). " +
      "Note that this makes 3♣ the \"I like diamonds\" bid, which is exactly the call page 16 wanted to use " +
      "as the diamond transfer — a second reason the two readings cannot both be live. \"Likes your suit\" is " +
      "never defined in the notes; four cards, or three to two of the top three, is used here. " +
      "RESPONDER THEN: with 0-7 pass the completion (or rebid 3m if opener made the intermediate bid); with " +
      "8-9, if opener showed a liking for the minor, strongly consider 3NT when six tricks in the minor look " +
      "likely, and with a weak suit bid 3m instead — \"and the opener will pass\"; with 15+ bid 3NT even if " +
      "opener does not like the suit, showing slam interest, or explore slam by SHOWING A SHORT SUIT, where " +
      "3M shows SHORTNESS in that major \"since you would have tried Stayman if you had a real M suit\". Over " +
      "that shortness bid, \"if the opener has control in that M, they will bid 3N, otherwise they will " +
      "retreat to 4m\". A six-card minor is shown before a four-card major here, following the notes' own " +
      "list order (pages 2 and 10 print the transfer rows above the Stayman row); with 8-9 and both, that " +
      "seam is a judgment call a reviewer may want to move.",
    "convention",
    [
      ...overPassOrDouble(
        rule(
          "xfer-d",
          "2NT: transfer to 3♦ (6+ diamonds, 0-9 or 15+)",
          ctx("responder", { ...OVER_1N }),
          all(diamondsFirst(6), any(hcp(undefined, high(INVITE)), hcp(low(SLAM_INV)))),
          bid(2, "N"),
          17,
          { shows: { suits: [{ suit: "D", min: 6 }], forcing: true } },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "xfer-c",
          "2♠: transfer to 3♣ (6+ clubs, 0-9 or 15+)",
          ctx("responder", { ...OVER_1N }),
          all(len("C", 6), any(hcp(undefined, high(INVITE)), hcp(low(SLAM_INV)))),
          bid(2, "S"),
          18,
          { shows: { suits: [{ suit: "C", min: 6 }], forcing: true } },
        ),
      ),
      // ---- opener: like the minor, or complete ----------------------------
      rule(
        "like-d",
        "3♣ over 2NT: I like your diamonds",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2N"), partnerLast: is("2N") }),
        likesMinor("D"),
        bid(3, "C"),
        19,
        { shows: { hcp: { min: 15, max: 17 }, suits: [{ suit: "D", min: 3 }] } },
      ),
      rule(
        "complete-d",
        "Complete 2NT with 3♦",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2N"), partnerLast: is("2N") }),
        ALWAYS,
        bid(3, "D"),
        20,
      ),
      rule(
        "like-c",
        "2NT over 2♠: I like your clubs",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2S"), partnerLast: is("2S") }),
        likesMinor("C"),
        bid(2, "N"),
        21,
        { shows: { hcp: { min: 15, max: 17 }, suits: [{ suit: "C", min: 3 }] } },
      ),
      rule(
        "complete-c",
        "Complete 2♠ with 3♣",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2S"), partnerLast: is("2S") }),
        ALWAYS,
        bid(3, "C"),
        22,
      ),
      // ---- responder, club branch (own 2♠) --------------------------------
      rule(
        "c-pass-completion",
        "0-9: pass the 3♣ completion",
        ctx("responder", { opening: is("1N"), ownLast: is("2S"), partnerLast: is("3C") }),
        hcp(undefined, high(INVITE)),
        passAction,
        23,
        { shows: { hcp: { max: 9 } } },
      ),
      rule(
        "c-slam-short-h",
        "15+: 3♥ shows heart SHORTNESS, not hearts",
        ctx("responder", { opening: is("1N"), ownLast: is("2S"), partnerLast: CLUB_REPLY }),
        all(hcp(low(SLAM_INV)), len("H", undefined, 1)),
        bid(3, "H"),
        24,
        { shows: { hcp: { min: 15 }, suits: [{ suit: "C", min: 6 }, { suit: "H", max: 1 }] } },
      ),
      rule(
        "c-slam-short-s",
        "15+: 3♠ shows spade SHORTNESS, not spades",
        ctx("responder", { opening: is("1N"), ownLast: is("2S"), partnerLast: CLUB_REPLY }),
        all(hcp(low(SLAM_INV)), len("S", undefined, 1)),
        bid(3, "S"),
        25,
        { shows: { hcp: { min: 15 }, suits: [{ suit: "C", min: 6 }, { suit: "S", max: 1 }] } },
      ),
      rule(
        "c-slam-3n",
        "15+: 3NT anyway, showing slam interest",
        ctx("responder", { opening: is("1N"), ownLast: is("2S"), partnerLast: CLUB_REPLY }),
        hcp(low(SLAM_INV)),
        bid(3, "N"),
        26,
        { shows: { hcp: { min: 15 }, suits: [{ suit: "C", min: 6 }] } },
      ),
      rule(
        "c-inv-3n",
        "8-9 with a strong suit opener likes: 3NT",
        ctx("responder", { opening: is("1N"), ownLast: is("2S"), partnerLast: is("2N") }),
        all(hcp(low(INVITE), high(INVITE)), quality("C")),
        bid(3, "N"),
        27,
        { shows: { hcp: { min: 8, max: 9 }, suits: [{ suit: "C", min: 6 }] } },
      ),
      rule(
        "c-rebid-3c",
        "0-9 with a weak suit: rebid 3♣ and opener passes",
        ctx("responder", { opening: is("1N"), ownLast: is("2S"), partnerLast: is("2N") }),
        hcp(undefined, high(INVITE)),
        bid(3, "C"),
        28,
        { shows: { hcp: { max: 9 }, suits: [{ suit: "C", min: 6 }] } },
      ),
      // ---- responder, diamond branch (own 2NT) ----------------------------
      rule(
        "d-pass-completion",
        "0-9: pass the 3♦ completion",
        ctx("responder", { opening: is("1N"), ownLast: is("2N"), partnerLast: is("3D") }),
        hcp(undefined, high(INVITE)),
        passAction,
        29,
        { shows: { hcp: { max: 9 } } },
      ),
      rule(
        "d-slam-short-h",
        "15+: 3♥ shows heart SHORTNESS, not hearts",
        ctx("responder", { opening: is("1N"), ownLast: is("2N"), partnerLast: DIAMOND_REPLY }),
        all(hcp(low(SLAM_INV)), len("H", undefined, 1)),
        bid(3, "H"),
        30,
        { shows: { hcp: { min: 15 }, suits: [{ suit: "D", min: 6 }, { suit: "H", max: 1 }] } },
      ),
      rule(
        "d-slam-short-s",
        "15+: 3♠ shows spade SHORTNESS, not spades",
        ctx("responder", { opening: is("1N"), ownLast: is("2N"), partnerLast: DIAMOND_REPLY }),
        all(hcp(low(SLAM_INV)), len("S", undefined, 1)),
        bid(3, "S"),
        31,
        { shows: { hcp: { min: 15 }, suits: [{ suit: "D", min: 6 }, { suit: "S", max: 1 }] } },
      ),
      rule(
        "d-slam-3n",
        "15+: 3NT anyway, showing slam interest",
        ctx("responder", { opening: is("1N"), ownLast: is("2N"), partnerLast: DIAMOND_REPLY }),
        hcp(low(SLAM_INV)),
        bid(3, "N"),
        32,
        { shows: { hcp: { min: 15 }, suits: [{ suit: "D", min: 6 }] } },
      ),
      rule(
        "d-inv-3n",
        "8-9 with a strong suit opener likes: 3NT",
        ctx("responder", { opening: is("1N"), ownLast: is("2N"), partnerLast: is("3C") }),
        all(hcp(low(INVITE), high(INVITE)), quality("D")),
        bid(3, "N"),
        33,
        { shows: { hcp: { min: 8, max: 9 }, suits: [{ suit: "D", min: 6 }] } },
      ),
      rule(
        "d-rebid-3d",
        "0-9 with a weak suit: rebid 3♦ and opener passes",
        ctx("responder", { opening: is("1N"), ownLast: is("2N"), partnerLast: is("3C") }),
        hcp(undefined, high(INVITE)),
        bid(3, "D"),
        34,
        { shows: { hcp: { max: 9 }, suits: [{ suit: "D", min: 6 }] } },
      ),
      // ---- opener's answers to the 3M shortness and to the 3m retreat -----
      rule(
        "opener-3n-over-shortness",
        "Control in responder's short major: 3NT",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: MINOR_XFER, partnerLast: MAJOR_3 }),
        stopper("partner_last_bid_suit"),
        bid(3, "N"),
        35,
      ),
      rule(
        "opener-retreat-4c",
        "No control: retreat to 4♣",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2S"), partnerLast: MAJOR_3 }),
        ALWAYS,
        bid(4, "C"),
        36,
      ),
      rule(
        "opener-retreat-4d",
        "No control: retreat to 4♦",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2N"), partnerLast: MAJOR_3 }),
        ALWAYS,
        bid(4, "D"),
        37,
      ),
      rule(
        "opener-pass-3m",
        "Pass responder's 3m retreat",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: MINOR_XFER, partnerLast: MINOR_3 }),
        ALWAYS,
        passAction,
        38,
      ),
    ],
    {
      settings: [
        toggle(
          "b_nt_1n_minor_transfer_on",
          "Minor-suit transfer over 1NT: 2♠→3♣, 2NT→3♦ (pages 2 and 10)",
          true,
          "The majority reading of contradiction A. Turn this OFF and turn on the page-16 item to read 3♣, not 2NT, as the diamond transfer.",
        ),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "nt-1n-minor-transfer-p16",
    "Minor-suit transfer, page 16's reading (3♣ = diamonds) — OFF by default",
    "The other side of CONTRADICTION A, shipped so the choice is one dial away. Page 16's convention table " +
      "says \"Minor Suit Transfer: Response to 1N: bid 2s to transfer to C and bid 3c to transfer to 3d. 6+ " +
      "card minor suit, either less than 10 pts or mild slam interest (15+ pts). With the latter, bid 3N " +
      "next.\" Pages 2 and 10 both say 2NT, not 3♣, so this item's toggle DEFAULTS TO OFF and the " +
      "`nt-1n-minor-transfer` item carries the live wiring. The two readings cannot both be live: with the " +
      "other item on, 2NT is already the diamond transfer and 3♣ is already opener's \"I like your diamonds\" " +
      "bid, so a fellow choosing this reading must switch that item OFF as well (this chapter cannot emit a " +
      "conflicts_with edge for it — the template's edge file is owned elsewhere). The club leg (2♠) is " +
      "identical under both readings and stays with the other item; only the diamond leg is repeated here, " +
      "with page 16's own continuation: 15+ bids 3NT next.",
    "convention",
    [
      ...overPassOrDouble(
        rule(
          "xfer-d-3c",
          "3♣: transfer to 3♦ (page 16's wiring)",
          ctx("responder", { ...OVER_1N }),
          all(diamondsFirst(6), any(hcp(undefined, high(INVITE)), hcp(low(SLAM_INV)))),
          bid(3, "C"),
          19,
          { shows: { suits: [{ suit: "D", min: 6 }], forcing: true } },
        ),
      ),
      rule(
        "complete-d",
        "Complete 3♣ with 3♦",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("3C"), partnerLast: is("3C") }),
        ALWAYS,
        bid(3, "D"),
        20,
      ),
      rule(
        "cont-pass",
        "Under 10: pass the 3♦ completion",
        ctx("responder", { opening: is("1N"), ownLast: is("3C"), partnerLast: is("3D") }),
        hcp(undefined, high(INVITE)),
        passAction,
        21,
        { shows: { hcp: { max: 9 } } },
      ),
      rule(
        "cont-3n",
        "15+: bid 3NT next (page 16's own continuation)",
        ctx("responder", { opening: is("1N"), ownLast: is("3C"), partnerLast: is("3D") }),
        hcp(low(SLAM_INV)),
        bid(3, "N"),
        22,
        { shows: { hcp: { min: 15 }, suits: [{ suit: "D", min: 6 }] } },
      ),
    ],
    {
      settings: [
        toggle(
          "b_nt_1n_minor_transfer_p16_on",
          "Minor-suit transfer: page 16's 3♣→3♦ reading",
          false,
          "Contradiction A, minority reading (page 16 against pages 2 and 10). Switch the pages-2-and-10 item off if you switch this on.",
        ),
      ],
      sets: ["conventions"],
    },
  ),

  // =========================================================================
  // Pages 2, 11, 16 — STAYMAN 2♣ and every continuation page 2 prints.
  // =========================================================================
  auctionItem(
    "nt-1n-stayman",
    "Stayman 2♣ over 1NT",
    "With eight or more points and a four-card major, bid 2♣ (page 11: \"4M, 8+ pts -> bid 2c (STAYMAN)\"). " +
      "Page 16 adds two interference rules: Stayman applies \"even if the next opponent doubles\", and \"if " +
      "the opponent overcalls 2c, then double is the Stayman bid\". Opener answers 2♦ with no four-card " +
      "major, 2♥ with four hearts, 2♠ with four spades; the notes do not say which to bid holding both, so " +
      "the standard hearts-first is used and flagged here. Responder then follows page 2 exactly: if opener " +
      "bids YOUR major, raise to 3M with 8-9 or bid 4M with 10-14; if opener bids 2♦ or 2♠ (no fit), give up " +
      "on the major and bid 2NT with 8-9, 3NT with 10-14, 4NT with 15-17 or 6NT with 17+; if opener bids 2♥ " +
      "and you hold spades, bid 2♠ with 8-9, 3NT with 10-14, or explore slam by bidding some other suit. The " +
      "4NT and 6NT rungs overlap at exactly 17 as printed; 17 is routed to 6NT here, and both rungs are " +
      "settings. With a fit and 15+ the notes print nothing, so 4M is bid and slam exploration is left to the " +
      "conventions chapter's keycard machinery. A six-card minor is transferred before this ask (the notes' " +
      "own list order); a five-card major transfers instead.",
    "convention",
    [
      rule(
        "ask-over-2c-overcall",
        "Double is Stayman when the opponent overcalls 2♣",
        ctx("responder", { ...OVER_1N, rhoLast: is("2C") }),
        all(hcp(low(INVITE)), any(len("S", 4), len("H", 4))),
        dbl,
        24,
        { shows: { hcp: { min: 8 }, forcing: true } },
      ),
      ...overPassOrDouble(
        rule(
          "ask",
          "Stayman 2♣ ask",
          ctx("responder", { ...OVER_1N }),
          all(hcp(low(INVITE)), any(len("S", 4), len("H", 4))),
          bid(2, "C"),
          25,
          { shows: { hcp: { min: 8 }, forcing: true } },
        ),
      ),
      rule(
        "reply-h",
        "2♥: four hearts (hearts first holding both — inferred)",
        ctx("opener", { ...AS_1N_OPENER, partnerLast: is("2C") }),
        len("H", 4),
        bid(2, "H"),
        26,
        { shows: { hcp: { min: 15, max: 17 }, suits: [{ suit: "H", min: 4 }] } },
      ),
      rule(
        "reply-s",
        "2♠: four spades",
        ctx("opener", { ...AS_1N_OPENER, partnerLast: is("2C") }),
        len("S", 4),
        bid(2, "S"),
        27,
        {
          shows: {
            hcp: { min: 15, max: 17 },
            suits: [
              { suit: "S", min: 4 },
              { suit: "H", max: 3 },
            ],
          },
        },
      ),
      rule(
        "reply-d",
        "2♦: no four-card major",
        ctx("opener", { ...AS_1N_OPENER, partnerLast: is("2C") }),
        ALWAYS,
        bid(2, "D"),
        28,
        {
          shows: {
            hcp: { min: 15, max: 17 },
            suits: [
              { suit: "S", max: 3 },
              { suit: "H", max: 3 },
            ],
          },
        },
      ),
      // ---- opener bid YOUR major ------------------------------------------
      rule(
        "fit-inv-3m",
        "Fit, 8-9: raise to 3M",
        ctx("responder", { opening: is("1N"), ownLast: is("2C"), partnerLast: MAJOR_2 }),
        all(hcp(low(INVITE), high(INVITE)), len("partner_last_bid_suit", 4)),
        raise(3),
        29,
        { shows: { hcp: { min: 8, max: 9 } } },
      ),
      rule(
        "fit-game-4m",
        "Fit, 10-14 (and up): bid 4M",
        ctx("responder", { opening: is("1N"), ownLast: is("2C"), partnerLast: MAJOR_2 }),
        all(hcp(low(GAME)), len("partner_last_bid_suit", 4)),
        raise(4),
        30,
        { shows: { hcp: { min: 10 } } },
      ),
      // ---- opener bid 2♥ and responder holds the spades -------------------
      rule(
        "spades-slam-try",
        "Spades opposite 2♥, 15+: explore slam with some other suit",
        ctx("responder", { opening: is("1N"), ownLast: is("2C"), partnerLast: is("2H") }),
        all(
          hcp(low(SLAM_INV)),
          not(len("H", 4)),
          len("S", 4),
          any(len("D", 4), len("C", 4)),
        ),
        bidLongest(["D", "C"]),
        31,
        { shows: { hcp: { min: 15 }, suits: [{ suit: "S", min: 4 }] } },
      ),
      rule(
        "spades-inv-2s",
        "Spades opposite 2♥, 8-9: bid 2♠",
        ctx("responder", { opening: is("1N"), ownLast: is("2C"), partnerLast: is("2H") }),
        all(hcp(low(INVITE), high(INVITE)), not(len("H", 4)), len("S", 4)),
        bid(2, "S"),
        32,
        { shows: { hcp: { min: 8, max: 9 }, suits: [{ suit: "S", min: 4 }] } },
      ),
      rule(
        "spades-game-3n",
        "Spades opposite 2♥, 10-14: 3NT",
        ctx("responder", { opening: is("1N"), ownLast: is("2C"), partnerLast: is("2H") }),
        all(hcp(low(GAME), high(GAME)), not(len("H", 4)), len("S", 4)),
        bid(3, "N"),
        33,
        { shows: { hcp: { min: 10, max: 14 }, suits: [{ suit: "S", min: 4 }] } },
      ),
      // ---- "give up on M" rungs, once per opener reply --------------------
      ...giveUpRungs("gu-2d", is("2D"), ALWAYS, 34),
      ...giveUpRungs("gu-2s", is("2S"), not(len("S", 4)), 38),
      ...giveUpRungs("gu-2h", is("2H"), all(not(len("H", 4)), not(len("S", 4))), 42),
      // ---- opener's side of responder's invitations (inferred) ------------
      rule(
        "accept-2s",
        "Maximum with three spades over responder's 2♠: 4♠",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: is("2C"),
          ownLast: is("2H"),
          partnerLast: is("2S"),
        }),
        all(hcp(high(OPENER_1N)), len("S", 3)),
        bid(4, "S"),
        46,
      ),
      rule(
        "accept-2s-3n",
        "Maximum without a spade fit: 3NT",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: is("2C"),
          ownLast: is("2H"),
          partnerLast: is("2S"),
        }),
        hcp(high(OPENER_1N)),
        bid(3, "N"),
        47,
      ),
      rule(
        "decline-2s",
        "Minimum: pass responder's 2♠",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: is("2C"),
          ownLast: is("2H"),
          partnerLast: is("2S"),
        }),
        ALWAYS,
        passAction,
        48,
      ),
      rule(
        "accept-3m",
        "Accept the 3M raise with a maximum",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: is("2C"),
          ownLast: MAJOR_2,
          partnerLast: MAJOR_3,
        }),
        hcp(high(OPENER_1N)),
        raise(4),
        49,
      ),
      rule(
        "decline-3m",
        "Pass the 3M raise with a minimum",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: is("2C"),
          ownLast: MAJOR_2,
          partnerLast: MAJOR_3,
        }),
        ALWAYS,
        passAction,
        50,
      ),
      rule(
        "accept-2n",
        "Accept responder's 2NT with a maximum",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2C"), partnerLast: is("2N") }),
        hcp(high(OPENER_1N)),
        bid(3, "N"),
        51,
      ),
      rule(
        "decline-2n",
        "Pass responder's 2NT with a minimum",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2C"), partnerLast: is("2N") }),
        ALWAYS,
        passAction,
        52,
      ),
      rule(
        "accept-4n",
        "Accept the quantitative 4NT with a maximum",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2C"), partnerLast: is("4N") }),
        hcp(high(OPENER_1N)),
        bid(6, "N"),
        53,
      ),
      rule(
        "decline-4n",
        "Pass the quantitative 4NT with a minimum",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2C"), partnerLast: is("4N") }),
        ALWAYS,
        passAction,
        54,
      ),
    ],
    {
      settings: [
        toggle(
          "b_nt_1n_stayman_on",
          "Stayman 2♣ over 1NT",
          true,
          "Page 11: eight or more points and a four-card major. Page 16: on over a double, and double replaces it over a 2♣ overcall.",
        ),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "nt-1n-stayman-no-major",
    "8-9 with no four-card major: start with 2♣ anyway, then rebid 2NT",
    "Page 2's oddity, and it is a direct consequence of contradiction A's majority reading: \"8-9 pts, no 4M: " +
      "if you do not play minor suit transfer then here you would have bid 2N as invitation to 3N but 2N is " +
      "transfer to D. So, in this case, you start with 2c (Stayman) even if you don't have 4M and then rebid " +
      "2N to show this hand.\" So the invitational 8-9 balanced hand cannot invite directly — 2NT is spoken " +
      "for — and it borrows the Stayman ask as a waiting bid, then bids 2NT over whatever opener answers. " +
      "Note what this costs: opener has already been told \"partner has a four-card major\" and finds out " +
      "otherwise one round later. Page 11's summary row (\"Default -> bid 2N with 8-9 pts\") describes the " +
      "system WITHOUT the minor-suit transfer; that natural 2NT lives on `nt-1n-ladder` and only surfaces " +
      "when the transfer is switched off.",
    "convention",
    [
      ...overPassOrDouble(
        rule(
          "ask",
          "2♣ as a waiting bid with 8-9 and no four-card major",
          ctx("responder", { ...OVER_1N }),
          all(hcp(low(INVITE), high(INVITE)), NO_4_MAJOR, NO_6_MINOR),
          bid(2, "C"),
          26,
          { shows: { hcp: { min: 8, max: 9 }, forcing: true } },
        ),
      ),
      rule(
        "rebid-2n",
        "Rebid 2NT to show the invitational no-major hand",
        ctx("responder", {
          opening: is("1N"),
          ownLast: is("2C"),
          partnerLast: bidAt({ level: 2, strains: ["D", "H", "S"] }),
        }),
        all(hcp(low(INVITE), high(INVITE)), NO_4_MAJOR),
        bid(2, "N"),
        27,
        { shows: { hcp: { min: 8, max: 9 } } },
      ),
    ],
    {
      settings: [
        toggle(
          "b_nt_1n_stayman_no_major_on",
          "8-9 with no major invites through 2♣ (because 2NT is the diamond transfer)",
          true,
          "Page 2. Only meaningful while the 2NT minor-suit transfer is on.",
        ),
      ],
      sets: ["conventions"],
    },
  ),

  // =========================================================================
  // Pages 2, 11 — the natural quantitative ladder over 1NT.
  // =========================================================================
  auctionItem(
    "nt-1n-ladder",
    "The quantitative notrump ladder over 1NT",
    "Page 2's default row, for the hand no gadget wanted: \"Pass (0-7 pts), 3N (10-14 pts), 4N (15-17 pts), " +
      "6N (17+ pts).\" There is no 2NT rung in page 2's list because 2NT is the diamond transfer — the 8-9 " +
      "hand goes through 2♣ instead (`nt-1n-stayman-no-major`). Page 11's summary row does print the natural " +
      "2NT (\"bid 2N with 8-9 pts, bid 3N with 10-15 pts\"), which is the system as it reads with the " +
      "minor-suit transfer switched OFF; that natural 2NT is included here, in band 2, so it only ever " +
      "surfaces when the conventions above are off. Page 11 also stretches 3NT to 10-15 where page 2 stops at " +
      "10-14; 10-14 is encoded, as a setting. The printed 4NT (15-17) and 6NT (17+) rungs overlap at exactly " +
      "17: 17 is routed to 6NT, because page 2's own six-card-major ladder makes 17+ the slam band and 15-16 " +
      "the mild-slam band. Opener's answers to the quantitative bids are not printed in the notes; accept a " +
      "4NT invitation with a maximum and pass it with a minimum is the standard reading, flagged as inferred. " +
      "The pass rung carries the exclusions the notes state elsewhere: a five-card major transfers and a " +
      "six-card minor transfers, however weak the hand.",
    "agreement",
    [
      rule(
        "slam-6n",
        "6NT with 17+",
        ctx("responder", { ...OVER_1N, contested: false }),
        all(hcp(low(SLAM)), NO_5_MAJOR, NO_6_MINOR),
        bid(6, "N"),
        40,
        { shows: { hcp: { min: 17 } } },
      ),
      rule(
        "quant-4n",
        "4NT with 15-17, invitational to slam",
        ctx("responder", { ...OVER_1N, contested: false }),
        all(hcp(low(QUANT_4N), high(QUANT_4N)), NO_5_MAJOR, NO_6_MINOR),
        bid(4, "N"),
        41,
        { shows: { hcp: { min: 15, max: 17 } } },
      ),
      rule(
        "game-3n",
        "3NT with 10-14",
        ctx("responder", { ...OVER_1N, contested: false }),
        all(hcp(low(GAME), high(GAME)), NO_5_MAJOR, NO_6_MINOR),
        bid(3, "N"),
        42,
        { shows: { hcp: { min: 10, max: 14 } } },
      ),
      rule(
        "inv-2n",
        "2NT with 8-9 (page 11's row; only live with the minor-suit transfer off)",
        ctx("responder", { ...OVER_1N, contested: false }),
        all(hcp(low(INVITE), high(INVITE)), NO_4_MAJOR, NO_5_MAJOR),
        bid(2, "N"),
        43,
        { shows: { hcp: { min: 8, max: 9 } } },
      ),
      rule(
        "pass-out",
        "Pass with 0-7 and nothing to transfer",
        ctx("responder", { ...OVER_1N }),
        all(hcp(undefined, high(PARTIAL)), NO_5_MAJOR, NO_6_MINOR),
        passAction,
        44,
        { shows: { hcp: { max: 7 } } },
      ),
      // ---- opener's answers (inferred; the notes print none) --------------
      rule(
        "accept-4n",
        "Accept the quantitative 4NT with a maximum",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("4N"), partnerLast: is("4N") }),
        hcp(high(OPENER_1N)),
        bid(6, "N"),
        45,
      ),
      rule(
        "decline-4n",
        "Pass the quantitative 4NT with a minimum",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("4N"), partnerLast: is("4N") }),
        ALWAYS,
        passAction,
        46,
      ),
      rule(
        "accept-2n",
        "Accept the natural 2NT invitation with a maximum",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2N"), partnerLast: is("2N") }),
        hcp(high(OPENER_1N)),
        bid(3, "N"),
        47,
      ),
      rule(
        "decline-2n",
        "Pass the natural 2NT invitation with a minimum",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2N"), partnerLast: is("2N") }),
        ALWAYS,
        passAction,
        48,
      ),
      rule(
        "pass-3n",
        "Pass 3NT",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("3N"), partnerLast: is("3N") }),
        ALWAYS,
        passAction,
        49,
      ),
      rule(
        "pass-6n",
        "Pass 6NT",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("6N"), partnerLast: is("6N") }),
        ALWAYS,
        passAction,
        50,
      ),
    ],
    { settings: [range(QUANT_4N, "Responder: quantitative 4NT over 1NT (HCP)", 15, 17, { min: 12, max: 20 })] },
  ),

  // =========================================================================
  // Pages 2, 16 — GERBER.
  // =========================================================================
  auctionItem(
    "nt-gerber",
    "Gerber 4♣ over 1NT and 2NT",
    "Page 2: \"With 15+ pts, you can also use GERBER (4c) to enquire about the number of aces.\" Page 16: " +
      "\"Bid 4c opposite 1N or 2N opening bid by partner to enquire the number of aces. Similar to RKC w/o " +
      "agreed upon trump suit.\" The ask is placed on the same hands as the quantitative ladder — no " +
      "five-card major and no six-card minor, since those hands transfer first — and it is consulted after " +
      "every transfer and after Stayman, so a gadget that describes the hand better always wins. THE STEP " +
      "MEANINGS ARE NOT PRINTED anywhere in the notes: page 16 says only \"similar to RKC\", and the RKC " +
      "steps it does print (1-or-4, 0-or-3, 2 without the trump queen, 2 with it) cannot be reused as they " +
      "stand because Gerber has no trump suit and so no queen to distinguish. The classic ace ladder is " +
      "therefore used and flagged: 4♦ = zero or four aces, 4♥ = one, 4♠ = two, 4NT = three. The asker's " +
      "follow-up is not printed either, so none is mechanized — the hand places the contract on the " +
      "quantitative ladder. Note the notes give the 15+ floor only over 1NT; over 2NT no floor is printed at " +
      "all, and the same setting is reused.",
    "convention",
    [
      ...overPassOrDouble(
        rule(
          "ask-1n",
          "4♣ Gerber over 1NT",
          ctx("responder", { ...OVER_1N }),
          all(hcp(low(GERBER_MIN)), NO_5_MAJOR, NO_6_MINOR),
          bid(4, "C"),
          60,
          { shows: { hcp: { min: 15 }, forcing: true }, ask: ask(GERBER, GERBER_RESPONSES) },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "ask-2n",
          "4♣ Gerber over 2NT",
          ctx("responder", { ...OVER_2N }),
          all(hcp(low(GERBER_MIN)), NO_5_MAJOR, NO_6_MINOR),
          bid(4, "C"),
          61,
          { shows: { hcp: { min: 15 }, forcing: true }, ask: ask(GERBER, GERBER_RESPONSES) },
        ),
      ),
      rule(
        "reply-0-or-4",
        "4♦: zero or four aces",
        ctx("any", { askInProgress: GERBER }),
        any(aces(undefined, 0), aces(4, 4)),
        bid(4, "D"),
        62,
      ),
      rule(
        "reply-1",
        "4♥: one ace",
        ctx("any", { askInProgress: GERBER }),
        aces(1, 1),
        bid(4, "H"),
        63,
      ),
      rule(
        "reply-2",
        "4♠: two aces",
        ctx("any", { askInProgress: GERBER }),
        aces(2, 2),
        bid(4, "S"),
        64,
      ),
      rule(
        "reply-3",
        "4NT: three aces",
        ctx("any", { askInProgress: GERBER }),
        aces(3, 3),
        bid(4, "N"),
        65,
      ),
    ],
    {
      settings: [
        toggle("b_nt_gerber_on", "Gerber 4♣ over 1NT/2NT", true, "Pages 2 and 16: an ace ask with 15+."),
        range(GERBER_MIN, "Gerber: minimum to ask (HCP)", 15, 40, { min: 10, max: 40 }),
      ],
      sets: ["conventions"],
    },
  ),

  // =========================================================================
  // Page 11 — responses to a 2NT opening (20-21 balanced). Separate agreements
  // from the 1NT ones: Stayman is 3♣, Jacoby is 3♦/3♥, Texas is still 4♦/4♥.
  // =========================================================================
  auctionItem(
    "nt-2n-texas",
    "Texas transfer over 2NT (4♦/4♥)",
    "Page 11: \"6+M, 5-9 or 10+ pts -> Texas transfer: bid 4d with h and 4h with s.\" The two printed bands " +
      "union to five or more with NO hole — unlike the 1NT version, which deliberately skips 15-16 — but they " +
      "are kept as two separate settings because that is how the notes print them, and because a reviewer may " +
      "want to reopen the same 15-16-style gap here. Opener completes; the transfer is forcing and the 2NT " +
      "hand declares. Responder passes the completion (the notes print no continuation over 2NT at all).",
    "convention",
    [
      ...overPassOrDouble(
        rule(
          "xfer-s",
          "4♥ Texas to spades",
          ctx("responder", { ...OVER_2N }),
          all(
            spadesFirst(6),
            any(hcp(low(N2_TEXAS_LOW), high(N2_TEXAS_LOW)), hcp(low(N2_TEXAS_HIGH))),
          ),
          bid(4, "H"),
          10,
          { shows: { hcp: { min: 5 }, suits: [{ suit: "S", min: 6 }], forcing: true } },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "xfer-h",
          "4♦ Texas to hearts",
          ctx("responder", { ...OVER_2N }),
          all(
            len("H", 6),
            any(hcp(low(N2_TEXAS_LOW), high(N2_TEXAS_LOW)), hcp(low(N2_TEXAS_HIGH))),
          ),
          bid(4, "D"),
          11,
          { shows: { hcp: { min: 5 }, suits: [{ suit: "H", min: 6 }], forcing: true } },
        ),
      ),
      rule(
        "complete-h",
        "Complete 4♦ to 4♥",
        ctx("opener", { ...AS_2N_OPENER, partnerFirst: is("4D"), partnerLast: is("4D") }),
        ALWAYS,
        bid(4, "H"),
        12,
      ),
      rule(
        "complete-s",
        "Complete 4♥ to 4♠",
        ctx("opener", { ...AS_2N_OPENER, partnerFirst: is("4H"), partnerLast: is("4H") }),
        ALWAYS,
        bid(4, "S"),
        13,
      ),
      rule(
        "cont-pass",
        "Pass the completed Texas transfer",
        ctx("responder", { opening: is("2N"), ownLast: TEXAS, partnerLast: MAJOR_4 }),
        ALWAYS,
        passAction,
        14,
      ),
    ],
    {
      settings: [
        toggle("b_nt_2n_texas_on", "Texas transfer over 2NT (4♦/4♥)", true, "Page 11's row."),
        range(N2_TEXAS_LOW, "Texas over 2NT: lower band (HCP)", 5, 9, { min: 0, max: 14 }),
        range(N2_TEXAS_HIGH, "Texas over 2NT: upper band (HCP)", 10, 40, { min: 5, max: 40 }),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "nt-2n-jacoby",
    "Jacoby transfer over 2NT (3♦/3♥)",
    "Page 11: \"5+M, 0+ pts -> Jacoby transfer: bid 3d with h and 3h with s, even with 0 points.\" Opener " +
      "completes with 3♥/3♠. The notes print no continuation, so the same table's own ladder is applied and " +
      "flagged as inferred: pass with 0-4, and with 5-11 offer the choice of games with 3NT (opener correcting " +
      "to four of the major with three-card support). Four of the major with a six-card suit is the " +
      "degradation for when Texas is switched off.",
    "convention",
    [
      ...overPassOrDouble(
        rule(
          "xfer-s",
          "3♥ transfer to spades (5+ spades, 0+)",
          ctx("responder", { ...OVER_2N }),
          spadesFirst(5),
          bid(3, "H"),
          15,
          { shows: { suits: [{ suit: "S", min: 5 }], forcing: true } },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "xfer-h",
          "3♦ transfer to hearts (5+ hearts, 0+)",
          ctx("responder", { ...OVER_2N }),
          len("H", 5),
          bid(3, "D"),
          16,
          { shows: { suits: [{ suit: "H", min: 5 }], forcing: true } },
        ),
      ),
      rule(
        "complete-h",
        "Complete the transfer to 3♥",
        ctx("opener", { ...AS_2N_OPENER, partnerFirst: is("3D"), partnerLast: is("3D") }),
        ALWAYS,
        bid(3, "H"),
        20,
      ),
      rule(
        "complete-s",
        "Complete the transfer to 3♠",
        ctx("opener", { ...AS_2N_OPENER, partnerFirst: is("3H"), partnerLast: is("3H") }),
        ALWAYS,
        bid(3, "S"),
        21,
      ),
      rule(
        "cont-pass",
        "0-4: pass the completion",
        ctx("responder", { opening: is("2N"), ownLast: JACOBY_2N, partnerLast: MAJOR_3 }),
        hcp(undefined, high(N2_PARTIAL)),
        passAction,
        30,
        { shows: { hcp: { max: 4 } } },
      ),
      rule(
        "cont-game-4m",
        "5-11 with six (Texas off): 4M",
        ctx("responder", { opening: is("2N"), ownLast: JACOBY_2N, partnerLast: MAJOR_3 }),
        all(hcp(low(N2_GAME)), len("partner_last_bid_suit", 6)),
        raise(4),
        31,
        { shows: { hcp: { min: 5 } } },
      ),
      rule(
        "cont-game-3n",
        "5-11 with five: 3NT, choice of games",
        ctx("responder", { opening: is("2N"), ownLast: JACOBY_2N, partnerLast: MAJOR_3 }),
        all(hcp(low(N2_GAME)), len("partner_last_bid_suit", 5, 5)),
        bid(3, "N"),
        32,
        { shows: { hcp: { min: 5 } } },
      ),
      rule(
        "choice-3n-to-4m",
        "Take the choice of games into 4M with three-card support",
        ctx("opener", {
          ...AS_2N_OPENER,
          partnerFirst: JACOBY_2N,
          ownLast: MAJOR_3,
          partnerLast: is("3N"),
        }),
        len("own_last_bid_suit", 3),
        bidSuit("own_last_bid_suit", 4),
        33,
      ),
      rule(
        "choice-3n-pass",
        "Pass 3NT with a doubleton in responder's major",
        ctx("opener", {
          ...AS_2N_OPENER,
          partnerFirst: JACOBY_2N,
          ownLast: MAJOR_3,
          partnerLast: is("3N"),
        }),
        ALWAYS,
        passAction,
        34,
      ),
    ],
    {
      settings: [
        toggle("b_nt_2n_jacoby_on", "Jacoby transfer over 2NT (3♦/3♥)", true, "Page 11: five or more in a major, zero or more points."),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "nt-2n-stayman",
    "Stayman 3♣ over 2NT",
    "Page 11: \"4M, 5+ pts -> bid 3c (STAYMAN).\" The answers are not printed for the 2NT version, so the 1NT " +
      "version's answers are carried across and flagged as inferred: 3♦ with no four-card major, 3♥ with four " +
      "hearts (hearts first holding both), 3♠ with four spades. Responder then places the contract on the " +
      "same page-11 ladder: four of the major once a fit is confirmed, otherwise 3NT with 5-11 or 4NT with " +
      "12-13.",
    "convention",
    [
      ...overPassOrDouble(
        rule(
          "ask",
          "Stayman 3♣ ask",
          ctx("responder", { ...OVER_2N }),
          all(hcp(low(N2_GAME)), any(len("S", 4), len("H", 4))),
          bid(3, "C"),
          12,
          { shows: { hcp: { min: 5 }, forcing: true } },
        ),
      ),
      rule(
        "reply-h",
        "3♥: four hearts (hearts first holding both — inferred)",
        ctx("opener", { ...AS_2N_OPENER, partnerLast: is("3C") }),
        len("H", 4),
        bid(3, "H"),
        22,
        { shows: { hcp: { min: 20, max: 21 }, suits: [{ suit: "H", min: 4 }] } },
      ),
      rule(
        "reply-s",
        "3♠: four spades",
        ctx("opener", { ...AS_2N_OPENER, partnerLast: is("3C") }),
        len("S", 4),
        bid(3, "S"),
        23,
        {
          shows: {
            hcp: { min: 20, max: 21 },
            suits: [
              { suit: "S", min: 4 },
              { suit: "H", max: 3 },
            ],
          },
        },
      ),
      rule(
        "reply-d",
        "3♦: no four-card major",
        ctx("opener", { ...AS_2N_OPENER, partnerLast: is("3C") }),
        ALWAYS,
        bid(3, "D"),
        24,
        {
          shows: {
            hcp: { min: 20, max: 21 },
            suits: [
              { suit: "S", max: 3 },
              { suit: "H", max: 3 },
            ],
          },
        },
      ),
      rule(
        "cont-fit-4m",
        "Four of the major on the fit",
        ctx("responder", { opening: is("2N"), ownLast: is("3C"), partnerLast: MAJOR_3 }),
        len("partner_last_bid_suit", 4),
        raise(4),
        25,
      ),
      rule(
        "cont-quant-4n",
        "No fit, 12-13: 4NT",
        ctx("responder", {
          opening: is("2N"),
          ownLast: is("3C"),
          partnerLast: bidAt({ level: 3, strains: ["D", "H", "S"] }),
        }),
        hcp(low(N2_QUANT_4N), high(N2_QUANT_4N)),
        bid(4, "N"),
        26,
        { shows: { hcp: { min: 12, max: 13 } } },
      ),
      rule(
        "cont-3n",
        "No fit: 3NT",
        ctx("responder", {
          opening: is("2N"),
          ownLast: is("3C"),
          partnerLast: bidAt({ level: 3, strains: ["D", "H", "S"] }),
        }),
        ALWAYS,
        bid(3, "N"),
        27,
      ),
    ],
    {
      settings: [
        toggle("b_nt_2n_stayman_on", "Stayman 3♣ over 2NT", true, "Page 11: a four-card major and five or more points."),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "nt-2n-ladder",
    "The quantitative ladder over 2NT",
    "Page 11: \"Default -> Pass (0-4 pts), 3N (5-11 pts), 4N (12-13 pts).\" The table stops at 13 — a 2NT " +
      "opening plus 14 is off the top of what the notes discuss — so there is no printed 6NT rung over 2NT " +
      "and none is invented; a hand that big uses Gerber (15+). Opener's answer to the quantitative 4NT is " +
      "not printed and is inferred: 6NT with a maximum, pass with a minimum.",
    "agreement",
    [
      rule(
        "quant-4n",
        "4NT with 12-13, invitational to slam",
        ctx("responder", { ...OVER_2N, contested: false }),
        all(hcp(low(N2_QUANT_4N), high(N2_QUANT_4N)), NO_4_MAJOR, NO_5_MAJOR),
        bid(4, "N"),
        40,
        { shows: { hcp: { min: 12, max: 13 } } },
      ),
      rule(
        "game-3n",
        "3NT with 5-11",
        ctx("responder", { ...OVER_2N, contested: false }),
        all(hcp(low(N2_GAME), high(N2_GAME)), NO_4_MAJOR, NO_5_MAJOR),
        bid(3, "N"),
        41,
        { shows: { hcp: { min: 5, max: 11 } } },
      ),
      rule(
        "pass-out",
        "Pass with 0-4 and no major to show",
        ctx("responder", { ...OVER_2N }),
        all(hcp(undefined, high(N2_PARTIAL)), NO_5_MAJOR),
        passAction,
        42,
        { shows: { hcp: { max: 4 } } },
      ),
      rule(
        "accept-4n",
        "Accept the quantitative 4NT with a maximum",
        ctx("opener", { ...AS_2N_OPENER, partnerFirst: is("4N"), partnerLast: is("4N") }),
        hcp(high(OPENER_2N)),
        bid(6, "N"),
        43,
      ),
      rule(
        "decline-4n",
        "Pass the quantitative 4NT with a minimum",
        ctx("opener", { ...AS_2N_OPENER, partnerFirst: is("4N"), partnerLast: is("4N") }),
        ALWAYS,
        passAction,
        44,
      ),
      rule(
        "pass-3n",
        "Pass 3NT",
        ctx("opener", { ...AS_2N_OPENER, partnerFirst: is("3N"), partnerLast: is("3N") }),
        ALWAYS,
        passAction,
        45,
      ),
    ],
    {
      settings: [
        range(N2_PARTIAL, "Responder: partial, over 2NT (HCP)", 0, 4, { min: 0, max: 10 }),
        range(N2_GAME, "Responder: game, over 2NT (HCP)", 5, 11, { min: 3, max: 15 }),
        range(N2_QUANT_4N, "Responder: quantitative 4NT over 2NT (HCP)", 12, 13, { min: 8, max: 18 }),
        range(OPENER_2N, "2NT opening range (HCP)", 20, 21, { min: 18, max: 24 }),
      ],
    },
  ),

  // =========================================================================
  // Page 11 — responses to the 2♣ opening (22+). All in ONE item, because the
  // "natural" positives and the artificial 2♦ have to be ordered against each
  // other: 2♦ is a catch-all with no hand condition at all, so if it sat in a
  // lower band than the positives it would answer every hand.
  // =========================================================================
  auctionItem(
    "nt-2c-responses",
    "Responses to the 2♣ opening",
    "Page 11's four rows, in the order it prints them. With eight or more points and a STRONG five-card-plus " +
      "major, bid it at the two level; with eight or more and a strong six-card-plus minor, bid it at the " +
      "three level; with eight or more, balanced and no five-card major, bid 2NT; otherwise bid 2♦, which is " +
      "\"forcing, negative and waiting\" — a catch-all that says nothing about the hand and denies nothing " +
      "either, since an eight-count without a strong suit lands there too. The notes define a strong suit " +
      "twice: for the majors, \"2+ honors or 6+ cards with 1 honor\"; for the minors, just \"2+ honors\". The " +
      "language cannot count honours, so two of the top three stands in for \"2+ honours\" and the six-card " +
      "alternative degrades to bare six-card length — a suit-quality approximation a reviewer should know " +
      "about. Which of two biddable suits comes first is page 1's rule: longer first, higher ranking when " +
      "equal.",
    "convention",
    [
      ...overPassOrDouble(
        rule(
          "pos-2s",
          "2♠: a strong five-card-plus spade suit, 8+",
          ctx("responder", { ...OVER_2C }),
          all(hcp(low(C2_POSITIVE)), spadesFirst(5), strongMajor("S")),
          bid(2, "S"),
          10,
          { shows: { hcp: { min: 8 }, suits: [{ suit: "S", min: 5 }], forcing: true } },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "pos-2h",
          "2♥: a strong five-card-plus heart suit, 8+",
          ctx("responder", { ...OVER_2C }),
          all(hcp(low(C2_POSITIVE)), len("H", 5), strongMajor("H")),
          bid(2, "H"),
          11,
          { shows: { hcp: { min: 8 }, suits: [{ suit: "H", min: 5 }], forcing: true } },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "pos-3d",
          "3♦: a strong six-card-plus diamond suit, 8+",
          ctx("responder", { ...OVER_2C }),
          all(hcp(low(C2_POSITIVE)), diamondsFirst(6), strongMinor("D")),
          bid(3, "D"),
          12,
          { shows: { hcp: { min: 8 }, suits: [{ suit: "D", min: 6 }], forcing: true } },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "pos-3c",
          "3♣: a strong six-card-plus club suit, 8+",
          ctx("responder", { ...OVER_2C }),
          all(hcp(low(C2_POSITIVE)), len("C", 6), strongMinor("C")),
          bid(3, "C"),
          13,
          { shows: { hcp: { min: 8 }, suits: [{ suit: "C", min: 6 }], forcing: true } },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "pos-2n",
          "2NT: 8+ balanced with no five-card major",
          ctx("responder", { ...OVER_2C }),
          all(hcp(low(C2_POSITIVE)), bal(), NO_5_MAJOR),
          bid(2, "N"),
          14,
          { shows: { hcp: { min: 8 }, forcing: true } },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "waiting-2d",
          "2♦: forcing, negative and waiting",
          ctx("responder", { ...OVER_2C }),
          ALWAYS,
          bid(2, "D"),
          15,
          { shows: { forcing: true } },
        ),
      ),
    ],
    {
      settings: [
        toggle("b_nt_2c_responses_on", "Responses to the 2♣ opening (page 11's scheme)", true),
        range(C2_POSITIVE, "Responder: positive over 2♣ (HCP)", 8, 40, { min: 4, max: 20 }),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "nt-2c-after-2d",
    "After 2♣-2♦, opener bids a suit",
    "Page 11's continuation for the waiting bid: \"0-4 pts -> plan to rebid the cheapest minor next, e.g. 2c " +
      "- 2d; 2h - 3c. Continue to show low points, you will get another chance. At your next turn, you may or " +
      "may not continue bidding. 4+ pts -> support partner's suit, bid own 5+ card suit, or bid NT.\" The two " +
      "rungs overlap at exactly 4; the constructive branch is consulted first, so a four-count supports, " +
      "shows its own suit or bids notrump rather than signing off in the cheapest minor. \"Support partner's " +
      "suit\" is read as three or more cards in it (opener's 2♣ rebid suit is a real suit, so three gives the " +
      "fit) and is bid at the cheapest level; \"bid NT\" is likewise the cheapest notrump.",
    "convention",
    [
      rule(
        "support",
        "4+: support opener's suit at the cheapest level",
        ctx("responder", { opening: is("2C"), ownLast: is("2D"), partnerLast: SUIT_BID }),
        all(hcp(low(C2_SECOND)), len("partner_last_bid_suit", 3)),
        bidSuit("partner_last_bid_suit"),
        20,
        { shows: { hcp: { min: 4 } } },
      ),
      rule(
        "own-suit",
        "4+: bid your own five-card suit",
        ctx("responder", { opening: is("2C"), ownLast: is("2D"), partnerLast: SUIT_BID }),
        all(hcp(low(C2_SECOND)), len("own_longest_suit", 5)),
        bidLongest(["S", "H", "D", "C"]),
        21,
        { shows: { hcp: { min: 4 } } },
      ),
      rule(
        "notrump",
        "4+: bid notrump",
        ctx("responder", { opening: is("2C"), ownLast: is("2D"), partnerLast: SUIT_BID }),
        hcp(low(C2_SECOND)),
        firstLegal("2N", "3N"),
        22,
        { shows: { hcp: { min: 4 } } },
      ),
      rule(
        "cheapest-minor",
        "0-4: rebid the cheapest minor, still showing nothing",
        ctx("responder", { opening: is("2C"), ownLast: is("2D"), partnerLast: SUIT_BID }),
        hcp(undefined, high(C2_MIN)),
        firstLegal("3C", "3D", "4C", "4D"),
        23,
        { shows: { hcp: { max: 4 } } },
      ),
    ],
    {
      settings: [
        toggle("b_nt_2c_after_2d_on", "Continuations after 2♣-2♦ and a suit rebid", true),
        range(C2_MIN, "Responder after 2♣-2♦: minimum band (HCP)", 0, 4, { min: 0, max: 8 }),
        range(C2_SECOND, "Responder after 2♣-2♦: constructive band (HCP)", 4, 40, { min: 2, max: 12 }),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "nt-2c-after-2d-2nt",
    "After 2♣-2♦-2NT: the 2NT-opening responses, two points lighter",
    "Page 11 hands this case off to another row of itself: \"If the opener rebids 2N then use the responses " +
      "for the 2N opening bid with 2 less pts.\" The language cannot shift a band by a constant, so the 2NT " +
      "responses are re-stated here with their own settings, each defaulting to the 2NT number minus two: " +
      "Texas 4♦/4♥ with a six-card major and 3+; Jacoby 3♦/3♥ with a five-card major and any strength; " +
      "Stayman 3♣ with a four-card major and 3+; then pass with 0-2, 3NT with 3-9, 4NT with 10-11. Opener's " +
      "completions and Stayman answers are repeated for this auction too, since the 2NT-opening items key on " +
      "having OPENED 2NT and would not fire after a 2♣ opening.",
    "convention",
    [
      ...overPassOrDouble(
        rule(
          "texas-s",
          "4♥ Texas to spades",
          ctx("responder", { opening: is("2C"), ownLast: is("2D"), partnerLast: is("2N") }),
          all(spadesFirst(6), hcp(low(C2N_GAME))),
          bid(4, "H"),
          20,
          { shows: { hcp: { min: 3 }, suits: [{ suit: "S", min: 6 }], forcing: true } },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "texas-h",
          "4♦ Texas to hearts",
          ctx("responder", { opening: is("2C"), ownLast: is("2D"), partnerLast: is("2N") }),
          all(len("H", 6), hcp(low(C2N_GAME))),
          bid(4, "D"),
          21,
          { shows: { hcp: { min: 3 }, suits: [{ suit: "H", min: 6 }], forcing: true } },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "jacoby-s",
          "3♥ transfer to spades",
          ctx("responder", { opening: is("2C"), ownLast: is("2D"), partnerLast: is("2N") }),
          spadesFirst(5),
          bid(3, "H"),
          22,
          { shows: { suits: [{ suit: "S", min: 5 }], forcing: true } },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "jacoby-h",
          "3♦ transfer to hearts",
          ctx("responder", { opening: is("2C"), ownLast: is("2D"), partnerLast: is("2N") }),
          len("H", 5),
          bid(3, "D"),
          23,
          { shows: { suits: [{ suit: "H", min: 5 }], forcing: true } },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "stayman-3c",
          "3♣ Stayman",
          ctx("responder", { opening: is("2C"), ownLast: is("2D"), partnerLast: is("2N") }),
          all(hcp(low(C2N_GAME)), any(len("S", 4), len("H", 4))),
          bid(3, "C"),
          24,
          { shows: { hcp: { min: 3 }, forcing: true } },
        ),
      ),
      rule(
        "quant-4n",
        "4NT with 10-11",
        ctx("responder", { opening: is("2C"), ownLast: is("2D"), partnerLast: is("2N") }),
        all(hcp(low(C2N_QUANT_4N), high(C2N_QUANT_4N)), NO_4_MAJOR, NO_5_MAJOR),
        bid(4, "N"),
        25,
        { shows: { hcp: { min: 10, max: 11 } } },
      ),
      rule(
        "game-3n",
        "3NT with 3-9",
        ctx("responder", { opening: is("2C"), ownLast: is("2D"), partnerLast: is("2N") }),
        all(hcp(low(C2N_GAME), high(C2N_GAME)), NO_4_MAJOR, NO_5_MAJOR),
        bid(3, "N"),
        26,
        { shows: { hcp: { min: 3, max: 9 } } },
      ),
      rule(
        "pass-out",
        "Pass with 0-2",
        ctx("responder", { opening: is("2C"), ownLast: is("2D"), partnerLast: is("2N") }),
        all(hcp(undefined, high(C2N_PARTIAL)), NO_5_MAJOR),
        passAction,
        27,
        { shows: { hcp: { max: 2 } } },
      ),
      // ---- opener's side, for this auction --------------------------------
      rule(
        "complete-3d",
        "Complete 3♦ to 3♥",
        ctx("opener", { ...AS_2C_OPENER, ownLast: is("2N"), partnerLast: is("3D") }),
        ALWAYS,
        bid(3, "H"),
        28,
      ),
      rule(
        "complete-3h",
        "Complete 3♥ to 3♠",
        ctx("opener", { ...AS_2C_OPENER, ownLast: is("2N"), partnerLast: is("3H") }),
        ALWAYS,
        bid(3, "S"),
        29,
      ),
      rule(
        "complete-4d",
        "Complete 4♦ to 4♥",
        ctx("opener", { ...AS_2C_OPENER, ownLast: is("2N"), partnerLast: is("4D") }),
        ALWAYS,
        bid(4, "H"),
        30,
      ),
      rule(
        "complete-4h",
        "Complete 4♥ to 4♠",
        ctx("opener", { ...AS_2C_OPENER, ownLast: is("2N"), partnerLast: is("4H") }),
        ALWAYS,
        bid(4, "S"),
        31,
      ),
      rule(
        "stayman-reply-h",
        "3♥: four hearts",
        ctx("opener", { ...AS_2C_OPENER, ownLast: is("2N"), partnerLast: is("3C") }),
        len("H", 4),
        bid(3, "H"),
        32,
        { shows: { suits: [{ suit: "H", min: 4 }] } },
      ),
      rule(
        "stayman-reply-s",
        "3♠: four spades",
        ctx("opener", { ...AS_2C_OPENER, ownLast: is("2N"), partnerLast: is("3C") }),
        len("S", 4),
        bid(3, "S"),
        33,
        {
          shows: {
            suits: [
              { suit: "S", min: 4 },
              { suit: "H", max: 3 },
            ],
          },
        },
      ),
      rule(
        "stayman-reply-d",
        "3♦: no four-card major",
        ctx("opener", { ...AS_2C_OPENER, ownLast: is("2N"), partnerLast: is("3C") }),
        ALWAYS,
        bid(3, "D"),
        34,
        {
          shows: {
            suits: [
              { suit: "S", max: 3 },
              { suit: "H", max: 3 },
            ],
          },
        },
      ),
    ],
    {
      settings: [
        toggle("b_nt_2c_after_2n_on", "After 2♣-2♦-2NT, use the 2NT responses two points lighter", true),
        range(C2N_PARTIAL, "After 2♣-2♦-2NT: partial (HCP)", 0, 2, { min: 0, max: 8 }),
        range(C2N_GAME, "After 2♣-2♦-2NT: game (HCP)", 3, 9, { min: 1, max: 13 }),
        range(C2N_QUANT_4N, "After 2♣-2♦-2NT: quantitative 4NT (HCP)", 10, 11, { min: 6, max: 16 }),
      ],
      sets: ["conventions"],
    },
  ),

  // =========================================================================
  // The asks and transfers, made mechanical: opener may not pass them. A
  // transfer nobody completes is a bug, so each one gets a forcing situation.
  // =========================================================================
  item(
    "nt-forcing-on-opener",
    "Transfers, Stayman and the 2♦ waiting bid are forcing",
    "Every transfer and every ask in this chapter is forcing on the partner who has to answer it: opener has " +
      "no pass available and must complete the transfer or answer the ask even with a minimum. Over 1NT that " +
      "covers 2♣ (Stayman — page 16 says it applies \"even if the next opponent doubles\"), 2♦/2♥ (Jacoby), " +
      "2♠ (the club transfer), 3♣ (page 16's diamond transfer, when that reading is switched on) and a DIRECT " +
      "4♦/4♥ (Texas — a 4♥ reached as a raise, 1NT-2♦-2♥-4♥, is a contract and must be passable). Over 2NT it " +
      "covers 3♣, 3♦/3♥ and a direct 4♦/4♥. Over the 2♣ opening it covers responder's 2♦: page 11 calls it " +
      "\"forcing, negative and waiting\", so opener must rebid. The 2NT minor-suit transfer is NOT listed " +
      "here — it has its own item, because 2NT is only forcing while that transfer is switched on.",
    "agreement",
    "auction",
    {
      kind: "forcing_rules",
      rules: [
        forcing(
          "stayman-1n",
          "2♣ Stayman must be answered",
          ctx("opener", { ...AS_1N_OPENER, partnerLast: is("2C") }),
          10,
        ),
        forcing(
          "xfer-2d",
          "2♦ transfer must be completed",
          ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2D"), partnerLast: is("2D") }),
          11,
        ),
        forcing(
          "xfer-2h",
          "2♥ transfer must be completed",
          ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2H"), partnerLast: is("2H") }),
          12,
        ),
        forcing(
          "xfer-2s",
          "2♠ club transfer must be answered",
          ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2S"), partnerLast: is("2S") }),
          13,
        ),
        forcing(
          "xfer-3c-1n",
          "3♣ diamond transfer (page 16's reading) must be completed",
          ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("3C"), partnerLast: is("3C") }),
          14,
        ),
        forcing(
          "texas-4d-1n",
          "A direct 4♦ Texas must be completed",
          ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("4D"), partnerLast: is("4D") }),
          15,
        ),
        forcing(
          "texas-4h-1n",
          "A direct 4♥ Texas must be completed",
          ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("4H"), partnerLast: is("4H") }),
          16,
        ),
        forcing(
          "stayman-2n",
          "3♣ Stayman must be answered",
          ctx("opener", { ...AS_2N_OPENER, partnerFirst: is("3C"), partnerLast: is("3C") }),
          17,
        ),
        forcing(
          "xfer-3d-2n",
          "3♦ transfer must be completed",
          ctx("opener", { ...AS_2N_OPENER, partnerFirst: is("3D"), partnerLast: is("3D") }),
          18,
        ),
        forcing(
          "xfer-3h-2n",
          "3♥ transfer must be completed",
          ctx("opener", { ...AS_2N_OPENER, partnerFirst: is("3H"), partnerLast: is("3H") }),
          19,
        ),
        forcing(
          "texas-4d-2n",
          "A direct 4♦ Texas must be completed",
          ctx("opener", { ...AS_2N_OPENER, partnerFirst: is("4D"), partnerLast: is("4D") }),
          20,
        ),
        forcing(
          "texas-4h-2n",
          "A direct 4♥ Texas must be completed",
          ctx("opener", { ...AS_2N_OPENER, partnerFirst: is("4H"), partnerLast: is("4H") }),
          21,
        ),
        forcing(
          "waiting-2d",
          "2♦ over 2♣ is forcing: opener must rebid",
          ctx("opener", { ...AS_2C_OPENER, partnerFirst: is("2D"), partnerLast: is("2D") }),
          22,
        ),
        forcing(
          "xfer-3d-after-2c",
          "3♦ transfer after 2♣-2♦-2NT must be completed",
          ctx("opener", { ...AS_2C_OPENER, ownLast: is("2N"), partnerLast: is("3D") }),
          23,
        ),
        forcing(
          "xfer-3h-after-2c",
          "3♥ transfer after 2♣-2♦-2NT must be completed",
          ctx("opener", { ...AS_2C_OPENER, ownLast: is("2N"), partnerLast: is("3H") }),
          24,
        ),
        forcing(
          "stayman-3c-after-2c",
          "3♣ Stayman after 2♣-2♦-2NT must be answered",
          ctx("opener", { ...AS_2C_OPENER, ownLast: is("2N"), partnerLast: is("3C") }),
          25,
        ),
      ],
    },
    {
      settings: [
        toggle(
          "b_nt_forcing_on",
          "Transfers, Stayman and 2♣-2♦ are forcing on the answerer",
          true,
        ),
      ],
      sets: ["conventions"],
    },
  ),

  item(
    "nt-1n-2nt-transfer-forcing",
    "A direct 2NT over 1NT is forcing (only while it is the diamond transfer)",
    "Under the pages-2-and-10 reading of contradiction A a DIRECT 2NT over 1NT is the transfer to diamonds, so " +
      "opener may not pass it: opener either completes with 3♦ or shows a liking for the suit with 3♣. This " +
      "sits in its own item because it is the one forcing situation that depends on the contradiction: with " +
      "the minor-suit transfer switched off, 2NT is page 11's natural 8-9 invitation and opener MUST be able " +
      "to pass it with a minimum. Switch this off together with `nt-1n-minor-transfer` (this chapter cannot " +
      "emit the requires-edge that would do it automatically — the template's edge file is owned elsewhere). " +
      "Only a direct 2NT is covered: the 2NT that arrives as 1NT-2♣-2♦-2NT is the invitational rebid of the " +
      "no-major hand and stays passable.",
    "agreement",
    "auction",
    {
      kind: "forcing_rules",
      rules: [
        forcing(
          "xfer-2n",
          "2NT diamond transfer must be answered",
          ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2N"), partnerLast: is("2N") }),
          10,
        ),
      ],
    },
    {
      settings: [
        toggle(
          "b_nt_1n_2nt_transfer_forcing_on",
          "A direct 2NT over 1NT is forcing (diamond transfer)",
          true,
          "Turn off together with the 2♠/2NT minor-suit transfer, or opener will be unable to pass a natural 2NT invitation.",
        ),
      ],
      sets: ["conventions"],
    },
  ),
];

/** Page(s) each item was authored from — install.ts turns these into citations. */
export const NT_RESPONSES_PAGES: Record<string, number[]> = {
  "nt-1n-framework": [1, 2, 10, 11],
  "nt-use-conventions-first": [2],
  "nt-1n-texas": [2, 10, 16],
  "nt-1n-texas-hole": [2, 10, 16],
  "nt-1n-jacoby": [1, 2, 10, 16],
  "nt-1n-minor-transfer": [2, 10, 16],
  "nt-1n-minor-transfer-p16": [2, 10, 16],
  "nt-1n-stayman": [2, 11, 16],
  "nt-1n-stayman-no-major": [2],
  "nt-1n-ladder": [2, 11],
  "nt-gerber": [2, 16],
  "nt-2n-texas": [11, 16],
  "nt-2n-jacoby": [11, 16],
  "nt-2n-stayman": [11],
  "nt-2n-ladder": [11],
  "nt-2c-responses": [11],
  "nt-2c-after-2d": [11],
  "nt-2c-after-2d-2nt": [11],
  "nt-forcing-on-opener": [2, 11, 16],
  "nt-1n-2nt-transfer-forcing": [2, 10],
};
