// KnowledgeStore: the persistence seam for the knowledge base. Phase 3 ships
// an in-memory implementation (tests) and a JSON-file dev store (admin UI) —
// mirroring TheNexusPlatform backend's local-store fallback pattern. The
// Postgres/Drizzle implementation lands when Supabase credentials are wired
// (db/migrations already defines the tables).

import type {
  BridgeGenerationRun,
  BridgeIngestionJob,
  BridgeKnowledgeGap,
  BridgeKnowledgeSource,
  BridgeReadableKnowledgeItem,
  RulePackageRecord,
  SourceDocument,
  SourcePassage,
} from "./model";

export interface KnowledgeStoreData {
  sources: BridgeKnowledgeSource[];
  documents?: SourceDocument[];
  passages?: SourcePassage[];
  jobs?: BridgeIngestionJob[];
  items: BridgeReadableKnowledgeItem[];
  /** Append-only history of superseded item revisions. */
  itemRevisions: BridgeReadableKnowledgeItem[];
  gaps: BridgeKnowledgeGap[];
  runs: BridgeGenerationRun[];
  packages: RulePackageRecord[];
}

export const emptyStoreData = (): KnowledgeStoreData => ({
  sources: [],
  items: [],
  itemRevisions: [],
  gaps: [],
  runs: [],
  packages: [],
});

export interface KnowledgeStore {
  listSources(): Promise<BridgeKnowledgeSource[]>;
  getSource(sourceId: string): Promise<BridgeKnowledgeSource | null>;
  saveSource(source: BridgeKnowledgeSource): Promise<void>;

  /** Replace the uploaded document + passages for a source atomically. */
  saveSourceDocument(doc: SourceDocument, passages: SourcePassage[]): Promise<void>;
  getSourceDocument(sourceId: string): Promise<SourceDocument | null>;
  listPassages(sourceId: string): Promise<SourcePassage[]>;
  getPassage(passageId: string): Promise<SourcePassage | null>;

  listItems(filter?: {
    systemFamily?: string;
    status?: string;
    itemType?: string;
  }): Promise<BridgeReadableKnowledgeItem[]>;
  getItem(itemId: string): Promise<BridgeReadableKnowledgeItem | null>;
  /**
   * Upsert an item. When replacing an existing item, the prior revision is
   * archived to itemRevisions (the knowledge base never loses history).
   */
  saveItem(item: BridgeReadableKnowledgeItem): Promise<void>;
  listItemRevisions(itemId: string): Promise<BridgeReadableKnowledgeItem[]>;

  listGaps(filter?: { resolutionStatus?: string }): Promise<BridgeKnowledgeGap[]>;
  getGap(gapId: string): Promise<BridgeKnowledgeGap | null>;
  saveGap(gap: BridgeKnowledgeGap): Promise<void>;

  listJobs(): Promise<BridgeIngestionJob[]>;
  saveJob(job: BridgeIngestionJob): Promise<void>;

  listRuns(): Promise<BridgeGenerationRun[]>;
  getRun(runId: string): Promise<BridgeGenerationRun | null>;
  saveRun(run: BridgeGenerationRun): Promise<void>;

  listPackages(): Promise<RulePackageRecord[]>;
  getPackage(packageId: string, version: string): Promise<RulePackageRecord | null>;
  /** Latest non-deprecated version by semver. */
  getLatest(packageId: string): Promise<RulePackageRecord | null>;
  /**
   * Upsert a package record. A version's RULE CONTENT is immutable once
   * written (sessions pin versions for replay/provenance): overwriting with a
   * different pkg throws. Artifacts, status, and baseline may still update.
   */
  savePackage(record: RulePackageRecord): Promise<void>;
}

const semverGt = (a: string, b: string): boolean => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
};

export class InMemoryKnowledgeStore implements KnowledgeStore {
  protected data: KnowledgeStoreData;

  constructor(seed?: Partial<KnowledgeStoreData>) {
    this.data = { ...emptyStoreData(), ...structuredClone(seed ?? {}) };
  }

  /** Hook for persistent subclasses; called after every mutation. */
  protected persist(): void {}

  async listSources() {
    return [...this.data.sources];
  }
  async getSource(sourceId: string) {
    return this.data.sources.find((s) => s.sourceId === sourceId) ?? null;
  }
  async saveSource(source: BridgeKnowledgeSource) {
    const i = this.data.sources.findIndex((s) => s.sourceId === source.sourceId);
    if (i >= 0) this.data.sources[i] = structuredClone(source);
    else this.data.sources.push(structuredClone(source));
    this.persist();
  }

  async saveSourceDocument(doc: SourceDocument, passages: SourcePassage[]) {
    this.data.documents = [
      ...(this.data.documents ?? []).filter((d) => d.sourceId !== doc.sourceId),
      structuredClone(doc),
    ];
    this.data.passages = [
      ...(this.data.passages ?? []).filter((p) => p.sourceId !== doc.sourceId),
      ...structuredClone(passages),
    ];
    this.persist();
  }
  async getSourceDocument(sourceId: string) {
    return (this.data.documents ?? []).find((d) => d.sourceId === sourceId) ?? null;
  }
  async listPassages(sourceId: string) {
    return (this.data.passages ?? [])
      .filter((p) => p.sourceId === sourceId)
      .sort((a, b) => a.ordinal - b.ordinal);
  }
  async getPassage(passageId: string) {
    return (this.data.passages ?? []).find((p) => p.passageId === passageId) ?? null;
  }

  async listItems(filter?: { systemFamily?: string; status?: string; itemType?: string }) {
    return this.data.items.filter(
      (it) =>
        (!filter?.systemFamily || it.systemFamily === filter.systemFamily) &&
        (!filter?.status || it.status === filter.status) &&
        (!filter?.itemType || it.itemType === filter.itemType),
    );
  }
  async getItem(itemId: string) {
    return this.data.items.find((it) => it.itemId === itemId) ?? null;
  }
  async saveItem(item: BridgeReadableKnowledgeItem) {
    const i = this.data.items.findIndex((it) => it.itemId === item.itemId);
    if (i >= 0) {
      this.data.itemRevisions.push(this.data.items[i]!);
      this.data.items[i] = structuredClone(item);
    } else {
      this.data.items.push(structuredClone(item));
    }
    this.persist();
  }
  async listItemRevisions(itemId: string) {
    return this.data.itemRevisions.filter((it) => it.itemId === itemId);
  }

  async listGaps(filter?: { resolutionStatus?: string }) {
    return this.data.gaps.filter(
      (g) => !filter?.resolutionStatus || g.resolutionStatus === filter.resolutionStatus,
    );
  }
  async getGap(gapId: string) {
    return this.data.gaps.find((g) => g.gapId === gapId) ?? null;
  }
  async saveGap(gap: BridgeKnowledgeGap) {
    const i = this.data.gaps.findIndex((g) => g.gapId === gap.gapId);
    if (i >= 0) this.data.gaps[i] = structuredClone(gap);
    else this.data.gaps.push(structuredClone(gap));
    this.persist();
  }

  async listJobs() {
    return [...(this.data.jobs ?? [])];
  }
  async saveJob(job: BridgeIngestionJob) {
    this.data.jobs = [...(this.data.jobs ?? []).filter((j) => j.jobId !== job.jobId), structuredClone(job)];
    this.persist();
  }

  async listRuns() {
    return [...this.data.runs];
  }
  async getRun(runId: string) {
    return this.data.runs.find((r) => r.runId === runId) ?? null;
  }
  async saveRun(run: BridgeGenerationRun) {
    const i = this.data.runs.findIndex((r) => r.runId === run.runId);
    if (i >= 0) this.data.runs[i] = structuredClone(run);
    else this.data.runs.push(structuredClone(run));
    this.persist();
  }

  async listPackages() {
    return [...this.data.packages];
  }
  async getPackage(packageId: string, version: string) {
    return (
      this.data.packages.find((p) => p.packageId === packageId && p.version === version) ?? null
    );
  }
  async getLatest(packageId: string) {
    const candidates = this.data.packages.filter(
      (p) => p.packageId === packageId && p.status !== "deprecated",
    );
    if (!candidates.length) return null;
    return candidates.reduce((a, b) => (semverGt(b.version, a.version) ? b : a));
  }
  async savePackage(record: RulePackageRecord) {
    const i = this.data.packages.findIndex(
      (p) => p.packageId === record.packageId && p.version === record.version,
    );
    if (i >= 0) {
      if (JSON.stringify(this.data.packages[i]!.pkg) !== JSON.stringify(record.pkg))
        throw new Error(
          `${record.packageId}@${record.version} rule content is immutable — generate a new version instead`,
        );
      this.data.packages[i] = structuredClone(record);
    } else {
      this.data.packages.push(structuredClone(record));
    }
    this.persist();
  }
}
