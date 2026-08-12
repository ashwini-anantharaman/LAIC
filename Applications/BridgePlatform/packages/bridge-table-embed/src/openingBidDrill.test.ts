import { describe, expect, it } from "vitest";
import {
  callsMatch,
  judgeHand,
  markAnswers,
  normalizeCall,
  type BiddingChallengeAnswer,
} from "./openingBidDrill";
import { OPENING_BID_HANDS, hcp, validateDrillHands } from "./openingBidHands";

describe("normalizeCall", () => {
  it("keeps the pad's own notation untouched", () => {
    for (const c of ["1S", "1N", "2C", "3S", "7N", "P"]) expect(normalizeCall(c)).toBe(c);
  });

  it("reads NT as N, so 1NT and 1N are one bid", () => {
    expect(normalizeCall("1NT")).toBe("1N");
    expect(normalizeCall("2nt")).toBe("2N");
    expect(callsMatch("1NT", "1N")).toBe(true);
  });

  it("reads the many spellings of pass, double and redouble", () => {
    for (const p of ["P", "p", "Pass", " PASS ", "NB"]) expect(normalizeCall(p)).toBe("P");
    for (const x of ["X", "dbl", "Double"]) expect(normalizeCall(x)).toBe("X");
    for (const xx of ["XX", "rdbl", "Redouble"]) expect(normalizeCall(xx)).toBe("XX");
  });

  it("leaves nonsense alone rather than coercing it into a call", () => {
    expect(normalizeCall("8S")).toBe("8S");
    expect(normalizeCall("banana")).toBe("BANANA");
    expect(callsMatch("banana", "1S")).toBe(false);
  });
});

describe("judgeHand — the author's bid is the answer", () => {
  const spades = OPENING_BID_HANDS[0]!; // no 1, bid 1S

  it("matches the author's call", () => {
    expect(judgeHand(spades, 0, "1S").matched).toBe(true);
  });

  it("matches it however the learner spelled it", () => {
    const nt = OPENING_BID_HANDS.find((h) => h.bid === "1N")!;
    expect(judgeHand(nt, 0, "1NT").matched).toBe(true);
    const pass = OPENING_BID_HANDS.find((h) => h.bid === "P")!;
    expect(judgeHand(pass, 0, "Pass").matched).toBe(true);
  });

  it("does not match a different call, however close", () => {
    expect(judgeHand(spades, 0, "1H").matched).toBe(false);
    expect(judgeHand(spades, 0, "2S").matched).toBe(false);
    expect(judgeHand(spades, 0, "P").matched).toBe(false);
  });

  it("carries the author's hand number and both calls, normalised", () => {
    expect(judgeHand(spades, 4, "1nt")).toEqual({
      index: 4,
      no: 1,
      yourCall: "1N",
      authorCall: "1S",
      matched: false,
    });
  });

  it("judges every authored hand right when the author's own bid is given", () => {
    for (const [i, h] of OPENING_BID_HANDS.entries())
      expect(judgeHand(h, i, h.bid).matched).toBe(true);
  });
});

describe("markAnswers", () => {
  const answer = (index: number, matched: boolean): BiddingChallengeAnswer => ({
    index,
    no: index + 1,
    yourCall: matched ? "1S" : "1H",
    authorCall: "1S",
    matched,
  });

  it("is empty and incomplete before anything is answered", () => {
    const m = markAnswers([], 25);
    expect(m).toMatchObject({ handsTotal: 25, handsDone: 0, completed: false, matched: 0, percent: 0 });
  });

  it("counts matches and rates every answered hand", () => {
    const m = markAnswers([answer(0, true), answer(1, false), answer(2, true)], 5);
    expect(m).toMatchObject({ handsDone: 3, matched: 2, rated: 3, scoreText: "2/3", scoreValue: 2 });
    expect(m.percent).toBe(67);
    expect(m.completed).toBe(false);
  });

  it("completes on the last hand", () => {
    const m = markAnswers([answer(0, true), answer(1, true)], 2);
    expect(m.completed).toBe(true);
    expect(m.percent).toBe(100);
  });
});

/**
 * The check on the teaching data.
 *
 * THE FIVE SHORT HANDS ARE NOW PATCHED. Hands 6, 9, 10, 17 and 21 arrived with
 * twelve cards; the author completed them mid-build (see openingBidHands.ts's
 * header, which records every card added and the one CHANGED — hand 9's ♠K).
 * So the shipped set is clean today, and the first test below pins that.
 *
 * The validator is tested against SYNTHETIC sets rather than against whichever
 * faults the shipped data happens to carry. That is the point of a guard: it has
 * to catch the next twelve-card hand, and a test that only asserted "the current
 * set has five" would have started failing the moment the author fixed them —
 * reporting an improvement as a regression.
 */
describe("validateDrillHands", () => {
  /** The five as they were supplied, before the author completed them. */
  const short12 = [6, 9, 10, 17, 21].map((no) => ({
    no,
    hand: OPENING_BID_HANDS.find((h) => h.no === no)!.hand.slice(0, 12),
    bid: "1N",
    why: "no point count stated",
  }));

  it("catches all five short hands, and says how short each one is", () => {
    const problems = validateDrillHands(short12);
    expect(problems.map((p) => p.no)).toEqual([6, 9, 10, 17, 21]);
    for (const p of problems) {
      expect(p.kind).toBe("short");
      expect(p.detail).toBe("12 cards, not 13");
    }
  });

  it("catches a short hand among sound ones without touching the sound ones", () => {
    const mixed = [OPENING_BID_HANDS[0]!, short12[1]!, OPENING_BID_HANDS[2]!];
    expect(validateDrillHands(mixed)).toEqual([
      { no: 9, kind: "short", detail: "12 cards, not 13" },
    ]);
  });

  it("catches a note whose stated HCP the cards do not hold", () => {
    const h = OPENING_BID_HANDS[0]!;
    const lie = { ...h, why: `${hcp(h.hand) + 3} HCP, 5-card spade suit` };
    expect(validateDrillHands([lie])).toEqual([
      { no: h.no, kind: "hcp", detail: `note says ${hcp(h.hand) + 3} HCP, cards hold ${hcp(h.hand)}` },
    ]);
  });

  it("reports both faults on one hand", () => {
    expect(validateDrillHands([{ no: 99, hand: [], bid: "P", why: "3 HCP" }])).toEqual([
      { no: 99, kind: "short", detail: "0 cards, not 13" },
      { no: 99, kind: "hcp", detail: "note says 3 HCP, cards hold 0" },
    ]);
  });

  it("says nothing about a note that states no point count", () => {
    const h = OPENING_BID_HANDS[0]!;
    expect(validateDrillHands([{ ...h, why: "five spades and an opening hand" }])).toEqual([]);
  });

  it("finds nothing wrong with the authored set as it now stands", () => {
    expect(validateDrillHands()).toEqual([]);
    expect(OPENING_BID_HANDS).toHaveLength(25);
    for (const h of OPENING_BID_HANDS) expect(h.hand).toHaveLength(13);
  });
});
