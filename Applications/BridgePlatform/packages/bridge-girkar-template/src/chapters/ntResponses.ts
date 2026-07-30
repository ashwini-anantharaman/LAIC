// Responding to a notrump opening — the teaching deck's slides 18-20, 22 (over
// 1NT) and 23 (over 2NT), authored row by row from the tables.
//
// BAND DISCIPLINE (see @bridge/kb compile.ts): `convention` items compile into
// band 1 and are consulted BEFORE `agreement`/`bidding_rule` items (band 2), so
// every gadget here (transfers, Stayman, the minor transfers) wins over the
// natural quantitative ladder without needing to out-number it. `concept` and
// `judgment_guideline` items carry no rules at all — they are the deck's prose.
//
// PRIORITY ORDERING inside the bands follows the sayc chapter: the four-level
// game transfers first (10-13), the two-level transfers and Stayman next
// (12-28), continuations after that (29-42), and the natural NT ladder last
// (40+ inside band 2). Where two rows of a table overlap, the more specific row
// carries the lower number and no extra negative condition is written — e.g.
// after 1NT-2♣-2♥ the "heart fit" rows are consulted before the "no fit" rows.
//
// COLORS ARE SEMANTICS. Every orange row on slides 19 and 23 is a transfer (or
// a transfer-then-clarify sequence): opener MUST complete it, so each responder
// transfer rule carries `shows: { forcing: true }` and `nt-transfer-forcing`
// declares the matching forcing situations (pass is not a legal option for
// opener facing a transfer or a Stayman ask).
//
// DECK-LITERAL CHOICES kept deliberately, with a setting instead of a silent
// correction:
//  * slide 22's 10-14 row answers opener's 2♥ with 3♥ (not 4♥) on a heart fit,
//    while the same row answers 2♠ with 4♠. Encoded exactly as printed; opener
//    then accepts the 3♥ invitation with a maximum.
//  * the minor "transfers" over 1NT are 2♠ -> 3♣ (clubs) and 3♣ -> 3♦
//    (diamonds) — NOT the SAYC 2♠ relay-and-correct.
//  * over 1NT a six-card major with game values transfers at the FOUR level
//    (4♦/4♥) and passes; the two-level transfer with a jump to game is only the
//    degradation when that convention is switched off.
//  * the deck's tables stop at 14 (1NT) / 10 (2NT) for hands with a long or
//    four-card major and every quantitative rung is printed "No 4 card M", so
//    the game rows' floors (10 / 6) are treated as floors rather than as
//    ceilings — otherwise a 16-count with five hearts would have no call at all.
//
// SETTINGS. `g_nt_1n_*` bands are declared once on `nt-thresholds` (slide 18 is
// literally the threshold slide) and `g_nt_2n_*` bands on `nt-2n-ladder`;
// settings are KB-global, so the rules in the convention items reference them.

import {
  ALWAYS,
  all,
  any,
  auctionItem,
  bid,
  bidAt,
  bidSuit,
  ctx,
  forcing,
  hcp,
  high,
  is,
  item,
  len,
  low,
  not,
  overPassOrDouble,
  pass as passAction,
  raise,
  range,
  rule,
  toggle,
  type TemplateItem,
} from "@bridge/sayc-template/dsl";

// --- shared shorthands -----------------------------------------------------

/** The deck's "No 4 card M" column: nothing to explore in the majors. */
const NO_4_MAJOR = not(any(len("S", 4), len("H", 4)));
/** Responder over partner's 1NT opening. */
const OVER_1N = { opening: is("1N"), partnerLast: is("1N") } as const;
/** Responder over partner's 2NT opening. */
const OVER_2N = { opening: is("2N"), partnerLast: is("2N") } as const;
/** Opener, having opened 1NT. */
const AS_1N_OPENER = { ownFirst: is("1N") } as const;
/** Opener, having opened 2NT. */
const AS_2N_OPENER = { ownFirst: is("2N") } as const;
/** Responder's transfer bid over 1NT (2♦ or 2♥). */
const XFER_1N = bidAt({ level: 2, strains: ["D", "H"] });
/** Responder's transfer bid over 2NT (3♦ or 3♥). */
const XFER_2N = bidAt({ level: 3, strains: ["D", "H"] });
/** A completed transfer at the two level (opener's 2♥/2♠). */
const MAJOR_2 = bidAt({ level: 2, strains: ["H", "S"] });
/** A major at the three level (the invitational raise, or opener's 2NT reply). */
const MAJOR_3 = bidAt({ level: 3, strains: ["H", "S"] });
/** A major at the four level (the completed game transfer). */
const MAJOR_4 = bidAt({ level: 4, strains: ["H", "S"] });

export const NT_RESPONSES: TemplateItem[] = [
  // -------------------------------------------------------------------------
  // Slide 18 — the framework every 1NT response row is measured against.
  // -------------------------------------------------------------------------
  item(
    "nt-thresholds",
    "Notrump thresholds and how responder shows a major",
    "A 1NT opening is 15-17 balanced with no five-card major, and the 1NT opener is expected to declare. " +
      "The partnership targets are: GAME 25 points, SLAM 32, GRAND SLAM 37. " +
      "Measured from responder's side those become: below 2NT = partial; 7.5 = game possible, so invite; " +
      "9.5 = game force (above 3NT); 14.5 = slam possible; 16.5 = slam assured; 19.5 = grand possible; " +
      "21.5 = grand assured. Rounded into the deck's response tables that is 0-7 partial, 8-9 invitational, " +
      "10-14 game, 15-16 slam invitational, 17-19 slam, 20-21 grand invitational, 22+ grand. " +
      "A 1NT opener holds two to four cards in any major, so responder decides by his OWN major length: " +
      "six or more = a fit is guaranteed, show it with a transfer; exactly five = a fit is possible, show it " +
      "with a transfer; exactly four = a fit is possible, ASK with 2♣ Stayman and only with invitational " +
      "values or better; zero to three = no major fit, explore notrump or the minors.",
    "concept",
    "auction",
    { kind: "none" },
    {
      settings: [
        range("g_nt_1n_range", "1NT opening range (HCP)", 15, 17, { min: 10, max: 22 }),
        range("g_nt_1n_partial_range", "Responder: partial, over 1NT (HCP)", 0, 7, { min: 0, max: 12 }),
        range("g_nt_1n_invite_range", "Responder: invitational, over 1NT (HCP)", 8, 9, { min: 5, max: 13 }),
        range("g_nt_1n_game_range", "Responder: game, over 1NT (HCP)", 10, 14, { min: 8, max: 18 }),
        range("g_nt_1n_slam_invite_range", "Responder: slam invitational, over 1NT (HCP)", 15, 16, { min: 12, max: 20 }),
        range("g_nt_1n_slam_range", "Responder: slam assured, over 1NT (HCP)", 17, 19, { min: 14, max: 24 }),
        range("g_nt_1n_grand_invite_range", "Responder: grand invitational, over 1NT (HCP)", 20, 21, { min: 16, max: 28 }),
        range("g_nt_1n_grand_range", "Responder: grand assured, over 1NT (HCP)", 22, 40, { min: 18, max: 40 }),
      ],
    },
  ),

  // -------------------------------------------------------------------------
  // Slide 19 rows 1 (1NT) — the four-level game transfer.
  // -------------------------------------------------------------------------
  auctionItem(
    "nt-1n-game-transfer",
    "4♦/4♥ game transfer over 1NT",
    "With a six-card or longer major and game values (10-14), transfer straight to game: 4♦ over 1NT asks " +
      "opener to bid 4♥, 4♥ asks for 4♠. Responder passes the completion — slide 22 prints this cell as " +
      "\"4T-4M then pass\". The transfer is forcing: opener always completes, and opener declares.",
    "convention",
    [
      ...overPassOrDouble(
        rule(
          "xfer-h",
          "4♦ game transfer to hearts",
          ctx("responder", { ...OVER_1N }),
          all(hcp(low("g_nt_1n_game_range")), len("H", 6)),
          bid(4, "D"),
          10,
          { shows: { hcp: { min: 10 }, suits: [{ suit: "H", min: 6 }], forcing: true } },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "xfer-s",
          "4♥ game transfer to spades",
          ctx("responder", { ...OVER_1N }),
          all(hcp(low("g_nt_1n_game_range")), len("S", 6)),
          bid(4, "H"),
          11,
          { shows: { hcp: { min: 10 }, suits: [{ suit: "S", min: 6 }], forcing: true } },
        ),
      ),
      // `partnerFirst` matters: only a DIRECT 4♦/4♥ is the transfer. Without it
      // these would also fire on 1NT-2♦-2♥-4♥ (responder's natural jump to game
      // in the transferred major) and pull that 4♥ to 4♠.
      rule(
        "complete-h",
        "Complete 4♦ to 4♥",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("4D"), partnerLast: is("4D") }),
        ALWAYS,
        bid(4, "H"),
        12,
      ),
      rule(
        "complete-s",
        "Complete 4♥ to 4♠",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("4H"), partnerLast: is("4H") }),
        ALWAYS,
        bid(4, "S"),
        13,
      ),
      rule(
        "cont-pass",
        "Pass the completed game transfer",
        ctx("responder", {
          opening: is("1N"),
          ownLast: bidAt({ level: 4, strains: ["D", "H"] }),
          partnerLast: MAJOR_4,
        }),
        ALWAYS,
        passAction,
        14,
      ),
    ],
    {
      settings: [toggle("g_nt_1n_game_transfer_on", "4♦/4♥ game transfer over 1NT")],
      sets: ["conventions"],
    },
  ),

  // -------------------------------------------------------------------------
  // Slide 19 rows 2-5, slide 20, slide 22 — the two-level Jacoby transfers and
  // every follow-up the matrix prints.
  // -------------------------------------------------------------------------
  auctionItem(
    "nt-1n-transfers",
    "Jacoby transfers over 1NT (2♦/2♥)",
    "Over 1NT, 2♦ shows five or more hearts and 2♥ shows five or more spades; opener completes with 2♥/2♠ " +
      "(the orange rows on slide 19 — the transfer is forcing) and the 1NT opener declares. Responder then " +
      "clarifies exactly as slide 22's matrix prints it: with 0-7 PASS the completion; with 8-9 and exactly " +
      "five, 2NT (invitational); with 8-9 and six or more, three of the major (invitational); with game " +
      "values and exactly five, 3NT — and opener corrects 3NT to four of the major holding three-card " +
      "support (slide 20). With six or more and game values the deck uses the four-level transfer instead; " +
      "the jump to four of the major here is the fallback when that convention is off. Facing an invitation " +
      "opener passes with a minimum and bids game with a maximum (four of the major with three-card support). " +
      "Slide 21 gives the reason a weak hand transfers at all rather than passing 1NT: \"2M better than 1N\" — " +
      "a five-card major opposite two or three cards plays better at the two level than notrump does at the " +
      "one level, so the transfer-and-pass is a gain even with nothing.",
    "convention",
    [
      ...overPassOrDouble(
        rule(
          "xfer-h",
          "2♦ transfer to hearts",
          ctx("responder", { ...OVER_1N }),
          any(
            all(hcp(undefined, high("g_nt_1n_invite_range")), len("H", 5)),
            all(hcp(low("g_nt_1n_game_range")), len("H", 5)),
          ),
          bid(2, "D"),
          15,
          { shows: { suits: [{ suit: "H", min: 5 }], forcing: true } },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "xfer-s",
          "2♥ transfer to spades",
          ctx("responder", { ...OVER_1N }),
          any(
            all(hcp(undefined, high("g_nt_1n_invite_range")), len("S", 5)),
            all(hcp(low("g_nt_1n_game_range")), len("S", 5)),
          ),
          bid(2, "H"),
          16,
          { shows: { suits: [{ suit: "S", min: 5 }], forcing: true } },
        ),
      ),
      rule(
        "complete-h",
        "Complete the transfer to 2♥",
        ctx("opener", { ...AS_1N_OPENER, partnerLast: is("2D") }),
        ALWAYS,
        bid(2, "H"),
        20,
      ),
      rule(
        "complete-s",
        "Complete the transfer to 2♠",
        ctx("opener", { ...AS_1N_OPENER, partnerLast: is("2H") }),
        ALWAYS,
        bid(2, "S"),
        21,
      ),
      // Responder's clarification (slide 19 rows 2-5, slide 22 columns 3-4).
      rule(
        "cont-pass",
        "Partial: pass the completion",
        ctx("responder", { opening: is("1N"), ownLast: XFER_1N, partnerLast: MAJOR_2 }),
        hcp(undefined, high("g_nt_1n_partial_range")),
        passAction,
        30,
        { shows: { hcp: { max: 7 } } },
      ),
      rule(
        "cont-inv-2n",
        "Invitational with exactly five: 2NT",
        ctx("responder", { opening: is("1N"), ownLast: XFER_1N, partnerLast: MAJOR_2 }),
        all(
          hcp(low("g_nt_1n_invite_range"), high("g_nt_1n_invite_range")),
          len("partner_last_bid_suit", 5, 5),
        ),
        bid(2, "N"),
        31,
        { shows: { hcp: { min: 8, max: 9 } } },
      ),
      rule(
        "cont-inv-3m",
        "Invitational with six: three of the major",
        ctx("responder", { opening: is("1N"), ownLast: XFER_1N, partnerLast: MAJOR_2 }),
        all(hcp(low("g_nt_1n_invite_range"), high("g_nt_1n_invite_range")), len("partner_last_bid_suit", 6)),
        raise(3),
        32,
        { shows: { hcp: { min: 8, max: 9 } } },
      ),
      rule(
        "cont-game-3n",
        "Game with exactly five: 3NT",
        ctx("responder", { opening: is("1N"), ownLast: XFER_1N, partnerLast: MAJOR_2 }),
        all(hcp(low("g_nt_1n_game_range")), len("partner_last_bid_suit", 5, 5)),
        bid(3, "N"),
        33,
        { shows: { hcp: { min: 10 } } },
      ),
      rule(
        "cont-game-4m",
        "Game with six (four-level transfer off): four of the major",
        ctx("responder", { opening: is("1N"), ownLast: XFER_1N, partnerLast: MAJOR_2 }),
        all(hcp(low("g_nt_1n_game_range")), len("partner_last_bid_suit", 6)),
        raise(4),
        34,
        { shows: { hcp: { min: 10 } } },
      ),
      // Opener's side of the invitations and of the 3NT correction.
      rule(
        "accept-2n-major",
        "Maximum with three-card support: four of the major",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: XFER_1N,
          ownLast: MAJOR_2,
          partnerLast: is("2N"),
        }),
        all(hcp(high("g_nt_1n_range")), len("own_last_bid_suit", 3)),
        bidSuit("own_last_bid_suit", 4),
        35,
      ),
      rule(
        "accept-2n-nt",
        "Accept the 2NT invitation with a maximum",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: XFER_1N,
          ownLast: MAJOR_2,
          partnerLast: is("2N"),
        }),
        hcp(high("g_nt_1n_range")),
        bid(3, "N"),
        36,
      ),
      rule(
        "decline-2n",
        "Pass the 2NT invitation with a minimum",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: XFER_1N,
          ownLast: MAJOR_2,
          partnerLast: is("2N"),
        }),
        ALWAYS,
        passAction,
        37,
      ),
      rule(
        "accept-3m",
        "Accept the three-level invitation with a maximum",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: XFER_1N,
          ownLast: MAJOR_2,
          partnerLast: MAJOR_3,
        }),
        hcp(high("g_nt_1n_range")),
        raise(4),
        38,
      ),
      rule(
        "decline-3m",
        "Pass the three-level invitation with a minimum",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: XFER_1N,
          ownLast: MAJOR_2,
          partnerLast: MAJOR_3,
        }),
        ALWAYS,
        passAction,
        39,
      ),
      rule(
        "correct-3n",
        "Correct 3NT to four of the major with three-card support",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: XFER_1N, ownLast: MAJOR_2, partnerLast: is("3N") }),
        len("own_last_bid_suit", 3),
        bidSuit("own_last_bid_suit", 4),
        40,
      ),
      rule(
        "pass-3n",
        "Pass 3NT with a doubleton in responder's major",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: XFER_1N, ownLast: MAJOR_2, partnerLast: is("3N") }),
        ALWAYS,
        passAction,
        41,
      ),
    ],
    {
      settings: [toggle("g_nt_1n_transfers_on", "Jacoby transfers over 1NT")],
      sets: ["conventions"],
    },
  ),

  // -------------------------------------------------------------------------
  // Slide 19 row 6, slides 18/20/22 — Stayman.
  // -------------------------------------------------------------------------
  auctionItem(
    "nt-1n-stayman",
    "Stayman 2♣ over 1NT",
    "With exactly a four-card major and invitational values or better (8+), ASK with 2♣. Opener answers " +
      "2♦ with no four-card major, 2♥ with four hearts (hearts first holding both), 2♠ with spades only. " +
      "Responder then clarifies as slide 22 prints it — with 8-9: 2NT with no fit, three of the major with " +
      "the fit; with game values: 3NT with no fit, and on a fit 3♥ over 2♥ or 4♠ over 2♠ (the deck's own " +
      "asymmetry, kept as printed — the 3♥ raise is invitational and opener bids 4♥ with a maximum). " +
      "Slide 20 is explicit that with only a partial (0-7) and a four-card major responder PASSES: 2♣ can " +
      "get too high when there is no fit.",
    "convention",
    [
      ...overPassOrDouble(
        rule(
          "ask",
          "Stayman 2♣ ask",
          ctx("responder", { ...OVER_1N }),
          all(
            hcp(low("g_nt_1n_invite_range")),
            any(len("S", 4), len("H", 4)),
            not(any(len("S", 5), len("H", 5))),
          ),
          bid(2, "C"),
          25,
          { shows: { hcp: { min: 8 }, forcing: true } },
        ),
      ),
      rule(
        "reply-h",
        "2♥: four hearts (hearts first with both)",
        ctx("opener", { ...AS_1N_OPENER, partnerLast: is("2C") }),
        len("H", 4),
        bid(2, "H"),
        26,
        { shows: { hcp: { min: 15, max: 17 }, suits: [{ suit: "H", min: 4 }] } },
      ),
      rule(
        "reply-s",
        "2♠: four spades only",
        ctx("opener", { ...AS_1N_OPENER, partnerLast: is("2C") }),
        len("S", 4),
        bid(2, "S"),
        27,
        { shows: { hcp: { min: 15, max: 17 }, suits: [{ suit: "S", min: 4 }, { suit: "H", max: 3 }] } },
      ),
      rule(
        "reply-d",
        "2♦: no four-card major",
        ctx("opener", { ...AS_1N_OPENER, partnerLast: is("2C") }),
        ALWAYS,
        bid(2, "D"),
        28,
        { shows: { hcp: { min: 15, max: 17 }, suits: [{ suit: "S", max: 3 }, { suit: "H", max: 3 }] } },
      ),
      // Responder's clarification. Fit rows are consulted before no-fit rows.
      rule(
        "cont-fit-h-inv",
        "Invitational raise to 3♥ on the heart fit",
        ctx("responder", { opening: is("1N"), ownLast: is("2C"), partnerLast: is("2H") }),
        all(hcp(low("g_nt_1n_invite_range"), high("g_nt_1n_invite_range")), len("H", 4)),
        raise(3),
        29,
        { shows: { hcp: { min: 8, max: 9 }, suits: [{ suit: "H", min: 4 }] } },
      ),
      rule(
        "cont-fit-h-game",
        "Game values on the heart fit: 3♥ as printed",
        ctx("responder", { opening: is("1N"), ownLast: is("2C"), partnerLast: is("2H") }),
        all(hcp(low("g_nt_1n_game_range")), len("H", 4)),
        raise(3),
        30,
        { shows: { hcp: { min: 10 }, suits: [{ suit: "H", min: 4 }] } },
      ),
      rule(
        "cont-fit-s-inv",
        "Invitational raise to 3♠ on the spade fit",
        ctx("responder", { opening: is("1N"), ownLast: is("2C"), partnerLast: is("2S") }),
        all(hcp(low("g_nt_1n_invite_range"), high("g_nt_1n_invite_range")), len("S", 4)),
        raise(3),
        31,
        { shows: { hcp: { min: 8, max: 9 }, suits: [{ suit: "S", min: 4 }] } },
      ),
      rule(
        "cont-fit-s-game",
        "Game on the spade fit: 4♠",
        ctx("responder", { opening: is("1N"), ownLast: is("2C"), partnerLast: is("2S") }),
        all(hcp(low("g_nt_1n_game_range")), len("S", 4)),
        raise(4),
        32,
        { shows: { hcp: { min: 10 }, suits: [{ suit: "S", min: 4 }] } },
      ),
      rule(
        "cont-nofit-inv",
        "2NT with no fit (invitational)",
        ctx("responder", {
          opening: is("1N"),
          ownLast: is("2C"),
          partnerLast: bidAt({ level: 2, strains: ["D", "H", "S"] }),
        }),
        hcp(low("g_nt_1n_invite_range"), high("g_nt_1n_invite_range")),
        bid(2, "N"),
        33,
        { shows: { hcp: { min: 8, max: 9 } } },
      ),
      rule(
        "cont-nofit-game",
        "3NT with no fit",
        ctx("responder", {
          opening: is("1N"),
          ownLast: is("2C"),
          partnerLast: bidAt({ level: 2, strains: ["D", "H", "S"] }),
        }),
        hcp(low("g_nt_1n_game_range")),
        bid(3, "N"),
        34,
        { shows: { hcp: { min: 10 } } },
      ),
      // Opener's side of responder's invitations.
      rule(
        "accept-2n",
        "Accept the 2NT invitation with a maximum",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2C"), partnerLast: is("2N") }),
        hcp(high("g_nt_1n_range")),
        bid(3, "N"),
        35,
      ),
      rule(
        "decline-2n",
        "Pass the 2NT invitation with a minimum",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2C"), partnerLast: is("2N") }),
        ALWAYS,
        passAction,
        36,
      ),
      rule(
        "accept-3m",
        "Accept the raise with a maximum",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: is("2C"),
          ownLast: MAJOR_2,
          partnerLast: MAJOR_3,
        }),
        hcp(high("g_nt_1n_range")),
        raise(4),
        37,
      ),
      rule(
        "decline-3m",
        "Pass the raise with a minimum",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: is("2C"),
          ownLast: MAJOR_2,
          partnerLast: MAJOR_3,
        }),
        ALWAYS,
        passAction,
        38,
      ),
    ],
    { settings: [toggle("g_nt_1n_stayman_on", "Stayman 2♣ over 1NT")], sets: ["conventions"] },
  ),

  // -------------------------------------------------------------------------
  // Slide 21 — the two-suited-major flowchart. This is the ONLY slide that
  // handles 5-4 and 4-5 in the majors opposite 1NT, and the only one that
  // mentions Smolen; slide 19's table has no row for a two-suiter.
  //
  // PRIORITIES. Responder's asks sit at 11-14, BELOW the transfer asks at
  // 15/16, because a two-suiter must reach for 2♣ rather than transfer. The
  // continuations sit at 17-24, below the generic Stayman/transfer follow-ups
  // at 29+, so the two-suited hand takes its own route where the deck gives it
  // one and falls through to the printed table where it does not.
  // -------------------------------------------------------------------------
  auctionItem(
    "nt-1n-smolen",
    "Smolen: game-forcing five-four in the majors over 1NT",
    "Slide 21's game-force branch. Holding game values (10+) with FIVE cards in one major and FOUR in the " +
      "other, bid Stayman 2♣ first rather than transferring. If opener denies a four-card major with 2♦, " +
      "jump to THREE OF YOUR FOUR-CARD MAJOR — the slide labels this Smolen. The jump is deliberately the " +
      "shorter suit: it tells opener you hold five of the OTHER major, so opener with three-card support " +
      "bids game in that one and the 1NT hand stays declarer, which is the whole point of the deck's " +
      "\"1N opener to declare\" note. Without support opener signs off in 3NT. If instead opener shows a " +
      "four-card major (2♥ or 2♠), the fit is already found and the slide reads \"Game in hearts, slam?\" / " +
      "\"Game in spades, slam?\" — bid game in that major directly.",
    "convention",
    [
      // The ask: a two-suiter with game values takes the 2♣ route, so it must
      // be consulted before the transfers.
      ...overPassOrDouble(
        rule(
          "ask",
          "2♣ first with a game-forcing five-four in the majors",
          ctx("responder", { ...OVER_1N }),
          all(
            hcp(low("g_nt_1n_game_range")),
            any(all(len("S", 5), len("H", 4, 4)), all(len("H", 5), len("S", 4, 4))),
          ),
          bid(2, "C"),
          12,
          { shows: { hcp: { min: 10 }, forcing: true } },
        ),
      ),
      // Opener showed a four-card major: the fit exists, so bid the game.
      rule(
        "fit-hearts",
        "Game in hearts once opener shows four (slide 21: \"Game in hearts, slam?\")",
        ctx("responder", { opening: is("1N"), ownLast: is("2C"), partnerLast: is("2H") }),
        all(hcp(low("g_nt_1n_game_range")), len("H", 4), any(len("S", 5), len("H", 5))),
        raise(4),
        17,
        { shows: { hcp: { min: 10 }, suits: [{ suit: "H", min: 4 }] } },
      ),
      rule(
        "fit-spades",
        "Game in spades once opener shows four (slide 21: \"Game in spades, slam?\")",
        ctx("responder", { opening: is("1N"), ownLast: is("2C"), partnerLast: is("2S") }),
        all(hcp(low("g_nt_1n_game_range")), len("S", 4), any(len("H", 5), len("S", 5))),
        raise(4),
        18,
        { shows: { hcp: { min: 10 }, suits: [{ suit: "S", min: 4 }] } },
      ),
      // Opener denied a major with 2♦ — jump in the FOUR-card major.
      rule(
        "jump-hearts",
        "3♥ Smolen: four hearts, so five spades",
        ctx("responder", { opening: is("1N"), ownLast: is("2C"), partnerLast: is("2D") }),
        all(hcp(low("g_nt_1n_game_range")), len("H", 4, 4), len("S", 5)),
        bid(3, "H"),
        19,
        {
          shows: {
            hcp: { min: 10 },
            suits: [{ suit: "H", min: 4, max: 4 }, { suit: "S", min: 5 }],
            forcing: true,
          },
        },
      ),
      rule(
        "jump-spades",
        "3♠ Smolen: four spades, so five hearts",
        ctx("responder", { opening: is("1N"), ownLast: is("2C"), partnerLast: is("2D") }),
        all(hcp(low("g_nt_1n_game_range")), len("S", 4, 4), len("H", 5)),
        bid(3, "S"),
        20,
        {
          shows: {
            hcp: { min: 10 },
            suits: [{ suit: "S", min: 4, max: 4 }, { suit: "H", min: 5 }],
            forcing: true,
          },
        },
      ),
      // Opener reads the jump as five cards in the OTHER major and places the
      // contract — game in that major with support, otherwise 3NT.
      rule(
        "place-spades",
        "3♥ showed five spades: bid 4♠ with three-card support",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: is("2C"),
          ownLast: is("2D"),
          partnerLast: is("3H"),
        }),
        len("S", 3),
        bid(4, "S"),
        21,
      ),
      rule(
        "place-hearts",
        "3♠ showed five hearts: bid 4♥ with three-card support",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: is("2C"),
          ownLast: is("2D"),
          partnerLast: is("3S"),
        }),
        len("H", 3),
        bid(4, "H"),
        22,
      ),
      rule(
        "place-notrump",
        "No support for the five-card major: 3NT",
        ctx("opener", {
          ...AS_1N_OPENER,
          partnerFirst: is("2C"),
          ownLast: is("2D"),
          partnerLast: MAJOR_3,
        }),
        ALWAYS,
        bid(3, "N"),
        23,
      ),
    ],
    {
      settings: [toggle("g_nt_1n_smolen_on", "Smolen (game-forcing five-four in the majors)")],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "nt-1n-invitational-two-suiters",
    "Invitational five-four in the majors over 1NT",
    "Slide 21's 8-9 branch, which splits on WHICH major is the long one. Holding five spades and four " +
      "hearts, start with 2♣: over 2♦ bid 2♠ (invitational, five spades), and over 2♥ or 2♠ raise to three " +
      "of the major opener showed. Holding four spades and five hearts, the slide takes the cheaper route — " +
      "transfer with 2♦ and then bid 2♠ over opener's 2♥, which shows five hearts and four spades while " +
      "staying at the two level. The asymmetry is not arbitrary: 2♥-transfer-then-3♥ would push an " +
      "invitation to the three level, whereas 2♦-transfer-then-2♠ does not.",
    "convention",
    [
      ...overPassOrDouble(
        rule(
          "ask-five-spades",
          "2♣ with an invitational five spades and four hearts",
          ctx("responder", { ...OVER_1N }),
          all(
            hcp(low("g_nt_1n_invite_range"), high("g_nt_1n_invite_range")),
            len("S", 5),
            len("H", 4, 4),
          ),
          bid(2, "C"),
          13,
          { shows: { hcp: { min: 8, max: 9 }, forcing: true } },
        ),
      ),
      rule(
        "show-five-spades",
        "2♠ over 2♦: invitational with five spades",
        ctx("responder", { opening: is("1N"), ownLast: is("2C"), partnerLast: is("2D") }),
        all(
          hcp(low("g_nt_1n_invite_range"), high("g_nt_1n_invite_range")),
          len("S", 5),
          len("H", 4, 4),
        ),
        bid(2, "S"),
        24,
        { shows: { hcp: { min: 8, max: 9 }, suits: [{ suit: "S", min: 5 }] } },
      ),
      // Four spades and five hearts: transfer, then show the spades at the two
      // level. The transfer itself is the existing 2♦ rule.
      rule(
        "show-four-spades",
        "2♠ after the heart transfer: five hearts and four spades, invitational",
        ctx("responder", { opening: is("1N"), ownLast: is("2D"), partnerLast: is("2H") }),
        all(
          hcp(low("g_nt_1n_invite_range"), high("g_nt_1n_invite_range")),
          len("H", 5),
          len("S", 4, 4),
        ),
        bid(2, "S"),
        25,
        { shows: { hcp: { min: 8, max: 9 }, suits: [{ suit: "H", min: 5 }, { suit: "S", min: 4 }] } },
      ),
      // Opener's side: pass with a minimum and no fit, otherwise bid game.
      rule(
        "accept-spades",
        "Maximum with three spades: 4♠",
        ctx("opener", {
          ...AS_1N_OPENER,
          ownLast: is("2H"),
          partnerLast: is("2S"),
        }),
        all(hcp(high("g_nt_1n_range")), len("S", 3)),
        bid(4, "S"),
        26,
      ),
      rule(
        "accept-notrump",
        "Maximum without a spade fit: 3NT",
        ctx("opener", {
          ...AS_1N_OPENER,
          ownLast: is("2H"),
          partnerLast: is("2S"),
        }),
        hcp(high("g_nt_1n_range")),
        bid(3, "N"),
        27,
      ),
      rule(
        "decline",
        "Minimum: pass the invitation",
        ctx("opener", {
          ...AS_1N_OPENER,
          ownLast: is("2H"),
          partnerLast: is("2S"),
        }),
        ALWAYS,
        passAction,
        28,
      ),
    ],
    {
      settings: [
        toggle(
          "g_nt_1n_invitational_two_suiters_on",
          "Invitational five-four in the majors (slide 21)",
        ),
      ],
      sets: ["conventions"],
    },
  ),

  // -------------------------------------------------------------------------
  // Slide 19 row 13, slide 20 — the minor transfers.
  // -------------------------------------------------------------------------
  auctionItem(
    "nt-1n-minor-transfers",
    "Minor transfers over 1NT (2♠ and 3♣)",
    "With a partial (0-7) and a six-card or longer minor, transfer into it and pass: 2♠ asks opener for " +
      "3♣ (responder has clubs) and 3♣ asks opener for 3♦ (responder has diamonds). Both are forcing on " +
      "opener, and both leave the 1NT opener declaring. Note the deck's own wiring — 2♠ is NOT a relay to " +
      "be corrected, and a direct 3♣ is diamonds, never clubs.",
    "convention",
    [
      ...overPassOrDouble(
        rule(
          "xfer-c",
          "2♠: transfer to 3♣",
          ctx("responder", { ...OVER_1N }),
          all(hcp(undefined, high("g_nt_1n_partial_range")), len("C", 6)),
          bid(2, "S"),
          17,
          { shows: { hcp: { max: 7 }, suits: [{ suit: "C", min: 6 }], forcing: true } },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "xfer-d",
          "3♣: transfer to 3♦",
          ctx("responder", { ...OVER_1N }),
          all(hcp(undefined, high("g_nt_1n_partial_range")), len("D", 6)),
          bid(3, "C"),
          18,
          { shows: { hcp: { max: 7 }, suits: [{ suit: "D", min: 6 }], forcing: true } },
        ),
      ),
      rule(
        "complete-c",
        "Complete 2♠ with 3♣",
        ctx("opener", { ...AS_1N_OPENER, partnerLast: is("2S") }),
        ALWAYS,
        bid(3, "C"),
        19,
      ),
      rule(
        "complete-d",
        "Complete 3♣ with 3♦",
        ctx("opener", { ...AS_1N_OPENER, partnerLast: is("3C") }),
        ALWAYS,
        bid(3, "D"),
        20,
      ),
      rule(
        "pass-c",
        "Pass 3♣",
        ctx("responder", { opening: is("1N"), ownLast: is("2S"), partnerLast: is("3C") }),
        ALWAYS,
        passAction,
        21,
      ),
      rule(
        "pass-d",
        "Pass 3♦",
        ctx("responder", { opening: is("1N"), ownLast: is("3C"), partnerLast: is("3D") }),
        ALWAYS,
        passAction,
        22,
      ),
    ],
    {
      settings: [toggle("g_nt_1n_minor_transfers_on", "2♠/3♣ minor transfers over 1NT")],
      sets: ["conventions"],
    },
  ),

  // -------------------------------------------------------------------------
  // Slide 19 rows 7-12 and 14, slide 20, slide 22 column 1 — the natural
  // quantitative ladder with no four-card major, and opener's answers.
  // -------------------------------------------------------------------------
  auctionItem(
    "nt-1n-ladder",
    "The quantitative notrump ladder over 1NT",
    "With no four-card major, responder places the contract by points alone: 0-7 PASS (no chance of game " +
      "and no better partial — but transfer first with a five-card major or a six-card minor); 8-9 bid 2NT, " +
      "invitational, opener passing with a minimum and bidding 3NT with a maximum; 10-14 bid 3NT and opener " +
      "should pass, there is no slam; 15-16 bid 4NT, invitational to slam, opener passing with a minimum and " +
      "bidding 6NT with a maximum; 17-19 bid 6NT and opener should pass, there is no chance of a grand; " +
      "20-21 bid 5NT — slam, invitational to the grand — and opener bids 6NT with a minimum, 7NT with a " +
      "maximum; 22+ bid 7NT, the grand is assured. Slide 20 adds that 8-9 with a six-card minor also bids " +
      "2NT: there is no space to show the minor and invite.",
    "agreement",
    [
      rule(
        "inv-2n",
        "2NT invitational (8-9)",
        ctx("responder", { ...OVER_1N, contested: false }),
        all(hcp(low("g_nt_1n_invite_range"), high("g_nt_1n_invite_range")), NO_4_MAJOR),
        bid(2, "N"),
        40,
        { shows: { hcp: { min: 8, max: 9 } } },
      ),
      rule(
        "game-3n",
        "3NT to play (10-14)",
        ctx("responder", { ...OVER_1N, contested: false }),
        all(hcp(low("g_nt_1n_game_range"), high("g_nt_1n_game_range")), NO_4_MAJOR),
        bid(3, "N"),
        41,
        { shows: { hcp: { min: 10, max: 14 } } },
      ),
      rule(
        "quant-4n",
        "4NT invitational to slam (15-16)",
        ctx("responder", { ...OVER_1N, contested: false }),
        all(hcp(low("g_nt_1n_slam_invite_range"), high("g_nt_1n_slam_invite_range")), NO_4_MAJOR),
        bid(4, "N"),
        42,
        { shows: { hcp: { min: 15, max: 16 } } },
      ),
      rule(
        "slam-6n",
        "6NT (17-19)",
        ctx("responder", { ...OVER_1N, contested: false }),
        all(hcp(low("g_nt_1n_slam_range"), high("g_nt_1n_slam_range")), NO_4_MAJOR),
        bid(6, "N"),
        43,
        { shows: { hcp: { min: 17, max: 19 } } },
      ),
      rule(
        "grand-inv-5n",
        "5NT invitational to the grand (20-21)",
        ctx("responder", { ...OVER_1N, contested: false }),
        all(hcp(low("g_nt_1n_grand_invite_range"), high("g_nt_1n_grand_invite_range")), NO_4_MAJOR),
        bid(5, "N"),
        44,
        { shows: { hcp: { min: 20, max: 21 } } },
      ),
      rule(
        "grand-7n",
        "7NT, grand assured (22+)",
        ctx("responder", { ...OVER_1N, contested: false }),
        all(hcp(low("g_nt_1n_grand_range")), NO_4_MAJOR),
        bid(7, "N"),
        45,
        { shows: { hcp: { min: 22 } } },
      ),
      rule(
        "pass-out",
        "Pass with a partial and nothing to show",
        ctx("responder", { ...OVER_1N }),
        all(
          hcp(undefined, high("g_nt_1n_partial_range")),
          not(any(len("S", 5), len("H", 5))),
          not(any(len("C", 6), len("D", 6))),
        ),
        passAction,
        46,
        { shows: { hcp: { max: 7 } } },
      ),
      // Opener's answers to the invitations (the "min/max" column of slide 19).
      rule(
        "accept-2n",
        "Accept the 2NT invitation with a maximum",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2N"), partnerLast: is("2N") }),
        hcp(high("g_nt_1n_range")),
        bid(3, "N"),
        47,
      ),
      rule(
        "decline-2n",
        "Pass the 2NT invitation with a minimum",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("2N"), partnerLast: is("2N") }),
        ALWAYS,
        passAction,
        48,
      ),
      rule(
        "accept-4n",
        "Accept the quantitative 4NT with a maximum",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("4N"), partnerLast: is("4N") }),
        hcp(high("g_nt_1n_range")),
        bid(6, "N"),
        49,
      ),
      rule(
        "decline-4n",
        "Pass the quantitative 4NT with a minimum",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("4N"), partnerLast: is("4N") }),
        ALWAYS,
        passAction,
        50,
      ),
      rule(
        "accept-5n",
        "7NT over 5NT with a maximum",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("5N"), partnerLast: is("5N") }),
        hcp(high("g_nt_1n_range")),
        bid(7, "N"),
        51,
      ),
      rule(
        "decline-5n",
        "6NT over 5NT with a minimum",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("5N"), partnerLast: is("5N") }),
        ALWAYS,
        bid(6, "N"),
        52,
      ),
      rule(
        "pass-3n",
        "Pass 3NT — no slam",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("3N"), partnerLast: is("3N") }),
        ALWAYS,
        passAction,
        53,
      ),
      rule(
        "pass-6n",
        "Pass 6NT — no chance of a grand",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("6N"), partnerLast: is("6N") }),
        ALWAYS,
        passAction,
        54,
      ),
      rule(
        "pass-7n",
        "Pass 7NT",
        ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("7N"), partnerLast: is("7N") }),
        ALWAYS,
        passAction,
        55,
      ),
    ],
  ),

  // -------------------------------------------------------------------------
  // Slide 23 — responses to a 2NT opening. The deck's 2NT gadgets are SEPARATE
  // agreements from the 1NT ones: Stayman is 3♣ and the transfers are 3♦/3♥.
  // -------------------------------------------------------------------------
  auctionItem(
    "nt-2n-game-transfer",
    "4♦/4♥ game transfer over 2NT",
    "A 2NT opening is 20-21 balanced, usually with no five-card major, and responder should get the 2NT " +
      "opener to declare. With a six-card or longer major and 6-10, transfer straight to game: 4♦ asks for " +
      "4♥, 4♥ asks for 4♠, and responder passes the completion.",
    "convention",
    [
      ...overPassOrDouble(
        rule(
          "xfer-h",
          "4♦ game transfer to hearts",
          ctx("responder", { ...OVER_2N }),
          all(hcp(low("g_nt_2n_game_range")), len("H", 6)),
          bid(4, "D"),
          10,
          { shows: { hcp: { min: 6 }, suits: [{ suit: "H", min: 6 }], forcing: true } },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "xfer-s",
          "4♥ game transfer to spades",
          ctx("responder", { ...OVER_2N }),
          all(hcp(low("g_nt_2n_game_range")), len("S", 6)),
          bid(4, "H"),
          11,
          { shows: { hcp: { min: 6 }, suits: [{ suit: "S", min: 6 }], forcing: true } },
        ),
      ),
      // Direct 4♦/4♥ only — see the 1NT item: otherwise 2NT-3♦-3♥-4♥ (the
      // natural jump to game in the transferred major) gets pulled to 4♠.
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
        "Pass the completed game transfer",
        ctx("responder", {
          opening: is("2N"),
          ownLast: bidAt({ level: 4, strains: ["D", "H"] }),
          partnerLast: MAJOR_4,
        }),
        ALWAYS,
        passAction,
        14,
      ),
    ],
    {
      settings: [toggle("g_nt_2n_game_transfer_on", "4♦/4♥ game transfer over 2NT")],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "nt-2n-transfers",
    "Transfers over 2NT (3♦/3♥)",
    "Over 2NT, 3♦ shows hearts and 3♥ shows spades; opener completes with 3♥/3♠ (the orange rows on " +
      "slide 23 — the transfer is forcing). With under 6 points and a six-card or longer major, transfer " +
      "and PASS. With 6-10 and exactly five, transfer and rebid 3NT. With six or more and 6-10 the deck " +
      "uses the four-level game transfer; four of the major here is the fallback when that is switched off.",
    "convention",
    [
      ...overPassOrDouble(
        rule(
          "xfer-h",
          "3♦ transfer to hearts",
          ctx("responder", { ...OVER_2N }),
          any(
            all(hcp(undefined, high("g_nt_2n_partial_range")), len("H", 6)),
            all(hcp(low("g_nt_2n_game_range")), len("H", 5)),
          ),
          bid(3, "D"),
          15,
          { shows: { suits: [{ suit: "H", min: 5 }], forcing: true } },
        ),
      ),
      ...overPassOrDouble(
        rule(
          "xfer-s",
          "3♥ transfer to spades",
          ctx("responder", { ...OVER_2N }),
          any(
            all(hcp(undefined, high("g_nt_2n_partial_range")), len("S", 6)),
            all(hcp(low("g_nt_2n_game_range")), len("S", 5)),
          ),
          bid(3, "H"),
          16,
          { shows: { suits: [{ suit: "S", min: 5 }], forcing: true } },
        ),
      ),
      rule(
        "complete-h",
        "Complete the transfer to 3♥",
        ctx("opener", { ...AS_2N_OPENER, partnerLast: is("3D") }),
        ALWAYS,
        bid(3, "H"),
        20,
      ),
      rule(
        "complete-s",
        "Complete the transfer to 3♠",
        ctx("opener", { ...AS_2N_OPENER, partnerLast: is("3H") }),
        ALWAYS,
        bid(3, "S"),
        21,
      ),
      rule(
        "cont-pass",
        "Under 6: pass the completion",
        ctx("responder", { opening: is("2N"), ownLast: XFER_2N, partnerLast: MAJOR_3 }),
        hcp(undefined, high("g_nt_2n_partial_range")),
        passAction,
        30,
        { shows: { hcp: { max: 5 } } },
      ),
      rule(
        "cont-game-3n",
        "6-10 with exactly five: 3NT",
        ctx("responder", { opening: is("2N"), ownLast: XFER_2N, partnerLast: MAJOR_3 }),
        all(hcp(low("g_nt_2n_game_range")), len("partner_last_bid_suit", 5, 5)),
        bid(3, "N"),
        31,
        { shows: { hcp: { min: 6 } } },
      ),
      rule(
        "cont-game-4m",
        "6-10 with six (four-level transfer off): four of the major",
        ctx("responder", { opening: is("2N"), ownLast: XFER_2N, partnerLast: MAJOR_3 }),
        all(hcp(low("g_nt_2n_game_range")), len("partner_last_bid_suit", 6)),
        raise(4),
        32,
        { shows: { hcp: { min: 6 } } },
      ),
    ],
    {
      settings: [toggle("g_nt_2n_transfers_on", "3♦/3♥ transfers over 2NT")],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "nt-2n-stayman",
    "Stayman 3♣ over 2NT",
    "With a four-card major and 6 or more, ask with 3♣. Opener bids 3♥ or 3♠ holding a four-card major " +
      "(3♥ holding both) and 3♦ otherwise. Slide 23 stops there, so responder's continuation follows the " +
      "same table's own 6-10 rung: four of the major once a fit is confirmed, otherwise 3NT.",
    "convention",
    [
      ...overPassOrDouble(
        rule(
          "ask",
          "Stayman 3♣ ask",
          ctx("responder", { ...OVER_2N }),
          all(
            hcp(low("g_nt_2n_game_range")),
            any(len("S", 4), len("H", 4)),
            not(any(len("S", 5), len("H", 5))),
          ),
          bid(3, "C"),
          12,
          { shows: { hcp: { min: 6 }, forcing: true } },
        ),
      ),
      rule(
        "reply-h",
        "3♥: four hearts (hearts first with both)",
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
        { shows: { hcp: { min: 20, max: 21 }, suits: [{ suit: "S", min: 4 }, { suit: "H", max: 3 }] } },
      ),
      rule(
        "reply-d",
        "3♦: no four-card major",
        ctx("opener", { ...AS_2N_OPENER, partnerLast: is("3C") }),
        ALWAYS,
        bid(3, "D"),
        24,
        { shows: { hcp: { min: 20, max: 21 }, suits: [{ suit: "S", max: 3 }, { suit: "H", max: 3 }] } },
      ),
      rule(
        "cont-fit",
        "Four of the major on the fit",
        ctx("responder", { opening: is("2N"), ownLast: is("3C"), partnerLast: MAJOR_3 }),
        len("partner_last_bid_suit", 4),
        raise(4),
        25,
      ),
      rule(
        "cont-3n",
        "3NT with no fit",
        ctx("responder", {
          opening: is("2N"),
          ownLast: is("3C"),
          partnerLast: bidAt({ level: 3, strains: ["D", "H", "S"] }),
        }),
        ALWAYS,
        bid(3, "N"),
        26,
      ),
    ],
    { settings: [toggle("g_nt_2n_stayman_on", "Stayman 3♣ over 2NT")], sets: ["conventions"] },
  ),

  auctionItem(
    "nt-2n-ladder",
    "The quantitative notrump ladder over 2NT",
    "With no four-card major over a 20-21 2NT opening: 6-10 bid 3NT to play; 11 bid 4NT, opener passing " +
      "with a minimum and bidding 6NT with a maximum; 12-15 bid 6NT and opener should pass; 16 bid 5NT and " +
      "opener bids 6NT with a minimum, 7NT with a maximum; 17 or more bid 7NT, the grand is assured.",
    "agreement",
    [
      rule(
        "game-3n",
        "3NT to play (6-10)",
        ctx("responder", { ...OVER_2N, contested: false }),
        all(hcp(low("g_nt_2n_game_range"), high("g_nt_2n_game_range")), NO_4_MAJOR),
        bid(3, "N"),
        40,
        { shows: { hcp: { min: 6, max: 10 } } },
      ),
      rule(
        "quant-4n",
        "4NT invitational to slam (11)",
        ctx("responder", { ...OVER_2N, contested: false }),
        all(hcp(low("g_nt_2n_slam_invite_range"), high("g_nt_2n_slam_invite_range")), NO_4_MAJOR),
        bid(4, "N"),
        41,
        { shows: { hcp: { min: 11, max: 11 } } },
      ),
      rule(
        "slam-6n",
        "6NT (12-15)",
        ctx("responder", { ...OVER_2N, contested: false }),
        all(hcp(low("g_nt_2n_slam_range"), high("g_nt_2n_slam_range")), NO_4_MAJOR),
        bid(6, "N"),
        42,
        { shows: { hcp: { min: 12, max: 15 } } },
      ),
      rule(
        "grand-inv-5n",
        "5NT invitational to the grand (16)",
        ctx("responder", { ...OVER_2N, contested: false }),
        all(hcp(low("g_nt_2n_grand_invite_range"), high("g_nt_2n_grand_invite_range")), NO_4_MAJOR),
        bid(5, "N"),
        43,
        { shows: { hcp: { min: 16, max: 16 } } },
      ),
      rule(
        "grand-7n",
        "7NT, grand assured (17+)",
        ctx("responder", { ...OVER_2N, contested: false }),
        all(hcp(low("g_nt_2n_grand_range")), NO_4_MAJOR),
        bid(7, "N"),
        44,
        { shows: { hcp: { min: 17 } } },
      ),
      rule(
        "accept-4n",
        "Accept the quantitative 4NT with a maximum",
        ctx("opener", { ...AS_2N_OPENER, partnerFirst: is("4N"), partnerLast: is("4N") }),
        hcp(high("g_nt_2n_range")),
        bid(6, "N"),
        45,
      ),
      rule(
        "decline-4n",
        "Pass the quantitative 4NT with a minimum",
        ctx("opener", { ...AS_2N_OPENER, partnerFirst: is("4N"), partnerLast: is("4N") }),
        ALWAYS,
        passAction,
        46,
      ),
      rule(
        "accept-5n",
        "7NT over 5NT with a maximum",
        ctx("opener", { ...AS_2N_OPENER, partnerFirst: is("5N"), partnerLast: is("5N") }),
        hcp(high("g_nt_2n_range")),
        bid(7, "N"),
        47,
      ),
      rule(
        "decline-5n",
        "6NT over 5NT with a minimum",
        ctx("opener", { ...AS_2N_OPENER, partnerFirst: is("5N"), partnerLast: is("5N") }),
        ALWAYS,
        bid(6, "N"),
        48,
      ),
      rule(
        "pass-3n",
        "Pass 3NT",
        ctx("opener", { ...AS_2N_OPENER, partnerFirst: is("3N"), partnerLast: is("3N") }),
        ALWAYS,
        passAction,
        49,
      ),
      rule(
        "pass-6n",
        "Pass 6NT",
        ctx("opener", { ...AS_2N_OPENER, partnerFirst: is("6N"), partnerLast: is("6N") }),
        ALWAYS,
        passAction,
        50,
      ),
      rule(
        "pass-7n",
        "Pass 7NT",
        ctx("opener", { ...AS_2N_OPENER, partnerFirst: is("7N"), partnerLast: is("7N") }),
        ALWAYS,
        passAction,
        51,
      ),
    ],
    {
      settings: [
        range("g_nt_2n_range", "2NT opening range (HCP)", 20, 21, { min: 18, max: 24 }),
        range("g_nt_2n_partial_range", "Responder: partial, over 2NT (HCP)", 0, 5, { min: 0, max: 10 }),
        range("g_nt_2n_game_range", "Responder: game, over 2NT (HCP)", 6, 10, { min: 3, max: 14 }),
        range("g_nt_2n_slam_invite_range", "Responder: slam invitational, over 2NT (HCP)", 11, 11, { min: 8, max: 16 }),
        range("g_nt_2n_slam_range", "Responder: slam assured, over 2NT (HCP)", 12, 15, { min: 10, max: 20 }),
        range("g_nt_2n_grand_invite_range", "Responder: grand invitational, over 2NT (HCP)", 16, 16, { min: 12, max: 22 }),
        range("g_nt_2n_grand_range", "Responder: grand assured, over 2NT (HCP)", 17, 40, { min: 14, max: 40 }),
      ],
    },
  ),

  // -------------------------------------------------------------------------
  // The orange rows, made mechanical: opener may not pass a transfer or an ask.
  // -------------------------------------------------------------------------
  item(
    "nt-transfer-forcing",
    "Transfers and Stayman are forcing on opener",
    "Every transfer and every Stayman ask over a notrump opening is forcing: opener has no pass available " +
      "and must complete the transfer (or answer the ask) even with a minimum. Over 1NT that covers 2♣ " +
      "(Stayman), 2♦/2♥ (Jacoby), 2♠ and 3♣ (the minor transfers) and 4♦/4♥ (the game transfers); over 2NT " +
      "it covers 3♣ (Stayman), 3♦/3♥ and 4♦/4♥.",
    "agreement",
    "auction",
    {
      kind: "forcing_rules",
      rules: [
        forcing("stayman-1n", "2♣ Stayman must be answered", ctx("opener", { ...AS_1N_OPENER, partnerLast: is("2C") }), 10),
        forcing("xfer-2d", "2♦ transfer must be completed", ctx("opener", { ...AS_1N_OPENER, partnerLast: is("2D") }), 11),
        forcing("xfer-2h", "2♥ transfer must be completed", ctx("opener", { ...AS_1N_OPENER, partnerLast: is("2H") }), 12),
        forcing("xfer-2s", "2♠ minor transfer must be completed", ctx("opener", { ...AS_1N_OPENER, partnerLast: is("2S") }), 13),
        forcing("xfer-3c-1n", "3♣ minor transfer must be completed", ctx("opener", { ...AS_1N_OPENER, partnerLast: is("3C") }), 14),
        // Direct 4♦/4♥ only: a 4♥ reached as a raise (1NT-2♦-2♥-4♥) is a
        // contract, not a transfer, and opener must be allowed to pass it.
        forcing("xfer-4d-1n", "4♦ game transfer must be completed", ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("4D"), partnerLast: is("4D") }), 15),
        forcing("xfer-4h-1n", "4♥ game transfer must be completed", ctx("opener", { ...AS_1N_OPENER, partnerFirst: is("4H"), partnerLast: is("4H") }), 16),
        forcing("stayman-2n", "3♣ Stayman must be answered", ctx("opener", { ...AS_2N_OPENER, partnerLast: is("3C") }), 17),
        forcing("xfer-3d-2n", "3♦ transfer must be completed", ctx("opener", { ...AS_2N_OPENER, partnerLast: is("3D") }), 18),
        forcing("xfer-3h-2n", "3♥ transfer must be completed", ctx("opener", { ...AS_2N_OPENER, partnerLast: is("3H") }), 19),
        forcing("xfer-4d-2n", "4♦ game transfer must be completed", ctx("opener", { ...AS_2N_OPENER, partnerFirst: is("4D"), partnerLast: is("4D") }), 20),
        forcing("xfer-4h-2n", "4♥ game transfer must be completed", ctx("opener", { ...AS_2N_OPENER, partnerFirst: is("4H"), partnerLast: is("4H") }), 21),
      ],
    },
    {
      settings: [toggle("g_nt_transfer_forcing_on", "Transfers/Stayman are forcing on opener")],
      sets: ["conventions"],
    },
  ),

  // -------------------------------------------------------------------------
  // Slide 19's last row, in red: "others — DON'T USE UNDISCUSSED BIDS!"
  // -------------------------------------------------------------------------
  item(
    "nt-undiscussed-bids",
    "Over notrump, DON'T USE UNDISCUSSED BIDS",
    "Slide 19's final row is printed in red: anything not in the table is an UNDISCUSSED bid and must not " +
      "be used. Over 1NT the whole legal vocabulary is Pass, 2♣ (Stayman), 2♦/2♥ (transfers), 2♠ (transfer " +
      "to 3♣), 2NT, 3♣ (transfer to 3♦), 3NT, 4♦/4♥ (game transfers), 4NT, 5NT, 6NT and 7NT. So a direct " +
      "3♦, 3♥ or 3♠ is NOT available (a six-card major goes through a transfer, a long minor through " +
      "2♠/3♣); 2♠ is never natural spades and 3♣ is never natural clubs; 4♣ and 4♠ are not available, and " +
      "4NT is the deck's quantitative invitation, not an ace ask. Over 2NT the table's own list is likewise " +
      "complete: Pass, 3♣ (Stayman), 3♦/3♥ (transfers), 3NT, 4♦/4♥ (game transfers), 4NT, 5NT, 6NT, 7NT — " +
      "with no 3♠, 4♣ or 4♠ response. Agree an addition with partner before using it.",
    "judgment_guideline",
    "auction",
    { kind: "none" },
  ),
];

/** Slide(s) each item was authored from — install.ts turns these into citations. */
export const NT_RESPONSES_SLIDES: Record<string, number[]> = {
  "nt-thresholds": [18],
  "nt-1n-game-transfer": [19, 20, 22],
  "nt-1n-transfers": [18, 19, 20, 21, 22],
  "nt-1n-stayman": [18, 19, 20, 22],
  "nt-1n-smolen": [21],
  "nt-1n-invitational-two-suiters": [21],
  "nt-1n-minor-transfers": [19, 20],
  "nt-1n-ladder": [18, 19, 20, 22],
  "nt-2n-game-transfer": [23],
  "nt-2n-transfers": [23],
  "nt-2n-stayman": [23],
  "nt-2n-ladder": [23],
  "nt-transfer-forcing": [19, 23],
  "nt-undiscussed-bids": [19, 23],
};
