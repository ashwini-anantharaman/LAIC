/**
 * @bridge/progress
 *
 * Track 1 of the learner model (LM doc §4): the bridge EVIDENCE layer.
 * Derives domain-scoped progress signals from persisted session events by
 * evaluating each HUMAN action against the session's pinned package, updates
 * the bridge learner profile and mistake patterns, and serves tenant-scoped
 * summaries. Signals are derived data: recompute-from-events is idempotent
 * (deterministic ids), so the model is always rebuildable (LM doc §1).
 *
 * Never stored here: the interpreted skill/concept-state model — that belongs
 * to the Coaching Platform. Extraction runs AFTER event persistence (async
 * track, locked decision 9.6); the engine's beforeCommit hook remains the
 * synchronous insertion point if live coaching later needs it.
 */

import {
  evaluateBidAction,
  evaluatePlayAction,
  type BridgeActionEvaluation,
} from "@bridge/evaluator";
import { applyEvent, initialState, type BridgeRulePackage } from "@bridge/engine";
import { cardId, isActionEvent, partnerOf, type GameEvent, type Seat } from "@bridge/events";
import type { BridgeSessionRecord } from "@bridge/sessions";
import type {
  CommonLearnerDomainProfile,
  CommonProgressSignal,
  NexusBridgeContext,
} from "@laic/learner-contracts";
// Taxonomy reference data lives in @bridge/taxonomy (re-exported for
// consumers); skill attribution now comes from the pinned package via the
// evaluator — the transitional RULE_SKILL_MAP is retired (§13.5).
export * from "@bridge/taxonomy";

// ---------------------------------------------------------------------------
// Model (LM doc §3.2)
// ---------------------------------------------------------------------------

export interface BridgeLearnerProfile extends CommonLearnerDomainProfile {
  domainId: "bridge";
  bridgeExperienceLevel: "new" | "beginner" | "intermediate" | "advanced" | "expert";
  knownSystems: string[];
  activeLearningSystem?: string;
}

export interface BridgeProgressSignal extends CommonProgressSignal {
  domainId: "bridge";
  bridgeSessionId: string;
  seat: Seat;
  signalType:
    | "correct_action"
    | "questionable_action"
    | "rule_mismatch"
    | "fallback_context"
    | "illegal_attempt";
  bridgeSystemContext: string;
  severity?: "low" | "medium" | "high";
  evaluation: BridgeActionEvaluation;
}

export interface BridgeMistakePattern {
  patternId: string;
  nexusUserId: string;
  domainId: "bridge";
  patternType: string; // e.g. "missed:bn_open_major"
  relatedSkillIds: string[];
  relatedConceptIds: string[];
  exampleEventIds: string[];
  firstObservedAt: string;
  lastObservedAt: string;
  observationCount: number;
  status: "active" | "improving" | "resolved" | "uncertain";
}

// ---------------------------------------------------------------------------
// Store seam
// ---------------------------------------------------------------------------

export interface ProgressStoreData {
  profiles: BridgeLearnerProfile[];
  signals: BridgeProgressSignal[];
  patterns: BridgeMistakePattern[];
}

export interface ProgressStore {
  getProfile(nexusUserId: string): Promise<BridgeLearnerProfile | null>;
  saveProfile(p: BridgeLearnerProfile): Promise<void>;
  listSignals(filter: { nexusUserId?: string; bridgeSessionId?: string }): Promise<BridgeProgressSignal[]>;
  replaceSessionSignals(bridgeSessionId: string, signals: BridgeProgressSignal[]): Promise<void>;
  listPatterns(nexusUserId: string): Promise<BridgeMistakePattern[]>;
  savePattern(p: BridgeMistakePattern): Promise<void>;
}

export class InMemoryProgressStore implements ProgressStore {
  protected data: ProgressStoreData;
  constructor(seed?: Partial<ProgressStoreData>) {
    this.data = { profiles: [], signals: [], patterns: [], ...structuredClone(seed ?? {}) };
  }
  protected persist(): void {}
  async getProfile(nexusUserId: string): Promise<BridgeLearnerProfile | null> {
    return structuredClone(this.data.profiles.find((p) => p.nexusUserId === nexusUserId) ?? null);
  }
  async saveProfile(p: BridgeLearnerProfile): Promise<void> {
    const i = this.data.profiles.findIndex((x) => x.nexusUserId === p.nexusUserId);
    if (i >= 0) this.data.profiles[i] = structuredClone(p);
    else this.data.profiles.push(structuredClone(p));
    this.persist();
  }
  async listSignals(filter: { nexusUserId?: string; bridgeSessionId?: string }): Promise<BridgeProgressSignal[]> {
    return structuredClone(
      this.data.signals.filter(
        (s) =>
          (!filter.nexusUserId || s.nexusUserId === filter.nexusUserId) &&
          (!filter.bridgeSessionId || s.bridgeSessionId === filter.bridgeSessionId),
      ),
    );
  }
  /** Replace a session's signals atomically (recompute is idempotent). */
  async replaceSessionSignals(bridgeSessionId: string, signals: BridgeProgressSignal[]): Promise<void> {
    this.data.signals = [
      ...this.data.signals.filter((s) => s.bridgeSessionId !== bridgeSessionId),
      ...structuredClone(signals),
    ];
    this.persist();
  }
  async listPatterns(nexusUserId: string): Promise<BridgeMistakePattern[]> {
    return structuredClone(this.data.patterns.filter((p) => p.nexusUserId === nexusUserId));
  }
  async savePattern(p: BridgeMistakePattern): Promise<void> {
    const i = this.data.patterns.findIndex((x) => x.patternId === p.patternId);
    if (i >= 0) this.data.patterns[i] = structuredClone(p);
    else this.data.patterns.push(structuredClone(p));
    this.persist();
  }
}

// ---------------------------------------------------------------------------
// Signal extraction (async track — runs after event persistence)
// ---------------------------------------------------------------------------

const JUDGMENT_TO_SIGNAL: Record<string, BridgeProgressSignal["signalType"]> = {
  aligned: "correct_action",
  reasonable_alternative: "correct_action",
  questionable: "questionable_action",
  not_system_aligned: "rule_mismatch",
  insufficient_context: "fallback_context",
  illegal: "illegal_attempt",
  needs_expert_review: "questionable_action",
};

/** Pure extraction: session record + events + pinned package -> signals. */
export function extractSessionSignals(
  record: BridgeSessionRecord,
  events: readonly GameEvent[],
  pkg: BridgeRulePackage,
  now: string,
): BridgeProgressSignal[] {
  const humanSeats = new Set(
    Object.values(record.seats)
      .filter((s) => s.playerKind === "human" && s.occupantId)
      .map((s) => s.seat),
  );
  if (!humanSeats.size) return [];

  const signals: BridgeProgressSignal[] = [];
  let state = initialState(record.board.name, record.board.dealer, record.board.vul, record.board.hands);

  for (const e of events) {
    if (!isActionEvent(e)) continue;
    // The acting human: the seat itself, or the human declarer playing dummy.
    const controller =
      e.category === "play-event" && state.contract && e.seat === partnerOf(state.contract.declarer)
        ? state.contract.declarer
        : e.seat;
    if (humanSeats.has(controller)) {
      const occupant = record.seats[controller].occupantId!;
      const ids = { bridgeSessionId: record.bridgeSessionId, actionEventSeq: e.seq };
      // Judge the human against THEIR seat's configuration (per-seat tables).
      const ctx = { pkg, values: record.seatValues?.[controller] ?? record.resolvedValues };
      const evaluation =
        e.category === "bid-event"
          ? evaluateBidAction(state, e.seat, e.call, ctx, ids)
          : evaluatePlayAction(state, e.seat, cardId(e.card), ctx, ids);
      signals.push({
        progressSignalId: `ps_${record.bridgeSessionId}_${e.seq}`,
        nexusUserId: occupant,
        domainId: "bridge",
        programId: record.context.programId,
        domainProfileId: `blp_${occupant}`,
        sessionRefId: record.bridgeSessionId,
        bridgeSessionId: record.bridgeSessionId,
        seat: e.seat,
        signalType: JUDGMENT_TO_SIGNAL[evaluation.judgment] ?? "questionable_action",
        relatedSkillIds: evaluation.relatedSkillIds,
        relatedConceptIds: evaluation.relatedConceptIds,
        sourceEventIds: [String(e.seq)],
        confidence: evaluation.confidence,
        severity: evaluation.judgment === "not_system_aligned" ? "medium" : "low",
        bridgeSystemContext: pkg.systemFamily,
        evaluation,
        createdAt: now,
      });
    }
    state = applyEvent(state, e);
  }
  return signals;
}

// ---------------------------------------------------------------------------
// Tenant access + service
// ---------------------------------------------------------------------------

/** §21: self, coach/admin in the same program org, or program-level admin. */
export function canViewProgress(targetUserId: string, ctx: NexusBridgeContext): boolean {
  if (targetUserId === ctx.nexusUserId) return true;
  if (ctx.accessLevel === "admin" && !ctx.programOrganizationId) return true;
  return (ctx.accessLevel === "coach" || ctx.accessLevel === "admin") && !!ctx.programOrganizationId;
}

export class ProgressAccessError extends Error {
  constructor() {
    super("Not authorized to view this learner's progress");
    this.name = "ProgressAccessError";
  }
}

export interface ProgressSummary {
  profile: BridgeLearnerProfile;
  totals: Record<string, number>;
  bySkill: Array<{ skillId: string; correct: number; mismatches: number; total: number }>;
  patterns: BridgeMistakePattern[];
  recentSignals: BridgeProgressSignal[];
}

export class ProgressService {
  constructor(
    private readonly store: ProgressStore,
    private readonly deps: {
      loadSession: (id: string) => Promise<{ record: BridgeSessionRecord; events: GameEvent[] } | null>;
      loadPackage: (ref: { packageId: string; version: string }) => Promise<BridgeRulePackage | null>;
      now?: () => string;
    },
  ) {}

  private now(): string {
    return this.deps.now?.() ?? new Date().toISOString();
  }

  /**
   * Recompute a session's signals from its raw events (idempotent —
   * deterministic ids; §16.5 recompute-session). Also refreshes profiles and
   * mistake patterns for the affected users. Tenant guard: the session must
   * be visible to the caller via the session service before calling this.
   */
  async recomputeSession(bridgeSessionId: string): Promise<BridgeProgressSignal[]> {
    const loaded = await this.deps.loadSession(bridgeSessionId);
    if (!loaded) throw new Error(`No session ${bridgeSessionId}`);
    const pkg = await this.deps.loadPackage(loaded.record.packageRef);
    if (!pkg) throw new Error(`Package ${loaded.record.packageRef.packageId} not found`);

    const signals = extractSessionSignals(loaded.record, loaded.events, pkg, this.now());
    await this.store.replaceSessionSignals(bridgeSessionId, signals);
    for (const userId of new Set(signals.map((s) => s.nexusUserId))) {
      await this.ensureProfile(userId, loaded.record.context, pkg.systemFamily);
      await this.refreshPatterns(userId);
    }
    return signals;
  }

  async ensureProfile(
    nexusUserId: string,
    context: NexusBridgeContext,
    system: string,
  ): Promise<BridgeLearnerProfile> {
    const existing = await this.store.getProfile(nexusUserId);
    if (existing) {
      const updated = { ...existing, updatedAt: this.now() };
      await this.store.saveProfile(updated);
      return updated;
    }
    const profile: BridgeLearnerProfile = {
      domainProfileId: `blp_${nexusUserId}`,
      nexusUserId,
      domainId: "bridge",
      programId: context.programId,
      organizationScopeId: context.programOrganizationId,
      selfDeclaredLevel: "beginner",
      status: "active",
      bridgeExperienceLevel: "beginner",
      knownSystems: [system],
      activeLearningSystem: system,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    await this.store.saveProfile(profile);
    return profile;
  }

  /** Mistake patterns: recurring rule_mismatch signals grouped by missed rule. */
  private async refreshPatterns(nexusUserId: string): Promise<void> {
    const signals = await this.store.listSignals({ nexusUserId });
    const mismatches = signals.filter((s) => s.signalType === "rule_mismatch");
    const groups = new Map<string, BridgeProgressSignal[]>();
    for (const s of mismatches) {
      const key = s.evaluation.missedRuleIds[0] ?? "unclassified";
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(s);
    }
    for (const [ruleId, group] of groups) {
      await this.store.savePattern({
        patternId: `mp_${nexusUserId}_${ruleId}`,
        nexusUserId,
        domainId: "bridge",
        patternType: `missed:${ruleId}`,
        relatedSkillIds: [...new Set(group.flatMap((s) => s.evaluation.relatedSkillIds))],
        relatedConceptIds: [...new Set(group.flatMap((s) => s.evaluation.relatedConceptIds))],
        exampleEventIds: group.map((s) => `${s.bridgeSessionId}#${s.sourceEventIds[0]}`),
        firstObservedAt: group[0]!.createdAt,
        lastObservedAt: group[group.length - 1]!.createdAt,
        observationCount: group.length,
        status: group.length >= 2 ? "active" : "uncertain",
      });
    }
  }

  /**
   * Domain-scoped summary. `domainId` is a REQUIRED explicit parameter (LM
   * doc §6: no context-free progress reads); only "bridge" is served here.
   */
  async getSummary(
    targetUserId: string,
    caller: NexusBridgeContext,
    domainId: string,
  ): Promise<ProgressSummary> {
    if (domainId !== "bridge")
      throw new Error(`This service serves domainId="bridge" only (got "${domainId}")`);
    if (!canViewProgress(targetUserId, caller)) throw new ProgressAccessError();
    const profile =
      (await this.store.getProfile(targetUserId)) ??
      (await this.ensureProfile(targetUserId, caller, "natural"));
    // Tenant wall: a scoped caller only sees learners of their own org.
    if (
      caller.nexusUserId !== targetUserId &&
      caller.programOrganizationId &&
      profile.organizationScopeId !== caller.programOrganizationId
    )
      throw new ProgressAccessError();

    const signals = await this.store.listSignals({ nexusUserId: targetUserId });
    const totals: Record<string, number> = {};
    for (const s of signals) totals[s.signalType] = (totals[s.signalType] ?? 0) + 1;

    const bySkillMap = new Map<string, { correct: number; mismatches: number; total: number }>();
    for (const s of signals) {
      for (const skillId of s.relatedSkillIds) {
        const row = bySkillMap.get(skillId) ?? { correct: 0, mismatches: 0, total: 0 };
        row.total++;
        if (s.signalType === "correct_action") row.correct++;
        if (s.signalType === "rule_mismatch") row.mismatches++;
        bySkillMap.set(skillId, row);
      }
    }
    return {
      profile,
      totals,
      bySkill: [...bySkillMap.entries()].map(([skillId, r]) => ({ skillId, ...r })),
      patterns: await this.store.listPatterns(targetUserId),
      recentSignals: signals.slice(-20).reverse(),
    };
  }

  async listSignals(
    filter: { nexusUserId?: string; bridgeSessionId?: string },
    caller: NexusBridgeContext,
  ): Promise<BridgeProgressSignal[]> {
    const signals = await this.store.listSignals(filter);
    return signals.filter((s) => canViewProgress(s.nexusUserId, caller));
  }
}
