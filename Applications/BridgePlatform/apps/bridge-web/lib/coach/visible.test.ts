// The security boundary for the explanation layer.
//
// The load-bearing test is the last one: a deal where every honour outside the
// learner's view sits in the two concealed hands, serialised, with an assertion
// that none of them appears anywhere in the payload. If that ever fails, the
// model is being handed cards off somebody else's hand and no prompt will fix it.

import type { GameState } from "@bridge/engine";
import type { Card, Seat, Suit } from "@bridge/events";
import { describe, expect, it } from "vitest";

import { leakedCards, positionKey, visibleCards, visiblePosition } from "./visible";

const R: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const cards = (spec: string): Card[] =>
  spec.trim().split(/\s+/).map((t) => ({ suit: t[0] as Suit, rank: R[t[1]!]! as Card["rank"] }));
const one = (spec: string) => cards(spec)[0]!;

/** 3NT by East. West is dummy. South and North defend. */
const NT = { level: 3, strain: "N", doubled: 0, declarer: "E" } as GameState["contract"];
/** 3♥ by South. North is dummy — so South plays two hands. */
const HEARTS = { level: 3, strain: "H", doubled: 0, declarer: "S" } as GameState["contract"];

function state(over: Partial<GameState> = {}): GameState {
  return {
    boardRef: "b", dealer: "N", vul: "none", phase: "play", turn: "S",
    hands: { N: [], E: [], S: cards("DQ D9 D7"), W: [] },
    auction: [], contract: NT, tricks: [], trickCount: { NS: 0, EW: 0 },
    ...over,
  } as GameState;
}

describe("visiblePosition — when there is nothing to describe", () => {
  it("is null for a watcher", () => {
    expect(visiblePosition(state(), null)).toBeNull();
  });

  it("is null for dummy — dummy makes no decisions", () => {
    // W is dummy for declarer E.
    expect(visiblePosition(state({ turn: "W" }), "W")).toBeNull();
  });

  it("is null when the turn belongs to somebody the learner does not play", () => {
    expect(visiblePosition(state({ turn: "E" }), "S")).toBeNull();
  });

  it("is null during the auction unless it is the learner's call", () => {
    const auction = state({ phase: "auction", contract: null, turn: "E" });
    expect(visiblePosition(auction, "S")).toBeNull();
    expect(visiblePosition({ ...auction, turn: "S" }, "S")).not.toBeNull();
  });
});

describe("visiblePosition — which hand is on offer", () => {
  it("a defender sees their own hand and dummy", () => {
    const s = state({ hands: { N: cards("HA"), E: cards("SK"), S: cards("DQ D9"), W: cards("DJ DT") } });
    const pos = visiblePosition(s, "S")!;
    expect(pos.role).toBe("defender");
    expect(pos.actor).toBe("S");
    expect(pos.myHand.cards).toEqual(["Q♦", "9♦"]);
    expect(pos.dummy?.cards).toEqual(["J♦", "10♦"]);
  });

  it("declarer at dummy's turn: the actor and the legal cards are DUMMY's", () => {
    const s = state({
      contract: HEARTS, turn: "N",
      hands: { N: cards("DJ DT D6"), E: cards("SK"), S: cards("DQ D9 D7"), W: cards("S3") },
      tricks: [{ leader: "W", plays: [{ seat: "W", card: one("D2") }] }],
    });
    const pos = visiblePosition(s, "S")!;
    expect(pos.role).toBe("declarer");
    expect(pos.actor).toBe("N");
    expect(pos.legal).toEqual(["J♦", "10♦", "6♦"]); // dummy's, not South's
    expect(pos.legal).not.toContain("Q♦");
  });

  it("names relationships, since a seat letter alone can't say who is partner", () => {
    const s = state({
      phase: "auction", contract: null, turn: "S",
      auction: [{ seat: "N", call: "1D" }, { seat: "E", call: "P" }] as GameState["auction"],
    });
    const pos = visiblePosition(s, "S")!;
    expect(pos.auction).toEqual([
      { seat: "N", relation: "partner", call: "1♦" },
      { seat: "E", relation: "opponent", call: "Pass" },
    ]);
  });
});

describe("leakedCards", () => {
  it("passes cards the learner can see and catches ones they cannot", () => {
    const s = state({ hands: { N: cards("HA"), E: cards("SK"), S: cards("DQ D9"), W: cards("DJ") } });
    const pos = visiblePosition(s, "S")!;
    expect(visibleCards(pos).has("Q♦")).toBe(true);
    expect(leakedCards("Play the Q♦ and keep the J♦.", pos)).toEqual([]);
    expect(leakedCards("Declarer holds the A♥ and the K♠.", pos).sort()).toEqual(["A♥", "K♠"]);
  });
});

describe("positionKey", () => {
  it("is stable for the same position and differs for a different one", () => {
    const a = visiblePosition(state(), "S")!;
    const b = visiblePosition(state(), "S")!;
    expect(positionKey(a)).toBe(positionKey(b));

    const moved = visiblePosition(state({ hands: { N: [], E: [], S: cards("DQ D9"), W: [] } }), "S")!;
    expect(positionKey(moved)).not.toBe(positionKey(a));
  });
});

describe("INVARIANT — the payload cannot carry a concealed card", () => {
  it("serialises with no honour from either hidden hand, in any field", () => {
    // Every honour outside South's hand and dummy sits with N and E, which South
    // cannot see. If any of them reaches the JSON, the model can read it.
    const s = state({
      hands: {
        N: cards("HA HK HQ SK SJ"),
        E: cards("CA CQ DA DK DJ"),
        S: cards("DQ D5 D2 S3 C3"),
        W: cards("D9 D8 S4 C4 H2"),
      },
      tricks: [{ leader: "E", plays: [{ seat: "E", card: one("D3") }] }],
      turn: "S",
    });
    const payload = JSON.stringify(visiblePosition(s, "S"));

    for (const hidden of ["A♥", "K♥", "Q♥", "K♠", "J♠", "A♣", "Q♣", "A♦", "K♦", "J♦"]) {
      expect(payload, `leaked ${hidden}`).not.toContain(hidden);
    }
    // And it still carried what the learner may legitimately see.
    expect(payload).toContain("Q♦");   // South's own
    expect(payload).toContain("9♦");   // dummy's
    expect(payload).toContain("3♦");   // played by East, so public
  });

  it("has no field for a verdict, a cost, or the other hands", () => {
    const pos = visiblePosition(state(), "S")!;
    const keys = Object.keys(pos);
    for (const forbidden of ["hands", "cost", "verdict", "best", "solution", "tricks_lost"]) {
      expect(keys, forbidden).not.toContain(forbidden);
    }
  });
});
