// The reasoning scaffold. Two classes of assertion here, and the second matters
// more than the first:
//
//   · that the inferences are RIGHT — a wrong point count is worse than none;
//   · that nothing it says could only be known by seeing a concealed hand.
//
// The second is enforced the hard way: a deal where the hidden hands hold every
// honour, and an assertion that none of them is ever named.

import type { GameState } from "@bridge/engine";
import type { Card, Seat, Suit } from "@bridge/events";
import { describe, expect, it } from "vitest";

import { thinkAid } from "./think";

const R: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const cards = (spec: string): Card[] =>
  spec.trim().split(/\s+/).map((t) => ({ suit: t[0] as Suit, rank: R[t[1]!]! as Card["rank"] }));
const one = (spec: string): Card => cards(spec)[0]!;
const call = (seat: Seat, c: string) => ({ seat, call: c as never });

/** ♠AQ3 ♥J8 ♦Q5 ♣KJT753 — the screenshot's hand. 13 HCP. */
const HAND = cards("SA SQ S3 HJ H8 DQ D5 CK CJ CT C7 C5 C3");

function state(over: Partial<GameState> = {}): GameState {
  return {
    boardRef: "b", dealer: "N", vul: "none", phase: "auction", turn: "S",
    hands: { N: [], E: [], S: HAND, W: [] },
    auction: [], contract: null, tricks: [], trickCount: { NS: 0, EW: 0 },
    ...over,
  } as GameState;
}
const text = (a: ReturnType<typeof thinkAid>) =>
  [
    a!.known.join(" "),
    a!.candidates.map((c) => `${c.label} ${c.note ?? ""}`).join(" "),
    a!.noChoice ?? "",
  ].join(" ");

const CONTRACT = { level: 3, strain: "N", doubled: 0, declarer: "E" } as GameState["contract"];

describe("thinkAid — nothing to scaffold", () => {
  it("is null for a watcher", () => {
    expect(thinkAid(state(), null)).toBeNull();
  });

  it("tells dummy there is nothing to decide rather than offering cards", () => {
    // W is dummy for declarer E.
    const a = thinkAid(state({ phase: "play", turn: "E", contract: CONTRACT }), "W")!;
    expect(a.candidates).toEqual([]);
    expect(a.noChoice).toContain("dummy");
  });

  it("is always degraded — layer 2 has not been built", () => {
    const a = thinkAid(state(), "S")!;
    expect(a.degraded).toBe(true);
    expect(a.question).toBeUndefined();
  });
});

describe("thinkAid — the auction", () => {
  it("subtracts your points from the pack rather than guessing", () => {
    expect(thinkAid(state(), "S")!.known[0]).toBe(
      "27 of the 40 points sit in the other three hands.",
    );
  });

  it("distinguishes a pass that ends the auction from one that does not", () => {
    const carriesOn = state({ auction: [call("N", "1D"), call("E", "P")], turn: "S" });
    expect(text(thinkAid(carriesOn, "S"))).toContain("The auction carries on");

    const ends = state({ auction: [call("W", "1D"), call("N", "P"), call("E", "P")], turn: "S" });
    expect(text(thinkAid(ends, "S"))).toContain("The auction ends — West plays 1♦");
  });

  it("warns that a pass throws the board in when nobody has bid", () => {
    const s = state({ auction: [call("N", "P"), call("E", "P"), call("S", "P")], turn: "W" });
    expect(text(thinkAid(s, "W"))).toContain("thrown in");
  });

  it("says whether the auction is contested, which the grid cannot", () => {
    const ours = state({ auction: [call("N", "1D"), call("E", "P")], turn: "S" });
    expect(text(thinkAid(ours, "S"))).toContain("Only your side has bid");

    const theirs = state({ auction: [call("W", "1S")], turn: "N" });
    expect(text(thinkAid(theirs, "N"))).toContain("partner hasn");

    const both = state({ auction: [call("W", "1S"), call("N", "2C")], turn: "E" });
    expect(text(thinkAid(both, "E"))).toContain("Both sides are bidding");
  });

  it("offers the cheapest call in each strain plus pass — never all 35", () => {
    const a = thinkAid(state({ auction: [call("N", "1D"), call("E", "P")], turn: "S" }), "S")!;
    const labels = a.candidates.map((c) => c.label);
    expect(labels[0]).toBe("Pass");
    // 1♦ is bid, so clubs come at the 2 level while the majors are still cheap.
    expect(labels).toContain("2♣");
    expect(labels).toContain("1♥");
    expect(labels).toContain("1♠");
    expect(labels).toContain("1NT");
    expect(labels).not.toContain("3♣");
    expect(a.candidates.length).toBeLessThanOrEqual(8);
  });

  it("marks nothing and ranks nothing — no candidate is offered as the choice", () => {
    const a = thinkAid(state({ auction: [call("N", "1D"), call("E", "P")], turn: "S" }), "S")!;
    expect(a.candidates.length).toBeGreaterThan(1);
    for (const c of a.candidates) {
      expect(c.does).toBeUndefined();
      // Notes are factual qualifiers, never a reason to prefer one.
      expect(c.note ?? "").not.toMatch(/best|should|better|recommend|right|correct/i);
    }
  });
});

describe("thinkAid — the play", () => {
  const play = (over: Partial<GameState> = {}) =>
    state({ phase: "play", contract: CONTRACT, turn: "S", ...over });

  it("counts the points it cannot see, and says between whom", () => {
    const s = play({ hands: { N: cards("HA HK"), E: cards("SK SJ"), S: HAND, W: cards("DA DK DJ") } });
    // 40 − S's 13 − dummy W's 8 (A=4, K=3, J=1) = 19.
    expect(thinkAid(s, "S")!.known[0]).toBe(
      "19 points sit between partner and East.",
    );
  });

  it("treats showing out as proof of a void, and only for hands it cannot see", () => {
    const s = play({
      hands: { N: cards("HA"), E: cards("SK"), S: HAND, W: cards("DA") },
      tricks: [
        {
          leader: "E",
          plays: [
            { seat: "E", card: one("D3") },
            { seat: "S", card: one("D5") },
            { seat: "W", card: one("D9") },
            { seat: "N", card: one("H2") }, // partner pitched a heart
          ],
          winner: "W",
        },
      ],
    });
    const t = text(thinkAid(s, "S"));
    expect(t).toContain("Partner has no diamonds");
    expect(t).not.toContain("West has no"); // dummy is visible; no inference needed
  });

  it("counts what is still out in the suit being played", () => {
    const s = play({
      hands: { N: [], E: [], S: cards("DQ D5"), W: cards("DA DK DJ") },
      tricks: [{ leader: "E", plays: [{ seat: "E", card: one("D3") }] }],
    });
    // Accounted: S 2 + dummy 3 + East's played 1 = 6. Outstanding = 7.
    expect(text(thinkAid(s, "S"))).toContain("7 ♦ are still in the hidden hands");
  });

  it("says who is winning the trick so far", () => {
    const s = play({
      hands: { N: [], E: [], S: cards("DQ D5"), W: cards("DA") },
      tricks: [
        { leader: "E", plays: [{ seat: "E", card: one("D3") }, { seat: "S", card: one("D5") }] },
      ],
    });
    expect(text(thinkAid(s, "S"))).toContain("You are winning it with the 5♦");
  });

  it("lowest, highest and any honour between — not every legal card", () => {
    const s = play({
      hands: { N: [], E: [], S: cards("DK DT D6 D4 D2"), W: [] },
      tricks: [{ leader: "E", plays: [{ seat: "E", card: one("D3") }] }],
    });
    // The 4 and the 6 add no decision the 2 does not already carry.
    expect(thinkAid(s, "S")!.candidates.map((c) => c.label)).toEqual(["2♦", "10♦", "K♦"]);
  });

  it("a discard is one card per suit — the suit is the decision, not the card", () => {
    const s = play({
      hands: { N: [], E: [], S: cards("SA S3 HJ H8 C5 C3"), W: [] },
      tricks: [{ leader: "E", plays: [{ seat: "E", card: one("D3") }] }],
    });
    const a = thinkAid(s, "S")!;
    expect(a.candidates.map((c) => c.label)).toEqual(["3♠", "8♥", "3♣"]);
    expect(a.candidates[0]!.note).toContain("spade");
  });

  it("says so when there is no choice at all", () => {
    const s = play({
      hands: { N: [], E: [], S: cards("DQ"), W: [] },
      tricks: [{ leader: "E", plays: [{ seat: "E", card: one("D3") }] }],
    });
    const a = thinkAid(s, "S")!;
    expect(a.candidates).toEqual([]);
    expect(a.noChoice).toBe("Only one legal card: the Q♦.");
  });

  it("INVARIANT — never names a card only a concealed hand could hold", () => {
    // Every honour outside the learner's hand and dummy sits with N and E.
    const s = play({
      hands: {
        N: cards("HA HK HQ SK SJ"),
        E: cards("CA CQ DA DK DJ"),
        S: cards("DQ D5 D2 S3 C3"),
        W: cards("D9 D8 S4 C4 H2"),
      },
      tricks: [{ leader: "E", plays: [{ seat: "E", card: one("D3") }] }],
    });
    const t = text(thinkAid(s, "S"));
    for (const hidden of ["A♥", "K♥", "Q♥", "K♠", "J♠", "A♣", "Q♣", "A♦", "K♦", "J♦"]) {
      expect(t, `leaked ${hidden}`).not.toContain(hidden);
    }
    // And it still said something useful about the position.
    expect(t).toContain("points sit between");
  });
});

describe("thinkAid — declarer plays two hands", () => {
  // The board from the bug report. South declares 3♥, North is dummy and face up,
  // West has led the 2♦ — so the card to play is one of DUMMY's diamonds.
  const SOUTH = cards("SA SK S5 S4 S2 HK HT H8 CJ C9 DQ D9 D7");
  const NORTH = cards("SQ ST S8 HA H9 H7 H5 H4 C6 C3 DJ DT D6");
  const HEARTS = { level: 3, strain: "H", doubled: 0, declarer: "S" } as GameState["contract"];

  const atDummysTurn = () =>
    state({
      phase: "play", contract: HEARTS, turn: "N",
      hands: { N: NORTH, E: cards("SJ S9 S7 HQ HJ H6 H3 CA CK CQ DA DK D5"), S: SOUTH, W: cards("S6 S3 HT2 C8 C7 C5 C4 C2 DT3 D8 D4 D2 D3") },
      tricks: [{ leader: "W", plays: [{ seat: "W", card: one("D2") }] }],
    });

  it("offers DUMMY's cards when it is dummy's turn, not the declarer's own", () => {
    const a = thinkAid(atDummysTurn(), "S")!;
    const labels = a.candidates.map((c) => c.label);
    // Dummy holds ♦J ♦10 ♦6 — lowest, highest, and the ten in between.
    expect(labels).toEqual(["6♦", "10♦", "J♦"]);
    // And never the declarer's own diamonds, which was the bug.
    for (const mine of ["Q♦", "9♦", "7♦"]) expect(labels, mine).not.toContain(mine);
  });

  it("attributes them to dummy — 'your lowest diamond' would be false", () => {
    const a = thinkAid(atDummysTurn(), "S")!;
    expect(a.candidates[0]!.note).toBe("dummy's lowest diamond");
    for (const c of a.candidates) expect(c.note ?? "").not.toContain("your");
  });

  it("still counts BOTH hands for the facts — that part was already right", () => {
    const a = thinkAid(atDummysTurn(), "S")!;
    // 40 − South's 13 − dummy's 7 = 20.
    expect(a.known[0]).toBe("20 points sit between the two defenders.");
    // 3 of yours + 3 of dummy's + West's led card = 7 seen, so 6 out.
    expect(a.known.join(" ")).toContain("6 ♦ are still in the hidden hands");
  });

  it("says nothing to choose when the turn belongs to an opponent", () => {
    const s = state({
      phase: "play", contract: HEARTS, turn: "E",
      hands: { N: NORTH, E: cards("SJ S9 S7"), S: SOUTH, W: cards("S6 S3") },
      tricks: [{ leader: "W", plays: [{ seat: "W", card: one("D2") }, { seat: "N", card: one("D6") }] }],
    });
    const a = thinkAid(s, "S")!;
    expect(a.candidates).toEqual([]);
    expect(a.noChoice).toContain("East to play");
  });

  it("uses the declarer's own hand at the declarer's own turn", () => {
    const s = state({
      phase: "play", contract: HEARTS, turn: "S",
      hands: { N: NORTH, E: cards("SJ"), S: SOUTH, W: cards("S6") },
      tricks: [
        { leader: "W", plays: [
          { seat: "W", card: one("D2") }, { seat: "N", card: one("D6") }, { seat: "E", card: one("DA") },
        ] },
      ],
    });
    const labels = thinkAid(s, "S")!.candidates.map((c) => c.label);
    expect(labels).toEqual(["7♦", "Q♦"]);   // yours: ♦Q ♦9 ♦7 → lowest and highest
    expect(thinkAid(s, "S")!.candidates[0]!.note).toBe("your lowest diamond");
  });
});

describe("the known facts as flip cards", () => {
  // The cards are the source and the plain lines are their backs, verbatim —
  // the contract that lets the Game State UI and every older consumer of
  // `known` read the same facts without either drifting.
  it("derives `known` from knownCards, back for back", () => {
    const auction = thinkAid(state({ auction: [call("E", "1C")], turn: "S" }), "S")!;
    expect(auction.known).toEqual(auction.knownCards.map((k) => k.detail));
    // Every front is genuinely glanceable: a title and a short value.
    for (const k of auction.knownCards) {
      expect(k.title.length).toBeGreaterThan(0);
      expect(k.value.length).toBeGreaterThan(0);
      expect(k.value.length).toBeLessThanOrEqual(16);
    }
  });

  it("holds in the play too, voids and all", () => {
    const s = state({
      phase: "play",
      contract: { level: 3, strain: "H", declarer: "S", doubled: 0 } as GameState["contract"],
      turn: "S",
      hands: { N: cards("D6 S3"), E: cards("SJ"), S: cards("SA HK"), W: cards("S6") },
      tricks: [
        { leader: "W", plays: [
          { seat: "W", card: one("D2") }, { seat: "N", card: one("D6") }, { seat: "E", card: one("SJ") },
        ] },
      ],
    });
    const a = thinkAid(s, "S")!;
    expect(a.known).toEqual(a.knownCards.map((k) => k.detail));
    // East — a hand the declarer can NOT see — failed to follow the diamond
    // lead. That inference must survive the restructuring as a card with a
    // real front. (Dummy's discards prove nothing extra: dummy is face up.)
    const voidCard = a.knownCards.find((k) => k.detail.includes("has no diamonds"));
    expect(voidCard?.value).toBe("no ♦s");
  });
});
