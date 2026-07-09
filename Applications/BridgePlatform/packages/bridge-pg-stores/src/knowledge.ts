// KnowledgeStore over db/migrations/0001 (+0005 jobs/warnings/baseline).

import type {
  BridgeGenerationRun,
  BridgeIngestionJob,
  BridgeKnowledgeGap,
  BridgeKnowledgeSource,
  BridgeReadableKnowledgeItem,
  KnowledgeStore,
  RulePackageRecord,
} from "@bridge/knowledge";
import type { SupabaseClient } from "@supabase/supabase-js";
import { check } from "./client";

/* eslint-disable @typescript-eslint/no-explicit-any */

const sourceToRow = (s: BridgeKnowledgeSource) => ({
  source_id: s.sourceId, title: s.title, source_type: s.sourceType,
  system_family: s.systemFamily ?? null, rights_status: s.rightsStatus,
  uploaded_by: s.uploadedBy, uploaded_at: s.uploadedAt, status: s.status,
  locator: s.locator ?? null, notes: s.notes ?? null,
});
const rowToSource = (r: any): BridgeKnowledgeSource => ({
  sourceId: r.source_id, title: r.title, sourceType: r.source_type,
  systemFamily: r.system_family ?? undefined, rightsStatus: r.rights_status,
  uploadedBy: r.uploaded_by, uploadedAt: r.uploaded_at, status: r.status,
  locator: r.locator ?? undefined, notes: r.notes ?? undefined,
});

const itemToRow = (i: BridgeReadableKnowledgeItem) => ({
  item_id: i.itemId, system_family: i.systemFamily, item_type: i.itemType,
  title: i.title, human_readable_rule: i.humanReadableRule,
  structured_fields: i.structuredFields, source_ids: i.sourceIds,
  citations: i.citations, related_item_ids: i.relatedItemIds ?? [],
  gap_ids: i.gapIds, reviewer_notes: i.reviewerNotes ?? null, status: i.status,
  version: i.version, created_by: i.createdBy, created_at: i.createdAt,
  // approved_by/approved_at columns retired by the Phase 13 de-governance.
  approved_by: null, approved_at: null,
});
const rowToItem = (r: any): BridgeReadableKnowledgeItem => ({
  itemId: r.item_id, systemFamily: r.system_family, itemType: r.item_type,
  title: r.title, humanReadableRule: r.human_readable_rule,
  structuredFields: r.structured_fields ?? {}, sourceIds: r.source_ids ?? [],
  citations: r.citations ?? [],
  relatedItemIds: (r.related_item_ids ?? []).length ? r.related_item_ids : undefined,
  gapIds: r.gap_ids ?? [], reviewerNotes: r.reviewer_notes ?? undefined,
  // Legacy statuses (draft/needs_review/approved) read as active.
  status: r.status === "deprecated" ? "deprecated" : "active",
  version: r.version, createdBy: r.created_by, createdAt: r.created_at,
});

const gapToRow = (g: BridgeKnowledgeGap) => ({
  gap_id: g.gapId, system_family: g.systemFamily, area: g.area,
  description: g.description, detected_from: g.detectedFrom, severity: g.severity,
  resolution_status: g.resolutionStatus, expert_resolution: g.expertResolution ?? null,
  resolved_by: g.resolvedBy ?? null, resolved_at: g.resolvedAt ?? null, created_at: g.createdAt,
});
const rowToGap = (r: any): BridgeKnowledgeGap => ({
  gapId: r.gap_id, systemFamily: r.system_family, area: r.area,
  description: r.description, detectedFrom: r.detected_from ?? [], severity: r.severity,
  resolutionStatus: r.resolution_status, expertResolution: r.expert_resolution ?? undefined,
  resolvedBy: r.resolved_by ?? undefined, resolvedAt: r.resolved_at ?? undefined,
  createdAt: r.created_at,
});

const semverGt = (a: string, b: string): boolean => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
};

export class PgKnowledgeStore implements KnowledgeStore {
  constructor(private readonly db: SupabaseClient) {}

  async listSources() {
    return check(await this.db.from("bridge_knowledge_sources").select("*"), "listSources").map(rowToSource);
  }
  async getSource(sourceId: string) {
    const rows = check(await this.db.from("bridge_knowledge_sources").select("*").eq("source_id", sourceId), "getSource");
    return rows.length ? rowToSource(rows[0]) : null;
  }
  async saveSource(source: BridgeKnowledgeSource) {
    check(await this.db.from("bridge_knowledge_sources").upsert(sourceToRow(source), { onConflict: "source_id" }), "saveSource");
  }

  async listItems(filter?: { systemFamily?: string; status?: string; itemType?: string }) {
    let q = this.db.from("bridge_readable_knowledge_items").select("*");
    if (filter?.systemFamily) q = q.eq("system_family", filter.systemFamily);
    if (filter?.status) q = q.eq("status", filter.status);
    if (filter?.itemType) q = q.eq("item_type", filter.itemType);
    return check(await q.order("created_at"), "listItems").map(rowToItem);
  }
  async getItem(itemId: string) {
    const rows = check(await this.db.from("bridge_readable_knowledge_items").select("*").eq("item_id", itemId), "getItem");
    return rows.length ? rowToItem(rows[0]) : null;
  }
  async saveItem(item: BridgeReadableKnowledgeItem) {
    const existing = await this.getItem(item.itemId);
    if (existing) {
      check(
        await this.db.from("bridge_readable_knowledge_item_revisions").insert({ item_id: item.itemId, snapshot: existing }),
        "saveItem(revision)",
      );
    }
    check(await this.db.from("bridge_readable_knowledge_items").upsert(itemToRow(item), { onConflict: "item_id" }), "saveItem");
  }
  async listItemRevisions(itemId: string) {
    const rows = check(
      await this.db.from("bridge_readable_knowledge_item_revisions").select("snapshot").eq("item_id", itemId).order("superseded_at"),
      "listItemRevisions",
    );
    return rows.map((r: any) => r.snapshot as BridgeReadableKnowledgeItem);
  }

  async listGaps(filter?: { resolutionStatus?: string }) {
    let q = this.db.from("bridge_knowledge_gaps").select("*");
    if (filter?.resolutionStatus) q = q.eq("resolution_status", filter.resolutionStatus);
    return check(await q, "listGaps").map(rowToGap);
  }
  async getGap(gapId: string) {
    const rows = check(await this.db.from("bridge_knowledge_gaps").select("*").eq("gap_id", gapId), "getGap");
    return rows.length ? rowToGap(rows[0]) : null;
  }
  async saveGap(gap: BridgeKnowledgeGap) {
    check(await this.db.from("bridge_knowledge_gaps").upsert(gapToRow(gap), { onConflict: "gap_id" }), "saveGap");
  }

  async listJobs() {
    const rows = check(await this.db.from("bridge_ingestion_jobs").select("*").order("created_at"), "listJobs");
    return rows.map((r: any): BridgeIngestionJob => ({
      jobId: r.job_id, sourceId: r.source_id, extractor: r.extractor,
      systemFamily: r.system_family, requestedBy: r.requested_by, createdAt: r.created_at,
      status: r.status, stats: r.stats, candidateItemIds: r.candidate_item_ids ?? [], errors: r.errors ?? [],
    }));
  }
  async saveJob(job: BridgeIngestionJob) {
    check(await this.db.from("bridge_ingestion_jobs").upsert({
      job_id: job.jobId, source_id: job.sourceId, extractor: job.extractor,
      system_family: job.systemFamily, requested_by: job.requestedBy, created_at: job.createdAt,
      status: job.status, stats: job.stats, candidate_item_ids: job.candidateItemIds, errors: job.errors,
    }, { onConflict: "job_id" }), "saveJob");
  }

  async listRuns() {
    const rows = check(await this.db.from("bridge_model_generation_runs").select("*").order("created_at"), "listRuns");
    return rows.map(this.rowToRun);
  }
  async getRun(runId: string) {
    const rows = check(await this.db.from("bridge_model_generation_runs").select("*").eq("run_id", runId), "getRun");
    return rows.length ? this.rowToRun(rows[0]) : null;
  }
  private rowToRun = (r: any): BridgeGenerationRun => ({
    runId: r.run_id, systemFamily: r.system_family, requestedBy: r.requested_by,
    createdAt: r.created_at, status: r.status, inputItems: r.input_items ?? [],
    diff: r.diff ?? null, errors: r.errors ?? [],
    warnings: (r.warnings ?? []).length ? r.warnings : undefined,
    resultPackageId: r.result_package_id ?? undefined, resultVersion: r.result_version ?? undefined,
  });
  async saveRun(run: BridgeGenerationRun) {
    check(await this.db.from("bridge_model_generation_runs").upsert({
      run_id: run.runId, system_family: run.systemFamily, requested_by: run.requestedBy,
      created_at: run.createdAt, status: run.status, input_items: run.inputItems,
      diff: run.diff, errors: run.errors, warnings: run.warnings ?? [],
      result_package_id: run.resultPackageId ?? null, result_version: run.resultVersion ?? null,
    }, { onConflict: "run_id" }), "saveRun");
  }

  async listPackages() {
    const rows = check(await this.db.from("bridge_published_packages").select("*").order("created_at"), "listPackages");
    return Promise.all(rows.map((r: any) => this.rowToPackage(r)));
  }
  async getPackage(packageId: string, version: string) {
    const rows = check(
      await this.db.from("bridge_published_packages").select("*").eq("package_id", packageId).eq("version", version),
      "getPackage",
    );
    return rows.length ? this.rowToPackage(rows[0]) : null;
  }
  async getLatest(packageId: string) {
    const rows = check(
      await this.db.from("bridge_published_packages").select("*").eq("package_id", packageId).neq("status", "deprecated"),
      "getLatest",
    );
    if (!rows.length) return null;
    const best = rows.reduce((a: any, b: any) => (semverGt(b.version, a.version) ? b : a));
    return this.rowToPackage(best);
  }
  private async rowToPackage(r: any): Promise<RulePackageRecord> {
    const artifacts = check(
      await this.db.from("bridge_generated_artifacts").select("*").eq("package_id", r.package_id).eq("version", r.version),
      "rowToPackage(artifacts)",
    );
    return {
      packageId: r.package_id, version: r.version,
      status: r.status === "deprecated" ? ("deprecated" as const) : ("active" as const),
      createdAt: r.created_at, pkg: r.package,
      baseline: r.baseline ?? undefined,
      artifacts: artifacts.map((a: any) => ({
        artifactId: a.artifact_id, artifactType: a.artifact_type,
        generatedFromKnowledgeItemIds: a.generated_from_knowledge_item_ids ?? [],
        generatedFromSourceIds: a.generated_from_source_ids ?? [],
        packageId: a.package_id, version: a.version,
        status: a.status === "deprecated" ? ("deprecated" as const) : ("active" as const),
        artifactPayload: a.artifact_payload,
      })),
    };
  }
  async savePackage(record: RulePackageRecord) {
    const existing = check(
      await this.db.from("bridge_published_packages").select("package").eq("package_id", record.packageId).eq("version", record.version),
      "savePackage(check)",
    );
    if (existing.length && JSON.stringify((existing[0] as any).package) !== JSON.stringify(record.pkg))
      throw new Error(
        `${record.packageId}@${record.version} rule content is immutable — generate a new version instead`,
      );
    check(await this.db.from("bridge_published_packages").upsert({
      package_id: record.packageId, version: record.version, status: record.status,
      created_at: record.createdAt, published_by: null, published_at: null,
      package: record.pkg, baseline: record.baseline ?? null,
    }, { onConflict: "package_id,version" }), "savePackage");
    // Replace this version's artifacts atomically-enough for dev/team use.
    check(await this.db.from("bridge_generated_artifacts").delete().eq("package_id", record.packageId).eq("version", record.version), "savePackage(clear artifacts)");
    if (record.artifacts.length) {
      check(await this.db.from("bridge_generated_artifacts").insert(record.artifacts.map((a) => ({
        artifact_id: a.artifactId, artifact_type: a.artifactType,
        generated_from_knowledge_item_ids: a.generatedFromKnowledgeItemIds,
        generated_from_source_ids: a.generatedFromSourceIds,
        package_id: a.packageId, version: a.version, status: a.status,
        artifact_payload: a.artifactPayload,
      }))), "savePackage(artifacts)");
    }
  }
}
