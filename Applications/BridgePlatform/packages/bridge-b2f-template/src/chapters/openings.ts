// Openings — the spine of the training notes. Authored from page 10's opening
// list ("Most common opening Bids (12+ pts)"), page 1's suit-length conventions
// (which are what license a 1♣/1♦ opening on three cards), page 3's statement of
// OPENER'S three point bands, and page 5's preempt/sacrifice discipline.
//
// WHAT "POINTS" MEANS HERE. The notes write "pts" everywhere and never once
// mention length, distribution or dummy points — the words do not appear on any
// of the 32 pages, and page 31's bid-by-bid walkthrough prints a plain
// "Points 12-21" against a 1♣ opening. So every rule in this chapter is authored
// on HIGH-CARD points (`hcp`), not on `tp`. That is a real difference from the
// repo's girkar template, whose slide 32 discusses length points explicitly and
// whose one-level openings are therefore authored as total points.
//
// BAND DISCIPLINE. Only ONE item here is a `convention` (band 1, considered
// first): the strong, artificial 2♣, which page 2 names in its list of
// conventional bids. Everything else on page 10 is natural — a 2♥ preempt shows
// hearts, 1♦ shows diamonds — and page 2's list of conventions pointedly does
// NOT include the preempts, so they are `agreement`/`core` (band 2) with no
// enable toggle, and the opening pass is `bidding_rule`. `concept` and
// `judgment_guideline` items compile into no band at all: they are the notes'
// teaching text and produce no rules.
//
// Because the preempts sit in band 2 alongside the naturals, the priorities
// inside band 2 re-create page 10's LIST ORDER exactly, top to bottom:
//
//   2NT (20) → 1NT (21)        balanced first, so a 15-17 balanced hand with a
//                              FIVE-CARD MAJOR opens 1NT — page 10 says "EVEN
//                              WITH 5M" outright (see open-1nt)
//   1♠ (30) 1♥ (31) 1♦ (32) 1♣ (33)     longest suit 5+, ties to the higher
//   1♦/1♣ by minor length (40-43)       the "default" row: longer minor
//   preempts (50-63)                    the 6-11 row, 6/7/8-card ladder
//   pass (90-92)
//
// Ordering the 6-11 preempts AFTER the 12+ naturals means no hand ever needs a
// "below opening values" guard: the two point bands are disjoint (6-11 vs 12+)
// because both are measured in HCP. The girkar chapter needs such a guard only
// because its openings are counted in total points and its preempts in HCP.
//
// A balanced 12-14 or 18-19 has no notrump slot in this system (1NT is 15-17,
// 2NT is 20-21), so it falls through to the suit ladder and the rebid clarifies.

import {
  all,
  any,
  auctionItem,
  bal,
  bid,
  ctx,
  hcp,
  high,
  item,
  len,
  longestAmong,
  low,
  pass,
  range,
  rule,
  toggle,
  type TemplateItem,
} from "@bridge/sayc-template/dsl";

/**
 * Opener's three bands (page 3). The one-level suit openings read the FLOOR of
 * the low band and the CEILING of the high band, because page 3's sentence is
 * exactly a partition of the opening range: "As a 1M or 1m OPENER, consider your
 * ranges as low (12-15), medium (16-18), high (19-21)". Moving the boundary
 * therefore moves the opening range with it, which is what the notes mean.
 */
const BAND_LOW = "b_open_band_low";
const BAND_MED = "b_open_band_med";
const BAND_HIGH = "b_open_band_high";

/** 12-21 HCP: the floor of the low band through the ceiling of the high band. */
const OPENING_STRENGTH = hcp(low(BAND_LOW), high(BAND_HIGH));

/** No suit longer than four — the "default" row's entry condition. */
const NO_FIVE_CARD_SUIT = len("own_longest_suit", undefined, 4);

export const OPENINGS: TemplateItem[] = [
  // -------------------------------------------------------------------------
  // Page 3 — opener's bands, and CONTRADICTION B
  // -------------------------------------------------------------------------
  item(
    "open-opener-bands",
    "Opener's three point bands (12-15 / 16-19 / 20-21)",
    "Page 3 tells opener to think in three bands and to narrow the band with every subsequent bid: \"As a 1M or 1m OPENER, consider your ranges as low, medium and high. Your next bid should narrow your point range, i.e. bid at the right level.\" Those bands are the axis the whole rebid structure turns on, and they are also the reason a one-level suit opening spans 12-21: the three bands together ARE the opening range.\n\nTHE DOCUMENT CONTRADICTS ITSELF ABOUT WHERE THE BANDS DIVIDE, AND THIS ITEM ENCODES THE MAJORITY READING. PAGE 3 says low 12-15, medium 16-18, high 19-21, and it says so exactly once, in that one prose sentence — the page never restates the bands. THREE other pages say low 12-15, medium 16-19, high 20-21: page 11's opener's-rebid tables (\"12-15 → pass 2M / 16-19 → raise to 3M / 20-21 → raise to 4M\"), page 14's three-column summary table whose header is printed \"Low (12 - 15 pts) | Med (16 - 19 pts) | High (20 - 21 pts, GF)\", and the footer of page 31's worked auction (\"Opener ranges: 12-15, 16-19, 20-21\"). Three pages against one, and the three include both of the document's summary tables, so 12-15 / 16-19 / 20-21 is what this template encodes — it is also the reading every other chapter's rebid rules are written against.\n\nThe disagreement is ONE boundary: does a 19-point hand belong to the medium band or the high band? Under the encoded reading it is medium (16-19) and a game-forcing 20 is the floor of the high band; under page 3's prose reading 19 is high and already game-forcing. The MEDIUM and HIGH dials below are that boundary: to follow page 3's prose instead, set the medium band to 16-18 and the high band to 19-21 and nothing else changes. Note that the notes also narrow the LOW band from inside: page 31's 1NT rebid is given as 12-14, not 12-15, and page 14's LOW column prints the same figure (\"1N (2-3b, 12-14pts)\"), so the low band's top point behaves differently for a notrump rebid than for a suit rebid — that is a rebid-chapter matter, not a change to the bands themselves.",
    "concept",
    "auction",
    { kind: "none" },
    {
      settings: [
        range(BAND_LOW, "Opener's LOW band (HCP)", 12, 15, { min: 10, max: 20 }),
        range(BAND_MED, "Opener's MEDIUM band (HCP)", 16, 19, { min: 12, max: 22 }),
        range(BAND_HIGH, "Opener's HIGH band (HCP)", 20, 21, { min: 16, max: 24 }),
      ],
    },
  ),

  // -------------------------------------------------------------------------
  // Page 1 — the suit-length conventions that justify the minor openings
  // -------------------------------------------------------------------------
  item(
    "open-suit-length-conventions",
    "How long a bid suit is: the notes' length conventions",
    "Page 1 states the length convention that every other length statement in the notes is an exception to, and it is the reason a 1♣ or 1♦ opening promises so little.\n\nFIRST natural suit bid (or implied) by any bidder requires 5+ CARDS. The notes' own list of what counts as a first natural suit bid: a 1M opening, an overcall or an advance in any suit, the suit implied by a Jacoby or Texas transfer, 2♥ over 1♠, and a preemptive bid. THE EXCEPTIONS, all downward: a 1m opening needs only 3+ cards; a 1-level response to an opening bid needs 4+; and a 2/1 response in a minor needs 4+.\n\nSECOND natural suit bid by any bidder requires 4+ cards, with two exceptions: opener's rebid after a Forcing NT (e.g. 1M - 1N; 2m) promises only 3+, and if some other suit has already been AGREED then a new suit shows a control rather than any length at all — it is a game/slam try, not a suit.\n\nSo the one-level minor openings in this system are honest three-card bids, and the 1♣/1♦ choice on page 10 (longer minor; 1♣ with 3-3; 1♦ with 4-4) is a shape convention, not a length promise. Page 4 adds the tolerance that goes with it: \"it's ok to cheat with minor suit length if there is no other option... Do NOT cheat with major suit length\" — 1♠ - 2♥ promises five hearts, 1♠ - 2m may be a four-carder. This item is teaching text: the length numbers themselves are enforced inside each opening, response and rebid rule rather than by a rule here.",
    "concept",
    "auction",
    { kind: "none" },
  ),

  // -------------------------------------------------------------------------
  // Page 10 — the list itself, in the order the notes print it
  // -------------------------------------------------------------------------
  item(
    "open-decision-order",
    "The opening decision, in page 10's order",
    "Page 10 prints the opening decision as an ordered list, and the order is the rule. Read it top to bottom and take the first row that fits. (1) 22+ points: bid 2♣. (2) Balanced hand: bid 1NT with 15-17 or 2NT with 20-21 — \"EVEN WITH 5M\", so the balanced test is taken BEFORE any suit-length test and a five-card major does not push the hand out of notrump. (3) 5+ cards in any suit: bid the longer suit first, or the higher-ranking with equal length (5-5 or 6-6). (4) Default: bid the longer minor — 1♣ with 3-3, 1♦ with 4-4, 5-5 or 6-6 in the minors. (5) 6-11 points: 2♦/2♥/2♠ with a six-carder, 3♣/3♦/3♥/3♠ with a seven-carder, 4♣/4♦/4♥/4♠ with an eight-carder.\n\nTwo things the list does not print but which follow from it. There is no 2♣ PREEMPT: the six-card preempt row offers 2♦, 2♥ and 2♠ only, because 2♣ is the strong opening — so a 6-11 hand whose only long suit is six clubs has no opening call at all. And there is no pass row: the header reads \"Most common opening Bids (12+ pts)\" and the preempt row starts at 6, so a hand below 6, and a 6-11 hand with no six-card suit, simply pass (see open-pass, which says so and exposes the boundary).\n\nMEASURE. The notes say \"pts\" and never discuss length, distribution or dummy points anywhere in 32 pages; page 31 prints \"Points 12-21\" against a 1♣ opening. Every rule in this chapter therefore counts HIGH-CARD points. That is the opposite choice from the repo's girkar template, whose deck teaches length points and whose one-level openings are counted as total points — the same 11-HCP hand with a good six-card suit opens 1♠ there and preempts here.",
    "concept",
    "auction",
    { kind: "none" },
  ),

  // -------------------------------------------------------------------------
  // Page 10, row 1 — the strong, artificial 2♣ (the only convention here)
  // -------------------------------------------------------------------------
  auctionItem(
    "open-strong-2c",
    "Strong artificial 2♣ opening (22+)",
    "Every hand of 22 or more points opens 2♣, whatever its shape — it is the first row of page 10's list, so it is tested before the balanced test and before any suit length, and a balanced 22-count opens 2♣ rather than 2NT. 2♣ says nothing about clubs; page 2 lists it first among the conventional bids that \"you need to remember by rote memory\".\n\nIT IS ALSO THE CEILING OF EVERY OTHER OPENING. Because 22+ is reserved here, no other opening promises more than 21 — which is exactly why opener's high band stops at 21 (page 14's header says \"High (20 - 21 pts, GF)\"), and why the six-card preempt row on page 10 starts at 2♦ instead of 2♣: there is no weak 2♣, so a six-card club suit has no preempt.\n\nFORCING: the notes never print the word against the 2♣ OPENING itself, but page 11's response table leaves responder no way out — 2♦ is described as \"forcing, negative and waiting\" and even the 0-4 point hand is told to bid it and \"plan to rebid the cheapest minor next... you will get another chance\". So the rule marks the call forcing for the partnership-inference layer, while the actual may-not-pass entry belongs with page 11's responses to 2♣ rather than here.",
    "convention",
    [
      rule(
        "open",
        "Open a strong 2♣",
        ctx("opening"),
        hcp(low("b_open_2c_range"), high("b_open_2c_range")),
        bid(2, "C"),
        10,
        { shows: { hcp: { min: 22 }, forcing: true } },
      ),
    ],
    {
      settings: [
        toggle("b_open_2c_on", "Strong artificial 2♣ opening"),
        range("b_open_2c_range", "Strong 2♣ opening range (HCP)", 22, 40, { min: 18, max: 40 }),
      ],
      sets: ["core", "conventions"],
    },
  ),

  // -------------------------------------------------------------------------
  // Page 10, row 2 — the notrump openings, five-card major and all
  // -------------------------------------------------------------------------
  auctionItem(
    "open-2nt",
    "2NT opening (balanced 20-21, even with a five-card major)",
    "Open 2NT with a balanced 20-21. Page 11 confirms the range where it lists the responses (\"Responses to 2NT (20-21 pts, balanced, investigate a major suit fit)\"), and page 10's row carries the same \"EVEN WITH 5M\" clause as 1NT: the clause is written once for the whole balanced row and applies to both notrump openings. Balanced in this platform means 4-3-3-3, 4-4-3-2 or 5-3-3-2, so \"even with 5M\" is the 5-3-3-2 case — a hand with 20-21 and five spades opens 2NT and lets the transfer machinery find the major.\n\nThe two templates agree here for once, by different routes: the girkar deck's 2NT header only HEDGES (\"usually no 5 card major\"), so that chapter leaves its 2NT unrestricted too. They part company at 1NT, which that deck denies a five-card major outright (see open-1nt). If you want the restrictive reading here, drop the \"longest major\" dial to 4 rather than editing the rule.",
    "agreement",
    [
      rule(
        "open",
        "Open 2NT",
        ctx("opening"),
        all(
          bal(),
          hcp(low("b_open_2nt_range"), high("b_open_2nt_range")),
          len("S", undefined, { $setting: "b_open_2nt_max_major" }),
          len("H", undefined, { $setting: "b_open_2nt_max_major" }),
        ),
        bid(2, "N"),
        20,
        {
          shows: {
            hcp: { min: 20, max: 21 },
            suits: [
              { suit: "S", max: 5 },
              { suit: "H", max: 5 },
            ],
          },
        },
      ),
    ],
    {
      settings: [
        range("b_open_2nt_range", "2NT opening range (HCP)", 20, 21, { min: 18, max: 24 }),
        {
          key: "b_open_2nt_max_major",
          label: "Longest major allowed in a 2NT opening",
          control: "number",
          role: "parameter",
          default: 5,
          min: 4,
          max: 5,
          description:
            "Page 10 opens the balanced row \"EVEN WITH 5M\", so the default is 5 — a balanced 20-21 with five spades opens 2NT. Set to 4 to play the restrictive style (the girkar template's reading).",
        },
      ],
    },
  ),

  auctionItem(
    "open-1nt",
    "1NT opening (balanced 15-17, EVEN WITH A FIVE-CARD MAJOR)",
    "Open 1NT with a balanced 15-17 — and page 10 says plainly that a five-card major does NOT stop you: the row reads \"balanced hand -> bid 1N with 15-17 pts, bid 2N with 20-21 pts, EVEN WITH 5M\". So the balanced test comes first and a 5-3-3-2 hand with five hearts and 16 points opens 1NT, not 1♥.\n\nTHE RANGE IS 15-17 AND NOTHING IN THE NOTES DISPUTES IT, but a reader will meet a different figure elsewhere and should not carry it here: pages 4 and 21 say \"15-18\" — page 4 of a 1NT OVERCALL with a stopper, page 21's deal-15 remark of the same bid — while the 1NT OPENING is given as 15-17 on page 10 and again on page 23 (\"1N should be 15-17\", the deal-28 remark). Two pages for the opening, and the 15-18 pages are talking about the overcall, which is a different bid owned by the competitive chapter. The dial below is here if a partnership wants the overcall's width for the opening too.\n\nTHIS IS THE OPPOSITE OF THE REPO'S GIRKAR TEMPLATE, WHICH DENIES IT. That deck's slides 18 and 19 say \"1N Opener has 2-4 cards in any major\" and \"15-17, balanced, no 5 card major\", and its chapter encodes a maximum of four cards in each major with a dial to relax it. These notes state the reverse in capitals and nothing anywhere in the 32 pages qualifies it, so this template encodes the five-card major as ALLOWED and the dial (default 5) exists to restrict it, not to permit it. The two templates genuinely disagree; neither is a transcription error.\n\nWhat that costs and buys, so a fellow can judge it: Stayman still works (page 11's 2♣ asks for a FOUR-card major, and opener with five will bid it), and the Jacoby/Texas transfer machinery gives responder a way to play in a 5-3 major fit — but responder can no longer assume 1NT denies five, so a 5-2 fit can be missed and a 3NT contract can be right on a hand where a 5-3 major fit exists. Range and shape are two points wide and three shapes only (4-3-3-2 does not exist; balanced here is 4-3-3-3, 4-4-3-2, 5-3-3-2), which is what makes responder captain: every response on pages 1-2 and 10-11 is calibrated against a hand this narrowly defined.",
    "agreement",
    [
      rule(
        "open",
        "Open 1NT",
        ctx("opening"),
        all(
          bal(),
          hcp(low("b_open_1nt_range"), high("b_open_1nt_range")),
          len("S", undefined, { $setting: "b_open_1nt_max_major" }),
          len("H", undefined, { $setting: "b_open_1nt_max_major" }),
        ),
        bid(1, "N"),
        21,
        {
          shows: {
            hcp: { min: 15, max: 17 },
            suits: [
              { suit: "S", max: 5 },
              { suit: "H", max: 5 },
            ],
          },
        },
      ),
    ],
    {
      settings: [
        range("b_open_1nt_range", "1NT opening range (HCP)", 15, 17, { min: 10, max: 20 }),
        {
          key: "b_open_1nt_max_major",
          label: "Longest major allowed in a 1NT opening",
          control: "number",
          role: "parameter",
          default: 5,
          min: 4,
          max: 5,
          description:
            "Page 10 says \"EVEN WITH 5M\" in capitals, so the default is 5: a balanced 15-17 with a five-card major opens 1NT. Set to 4 for the conventional style that denies a five-card major (which is what the repo's girkar template plays).",
        },
      ],
    },
  ),

  // -------------------------------------------------------------------------
  // Page 10, row 3 — 5+ in any suit: longer first, higher-ranking when equal
  // -------------------------------------------------------------------------
  auctionItem(
    "open-1-suit-longest",
    "One-level opening in the longest suit (5+ cards)",
    "With 12-21 and a five-card-or-longer suit that is the hand's longest, open one of it. Page 10: \"5+any -> bid longer suit first or the higher ranking with equal, i.e. 5-5 or 6-6\". The tie-break is HIGHER-RANKING, not up-the-line — so 5-5 in the majors opens 1♠, 5-5 in spades and clubs opens 1♠, 5-5 in the minors opens 1♦, and 6-6 breaks the same way. With unequal length the LONGER suit is opened whatever its rank: six clubs and five spades is 1♣.\n\nThis row sits below the balanced row, which is what gives page 10's \"EVEN WITH 5M\" its force: a 5-3-3-2 hand with a five-card major and 15-17 or 20-21 has already been taken by 1NT/2NT and never reaches this row. A balanced 12-14 or 18-19 does reach it (this system has no notrump opening for those hands) and opens one of its longest suit, with the rebid to clarify.\n\nRANGE: 12-21, the union of page 3's three opener bands — the rule reads the low band's floor and the high band's ceiling, so moving a band boundary moves the opening range with it. Page 1's convention makes the promise here five real cards; unlike the minors below, a major opening is never shaded (page 4: \"do not cheat with major suit length\").",
    "agreement",
    [
      rule(
        "one-spade",
        "Open 1♠ with five-plus spades as the longest suit",
        ctx("opening"),
        all(OPENING_STRENGTH, len("S", 5), longestAmong("S")),
        bid(1, "S"),
        30,
        { shows: { hcp: { min: 12, max: 21 }, suits: [{ suit: "S", min: 5 }] } },
      ),
      rule(
        "one-heart",
        "Open 1♥ with five-plus hearts as the longest suit",
        ctx("opening"),
        all(OPENING_STRENGTH, len("H", 5), longestAmong("H")),
        bid(1, "H"),
        31,
        { shows: { hcp: { min: 12, max: 21 }, suits: [{ suit: "H", min: 5 }] } },
      ),
      rule(
        "one-diamond",
        "Open 1♦ with five-plus diamonds as the longest suit",
        ctx("opening"),
        all(OPENING_STRENGTH, len("D", 5), longestAmong("D")),
        bid(1, "D"),
        32,
        { shows: { hcp: { min: 12, max: 21 }, suits: [{ suit: "D", min: 5 }] } },
      ),
      rule(
        "one-club",
        "Open 1♣ with five-plus clubs as the longest suit",
        ctx("opening"),
        all(OPENING_STRENGTH, len("C", 5), longestAmong("C")),
        bid(1, "C"),
        33,
        { shows: { hcp: { min: 12, max: 21 }, suits: [{ suit: "C", min: 5 }] } },
      ),
    ],
  ),

  // -------------------------------------------------------------------------
  // Page 10, row 4 — the "default" row: the longer minor, on 3+ cards
  // -------------------------------------------------------------------------
  auctionItem(
    "open-1-minor-default",
    "Default opening: one of the longer minor (3+ cards)",
    "When no suit reaches five cards, open the LONGER MINOR — page 10's default row: \"bid longer minor, 1c with 3-3, or 1d with 4-4, 5-5, or 6-6 in minors\". Page 1 licenses it: a 1m opening is the one first-suit bid that needs only 3+ cards.\n\nThe row is authored as four rules that between them cover every shape that can reach it (no suit longer than four, so 4-3-3-3, 4-4-3-2 or 4-4-4-1). Longer diamonds → 1♦. Longer clubs → 1♣. Minors 3-3 → 1♣ (the notes' explicit tie-break at that length). Minors 4-4 → 1♦ (likewise). The 5-5 and 6-6 cases the row also names are already handled one row up by the higher-ranking tie-break, which gives 1♦ — the same answer, so the two rows agree.\n\nWorth seeing plainly: with 4=4=3=2 this system opens 1♦ on a three-card suit (the longer minor), and with 4=3=3=3 or 3=3=3=4 it opens 1♣. Nothing here promises four cards in the minor, and page 4's tolerance (\"it's ok to cheat with minor suit length if there is no other option\") is the notes' own comment on that. The 2-2 minor holding never arises: with no suit longer than four, the minors cannot be shorter than five cards between them.",
    "agreement",
    [
      rule(
        "longer-diamonds",
        "Open 1♦ with the longer minor",
        ctx("opening"),
        all(
          OPENING_STRENGTH,
          NO_FIVE_CARD_SUIT,
          any(
            all(len("D", 4, 4), len("C", undefined, 3)),
            all(len("D", 3, 3), len("C", undefined, 2)),
          ),
        ),
        bid(1, "D"),
        40,
        { shows: { hcp: { min: 12, max: 21 }, suits: [{ suit: "D", min: 3 }] } },
      ),
      rule(
        "longer-clubs",
        "Open 1♣ with the longer minor",
        ctx("opening"),
        all(
          OPENING_STRENGTH,
          NO_FIVE_CARD_SUIT,
          any(
            all(len("C", 4, 4), len("D", undefined, 3)),
            all(len("C", 3, 3), len("D", undefined, 2)),
          ),
        ),
        bid(1, "C"),
        41,
        { shows: { hcp: { min: 12, max: 21 }, suits: [{ suit: "C", min: 3 }] } },
      ),
      rule(
        "three-three-minors",
        "Open 1♣ with 3-3 in the minors",
        ctx("opening"),
        all(OPENING_STRENGTH, NO_FIVE_CARD_SUIT, len("C", 3, 3), len("D", 3, 3)),
        bid(1, "C"),
        42,
        { shows: { hcp: { min: 12, max: 21 }, suits: [{ suit: "C", min: 3 }] } },
      ),
      rule(
        "four-four-minors",
        "Open 1♦ with 4-4 in the minors",
        ctx("opening"),
        all(OPENING_STRENGTH, NO_FIVE_CARD_SUIT, len("D", 4, 4), len("C", 4, 4)),
        bid(1, "D"),
        43,
        { shows: { hcp: { min: 12, max: 21 }, suits: [{ suit: "D", min: 4 }] } },
      ),
    ],
  ),

  // -------------------------------------------------------------------------
  // Page 10, row 5 — the 6-11 preempt ladder (6/7/8 cards)
  // -------------------------------------------------------------------------
  auctionItem(
    "open-preempt-2",
    "Weak two-level preempt (6-11 with a six-card suit)",
    "With 6-11 points and a six-card suit, open 2♦, 2♥ or 2♠. Page 10's last row gives the whole ladder in one line — \"6-11 pts -> 2d/2h/2s with 6-carder, 3c/3d/3h/3s with 7-carder, 4c/4d/4h/4s with 8-carder\" — and page 1 counts a preemptive bid as a first natural suit bid, so the six cards are a real promise.\n\nTHERE IS NO 2♣ PREEMPT. The row lists 2♦/2♥/2♠ only, because 2♣ is the strong 22+ opening. A 6-11 hand whose only six-card suit is clubs therefore has NO opening call and passes (see open-pass); it gets a preempt only at the three level, with seven.\n\nTWO THINGS THE NOTES DO NOT SAY, named rather than invented. There is no suit-quality test anywhere in the row — points and length only — so the rules impose none; tighten the range dial if you want more discipline, since the language has no \"good suit\" predicate that matches what the notes mean by it. And there is no vulnerability adjustment either: unlike most treatments of weak twos, page 10 offers one 6-11 band for both vulnerabilities. Page 5 does the vulnerability arithmetic instead, on the OTHER side of the table (open-responding-to-preempt, open-sacrifice-arithmetic), which is where this system puts the discipline: partner is told to assume you are down 2 vulnerable or down 3 not vulnerable. Ties between two six-card suits are broken to the higher-ranking suit, borrowing the same page's \"higher ranking with equal\" instruction for the 5+ row.\n\nBand 2, below the naturals: a 12+ hand never preempts, because these notes count high-card points throughout and 12+ has already been taken by the rows above.",
    "agreement",
    [
      rule(
        "two-spades",
        "Open 2♠ with a six-card spade suit",
        ctx("opening"),
        all(
          hcp(low("b_open_preempt_range"), high("b_open_preempt_range")),
          len("S", 6, 6),
          longestAmong("S"),
        ),
        bid(2, "S"),
        50,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "S", min: 6, max: 6 }] } },
      ),
      rule(
        "two-hearts",
        "Open 2♥ with a six-card heart suit",
        ctx("opening"),
        all(
          hcp(low("b_open_preempt_range"), high("b_open_preempt_range")),
          len("H", 6, 6),
          longestAmong("H"),
        ),
        bid(2, "H"),
        51,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "H", min: 6, max: 6 }] } },
      ),
      rule(
        "two-diamonds",
        "Open 2♦ with a six-card diamond suit",
        ctx("opening"),
        all(
          hcp(low("b_open_preempt_range"), high("b_open_preempt_range")),
          len("D", 6, 6),
          longestAmong("D"),
        ),
        bid(2, "D"),
        52,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "D", min: 6, max: 6 }] } },
      ),
    ],
    {
      settings: [
        range("b_open_preempt_range", "Preempt range, all three levels (HCP)", 6, 11, {
          min: 0,
          max: 15,
        }),
      ],
    },
  ),

  auctionItem(
    "open-preempt-3",
    "Three-level preempt (6-11 with a seven-card suit)",
    "With 6-11 points and a seven-card suit, open at the three level: 3♣, 3♦, 3♥ or 3♠. Clubs are available here — the 2♣ collision only costs the club suit its two-level preempt — so a 6-11 hand with seven clubs opens 3♣ where six clubs had to pass.\n\nSame single point band as the six-card and eight-card rows (the notes state 6-11 once, for the whole ladder, so all three levels read one shared range dial rather than three), no suit-quality requirement, and no vulnerability adjustment. Ties break to the higher-ranking suit.",
    "agreement",
    [
      rule(
        "three-spades",
        "Open 3♠ with a seven-card spade suit",
        ctx("opening"),
        all(
          hcp(low("b_open_preempt_range"), high("b_open_preempt_range")),
          len("S", 7, 7),
          longestAmong("S"),
        ),
        bid(3, "S"),
        55,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "S", min: 7, max: 7 }] } },
      ),
      rule(
        "three-hearts",
        "Open 3♥ with a seven-card heart suit",
        ctx("opening"),
        all(
          hcp(low("b_open_preempt_range"), high("b_open_preempt_range")),
          len("H", 7, 7),
          longestAmong("H"),
        ),
        bid(3, "H"),
        56,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "H", min: 7, max: 7 }] } },
      ),
      rule(
        "three-diamonds",
        "Open 3♦ with a seven-card diamond suit",
        ctx("opening"),
        all(
          hcp(low("b_open_preempt_range"), high("b_open_preempt_range")),
          len("D", 7, 7),
          longestAmong("D"),
        ),
        bid(3, "D"),
        57,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "D", min: 7, max: 7 }] } },
      ),
      rule(
        "three-clubs",
        "Open 3♣ with a seven-card club suit",
        ctx("opening"),
        all(
          hcp(low("b_open_preempt_range"), high("b_open_preempt_range")),
          len("C", 7, 7),
          longestAmong("C"),
        ),
        bid(3, "C"),
        58,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "C", min: 7, max: 7 }] } },
      ),
    ],
  ),

  auctionItem(
    "open-preempt-4",
    "Four-level preempt (6-11 with an eight-card suit)",
    "With 6-11 points and an eight-card suit, open at the four level: 4♣, 4♦, 4♥ or 4♠. The rules read eight-OR-LONGER, because the notes' ladder stops at eight and gives a nine-card or ten-card suit nowhere else to go.\n\nSame shared 6-11 band, no suit-quality test, no vulnerability adjustment, ties to the higher-ranking suit. Note that 4♣ and 4♦ are preempts in this system, which matters for the conventions chapter: over an OPENING of 1NT or 2NT those same calls are Texas transfers, and over partner's 1M a 4♦/4♥ bid is not this rule at all — this item only ever fires as the very first call of the auction.",
    "agreement",
    [
      rule(
        "four-spades",
        "Open 4♠ with an eight-plus card spade suit",
        ctx("opening"),
        all(
          hcp(low("b_open_preempt_range"), high("b_open_preempt_range")),
          len("S", 8),
          longestAmong("S"),
        ),
        bid(4, "S"),
        60,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "S", min: 8 }] } },
      ),
      rule(
        "four-hearts",
        "Open 4♥ with an eight-plus card heart suit",
        ctx("opening"),
        all(
          hcp(low("b_open_preempt_range"), high("b_open_preempt_range")),
          len("H", 8),
          longestAmong("H"),
        ),
        bid(4, "H"),
        61,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "H", min: 8 }] } },
      ),
      rule(
        "four-diamonds",
        "Open 4♦ with an eight-plus card diamond suit",
        ctx("opening"),
        all(
          hcp(low("b_open_preempt_range"), high("b_open_preempt_range")),
          len("D", 8),
          longestAmong("D"),
        ),
        bid(4, "D"),
        62,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "D", min: 8 }] } },
      ),
      rule(
        "four-clubs",
        "Open 4♣ with an eight-plus card club suit",
        ctx("opening"),
        all(
          hcp(low("b_open_preempt_range"), high("b_open_preempt_range")),
          len("C", 8),
          longestAmong("C"),
        ),
        bid(4, "C"),
        63,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "C", min: 8 }] } },
      ),
    ],
  ),

  // -------------------------------------------------------------------------
  // Page 10 by omission — the hands the list leaves with no bid
  // -------------------------------------------------------------------------
  auctionItem(
    "open-pass",
    "Opening pass: the hands page 10's list leaves out",
    "PAGE 10 PRINTS NO PASS ROW, and this item is that gap made explicit rather than left to the engine floor. The list's header is \"Most common opening Bids (12+ pts)\" and its weak row starts at 6, so three kinds of hand have no opening call and pass.\n\n(1) Below 6 points: too weak for even the preempt row. The ceiling is exposed as a dial because the notes never state it — 5 is simply one below the 6-11 band's floor, and the two move together. (2) 6-11 with no six-card suit: the preempt ladder needs six cards, and there is no other 6-11 opening in the system. (3) 6-11 whose only six-card suit is CLUBS: page 10's six-card row offers 2♦/2♥/2♠ only, because 2♣ is the strong opening — so this hand passes even though the identical hand with six diamonds opens 2♦. With seven clubs it would open 3♣.\n\nThe notes do say \"Pass with < 6 pts\" twice, but both times about RESPONDER (page 1, responses to 1M and to 1m), which is a different decision; the 6-point figure here is inferred from the opening list's own floor, not quoted from an opening rule. Everything at 12+ is covered by the rows above — the default minor row takes every shape with no five-card suit — so no 12+ hand reaches this item.",
    "bidding_rule",
    [
      rule(
        "pass-too-weak",
        "Pass below the preempt floor",
        ctx("opening"),
        hcp(undefined, { $setting: "b_open_pass_ceiling" }),
        pass,
        90,
      ),
      rule(
        "pass-no-six-card-suit",
        "Pass 6-11 with no six-card suit",
        ctx("opening"),
        all(
          hcp(low("b_open_preempt_range"), high("b_open_preempt_range")),
          len("own_longest_suit", undefined, 5),
        ),
        pass,
        91,
      ),
      rule(
        "pass-six-clubs-only",
        "Pass 6-11 when the only six-card suit is clubs (there is no 2♣ preempt)",
        ctx("opening"),
        all(
          hcp(low("b_open_preempt_range"), high("b_open_preempt_range")),
          len("C", 6, 6),
          len("S", undefined, 5),
          len("H", undefined, 5),
          len("D", undefined, 5),
        ),
        pass,
        92,
      ),
    ],
    {
      settings: [
        {
          key: "b_open_pass_ceiling",
          label: "Highest HCP that always passes as dealer",
          control: "number",
          role: "parameter",
          default: 5,
          min: 0,
          max: 11,
          description:
            "Page 10 prints no pass row; 5 is one below the 6-11 preempt band's floor, so the two boundaries stay adjacent. Raise it to keep marginal hands out of the preempt ladder.",
        },
      ],
    },
  ),

  // -------------------------------------------------------------------------
  // Page 5 — the discipline that replaces a vulnerability-adjusted preempt
  // -------------------------------------------------------------------------
  item(
    "open-responding-to-preempt",
    "Responding to partner's preempt: assume down 2 vulnerable, down 3 not",
    "Page 5 gives responder one arithmetic and asks for nothing else: \"if your partner opens the suit bid with 2d through 3s (weak preemptive bids), assume that partner will be down 2 when Vul and down 3 when non-Vul without any tricks from you. If you can cover up that deficit and have extra tricks then support the partner and may even bid the game. You can also make a sacrifice bid accordingly.\"\n\nSo the count is: start from partner's assumed result, add the tricks YOUR hand contributes, and act on the surplus. Cover the deficit and you are back to making the contract, so raising is safe; cover it with tricks to spare and the extra tricks buy the next level, up to game. This is also where this system keeps the vulnerability discipline that page 10's opening ladder leaves out: the preempt itself is one 6-11 band at any vulnerability, and the ADJUSTMENT happens here, on responder's side, plus in the sacrifice arithmetic (see open-sacrifice-arithmetic).\n\nNOT MECHANIZED, DELIBERATELY. The two dials below record the numbers the notes state, but no rule reads them: the reasoning is in TRICKS partner's hand and yours will take together, and the language's nearest predicate (`playingTricks`, a per-hand estimate) cannot express \"cover partner's assumed deficit\" — that needs a trick estimate for the PARTNERSHIP given a known preempt, which the inference layer does not compute. The notes' own scope note is worth keeping too: they say 2♦ THROUGH 3♠, i.e. the six-card and seven-card preempts. A four-level preempt is already at or near game and this arithmetic is not offered for it.",
    "judgment_guideline",
    "auction",
    { kind: "none" },
    {
      settings: [
        {
          key: "b_open_preempt_deficit_vul",
          label: "Undertricks to assume for partner's preempt when vulnerable",
          control: "number",
          role: "parameter",
          default: 2,
          min: 0,
          max: 5,
          description:
            "Page 5: assume partner is down 2 when vulnerable with no tricks from you. Teaching text — no rule reads this dial.",
        },
        {
          key: "b_open_preempt_deficit_nonvul",
          label: "Undertricks to assume for partner's preempt when not vulnerable",
          control: "number",
          role: "parameter",
          default: 3,
          min: 0,
          max: 5,
          description:
            "Page 5: assume partner is down 3 when not vulnerable with no tricks from you. Teaching text — no rule reads this dial.",
        },
      ],
    },
  ),

  item(
    "open-sacrifice-arithmetic",
    "When a sacrifice pays: the four numbers on page 5",
    "Page 5 defines the bid and then prices it: \"A SACRIFICE BID is when you know you can go down 2-3 tricks in a doubled contract but it will be better than letting the opponents make a game.\" The four numbers, exactly as stated:\n\nAGAINST A VULNERABLE GAME — going down 2 when you are vulnerable, or down 3 when you are not vulnerable, is a good sacrifice.\nAGAINST A NON-VULNERABLE GAME — going down 1 when you are vulnerable, or down 2 when you are not vulnerable, is a good sacrifice.\n\nThe asymmetry is the whole lesson: their vulnerable game is worth about 600-620, so 500 (three down, not vulnerable, doubled) or 500 (two down, vulnerable, doubled) still shows a profit, while their non-vulnerable game is only worth about 400-420 and the same 500 is a loss — against that you may only afford 300 (two down, not vulnerable) or 200 (one down, vulnerable). The notes do not print the scores, only the trick counts; the reasoning above is the standard arithmetic behind them and is offered as explanation, not as something the notes say.\n\nPAIR THIS WITH THE PREEMPT COUNT. Page 5 puts the two together on purpose: assume partner's preempt is down 2 vulnerable or down 3 not vulnerable (open-responding-to-preempt), add your tricks, and if the result is inside the table above, sacrifice rather than defend. NOT MECHANIZED: this is scoring judgment about a contract nobody has bid yet. The language has no predicate for expected undertricks, for the opponents' vulnerability as a score, or for comparing two hypothetical results — `AuctionContext.vulnerability` can say favorable/unfavorable but not what a sacrifice is worth — so the four numbers are carried as dials on teaching text rather than faked as rules.",
    "judgment_guideline",
    "auction",
    { kind: "none" },
    {
      settings: [
        {
          key: "b_open_sac_vs_vul_game_when_vul",
          label: "Acceptable undertricks vs a vulnerable game, we are vulnerable",
          control: "number",
          role: "parameter",
          default: 2,
          min: 0,
          max: 6,
          description: "Page 5: down 2 vulnerable is a good sacrifice against a vulnerable game.",
        },
        {
          key: "b_open_sac_vs_vul_game_when_nonvul",
          label: "Acceptable undertricks vs a vulnerable game, we are not vulnerable",
          control: "number",
          role: "parameter",
          default: 3,
          min: 0,
          max: 6,
          description:
            "Page 5: down 3 non-vulnerable is a good sacrifice against a vulnerable game.",
        },
        {
          key: "b_open_sac_vs_nonvul_game_when_vul",
          label: "Acceptable undertricks vs a non-vulnerable game, we are vulnerable",
          control: "number",
          role: "parameter",
          default: 1,
          min: 0,
          max: 6,
          description:
            "Page 5: down only 1 vulnerable is a good sacrifice against a non-vulnerable game.",
        },
        {
          key: "b_open_sac_vs_nonvul_game_when_nonvul",
          label: "Acceptable undertricks vs a non-vulnerable game, we are not vulnerable",
          control: "number",
          role: "parameter",
          default: 2,
          min: 0,
          max: 6,
          description:
            "Page 5: down only 2 non-vulnerable is a good sacrifice against a non-vulnerable game.",
        },
      ],
    },
  ),
];

/** Page(s) each item was authored from — install.ts turns these into citations. */
export const OPENINGS_PAGES: Record<string, number[]> = {
  "open-opener-bands": [3, 11, 14, 31],
  "open-suit-length-conventions": [1, 4],
  "open-decision-order": [10, 31],
  "open-strong-2c": [2, 10, 11],
  "open-2nt": [10, 11],
  "open-1nt": [10, 23],
  "open-1-suit-longest": [1, 3, 4, 10],
  "open-1-minor-default": [1, 4, 10],
  "open-preempt-2": [1, 5, 10],
  "open-preempt-3": [10],
  "open-preempt-4": [10],
  "open-pass": [1, 10],
  "open-responding-to-preempt": [5],
  "open-sacrifice-arithmetic": [5],
};
