// ProgressStore over db/migrations/0004 (+0005 evaluation jsonb on signals).
// Evaluations are ALSO written to bridge_action_evaluations rows for SQL
// queryability; the embedded jsonb keeps reads single-query.

import type {
  BridgeLearnerProfile,
  BridgeMistakePattern,
  BridgeProgressSignal,
  ProgressStore,
} from "@bridge/progress";
import type { SupabaseClient } from "@supabase/supabase-js";
import { check } from "./client";

/* eslint-disable @typescript-eslint/no-explicit-any */

const rowToSignal = (r: any): BridgeProgressSignal => ({
  progressSignalId: r.progress_signal_id, nexusUserId: r.nexus_user_id,
  domainId: "bridge", programId: r.program_id, domainProfileId: r.domain_profile_id,
  sessionRefId: r.bridge_session_id, bridgeSessionId: r.bridge_session_id,
  seat: r.seat, signalType: r.signal_type,
  relatedSkillIds: r.related_skill_ids ?? [], relatedConceptIds: r.related_concept_ids ?? [],
  sourceEventIds: r.source_event_ids ?? [], confidence: Number(r.confidence),
  severity: r.severity ?? undefined, bridgeSystemContext: r.evaluation?.systemFamily ?? "natural",
  evaluation: r.evaluation, createdAt: r.created_at,
});

export class PgProgressStore implements ProgressStore {
  constructor(private readonly db: SupabaseClient) {}

  async getProfile(nexusUserId: string) {
    const rows = check(
      await this.db.from("bridge_learner_profiles").select("*").eq("nexus_user_id", nexusUserId),
      "progress.getProfile",
    );
    if (!rows.length) return null;
    const r = rows[0] as any;
    return {
      domainProfileId: r.domain_profile_id, nexusUserId: r.nexus_user_id,
      domainId: "bridge", programId: r.program_id,
      organizationScopeId: r.organization_scope_id ?? undefined,
      selfDeclaredLevel: r.self_declared_level ?? undefined,
      assessedLevel: r.assessed_level ?? undefined,
      status: r.status, bridgeExperienceLevel: r.bridge_experience_level,
      knownSystems: r.known_systems ?? [], activeLearningSystem: r.active_learning_system ?? undefined,
      createdAt: r.created_at, updatedAt: r.updated_at,
    } as BridgeLearnerProfile;
  }

  async saveProfile(p: BridgeLearnerProfile) {
    check(await this.db.from("bridge_learner_profiles").upsert({
      domain_profile_id: p.domainProfileId, nexus_user_id: p.nexusUserId,
      domain_id: "bridge", program_id: p.programId,
      organization_scope_id: p.organizationScopeId ?? null,
      self_declared_level: p.selfDeclaredLevel ?? null,
      assessed_level: p.assessedLevel ?? null, status: p.status,
      bridge_experience_level: p.bridgeExperienceLevel,
      known_systems: p.knownSystems, active_learning_system: p.activeLearningSystem ?? null,
      created_at: p.createdAt, updated_at: p.updatedAt,
    }, { onConflict: "nexus_user_id" }), "progress.saveProfile");
  }

  async listSignals(filter: { nexusUserId?: string; bridgeSessionId?: string }) {
    let q = this.db.from("bridge_progress_signals").select("*");
    if (filter.nexusUserId) q = q.eq("nexus_user_id", filter.nexusUserId);
    if (filter.bridgeSessionId) q = q.eq("bridge_session_id", filter.bridgeSessionId);
    return check(await q.order("created_at").order("progress_signal_id"), "progress.listSignals").map(rowToSignal);
  }

  async replaceSessionSignals(bridgeSessionId: string, signals: BridgeProgressSignal[]) {
    check(await this.db.from("bridge_progress_signals").delete().eq("bridge_session_id", bridgeSessionId), "progress.replace(clear)");
    check(await this.db.from("bridge_action_evaluations").delete().eq("bridge_session_id", bridgeSessionId), "progress.replace(clearEval)");
    if (!signals.length) return;
    check(await this.db.from("bridge_progress_signals").insert(signals.map((s) => ({
      progress_signal_id: s.progressSignalId, domain_id: "bridge",
      program_id: s.programId, bridge_session_id: s.bridgeSessionId,
      nexus_user_id: s.nexusUserId, domain_profile_id: s.domainProfileId,
      seat: s.seat, signal_type: s.signalType,
      related_skill_ids: s.relatedSkillIds, related_concept_ids: s.relatedConceptIds,
      source_event_ids: s.sourceEventIds, severity: s.severity ?? null,
      confidence: s.confidence, evaluation_id: s.evaluation.evaluationId,
      evaluation: s.evaluation, created_at: s.createdAt,
    }))), "progress.replace(signals)");
    check(await this.db.from("bridge_action_evaluations").insert(signals.map((s) => ({
      evaluation_id: s.evaluation.evaluationId, bridge_session_id: s.bridgeSessionId,
      action_event_seq: s.evaluation.actionEventSeq, seat: s.evaluation.seat,
      kind: s.evaluation.kind, evaluated_action: s.evaluation.evaluatedAction,
      evaluation_mode: s.evaluation.evaluationMode, judgment: s.evaluation.judgment,
      system_action: s.evaluation.systemAction,
      matched_rule_ids: s.evaluation.matchedRuleIds, missed_rule_ids: s.evaluation.missedRuleIds,
      confidence: s.evaluation.confidence, created_at: s.createdAt,
    }))), "progress.replace(evaluations)");
  }

  async listPatterns(nexusUserId: string) {
    const rows = check(
      await this.db.from("bridge_mistake_patterns").select("*").eq("nexus_user_id", nexusUserId),
      "progress.listPatterns",
    );
    return rows.map((r: any): BridgeMistakePattern => ({
      patternId: r.pattern_id, nexusUserId: r.nexus_user_id, domainId: "bridge",
      patternType: r.pattern_type, relatedSkillIds: r.related_skill_ids ?? [],
      relatedConceptIds: r.related_concept_ids ?? [], exampleEventIds: r.example_event_ids ?? [],
      firstObservedAt: r.first_observed_at, lastObservedAt: r.last_observed_at,
      observationCount: r.observation_count, status: r.status,
    }));
  }

  async savePattern(p: BridgeMistakePattern) {
    check(await this.db.from("bridge_mistake_patterns").upsert({
      pattern_id: p.patternId, nexus_user_id: p.nexusUserId, domain_id: "bridge",
      pattern_type: p.patternType, related_skill_ids: p.relatedSkillIds,
      related_concept_ids: p.relatedConceptIds, example_event_ids: p.exampleEventIds,
      first_observed_at: p.firstObservedAt, last_observed_at: p.lastObservedAt,
      observation_count: p.observationCount, status: p.status,
    }, { onConflict: "pattern_id" }), "progress.savePattern");
  }
}
