// KnowledgeStore: the persistence seam for the knowledge base. Phase 3 ships
// an in-memory implementation (tests) and a JSON-file dev store (admin UI) —
// mirroring TheNexusPlatform backend's local-store fallback pattern. The
// Postgres/Drizzle implementation lands when Supabase credentials are wired
// (db/migrations already defines the tables).

import type {
  BridgeGenerationRun,
  BridgeKnowledgeGap,
  BridgeKnowledgeSource,
  BridgeReadableKnowledgeItem,
  PublishedPackageRecord,
} from "./model";

export interface KnowledgeStoreData {
  sources: BridgeKnowledgeSource[];
  items: BridgeReadableKnowledgeItem[];
  /** Append-only history of superseded item revisions. */
  itemRevisions: BridgeReadableKnowledgeItem[];
  gaps: BridgeKnowledgeGap[];
  runs: BridgeGenerationRun[];
  packages: PublishedPackageRecord[];
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

  listRuns(): Promise<BridgeGenerationRun[]>;
  getRun(runId: string): Promise<BridgeGenerationRun | null>;
  saveRun(run: BridgeGenerationRun): Promise<void>;

  listPackages(): Promise<PublishedPackageRecord[]>;
  getPackage(packageId: string, version: string): Promise<PublishedPackageRecord | null>;
  getLatestPublished(packageId: string): Promise<PublishedPackageRecord | null>;
  /**
   * Upsert a package record. Throws when attempting to overwrite a version
   * already published (published packages are immutable — Bridge plan §12.8).
   */
  savePackage(record: PublishedPackageRecord): Promise<void>;
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
  async getLatestPublished(packageId: string) {
    const published = this.data.packages.filter(
      (p) => p.packageId === packageId && p.status === "published",
    );
    if (!published.length) return null;
    return published.reduce((a, b) => (semverGt(b.version, a.version) ? b : a));
  }
  async savePackage(record: PublishedPackageRecord) {
    const i = this.data.packages.findIndex(
      (p) => p.packageId === record.packageId && p.version === record.version,
    );
    if (i >= 0) {
      if (this.data.packages[i]!.status === "published")
        throw new Error(
          `${record.packageId}@${record.version} is published and immutable — publish a new version instead`,
        );
      this.data.packages[i] = structuredClone(record);
    } else {
      this.data.packages.push(structuredClone(record));
    }
    this.persist();
  }
}
