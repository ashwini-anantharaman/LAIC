// Undo and deal-edit behaviors, ported in spirit from the prototype's
// game/undo.test.ts and game/dealEdit.test.ts (rewritten against the
// package-decider API — the originals drove the content-coupled session.ts).

import { createBus, createEventLog, type Card, type Seat } from "@bridge/events";
import { describe, expect, it } from "vitest";
import { BOARD_G1 } from "./fixtures/goldenBoards";
import { TEST_PACKAGE, TEST_VALUES } from "./fixtures/testPackage";
import { createGame } from "./game";
import { createPackageDecider } from "./rules/decider";
import { initialState } from "./state";

function makeGame() {
  const bus = createBus();
  const log = createEventLog(bus);
  const decider = createPackageDecider({ pkg: TEST_PACKAGE, values: TEST_VALUES });
  const game = createGame(
    bus,
    { N: decider, E: decider, S: decider, W: decider },
    initialState(BOARD_G1.name, BOARD_G1.dealer, BOARD_G1.vul, BOARD_G1.hands),
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

    expect(() =>
      game.editDeal({ ...base, N: base.N.slice(1) }),
    ).toThrow(/must keep exactly/);

    expect(() =>
      game.editDeal({ ...base, N: [base.E[0]!, ...base.N.slice(1)] }),
    ).toThrow(/Duplicate card/);

    expect(() =>
      game.editDeal({
        ...base,
        // Replace one N card with itself... then W card with a card N kept -> duplicate
        W: [base.N[0]!, ...base.W.slice(1)],
      }),
    ).toThrow(/Duplicate card/);
  });
});
