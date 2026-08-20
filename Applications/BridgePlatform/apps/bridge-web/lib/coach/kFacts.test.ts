// The K items' values. Every number below was worked out by hand from the deal
// in the fixture, because a card that says "6 losers" and means something else
// is worse than a card that says nothing — the panel's whole contract is that
// it can be missing but never wrong.
//
// Three classes of assertion:
//   · the ARITHMETIC — each producer against a deal small enough to check;
//   · the VISIBILITY — a hand the learner may not see is never counted, and
//     the items that need one simply do not appear;
//   · the CENSUS — this layer covers exactly the buildable items the older
//     producers do not, so a registry edit that adds one fails here.

import type { GameState } from "@bridge/engine";
import type { Card, Seat, Suit } from "@bridge/events";
import { describe, expect, it } from "vitest";

import { kFactsFor, K_FACT_IDS } from "./kFacts";
import { isBuildable, K_ITEMS, type KItemId } from "./kItems";

const R: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const cards = (spec: string): Card[] =>
  spec.trim().split(/\s+/).map((t) => ({ suit: t[0] as Suit, rank: R[t.slice(1)]! as Card["rank"] }));
const one = (spec: string): Card => cards(spec)[0]!;

/**
 * One deal, 52 distinct cards, 40 HCP accounted for:
 *
 *   South (15)  ♠A Q 3   ♥K J 8 5   ♦K 7       ♣Q 9 4 2
 *   North (17)  ♠K J 5 4 ♥A Q 4     ♦A 8 3     ♣K 8 6
 *   East  (8)   ♠T 9 8   ♥T 9 7 6   ♦Q J T     ♣A J 3
 *   West  (0)   ♠7 6 2   ♥3 2       ♦9 6 5 4 2 ♣T 7 5
 */
const DEALT: Record<Seat, Card[]> = {
  S: cards("SA SQ S3 HK HJ H8 H5 DK D7 CQ C9 C4 C2"),
  N: cards("SK SJ S5 S4 HA HQ H4 DA D8 D3 CK C8 C6"),
  E: cards("ST S9 S8 HT H9 H7 H6 DQ DJ DT CA CJ C3"),
  W: cards("S7 S6 S2 H3 H2 D9 D6 D5 D4 D2 CT C7 C5"),
};

const auction = (over: Partial<GameState> = {}): GameState =>
  ({
    boardRef: "k", dealer: "N", vul: "ns", phase: "auction", turn: "S",
    hands: { ...DEALT }, auction: [], contract: null, tricks: [],
    trickCount: { NS: 0, EW: 0 },
    ...over,
  }) as unknown as GameState;

/** Remove played cards from a hand, the way the engine does. */
const less = (seat: Seat, spec: string): Card[] => {
  const gone = cards(spec).map((c) => `${c.suit}${c.rank}`);
  return DEALT[seat].filter((c) => !gone.includes(`${c.suit}${c.rank}`));
};

/**
 * 4♥ by South. Trick 1 complete — West led the ♦5, dummy's ♦A won it — and
 * trick 2 is under way: North led the ♥4, East played the ♥6, South to play.
 *
 * So: 1 trick to the learner's side, 2 hearts played, dummy face up.
 */
const play = (over: Partial<GameState> = {}): GameState =>
  ({
    boardRef: "k", dealer: "N", vul: "ns", phase: "play", turn: "S",
    contract: { level: 4, strain: "H", declarer: "S", doubled: 0 },
    hands: {
      S: less("S", "D7"),
      N: less("N", "DA H4"),
      E: less("E", "DJ H6"),
      W: less("W", "D5"),
    },
    auction: [],
    tricks: [
      {
        leader: "W", winner: "N",
        plays: [
          { seat: "W", card: one("D5") },
          { seat: "N", card: one("DA") },
          { seat: "E", card: one("DJ") },
          { seat: "S", card: one("D7") },
        ],
      },
      { leader: "N", plays: [{ seat: "N", card: one("H4") }, { seat: "E", card: one("H6") }] },
    ],
    trickCount: { NS: 1, EW: 0 },
    ...over,
  }) as unknown as GameState;

const all = (state: GameState, seat: Seat) =>
  Object.fromEntries(
    kFactsFor(K_FACT_IDS, state, seat).map((f) => [f.id, f]),
  ) as Partial<Record<KItemId, { value: string; detail: string }>>;

const value = (state: GameState, seat: Seat, id: KItemId): string | undefined =>
  all(state, seat)[id]?.value;

describe("what the auction can count", () => {
  const st = auction();

  it("finds the longest suit, ties and all", () => {
    // Four hearts and four clubs — neither is longer than the other.
    expect(value(st, "S", "longest-suit")).toBe("♥♣ 4");
    // North's spades are alone at four.
    expect(value(st, "N", "longest-suit")).toBe("♠ 4");
  });

  it("reads vulnerability from the learner's own side", () => {
    expect(value(st, "S", "vulnerability")).toBe("Us"); // NS vulnerable
    expect(value(st, "E", "vulnerability")).toBe("Them");
    expect(value(auction({ vul: "both" } as Partial<GameState>), "S", "vulnerability")).toBe("Both");
    expect(value(auction({ vul: "none" } as Partial<GameState>), "S", "vulnerability")).toBe("Neither");
  });

  it("adds length to the high cards", () => {
    // South is 15 HCP with no suit past four, so nothing to add.
    expect(value(st, "S", "total-points")).toBe("15");
    // West has five diamonds: 0 HCP + 1 for the fifth card.
    expect(value(st, "W", "total-points")).toBe("1");
  });

  it("counts quick tricks by the standard table", () => {
    // ♠AQ = 1½, ♥KJ85 = ½ (K with another), ♦K7 = ½, ♣Q942 = 0.
    expect(value(st, "S", "quick-tricks")).toBe("2½");
    // ♠KJ54 = ½, ♥AQ = 1½, ♦A83 = 1, ♣K86 = ½.
    expect(value(st, "N", "quick-tricks")).toBe("3½");
    expect(value(st, "W", "quick-tricks")).toBe("0");
  });

  it("counts losers in the top three cards of each suit", () => {
    // ♠AQ3 → 1, ♥KJ85 → 2, ♦K7 → 1, ♣Q942 → 2.
    expect(value(st, "S", "losing-trick-count")).toBe("6");
    // West holds no honour at all: three losers in every suit but the doubleton.
    expect(value(st, "W", "losing-trick-count")).toBe("11");
  });

  it("names the suits that are stopped, and the ones that are not", () => {
    expect(value(st, "S", "stoppers")).toBe("All four"); // A, K4, K2, Q4
    // East: ♠T98 no, ♥T976 no, ♦QJT yes (Qxx), ♣AJ3 yes (A).
    expect(value(st, "E", "stoppers")).toBe("♦♣");
    expect(value(st, "W", "stoppers")).toBe("None");
    expect(all(st, "E")["stoppers"]?.detail).toContain("Wide open");
  });

  it("says where the learner sits relative to the dealer", () => {
    expect(value(st, "N", "seat-position")).toBe("1st"); // North deals
    expect(value(st, "E", "seat-position")).toBe("2nd");
    expect(value(st, "S", "seat-position")).toBe("3rd");
    expect(value(st, "W", "seat-position")).toBe("4th");
  });

  it("bounds partner by the forty in the deck", () => {
    expect(value(st, "S", "partner-ceiling")).toBe("≤ 25"); // 40 − 15
    expect(value(st, "W", "partner-ceiling")).toBe("≤ 40"); // holds nothing
  });

  it("makes none of the play's cards before there is a contract", () => {
    const made = all(st, "S");
    for (const id of ["contract-target", "tricks-needed", "tricks-remaining", "trumps-out",
      "my-trumps", "combined-trumps", "combined-hcp", "sure-winners", "missing-honours"] as KItemId[]) {
      expect(made[id]).toBeUndefined();
    }
  });
});

describe("what the play can count", () => {
  const st = play();

  it("counts the target from the learner's own side", () => {
    expect(value(st, "S", "contract-target")).toBe("10"); // 4♥ needs ten
    expect(value(st, "E", "contract-target")).toBe("4"); // and four beats it
  });

  it("subtracts the tricks already won", () => {
    // Dummy's ♦A won trick one, so declarer's side needs nine more.
    expect(value(st, "S", "tricks-needed")).toBe("9");
    // The defence has none of its four yet.
    expect(value(st, "E", "tricks-needed")).toBe("4");
    expect(value(st, "S", "tricks-remaining")).toBe("12");
  });

  it("counts trumps from every hand it can see", () => {
    // Two hearts played; South holds K J 8 5 and dummy A Q — so five are out
    // (East's T 9 7, West's 3 2).
    expect(value(st, "S", "trumps-out")).toBe("5");
    expect(value(st, "S", "my-trumps")).toBe("4");
    expect(value(st, "S", "combined-trumps")).toBe("6");
  });

  it("counts trumps correctly for a DEFENDER, who can see dummy", () => {
    // East holds T 9 7 and can see dummy's A Q; two are played. So four are
    // unaccounted for — South's K J 8 5 minus… no: 13 − 2 played − 3 own − 2
    // dummy = 6. Counting from East's own hand alone would have said 8.
    expect(value(st, "E", "trumps-out")).toBe("6");
    expect(value(st, "E", "my-trumps")).toBe("3");
  });

  it("adds the partnership's points only when partner is face up", () => {
    expect(value(st, "S", "combined-hcp")).toBe("32"); // 15 + 17
    // A defender cannot see their partner's hand, so there is no such card.
    expect(all(st, "E")["combined-hcp"]).toBeUndefined();
    expect(all(st, "E")["combined-trumps"]).toBeUndefined();
    // Nor can DUMMY see declarer's — the rule is the hand, not the side.
    expect(all(st, "N")["combined-hcp"]).toBeUndefined();
  });

  it("counts sure tricks from one hand at a time, and says so", () => {
    // ♠A (nothing higher out), ♥A in dummy, ♦K (the ace is gone). Clubs: the
    // ace is East's, so nothing. Three — and never four by joining hands.
    expect(value(st, "S", "sure-winners")).toBe("≥ 3");
    const detail = all(st, "S")["sure-winners"]!.detail;
    expect(detail).toContain("one hand at a time");
    expect(detail).toContain("♠A");
    // Defenders don't get this one: it is declarer's count over two open hands.
    expect(all(st, "E")["sure-winners"]).toBeUndefined();
  });

  it("names the honours nobody can see, in the suit being played", () => {
    // Hearts are led, and A K Q J are all in the two hands South can see.
    expect(value(st, "S", "missing-honours")).toBe("♥ none");
    // From East's chair the same suit is missing the K and the J (South's).
    expect(value(st, "E", "missing-honours")).toBe("♥ KJ");
  });

  it("falls back to trumps when no suit has been led yet", () => {
    const fresh = play({ tricks: [play().tricks[0]!, { leader: "N", plays: [] }] } as Partial<GameState>);
    // Trumps are hearts; from South's chair every heart honour is accounted for.
    expect(value(fresh, "S", "missing-honours")).toBe("♥ none");
    expect(all(fresh, "S")["missing-honours"]!.detail).toContain("trumps");
  });

  it("reads the longest suit of what is LEFT, not what was dealt", () => {
    // South has played a diamond, so hearts and clubs still tie at four.
    expect(value(st, "S", "longest-suit")).toBe("♥♣ 4");
    // West, who led a diamond, is down to four of them — and still longest.
    expect(value(st, "W", "longest-suit")).toBe("♦ 4");
  });
});

describe("nothing is counted from a hand the learner cannot see", () => {
  it("keeps dummy out of it until the opening lead", () => {
    // The auction is over and the contract is in, but no card has been played:
    // dummy is not down, so nothing may be counted from it.
    const beforeLead = play({
      hands: { ...DEALT },
      tricks: [{ leader: "W", plays: [] }],
      trickCount: { NS: 0, EW: 0 },
    } as Partial<GameState>);
    const made = all(beforeLead, "S");
    expect(made["combined-hcp"]).toBeUndefined();
    expect(made["combined-trumps"]).toBeUndefined();
    expect(made["sure-winners"]).toBeUndefined();
    // What the learner's own hand supports is still there.
    expect(made["my-trumps"]?.value).toBe("4");
    expect(made["tricks-remaining"]?.value).toBe("13");
    // And "still out" counts only their own thirteen: 13 − 4 = 9.
    expect(made["trumps-out"]?.value).toBe("9");
  });

  it("has no trump cards at all in notrump", () => {
    const nt = play({
      contract: { level: 3, strain: "N", declarer: "S", doubled: 0 },
    } as Partial<GameState>);
    const made = all(nt, "S");
    expect(made["my-trumps"]).toBeUndefined();
    expect(made["trumps-out"]).toBeUndefined();
    expect(made["combined-trumps"]).toBeUndefined();
    // The target follows the level, not the strain: 3NT needs nine.
    expect(made["contract-target"]?.value).toBe("9");
  });
});

describe("the census this layer is answerable for", () => {
  /** What kLesson.ts's title table already matches — the older producers. */
  const BY_TITLE: readonly KItemId[] = [
    "hcp", "distribution", "shape", "our-tricks", "their-tricks", "points-out-there",
    "points-hidden", "still-out", "winning-so-far", "my-role", "show-out-partner",
    "show-out-opponent",
  ];

  it("covers every buildable item the older producers do not", () => {
    const uncovered = K_ITEMS.filter(
      (k) => isBuildable(k) && !BY_TITLE.includes(k.id) && !K_FACT_IDS.includes(k.id),
    ).map((k) => k.id);
    expect(uncovered).toEqual([]);
  });

  it("claims nothing the registry does not declare buildable", () => {
    for (const id of K_FACT_IDS) {
      const def = K_ITEMS.find((k) => k.id === id)!;
      expect(def, `${id} is not in the registry`).toBeDefined();
      expect(isBuildable(def), `${id} is ${def.tier}, which has no deterministic producer`).toBe(true);
    }
  });

  it("asks for one item and gets one answer, in the order asked", () => {
    const facts = kFactsFor(["tricks-remaining", "my-trumps"], play(), "S");
    expect(facts.map((f) => f.id)).toEqual(["tricks-remaining", "my-trumps"]);
  });

  it("answers nothing for an id it cannot make, rather than throwing", () => {
    // A READ-tier item has no producer here at all.
    expect(kFactsFor(["partner-shown-points"], play(), "S")).toEqual([]);
  });
});
