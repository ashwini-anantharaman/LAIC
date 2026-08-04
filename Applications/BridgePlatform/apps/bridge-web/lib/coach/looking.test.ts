// The facts layer. Worth real coverage rather than a probe: every sentence here
// is asserted to a learner about their own position, and a wrong relationship
// ("partner opened" when it was an opponent) is the kind of error that destroys
// trust faster than a wrong card would.

import { hcp } from "@bridge/engine";
import type { GameState } from "@bridge/engine";
import type { Card, Seat, Suit } from "@bridge/events";
import { describe, expect, it } from "vitest";

import { lookingAt } from "./looking";
import { callLabel } from "./position";

const RANKS: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
/** "SA SQ S3 ..." → cards. */
const cards = (spec: string): Card[] =>
  spec.split(/\s+/).map((t) => ({ suit: t[0] as Suit, rank: RANKS[t[1]!]! as Card["rank"] }));

/** ♠AQ3 ♥J8 ♦Q5 ♣KJT753 — the hand from the screenshot: 13 HCP, 3=2=2=6. */
const HAND = cards("SA SQ S3 HJ H8 DQ D5 CK CJ CT C7 C5 C3");

function state(over: Partial<GameState> = {}): GameState {
  return {
    boardRef: "b1", dealer: "N", vul: "none",
    hands: { N: [], E: [], S: HAND, W: [] },
    auction: [], contract: null, phase: "auction", turn: "S",
    tricks: [], trickCount: { NS: 0, EW: 0 },
    ...over,
  } as GameState;
}
const call = (seat: Seat, c: string) => ({ seat, call: c as never });

describe("callLabel", () => {
  it("renders calls the way the table does", () => {
    expect(callLabel("1D" as never)).toBe("1♦");
    expect(callLabel("1N" as never)).toBe("1NT");
    expect(callLabel("4S" as never)).toBe("4♠");
    expect(callLabel("P" as never)).toBe("Pass");
    expect(callLabel("X" as never)).toBe("Double");
    expect(callLabel("XX" as never)).toBe("Redouble");
  });
});

describe("lookingAt — no seat", () => {
  it("says nothing for a watcher rather than describing the hand from nowhere", () => {
    expect(lookingAt(state(), null)).toBeNull();
  });
});

describe("lookingAt — the auction", () => {
  it("counts the hand it was dealt, not a rounded guess", () => {
    const r = lookingAt(state(), "S")!;
    expect(hcp(HAND)).toBe(13);
    expect(r.facts.find((f) => f.label === "HCP")?.value).toBe("13");
    expect(r.facts.find((f) => f.label === "♠♥♦♣")?.value).toBe("3=2=2=6");
    expect(r.facts.some((f) => f.value === "six-card suit")).toBe(true);
  });

  it("names PARTNER as partner and opponents by seat — the fact the grid can't show", () => {
    // N opens 1♦, E passes, S to call. N is South's partner.
    const r = lookingAt(state({ auction: [call("N", "1D"), call("E", "P")], turn: "S" }), "S")!;
    expect(r.looking).toBe("Partner opened 1♦, then East passed. It's your call.");
  });

  it("does not call an opponent's bid an opening of partner's", () => {
    // W opens, partner passes.
    const r = lookingAt(state({ auction: [call("W", "1S"), call("N", "P")], turn: "S" }), "S")!;
    expect(r.looking).toBe("West opened 1♠, then partner passed. It's your call.");
    expect(r.looking).not.toContain("Partner opened");
  });

  it("only the FIRST call said is an opening", () => {
    const r = lookingAt(state({ auction: [call("N", "1D"), call("E", "1S")], turn: "S" }), "S")!;
    expect(r.looking).toContain("East bid 1♠");
    expect(r.looking).not.toContain("East opened");
  });

  it("handles an empty auction, and passes with nothing bid", () => {
    expect(lookingAt(state({ auction: [], turn: "S" }), "S")!.looking)
      .toBe("Nobody has bid yet. It's your call.");
    expect(lookingAt(state({ auction: [call("N", "P"), call("E", "P")], turn: "S" }), "S")!.looking)
      .toBe("2 passes so far — nobody has bid. It's your call.");
  });

  it("says whose turn it is when it is not yours", () => {
    const r = lookingAt(state({ auction: [call("N", "1D")], turn: "E" }), "S")!;
    expect(r.looking).toContain("East to call.");
    expect(r.looking).not.toContain("your call");
  });

  it("counts trailing passes so the learner can tell the auction is ending", () => {
    const r = lookingAt(state({
      auction: [call("N", "1D"), call("E", "P"), call("S", "P"), call("W", "P")], turn: "N",
    }), "S")!;
    expect(r.looking).toContain("then 3 passes");
  });
});

describe("lookingAt — the play", () => {
  const contract = { level: 3, strain: "N", doubled: 0, declarer: "E" } as GameState["contract"];
  const played = (spec: string, seat: Seat) => ({ seat, card: cards(spec)[0]! });

  it("knows which side of the contract the learner is on", () => {
    const base = { phase: "play", contract, tricks: [], turn: "S" } as Partial<GameState>;
    expect(lookingAt(state(base), "S")!.looking).toContain("defending 3NT by East");
    expect(lookingAt(state({ ...base, turn: "E" }), "E")!.looking).toContain("declaring 3NT");
    expect(lookingAt(state({ ...base, turn: "E" }), "W")!.looking).toContain("dummy in 3NT");
  });

  it("reports the card led and whether the learner is on lead", () => {
    const withLead = state({
      phase: "play", contract, turn: "S",
      tricks: [{ leader: "E", plays: [played("D3", "E")] }],
    });
    expect(lookingAt(withLead, "S")!.looking).toContain("East led the 3♦ and it's your turn.");

    const onLead = state({ phase: "play", contract, turn: "S", tricks: [] });
    expect(lookingAt(onLead, "S")!.looking).toContain("You're on lead.");
  });

  it("counts tricks by side, and the trick number from completed tricks", () => {
    const s = state({
      phase: "play", contract, turn: "S",
      hands: { N: [], E: [], S: HAND.slice(2), W: [] },
      tricks: [
        { leader: "E", plays: [played("D3", "E"), played("DQ", "S")], winner: "S" },
        { leader: "S", plays: [played("D5", "S"), played("DA", "E")], winner: "E" },
        { leader: "E", plays: [played("C2", "E")] },
      ],
    });
    const r = lookingAt(s, "S")!;
    expect(r.facts.find((f) => f.label === "yours")?.value).toBe("1");
    expect(r.facts.find((f) => f.label === "theirs")?.value).toBe("1");
    expect(r.facts.some((f) => f.value === "Trick 3")).toBe(true);
  });

  it("reports the hand as DEALT, not what is left of it", () => {
    // Two cards gone: the remaining hand is weaker, but "my hand" means all 13.
    const s = state({
      phase: "play", contract, turn: "S",
      hands: { N: [], E: [], S: HAND.slice(2), W: [] },
      tricks: [{ leader: "E", plays: [played("SA", "S"), played("SQ", "S")], winner: "S" }],
    });
    expect(lookingAt(s, "S")!.facts.find((f) => f.label === "HCP dealt")?.value).toBe("13");
  });

  it("never mentions a card the learner cannot see", () => {
    const s = state({
      phase: "play", contract, turn: "S",
      hands: { N: cards("HA HK HQ"), E: cards("SK SJ ST"), S: HAND, W: [] },
      tricks: [],
    });
    const r = lookingAt(s, "S")!;
    for (const f of ["A♥", "K♥", "Q♥", "K♠", "J♠", "10♠"]) expect(r.looking).not.toContain(f);
  });
});
