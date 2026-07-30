// Openings — the spine of the teaching deck. Authored from slide 16 (the
// five-column opening table: Points | Suit length | Bid | Note | Example),
// slide 17 (the opening-bid decision tree, which supplies every tie-break the
// table leaves implicit) and slide 15 (the point requirements every later
// chapter reasons against). Length points come from slide 32's table
// (4 cards = 0, 5 = 1, 6 = 2, 7 = 3), which is exactly what `tp()` computes —
// so the deck's "Points" column for the one-level openings is authored as
// total points, while the preempt and pass rows are authored as HIGH-CARD
// points (the deck's own examples force that reading: a 6-HCP eight/nine-card
// suit opens at the four level, and that hand is only 10-11 total points).
//
// BAND DISCIPLINE (same as the SAYC chapters): the artificial 2♣ and the three
// preempt families are `convention` (band 1 — considered before the naturals)
// and each carries an enable toggle; the natural ladder is `agreement` and the
// opening pass is `bidding_rule` (both band 2). Because band 1 is considered
// first, every preempt rule also carries `BELOW_OPENING_VALUES` — slide 17
// tests strength BEFORE shape, so a hand with one-level opening values never
// preempts (see the constant's comment for the deck's worked examples).
// Within band 2 the priorities re-create slide 17's flowchart ORDER exactly:
//
//   2NT (19) → 1NT (20)            strength+shape test first, so a balanced
//                                  5332 with a five-card major and 15-17 HCP
//                                  opens 1NT, as the flowchart demands
//   1♠ (30) → 1♥ (31)              longest suit 5+, ties to the higher suit
//   1♦ (32) → 1♣ (33)              a five-card minor is still "1 of longest"
//   1♦ with 4 diamonds (34)
//   1♣ with 3+ clubs (35)
//   1♦ with exactly 4=4=3=2 (36)   the flowchart's named exception
//   pass (90-92)
//
// A balanced 12-14 or 18-19 has no notrump slot in this deck: it falls through
// to the suit ladder and "rebids will clarify" (slide 16's own note).

import {
  all,
  auctionItem,
  bal,
  bid,
  ctx,
  forcing,
  hcp,
  high,
  is,
  item,
  len,
  longestAmong,
  low,
  not,
  pass,
  range,
  rule,
  toggle,
  tp,
  type TemplateItem,
} from "@bridge/sayc-template/dsl";

/** 12-21 total points, the one-level opening band shared by every suit rule. */
const OPENING_RANGE_SETTING = "g_open_1suit_range";

/**
 * Slide 17 tests STRENGTH before shape: ">11? (12-21) → shape branch", and only
 * a hand that fails that test reaches "6-11: 6+ card suit? → preempt". So a
 * hand that already has one-level opening values never preempts, however long
 * its suit — which is what the deck's own worked examples say: slide 34's
 * AQxxxx, xxx, AJxx, void ("11 hcp, 13 distr → open 1S") and slide 32's
 * AQ8543, KQT98, 6, 5 ("14 → safe 1S") are 11-HCP hands with a six-card suit
 * that the deck opens at the ONE level. Without this guard the preempt band
 * (band 1, considered first) would take them at the two level. All three of
 * slide 16's preempt examples still preempt: their total points are 9, 9 and
 * 10-11 respectively, all below the floor.
 */
const BELOW_OPENING_VALUES = not(tp(low(OPENING_RANGE_SETTING)));

export const OPENINGS: TemplateItem[] = [
  // -------------------------------------------------------------------------
  // Slide 15 — the point requirements the whole system aims at
  // -------------------------------------------------------------------------
  item(
    "open-point-requirements",
    "Point requirements for game, slam and grand slam",
    "Count points A=4, K=3, Q=2, J=1. The partnership's combined target for each contract: 26 points and eight-plus trumps for 4♥/4♠; 25-26 points with stoppers in all suits for 3NT; 29 points and eight-plus trumps for 5♣/5♦; 32-33 points and eight-plus trumps for a small slam; 37 points and eight-plus trumps for a grand slam. Every response, rebid and slam decision in this system is a step towards deciding which of those thresholds the two hands can reach — a bid is worth making when it helps locate the threshold, and the auction stops in a partial when none of them is in range.",
    "concept",
    "auction",
    { kind: "none" },
  ),

  // -------------------------------------------------------------------------
  // Slide 16 footnote + slide 17 — what "balanced" means in this deck
  // -------------------------------------------------------------------------
  item(
    "open-balanced-definition",
    "What \"balanced\" means in this system",
    "The deck defines balanced in a footnote to the opening table: no singleton (and no void), and no two-or-more doubletons. That is exactly three shapes — 4=3=3=3, 4=4=3=2 and 5=3=3=2 — and slide 17's decision tree names those three shapes at the balanced test. A 5=4=2=2 hand is NOT balanced here (two doubletons), and neither is any hand with a stiff, however flat the rest of it looks. The notrump openings (1NT and 2NT) and the notrump limit bids that answer them all rest on this definition, so a partnership that plays a looser \"balanced\" changes the meaning of every notrump call in the system.",
    "concept",
    "auction",
    { kind: "none" },
  ),

  // -------------------------------------------------------------------------
  // Slide 17 — the decision tree's ORDER, which the priorities implement
  // -------------------------------------------------------------------------
  item(
    "open-decision-order",
    "Order of the opening-bid decision",
    "Slide 17 walks the opening decision as a flowchart, and the order matters more than any single row. First strength: 22+ points opens the strong, artificial 2♣; under 6 points passes; 6-11 points opens a preempt with a six-card-or-longer suit and otherwise passes. Only a 12-21 hand reaches the shape branch. There, the BALANCED test comes before the suit-length test: a balanced hand with 15-17 opens 1NT and a balanced hand with 20-21 opens 2NT — so a 5=3=3=2 hand with a five-card major and 16 HCP opens 1NT, not 1♠. A balanced 12-14 or 18-19 has no notrump slot in this deck and continues down the suit branch, where \"rebids will clarify\". If the longest suit is five cards or longer, open one of it, breaking a tie in favour of the HIGHER-ranking suit. With at most four cards in every suit (4=3=3=3, 4=4=3=2, 4=4=4=1), open 1♦ holding four diamonds; otherwise open 1♣ holding three or more clubs; the one hand left over is exactly 4=4=3=2 with three diamonds and two clubs, which opens 1♦.",
    "concept",
    "auction",
    { kind: "none" },
  ),

  // -------------------------------------------------------------------------
  // Slide 16, rows 6-7 (with slide 17's balanced-first ordering) — notrump
  // -------------------------------------------------------------------------
  auctionItem(
    "open-2nt",
    "2NT opening",
    "Open 2NT with a balanced 20-21. The deck files this row under \"Limited\": unlike the one-level suit openings, the bid pins the hand to a two-point band, and responder can place the contract immediately. Balanced here is the deck's own definition — no singleton, no two-or-more doubletons (slide 16's footnote).",
    "agreement",
    [
      rule(
        "open",
        "Open 2NT",
        ctx("opening"),
        all(bal(), hcp(low("g_open_2n_range"), high("g_open_2n_range"))),
        bid(2, "N"),
        19,
        { shows: { hcp: { min: 20, max: 21 } } },
      ),
    ],
    {
      settings: [range("g_open_2n_range", "2NT opening range (HCP)", 20, 21, { min: 18, max: 24 })],
    },
  ),

  auctionItem(
    "open-1nt",
    "1NT opening",
    "Open 1NT with a balanced 15-17 and no five-card major. A \"Limited\" bid: the range is two points wide, so responder becomes captain of the auction.\n\nTHE FIVE-CARD-MAJOR QUESTION, AND HOW IT IS RESOLVED HERE. Slide 17's flowchart tests \"Balanced (4333, 4432, 5332)?\" before it tests suit length, which looks at first like it routes a 15-17 hand with five spades to 1NT. But slide 18 says plainly \"1N Opener has 2-4 cards in any major\", and slide 19's header repeats it: \"15-17, balanced, no 5 card major\". Those two statements are unhedged, and the whole response structure on slides 18-22 depends on them — Stayman asks about a four-card major precisely because opener cannot hold five. The readings reconcile once you notice that 5=3=3=2 also covers a five-card MINOR, which 1NT may certainly hold. So the flowchart's 5332 is about minors, and this item opens 1NT only with at most four cards in each major; a 15-17 balanced hand with a five-card major opens one of that major instead.\n\nContrast slide 23, whose 2NT header hedges — \"usually no 5 card major\" — so the 2NT opening is deliberately NOT restricted this way. If your partnership prefers to open 1NT on 5=3=3=2 with a five-card major, raise the \"longest major\" dial to 5 rather than editing this rule.",
    "agreement",
    [
      rule(
        "open",
        "Open 1NT",
        ctx("opening"),
        all(
          bal(),
          hcp(low("g_open_1n_range"), high("g_open_1n_range")),
          len("S", undefined, { $setting: "g_open_1n_max_major" }),
          len("H", undefined, { $setting: "g_open_1n_max_major" }),
        ),
        bid(1, "N"),
        20,
        { shows: { hcp: { min: 15, max: 17 }, suits: [{ suit: "S", max: 4 }, { suit: "H", max: 4 }] } },
      ),
    ],
    {
      settings: [
        range("g_open_1n_range", "1NT opening range (HCP)", 15, 17, { min: 10, max: 22 }),
        {
          key: "g_open_1n_max_major",
          label: "Longest major allowed in a 1NT opening",
          control: "number",
          role: "parameter",
          default: 4,
          min: 4,
          max: 5,
          description:
            "Slides 18 and 19 both say the 1NT opener holds no five-card major, so the default is 4. Set to 5 to follow slide 17's shape list literally and open 1NT on a balanced hand with a five-card major.",
        },
      ],
    },
  ),

  // -------------------------------------------------------------------------
  // Slide 16, row 5 — the strong, artificial, FORCING 2♣ (red on the slide)
  // -------------------------------------------------------------------------
  auctionItem(
    "open-strong-2c",
    "Strong artificial 2♣ opening",
    "Every hand of 22 or more HIGH-CARD points opens 2♣, whatever its shape — the deck's table prints the bid in red and notes it \"Strong, forcing\". 2♣ says nothing about clubs, and it is the reason no other opening promises more than 21: 2♣ is reserved for these hands, which is also why the six-card preempt family starts at 2♦ and a six-card CLUB suit has no weak opening at all.\n\nWHY HIGH-CARD POINTS AND NOT TOTAL POINTS: the deck prints one \"Points\" column for the whole table, so the measure has to be read from context. 2♣ sits in the limited/balanced family with 1NT (15-17) and 2NT (20-21), which are unarguably high-card ranges. Counting length points here instead would let a balanced 21-HCP hand with any five-card suit reach 22 and open 2♣, which would take almost every five-card-suit hand away from the 2NT row the slide reserves for it. The one-level suit openings DO use total points, because slide 32 discusses length points specifically to settle whether a marginal hand is worth opening one of a suit.",
    "convention",
    [
      rule(
        "open",
        "Open a strong 2♣",
        ctx("opening"),
        hcp(low("g_open_2c_range"), high("g_open_2c_range")),
        bid(2, "C"),
        10,
        { shows: { hcp: { min: 22 }, forcing: true } },
      ),
    ],
    {
      settings: [
        toggle("g_open_2c_on", "Strong artificial 2♣ opening"),
        range("g_open_2c_range", "Strong 2♣ opening range (HCP)", 22, 40, {
          min: 18,
          max: 40,
        }),
      ],
      sets: ["core", "conventions"],
    },
  ),

  item(
    "open-2c-forcing",
    "The strong 2♣ may not be passed",
    "Slide 16 calls the 2♣ opening \"Strong, forcing\": responder must bid, however weak the hand. Pass is not an available call over partner's uncontested 2♣ opening, so with nothing to say responder makes the cheapest waiting call rather than dropping the auction at the two level opposite 22+ points.",
    "agreement",
    "auction",
    {
      kind: "forcing_rules",
      rules: [
        forcing(
          "responder-must-answer-2c",
          "Responder may not pass the strong 2♣ opening",
          ctx("responder", { opening: is("2C"), partnerLast: is("2C"), contested: false }),
          10,
        ),
      ],
    },
    { sets: ["core", "conventions"] },
  ),

  // -------------------------------------------------------------------------
  // Slide 16, row 8 + slide 17's "longest suit 5+, tie to the higher" branch
  // -------------------------------------------------------------------------
  auctionItem(
    "open-1-major",
    "One-level major openings (five-card majors)",
    "Open 1♥/1♠ with 12-21 points and a five-card or longer major, when that major is the longest suit — the deck's note for the row is \"Rebids will clarify\", because unlike the notrump openings the range is a full ten points wide and the second bid narrows it (slide 31 splits opener into min 12-14 / medium 15-17 / max 18+). Slide 17 supplies the tie-break: with two equally long suits open one of the HIGHER-ranking, so 5-5 in the majors opens 1♠ and 5-5 in spades and a minor also opens 1♠. When the longer suit is a minor the deck opens that minor instead (six clubs and five spades is 1♣), and a balanced 15-17 or 20-21 has already been taken by the notrump openings. Points here include slide 32's length points, so an 11-HCP hand with a good six-card suit reaches the 12-point floor.",
    "agreement",
    [
      rule(
        "one-spade",
        "Open 1♠ with five-plus spades",
        ctx("opening"),
        all(
          tp(low(OPENING_RANGE_SETTING), high(OPENING_RANGE_SETTING)),
          len("S", 5),
          longestAmong("S"),
        ),
        bid(1, "S"),
        30,
        { shows: { tp: { min: 12, max: 21 }, suits: [{ suit: "S", min: 5 }] } },
      ),
      rule(
        "one-heart",
        "Open 1♥ with five-plus hearts",
        ctx("opening"),
        all(
          tp(low(OPENING_RANGE_SETTING), high(OPENING_RANGE_SETTING)),
          len("H", 5),
          longestAmong("H"),
        ),
        bid(1, "H"),
        31,
        { shows: { tp: { min: 12, max: 21 }, suits: [{ suit: "H", min: 5 }] } },
      ),
    ],
    {
      settings: [
        range(OPENING_RANGE_SETTING, "One-level suit opening range (total points)", 12, 21, {
          min: 10,
          max: 24,
        }),
      ],
    },
  ),

  // -------------------------------------------------------------------------
  // Slide 16, row 9 + slide 17's minor-selection branch
  // -------------------------------------------------------------------------
  auctionItem(
    "open-1-minor",
    "One-level minor openings (three-plus card minor)",
    "Open 1♣/1♦ with 12-21 points when no major qualifies; the row's note is again \"Rebids will clarify\", and the bid promises as few as THREE cards in the suit. Slide 17 gives the exact selection. With a five-card-or-longer minor as the longest suit, open one of it (ties to the higher-ranking suit, so 5-5 in the minors is 1♦). With at most four cards in every suit — 4=3=3=3, 4=4=3=2 or 4=4=4=1 — open 1♦ holding four diamonds; otherwise open 1♣ holding three or more clubs (the deck lists 4=4=2=3, (34)=3=3, 4=4=1=4, (34)=2=4 and (33,42)=3=4); the single hand that answers neither test is exactly 4=4=3=2 with three diamonds and two clubs, and it opens 1♦ on a three-card suit.",
    "agreement",
    [
      rule(
        "five-card-diamonds",
        "Open 1♦ with a five-plus card diamond suit",
        ctx("opening"),
        all(
          tp(low(OPENING_RANGE_SETTING), high(OPENING_RANGE_SETTING)),
          len("D", 5),
          longestAmong("D"),
        ),
        bid(1, "D"),
        32,
        { shows: { tp: { min: 12, max: 21 }, suits: [{ suit: "D", min: 5 }] } },
      ),
      rule(
        "five-card-clubs",
        "Open 1♣ with a five-plus card club suit",
        ctx("opening"),
        all(
          tp(low(OPENING_RANGE_SETTING), high(OPENING_RANGE_SETTING)),
          len("C", 5),
          longestAmong("C"),
        ),
        bid(1, "C"),
        33,
        { shows: { tp: { min: 12, max: 21 }, suits: [{ suit: "C", min: 5 }] } },
      ),
      rule(
        "four-diamonds",
        "Open 1♦ with four diamonds and no five-card suit",
        ctx("opening"),
        all(
          tp(low(OPENING_RANGE_SETTING), high(OPENING_RANGE_SETTING)),
          len("own_longest_suit", undefined, 4),
          len("D", 4),
        ),
        bid(1, "D"),
        34,
        { shows: { tp: { min: 12, max: 21 }, suits: [{ suit: "D", min: 4 }] } },
      ),
      rule(
        "three-clubs",
        "Open 1♣ with three-plus clubs and no five-card suit",
        ctx("opening"),
        all(
          tp(low(OPENING_RANGE_SETTING), high(OPENING_RANGE_SETTING)),
          len("own_longest_suit", undefined, 4),
          len("C", 3),
        ),
        bid(1, "C"),
        35,
        { shows: { tp: { min: 12, max: 21 }, suits: [{ suit: "C", min: 3 }] } },
      ),
      rule(
        "four-four-three-two",
        "Open 1♦ with exactly 4=4=3=2",
        ctx("opening"),
        all(
          tp(low(OPENING_RANGE_SETTING), high(OPENING_RANGE_SETTING)),
          len("S", 4, 4),
          len("H", 4, 4),
          len("D", 3, 3),
          len("C", 2, 2),
        ),
        bid(1, "D"),
        36,
        { shows: { tp: { min: 12, max: 21 }, suits: [{ suit: "D", min: 3 }] } },
      ),
    ],
  ),

  // -------------------------------------------------------------------------
  // Slide 16, rows 2-4 — the preempt family, opened on HIGH-CARD points
  // -------------------------------------------------------------------------
  auctionItem(
    "open-preempt-2",
    "Weak two-level preempts (six-card suit)",
    "With 6-11 high-card points and a six-card suit, open 2♦/2♥/2♠ — the deck's note is simply \"Weak preempt\" (example AQxxxx, Jx, xxx, xx). The three preempt rows are highlighted as one family on the slide; they are not forcing and partner is entitled to pass. Two deck choices are worth naming. First, the requirement is POINTS and LENGTH only: no suit-quality test appears anywhere in the table, so tighten the range if you want more discipline. Second, there is no six-card CLUB preempt: 2♣ is reserved for the strong hand, so a 6-11 hand whose only long suit is six clubs passes. Ties go to the higher-ranking suit. One boundary the flowchart settles: slide 17 tests strength BEFORE shape, so a hand that already counts 12 points once slide 32's length points are added opens ONE of the suit instead — the deck's own examples are AQxxxx, xxx, AJxx, void (slide 34: \"11 hcp, 13 distr → open 1S\") and AQ8543, KQT98, 6, 5 (slide 32: \"14 → safe 1S\").",
    "convention",
    [
      rule(
        "two-spades",
        "Open 2♠ with a six-card spade suit",
        ctx("opening"),
        all(
          hcp(low("g_open_preempt2_range"), high("g_open_preempt2_range")),
          BELOW_OPENING_VALUES,
          len("S", 6, 6),
          longestAmong("S"),
        ),
        bid(2, "S"),
        20,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "S", min: 6, max: 6 }] } },
      ),
      rule(
        "two-hearts",
        "Open 2♥ with a six-card heart suit",
        ctx("opening"),
        all(
          hcp(low("g_open_preempt2_range"), high("g_open_preempt2_range")),
          BELOW_OPENING_VALUES,
          len("H", 6, 6),
          longestAmong("H"),
        ),
        bid(2, "H"),
        21,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "H", min: 6, max: 6 }] } },
      ),
      rule(
        "two-diamonds",
        "Open 2♦ with a six-card diamond suit",
        ctx("opening"),
        all(
          hcp(low("g_open_preempt2_range"), high("g_open_preempt2_range")),
          BELOW_OPENING_VALUES,
          len("D", 6, 6),
          longestAmong("D"),
        ),
        bid(2, "D"),
        22,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "D", min: 6, max: 6 }] } },
      ),
    ],
    {
      settings: [
        toggle("g_open_preempt2_on", "Weak two-level preempts"),
        range("g_open_preempt2_range", "Two-level preempt range (HCP)", 6, 11, {
          min: 0,
          max: 15,
        }),
      ],
      sets: ["core", "conventions"],
    },
  ),

  auctionItem(
    "open-preempt-3",
    "Three-level preempts (seven-card suit)",
    "With 6-11 high-card points and a seven-card suit, open at the three level — 3♣/3♦/3♥/3♠, clubs included (example xx, KJTxxxx, x, Qxx). \"Weak preempt\" again: points and length only, no suit-quality or playing-trick test, and no adjustment for vulnerability anywhere in the deck's table. Ties go to the higher-ranking suit. The row is highlighted with the other two preempt rows as one family, but its note says \"Weak preempt\", so this is NOT a forcing bid: partner is entitled to pass. As with the two-level preempt, slide 17's strength-first order means a hand that reaches 12 points once slide 32's length points are counted opens one of the suit instead.",
    "convention",
    [
      rule(
        "three-spades",
        "Open 3♠ with a seven-card spade suit",
        ctx("opening"),
        all(
          hcp(low("g_open_preempt3_range"), high("g_open_preempt3_range")),
          BELOW_OPENING_VALUES,
          len("S", 7, 7),
          longestAmong("S"),
        ),
        bid(3, "S"),
        25,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "S", min: 7, max: 7 }] } },
      ),
      rule(
        "three-hearts",
        "Open 3♥ with a seven-card heart suit",
        ctx("opening"),
        all(
          hcp(low("g_open_preempt3_range"), high("g_open_preempt3_range")),
          BELOW_OPENING_VALUES,
          len("H", 7, 7),
          longestAmong("H"),
        ),
        bid(3, "H"),
        26,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "H", min: 7, max: 7 }] } },
      ),
      rule(
        "three-diamonds",
        "Open 3♦ with a seven-card diamond suit",
        ctx("opening"),
        all(
          hcp(low("g_open_preempt3_range"), high("g_open_preempt3_range")),
          BELOW_OPENING_VALUES,
          len("D", 7, 7),
          longestAmong("D"),
        ),
        bid(3, "D"),
        27,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "D", min: 7, max: 7 }] } },
      ),
      rule(
        "three-clubs",
        "Open 3♣ with a seven-card club suit",
        ctx("opening"),
        all(
          hcp(low("g_open_preempt3_range"), high("g_open_preempt3_range")),
          BELOW_OPENING_VALUES,
          len("C", 7, 7),
          longestAmong("C"),
        ),
        bid(3, "C"),
        28,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "C", min: 7, max: 7 }] } },
      ),
    ],
    {
      settings: [
        toggle("g_open_preempt3_on", "Three-level preempts"),
        range("g_open_preempt3_range", "Three-level preempt range (HCP)", 6, 11, {
          min: 0,
          max: 15,
        }),
      ],
      sets: ["core", "conventions"],
    },
  ),

  auctionItem(
    "open-preempt-4",
    "Four-level preempts (eight-card suit)",
    "With 6-11 high-card points and an eight-card-or-longer suit, open at the four level — 4♣/4♦/4♥/4♠. The deck's own example for this row is a NINE-card suit (x, xx, KQJTxxxxx, xx), which is what settles the reading of the \"Points\" column for the preempt family: that hand has 6 high-card points but 10-11 total points, so the 6-11 band can only be high cards. Ties go to the higher-ranking suit. This row too is highlighted rather than forcing — the note is \"Weak preempt\" — and it too yields to a hand that reaches 12 points on slide 32's length points, which opens one of the suit under slide 17's strength-first order.",
    "convention",
    [
      rule(
        "four-spades",
        "Open 4♠ with an eight-plus card spade suit",
        ctx("opening"),
        all(
          hcp(low("g_open_preempt4_range"), high("g_open_preempt4_range")),
          BELOW_OPENING_VALUES,
          len("S", 8),
          longestAmong("S"),
        ),
        bid(4, "S"),
        30,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "S", min: 8 }] } },
      ),
      rule(
        "four-hearts",
        "Open 4♥ with an eight-plus card heart suit",
        ctx("opening"),
        all(
          hcp(low("g_open_preempt4_range"), high("g_open_preempt4_range")),
          BELOW_OPENING_VALUES,
          len("H", 8),
          longestAmong("H"),
        ),
        bid(4, "H"),
        31,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "H", min: 8 }] } },
      ),
      rule(
        "four-diamonds",
        "Open 4♦ with an eight-plus card diamond suit",
        ctx("opening"),
        all(
          hcp(low("g_open_preempt4_range"), high("g_open_preempt4_range")),
          BELOW_OPENING_VALUES,
          len("D", 8),
          longestAmong("D"),
        ),
        bid(4, "D"),
        32,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "D", min: 8 }] } },
      ),
      rule(
        "four-clubs",
        "Open 4♣ with an eight-plus card club suit",
        ctx("opening"),
        all(
          hcp(low("g_open_preempt4_range"), high("g_open_preempt4_range")),
          BELOW_OPENING_VALUES,
          len("C", 8),
          longestAmong("C"),
        ),
        bid(4, "C"),
        33,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "C", min: 8 }] } },
      ),
    ],
    {
      settings: [
        toggle("g_open_preempt4_on", "Four-level preempts"),
        range("g_open_preempt4_range", "Four-level preempt range (HCP)", 6, 11, {
          min: 0,
          max: 15,
        }),
      ],
      sets: ["core", "conventions"],
    },
  ),

  // -------------------------------------------------------------------------
  // Slide 16, row 1 + slide 17's two pass exits
  // -------------------------------------------------------------------------
  auctionItem(
    "open-pass",
    "Opening pass",
    "Pass with fewer than 6 points (example Kxx, xx, Qxxx, xxxx). Slide 17's flowchart tests strength BEFORE shape, so a hand under 6 high-card points passes even holding a long suit — the preempt family starts at 6. The flowchart's second pass exit is the 6-11 hand with no six-card suit: there is nothing to preempt with, so pass. A third case follows from 2♣ being reserved for strong hands: a 6-11 hand whose only long suit is exactly six clubs has no available preempt (the six-card row offers 2♦/2♥/2♠ only) and passes too.",
    "bidding_rule",
    [
      rule(
        "pass-under-six",
        "Pass with fewer than six points",
        ctx("opening"),
        hcp(undefined, 5),
        pass,
        90,
      ),
      rule(
        "pass-no-long-suit",
        "Pass 6-11 with no six-card suit",
        ctx("opening"),
        all(hcp(6, 11), len("own_longest_suit", undefined, 5)),
        pass,
        91,
      ),
      rule(
        "pass-six-clubs",
        "Pass 6-11 with only a six-card club suit (no 2♣ preempt available)",
        ctx("opening"),
        all(
          hcp(6, 11),
          len("C", 6, 6),
          len("S", undefined, 5),
          len("H", undefined, 5),
          len("D", undefined, 5),
        ),
        pass,
        92,
      ),
    ],
  ),
];

/** Slide(s) each item was authored from — install.ts turns these into citations. */
export const OPENINGS_SLIDES: Record<string, number[]> = {
  "open-point-requirements": [15],
  "open-balanced-definition": [16, 17],
  "open-decision-order": [17],
  "open-2nt": [16, 17],
  "open-1nt": [16, 17],
  "open-strong-2c": [16, 17],
  "open-2c-forcing": [16],
  "open-1-major": [16, 17, 32],
  "open-1-minor": [16, 17, 32],
  "open-preempt-2": [16, 17, 32, 34],
  "open-preempt-3": [16, 17, 32],
  "open-preempt-4": [16, 17, 32],
  "open-pass": [16, 17],
};
