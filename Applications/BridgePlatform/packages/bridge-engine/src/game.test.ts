// Undo and deal-edit behaviors of the single-writer Game controller (game-law
// layer). Uses a scripted inline decider — the real decision layer lives in
// ./decide against @bridge/kb compiled artifacts and has its own tests.

import {
  createBus,
  createEventLog,
  SEATS,
  type Call,
  type Card,
  type Seat,
  type Suit,
} from "@bridge/events";
import { describe, expect, it } from "vitest";
import type { Decision } from "./decision";
import { createGame, type AsyncDecider } from "./game";
import { initialState } from "./state";

/** Deal the 52 cards in suit/rank order round-robin from N. */
function dealtHands(): Record<Seat, Card[]> {
  const suits: Suit[] = ["S", "H", "D", "C"];
  const cards: Card[] = suits.flatMap((suit) =>
    Array.from({ length: 13 }, (_, i) => ({ suit, rank: (i + 2) as Card["rank"] })),
  );
  const hands: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
  cards.forEach((card, i) => hands[SEATS[i % 4] as Seat].push(card));
  return hands;
}

const decide = <A>(action: A): Decision<A> => ({
  action,
  candidates: [action],
  trace: [],
  citedSettings: [],
  facts: {},
  reason: "scripted",
  rejected: [],
  fallback: false,
});

/** N opens 1S, everyone else passes. */
const scriptedDecider: AsyncDecider = {
  async decideBid(state, seat) {
    const call: Call = seat === "N" && state.auction.length === 0 ? "1S" : "P";
    return decide(call);
  },
  async decidePlay(state, seat) {
    const legal = state.hands[seat];
    return decide(legal[0]!);
  },
};

function makeGame() {
  const bus = createBus();
  const log = createEventLog(bus);
  const game = createGame(
    bus,
    { N: scriptedDecider, E: scriptedDecider, S: scriptedDecider, W: scriptedDecider },
    initialState("b_test", "N", "none", dealtHands()),
  );
  return { game, log };
}

describe("undo", () => {
  it("rewinds state, seq counter, and log together", async () => {
    const { game, log } = makeGame();
    await game.step(); // N: 1S
    await game.step(); // E: P
    expect(game.getState().auction.map((c) => c.call)).toEqual(["1S", "P"]);
    expect(game.historyLength()).toBe(2);

    const logicSeq = game.undo();
    expect(logicSeq).not.toBeNull();
    log.rollback(logicSeq!);

    expect(game.getState().auction.map((c) => c.call)).toEqual(["1S"]);
    expect(game.historyLength()).toBe(1);
    expect(log.getAll().length).toBe(2); // one logic + one action event remain

    // Redone decision reuses the freed seq range (replay invariant).
    await game.step();
    const seqs = log.getAll().map((e) => e.seq);
    expect(seqs).toEqual([0, 1, 2, 3]);
    expect(game.getState().auction.map((c) => c.call)).toEqual(["1S", "P"]);
  });

  it("returns null at the start", () => {
    const { game } = makeGame();
    expect(game.undo()).toBeNull();
  });
});

describe("editDeal", () => {
  it("redistributes unplayed cards and refolds history", async () => {
    const { game } = makeGame();
    await game.step(); // N: 1S committed — auction survives the edit
    const hands = game.getState().hands;

    // Swap one card between E and W (counts preserved, same multiset).
    const remaining: Record<Seat, Card[]> = {
      N: [...hands.N],
      E: [...hands.E],
      S: [...hands.S],
      W: [...hands.W],
    };
    const fromE = remaining.E[0]!;
    const fromW = remaining.W[0]!;
    remaining.E = [fromW, ...remaining.E.slice(1)];
    remaining.W = [fromE, ...remaining.W.slice(1)];

    game.editDeal(remaining);
    const after = game.getState();
    expect(after.auction.map((c) => c.call)).toEqual(["1S"]);
    expect(after.hands.E.some((c) => c.suit === fromW.suit && c.rank === fromW.rank)).toBe(true);
    expect(after.hands.W.some((c) => c.suit === fromE.suit && c.rank === fromE.rank)).toBe(true);
  });

  it("rejects count changes, duplicates, and invented cards", async () => {
    const { game } = makeGame();
    const hands = game.getState().hands;
    const base: Record<Seat, Card[]> = {
      N: [...hands.N],
      E: [...hands.E],
      S: [...hands.S],
      W: [...hands.W],
    };

    expect(() => game.editDeal({ ...base, N: base.N.slice(1) })).toThrow(/must keep exactly/);

    expect(() =>
      game.editDeal({ ...base, N: [base.E[0]!, ...base.N.slice(1)] }),
    ).toThrow(/Duplicate card/);

    expect(() =>
      game.editDeal({
        ...base,
        W: [base.N[0]!, ...base.W.slice(1)],
      }),
    ).toThrow(/Duplicate card/);
  });
});
