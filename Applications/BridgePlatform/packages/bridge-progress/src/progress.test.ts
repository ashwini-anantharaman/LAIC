// Phase 8 acceptance: human actions create bridge-domain signals with
// alignment/mismatch judgments; recompute from raw events is idempotent;
// domain context is required; tenant isolation holds; mistake patterns
// aggregate; anti-overclaiming (fallback -> insufficient_context).

import { defaultSettingValues } from "@bridge/config";
import { BOARD_G1, type BridgeRulePackage } from "@bridge/engine";
import {
  BEGINNER_NATURAL_PACKAGE_ID,
  BEGINNER_NATURAL_V0_SEED,
  InMemoryKnowledgeStore,
  publishPackage,
  runGeneration,
} from "@bridge/knowledge";
import { InMemorySessionStore, SessionService } from "@bridge/sessions";
import type { NexusBridgeContext } from "@laic/learner-contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { InMemoryProgressStore, ProgressAccessError, ProgressService } from "./index";

const NOW = "2026-07-09T12:00:00.000Z";
let pkg: BridgeRulePackage;

const ctx = (over: Partial<NexusBridgeContext>): NexusBridgeContext => ({
  nexusUserId: "user_lena",
  laicOrgId: "org_laic",
  programId: "bridge_program",
  programOrganizationId: "bporg_club_a",
  appId: "bridge_ai_coach",
  roles: ["bridge_learner"],
  permissions: [],
  accessLevel: "learner",
  ...over,
});

beforeAll(async () => {
  const kstore = new InMemoryKnowledgeStore(BEGINNER_NATURAL_V0_SEED);
  await runGeneration(kstore, {
    systemFamily: "natural",
    requestedBy: "test",
    now: NOW,
    runId: "run_progress",
  });
  pkg = (await publishPackage(kstore, BEGINNER_NATURAL_PACKAGE_ID, "0.1.0", "test", NOW)).pkg;
});

function makeWorld() {
  const sessionStore = new InMemorySessionStore();
  const sessions = new SessionService({
    store: sessionStore,
    loadPackage: async (ref) => (ref.version === pkg.version ? pkg : null),
    now: () => NOW,
  });
  const progress = new ProgressService(new InMemoryProgressStore(), {
    loadSession: async (id) => {
      const record = await sessionStore.getSession(id);
      return record ? { record, events: await sessionStore.getEvents(id) } : null;
    },
    loadPackage: async () => pkg,
    now: () => NOW,
  });
  return { sessions, progress };
}

/** Human North on G1: one aligned open (1S) or a deliberate mistake (P). */
async function playHumanBoard(world: ReturnType<typeof makeWorld>, caller: NexusBridgeContext, firstCall: string) {
  const { bridgeSessionId: id } = await world.sessions.createSession({
    context: caller,
    sessionType: "single_board",
    board: BOARD_G1,
    pkg,
    resolvedValues: defaultSettingValues(pkg.settings),
    seats: { N: { seat: "N", playerKind: "human", occupantId: caller.nexusUserId } },
  });
  await world.sessions.applyExternalAction(id, caller, "N", { kind: "bid", call: firstCall });
  await world.sessions.autoplay(id, caller);
  return id;
}

describe("signal extraction (Track 1)", () => {
  it("human actions create domain-scoped signals; aligned open -> correct_action", async () => {
    const world = makeWorld();
    const caller = ctx({});
    const id = await playHumanBoard(world, caller, "1S"); // system-aligned open
    const signals = await world.progress.recomputeSession(id);

    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => s.domainId === "bridge")).toBe(true);
    expect(signals.every((s) => s.nexusUserId === "user_lena")).toBe(true);
    expect(signals.every((s) => s.sourceEventIds.length === 1)).toBe(true);

    const opening = signals[0]!;
    expect(opening.signalType).toBe("correct_action");
    expect(opening.evaluation.judgment).toBe("aligned");
    expect(opening.evaluation.matchedRuleIds).toContain("bn_open_major");
    expect(opening.relatedSkillIds).toContain("sk_opening_bid_selection");
  });

  it("a deliberate mistake -> rule_mismatch citing the missed rule", async () => {
    const world = makeWorld();
    const caller = ctx({});
    const id = await playHumanBoard(world, caller, "P"); // 16 HCP: system says 1S
    const signals = await world.progress.recomputeSession(id);

    const opening = signals[0]!;
    expect(opening.signalType).toBe("rule_mismatch");
    expect(opening.evaluation.systemAction).toBe("1S");
    expect(opening.evaluation.missedRuleIds).toContain("bn_open_major");
    expect(opening.severity).toBe("medium");
  });

  it("recompute from raw events is idempotent (deterministic ids, equal output)", async () => {
    const world = makeWorld();
    const caller = ctx({});
    const id = await playHumanBoard(world, caller, "1S");
    const a = await world.progress.recomputeSession(id);
    const b = await world.progress.recomputeSession(id);
    expect(b).toEqual(a);
    expect((await world.progress.listSignals({ bridgeSessionId: id }, caller)).length).toBe(a.length);
  });

  it("anti-overclaiming: when the system has no opinion, signal is fallback_context", async () => {
    // Package without the no-agreement catch-all: opener rebids are fallback.
    const noCatchAll: BridgeRulePackage = {
      ...pkg,
      bidRules: pkg.bidRules.filter((r) => r.ruleId !== "bn_pass_otherwise"),
    };
    const sessionStore = new InMemorySessionStore();
    const sessions = new SessionService({
      store: sessionStore,
      loadPackage: async () => noCatchAll,
      now: () => NOW,
    });
    const progress = new ProgressService(new InMemoryProgressStore(), {
      loadSession: async (id) => {
        const record = await sessionStore.getSession(id);
        return record ? { record, events: await sessionStore.getEvents(id) } : null;
      },
      loadPackage: async () => noCatchAll,
      now: () => NOW,
    });
    const caller = ctx({});
    const { bridgeSessionId: id } = await sessions.createSession({
      context: caller,
      sessionType: "single_board",
      board: BOARD_G1,
      pkg, // published pkg for the gate; play uses loadPackage above
      resolvedValues: defaultSettingValues(pkg.settings),
      seats: { N: { seat: "N", playerKind: "human", occupantId: caller.nexusUserId } },
    });
    await sessions.applyExternalAction(id, caller, "N", { kind: "bid", call: "1S" });
    await sessions.autoplay(id, caller); // E/S/W act; stops at N (human)
    // N's second call: system has NO rule (no catch-all) -> whatever the human
    // does must not be judged against a nonexistent opinion.
    await sessions.applyExternalAction(id, caller, "N", { kind: "bid", call: "P" });
    const signals = await progress.recomputeSession(id);
    const second = signals.find((s) => s.evaluation.actionEventSeq > signals[0]!.evaluation.actionEventSeq)!;
    expect(second.signalType).toBe("fallback_context");
    expect(second.confidence).toBeLessThanOrEqual(0.3);
  });
});

describe("mistake patterns + summary + tenant isolation", () => {
  it("repeated mismatches aggregate into an active pattern; summary is scoped", async () => {
    const world = makeWorld();
    const lena = ctx({});
    await world.progress.recomputeSession(await playHumanBoard(world, lena, "P"));
    await world.progress.recomputeSession(await playHumanBoard(world, lena, "P"));

    const summary = await world.progress.getSummary("user_lena", lena, "bridge");
    expect(summary.profile.domainId).toBe("bridge");
    expect(summary.totals.rule_mismatch).toBeGreaterThanOrEqual(2);
    const pattern = summary.patterns.find((p) => p.patternType === "missed:bn_open_major")!;
    expect(pattern.observationCount).toBe(2);
    expect(pattern.status).toBe("active");
    expect(summary.bySkill.find((s) => s.skillId === "sk_opening_bid_selection")!.mismatches).toBe(2);

    // Domain context is REQUIRED and only "bridge" is served.
    await expect(world.progress.getSummary("user_lena", lena, "brain_bee")).rejects.toThrow(
      /domainId="bridge" only/,
    );

    // Same-org coach sees it; other-org coach does not; foreign learner does not.
    const coach = ctx({ nexusUserId: "user_carlos", accessLevel: "coach", roles: ["bridge_coach"] });
    expect((await world.progress.getSummary("user_lena", coach, "bridge")).totals.rule_mismatch).toBeGreaterThan(0);
    const otherOrgCoach = ctx({
      nexusUserId: "user_x",
      accessLevel: "coach",
      programOrganizationId: "bporg_other",
    });
    await expect(world.progress.getSummary("user_lena", otherOrgCoach, "bridge")).rejects.toThrow(
      ProgressAccessError,
    );
    const peerLearner = ctx({ nexusUserId: "user_peer" });
    await expect(world.progress.getSummary("user_lena", peerLearner, "bridge")).rejects.toThrow(
      ProgressAccessError,
    );
  });
});
