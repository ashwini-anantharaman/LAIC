// The challenge BEN seam, with a STUBBED BEN client and an in-memory store —
// no BEN container, no database. What must hold (spec §3, fairness):
//
//   · the SAME position is asked of BEN exactly ONCE; every later visitor is
//     served from `bridge_ben_decisions` — that is what makes every
//     participant meet identical opposition on identical lines;
//   · a different position is a different question;
//   · concurrent visitors to a fresh position share one BEN call;
//   · a store that cannot be read still yields a decision (fail open), and a
//     store that cannot be written never breaks the caller;
//   · NOTHING falls back to the KB player: an unreachable BEN, an illegal
//     answer or an unreadable answer all surface as BenUnavailableError.

import { InMemoryChallengeStore, type ChallengeStore } from "@bridge/challenges";
import { applyEvent, initialState, seededDeal, type GameState } from "@bridge/engine";
import type { ActionEvent, Call, Card, Seat } from "@bridge/events";
import { describe, expect, it } from "vitest";
import { pbnRank } from "./benchmark";
import type { BenCardResult, BenTableClient } from "./benSeat";
import {
  benPositionHash,
  benPositionKey,
  challengeBenDecider,
  challengeBenDecision,
  isBenUnavailable,
  warmBen,
  type ChallengeBenDeps,
} from "./challengeBen";

const CHALLENGE = "ch_seam";
const BOARD = 3;

function bid(state: GameState, seat: Seat, call: Call): GameState {
  const e: ActionEvent = {
    seq: 0, ts: 0, boardRef: state.boardRef, category: "bid-event", seat, call, fallback: false,
  };
  return applyEvent(state, e);
}

/** A board on a fixed deal — deterministic and independent of BEN. */
function board(seed = 11): GameState {
  return initialState("b", "N", "none", seededDeal(seed));
}

/** 1NT by North, three passes: the play phase, East on lead. */
function playing(seed = 11): GameState {
  let s = board(seed);
  s = bid(s, "N", "1N");
  s = bid(s, "E", "P");
  s = bid(s, "S", "P");
  s = bid(s, "W", "P");
  return s;
}

const cardToken = (c: Card) => `${c.suit}${pbnRank(c.rank)}`;

interface Stub {
  client: BenTableClient;
  calls: { bid: number; lead: number; play: number };
}

/** A BEN that answers what it is told to, and counts every question. */
function stub(answers: {
  bid?: Call;
  card?: Card;
  throwOn?: "bid" | "lead" | "play";
  rawCard?: string;
}): Stub {
  const calls = { bid: 0, lead: 0, play: 0 };
  const card = (): BenCardResult => ({
    card: answers.rawCard ?? (answers.card ? cardToken(answers.card) : ""),
    candidates: [],
  });
  const client: BenTableClient = {
    async bid() {
      calls.bid++;
      if (answers.throwOn === "bid") throw new Error("stub is down");
      return { bid: answers.bid ?? "P", candidates: [] };
    },
    async lead() {
      calls.lead++;
      if (answers.throwOn === "lead") throw new Error("stub is down");
      return card();
    },
    async play() {
      calls.play++;
      if (answers.throwOn === "play") throw new Error("stub is down");
      return card();
    },
  };
  return { client, calls };
}

function deps(client: BenTableClient, store: ChallengeStore = new InMemoryChallengeStore()) {
  return { client, store, now: () => "2026-08-07T00:00:00.000Z" } satisfies ChallengeBenDeps;
}

describe("the position key", () => {
  it("is the dealer, the calls and the cards — and nothing else", () => {
    expect(benPositionKey(board())).toBe("N//");
    expect(benPositionKey(bid(board(), "N", "1N"))).toBe("N/N1N/");
  });

  it("separates positions that differ only in the auction", () => {
    expect(benPositionHash(board())).not.toBe(benPositionHash(bid(board(), "N", "1N")));
  });

  it("is the same string for the same position on a different deal object", () => {
    // The pack is fixed per (challenge, board), so the key never carries it.
    expect(benPositionHash(board(11))).toBe(benPositionHash(board(11)));
  });
});

describe("the decision cache", () => {
  it("asks BEN once for a position and serves every later visitor from the cache", async () => {
    const s = stub({ bid: "1N" });
    const d = deps(s.client);
    const state = board();

    const first = await challengeBenDecision({ challengeId: CHALLENGE, boardNo: BOARD, state, ...d });
    const second = await challengeBenDecision({ challengeId: CHALLENGE, boardNo: BOARD, state, ...d });

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.decision).toEqual(first.decision);
    expect(s.calls.bid).toBe(1);
    expect(await d.store.countDecisions(CHALLENGE)).toBe(1);
  });

  it("gives two participants on the same line the same opposition", async () => {
    const store = new InMemoryChallengeStore();
    const alice = stub({ bid: "1N" });
    const bob = stub({ bid: "4S" }); // a DIFFERENT BEN answer, never consulted
    const state = board();

    const a = await challengeBenDecision({
      challengeId: CHALLENGE, boardNo: BOARD, state, ...deps(alice.client, store),
    });
    const b = await challengeBenDecision({
      challengeId: CHALLENGE, boardNo: BOARD, state, ...deps(bob.client, store),
    });

    expect(b.decision).toEqual(a.decision);
    expect(bob.calls.bid).toBe(0);
  });

  it("treats a different position as a different question", async () => {
    const s = stub({ bid: "P" });
    const d = deps(s.client);
    await challengeBenDecision({ challengeId: CHALLENGE, boardNo: BOARD, state: board(), ...d });
    await challengeBenDecision({
      challengeId: CHALLENGE, boardNo: BOARD, state: bid(board(), "N", "1N"), ...d,
    });
    expect(s.calls.bid).toBe(2);
  });

  it("scopes the cache to (challenge, board)", async () => {
    const s = stub({ bid: "P" });
    const d = deps(s.client);
    const state = board();
    await challengeBenDecision({ challengeId: CHALLENGE, boardNo: 1, state, ...d });
    await challengeBenDecision({ challengeId: CHALLENGE, boardNo: 2, state, ...d });
    await challengeBenDecision({ challengeId: "ch_other", boardNo: 1, state, ...d });
    expect(s.calls.bid).toBe(3);
  });

  it("coalesces concurrent visitors to a fresh position into one BEN call", async () => {
    const s = stub({ bid: "1N" });
    const d = deps(s.client);
    const state = board(12);
    const [a, b] = await Promise.all([
      challengeBenDecision({ challengeId: "ch_race", boardNo: BOARD, state, ...d }),
      challengeBenDecision({ challengeId: "ch_race", boardNo: BOARD, state, ...d }),
    ]);
    expect(s.calls.bid).toBe(1);
    expect(a.decision).toEqual(b.decision);
  });

  it("caches the opening lead and every later card the same way", async () => {
    const state = playing();
    const lead = state.hands.E[0]!;
    const s = stub({ card: lead });
    const d = deps(s.client);

    const first = await challengeBenDecision({ challengeId: CHALLENGE, boardNo: BOARD, state, ...d });
    const second = await challengeBenDecision({ challengeId: CHALLENGE, boardNo: BOARD, state, ...d });

    expect(first.decision).toEqual({ kind: "card", seat: "E", card: lead });
    expect(second.cached).toBe(true);
    expect(s.calls.lead).toBe(1); // /lead for the opening card, once
    expect(s.calls.play).toBe(0);
  });

  it("ignores a cached decision that is not playable here and asks again", async () => {
    const store = new InMemoryChallengeStore();
    const state = board();
    await store.putDecision({
      challengeId: CHALLENGE,
      boardNo: BOARD,
      historyHash: benPositionHash(state),
      // A card, at a position where a CALL is due — corrupt, not usable.
      decision: { kind: "card", seat: "N", card: { suit: "S", rank: 14 } },
      createdAt: "2026-08-07T00:00:00.000Z",
    });
    const s = stub({ bid: "1N" });
    const out = await challengeBenDecision({
      challengeId: CHALLENGE, boardNo: BOARD, state, ...deps(s.client, store),
    });
    expect(out.decision).toEqual({ kind: "call", seat: "N", call: "1N" });
    expect(s.calls.bid).toBe(1);
  });
});

describe("a store that misbehaves", () => {
  it("fails OPEN on read: an unreadable cache costs a BEN call, not the board", async () => {
    const store = new InMemoryChallengeStore();
    store.getDecision = async () => {
      throw new Error("db down");
    };
    const s = stub({ bid: "1N" });
    const out = await challengeBenDecision({
      challengeId: CHALLENGE, boardNo: BOARD, state: board(), ...deps(s.client, store),
    });
    expect(out.decision).toEqual({ kind: "call", seat: "N", call: "1N" });
  });

  it("never crashes on a failed write", async () => {
    const store = new InMemoryChallengeStore();
    store.putDecision = async () => {
      throw new Error("duplicate key");
    };
    const s = stub({ bid: "1N" });
    const out = await challengeBenDecision({
      challengeId: CHALLENGE, boardNo: BOARD, state: board(), ...deps(s.client, store),
    });
    expect(out.cached).toBe(false);
    expect(out.decision).toEqual({ kind: "call", seat: "N", call: "1N" });
  });

  it("defers to whoever wrote the position first (last-write-wins never splits a line)", async () => {
    const store = new InMemoryChallengeStore();
    const state = board();
    const hash = benPositionHash(state);
    const s = stub({ bid: "4S" });
    // A competing worker lands its answer while our BEN call is in flight.
    const original = store.getDecision.bind(store);
    let seen = 0;
    store.getDecision = async (c, b, h) => {
      seen++;
      if (seen === 2)
        return {
          challengeId: c, boardNo: b, historyHash: h,
          decision: { kind: "call", seat: "N", call: "1N" },
          createdAt: "2026-08-07T00:00:00.000Z",
        };
      return original(c, b, h);
    };
    const out = await challengeBenDecision({
      challengeId: CHALLENGE, boardNo: BOARD, state, ...deps(s.client, store),
    });
    expect(out.decision).toEqual({ kind: "call", seat: "N", call: "1N" });
    expect(out.cached).toBe(true);
    expect(out.historyHash).toBe(hash);
  });
});

describe("failure is typed, and there is no KB fallback", () => {
  it("surfaces an unreachable BEN instead of passing", async () => {
    const s = stub({ throwOn: "bid" });
    const call = challengeBenDecision({
      challengeId: CHALLENGE, boardNo: BOARD, state: board(), ...deps(s.client),
    });
    await expect(call).rejects.toThrow(/BEN could not bid/);
    await call.catch((e) => {
      expect(isBenUnavailable(e)).toBe(true);
      expect(e.stage).toBe("bid");
      expect(e.seat).toBe("N");
    });
  });

  it("refuses an illegal call rather than substituting one", async () => {
    const state = bid(board(), "N", "1N");
    const s = stub({ bid: "1C" }); // insufficient
    await expect(
      challengeBenDecision({ challengeId: CHALLENGE, boardNo: BOARD, state, ...deps(s.client) }),
    ).rejects.toThrow(/not a legal call/);
  });

  it("refuses an unreadable card", async () => {
    const s = stub({ rawCard: "banana" });
    await expect(
      challengeBenDecision({ challengeId: CHALLENGE, boardNo: BOARD, state: playing(), ...deps(s.client) }),
    ).rejects.toThrow(/unreadable card/);
  });

  it("refuses a card that is not in the hand on play", async () => {
    const state = playing();
    const notEast = state.hands.N[0]!;
    const s = stub({ card: notEast });
    await expect(
      challengeBenDecision({ challengeId: CHALLENGE, boardNo: BOARD, state, ...deps(s.client) }),
    ).rejects.toThrow(/not legal here/);
  });

  it("writes nothing to the cache when BEN cannot answer", async () => {
    const store = new InMemoryChallengeStore();
    const s = stub({ throwOn: "bid" });
    await challengeBenDecision({
      challengeId: CHALLENGE, boardNo: BOARD, state: board(), ...deps(s.client, store),
    }).catch(() => {});
    expect(await store.countDecisions(CHALLENGE)).toBe(0);
  });
});

describe("the table's decider", () => {
  it("hands the engine a non-fallback decision, and says when it came from the cache", async () => {
    const s = stub({ bid: "1N" });
    const decider = challengeBenDecider({ challengeId: "ch_dec", boardNo: BOARD, ...deps(s.client) });
    const state = board();

    const first = await decider.decideBid(state, "N");
    const second = await decider.decideBid(state, "N");

    expect(first.action).toBe("1N");
    expect(first.fallback).toBe(false);
    expect(first.reason).toMatch(/BEN/);
    expect(second.reason).toMatch(/every participant/);
    expect(s.calls.bid).toBe(1);
  });

  it("plays cards through the same cache", async () => {
    const state = playing();
    const lead = state.hands.E[0]!;
    const s = stub({ card: lead });
    const decider = challengeBenDecider({ challengeId: "ch_dec2", boardNo: BOARD, ...deps(s.client) });
    const decision = await decider.decidePlay(state, "E");
    expect(decision.action).toEqual(lead);
    expect(decision.fallback).toBe(false);
  });

  it("throws BenUnavailableError instead of degrading", async () => {
    const s = stub({ throwOn: "bid" });
    const decider = challengeBenDecider({ challengeId: "ch_dec3", boardNo: BOARD, ...deps(s.client) });
    const failed = await decider.decideBid(board(), "N").catch((e: unknown) => e);
    expect(isBenUnavailable(failed)).toBe(true);
  });
});

describe("warm-up", () => {
  it("reports an unconfigured BEN honestly instead of throwing", async () => {
    const before = process.env.BEN_ENDPOINT;
    delete process.env.BEN_ENDPOINT;
    const out = await warmBen();
    if (before !== undefined) process.env.BEN_ENDPOINT = before;
    expect(out).toMatchObject({ ok: false, configured: false });
  });

  it("counts a timeout as 'not warm yet', never as an error to render", async () => {
    const s = stub({ throwOn: "bid" });
    const out = await warmBen({ client: s.client });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/stub is down/);
  });

  it("is ok when BEN answers", async () => {
    const s = stub({ bid: "P" });
    expect((await warmBen({ client: s.client })).ok).toBe(true);
  });
});
