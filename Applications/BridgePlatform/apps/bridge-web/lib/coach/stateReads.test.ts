// Claude's Position reads — the gate and the composer, tested pure.
//
// The model's claims must never wear arithmetic's authority unchecked: a
// number outside its bounds is dropped ALONE (nothing here is secret, only
// more or less sane), and the composed cards keep the deterministic parts —
// the last-bid cards, the combined-points sum, the fit count — as OUR
// arithmetic on top of the model's ranges.

import type { Call, Card, Seat, Suit } from "@bridge/events";
import { describe, expect, it } from "vitest";

import { readsToCards, validateReads } from "./stateReads";

const RANKS: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const cards = (spec: string): Card[] =>
  spec.split(/\s+/).map((t) => ({ suit: t[0] as Suit, rank: RANKS[t[1]!]! as Card["rank"] }));

/** ♠AK543 ♥QJ2 ♦T93 ♣72 — 10 HCP, five spades. */
const HAND = cards("SA SK S5 S4 S3 HQ HJ H2 DT D9 D3 C7 C2");
const call = (seat: Seat, c: string) => ({ seat, call: c as Call });

describe("validateReads — the sanity gate", () => {
  it("keeps sane claims and clamps or drops the silly ones, one by one", () => {
    const reads = validateReads({
      partner: {
        points: { min: 12, max: 21 },
        suits: [
          { suit: "h", min: 5 },
          { suit: "S", min: 2 }, // below the 4-card floor — dropped alone
          { suit: "X", min: 5 }, // not a suit — dropped alone
        ],
        because: "An opening bid at the one level.",
      },
      opponents: [
        { seat: "e", points: { min: 8, max: 16 }, because: "An overcall." },
        { seat: "??", points: { min: 5 } }, // not a seat — dropped whole
      ],
    });
    expect(reads.partner?.points).toEqual({ min: 12, max: 21 });
    expect(reads.partner?.suits).toEqual([{ suit: "H", min: 5 }]);
    expect(reads.opponents).toHaveLength(1);
    expect(reads.opponents?.[0]?.seat).toBe("E");
  });

  it("drops an inverted range, and returns nothing for junk", () => {
    expect(validateReads({ partner: { points: { min: 20, max: 10 } } }).partner).toBeUndefined();
    expect(validateReads("nonsense")).toEqual({});
    expect(validateReads(null)).toEqual({});
  });

  it("bounds the inferences: real panes only, two per pane, four total", () => {
    const inf = (pane: string, n: number) => ({
      clue: `Clue ${pane} ${n}…`,
      conclusion: `so ${n}`,
      pane,
    });
    const reads = validateReads({
      inferences: [
        inf("partner", 1),
        inf("partner", 2),
        inf("partner", 3), // third for the pane — dropped
        inf("kitchen", 1), // not a pane — dropped
        { clue: "no conclusion…", pane: "theirs" }, // incomplete — dropped
        inf("theirs", 1),
        inf("advanced", 1),
        inf("advanced", 2), // fifth overall — dropped by the total cap
      ],
    });
    expect(reads.inferences).toHaveLength(4);
    expect(reads.inferences?.filter((i) => i.pane === "partner")).toHaveLength(2);
    expect(reads.inferences?.some((i) => (i.pane as string) === "kitchen")).toBe(false);
  });
});

describe("readsToCards — the composer", () => {
  const auction = [call("N", "1H"), call("E", "1S"), call("S", "P"), call("W", "P")];

  it("builds partner, partnership and theirs cards — sums and fit are OUR math", () => {
    const out = readsToCards(
      {
        partner: { points: { min: 12, max: 21 }, suits: [{ suit: "H", min: 5 }], because: "Opened 1♥." },
        opponents: [{ seat: "E", read: { points: { min: 8, max: 16 }, because: "Overcalled 1♠." } }],
      },
      { auction, seat: "S", hand: HAND },
    );
    const byTitle = new Map(out.map((c) => [c.title, c]));
    expect(byTitle.get("Partner bid")?.value).toBe("1♥");
    expect(byTitle.get("Partner's points")?.value).toBe("12–21");
    // 10 of ours + partner's 12–21 = 22–31, computed here, not by the model.
    expect(byTitle.get("Together")?.value).toBe("22–31");
    // Partner's 5 hearts + our 3 = exactly the eight-card bar.
    expect(byTitle.get("A fit")?.value).toBe("8+ ♥");
    expect(byTitle.get("East bid")?.value).toBe("1♠");
    expect(byTitle.get("East's points")?.value).toBe("8–16");
    expect(byTitle.get("Partner bid")?.group).toBe("partner");
    expect(byTitle.get("Together")?.group).toBe("partnership");
    expect(byTitle.get("East bid")?.group).toBe("theirs");
  });

  it("finds the fit from the model's length plus our own cards", () => {
    const out = readsToCards(
      { partner: { suits: [{ suit: "S", min: 4 }] } },
      { auction: [call("N", "1S"), call("E", "P")], seat: "S", hand: HAND },
    );
    const fit = out.find((c) => c.title === "A fit");
    // Partner's 4+ spades plus our five = a nine-card fit.
    expect(fit?.value).toBe("9+ ♠");
  });

  it("still shows the raw last-bid cards when the model read nothing", () => {
    const out = readsToCards({}, { auction, seat: "S", hand: HAND });
    const titles = out.map((c) => c.title);
    expect(titles).toContain("Partner bid");
    expect(titles).toContain("East bid");
    expect(titles).not.toContain("Partner's points");
  });

  it("composes an inference as clue-on-the-seal, conclusion inside", () => {
    const out = readsToCards(
      {
        inferences: [
          {
            clue: "West passed over 1♥…",
            conclusion: "at most ~6 points",
            because: "With more, West would have acted over the opening.",
            pane: "theirs",
          },
        ],
      },
      { auction, seat: "S", hand: HAND },
    );
    const inf = out.find((c) => c.title === "West passed over 1♥…");
    expect(inf?.value).toBe("at most ~6 points");
    expect(inf?.group).toBe("theirs");
    expect(inf?.detail).toContain("would have acted");
  });
});
