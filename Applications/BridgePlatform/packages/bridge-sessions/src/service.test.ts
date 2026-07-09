// Phase 4 acceptance: save/reload reconstructs identical state; the event log
// is ordered, gap-free, replayable; undo survives persistence round-trips;
// tenant isolation holds (org A cannot read org B).

import { defaultSettingValues } from "@bridge/config";
import { BOARD_G1, seededBoard, type BridgeRulePackage } from "@bridge/engine";
import { isActionEvent } from "@bridge/events";
import {
  BEGINNER_NATURAL_PACKAGE_ID,
  BEGINNER_NATURAL_V0_SEED,
  InMemoryKnowledgeStore,
  publishPackage,
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
  const record = await publishPackage(kstore, BEGINNER_NATURAL_PACKAGE_ID, "0.1.0", "test", NOW);
  pkg = record.pkg;
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

  it("refuses to create sessions against non-published packages", async () => {
    const { service } = makeService();
    await expect(
      service.createSession({
        context: ctx({}),
        sessionType: "single_board",
        board: BOARD_G1,
        pkg: { ...pkg, status: "draft" },
        resolvedValues: values(),
      }),
    ).rejects.toThrow(/published packages only/);
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
