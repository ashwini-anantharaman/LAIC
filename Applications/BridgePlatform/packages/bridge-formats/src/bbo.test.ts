// BBO Hand Viewer links -> boards. The expectations here are taken from
// handviewer.js's own `loadParams`, quoted in bbo.ts: hands in S,W,N,E order,
// dealer digits S=1 W=2 N=3 E=4 defaulting to North, `v` passed through to sv.

import { describe, expect, it } from "vitest";
import { linFromBbo, parseBbo } from "./bbo";

const HV = "https://www.bridgebase.com/tools/handviewer.html";

/** A complete deal, as the four hands BBO writes them. */
const SOUTH = "SAKQJHAKQDAKQCAKQ";
const WEST = "S32H32D32C32456";
const NORTH = "ST98H98D98C98J";
const EAST = "S7654H7654D7654C7";

describe("linFromBbo", () => {
  it("takes the lin= a share link carries", () => {
    const lin = "pn|S,W,N,E|md|3SAKQ...|sv|b|";
    const res = linFromBbo(`${HV}?lin=${encodeURIComponent(lin)}`);
    expect(res).toEqual({ ok: true, lin });
  });

  it("decodes a link that was encoded twice on its way over", () => {
    const lin = "md|1SAKQ...|sv|o|";
    const once = encodeURIComponent(lin);
    const res = linFromBbo(`${HV}?lin=${encodeURIComponent(once)}`);
    expect(res.ok && res.lin).toBe(lin);
  });

  it("assembles the hand-parameter form in BBO's own S,W,N,E order", () => {
    const res = linFromBbo(
      `${HV}?s=${SOUTH}&w=${WEST}&n=${NORTH}&e=${EAST}&d=w&v=e&b=7`,
    );
    expect(res.ok && res.lin).toBe(
      `md|2${SOUTH},${WEST},${NORTH},${EAST}|sv|e|ah|Board 7|`,
    );
  });

  it("defaults an unnamed dealer to North, exactly as handviewer.js does", () => {
    const res = linFromBbo(`${HV}?s=${SOUTH}&w=${WEST}&n=${NORTH}&e=${EAST}`);
    expect(res.ok && res.lin.startsWith("md|3")).toBe(true);
  });

  it("reads every dealer letter", () => {
    for (const [letter, digit] of [["s", "1"], ["w", "2"], ["n", "3"], ["e", "4"]]) {
      const res = linFromBbo(`${HV}?s=${SOUTH}&d=${letter}`);
      expect(res.ok && res.lin.startsWith(`md|${digit}`), letter).toBe(true);
    }
  });

  it("takes a LIN string pasted straight in", () => {
    const lin = "md|1SAKQ...|";
    expect(linFromBbo(lin)).toEqual({ ok: true, lin });
  });

  it("refuses to go and FETCH a linurl the pasted link names", () => {
    const res = linFromBbo(`${HV}?linurl=https://example.com/board.lin`);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toContain("LIN file");
  });

  it("says what is wrong with a link that carries no deal", () => {
    expect(linFromBbo(`${HV}?pc=y`).ok).toBe(false);
    expect(linFromBbo(`${HV}?lin=pn|S,W,N,E|`).ok).toBe(false);
    expect(linFromBbo("").ok).toBe(false);
    expect(linFromBbo("just some words").ok).toBe(false);
  });
});

describe("parseBbo", () => {
  it("turns a hand-parameter link into a board the wizard can use", () => {
    const res = parseBbo(`${HV}?s=${SOUTH}&w=${WEST}&n=${NORTH}&e=${EAST}&d=e&v=n&b=4`);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const [board] = res.boards;
    expect(board!.dealer).toBe("E");
    expect(board!.vul).toBe("ns");
    expect(board!.name).toBe("Board 4");
    // South's hand came back on South, not rotated onto another seat.
    const spades = board!.hands.S.filter((c) => c.suit === "S").map((c) => c.rank);
    expect(spades).toEqual([14, 13, 12, 11]);
    for (const seat of ["N", "E", "S", "W"] as const) {
      expect(board!.hands[seat], seat).toHaveLength(13);
    }
  });

  it("carries a multi-board LIN through as several boards", () => {
    const lin =
      `qx|o1|md|1${SOUTH},${WEST},${NORTH},${EAST}|sv|o|pg||` +
      `qx|o2|md|2${SOUTH},${WEST},${NORTH},${EAST}|sv|b|pg||`;
    const res = parseBbo(`${HV}?lin=${encodeURIComponent(lin)}`);
    expect(res.ok && res.boards).toHaveLength(2);
    expect(res.ok && res.boards[1]!.vul).toBe("both");
  });
});
