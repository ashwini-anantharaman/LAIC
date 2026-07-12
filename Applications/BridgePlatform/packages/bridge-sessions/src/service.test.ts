// Phase 4 acceptance: save/reload reconstructs identical state; the event log
// is ordered, gap-free, replayable; undo survives persistence round-trips;
// tenant isolation holds (org A cannot read org B).

import { defaultSettingValues } from "@bridge/config";
import { BOARD_G1, legalPlays, seededBoard, type BridgeRulePackage } from "@bridge/engine";
import { cardId, isActionEvent } from "@bridge/events";
import {
  BEGINNER_NATURAL_PACKAGE_ID,
  BEGINNER_NATURAL_V0_SEED,
  InMemoryKnowledgeStore,
  runGeneration,
} from "@bridge/knowledge";
import type { NexusBridgeContext } from "@laic/learner-contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { AwaitingHumanError, SessionAccessError, SessionService } from "./service";
import { InMemorySessionStore } from "./store";

const NOW = "2026-07-08T12:00:00.000Z";

const ctx = (over: Partial<NexusBridgeContext>): NexusBridgeContext => ({
  nexusUserId: "user_a",
  laicOrgId: "org_laic",
  programId: "bridge_program",
  programOrganizationId: "bporg_club_a",
  appId: "bridge_ai_coach",
  roles: ["bridge_learner"],
  permissions: [],
  accessLevel: "learner",
  ...over,
});

let pkg: BridgeRulePackage;

beforeAll(async () => {
  const kstore = new InMemoryKnowledgeStore(BEGINNER_NATURAL_V0_SEED);
  await runGeneration(kstore, {
    systemFamily: "natural",
    requestedBy: "test",
    now: NOW,
    runId: "run_sessions",
  });
  pkg = (await kstore.getPackage(BEGINNER_NATURAL_PACKAGE_ID, "0.1.0"))!.pkg;
});

function makeService() {
  const store = new InMemorySessionStore();
  const service = new SessionService({
    store,
    loadPackage: async (ref) =>
      ref.packageId === pkg.packageId && ref.version === pkg.version ? pkg : null,
    now: () => NOW,
  });
  return { store, service };
}

const values = () => defaultSettingValues(pkg.settings);

describe("session persistence", () => {
  it("plays a board, persists ordered gap-free events, and reloads identically", async () => {
    const { store, service } = makeService();
    const caller = ctx({});
    const record = await service.createSession({
      context: caller,
      sessionType: "single_board",
      board: BOARD_G1,
      pkg,
      resolvedValues: values(),
    });

    const done = await service.autoplay(record.bridgeSessionId, caller);
    expect(done.state.phase).toBe("complete");
    expect(done.record.status).toBe("completed");

    // Ordered, gap-free seq (logic+action pairs -> consecutive integers).
    const events = await store.getEvents(record.bridgeSessionId);
    events.forEach((e, i) => expect(e.seq).toBe(i));
    expect(events.filter(isActionEvent).length).toBe(6 + 52); // G1: 6 calls, 52 cards

    // Reload from storage: identical state.
    const reloaded = await service.getSession(record.bridgeSessionId, caller);
    expect(reloaded.state).toEqual(done.state);
    expect(reloaded.record.resolvedValueHash).toBe(record.resolvedValueHash);
    expect(reloaded.record.packageRef).toEqual({ packageId: pkg.packageId, version: "0.1.0" });
  });

  it("undo works across persistence round-trips and seq is reused", async () => {
    const { store, service } = makeService();
    const caller = ctx({});
    const { bridgeSessionId: id } = await service.createSession({
      context: caller,
      sessionType: "single_board",
      board: BOARD_G1,
      pkg,
      resolvedValues: values(),
    });

    await service.step(id, caller); // N: 1S
    await service.step(id, caller); // E: P
    expect((await service.getSession(id, caller)).state.auction.length).toBe(2);

    const afterUndo = await service.undo(id, caller);
    expect(afterUndo.state.auction.length).toBe(1);
    expect((await store.getEvents(id)).length).toBe(2); // one logic + one action left

    // A fresh request (new reconstruction) steps again and reuses seqs 2..3.
    const again = await service.step(id, caller);
    expect(again.state.auction.map((c) => c.call)).toEqual(["1S", "P"]);
    expect((await store.getEvents(id)).map((e) => e.seq)).toEqual([0, 1, 2, 3]);
  });

  it("human seats: step() defers, applyExternalAction commits an honest trace", async () => {
    const { store, service } = makeService();
    const caller = ctx({});
    const { bridgeSessionId: id } = await service.createSession({
      context: caller,
      sessionType: "single_board",
      board: BOARD_G1,
      pkg,
      resolvedValues: values(),
      seats: { N: { seat: "N", playerKind: "human", occupantId: caller.nexusUserId } },
    });

    await expect(service.step(id, caller)).rejects.toBeInstanceOf(AwaitingHumanError);

    await expect(
      service.applyExternalAction(id, caller, "N", { kind: "bid", call: "8S" }),
    ).rejects.toThrow(/Illegal/);

    const view = await service.applyExternalAction(id, caller, "N", { kind: "bid", call: "1S" });
    expect(view.state.auction.map((c) => c.call)).toEqual(["1S"]);
    const logic = (await store.getEvents(id)).find((e) => e.category === "bid-logic-event")!;
    expect(logic.reason).toBe("Human chose this call");
    expect(logic.trace).toEqual([]); // never dressed up as a rule decision
    expect(logic.fallback).toBe(false);
  });

  it("refuses to create sessions against deprecated packages", async () => {
    const { service } = makeService();
    await expect(
      service.createSession({
        context: ctx({}),
        sessionType: "single_board",
        board: BOARD_G1,
        pkg: { ...pkg, status: "deprecated" },
        resolvedValues: values(),
      }),
    ).rejects.toThrow(/deprecated/);
  });
});

describe("tenant isolation (Bridge plan §21)", () => {
  it("org A members cannot read org B sessions; program admin can", async () => {
    const { service } = makeService();
    const orgA = ctx({ nexusUserId: "user_a", programOrganizationId: "bporg_club_a" });
    const orgB = ctx({ nexusUserId: "user_b", programOrganizationId: "bporg_club_b" });
    const orgAPeer = ctx({ nexusUserId: "user_a2", programOrganizationId: "bporg_club_a" });
    const programAdmin = ctx({
      nexusUserId: "user_admin",
      programOrganizationId: undefined,
      roles: ["bridge_program_admin"],
      accessLevel: "admin",
    });

    const record = await service.createSession({
      context: orgA,
      sessionType: "single_board",
      board: seededBoard(9),
      pkg,
      resolvedValues: values(),
    });
    const id = record.bridgeSessionId;

    await expect(service.getSession(id, orgB)).rejects.toBeInstanceOf(SessionAccessError);
    await expect(service.getEvents(id, orgB)).rejects.toBeInstanceOf(SessionAccessError);
    await expect(service.step(id, orgB)).rejects.toBeInstanceOf(SessionAccessError);

    expect((await service.getSession(id, orgAPeer)).record.bridgeSessionId).toBe(id);
    expect((await service.getSession(id, programAdmin)).record.bridgeSessionId).toBe(id);

    expect((await service.listSessions(orgB)).length).toBe(0);
    expect((await service.listSessions(orgAPeer)).length).toBe(1);
  });
});

describe("dummy control", () => {
  it("human declarer plays dummy's cards through their own seat", async () => {
    const { service } = makeService();
    const caller = ctx({});
    const { bridgeSessionId: id } = await service.createSession({
      context: caller,
      sessionType: "single_board",
      board: BOARD_G1,
      pkg,
      resolvedValues: values(),
      seats: { N: { seat: "N", playerKind: "human", occupantId: caller.nexusUserId } },
    });

    // Human North opens 1S; AI E/S/W act; human passes out the auction.
    await service.applyExternalAction(id, caller, "N", { kind: "bid", call: "1S" });
    await service.autoplay(id, caller); // E: P, S: 2S, W: P — stops at N
    await service.applyExternalAction(id, caller, "N", { kind: "bid", call: "P" });
    await service.autoplay(id, caller); // E: P completes; E leads; stops at dummy (S) controlled by N

    let view = await service.getSession(id, caller);
    expect(view.state.phase).toBe("play");
    expect(view.state.contract).toMatchObject({ declarer: "N" });
    expect(view.state.turn).toBe("S"); // dummy's turn, human-controlled

    const legal = legalPlays(view.state, "S");
    view = await service.applyExternalAction(id, caller, "N", {
      kind: "play",
      cardId: cardId(legal[0]!),
    });
    const trick = view.state.tricks[0]!;
    expect(trick.plays[1]!.seat).toBe("S"); // dummy's card, played via N
  });
});

describe("Phase 14: scoring, lifecycle, snapshots, board library", () => {
  it("a completed board carries a Law-77 score and readable result", async () => {
    const { service } = makeService();
    const caller = ctx({});
    const record = await service.createSession({
      context: caller, sessionType: "single_board", board: BOARD_G1, pkg, resolvedValues: values(),
    });
    const done = await service.autoplay(record.bridgeSessionId, caller);
    expect(done.state.phase).toBe("complete");
    expect(done.score).toBeDefined();
    expect(done.resultLabel).toMatch(/by [NESW]|Passed out/);
    // NS perspective flips with the declaring side.
    const s = done.score!;
    if (s.contract) {
      const nsDeclared = s.contract.declarer === "N" || s.contract.declarer === "S";
      expect(s.nsScore).toBe(nsDeclared ? s.declarerScore : -s.declarerScore);
    }
    // In-progress boards carry no score.
    const record2 = await service.createSession({
      context: caller, sessionType: "single_board", board: BOARD_G1, pkg, resolvedValues: values(),
    });
    const mid = await service.step(record2.bridgeSessionId, caller);
    expect(mid.score).toBeUndefined();
  });

  it("emits §9.1 lifecycle events across create/undo/complete", async () => {
    const { service } = makeService();
    const caller = ctx({});
    const record = await service.createSession({
      context: caller, sessionType: "single_board", board: BOARD_G1, pkg, resolvedValues: values(),
    });
    const created = await service.getLifecycle(record.bridgeSessionId, caller);
    const types = created.map((e) => e.type);
    expect(types).toContain("session_created");
    expect(types).toContain("board_loaded");
    expect(types.filter((t) => t === "seat_assigned")).toHaveLength(4);
    expect(types).toContain("configuration_selected");
    expect(types).toContain("knowledge_package_used");
    // Monotonic separate seq space.
    created.forEach((e, i) => expect(e.lifecycleSeq).toBe(i));

    await service.step(record.bridgeSessionId, caller);
    await service.undo(record.bridgeSessionId, caller);
    const afterUndo = await service.getLifecycle(record.bridgeSessionId, caller);
    expect(afterUndo.map((e) => e.type)).toContain("undo_performed");

    await service.autoplay(record.bridgeSessionId, caller);
    const done = await service.getLifecycle(record.bridgeSessionId, caller);
    const completed = done.find((e) => e.type === "session_completed");
    expect(completed).toBeDefined();
    expect(completed!.payload.result).toBeDefined();
    // The game-event stream itself is untouched by lifecycle events.
    const events = await service.getEvents(record.bridgeSessionId, caller);
    expect(events.every((e) => e.category.endsWith("event"))).toBe(true);
  });

  it("saves a position snapshot and resumes it as a new identical session", async () => {
    const { service } = makeService();
    const caller = ctx({});
    const record = await service.createSession({
      context: caller, sessionType: "single_board", board: BOARD_G1, pkg, resolvedValues: values(),
    });
    // Play a few actions, then freeze.
    for (let i = 0; i < 3; i++) await service.step(record.bridgeSessionId, caller);
    const source = await service.getSession(record.bridgeSessionId, caller);
    const snapshot = await service.saveSnapshot(record.bridgeSessionId, caller, "after three calls");
    expect(snapshot.events.filter(isActionEvent)).toHaveLength(3);

    const resumed = await service.resumeSnapshot(snapshot.snapshotId, caller, pkg);
    const view = await service.getSession(resumed.bridgeSessionId, caller);
    expect(view.state.auction).toEqual(source.state.auction);
    expect(view.state.turn).toBe(source.state.turn);
    // And the resumed session plays on to completion independently.
    const done = await service.autoplay(resumed.bridgeSessionId, caller);
    expect(done.state.phase).toBe("complete");
    // The original is untouched by the resumed session's play.
    const original = await service.getSession(record.bridgeSessionId, caller);
    expect(original.state.auction).toEqual(source.state.auction);

    // Wrong package version is refused (replay stability).
    await expect(
      service.resumeSnapshot(snapshot.snapshotId, caller, { ...pkg, version: "9.9.9" }),
    ).rejects.toThrow(/exact package version/);
    // Foreign org cannot see the snapshot.
    const foreign = ctx({ nexusUserId: "user_x", programOrganizationId: "bporg_other" });
    await expect(service.resumeSnapshot(snapshot.snapshotId, foreign, pkg)).rejects.toThrow(
      SessionAccessError,
    );
  });

  it("board library is org-scoped; share links are capability tokens", async () => {
    const { service } = makeService();
    const owner = ctx({});
    const saved = await service.saveBoardToLibrary(owner, "G1 teaching board", BOARD_G1, ["openings"]);

    // Org peer sees it; foreign org does not.
    const peer = ctx({ nexusUserId: "user_b" });
    expect((await service.listBoards(peer)).map((b) => b.boardId)).toContain(saved.boardId);
    const foreign = ctx({ nexusUserId: "user_x", programOrganizationId: "bporg_other" });
    expect(await service.listBoards(foreign)).toHaveLength(0);
    await expect(service.getBoard(saved.boardId, foreign)).rejects.toThrow(SessionAccessError);

    // Share link: short immutable token; the token IS the capability.
    const link = await service.createShareLink(saved.boardId, owner);
    expect(link.token).toMatch(/^[a-z0-9]{10}$/);
    const shared = await service.getSharedBoard(link.token);
    expect(shared?.boardId).toBe(saved.boardId);
    expect(shared?.board.hands.N).toEqual(BOARD_G1.hands.N);
    expect(await service.getSharedBoard("nonexistent")).toBeNull();
  });
});
