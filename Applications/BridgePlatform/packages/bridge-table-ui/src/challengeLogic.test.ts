import { describe, expect, it } from "vitest";
import {
  COMPARE_IDLE,
  comparePair,
  comparePicked,
  compareReduce,
  compareRowInert,
  displayedValue,
  leaderFlags,
  rankRows,
  type CompareState,
} from "./challengeLogic";

// ---------------------------------------------------------------------------
// Shared ranks (spec A5: "Ties share a rank")
// ---------------------------------------------------------------------------

describe("rankRows", () => {
  it("orders by value descending and numbers from 1", () => {
    const out = rankRows([
      { name: "Tomas", value: -3 },
      { name: "You", value: 14 },
      { name: "Priya", value: 6 },
    ]);
    expect(out.map((r) => [r.name, r.rank])).toEqual([
      ["You", 1],
      ["Priya", 2],
      ["Tomas", 3],
    ]);
  });

  it("shares a rank on a tie and skips the ranks the tie consumed", () => {
    const out = rankRows([
      { name: "A", value: 10 },
      { name: "B", value: 4 },
      { name: "C", value: 4 },
      { name: "D", value: 1 },
    ]);
    // competition ranking: 1, 2, 2, 4 - never 1, 2, 2, 3
    expect(out.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
    expect(out.map((r) => r.name)).toEqual(["A", "B", "C", "D"]);
  });

  it("keeps the caller's order between tied rows (stable sort)", () => {
    const out = rankRows([
      { name: "Lena", value: 4 },
      { name: "Devang", value: 4 },
      { name: "You", value: 9 },
    ]);
    expect(out.map((r) => r.name)).toEqual(["You", "Lena", "Devang"]);
    expect(out.map((r) => r.rank)).toEqual([1, 2, 2]);
  });

  it("shares the top rank when everyone is level", () => {
    expect(rankRows([{ value: 0 }, { value: 0 }, { value: 0 }]).map((r) => r.rank)).toEqual([1, 1, 1]);
  });

  it("leaves order and ranks alone when every row is already ranked", () => {
    const out = rankRows([
      { name: "B", rank: 2, value: 1 },
      { name: "A", rank: 1, value: 99 },
      { name: "C", rank: 2, value: 1 },
    ]);
    expect(out.map((r) => [r.name, r.rank])).toEqual([
      ["B", 2],
      ["A", 1],
      ["C", 2],
    ]);
  });

  it("derives ranks when only some rows carry one", () => {
    const out = rankRows([
      { name: "A", rank: 1, value: 5 },
      { name: "B", value: 8 },
    ]);
    expect(out.map((r) => [r.name, r.rank])).toEqual([
      ["B", 1],
      ["A", 2],
    ]);
  });

  it("sinks rows with no value to the bottom and does not crash on an empty field", () => {
    const out = rankRows([{ name: "A" }, { name: "B", value: 3 }]);
    expect(out.map((r) => [r.name, r.rank])).toEqual([
      ["B", 1],
      ["A", 2],
    ]);
    expect(rankRows([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Board-row leader (spec A5: computed on the DISPLAYED figure, ties all tint)
// ---------------------------------------------------------------------------

describe("displayedValue", () => {
  it("prefers the supplied number", () => {
    expect(displayedValue({ text: "nonsense", value: 7 })).toBe(7);
  });

  it("reads a printed figure back, sign, separators and percent included", () => {
    expect(displayedValue({ text: "+3" })).toBe(3);
    expect(displayedValue({ text: "-2" })).toBe(-2);
    expect(displayedValue({ text: "55%" })).toBe(55);
    expect(displayedValue({ text: "+1,430" })).toBe(1430);
    expect(displayedValue({ text: "0" })).toBe(0);
  });

  it("is NaN when there is nothing to read", () => {
    expect(Number.isNaN(displayedValue({ text: "" }))).toBe(true);
    expect(Number.isNaN(displayedValue({ text: "-" }))).toBe(true);
    expect(Number.isNaN(displayedValue(undefined))).toBe(true);
  });
});

describe("leaderFlags", () => {
  it("tints the single best cell in the row", () => {
    expect(leaderFlags([{ value: 3 }, { value: 11 }, { value: -4 }])).toEqual([false, true, false]);
  });

  it("tints every cell of a tied best (ties all highlight)", () => {
    expect(leaderFlags([{ value: 6 }, { value: 6 }, { value: 1 }])).toEqual([true, true, false]);
  });

  it("uses the DISPLAYED figure, so a rounded text can create a tie the raw values do not have", () => {
    // 54.6 and 54.4 both print "55" -> what is tinted matches what is read.
    expect(leaderFlags([{ text: "55" }, { text: "55" }, { text: "41" }])).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("lets BEN's column lead a board - it is a column like any other here", () => {
    const flags = leaderFlags([{ value: 2 }, { value: 5 }, { value: 9 } /* BEN */]);
    expect(flags).toEqual([false, false, true]);
  });

  it("tints nothing when the row has no readable figure", () => {
    expect(leaderFlags([{ text: "" }, { text: "" }])).toEqual([false, false]);
    expect(leaderFlags([])).toEqual([]);
  });

  it("ignores unreadable cells rather than treating them as zero", () => {
    expect(leaderFlags([{ text: "" }, { value: -5 }])).toEqual([false, true]);
  });
});

// ---------------------------------------------------------------------------
// Compare selection: two cells, same board row (spec A5/A6)
// ---------------------------------------------------------------------------

const pick = (state: CompareState, boardNo: number, key: string) =>
  compareReduce(state, { type: "pick", boardNo, key });

describe("compareReduce", () => {
  it("ignores picks until selection mode is started", () => {
    const s = pick(COMPARE_IDLE, 3, "You");
    expect(s).toBe(COMPARE_IDLE);
    expect(s.picks).toEqual([]);
  });

  it("starts empty and takes the first pick", () => {
    const started = compareReduce(COMPARE_IDLE, { type: "start" });
    expect(started).toEqual({ active: true, picks: [] });
    const one = pick(started, 3, "You");
    expect(one.picks).toEqual([{ boardNo: 3, key: "You" }]);
    expect(comparePair(one)).toBeNull();
  });

  it("accepts a second pick in the SAME row and yields the pair", () => {
    let s = compareReduce(COMPARE_IDLE, { type: "start" });
    s = pick(s, 3, "You");
    s = pick(s, 3, "BEN");
    expect(comparePair(s)).toEqual({ boardNo: 3, a: "You", b: "BEN" });
  });

  it("refuses a second pick in another row, and that row reads as inert", () => {
    let s = compareReduce(COMPARE_IDLE, { type: "start" });
    s = pick(s, 3, "You");
    const refused = pick(s, 5, "BEN");
    expect(refused).toBe(s); // unchanged, referentially
    expect(compareRowInert(s, 5)).toBe(true);
    expect(compareRowInert(s, 3)).toBe(false);
  });

  it("has no inert rows before the first pick - every row is still pickable", () => {
    const started = compareReduce(COMPARE_IDLE, { type: "start" });
    expect(compareRowInert(started, 1)).toBe(false);
    expect(compareRowInert(started, 8)).toBe(false);
    expect(compareRowInert(COMPARE_IDLE, 1)).toBe(false);
  });

  it("de-selects when the same cell is picked again", () => {
    let s = compareReduce(COMPARE_IDLE, { type: "start" });
    s = pick(s, 3, "You");
    s = pick(s, 3, "BEN");
    expect(comparePicked(s, 3, "You")).toBe(true);
    s = pick(s, 3, "You");
    expect(s.picks).toEqual([{ boardNo: 3, key: "BEN" }]);
    expect(comparePicked(s, 3, "You")).toBe(false);
    expect(comparePair(s)).toBeNull();
    // and the row is free again for a different second pick
    s = pick(s, 3, "Priya");
    expect(comparePair(s)).toEqual({ boardNo: 3, a: "BEN", b: "Priya" });
  });

  it("de-selecting the first pick frees every row again", () => {
    let s = compareReduce(COMPARE_IDLE, { type: "start" });
    s = pick(s, 3, "You");
    s = pick(s, 3, "You");
    expect(s.picks).toEqual([]);
    expect(compareRowInert(s, 5)).toBe(false);
    s = pick(s, 5, "BEN");
    expect(s.picks).toEqual([{ boardNo: 5, key: "BEN" }]);
  });

  it("refuses a third pick", () => {
    let s = compareReduce(COMPARE_IDLE, { type: "start" });
    s = pick(s, 3, "You");
    s = pick(s, 3, "BEN");
    const third = pick(s, 3, "Priya");
    expect(third).toBe(s);
    expect(comparePair(s)).toEqual({ boardNo: 3, a: "You", b: "BEN" });
  });

  it("cancel drops the picks and leaves selection mode", () => {
    let s = compareReduce(COMPARE_IDLE, { type: "start" });
    s = pick(s, 3, "You");
    s = compareReduce(s, { type: "cancel" });
    expect(s).toEqual(COMPARE_IDLE);
    expect(comparePair(s)).toBeNull();
  });

  it("restarting always begins from an empty pair", () => {
    let s = compareReduce(COMPARE_IDLE, { type: "start" });
    s = pick(s, 2, "You");
    s = compareReduce(s, { type: "start" });
    expect(s).toEqual({ active: true, picks: [] });
  });

  it("never mutates the state it was handed", () => {
    const started = compareReduce(COMPARE_IDLE, { type: "start" });
    const one = pick(started, 4, "You");
    expect(started.picks).toEqual([]);
    expect(one.picks).toEqual([{ boardNo: 4, key: "You" }]);
  });
});
