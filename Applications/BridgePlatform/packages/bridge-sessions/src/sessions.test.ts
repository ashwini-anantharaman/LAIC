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
  controllingSeat,
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

  it("a BEN seat acts through the injected decider; unwired BEN fails loudly", async () => {
    const compiled = (await kbService.liveCompile(kbId))!;
    // The injected decider stands in for the HTTP client: always bids Pass
    // with a BEN-styled reason. (The real one lives in the web app.)
    const benCalls: Seat[] = [];
    const withBen = new SessionService(new InMemorySessionStore(), kbStore, {
      now: () => NOW,
      benDecider: ({ seat }) => ({
        decideBid: async () => {
          benCalls.push(seat);
          return {
            action: "P",
            candidates: ["P"],
            trace: [],
            citedSettings: [],
            facts: {},
            reason: "BEN: nothing to say",
            rejected: [],
            fallback: false,
          };
        },
        decidePlay: async () => {
          throw new Error("not reached in this test");
        },
      }),
    });
    const record = await withBen.createSession({
      kbId,
      compiled,
      seats: { ...allAi, N: { kind: "ben", label: "BEN · neural" } },
      seed: 7,
      createdBy: "u_rhea",
    });

    // Dealer is N (BEN): the first step must have come from the injection.
    const view = await withBen.step(record.sessionId);
    expect(benCalls).toEqual(["N"]);
    const logic = view.record.events.filter(isLogicEvent);
    expect(logic[0]?.reason).toBe("BEN: nothing to say");
    expect(logic[0]?.seat).toBe("N");

    // Without the injection, a BEN seat asked to act errors clearly instead
    // of silently passing.
    const bare = await service.createSession({
      kbId,
      compiled,
      seats: { ...allAi, N: { kind: "ben", label: "BEN · neural" } },
      seed: 7,
      createdBy: "u_rhea",
    });
    await expect(service.step(bare.sessionId)).rejects.toThrow(/no BEN decider/);
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

// ── the dummy takeover ───────────────────────────────────────────────────────
// A learner whose ROBOT partner wins the contract declares it themselves rather
// than watching. The rule is one function so the service's gate, the view's
// `actingIsHuman` and the felt's `myTurn` cannot drift apart; these pin its
// edges — especially the edge it must NOT cross, a declarer seat held by
// another person.
describe("controllingSeat — the dummy takeover", () => {
  const seats = (kinds: Record<Seat, "human" | "ai">) =>
    Object.fromEntries(
      (Object.keys(kinds) as Seat[]).map((s) => [
        s,
        kinds[s] === "human"
          ? { kind: "human" as const, nexusUserId: `u-${s}` }
          : { kind: "ai" as const, label: `bot-${s}`, playerId: `p-${s}`, settings: {} },
      ]),
    ) as Parameters<typeof controllingSeat>[0];

  const playing = (declarer: Seat) =>
    ({ phase: "play", contract: { declarer, level: 1, strain: "N", doubled: 0 } }) as unknown as Parameters<
      typeof controllingSeat
    >[1];

  const SOLO = seats({ N: "ai", E: "ai", S: "human", W: "ai" });

  it("hands the robot declarer's chair to the human dummy", () => {
    expect(controllingSeat(SOLO, playing("N"), "N")).toBe("S");
  });

  it("leaves a human declarer alone — they already hold both hands", () => {
    expect(controllingSeat(SOLO, playing("S"), "S")).toBe("S");
  });

  it("REFUSES to take over a seat held by another person", () => {
    const pair = seats({ N: "human", E: "ai", S: "human", W: "ai" });
    expect(controllingSeat(pair, playing("N"), "N")).toBe("N");
  });

  it("does not fire for an opponent's contract", () => {
    expect(controllingSeat(SOLO, playing("E"), "E")).toBe("E");
    expect(controllingSeat(SOLO, playing("E"), "W")).toBe("W");
  });

  it("does not fire during the auction", () => {
    const auction = { phase: "auction", contract: null } as unknown as Parameters<
      typeof controllingSeat
    >[1];
    expect(controllingSeat(SOLO, auction, "N")).toBe("N");
  });
})

// The rule is only worth anything if it reaches the DECIDERS: the engine asks
// the declarer's decider for both the declarer's cards and dummy's, and
// deciders are wired per seat from the record — so a robot declarer partnered
// with the learner would keep playing both hands while the view claimed it was
// the learner's turn. This drives a real session to prove it stops.
describe("the dummy takeover, end to end", () => {
  /** N opens 1NT and everyone passes: N declares, S (the learner) is dummy. */
  const primeNorthDeclares = (seed: number) =>
    eventsFromRecording({
      boardRef: "takeover",
      dealer: "N",
      vul: "none",
      hands: seededDeal(seed),
      auction: [
        { seat: "N", call: "1N" },
        { seat: "E", call: "P" },
        { seat: "S", call: "P" },
        { seat: "W", call: "P" },
      ],
      play: [],
    }).events;

  const seatedSession = async (seats: Record<Seat, SeatConfig>) => {
    const compiled = (await kbService.liveCompile(kbId))!;
    return service.createSession({
      kbId,
      compiled,
      seats,
      seed: 11,
      dealer: "N",
      vul: "none",
      hands: seededDeal(11),
      primedEvents: primeNorthDeclares(11),
      createdBy: "u",
    });
  };

  it("stops the robot declarer and waits for the learner instead", async () => {
    const record = await seatedSession({
      ...allAi,
      S: { kind: "human", nexusUserId: "user_learner_lena" },
    });

    // The opening lead is EAST's — an opponent, and a robot, so it plays.
    const led = await service.step(record.sessionId);
    expect(led.state.tricks[0]!.plays.length).toBe(1);

    // Now it is dummy's card, which the engine resolves to the declarer's
    // chair. That chair is a robot's — and it must not play it.
    const view = await service.view(record.sessionId);
    expect(view.state.turn).toBe("S");
    expect(view.actingSeat).toBe("N");
    expect(view.actingIsHuman).toBe(true);
    await expect(service.step(record.sessionId)).rejects.toThrow(AwaitingHumanError);

    // The learner plays it instead, and it is accepted.
    const legal = legalPlays(view.state, view.state.turn);
    const after = await service.act(record.sessionId, { card: legal[0]! });
    expect(after.state.tricks[0]!.plays.length).toBe(2);
  });

  it("leaves a board alone when the declarer is another person", async () => {
    const record = await seatedSession({
      ...allAi,
      N: { kind: "human", nexusUserId: "user_north" },
      S: { kind: "human", nexusUserId: "user_south" },
    });
    await service.step(record.sessionId); // East leads.

    const view = await service.view(record.sessionId);
    expect(view.actingSeat).toBe("N");
    // Nothing was taken over: North is a person and plays their own cards.
    expect(controllingSeat(record.seats, view.state, "N")).toBe("N");
  });
})

// ---------------------------------------------------------------------------
// The coach's studio: the auction is the coach's, the play is the table's
// ---------------------------------------------------------------------------

describe("the studio's work in progress", () => {
  // Building a curated board takes an hour, so the words have to survive a
  // closed tab (owner ask 2026-08-19). The board always did — it is an event
  // log; the draft is everything around it.
  const studio = async () => {
    const compiled = (await kbService.liveCompile(kbId))!;
    return service.createSession({
      kbId, compiled, seats: allAi, seed: 5, createdBy: "u_coach",
      authoring: { learnerSeat: "S" as Seat },
    });
  };

  it("keeps a draft on the sitting, and stamps when", async () => {
    const record = await studio();
    const saved = await service.saveAuthoringDraft(record.sessionId, '{"note":"wip"}');
    expect(saved.authoring?.draftJson).toBe('{"note":"wip"}');
    expect(saved.authoring?.draftAt).toBe(NOW);
    // And it survives a read, which is the whole point.
    expect((await service.getSession(record.sessionId))?.authoring?.draftJson).toBe('{"note":"wip"}');
  });

  it("clears the draft on an empty string — what publishing does on its way out", async () => {
    const record = await studio();
    await service.saveAuthoringDraft(record.sessionId, '{"note":"wip"}');
    const cleared = await service.saveAuthoringDraft(record.sessionId, "");
    expect(cleared.authoring?.draftJson).toBeUndefined();
    // The stamp goes with it: no draft, no "saved at".
    expect(cleared.authoring?.draftAt).toBeUndefined();
    // The seat the board is built for is NOT collateral.
    expect(cleared.authoring?.learnerSeat).toBe("S");
  });

  it("refuses a sitting that is not an authoring one", async () => {
    const compiled = (await kbService.liveCompile(kbId))!;
    const plain = await service.createSession({
      kbId, compiled, seats: allAi, seed: 6, createdBy: "u",
    });
    await expect(service.saveAuthoringDraft(plain.sessionId, "{}")).rejects.toThrow(
      /not an authoring sitting/,
    );
  });

  it("shows up in the SUMMARY list without shipping the sitting", async () => {
    const record = await studio();
    await service.saveAuthoringDraft(record.sessionId, '{"note":"wip"}');
    const rows = await service.listRecentSummaries({ createdBy: "u_coach", status: "active" });
    const row = rows.find((r) => r.sessionId === record.sessionId)!;
    expect(row.authoring).toEqual({ learnerSeat: "S", hasDraft: true, draftAt: NOW });
    // A summary is a name and a date — never the game.
    expect("events" in row).toBe(false);
    expect("board" in row).toBe(false);
  });
})

describe("taking back several actions at once", () => {
  // The curated take-back has to unwind the learner's card plus whatever robot
  // replies auto-play slipped in — as ONE write, or the learner watches a button
  // that has already stopped saying anything (bug report 2026-08-19).
  it("drops exactly `count` actions, and stops at the deal", async () => {
    const compiled = (await kbService.liveCompile(kbId))!;
    const record = await service.createSession({
      kbId, compiled, seats: allAi, seed: 7, createdBy: "u",
    });
    let view = await service.view(record.sessionId);
    for (let i = 0; i < 6; i++) view = await service.step(record.sessionId);
    const actions = (v: typeof view) => v.state.auction.length;
    expect(actions(view)).toBe(6);

    const back = await service.undoActions(record.sessionId, 4);
    expect(actions(back)).toBe(2);
    // Every dropped action took its logic event with it: the log holds pairs.
    expect(back.record.events.filter(isActionEvent).length).toBe(2);
    expect(back.record.events.length).toBe(4);

    // More than the board holds empties it rather than failing.
    const empty = await service.undoActions(record.sessionId, 99);
    expect(actions(empty)).toBe(0);
    expect(empty.record.events.length).toBe(0);
  });

  it("does nothing for a count of zero", async () => {
    const compiled = (await kbService.liveCompile(kbId))!;
    const record = await service.createSession({
      kbId, compiled, seats: allAi, seed: 7, createdBy: "u",
    });
    await service.step(record.sessionId);
    const before = await service.view(record.sessionId);
    const after = await service.undoActions(record.sessionId, 0);
    expect(after.record.events.length).toBe(before.record.events.length);
  });
})

describe("reading a session that may not be there", () => {
  it("answers the record, or null — and requireSession still throws", async () => {
    // A table outliving its session is ordinary (discarded on the way out), and
    // the caller that can say so gracefully needs an answer, not an exception.
    const compiled = (await kbService.liveCompile(kbId))!;
    const record = await service.createSession({
      kbId, compiled, seats: allAi, seed: 3, createdBy: "u",
    });
    expect((await service.getSession(record.sessionId))?.sessionId).toBe(record.sessionId);
    expect(await service.getSession("bs_gone")).toBeNull();
    await expect(service.requireSession("bs_gone")).rejects.toThrow(/No session/);
  });
})

describe("an authoring sitting (the coach's studio)", () => {
  // The studio seats the coach where the LEARNER will sit and fills the other
  // three chairs with robots, exactly as an ordinary board does. What is not
  // ordinary is the auction: a board built to teach a contract has to reach
  // that contract, so every call is the coach's whichever chair it comes from
  // (owner direction 2026-08-19). The card play then runs like any other
  // table — the robots play their own cards.
  const COACH = "u_coach";

  const studio = async (authoring = true) => {
    const compiled = (await kbService.liveCompile(kbId))!;
    return service.createSession({
      kbId,
      compiled,
      seats: { ...allAi, S: { kind: "human", nexusUserId: COACH } },
      seed: 11,
      dealer: "N",
      hands: seededDeal(11),
      ...(authoring ? { authoring: { learnerSeat: "S" as Seat } } : {}),
      createdBy: COACH,
    });
  };

  it("has nothing to step in its auction — every call is a person's", async () => {
    const record = await studio();
    const view = await service.view(record.sessionId);
    // North deals, North is a robot chair — and it must not open the bidding.
    expect(view.actingSeat).toBe("N");
    expect(view.actingIsHuman).toBe(true);
    await expect(service.step(record.sessionId)).rejects.toThrow(AwaitingHumanError);
  });

  it("accepts the coach's call at a ROBOT'S chair", async () => {
    const record = await studio();
    const opened = await service.act(record.sessionId, { call: "P" });
    // Recorded as NORTH'S call, because it is — the coach made it for them.
    expect(opened.state.auction).toEqual([{ seat: "N", call: "P" }]);
    // …and on round the table, still theirs.
    const second = await service.act(record.sessionId, { call: "P" });
    expect(second.actingSeat).toBe("S");
    expect(second.actingIsHuman).toBe(true);
  });

  it("hands the play back to the robots the moment the auction ends", async () => {
    const record = await studio();
    // P P 1N P P P — the coach bids all six calls, and their own chair
    // declares 1NT, so the opening lead falls to a robot defender.
    for (const call of ["P", "P", "1N", "P", "P", "P"]) {
      await service.act(record.sessionId, { call });
    }
    const view = await service.view(record.sessionId);
    expect(view.state.phase).toBe("play");
    expect(view.state.contract).toMatchObject({ level: 1, strain: "N", declarer: "S" });
    // West leads: a robot's own card, in a phase the studio does not touch.
    expect(view.actingSeat).toBe("W");
    expect(view.actingIsHuman).toBe(false);
    const led = await service.step(record.sessionId);
    expect(led.state.tricks[0]!.plays.length).toBe(1);
    expect(led.state.tricks[0]!.plays[0]!.seat).toBe("W");
  });

  it("changes nothing about an ordinary table — the robots bid it themselves", async () => {
    const record = await studio(false);
    const view = await service.view(record.sessionId);
    expect(view.actingIsHuman).toBe(false);
    const bid = await service.step(record.sessionId);
    expect(bid.state.auction).toHaveLength(1);
    // And a person's call at a robot's chair is refused, as it always was.
    await expect(service.act(record.sessionId, { call: "P" })).rejects.toThrow(
      /not a human seat/,
    );
  });
})
