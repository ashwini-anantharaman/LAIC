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
    // The shape spelled per suit, not the column notation ("3=2=2=6").
    expect(r.facts.some((f) => f.value === "♠3 ♥2 ♦2 ♣6")).toBe(true);
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
    // Labelled as what they COUNT, and filed under the side that won them
    // (owner direction 2026-08-15) — a bare "theirs" inside the Theirs pane
    // read as nonsense.
    const ours = r.facts.find((f) => f.label === "Our tricks");
    const theirs = r.facts.find((f) => f.label === "Their tricks");
    expect(ours?.value).toBe("1");
    expect(ours?.group).toBe("partnership");
    expect(theirs?.value).toBe("1");
    expect(theirs?.group).toBe("theirs");
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

describe("lookingAt — event groups", () => {
  it("itemizes the auction one call per row, named from the learner's side", () => {
    const r = lookingAt(
      state({ auction: [call("N", "1D"), call("E", "P"), call("S", "1S")], turn: "W" }),
      "S",
    )!;
    expect(r.eventGroups).toHaveLength(1);
    const g = r.eventGroups[0]!;
    expect(g).toMatchObject({ id: "auction", title: "The auction", current: true });
    expect(g.events.map((e) => e.label)).toEqual(["Partner bid 1♦", "East passed", "You bid 1♠"]);
    // The structured parts drive the row's badge, actor and card-face chip.
    expect(g.events[0]).toMatchObject({ seat: "N", who: "Partner", verb: "bid", token: "1♦" });
    expect(g.events[1]).toMatchObject({ seat: "E", who: "East", verb: "passed" });
    expect(g.events[1]!.token).toBeUndefined(); // "passed" says it all — no chip
    // Index-aligned with the auction — that's how the page attaches meanings.
    expect(g.events.map((e) => e.auctionIndex)).toEqual([0, 1, 2]);
    expect(g.events.every((e) => e.kind === "call")).toBe(true);
  });

  it("itemizes the trick on the table — the lead as a lead, the rest as plays", () => {
    const contract = { level: 3, strain: "N", doubled: 0, declarer: "E" } as GameState["contract"];
    const s = state({
      phase: "play", contract, turn: "S",
      tricks: [{ leader: "W", plays: [{ seat: "W", card: cards("SA")[0]! }, { seat: "N", card: cards("S2")[0]! }] }],
    });
    const r = lookingAt(s, "S")!;
    const trick = r.eventGroups.find((g) => g.id === "trick-0")!;
    expect(trick).toMatchObject({ title: "This trick", current: true });
    expect(trick.events.map((e) => e.label)).toEqual(["West led the A♠", "Partner played the 2♠"]);
    expect(trick.events[0]).toMatchObject({ seat: "W", who: "West", verb: "led", token: "A♠" });
  });

  it("keeps the whole history: the auction and every past trick stay on the card", () => {
    const contract = { level: 3, strain: "N", doubled: 0, declarer: "E" } as GameState["contract"];
    const s = state({
      phase: "play", contract, turn: "S",
      auction: [call("N", "1D"), call("E", "P"), call("S", "3N"), call("W", "P")],
      tricks: [
        {
          leader: "W",
          plays: [
            { seat: "W", card: cards("SA")[0]! }, { seat: "N", card: cards("S2")[0]! },
            { seat: "E", card: cards("S4")[0]! }, { seat: "S", card: cards("S3")[0]! },
          ],
          winner: "W",
        },
        {
          leader: "W",
          plays: [
            { seat: "W", card: cards("H2")[0]! }, { seat: "N", card: cards("H4")[0]! },
            { seat: "E", card: cards("H5")[0]! }, { seat: "S", card: cards("HJ")[0]! },
          ],
          winner: "S",
        },
        { leader: "S", plays: [{ seat: "S", card: cards("C3")[0]! }] },
      ],
    });
    const r = lookingAt(s, "S")!;
    expect(r.eventGroups.map((g) => g.id)).toEqual(["auction", "trick-0", "trick-1", "trick-2"]);
    expect(r.eventGroups.map((g) => g.title)).toEqual(["The auction", "Trick 1", "Trick 2", "This trick"]);
    // Completed tricks carry their outcome, from the learner's side of the table.
    expect(r.eventGroups[1]!.note).toBe("won by West");
    expect(r.eventGroups[2]!.note).toBe("won by you");
    // Only where the board is right now is current — the panel opens that one.
    expect(r.eventGroups.map((g) => Boolean(g.current))).toEqual([false, false, false, true]);
    // Ids stay stable across tricks, so a question about trick 1 still resolves.
    expect(r.eventGroups[1]!.events[0]!.id).toBe("play-0-0");
    expect(r.eventGroups[3]!.events[0]!.id).toBe("play-2-0");
  });

  it("a just-completed trick stays current until the next lead", () => {
    const contract = { level: 3, strain: "N", doubled: 0, declarer: "E" } as GameState["contract"];
    const done = state({
      phase: "play", contract, turn: "N",
      tricks: [{
        leader: "W",
        plays: [
          { seat: "W", card: cards("SA")[0]! }, { seat: "N", card: cards("S2")[0]! },
          { seat: "E", card: cards("S4")[0]! }, { seat: "S", card: cards("S3")[0]! },
        ],
        winner: "W",
      }],
    });
    const r = lookingAt(done, "S")!;
    const trick = r.eventGroups.find((g) => g.id === "trick-0")!;
    expect(trick.events).toHaveLength(4);
    expect(trick).toMatchObject({ title: "Trick 1", note: "won by West", current: true });
  });

  it("has no sections before anything happens", () => {
    expect(lookingAt(state(), "S")!.eventGroups).toEqual([]);
    const onLead = state({
      phase: "play",
      contract: { level: 3, strain: "N", doubled: 0, declarer: "E" } as GameState["contract"],
      turn: "S", tricks: [],
    });
    // No auction recorded in this fixture and no lead yet — nothing to list.
    expect(lookingAt(onLead, "S")!.eventGroups).toEqual([]);
  });
});

describe("lookingAt — declarer at dummy's turn", () => {
  const HEARTS = { level: 3, strain: "H", doubled: 0, declarer: "S" } as GameState["contract"];

  it("treats dummy's turn as the declarer's, and says which hand", () => {
    const s = state({
      phase: "play", contract: HEARTS, turn: "N",
      hands: { N: cards("DJ DT D6"), E: [], S: HAND, W: [] },
      tricks: [{ leader: "W", plays: [{ seat: "W", card: cards("D2")[0]! }] }],
    });
    const r = lookingAt(s, "S")!;
    expect(r.looking).toContain("West led the 2♦ and it's your turn — you're playing from dummy.");
  });

  it("a defender is not told it is their turn when it is dummy's", () => {
    const s = state({
      phase: "play", contract: HEARTS, turn: "N",
      hands: { N: cards("DJ"), E: [], S: HAND, W: [] },
      tricks: [{ leader: "W", plays: [{ seat: "W", card: cards("D2")[0]! }] }],
    });
    expect(lookingAt(s, "E")!.looking).not.toContain("your turn");
  });
});
