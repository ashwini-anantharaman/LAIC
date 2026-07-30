// Responding to a one-of-a-suit opening — Girkar teaching deck, slides 24–27.
//
// Slide 24 is a 15-row table of responses to 1♥/1♠, slide 25 the same material
// re-sorted BY SUPPORT LENGTH, slide 26 the support×strength matrix that gives
// each cell a REBID PLAN, and slide 27 a 12-row table of responses to 1♣/1♦.
// Every row of both tables is authored here; slide 25/26 are merged into the
// items they refine (and cited alongside).
//
// COLOR SEMANTICS. Orange rows = FORCING: over a major, 1NT is forcing (both
// the 10–11 with three-card support row that plans to rebid 3M and the 6–11
// "no support, many types" row). Green rows = GAME FORCE: this deck plays
// 2/1 GAME FORCE, so a new suit at the two level by responder promises 12+.
// The forcing-ness is carried three ways: `shows.forcing`, the word "forcing"
// in the item text, and real `forcing_rules` items at the bottom of the file
// (each with its own toggle, so a partnership that plays 1NT semi-forcing or
// non-GF two-over-ones can switch that one situation off).
//
// DECK-SPECIFIC CHOICES encoded as written (never "corrected"): 2NT over a
// major is Jacoby (12+, 4+ support; a singleton diverts it to a splinter only
// at 16+, which the splinters' cheaper priority already does); 3M is a limit raise (10–11,
// 4+ support); 4M is two-way (0–10 with five-card support, to make or to
// sacrifice); 3NT is a 14–15 balanced 4333 game-forcing raise with exactly
// three-card support; 16+ with four-card support and a singleton splinters
// (3♠/4♣/4♦/4♥); over a minor the raises are INVERTED (2m = 9+ with five-card
// support and forcing to 3m, 3m = 6–9 with five-card support); 1NT/2NT/3NT over
// a minor are limit bids by HCP band that DENY a four-card major; and a jump to
// 2♥/2♠/3♥/3♠ over a minor is a weak preempt. Where the deck's own slides
// disagree or leave a band wide, the deck's choice is encoded and a setting is
// exposed rather than silently narrowed (see the notes on each item).
//
// BAND DISCIPLINE. knowledgeType decides the outer band (convention 1 fires
// before agreement 2), so the artificial calls — Jacoby 2NT, splinters,
// inverted minor raises — are considered before any natural ladder no matter
// what their priority number is. Inside the natural band the priority numbers
// follow the deck's own TABLE ROW ORDER, which is how the deck resolves hands
// that match two rows (its worked examples confirm it: the 13-HCP 5-club hand
// on slide 27 is given 2♣ game force even though the 3NT row also matches).
//
// Priority ladder over 1♥/1♠ (lower fires first):
//   18–19 splinter · 20 Jacoby 2NT            (convention band)
//   22 3NT balanced raise · 23 1♠ over 1♥ with 12+
//   24–27 two-over-one game force · 28 4M two-way · 30 limit raise
//   31–34 jump preempts · 35 single raise · 40 1♠ over 1♥ (6–11)
//   44–45 forcing 1NT · 95 pass
// (The jump preempts sit ABOVE the single raise because slide 24's own row-14
//  example holds three-card support and is still given the 3♦ preempt.)
// Priority ladder over 1♣/1♦:
//   20 inverted 2m · 22 inverted 3m           (convention band)
//   21–22 weak jump shift · 23–25 major response · 27 2♣ game force
//   30 1♦ over 1♣ · 32–34 notrump limit ladder · 95 pass

import {
  all,
  any,
  auctionItem,
  bid,
  bidAt,
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
  longestAmong,
  low,
  not,
  pass as passCall,
  raise,
  range,
  rule,
  toggle,
  tp,
  unshown,
  type TemplateItem,
} from "@bridge/sayc-template/dsl";

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

const MAJORS = ["H", "S"] as const;
const MINORS = ["C", "D"] as const;
type Major = (typeof MAJORS)[number];
type Minor = (typeof MINORS)[number];

const ONE_OF_A_SUIT = bidAt({ level: 1, strains: ["C", "D", "H", "S"] });
const MINOR_OPENING = bidAt({ level: 1, strains: ["C", "D"] });

/** Responder facing partner's 1♥/1♠ (or 1♣/1♦) opening, first call. */
const overMajor = (m: Major, contested?: boolean) =>
  ctx("responder", {
    opening: is(`1${m}`),
    partnerLast: is(`1${m}`),
    ...(contested !== undefined && { contested }),
  });
const overMinor = (mn: Minor, contested?: boolean) =>
  ctx("responder", {
    opening: is(`1${mn}`),
    partnerLast: is(`1${mn}`),
    ...(contested !== undefined && { contested }),
  });

const SUIT_GLYPH = { C: "♣", D: "♦", H: "♥", S: "♠" } as const;

/** Slide 27's "denies 4 card M" — the whole minor-response ladder wears it. */
const NO_FOUR_CARD_MAJOR = not(any(len("H", 4), len("S", 4)));
/** 4333 exactly: every suit three or four cards long (slide 24's 3NT row). */
const SHAPE_4333 = all(len("C", 3, 4), len("D", 3, 4), len("H", 3, 4), len("S", 3, 4));

export const SUIT_RESPONSES: TemplateItem[] = [
  // =========================================================================
  // A. Responder's first call over 1♥/1♠ — slide 24 (table), slide 25 (prose)
  // =========================================================================

  auctionItem(
    "sr-responder-pass",
    "Pass a one-level suit opening with fewer than 6 points",
    "Row 1 of both response tables: with fewer than 6 points responder passes partner's 1♣/1♦/1♥/1♠ opening — there is no chance of game (slide 24 example ♠xxx ♥Kxx ♦x ♣xxxxxx, slide 27 example ♠Qx ♥Kxx ♦xxxx ♣xxxx). Slide 26's matrix repeats it in the 0–5 column: with two-card support or less, \"Pass (Done)\"; with three or four cards of support, \"Pass\" but consider a raise. HCP is the test, so a shapely 5-count with a six- or seven-card suit still reaches the preemptive jump responses (which are counted in total points, HCP plus length).",
    "agreement",
    [
      rule(
        "pass",
        "Pass with fewer than 6 HCP",
        ctx("responder", { opening: ONE_OF_A_SUIT, partnerLast: ONE_OF_A_SUIT }),
        hcp(undefined, high("g_sr_responder_pass_max")),
        passCall,
        95,
        { shows: { hcp: { max: 5 } } },
      ),
    ],
    {
      settings: [
        range("g_sr_responder_pass_max", "Responder passes with at most", 0, 5, { max: 12 }),
      ],
    },
  ),

  auctionItem(
    "sr-major-raises",
    "Raises of 1♥/1♠: single raise and the 3M limit raise",
    "Slide 24 rows 2 and 3, restated on slide 25 by support length and again in slide 26's matrix. With 6–9 points and THREE-plus card support raise to 2M — a limit bid, and the matrix marks that cell \"Done\" (the partnership has described itself). With 10–11 points and FOUR-plus card support jump to 3M: in this deck 3M is a LIMIT raise, not forcing, and the matrix again marks it \"Done\". A 10–11 hand with only three-card support does NOT jump — it responds a forcing 1NT and rebids 3M (see \"1NT over a major is forcing\").",
    "agreement",
    [
      // Split per major so each raise's `shows` names the literal trump suit:
      // that is what makes fitEstablished / combinedHcp see the fit later.
      ...MAJORS.map((m) =>
        rule(
          `limit-${m}`,
          `Limit raise to 3${SUIT_GLYPH[m]} (10–11, four-card support)`,
          overMajor(m),
          all(
            len(m, 4),
            // The deck's strength column is "points"; a raise counts length (and
            // slide 33's shortness), so the band is tested on total points —
            // but ALSO on plain HCP, or the 10–11 row and the 12+ Jacoby row
            // (which is an HCP test) would leave an 11-HCP/12-total-point hand
            // with four-card support no bid at all.
            any(
              tp(low("g_sr_major_limit_raise"), high("g_sr_major_limit_raise")),
              hcp(low("g_sr_major_limit_raise"), high("g_sr_major_limit_raise")),
            ),
          ),
          raise(3),
          30,
          { shows: { tp: { min: 10, max: 11 }, suits: [{ suit: m, min: 4 }] } },
        ),
      ),
      ...MAJORS.map((m) =>
        rule(
          `single-${m}`,
          `Single raise to 2${SUIT_GLYPH[m]} (6–9, three-card support)`,
          overMajor(m),
          all(
            len(m, 3),
            // Total points OR plain HCP inside the band — the next rung up
            // (the forcing 1NT with three-card support) is an HCP test, so a
            // hand of 8 HCP that reaches 10 total points would otherwise match
            // neither rung and get passed out.
            any(
              tp(low("g_sr_major_single_raise"), high("g_sr_major_single_raise")),
              hcp(low("g_sr_major_single_raise"), high("g_sr_major_single_raise")),
            ),
          ),
          raise(2),
          // Below the jump preempts (31–34): slide 24's own row-14 example
          // (♠x ♥xxx ♦AKJxxxx ♣xx) holds three-card support and the deck still
          // gives it 3♦, so a preemptive long suit outranks a minimum raise.
          35,
          { shows: { tp: { min: 6, max: 9 }, suits: [{ suit: m, min: 3 }] } },
        ),
      ),
    ],
    {
      settings: [
        range("g_sr_major_single_raise", "Single raise of a major", 6, 9),
        range("g_sr_major_limit_raise", "Limit raise (3 of the major)", 10, 11),
      ],
    },
  ),

  auctionItem(
    "sr-major-game-raise",
    "4M: the two-way game raise (0–10 with five-card support)",
    "Slide 24 row 7: with 0–10 points and FIVE-plus card support, jump straight to 4M. The deck calls it a \"two way bid, to make or to sacrifice\" — partner cannot tell which, and must not treat it as showing values (example ♠x ♥KQxxx ♦xx ♣xxxxx). Slide 26's matrix puts 4M in the five-plus-support row for both the 0–5 and 6–9 columns, and slide 25 caps it at 10: with five-card support and 11+ you instead explore slam with Jacoby 2NT or a splinter.",
    "agreement",
    [
      ...MAJORS.map((m) =>
        rule(
          `four-${m}`,
          `4${SUIT_GLYPH[m]} two-way raise (five-card support, 0–10)`,
          overMajor(m),
          // Ceiling on total points OR on plain HCP: Jacoby's five-card-support
          // floor is an HCP test (11), so an 8-HCP hand whose length pushes it
          // past 10 total points has to stay in the 4M row rather than fall
          // through the whole ladder.
          all(
            len(m, 5),
            any(
              tp(undefined, high("g_sr_major_game_raise")),
              hcp(undefined, high("g_sr_major_game_raise")),
            ),
          ),
          raise(4),
          28,
          { shows: { tp: { max: 10 }, suits: [{ suit: m, min: 5 }] } },
        ),
      ),
    ],
    { settings: [range("g_sr_major_game_raise", "Two-way 4M raise, at most", 0, 10, { max: 14 })] },
  ),

  auctionItem(
    "sr-jacoby-2nt",
    "Jacoby 2NT over 1♥/1♠",
    "Slide 24 row 4: 2NT over 1♥/1♠ is JACOBY — 12+ points, FOUR-plus card support, NO singleton, and a GAME FORCE (example ♠Qx ♥KJxx ♦AQJx ♣xxx). Slide 25 splits the strong raises: 12–15 bid 2NT whatever the shape, and at 16+ it is 2NT with no singleton but a SPLINTER with one. The row's \"no singleton\" is therefore mechanized by PRECEDENCE, not by a shape test on this rule: the splinters are considered first (they are the cheaper priority numbers), so a 16+ hand with four-card support and a singleton reaches its splinter and everything else lands on 2NT. Testing \"no singleton\" here as well would leave the deck's own 12–15 shapely raise — 12+ points, four-card support, a stiff and no other bid available — with no call at all. Slide 26's matrix additionally puts 2NT in the five-plus-support row from 10–11 upward (\"GF, Need max for slam\"), while slide 24's table gives 0–10 with five-card support to 4M — the deck's own slides overlap at 10–11, so the five-card-support floor for 2NT is a setting (default 11, which is where slide 25 puts it). Opener's continuations after 2NT are the deck's slide 48 (slam chapter).",
    "convention",
    [
      ...MAJORS.map((m) =>
        rule(
          `jacoby-${m}`,
          `Jacoby 2NT over 1${SUIT_GLYPH[m]}`,
          overMajor(m, false),
          any(
            all(len(m, 4), hcp(low("g_sr_jacoby_2nt_range"))),
            all(len(m, 5), hcp(low("g_sr_jacoby_five_support_min"))),
          ),
          bid(2, "N"),
          20,
          { shows: { hcp: { min: 12 }, suits: [{ suit: m, min: 4 }], forcing: true } },
        ),
      ),
    ],
    {
      settings: [
        toggle("g_sr_jacoby_2nt_on", "Jacoby 2NT over a major"),
        range("g_sr_jacoby_2nt_range", "Jacoby 2NT strength (four-card support)", 12, 40),
        range("g_sr_jacoby_five_support_min", "Jacoby 2NT with five-card support from", 11, 40),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "sr-major-splinters",
    "Splinters: 3♠/4♣/4♦/4♥ over 1♥/1♠",
    "Slide 24 row 15: with 16+ points, FOUR-plus card support and a singleton, bid the singleton suit — 3♠/4♣/4♦ over 1♥ and 4♣/4♦/4♥ over 1♠. The deck's note is \"Singleton in bid suit, game force, slam possibilities\" (example ♠AQx ♥KJxx ♦x ♣AQxxx). Slide 25 makes the split explicit: 16+ with four-card support and NO singleton is Jacoby 2NT, 16+ WITH a singleton is the splinter. A void qualifies too — the deck says singleton, and the rule tests \"at most one card\".",
    "convention",
    [
      // Over 1♥ the cheapest splinter is 3♠; over 1♠ every splinter is at the
      // four level. One rule per (opening major × short suit).
      rule(
        "splinter-h-s",
        "3♠ splinter over 1♥ (singleton spade)",
        overMajor("H", false),
        all(len("H", 4), hcp(low("g_sr_splinter_range")), len("S", undefined, 1)),
        bid(3, "S"),
        18,
        {
          shows: {
            hcp: { min: 16 },
            suits: [
              { suit: "H", min: 4 },
              { suit: "S", max: 1 },
            ],
            forcing: true,
          },
        },
      ),
      rule(
        "splinter-s-h",
        "4♥ splinter over 1♠ (singleton heart)",
        overMajor("S", false),
        all(len("S", 4), hcp(low("g_sr_splinter_range")), len("H", undefined, 1)),
        bid(4, "H"),
        18,
        {
          shows: {
            hcp: { min: 16 },
            suits: [
              { suit: "S", min: 4 },
              { suit: "H", max: 1 },
            ],
            forcing: true,
          },
        },
      ),
      ...MAJORS.flatMap((m) =>
        MINORS.map((mn) =>
          rule(
            `splinter-${m}-${mn}`,
            `4${SUIT_GLYPH[mn]} splinter over 1${SUIT_GLYPH[m]} (singleton ${mn === "C" ? "club" : "diamond"})`,
            overMajor(m, false),
            all(len(m, 4), hcp(low("g_sr_splinter_range")), len(mn, undefined, 1)),
            bid(4, mn),
            19,
            {
              shows: {
                hcp: { min: 16 },
                suits: [
                  { suit: m, min: 4 },
                  { suit: mn, max: 1 },
                ],
                forcing: true,
              },
            },
          ),
        ),
      ),
    ],
    {
      settings: [
        toggle("g_sr_splinters_on", "Splinter responses to a major"),
        range("g_sr_splinter_range", "Splinter strength", 16, 40),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "sr-major-3nt-raise",
    "3NT over 1♥/1♠: the 14–15 balanced 4333 raise",
    "Slide 24 row 12: 14–15 points with a flat 4333 hand responds 3NT — the deck's \"Game force, balanced strong raise\" (example ♠AQx ♥KJx ♦Kxxx ♣Qxx). Slide 25 files it under THREE-card support, so the rule wants exactly three cards in opener's major; with four-card support the same hand is Jacoby 2NT. 4333 is tested literally: every suit three or four cards long. The deck gives this row no exception for holding a four-card spade suit over 1♥, so 3NT is considered before the 1♠ response.",
    "agreement",
    [
      ...MAJORS.map((m) =>
        rule(
          `balanced-raise-${m}`,
          `3NT balanced raise over 1${SUIT_GLYPH[m]} (14–15, 4333, three-card support)`,
          overMajor(m, false),
          all(
            SHAPE_4333,
            len(m, 3, 3),
            hcp(low("g_sr_major_3nt_range"), high("g_sr_major_3nt_range")),
          ),
          bid(3, "N"),
          22,
          {
            shows: {
              hcp: { min: 14, max: 15 },
              suits: [{ suit: m, min: 3, max: 3 }],
              forcing: true,
            },
          },
        ),
      ),
    ],
    { settings: [range("g_sr_major_3nt_range", "3NT balanced raise of a major", 14, 15)] },
  ),

  auctionItem(
    "sr-major-two-over-one",
    "Two-over-one game force: a new suit at the two level over 1♥/1♠",
    "The GREEN rows of slide 24 (rows 9, 10, 11) — this deck is Standard American 2/1 GAME FORCE, so a new suit at the two level by responder promises 12+ points and forces the partnership to game. Three shapes reach it: 12+ with THREE-card support bids a new suit at the two level and shows the raise later (row 9, \"Game force, show raise later\", example ♠Qx ♥KJx ♦AQJxx ♣xxx); 12+ with NO support bids 2♣/2♦ with four-plus cards in the suit (row 10); and over 1♠ only, 12+ with five-plus hearts bids 2♥ (row 11). With four hearts and three-card spade support over 1♠, row 9 applies — 2♥ is simply \"a new suit at the two level\". Diamonds are preferred to clubs when they are the longer (or equal-length) suit. Partner may not pass below game; the companion forcing item makes that mechanical.",
    "agreement",
    [
      rule(
        "gf-2h-no-support",
        "2♥ over 1♠ (game force, five-plus hearts, no support)",
        overMajor("S", false),
        all(hcp(low("g_sr_two_over_one_range")), len("H", 5), len("S", undefined, 2)),
        bid(2, "H"),
        24,
        { shows: { hcp: { min: 12 }, suits: [{ suit: "H", min: 5 }], forcing: true } },
      ),
      rule(
        "gf-2h-three-support",
        "2♥ over 1♠ (game force with three-card support, raise later)",
        overMajor("S", false),
        all(hcp(low("g_sr_two_over_one_range")), len("H", 4), len("S", 3, 3)),
        bid(2, "H"),
        25,
        // Deliberately NO spade length in `shows`: the whole point of row 9 is
        // that the raise is still hidden, so unshownSupport can find it later.
        { shows: { hcp: { min: 12 }, suits: [{ suit: "H", min: 4 }], forcing: true } },
      ),
      ...MAJORS.map((m) =>
        rule(
          `gf-2d-${m}`,
          `2♦ over 1${SUIT_GLYPH[m]} (game force, four-plus diamonds)`,
          overMajor(m, false),
          all(hcp(low("g_sr_two_over_one_range")), len("D", 4), longestAmong("D")),
          bid(2, "D"),
          26,
          { shows: { hcp: { min: 12 }, suits: [{ suit: "D", min: 4 }], forcing: true } },
        ),
      ),
      ...MAJORS.map((m) =>
        rule(
          `gf-2c-${m}`,
          `2♣ over 1${SUIT_GLYPH[m]} (game force, four-plus clubs)`,
          overMajor(m, false),
          all(hcp(low("g_sr_two_over_one_range")), len("C", 4)),
          bid(2, "C"),
          27,
          { shows: { hcp: { min: 12 }, suits: [{ suit: "C", min: 4 }], forcing: true } },
        ),
      ),
    ],
    { settings: [range("g_sr_two_over_one_range", "Two-over-one game force from", 12, 40)] },
  ),

  auctionItem(
    "sr-one-spade-over-one-heart",
    "1♠ over 1♥ with four-plus spades",
    "Slide 24 row 8: 6+ points with four-plus spades responds 1♠ — \"Over 1H only\" (example ♠KQxx ♥xx ♦Qxxx ♣xxx). The deck's table puts this row ABOVE the game-forcing two-level rows, so a 12+ hand with four spades bids 1♠ rather than 2♣/2♦, and slide 25 confirms it for the strong hands: \"sometimes 1s over 1h and show raise later\". Below game-forcing strength the 1♠ response is NOT a game force (slide 25: \"6-11 → 1N forcing (sometimes 1s, not gf, over 1h)\"), and it yields to a raise: with three-plus heart support and 6–11 the deck's rows 2/3 raise instead, and a 10–11 hand with exactly three hearts prefers the forcing 1NT so it can rebid 3♥.",
    "agreement",
    [
      rule(
        "one-spade-gf",
        "1♠ over 1♥ with 12+ (raise or rebid to come)",
        overMajor("H"),
        all(hcp(12), len("S", 4)),
        bid(1, "S"),
        23,
        { shows: { hcp: { min: 12 }, suits: [{ suit: "S", min: 4 }] } },
      ),
      rule(
        "one-spade-constructive",
        "1♠ over 1♥ with 6–11 and no heart support",
        overMajor("H"),
        all(
          tp(low("g_sr_1s_over_1h_range"), high("g_sr_1s_over_1h_range")),
          len("S", 4),
          len("H", undefined, 2),
        ),
        bid(1, "S"),
        40,
        {
          shows: {
            tp: { min: 6, max: 11 },
            suits: [
              { suit: "S", min: 4 },
              { suit: "H", max: 2 },
            ],
          },
        },
      ),
    ],
    { settings: [range("g_sr_1s_over_1h_range", "1♠ over 1♥ without support", 6, 11)] },
  ),

  auctionItem(
    "sr-major-jump-preempts",
    "Preemptive jump responses to 1♥/1♠",
    "Slide 24 rows 13 and 14. With 6–11 points and SIX spades over 1♥, jump to 2♠ — \"6 card preempt, over 1h only\" (example ♠AQxxxx ♥xx ♦xxx ♣Jx). With 6–11 and a SEVEN-plus card suit, jump to the three level: 3♣/3♦ over either major and 3♥ over 1♠ only — \"7 card preempt\" (example ♠x ♥xxx ♦AKJxxxx ♣xx). These are weak, not strong, jumps: they describe a one-suited hand and deny interest in anything else. The deck's own row-14 example holds THREE small cards in opener's major (♠x ♥xxx ♦AKJxxxx ♣xx over 1♥) and is still given 3♦, so the jumps are considered before the single raise and after the limit raise: a one-suiter preempts, a hand with four-card support and 10–11 raises. The 6–11 band is wide by design and is exposed as a setting.",
    "agreement",
    [
      rule(
        "two-spades-over-1h",
        "2♠ over 1♥ (six-card preempt)",
        overMajor("H"),
        all(
          len("S", 6),
          tp(low("g_sr_major_jump_preempt_range"), high("g_sr_major_jump_preempt_range")),
        ),
        bid(2, "S"),
        31,
        { shows: { tp: { min: 6, max: 11 }, suits: [{ suit: "S", min: 6 }] } },
      ),
      rule(
        "three-hearts-over-1s",
        "3♥ over 1♠ (seven-card preempt)",
        overMajor("S"),
        all(
          len("H", 7),
          tp(low("g_sr_major_jump_preempt_range"), high("g_sr_major_jump_preempt_range")),
        ),
        bid(3, "H"),
        32,
        { shows: { tp: { min: 6, max: 11 }, suits: [{ suit: "H", min: 7 }] } },
      ),
      ...MAJORS.map((m) =>
        rule(
          `three-diamonds-${m}`,
          `3♦ over 1${SUIT_GLYPH[m]} (seven-card preempt)`,
          overMajor(m),
          all(
            len("D", 7),
            tp(low("g_sr_major_jump_preempt_range"), high("g_sr_major_jump_preempt_range")),
          ),
          bid(3, "D"),
          33,
          { shows: { tp: { min: 6, max: 11 }, suits: [{ suit: "D", min: 7 }] } },
        ),
      ),
      ...MAJORS.map((m) =>
        rule(
          `three-clubs-${m}`,
          `3♣ over 1${SUIT_GLYPH[m]} (seven-card preempt)`,
          overMajor(m),
          all(
            len("C", 7),
            tp(low("g_sr_major_jump_preempt_range"), high("g_sr_major_jump_preempt_range")),
          ),
          bid(3, "C"),
          34,
          { shows: { tp: { min: 6, max: 11 }, suits: [{ suit: "C", min: 7 }] } },
        ),
      ),
    ],
    {
      settings: [
        range("g_sr_major_jump_preempt_range", "Preemptive jump response to a major", 6, 11),
      ],
    },
  ),

  auctionItem(
    "sr-major-1nt-forcing",
    "1NT over a major is FORCING",
    "The two ORANGE rows of slide 24. Row 5: 10–11 points with exactly THREE-card support responds 1NT — \"Forcing for one round, rebid 3M\" (example ♠Axx ♥KJx ♦xx ♣QJxxx). Row 6: 6–11 with NO support responds 1NT — \"Forcing, many types of hands, rebid will clarify\" (example ♠xxx ♥xx ♦AQJxxx ♣xx). Opener must bid again (see the companion forcing item), and responder's next call clarifies: the 10–11 three-support hand jumps to 3M, the others pass a cheap rebid, rebid their own long suit, or invite. The response deliberately promises NO support length — that is what lets the three-card raise appear on the next round.",
    "agreement",
    [
      ...MAJORS.map((m) =>
        rule(
          `forcing-1nt-three-support-${m}`,
          `Forcing 1NT over 1${SUIT_GLYPH[m]} (10–11, exactly three-card support)`,
          overMajor(m, false),
          all(
            len(m, 3, 3),
            hcp(low("g_sr_1nt_three_support_range"), high("g_sr_1nt_three_support_range")),
          ),
          bid(1, "N"),
          44,
          { shows: { hcp: { min: 10, max: 11 }, suits: [{ suit: m, max: 3 }], forcing: true } },
        ),
      ),
      ...MAJORS.map((m) =>
        rule(
          `forcing-1nt-no-support-${m}`,
          `Forcing 1NT over 1${SUIT_GLYPH[m]} (6–11, no support)`,
          overMajor(m, false),
          all(
            len(m, undefined, 2),
            hcp(low("g_sr_1nt_forcing_range"), high("g_sr_1nt_forcing_range")),
          ),
          bid(1, "N"),
          45,
          { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: m, max: 2 }], forcing: true } },
        ),
      ),
    ],
    {
      settings: [
        range("g_sr_1nt_forcing_range", "Forcing 1NT response (no support)", 6, 11),
        range("g_sr_1nt_three_support_range", "Forcing 1NT with three-card support", 10, 11),
      ],
    },
  ),

  // =========================================================================
  // B. The support × strength plan — slide 26
  // =========================================================================

  item(
    "sr-support-strength-plan",
    "Response to 1♠ and rebid plan (support × strength matrix)",
    "Slide 26 is the PLAN behind slide 24's table: rows are support length (two or fewer / three / four / five-plus), columns are strength (0–5 / 6–9 / 10–11 / 12+), and each cell carries the response AND what responder intends next. Two or fewer: 0–5 Pass, done; 6–9 1NT, partscore unless partner has a maximum; 10–11 1NT, game is still possible if partner has extras; 12+ a new suit at the two level (game force — \"which one?\"). Three-card support: 0–5 Pass (consider a raise); 6–9 2M, done; 10–11 1NT then 3M — MUST RAISE LATER; 12+ a new suit at the two level then 2M/3M — game force, MUST RAISE LATER. Four-card support: 0–5 Pass (consider a raise); 6–9 2M, done; 10–11 3M, done; 12+ 2NT Jacoby — game force, need a maximum for slam. Five-plus support: 0–5 and 6–9 4M, done; 10–11 and 12+ 2NT — game force, need a maximum for slam. Read it as a promise: the cells marked \"must raise later\" are the reason a forcing 1NT and a two-over-one deny nothing about support, and the reason opener must never pass them.",
    "judgment_guideline",
    "auction",
    { kind: "none" },
  ),

  auctionItem(
    "sr-delayed-raise-plan",
    "Showing the hidden raise on the next round",
    "The \"must raise later\" cells of slide 26, made mechanical. After a forcing 1NT with exactly three-card support and 10–11, responder rebids 3M over any cheap rebid — the plan slide 24 row 5 wrote down. After a two-over-one with three-card support and 12+, responder raises opener's first suit at the cheapest level: the auction is already a game force, so the raise only needs to locate the fit. Both rules test UNSHOWN support (responder holds three-plus cards but has promised none) or a known eight-card fit, which is exactly the partnership fact the matrix reasons about. The two-or-fewer-support 10–11 cell (\"game possible if partner has extras\") becomes a combined-strength test: bid 3NT once opener's rebid puts the partnership at 25+ points, the deck's notrump game target.",
    "agreement",
    [
      ...MAJORS.map((m) =>
        rule(
          `raise-after-forcing-1nt-${m}`,
          `Rebid 3${SUIT_GLYPH[m]} after the forcing 1NT (10–11, three-card support)`,
          ctx("responder", {
            opening: is(`1${m}`),
            ownFirst: is("1N"),
            partnerLast: bidAt({ min: 2, max: 3 }),
            contested: false,
          }),
          all(hcp(10, 11), any(unshown(m, 3), fit(m, 8))),
          bidSuit("partner_first_bid_suit", 3),
          30,
          { shows: { hcp: { min: 10, max: 11 }, suits: [{ suit: m, min: 3 }] } },
        ),
      ),
      ...MAJORS.map((m) =>
        rule(
          `raise-after-two-over-one-${m}`,
          `Show the raise after a two-over-one (12+, three-card support)`,
          ctx("responder", {
            opening: is(`1${m}`),
            ownFirst: bidAt({ level: 2, strains: ["C", "D", "H"] }),
            partnerLast: bidAt({ min: 2, max: 3 }),
            contested: false,
          }),
          all(hcp(12), any(unshown(m, 3), fit(m, 8))),
          bidSuit("partner_first_bid_suit"),
          31,
          { shows: { hcp: { min: 12 }, suits: [{ suit: m, min: 3 }], forcing: true } },
        ),
      ),
      ...MAJORS.map((m) =>
        rule(
          `game-when-partner-has-extras-${m}`,
          `3NT after the forcing 1NT when the partnership has 25+ (no support)`,
          ctx("responder", {
            opening: is(`1${m}`),
            ownFirst: is("1N"),
            partnerLast: bidAt({ min: 2, max: 3 }),
            contested: false,
          }),
          all(hcp(10, 11), len(m, undefined, 2), combHcp(low("g_sr_delayed_game_min"))),
          bid(3, "N"),
          34,
        ),
      ),
    ],
    {
      settings: [
        range("g_sr_delayed_game_min", "Combined points needed for 3NT", 25, 40, { min: 20 }),
      ],
    },
  ),

  // =========================================================================
  // C. Responder's first call over 1♣/1♦ — slide 27
  // =========================================================================

  auctionItem(
    "sr-minor-weak-jump-shifts",
    "Weak jump responses to 1♣/1♦: 2♥/2♠ and 3♥/3♠",
    "Slide 27 rows 10 and 11: with 6–11 points and a SIX-card major jump to 2♥/2♠ — \"Weak, like opening 6 card preempt in major\" (example ♠xx ♥AQJxxx ♦xxx ♣xx) — and with a SEVEN-plus card major jump to 3♥/3♠ — \"Weak, like opening 7 card preempt in major\" (example ♠x ♥AQJxxxx ♦xxx ♣xx). These jumps are the deck's choice and they are considered BEFORE the one-level major response, which is what makes them reachable at all: turn the toggle off and a six-card major responds 1♥/1♠ instead. The 6–11 band is the deck's own and is exposed as a setting for partnerships that want to keep the constructive top of it for a one-level response.",
    "convention",
    [
      ...MINORS.flatMap((mn) =>
        MAJORS.map((m) =>
          rule(
            `jump-3${m}-over-1${mn}`,
            `3${SUIT_GLYPH[m]} over 1${SUIT_GLYPH[mn]} (seven-card weak jump)`,
            overMinor(mn, false),
            all(len(m, 7), tp(low("g_sr_minor_jump_range"), high("g_sr_minor_jump_range"))),
            bid(3, m),
            21,
            { shows: { tp: { min: 6, max: 11 }, suits: [{ suit: m, min: 7 }] } },
          ),
        ),
      ),
      ...MINORS.flatMap((mn) =>
        MAJORS.map((m) =>
          rule(
            `jump-2${m}-over-1${mn}`,
            `2${SUIT_GLYPH[m]} over 1${SUIT_GLYPH[mn]} (six-card weak jump)`,
            overMinor(mn, false),
            all(len(m, 6), tp(low("g_sr_minor_jump_range"), high("g_sr_minor_jump_range"))),
            bid(2, m),
            22,
            { shows: { tp: { min: 6, max: 11 }, suits: [{ suit: m, min: 6 }] } },
          ),
        ),
      ),
    ],
    {
      settings: [
        toggle("g_sr_minor_weak_jumps_on", "Weak jump responses to a minor"),
        range("g_sr_minor_jump_range", "Weak jump response to a minor", 6, 11),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "sr-inverted-minor-raises",
    "Inverted minor raises: 2m strong, 3m weak",
    "Slide 27 rows 6 and 9 — the deck INVERTS the raises of 1♣/1♦. 2m shows 9+ points with FIVE-plus card support, is FORCING to 3m, and is \"searching for 3N\" (example ♠Kxx ♥Kxx ♦Ax ♣xxxxx). 3m is the WEAK raise, 6–9 with five-plus card support, because \"2m is reserved for stronger raise\" (example ♠Kxx ♥xx ♦xxx ♣KJxxx). The deck's two bands overlap at 9, and the stronger bid wins there (2m is considered first). Both raises deny a four-card major: the table's row order puts the 1♥/1♠ response above the raises, and every other row of this table that is not a major response carries the \"denies 4 card M\" note.",
    "convention",
    [
      ...MINORS.map((mn) =>
        rule(
          `inverted-strong-${mn}`,
          `2${SUIT_GLYPH[mn]} inverted raise (9+, five-card support, forcing to 3${SUIT_GLYPH[mn]})`,
          overMinor(mn, false),
          all(len(mn, 5), hcp(low("g_sr_inverted_strong_range")), NO_FOUR_CARD_MAJOR),
          raise(2),
          20,
          {
            shows: {
              hcp: { min: 9 },
              suits: [
                { suit: mn, min: 5 },
                { suit: "H", max: 3 },
                { suit: "S", max: 3 },
              ],
              forcing: true,
            },
          },
        ),
      ),
      ...MINORS.map((mn) =>
        rule(
          `inverted-weak-${mn}`,
          `3${SUIT_GLYPH[mn]} weak raise (6–9, five-card support)`,
          overMinor(mn, false),
          all(
            len(mn, 5),
            hcp(low("g_sr_inverted_weak_range"), high("g_sr_inverted_weak_range")),
            NO_FOUR_CARD_MAJOR,
          ),
          raise(3),
          22,
          {
            shows: {
              hcp: { min: 6, max: 9 },
              suits: [
                { suit: mn, min: 5 },
                { suit: "H", max: 3 },
                { suit: "S", max: 3 },
              ],
            },
          },
        ),
      ),
    ],
    {
      settings: [
        toggle("g_sr_inverted_minors_on", "Inverted minor raises"),
        range("g_sr_inverted_strong_range", "Inverted 2m raise from", 9, 40),
        range("g_sr_inverted_weak_range", "Weak 3m raise", 6, 9),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "sr-minor-major-response",
    "1♥/1♠ over 1♣/1♦: looking for a major fit",
    "Slide 27 row 2: 6+ points with a FOUR-plus card major responds 1♥/1♠ — \"Looking for a major fit\" (example ♠KQxx ♥xx ♦Axxxx ♣xx). The deck writes the row as \"1h/1s\" without saying which to choose when both majors qualify, so the rules bid the longer major, spades first when spades are five-plus and longest, and hearts on equal length (up the line). The response says nothing about strength beyond 6+ points: opener's rebid, and responder's second call, sort that out.",
    "agreement",
    [
      rule(
        "five-spades",
        "1♠ with five-plus spades",
        ctx("responder", { opening: MINOR_OPENING, partnerLast: MINOR_OPENING }),
        all(hcp(low("g_sr_minor_major_min")), len("S", 5), longestAmong("S")),
        bid(1, "S"),
        23,
        { shows: { hcp: { min: 6 }, suits: [{ suit: "S", min: 5 }] } },
      ),
      rule(
        "four-hearts",
        "1♥ with four-plus hearts (up the line)",
        ctx("responder", { opening: MINOR_OPENING, partnerLast: MINOR_OPENING }),
        all(
          hcp(low("g_sr_minor_major_min")),
          len("H", 4),
          // Hearts are the hand's longest suit, OR spades are no longer than
          // four — so 4-4 majors alongside a longer minor still go up the line
          // to 1♥ instead of being pushed into the 1♠ rule below.
          any(longestAmong("H"), len("S", undefined, 4)),
        ),
        bid(1, "H"),
        24,
        { shows: { hcp: { min: 6 }, suits: [{ suit: "H", min: 4 }] } },
      ),
      rule(
        "four-spades",
        "1♠ with four-plus spades",
        ctx("responder", { opening: MINOR_OPENING, partnerLast: MINOR_OPENING }),
        all(hcp(low("g_sr_minor_major_min")), len("S", 4)),
        bid(1, "S"),
        25,
        { shows: { hcp: { min: 6 }, suits: [{ suit: "S", min: 4 }] } },
      ),
    ],
    { settings: [range("g_sr_minor_major_min", "Major response to a minor from", 6, 40)] },
  ),

  auctionItem(
    "sr-minor-two-club-game-force",
    "2♣ over 1♦: game force with five-plus clubs",
    "Slide 27 row 7: with 12+ points and FIVE-plus clubs, respond 2♣ — \"Game force, over 1d only\" (example ♠xxx ♥KQx ♦Ax ♣Axxxx). Over 1♣ the same shape is the inverted 2♣ raise instead, which is why the deck restricts this row to 1♦ openings. The deck's own example is a 13-count, which the 3NT limit row (13–15, no four-card major) would also accept — the table gives it 2♣, so the game force is considered first.",
    "agreement",
    [
      rule(
        "two-clubs-gf",
        "2♣ game force over 1♦",
        overMinor("D", false),
        all(hcp(low("g_sr_minor_gf_range")), len("C", 5)),
        bid(2, "C"),
        27,
        { shows: { hcp: { min: 12 }, suits: [{ suit: "C", min: 5 }], forcing: true } },
      ),
    ],
    { settings: [range("g_sr_minor_gf_range", "2♣ game force over 1♦ from", 12, 40)] },
  ),

  auctionItem(
    "sr-one-diamond-response",
    "1♦ over 1♣ with four-plus diamonds",
    "Slide 27 row 8: 6+ points with four-plus diamonds responds 1♦, and the bid \"denies 4 card M unless strong enough to rebid it\" (example ♠xx ♥xxx ♦KQxx ♣Axxx). The deck's own example for this row is a 9-count with four diamonds, which the 6–9 1NT limit row would also accept — so the diamond response is considered before the notrump ladder. A four-card major always outranks it: the major response is bid first, and a hand strong enough to bid 1♦ and then rebid the major is opener's inference problem, not a separate rule.",
    "agreement",
    [
      rule(
        "one-diamond",
        "1♦ over 1♣ (four-plus diamonds, denies a four-card major)",
        overMinor("C"),
        all(hcp(low("g_sr_one_diamond_min")), len("D", 4), NO_FOUR_CARD_MAJOR),
        bid(1, "D"),
        30,
        {
          shows: {
            hcp: { min: 6 },
            suits: [
              { suit: "D", min: 4 },
              { suit: "H", max: 3 },
              { suit: "S", max: 3 },
            ],
          },
        },
      ),
    ],
    { settings: [range("g_sr_one_diamond_min", "1♦ response to 1♣ from", 6, 40)] },
  ),

  auctionItem(
    "sr-minor-notrump-ladder",
    "1NT / 2NT / 3NT over 1♣/1♦: limit bids that deny a four-card major",
    "Slide 27 rows 3, 4 and 5 — three LIMIT bids by HCP band, each with the note \"Limit bid, denies 4 card M\": 6–9 respond 1NT (example ♠Kxx ♥xxx ♦Axx ♣Jxxx), 10–12 respond 2NT (♠Kxx ♥Kxx ♦Axx ♣Jxxx), 13–15 respond 3NT (♠Kxx ♥Kxx ♦AKx ♣Jxxx). Note the bands: this deck's 2NT response to a minor is 10–12 and its 3NT is 13–15, narrower and lower than many Standard American tables, and each band is a setting. Because they are limit bids they end the description — opener may pass, and with a four-card major responder must bid the major instead.",
    "agreement",
    [
      rule(
        "three-nt",
        "3NT limit response (13–15, no four-card major)",
        ctx("responder", { opening: MINOR_OPENING, partnerLast: MINOR_OPENING, contested: false }),
        all(
          hcp(low("g_sr_minor_3nt_range"), high("g_sr_minor_3nt_range")),
          NO_FOUR_CARD_MAJOR,
        ),
        bid(3, "N"),
        32,
        {
          shows: {
            hcp: { min: 13, max: 15 },
            suits: [
              { suit: "H", max: 3 },
              { suit: "S", max: 3 },
            ],
          },
        },
      ),
      rule(
        "two-nt",
        "2NT limit response (10–12, no four-card major)",
        ctx("responder", { opening: MINOR_OPENING, partnerLast: MINOR_OPENING, contested: false }),
        all(
          hcp(low("g_sr_minor_2nt_range"), high("g_sr_minor_2nt_range")),
          NO_FOUR_CARD_MAJOR,
        ),
        bid(2, "N"),
        33,
        {
          shows: {
            hcp: { min: 10, max: 12 },
            suits: [
              { suit: "H", max: 3 },
              { suit: "S", max: 3 },
            ],
          },
        },
      ),
      rule(
        "one-nt",
        "1NT limit response (6–9, no four-card major)",
        ctx("responder", { opening: MINOR_OPENING, partnerLast: MINOR_OPENING }),
        all(
          hcp(low("g_sr_minor_1nt_range"), high("g_sr_minor_1nt_range")),
          NO_FOUR_CARD_MAJOR,
        ),
        bid(1, "N"),
        34,
        {
          shows: {
            hcp: { min: 6, max: 9 },
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
        range("g_sr_minor_1nt_range", "1NT response to a minor", 6, 9),
        range("g_sr_minor_2nt_range", "2NT response to a minor", 10, 12),
        range("g_sr_minor_3nt_range", "3NT response to a minor", 13, 15),
      ],
    },
  ),

  item(
    "sr-undiscussed-minor-responses",
    "Undiscussed responses to a minor: 1♣–2♦ and 1♦–3♣",
    "The last row of slide 27, in red: \"1c-2d, 1d-3c — Undiscussed, DON'T USE THEM!\". A jump to 2♦ over 1♣ and a jump to 3♣ over 1♦ have no agreed meaning in this system, so neither partner may guess one: 2♦ over 1♣ is not a weak jump (the weak jumps are in the majors), and 3♣ over 1♦ is not a raise (the raises are inverted, 2♦ strong and 3♦ weak). If the hand seems to want one of these calls, choose from the rows that ARE defined — a major response, an inverted raise, the notrump ladder, or a weak jump in a major. No bidding rule is written for them on purpose.",
    "concept",
    "auction",
    { kind: "none" },
  ),

  // =========================================================================
  // D. Forcing situations these slides create (pass is not an available call)
  // =========================================================================

  item(
    "sr-forcing-1nt-response",
    "The 1NT response to a major is forcing on opener",
    "Slide 24's orange 1NT rows are FORCING: after 1♥–1NT or 1♠–1NT, opener must bid again (the deck's slide 28 gives opener's whole rebid table for exactly this auction). Pass is not an available call. Responder may hold 10–11 with three-card support and a planned 3M rebid, or any 6–11 hand with no support, so passing 1NT can miss both a game and a major fit. Turn the toggle off to play 1NT semi-forcing or non-forcing instead.",
    "agreement",
    "auction",
    {
      kind: "forcing_rules",
      rules: MAJORS.map((m, i) =>
        forcing(
          `opener-must-bid-${m}`,
          `1${SUIT_GLYPH[m]}–1NT is forcing on opener`,
          ctx("opener", {
            opening: is(`1${m}`),
            partnerLast: is("1N"),
            contested: false,
            roundMax: 2,
          }),
          10 + i,
        ),
      ),
    },
    { settings: [toggle("g_sr_1nt_response_forcing", "1NT response to a major is forcing")] },
  ),

  item(
    "sr-forcing-two-over-one",
    "A two-over-one response forces the partnership to game",
    "The green rows of slide 24 are a GAME FORCE, and this deck is Standard American 2/1 GF, so the force binds both partners: opener must bid over responder's two-level new suit, and responder must bid again below game (the matrix on slide 26 spells out the obligation — \"GF, must raise later\"). Pass is not an available call in either seat until game is reached. Turn the toggle off for a partnership that plays two-over-one as merely forcing for one round.",
    "agreement",
    "auction",
    {
      kind: "forcing_rules",
      rules: [
        forcing(
          "opener-over-2x-1h",
          "1♥–2♣/2♦ forces opener",
          ctx("opener", {
            opening: is("1H"),
            partnerLast: bidAt({ level: 2, strains: ["C", "D"] }),
            contested: false,
            roundMax: 2,
          }),
          20,
        ),
        forcing(
          "opener-over-2x-1s",
          "1♠–2♣/2♦/2♥ forces opener",
          ctx("opener", {
            opening: is("1S"),
            partnerLast: bidAt({ level: 2, strains: ["C", "D", "H"] }),
            contested: false,
            roundMax: 2,
          }),
          21,
        ),
        forcing(
          "responder-below-game-1h",
          "After 1♥–2♣/2♦, responder bids again below game",
          ctx("responder", {
            opening: is("1H"),
            ownFirst: bidAt({ level: 2, strains: ["C", "D"] }),
            partnerLast: bidAt({ max: 3, strains: ["C", "D", "H", "S"] }),
            contested: false,
            roundMax: 3,
          }),
          22,
        ),
        forcing(
          "responder-below-game-1s",
          "After 1♠–2♣/2♦/2♥, responder bids again below game",
          ctx("responder", {
            opening: is("1S"),
            ownFirst: bidAt({ level: 2, strains: ["C", "D", "H"] }),
            partnerLast: bidAt({ max: 3, strains: ["C", "D", "H", "S"] }),
            contested: false,
            roundMax: 3,
          }),
          23,
        ),
      ],
    },
    {
      settings: [toggle("g_sr_two_over_one_forcing", "Two-over-one responses are game forcing")],
      sets: ["core"],
    },
  ),

  item(
    "sr-forcing-inverted-raise",
    "The inverted 2m raise is forcing to 3m",
    "Slide 27's inverted raise row says it in the note: 2♣ over 1♣ and 2♦ over 1♦ are \"forcing to 3m, searching for 3N\". Opener must bid over the raise, and responder must bid again if opener's rebid is below three of the minor — the partnership is committed to at least 3m while it looks for 3NT. Pass is not an available call there. The toggle follows the inverted-raise convention: without inverted raises there is nothing to force.",
    "agreement",
    "auction",
    {
      kind: "forcing_rules",
      rules: [
        ...MINORS.map((mn, i) =>
          forcing(
            `opener-over-inverted-${mn}`,
            `1${SUIT_GLYPH[mn]}–2${SUIT_GLYPH[mn]} forces opener`,
            ctx("opener", {
              opening: is(`1${mn}`),
              partnerLast: is(`2${mn}`),
              contested: false,
              roundMax: 2,
            }),
            30 + i,
          ),
        ),
        ...MINORS.map((mn, i) =>
          forcing(
            `responder-to-3${mn}`,
            `After 1${SUIT_GLYPH[mn]}–2${SUIT_GLYPH[mn]}, responder bids again below 3${SUIT_GLYPH[mn]}`,
            ctx("responder", {
              opening: is(`1${mn}`),
              ownFirst: is(`2${mn}`),
              partnerLast: bidAt({ max: 2 }),
              contested: false,
              roundMax: 3,
            }),
            32 + i,
          ),
        ),
      ],
    },
    {
      settings: [toggle("g_sr_inverted_forcing_to_3m", "Inverted 2m raise is forcing to 3m")],
      sets: ["conventions"],
    },
  ),
];

/** Slide(s) each item was authored from — install.ts turns these into citations. */
export const SUIT_RESPONSES_SLIDES: Record<string, number[]> = {
  "sr-responder-pass": [24, 26, 27],
  "sr-major-raises": [24, 25, 26],
  "sr-major-game-raise": [24, 25, 26],
  "sr-jacoby-2nt": [24, 25, 26],
  "sr-major-splinters": [24, 25],
  "sr-major-3nt-raise": [24, 25],
  "sr-major-two-over-one": [24, 25, 26],
  "sr-one-spade-over-one-heart": [24, 25],
  "sr-major-jump-preempts": [24],
  "sr-major-1nt-forcing": [24, 25, 26],
  "sr-support-strength-plan": [26],
  "sr-delayed-raise-plan": [24, 25, 26],
  "sr-minor-weak-jump-shifts": [27],
  "sr-inverted-minor-raises": [27],
  "sr-minor-major-response": [27],
  "sr-minor-two-club-game-force": [27],
  "sr-one-diamond-response": [27],
  "sr-minor-notrump-ladder": [27],
  "sr-undiscussed-minor-responses": [27],
  "sr-forcing-1nt-response": [24, 25],
  "sr-forcing-two-over-one": [24, 26],
  "sr-forcing-inverted-raise": [27],
};
