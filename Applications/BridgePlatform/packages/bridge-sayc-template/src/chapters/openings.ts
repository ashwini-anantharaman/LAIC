// Openings (SAYC booklet ch. 1): notrump ladder, five-card majors, better
// minor, the strong 2♣, weak twos, and preempts. Band discipline: preemptive
// and artificial openings are `convention` (band 1, considered before the
// naturals); the natural ladder is `agreement`/`bidding_rule` (band 2) with
// priorities ordered NT → majors → minors → pass.

import {
  all,
  any,
  not,
  auctionItem,
  bal,
  bid,
  bidLongest,
  ctx,
  hcp,
  len,
  longestAmong,
  low,
  high,
  pass,
  quality,
  range,
  rule,
  toggle,
  tp,
  type TemplateItem,
} from "../dsl";

export const OPENINGS: TemplateItem[] = [
  auctionItem(
    "open-1nt",
    "1NT opening",
    "Open 1NT with a balanced hand and 15–17 HCP (the range is a dial). Notrump openings may be made with a five-card major or a five-card minor inside the balanced shape.",
    "agreement",
    [
      rule(
        "open",
        "Open 1NT",
        ctx("opening"),
        all(bal(), hcp(low("nt1_range"), high("nt1_range"))),
        bid(1, "N"),
        20,
      ),
    ],
    { settings: [range("nt1_range", "1NT opening range (HCP)", 15, 17, { min: 10, max: 22 })] },
  ),

  auctionItem(
    "open-2nt",
    "2NT opening",
    "Open 2NT with a balanced 20–21 HCP.",
    "agreement",
    [
      rule(
        "open",
        "Open 2NT",
        ctx("opening"),
        all(bal(), hcp(low("nt2_range"), high("nt2_range"))),
        bid(2, "N"),
        19,
      ),
    ],
    { settings: [range("nt2_range", "2NT opening range (HCP)", 20, 21, { min: 18, max: 24 })] },
  ),

  auctionItem(
    "open-3nt",
    "3NT opening",
    "Open 3NT with a balanced 25–27 HCP — the exception to the strong 2♣ (which otherwise takes all 22+ hands).",
    "exception",
    [
      rule("open", "Open 3NT", ctx("opening"), all(bal(), hcp(25, 27)), bid(3, "N"), 18),
    ],
  ),

  auctionItem(
    "open-strong-2c",
    "Strong artificial 2♣ opening",
    "All very strong hands (22+ points) open an artificial, forcing 2♣ regardless of shape.",
    "convention",
    [rule("open", "Open a strong 2♣", ctx("opening"), tp(22), bid(2, "C"), 10)],
    { settings: [toggle("strong2c_on", "Strong 2♣ opening")], sets: ["core", "conventions"] },
  ),

  auctionItem(
    "open-majors",
    "Five-card major openings",
    "Open 1♥/1♠ with a five-card or longer major and opening values (12+ points). With two five-card suits, open the higher-ranking.",
    "agreement",
    [
      rule(
        "open",
        "Open a five-card major",
        ctx("opening"),
        all(tp(12, 21), any(len("S", 5), len("H", 5))),
        bidLongest(["S", "H"], 1),
        30,
      ),
    ],
  ),

  auctionItem(
    "open-minors",
    "Minor suit openings (better minor)",
    "Without a five-card major, open the longer minor: 1♦ with 4–4 in the minors, 1♣ with 3–3. A 1♦ opening suggests four-plus diamonds — the one exception is the 4=4=3=2 hand (four spades, four hearts, three diamonds, two clubs), which opens 1♦.",
    "agreement",
    [
      rule(
        "threethree",
        "Open 1♣ with 3-3 minors",
        ctx("opening"),
        all(tp(12, 21), len("D", 3, 3), len("C", 3, 3)),
        bid(1, "C"),
        31,
      ),
      rule(
        "open",
        "Open the longer minor",
        ctx("opening"),
        tp(12, 21),
        bidLongest(["D", "C"], 1),
        32,
      ),
    ],
  ),

  auctionItem(
    "open-weak-two",
    "Weak two-bids",
    "Open 2♦/2♥/2♠ with a good six-card suit and 5–11 HCP. On rare occasions a very good five-card suit qualifies, and a POOR seven-card suit (not good enough for a three-level preempt) opens a weak two instead. 2♣ is always reserved for strong hands.",
    "convention",
    [
      rule(
        "open",
        "Open a weak two",
        ctx("opening"),
        all(
          hcp(low("weak2_range"), high("weak2_range")),
          longestAmong("D", "H", "S"),
          len("own_longest_suit", 6, 6),
          any(quality("own_longest_suit"), quality("own_longest_suit", "three_of_top_five")),
        ),
        bidLongest(["D", "H", "S"], 2),
        20,
      ),
      rule(
        "poor-seven",
        "Weak two on a poor seven-card suit",
        ctx("opening"),
        all(
          hcp(low("weak2_range"), high("weak2_range")),
          longestAmong("D", "H", "S"),
          len("own_longest_suit", 7, 7),
          not(any(quality("own_longest_suit"), quality("own_longest_suit", "three_of_top_five"))),
        ),
        bidLongest(["D", "H", "S"], 2),
        23,
      ),
    ],
    {
      settings: [
        toggle("weak2_on", "Weak two-bids"),
        range("weak2_range", "Weak two range (HCP)", 5, 11, { min: 3, max: 12 }),
      ],
      sets: ["core", "conventions"],
    },
  ),

  auctionItem(
    "open-preempt-3",
    "Three-level preempts",
    "Open at the three level with a good seven-card suit and less than opening values.",
    "convention",
    [
      rule(
        "open",
        "Preempt at the three level",
        ctx("opening"),
        all(hcp(undefined, 10), len("own_longest_suit", 7, 7), any(quality("own_longest_suit"), quality("own_longest_suit", "three_of_top_five"))),
        bidLongest(["S", "H", "D", "C"], 3),
        21,
      ),
    ],
    { settings: [toggle("preempt3_on", "Three-level preempts")], sets: ["core", "conventions"] },
  ),

  auctionItem(
    "open-preempt-4",
    "Four-level preempts",
    "Open at the four level with an eight-card suit and less than opening values.",
    "convention",
    [
      rule(
        "open",
        "Preempt at the four level",
        ctx("opening"),
        all(hcp(undefined, 10), len("own_longest_suit", 8)),
        bidLongest(["S", "H", "D", "C"], 4),
        22,
      ),
    ],
    { settings: [toggle("preempt4_on", "Four-level preempts")], sets: ["core", "conventions"] },
  ),

  auctionItem(
    "open-pass",
    "Opening pass",
    "With less than opening values and no preempt, pass. Openings start at 12 total points.",
    "bidding_rule",
    [rule("pass", "Pass without opening values", ctx("opening"), tp(undefined, 11), pass, 90)],
  ),
];
