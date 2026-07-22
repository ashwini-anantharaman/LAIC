// Stage F service acceptance: sessions pin compiles and seat snapshots,
// AI stepping produces traced logic events, human actions are legality-
// checked, undo drops logic+action pairs, forks adopt the prefix, and a
// knowledge edit AFTER session creation never changes the pinned session.

import {
  isActionEvent,
  isLogicEvent,
  type Call,
  type Seat,
  type Vul,
} from "@bridge/events";
import { applyEvent, initialState, legalPlays, seededDeal } from "@bridge/engine";
import {
  FIXTURE_EDGES,
  FIXTURE_ITEMS,
  fixturePacks,
  InMemoryKbStore,
  KbService,
} from "@bridge/kb";
import { beforeEach, describe, expect, it } from "vitest";
import {
  AwaitingHumanError,
  eventsFromRecording,
  InMemorySessionStore,
  SessionService,
  type RecordedActions,
  type SeatConfig,
} from "./index";

const NOW = "2026-07-14T16:00:00.000Z";

let kbStore: InMemoryKbStore;
let kbService: KbService;
let service: SessionService;
let kbId: string;

const aiSeat = (label: string): SeatConfig => ({
  kind: "kb_player",
  playerId: "pl_x",
  label,
  enabledPackIds: ["pk_conventions"],
  settingOverrides: {},
  decisionPolicyId: "first_match",
});

const allAi: Record<Seat, SeatConfig> = {
  N: aiSeat("North bot"),
  E: aiSeat("East bot"),
  S: aiSeat("South bot"),
  W: aiSeat("West bot"),
};

beforeEach(async () => {
  kbStore = new InMemoryKbStore();
  kbService = new KbService(kbStore, { now: () => NOW });
  const kb = await kbService.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
  kbId = kb.kbId;
  for (const item of FIXTURE_ITEMS) {
    await kbStore.putItem(item);
    await kbStore.addMembership({ kbId, itemId: item.itemId });
  }
  for (const edge of FIXTURE_EDGES) await kbStore.putEdge(edge);
  for (const pack of fixturePacks(kbId)) await kbStore.putPack(pack);
  await kbService.recompile(kbId);
  service = new SessionService(new InMemorySessionStore(), kbStore, { now: () => NOW });
});

describe("SessionService", () => {
  it("plays an all-AI board to completion with traced logic events", async () => {
    const compiled = (await kbService.liveCompile(kbId))!;
    const record = await service.createSession({
      kbId,
      compiled,
      seats: allAi,
      seed: 7,
      createdBy: "u_rhea",
    });

    let view = await service.view(record.sessionId);
    let guard = 0;
    while (view.state.phase !== "complete" && guard++ < 400) {
      view = await service.step(record.sessionId);
    }
    expect(view.state.phase).toBe("complete");
    expect(view.record.status).toBe("completed");

    const logic = view.record.events.filter(isLogicEvent);
    const actions = view.record.events.filter(isActionEvent);
    expect(logic.length).toBe(actions.length); // every action has its trace
    expect(logic.some((e) => e.matchedRuleId)).toBe(true);
  });

  it("human seats block step, accept legal actions, reject illegal ones", async () => {
    const compiled = (await kbService.liveCompile(kbId))!;
    const record = await service.createSession({
      kbId,
      compiled,
      seats: { ...allAi, N: { kind: "human", nexusUserId: "user_learner_lena" } },
      seed: 3,
      createdBy: "u",
    });

    // Dealer is N (human): step must hand control back.
    await expect(service.step(record.sessionId)).rejects.toThrow(AwaitingHumanError);

    await expect(
      service.act(record.sessionId, { call: "8S" }),
    ).rejects.toThrow(/not a legal call/);

    const view = await service.act(record.sessionId, { call: "P" });
    expect(view.state.auction.map((c) => c.call)).toEqual(["P"]);
    expect(view.actingIsHuman).toBe(false); // E is AI now
  });

  it("undo drops the logic+action pair together", async () => {
    const compiled = (await kbService.liveCompile(kbId))!;
    const record = await service.createSession({
      kbId,
      compiled,
      seats: allAi,
      seed: 7,
      createdBy: "u",
    });
    await service.step(record.sessionId);
    const after = await service.step(record.sessionId);
    expect(after.record.events).toHaveLength(4); // 2 × (logic + action)

    const undone = await service.undo(record.sessionId);
    expect(undone.record.events).toHaveLength(2);
    expect(undone.state.auction).toHaveLength(1);
  });

  it("editing knowledge after creation never changes a pinned session", async () => {
    const compiled = (await kbService.liveCompile(kbId))!;
    const record = await service.createSession({
      kbId,
      compiled,
      seats: allAi,
      seed: 7,
      createdBy: "u",
    });
    const before = await service.step(record.sessionId);

    // Owner-style nonsense edit AFTER the session exists.
    await kbService.saveItem(
      kbId,
      "ki_open_2c",
      {
        payload: {
          kind: "auction_rules",
          rules: [
            {
              key: "open",
              label: "2♣ on nothing",
              context: { role: "opening" },
              conditions: { hcp: { max: 40 } },
              action: { type: "bid", level: 2, strain: "C" },
              priority: 1,
            },
          ],
        },
      },
      "u_owner",
    );

    // Undo and replay the same decision on the SAME session: identical call
    // (the pin holds; the edited rule would otherwise hijack every opening).
    await service.undo(record.sessionId);
    const replayed = await service.step(record.sessionId);
    expect(replayed.state.auction.map((c) => c.call)).toEqual(
      before.state.auction.map((c) => c.call),
    );
  });

  it("fork adopts the prefix and lets configs change from there", async () => {
    const compiled = (await kbService.liveCompile(kbId))!;
    const record = await service.createSession({
      kbId,
      compiled,
      seats: allAi,
      seed: 7,
      createdBy: "u",
    });
    await service.step(record.sessionId);
    const source = await service.view(record.sessionId);

    const forked = await service.fork(
      record.sessionId,
      {
        ...allAi,
        S: {
          ...aiSeat("South, Stayman off"),
          settingOverrides: { stayman_on: false },
        } as SeatConfig,
      },
      "u",
    );
    expect(forked.forkedFromSessionId).toBe(record.sessionId);

    const view = await service.view(forked.sessionId);
    expect(view.state.auction).toHaveLength(source.state.auction.length);
    // The source session is untouched by the fork.
    const sourceAgain = await service.view(record.sessionId);
    expect(sourceAgain.record.events).toHaveLength(source.record.events.length);

    // A FRESH fork keeps the board but replays from the deal (seat swaps on
    // completed boards).
    const fresh = await service.fork(record.sessionId, allAi, "u", { fresh: true });
    expect(fresh.events).toHaveLength(0);
    expect(fresh.board.seed).toBe(record.board.seed);
    const freshView = await service.view(fresh.sessionId);
    expect(freshView.state.auction).toHaveLength(0);
  });
});

describe("explicit-deal boards (library/import)", () => {
  it("a session created with explicit hands plays THAT deal, not the seed deal", async () => {
    const compiled = (await kbService.liveCompile(kbId))!;
    const { seededDeal } = await import("@bridge/engine");
    const hands = seededDeal(42); // a valid 52-card deal, but pinned explicitly
    const record = await service.createSession({
      kbId,
      compiled,
      seats: allAi,
      seed: 7, // deliberately different from the hands' seed
      hands,
      boardName: "Library board #1",
      createdBy: "u_rhea",
    });
    expect(record.board.name).toBe("Library board #1");

    const view = await service.view(record.sessionId);
    expect(view.state.hands.N).toEqual(hands.N);
    expect(view.state.hands.S).toEqual(hands.S);

    // Forks keep the explicit deal too.
    const forked = await service.fork(record.sessionId, allAi, "u");
    const forkView = await service.view(forked.sessionId);
    expect(forkView.state.hands.E).toEqual(hands.E);
    expect(forked.board.name).toBe("Library board #1");
  });
});

describe("eventsFromRecording", () => {
  const boardRef = "recorded-board";
  const hands = seededDeal(11);

  /** A legal 4-call auction (1N by N, passed out) plus two full tricks,
   *  derived by folding the real engine so every entry is legal. */
  const buildRecording = (): RecordedActions => {
    const auction: RecordedActions["auction"] = [
      { seat: "N", call: "1N" },
      { seat: "E", call: "P" },
      { seat: "S", call: "P" },
      { seat: "W", call: "P" },
    ];
    let state = initialState(boardRef, "N", "none", hands);
    for (const { seat, call } of auction)
      state = applyEvent(state, {
        seq: 0,
        ts: 0,
        boardRef,
        category: "bid-event",
        seat,
        call,
        fallback: false,
      });
    const play: RecordedActions["play"] = [];
    for (let i = 0; i < 8; i++) {
      const seat = state.turn;
      const card = legalPlays(state, seat)[0]!;
      play.push({ seat, card });
      state = applyEvent(state, {
        seq: 0,
        ts: 0,
        boardRef,
        category: "play-event",
        seat,
        card,
        fallback: false,
      });
    }
    return { boardRef, dealer: "N", vul: "none", hands, auction, play };
  };

  it("emits logic+action pairs with the engine's seq invariant", () => {
    const { events, complete } = eventsFromRecording(buildRecording());
    expect(events).toHaveLength(2 * (4 + 8));
    expect(complete).toBe(false);
    for (let i = 0; i < events.length; i += 2) {
      const logic = events[i]!;
      const action = events[i + 1]!;
      expect(isLogicEvent(logic)).toBe(true);
      expect(isActionEvent(action)).toBe(true);
      expect(logic.seq).toBe(i); // even seqs are logic events
      expect(action.seq).toBe(logic.seq + 1); // logicSeq = action.seq - 1
    }
  });

  it("a session primed with the events replays the recorded auction and play", async () => {
    const rec = buildRecording();
    const { events } = eventsFromRecording(rec);
    const compiled = (await kbService.liveCompile(kbId))!;
    const record = await service.createSession({
      kbId,
      compiled,
      seats: allAi,
      seed: 1,
      dealer: rec.dealer,
      vul: rec.vul,
      hands: rec.hands,
      boardName: rec.boardRef,
      createdBy: "u",
      primedEvents: events,
    });

    const view = await service.view(record.sessionId);
    expect(view.state.auction.map((c) => c.call)).toEqual(rec.auction.map((a) => a.call));
    expect(view.state.phase).toBe("play");
    // Two full tricks are gone from the hands (13 → 11 each).
    for (const seat of ["N", "E", "S", "W"] as Seat[])
      expect(view.state.hands[seat]).toHaveLength(11);
    // The next actor follows the recorded prefix, not the deal.
    const played = rec.play.map((p) => `${p.card.suit}${p.card.rank}`);
    for (const seat of ["N", "E", "S", "W"] as Seat[])
      for (const card of view.state.hands[seat])
        expect(played).not.toContain(`${card.suit}${card.rank}`);
  });

  it("throws on an out-of-turn or unavailable recorded call", () => {
    const rec = buildRecording();
    expect(() =>
      eventsFromRecording({ ...rec, auction: [{ seat: "E", call: "P" }], play: [] }),
    ).toThrow(/out of turn/);
    expect(() =>
      eventsFromRecording({
        ...rec,
        auction: [
          { seat: "N", call: "P" },
          { seat: "E", call: "X" }, // nothing to double
        ],
        play: [],
      }),
    ).toThrow(/not legal/);
  });

  it("flags a fully passed-out recording complete", () => {
    const auction: RecordedActions["auction"] = (["N", "E", "S", "W"] as Seat[]).map(
      (seat) => ({ seat, call: "P" as Call }),
    );
    const { events, complete } = eventsFromRecording({
      boardRef,
      dealer: "N",
      vul: "none" as Vul,
      hands,
      auction,
      play: [],
    });
    expect(complete).toBe(true);
    expect(events).toHaveLength(8);
  });
});

describe("rewindToStart and createSession status", () => {
  it("rewinds a completed board to the fresh deal, back to active", async () => {
    const compiled = (await kbService.liveCompile(kbId))!;
    const record = await service.createSession({
      kbId,
      compiled,
      seats: allAi,
      seed: 7,
      createdBy: "u",
    });
    let view = await service.view(record.sessionId);
    let guard = 0;
    while (view.state.phase !== "complete" && guard++ < 400) {
      view = await service.step(record.sessionId);
    }
    expect(view.record.status).toBe("completed");

    const rewound = await service.rewindToStart(record.sessionId);
    expect(rewound.record.events).toHaveLength(0);
    expect(rewound.record.status).toBe("active");
    expect(rewound.state.phase).toBe("auction");
    expect(rewound.state.auction).toHaveLength(0);
  });

  it("createSession persists an explicit completed status", async () => {
    const compiled = (await kbService.liveCompile(kbId))!;
    const record = await service.createSession({
      kbId,
      compiled,
      seats: allAi,
      seed: 7,
      createdBy: "u",
      status: "completed",
    });
    expect(record.status).toBe("completed");
    const view = await service.view(record.sessionId);
    expect(view.record.status).toBe("completed");
  });
});

describe("library store", () => {
  it("round-trips entries and filters by kind", async () => {
    const { InMemoryLibraryStore } = await import("./library");
    const lib = new InMemoryLibraryStore();
    await lib.putEntry({
      entryId: "le_1",
      kind: "board",
      name: "Slam try",
      tags: ["slam"],
      dealer: "S",
      vul: "ns",
      origin: "recorded",
      createdBy: "u_rhea",
      createdAt: "2026-07-16T10:00:00.000Z",
    });
    await lib.putEntry({
      entryId: "le_2",
      kind: "table",
      name: "Beginner lineup",
      tags: [],
      kbId: "kb_x",
      seats: {
        N: { label: "Beginner (auto)" },
        E: { label: "Beginner (auto)" },
        S: { label: "you", human: true },
        W: { label: "Beginner (auto)" },
      },
      origin: "authored",
      createdBy: "u_rhea",
      createdAt: "2026-07-16T11:00:00.000Z",
    });

    expect((await lib.listEntries()).map((e) => e.entryId)).toEqual(["le_2", "le_1"]);
    expect((await lib.listEntries("board")).map((e) => e.entryId)).toEqual(["le_1"]);
    expect((await lib.getEntry("le_1"))?.name).toBe("Slam try");
    await lib.deleteEntry("le_1");
    expect(await lib.getEntry("le_1")).toBeNull();
  });
});
