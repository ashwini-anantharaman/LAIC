import { describe, it, expect } from "vitest";
import { encodeCard, solvePosition, type Position, type SeatId } from "./solver";

function pos(
  hands: Record<SeatId, string[]>,
  toPlay: SeatId,
  trump: number,
  trick: { seat: SeatId; card: string }[] = [],
): Position {
  return {
    hands: {
      N: hands.N.map(encodeCard),
      E: hands.E.map(encodeCard),
      S: hands.S.map(encodeCard),
      W: hands.W.map(encodeCard),
    },
    trick: trick.map((t) => ({ seat: t.seat, code: encodeCard(t.card) })),
    toPlay,
    trump,
  };
}

describe("double-dummy solver", () => {
  it("takes the one available trick with a top card (NT)", () => {
    const p = pos({ S: ["SA"], W: ["S2"], N: ["S3"], E: ["S4"] }, "S", -1);
    const r = solvePosition(p);
    expect(r.bestTricks).toBe(1);
    expect(r.bestCards).toEqual(["SA"]);
  });

  it("scores a suit-preference ruff: leading the ace first wins 2, low first only 1", () => {
    // South (no trumps) has HA H2; dummy N has a small trump S3 + H4.
    // Cash HA, then lead H2 for North to ruff = 2 tricks. Lead H2 first and a
    // defender wins the heart, killing the ruff = only 1 trick.
    const p = pos(
      { S: ["HA", "H2"], N: ["S3", "H4"], W: ["H5", "H6"], E: ["H7", "H8"] },
      "S",
      0, // spades trump
    );
    const r = solvePosition(p);
    const byCard = Object.fromEntries(r.scores.map((s) => [s.card, s.tricks]));
    expect(byCard["HA"]).toBe(2);
    expect(byCard["H2"]).toBe(1);
    expect(r.bestTricks).toBe(2);
    expect(r.bestCards).toEqual(["HA"]);
  });

  it("evaluates a mid-trick position (defender to play third hand)", () => {
    // Partner (E via West lead?) — simple: only spades, all follow, top wins.
    // Trick so far: W led S2; N played SK. South (3rd hand) holds SA, S4.
    const p = pos(
      { S: ["SA", "S4"], N: [], W: [], E: ["S3", "S5"] },
      "S",
      -1,
      [
        { seat: "W", card: "S2" },
        { seat: "N", card: "SK" },
      ],
    );
    // N (South's partner) already played SK which is winning; South should not
    // waste the ace — but double-dummy tricks for NS across the remaining play:
    const r = solvePosition(p);
    expect(r.bestTricks).toBeGreaterThanOrEqual(1);
  });
});
