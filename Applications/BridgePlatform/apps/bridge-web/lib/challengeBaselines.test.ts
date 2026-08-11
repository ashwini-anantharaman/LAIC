// The three BEN baselines, against a STUBBED BEN and an in-memory store.
//
// The BEN stub keeps its own mirror of the game and answers the first LEGAL
// action at every turn, so a whole board plays out without a container and
// without a single hardcoded card. What must hold:
//
//   · full_ben plays and freezes the board once, then is served from the store;
//   · a forced recompute costs ZERO BEN calls — every decision replays from
//     the cache, which is exactly what makes an interrupted baseline resumable;
//   · a budget that runs out leaves an honest `pending` record, not a hole and
//     not a fabricated line, and the next run finishes it;
//   · your_contract adopts the user's auction verbatim; from_point freezes the
//     user's line to a ply and lets BEN carry on;
//   · BEN failing is recorded as `failed` WITH the reason — never faked;
//   · asking for a line that does not exist is an input error, not a record.

import {
  InMemoryChallengeStore,
  type Challenge,
  type ChallengeBoard,
  type ChallengePlay,
} from "@bridge/challenges";
import { applyEvent, initialState, legalPlays, seededDeal, type GameState } from "@bridge/engine";
import type { ActionEvent, Call, Card, Seat } from "@bridge/events";
import { describe, expect, it } from "vitest";
import { pbnRank } from "./benchmark";
import type { BenTableClient } from "./benSeat";
import {
  BaselineInputError,
  challengeTimeline,
  ensureFromPointBaseline,
  ensureFullBenBaseline,
  ensureYourContractBaseline,
  frozenPrefix,
  pendingFullBenBoards,
  timelineLength,
  type TimelineStep,
} from "./challengeBaselines";

const CHALLENGE = "ch_base";

function testBoard(boardNo = 1, humanSeat: Seat = "S"): ChallengeBoard {
  return {
    challengeId: CHALLENGE,
    boardNo,
    pack: seededDeal(21 + boardNo),
    dealer: "N",
    vul: "none",
    humanSeat,
    controlOverrides: {},
  };
}

function event(state: GameState, step: TimelineStep): ActionEvent {
  const base = { seq: 0, ts: 0, boardRef: state.boardRef, fallback: false } as const;
  return step.kind === "call"
    ? { ...base, category: "bid-event", seat: step.seat, call: step.call }
    : { ...base, category: "play-event", seat: step.seat, card: step.card };
}

/**
 * A BEN that plays a real board: it mirrors the game, answers the first legal
 * action for whoever is on play, and counts every question it is asked.
 */
function mirrorBen(board: ChallengeBoard, opts?: { open?: Call; prefix?: TimelineStep[] }) {
  let state = initialState("mirror", board.dealer, board.vul, board.pack);
  for (const step of opts?.prefix ?? []) state = applyEvent(state, event(state, step));
  const calls = { bid: 0, lead: 0, play: 0 };

  const answerCard = () => {
    const seat = state.turn;
    const card = legalPlays(state, seat)[0]!;
    state = applyEvent(state, event(state, { kind: "card", seat, card }));
    return { card: `${card.suit}${pbnRank(card.rank)}`, candidates: [] };
  };

  const client: BenTableClient = {
    async bid() {
      calls.bid++;
      const seat = state.turn;
      const call: Call = state.auction.length === 0 ? (opts?.open ?? "P") : "P";
      state = applyEvent(state, event(state, { kind: "call", seat, call }));
      return { bid: call, candidates: [] };
    },
    async lead() {
      calls.lead++;
      return answerCard();
    },
    async play() {
      calls.play++;
      return answerCard();
    },
  };
  const total = () => calls.bid + calls.lead + calls.play;
  return { client, calls, total };
}

/** A BEN that is simply down. */
const brokenBen: BenTableClient = {
  async bid() {
    throw new Error("BEN is unreachable");
  },
  async lead() {
    throw new Error("BEN is unreachable");
  },
  async play() {
    throw new Error("BEN is unreachable");
  },
};

async function storeWith(board: ChallengeBoard, plays: ChallengePlay[] = []) {
  const store = new InMemoryChallengeStore();
  await store.putBoard(board);
  for (const p of plays) await store.putPlay(p);
  return store;
}

const now = () => "2026-08-07T00:00:00.000Z";

describe("the timeline (what a 'ply' means)", () => {
  const line = {
    auction: [
      { seat: "N" as Seat, call: "1N" },
      { seat: "E" as Seat, call: "P" },
    ],
    play: [{ seat: "S" as Seat, card: { suit: "S", rank: 14 } as Card }],
  };

  it("is the calls, then the cards", () => {
    expect(timelineLength(line)).toBe(3);
    expect(challengeTimeline(line).map((s) => s.kind)).toEqual(["call", "call", "card"]);
  });

  it("splits a prefix back into an auction and a play", () => {
    expect(frozenPrefix(line, 2)).toEqual({ auction: line.auction, play: [] });
    expect(frozenPrefix(line, 3)).toEqual({ auction: line.auction, play: line.play });
    expect(frozenPrefix(line, 0)).toEqual({ auction: [], play: [] });
  });

  it("refuses a ply outside the line", () => {
    expect(() => frozenPrefix(line, 4)).toThrow(BaselineInputError);
    expect(() => frozenPrefix(line, -1)).toThrow(BaselineInputError);
  });
});

describe("the full-BEN baseline", () => {
  it("plays the whole board, freezes it, and scores it from the human's side", async () => {
    const board = testBoard(1);
    const store = await storeWith(board);
    const ben = mirrorBen(board, { open: "1N" });

    const out = await ensureFullBenBaseline(CHALLENGE, 1, { store, client: ben.client, now });

    expect(out.baseline.status).toBe("ready");
    expect(out.baseline.snapshot?.auction).toHaveLength(4); // 1N + three passes
    expect(out.baseline.snapshot?.play).toHaveLength(52);
    expect(out.baseline.snapshot?.hands).toEqual(board.pack);
    expect(out.baseline.snapshot?.contractLabel).toMatch(/1NT by/);
    expect(out.baseline.snapshot?.resultLabel).toBeTruthy();
    expect(typeof out.baseline.rawScore).toBe("number");
    expect(out.benCalls).toBe(56);
    expect(out.resumable).toBe(false);
  });

  it("is idempotent: a second call costs nothing at all", async () => {
    const board = testBoard(2);
    const store = await storeWith(board);
    const first = await ensureFullBenBaseline(CHALLENGE, 2, {
      store, client: mirrorBen(board, { open: "1N" }).client, now,
    });

    const silent = mirrorBen(board, { open: "1N" });
    const second = await ensureFullBenBaseline(CHALLENGE, 2, { store, client: silent.client, now });

    expect(second.baseline.snapshot).toEqual(first.baseline.snapshot);
    expect(second.actions).toBe(0);
    expect(silent.total()).toBe(0);
  });

  it("replays a forced recompute entirely from the decision cache", async () => {
    const board = testBoard(3);
    const store = await storeWith(board);
    await ensureFullBenBaseline(CHALLENGE, 3, {
      store, client: mirrorBen(board, { open: "1N" }).client, now,
    });

    const silent = mirrorBen(board, { open: "1N" });
    const again = await ensureFullBenBaseline(CHALLENGE, 3, {
      store, client: silent.client, now, force: true,
    });

    expect(again.baseline.status).toBe("ready");
    expect(again.actions).toBe(56); // every action replayed…
    expect(again.benCalls).toBe(0); // …and not one of them cost a BEN call
    expect(silent.total()).toBe(0);
  });

  it("stops at its budget, says so, and finishes on the next run", async () => {
    const board = testBoard(4);
    const store = await storeWith(board);
    const ben = mirrorBen(board, { open: "1N" });

    const stopped = await ensureFullBenBaseline(CHALLENGE, 4, {
      store, client: ben.client, now, budgetMs: 0,
    });
    expect(stopped.baseline.status).toBe("pending");
    expect(stopped.baseline.snapshot).toBeUndefined();
    expect(stopped.resumable).toBe(true);
    expect(stopped.baseline.error).toMatch(/interrupted after 0 actions/);

    const finished = await ensureFullBenBaseline(CHALLENGE, 4, { store, client: ben.client, now });
    expect(finished.baseline.status).toBe("ready");
    expect(finished.resumable).toBe(false);
  });

  it("records a BEN outage as failed WITH the reason, and never invents a line", async () => {
    const board = testBoard(5);
    const store = await storeWith(board);

    const out = await ensureFullBenBaseline(CHALLENGE, 5, { store, client: brokenBen, now });

    expect(out.baseline.status).toBe("failed");
    expect(out.baseline.snapshot).toBeUndefined();
    expect(out.baseline.rawScore).toBeUndefined();
    expect(out.baseline.error).toMatch(/BEN could not bid/);
    // …and it is retried (not cached as gospel) the next time it is asked for.
    const repaired = await ensureFullBenBaseline(CHALLENGE, 5, {
      store, client: mirrorBen(board, { open: "1N" }).client, now,
    });
    expect(repaired.baseline.status).toBe("ready");
  });

  it("handles a passed-out board as the flat board it is", async () => {
    const board = testBoard(6);
    const store = await storeWith(board);
    const out = await ensureFullBenBaseline(CHALLENGE, 6, {
      store, client: mirrorBen(board).client, now,
    });
    expect(out.baseline.status).toBe("ready");
    expect(out.baseline.rawScore).toBe(0);
    expect(out.baseline.snapshot?.play).toHaveLength(0);
    expect(out.baseline.snapshot?.contractLabel).toBeUndefined();
  });

  it("refuses a board the challenge does not have", async () => {
    const store = await storeWith(testBoard(1));
    await expect(
      ensureFullBenBaseline(CHALLENGE, 9, { store, client: brokenBen, now }),
    ).rejects.toThrow(BaselineInputError);
  });

  it("lists the boards that still owe a baseline", async () => {
    const board = testBoard(1);
    const store = await storeWith(board);
    await store.putBoard(testBoard(2));
    expect(await pendingFullBenBoards(CHALLENGE, { store })).toEqual([1, 2]);
    await ensureFullBenBaseline(CHALLENGE, 1, { store, client: mirrorBen(board).client, now });
    expect(await pendingFullBenBoards(CHALLENGE, { store })).toEqual([2]);
  });
});

describe("the on-demand baselines", () => {
  /** Play the board with BEN, then hand that line back as the USER's play. */
  async function boardWithUserLine(boardNo: number) {
    const board = testBoard(boardNo);
    const store = await storeWith(board);
    const ben = mirrorBen(board, { open: "1N" });
    const full = await ensureFullBenBaseline(CHALLENGE, boardNo, {
      store, client: ben.client, now,
    });
    const play: ChallengePlay = {
      challengeId: CHALLENGE,
      boardNo,
      userId: "u1",
      sessionId: "s1",
      status: "completed",
      snapshot: full.baseline.snapshot!,
      rawScore: full.baseline.rawScore,
      startedAt: now(),
      completedAt: now(),
    };
    await store.putPlay(play);
    return { board, store, play };
  }

  it("adopts the user's auction verbatim — and meets the same opposition, free", async () => {
    const { board, store, play } = await boardWithUserLine(7);
    const silent = mirrorBen(board, { open: "1N" });

    const out = await ensureYourContractBaseline(CHALLENGE, 7, "u1", {
      store, client: silent.client, now,
    });

    expect(out.baseline.status).toBe("ready");
    expect(out.baseline.userId).toBe("u1");
    expect(out.baseline.snapshot?.auction).toEqual(play.snapshot!.auction);
    // The user's line IS a line BEN has already answered, so the whole
    // continuation comes out of the fairness cache.
    expect(out.benCalls).toBe(0);
    expect(silent.total()).toBe(0);
    expect(out.baseline.snapshot?.play).toEqual(play.snapshot!.play);
  });

  it("freezes the user's line to a ply and carries on from there", async () => {
    const { board, store, play } = await boardWithUserLine(8);
    const total = timelineLength(play.snapshot!);
    const silent = mirrorBen(board, { open: "1N" });

    const out = await ensureFromPointBaseline(CHALLENGE, 8, "u1", 10, {
      store, client: silent.client, now,
    });

    expect(out.baseline.status).toBe("ready");
    expect(out.baseline.ply).toBe(10);
    expect(out.actions).toBe(total - 10);
    expect(out.benCalls).toBe(0); // the opponents replay from the cache
    expect(out.baseline.snapshot?.play).toEqual(play.snapshot!.play);
  });

  it("asks BEN only where the fork actually diverges", async () => {
    const { board, store, play } = await boardWithUserLine(9);
    // A user who opened differently from BEN: the continuation is a line
    // nobody has walked, so BEN is consulted again — and only from there.
    const forked: ChallengePlay = {
      ...play,
      userId: "u2",
      snapshot: { ...play.snapshot!, auction: [{ seat: "N", call: "P" }], play: [] },
    };
    await store.putPlay(forked);
    const ben = mirrorBen(board, { prefix: [{ kind: "call", seat: "N", call: "P" }] });

    const out = await ensureYourContractBaseline(CHALLENGE, 9, "u2", {
      store, client: ben.client, now,
    });

    expect(out.baseline.status).toBe("ready");
    // Three fresh passes to close the auction the user opened.
    expect(out.benCalls).toBe(3);
    expect(out.baseline.snapshot?.auction).toHaveLength(4);
    expect(out.baseline.rawScore).toBe(0);
  });

  it("refuses a baseline for a user who has not finished the board", async () => {
    const board = testBoard(10);
    const store = await storeWith(board);
    await expect(
      ensureYourContractBaseline(CHALLENGE, 10, "nobody", { store, client: brokenBen, now }),
    ).rejects.toThrow(/no completed play/);
    await expect(
      ensureFromPointBaseline(CHALLENGE, 10, "nobody", 0, { store, client: brokenBen, now }),
    ).rejects.toThrow(BaselineInputError);
    // Nothing was written: an unfinished board is not a failed baseline.
    expect(await store.listBaselines(CHALLENGE)).toEqual([]);
  });

  it("refuses a ply outside the user's line", async () => {
    const { store } = await boardWithUserLine(11);
    await expect(
      ensureFromPointBaseline(CHALLENGE, 11, "u1", 999, { store, client: brokenBen, now }),
    ).rejects.toThrow(BaselineInputError);
  });
});

// ── bidding-only ────────────────────────────────────────────────────────────
//
// The board ends when the auction ends, so the reference line does too. This is
// the single biggest latency win in the feature: /bid is ~1.5 s while /play is
// ~21 s (and /lead ~42 s), so dropping the 52 cards drops ~97% of the wall
// clock and turns five resumable invocations into one.

function biddingChallenge(): Challenge {
  return {
    challengeId: CHALLENGE,
    title: "Auction drill",
    scoring: "imps",
    createdBy: "u-marta",
    status: "open",
    format: "bidding-only",
    editorBadge: false,
    standingsVisibility: "after-finish",
    createdAt: "2026-08-07T00:00:00.000Z",
  };
}

describe("a bidding-only baseline", () => {
  it("bids the board and stops — the mode is read off the CHALLENGE, not the caller", async () => {
    const board = testBoard(41);
    const store = await storeWith(board);
    await store.putChallenge(biddingChallenge());
    const ben = mirrorBen(board, { open: "1N" });

    const out = await ensureFullBenBaseline(CHALLENGE, 41, { store, client: ben.client, now });

    expect(out.baseline.status).toBe("ready");
    expect(out.baseline.snapshot?.auction).toHaveLength(4); // 1N + three passes
    expect(out.baseline.snapshot?.play).toEqual([]);
    // The contract IS the result, structured so a learner's compares with it.
    expect(out.baseline.snapshot?.contract).toMatchObject({ level: 1, strain: "N" });
    // No cards, so no score — and an absent score, never a zero.
    expect(out.baseline.rawScore).toBeUndefined();
    expect(out.baseline.snapshot?.resultLabel).toBeUndefined();
    expect(out.resumable).toBe(false);
  });

  it("costs 4 BEN calls where the full board costs 56 — and never asks for a card", async () => {
    const board = testBoard(42);
    const store = await storeWith(board);
    await store.putChallenge(biddingChallenge());
    const ben = mirrorBen(board, { open: "1N" });

    const out = await ensureFullBenBaseline(CHALLENGE, 42, { store, client: ben.client, now });

    expect(out.benCalls).toBe(4);
    expect(ben.calls).toEqual({ bid: 4, lead: 0, play: 0 });
  });

  it("leaves a challenge with no format on the full playout — nothing changes for it", async () => {
    const board = testBoard(43);
    const store = await storeWith(board);
    const ben = mirrorBen(board, { open: "1N" });

    const out = await ensureFullBenBaseline(CHALLENGE, 43, { store, client: ben.client, now });

    expect(out.baseline.snapshot?.play).toHaveLength(52);
    expect(out.benCalls).toBe(56);
    expect(typeof out.baseline.rawScore).toBe("number");
  });

  it("stops a passed-out auction in the same place either way", async () => {
    const board = testBoard(44);
    const store = await storeWith(board);
    await store.putChallenge(biddingChallenge());
    const ben = mirrorBen(board); // every seat passes

    const out = await ensureFullBenBaseline(CHALLENGE, 44, { store, client: ben.client, now });

    expect(out.baseline.status).toBe("ready");
    // A passout reaches `complete` straight from the auction, so the board is
    // scored: a flat zero, which is a real result and not a missing one.
    expect(out.baseline.snapshot?.contract).toBeNull();
    expect(out.baseline.rawScore).toBe(0);
  });
});
