// KB store seam: one interface over all rework entities, with an in-memory
// implementation (tests, and the base of the JSON dev store). The Postgres
// store in @bridge/pg-stores implements the same interface (hybrid jsonb
// mapping, as before the rework).

import type { CompiledKb } from "./compiled";
import type {
  KbBenchmarkMarking,
  KbBenchmarkRun,
  KbEdge,
  KbExtractionJob,
  KbMembership,
  KbPack,
  KbPackVersion,
  KbPlayer,
  KbSandbox,
  KbSource,
  KbSourceDocument,
  KbSourcePassage,
  KbSuggestion,
  KbVersion,
  KnowledgeBase,
  KnowledgeItem,
  KnowledgeItemVersion,
} from "./model";

export interface KbStore {
  // knowledge bases
  putKb(kb: KnowledgeBase): Promise<void>;
  getKb(kbId: string): Promise<KnowledgeBase | null>;
  listKbs(): Promise<KnowledgeBase[]>;
  deleteKb(kbId: string): Promise<void>;

  // items + memberships
  putItem(item: KnowledgeItem): Promise<void>;
  getItem(itemId: string): Promise<KnowledgeItem | null>;
  getItems(itemIds: string[]): Promise<KnowledgeItem[]>;
  /** Items belonging to the KB (via memberships), any status. */
  listItemsForKb(kbId: string): Promise<KnowledgeItem[]>;
  deleteItem(itemId: string): Promise<void>;
  addMembership(m: KbMembership): Promise<void>;
  removeMembership(m: KbMembership): Promise<void>;
  listMembershipsForItem(itemId: string): Promise<KbMembership[]>;
  listMembershipsForKb(kbId: string): Promise<KbMembership[]>;

  // immutable item versions (committed snapshots)
  putItemVersion(v: KnowledgeItemVersion): Promise<void>;
  getItemVersion(itemId: string, versionNumber: number): Promise<KnowledgeItemVersion | null>;
  /** Committed versions of an item, newest first. */
  listItemVersions(itemId: string): Promise<KnowledgeItemVersion[]>;
  deleteItemVersion(itemId: string, versionNumber: number): Promise<void>;
  deleteItemVersionsForItem(itemId: string): Promise<void>;

  // KB versions (releases)
  putKbVersion(v: KbVersion): Promise<void>;
  getKbVersion(versionId: string): Promise<KbVersion | null>;
  /** Published releases of a KB, newest first. */
  listKbVersions(kbId: string): Promise<KbVersion[]>;
  deleteKbVersion(versionId: string): Promise<void>;
  deleteKbVersionsForKb(kbId: string): Promise<void>;

  // edges
  putEdge(edge: KbEdge): Promise<void>;
  deleteEdge(edgeId: string): Promise<void>;
  /** All edges whose fromItemId OR toItemId is in `itemIds`. */
  listEdgesTouching(itemIds: string[]): Promise<KbEdge[]>;

  // packs
  putPack(pack: KbPack): Promise<void>;
  getPack(packId: string): Promise<KbPack | null>;
  listPacksForKb(kbId: string): Promise<KbPack[]>;
  deletePack(packId: string): Promise<void>;

  // pack versions (auto snapshots on every set save)
  putPackVersion(v: KbPackVersion): Promise<void>;
  getPackVersion(packId: string, versionNumber: number): Promise<KbPackVersion | null>;
  /** Snapshots of a pack, newest first. */
  listPackVersions(packId: string): Promise<KbPackVersion[]>;
  deletePackVersionsForPack(packId: string): Promise<void>;

  // players & sandboxes
  putPlayer(player: KbPlayer): Promise<void>;
  getPlayer(playerId: string): Promise<KbPlayer | null>;
  listPlayersForKb(kbId: string): Promise<KbPlayer[]>;
  listPlayers(): Promise<KbPlayer[]>;
  deletePlayer(playerId: string): Promise<void>;
  putSandbox(sandbox: KbSandbox): Promise<void>;
  getSandbox(sandboxId: string): Promise<KbSandbox | null>;
  listSandboxesForKb(kbId: string): Promise<KbSandbox[]>;
  deleteSandbox(sandboxId: string): Promise<void>;

  // suggestions
  putSuggestion(s: KbSuggestion): Promise<void>;
  getSuggestion(suggestionId: string): Promise<KbSuggestion | null>;
  listSuggestionsForKb(kbId: string): Promise<KbSuggestion[]>;
  deleteSuggestion(suggestionId: string): Promise<void>;

  // sources
  putSource(source: KbSource): Promise<void>;
  getSource(sourceId: string): Promise<KbSource | null>;
  listSources(): Promise<KbSource[]>;
  deleteSource(sourceId: string): Promise<void>;
  putDocument(doc: KbSourceDocument): Promise<void>;
  getDocument(sourceId: string): Promise<KbSourceDocument | null>;
  deleteDocument(sourceId: string): Promise<void>;
  /** Wholesale replace (documents are re-uploaded as a unit). */
  replacePassages(sourceId: string, passages: KbSourcePassage[]): Promise<void>;
  listPassages(sourceId: string): Promise<KbSourcePassage[]>;

  // extraction jobs
  putJob(job: KbExtractionJob): Promise<void>;
  getJob(jobId: string): Promise<KbExtractionJob | null>;
  listJobsForKb(kbId: string): Promise<KbExtractionJob[]>;
  deleteJob(jobId: string): Promise<void>;

  // compiles
  putCompile(compile: CompiledKb): Promise<void>;
  getCompile(compileId: string): Promise<CompiledKb | null>;
  listCompilesForKb(kbId: string, limit?: number): Promise<CompiledKb[]>;
  deleteCompilesForKb(kbId: string): Promise<void>;

  // benchmark runs (append-only artifacts) + markings (mutable, signature-keyed)
  putBenchmarkRun(run: KbBenchmarkRun): Promise<void>;
  getBenchmarkRun(runId: string): Promise<KbBenchmarkRun | null>;
  /** Runs for the KB, newest first. */
  listBenchmarkRunsForKb(kbId: string): Promise<KbBenchmarkRun[]>;
  putBenchmarkMarking(m: KbBenchmarkMarking): Promise<void>;
  /** Markings for the KB, newest first. */
  listBenchmarkMarkingsForKb(kbId: string): Promise<KbBenchmarkMarking[]>;
}

export interface KbStoreData {
  kbs: KnowledgeBase[];
  items: KnowledgeItem[];
  itemVersions: KnowledgeItemVersion[];
  kbVersions: KbVersion[];
  memberships: KbMembership[];
  edges: KbEdge[];
  packs: KbPack[];
  packVersions: KbPackVersion[];
  players: KbPlayer[];
  sandboxes: KbSandbox[];
  suggestions: KbSuggestion[];
  sources: KbSource[];
  documents: KbSourceDocument[];
  passages: KbSourcePassage[];
  jobs: KbExtractionJob[];
  compiles: CompiledKb[];
  benchmarkRuns: KbBenchmarkRun[];
  benchmarkMarkings: KbBenchmarkMarking[];
}

export function emptyKbStoreData(): KbStoreData {
  return {
    kbs: [],
    items: [],
    itemVersions: [],
    kbVersions: [],
    memberships: [],
    edges: [],
    packs: [],
    packVersions: [],
    players: [],
    sandboxes: [],
    suggestions: [],
    sources: [],
    documents: [],
    passages: [],
    jobs: [],
    compiles: [],
    benchmarkRuns: [],
    benchmarkMarkings: [],
  };
}

const byId =
  <T>(key: (t: T) => string, id: string) =>
  (t: T) =>
    key(t) === id;

export class InMemoryKbStore implements KbStore {
  constructor(protected data: KbStoreData = emptyKbStoreData()) {}

  protected persist(): void {
    // In-memory: nothing to do. File store overrides.
  }

  private upsert<T>(list: T[], key: (t: T) => string, value: T): void {
    const i = list.findIndex(byId(key, key(value)));
    if (i >= 0) list[i] = value;
    else list.push(value);
    this.persist();
  }

  // knowledge bases
  async putKb(kb: KnowledgeBase) {
    this.upsert(this.data.kbs, (k) => k.kbId, kb);
  }
  async getKb(kbId: string) {
    return this.data.kbs.find(byId((k) => k.kbId, kbId)) ?? null;
  }
  async listKbs() {
    return [...this.data.kbs].sort((a, b) => a.name.localeCompare(b.name));
  }
  async deleteKb(kbId: string) {
    this.data.kbs = this.data.kbs.filter((k) => k.kbId !== kbId);
    this.persist();
  }

  // items + memberships
  async putItem(item: KnowledgeItem) {
    this.upsert(this.data.items, (i) => i.itemId, item);
  }
  async getItem(itemId: string) {
    return this.data.items.find(byId((i) => i.itemId, itemId)) ?? null;
  }
  async getItems(itemIds: string[]) {
    const want = new Set(itemIds);
    return this.data.items.filter((i) => want.has(i.itemId));
  }
  async listItemsForKb(kbId: string) {
    const ids = new Set(
      this.data.memberships.filter((m) => m.kbId === kbId).map((m) => m.itemId),
    );
    return this.data.items.filter((i) => ids.has(i.itemId));
  }
  async deleteItem(itemId: string) {
    this.data.items = this.data.items.filter((i) => i.itemId !== itemId);
    this.persist();
  }
  async addMembership(m: KbMembership) {
    if (
      !this.data.memberships.some(
        (x) => x.kbId === m.kbId && x.itemId === m.itemId,
      )
    ) {
      this.data.memberships.push(m);
      this.persist();
    }
  }
  async removeMembership(m: KbMembership) {
    this.data.memberships = this.data.memberships.filter(
      (x) => !(x.kbId === m.kbId && x.itemId === m.itemId),
    );
    this.persist();
  }
  async listMembershipsForItem(itemId: string) {
    return this.data.memberships.filter((m) => m.itemId === itemId);
  }
  async listMembershipsForKb(kbId: string) {
    return this.data.memberships.filter((m) => m.kbId === kbId);
  }

  // immutable item versions
  async putItemVersion(v: KnowledgeItemVersion) {
    this.upsert(
      this.data.itemVersions,
      (x) => `${x.itemId}@${x.versionNumber}`,
      v,
    );
  }
  async getItemVersion(itemId: string, versionNumber: number) {
    return (
      this.data.itemVersions.find(
        (v) => v.itemId === itemId && v.versionNumber === versionNumber,
      ) ?? null
    );
  }
  async listItemVersions(itemId: string) {
    return this.data.itemVersions
      .filter((v) => v.itemId === itemId)
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }
  async deleteItemVersion(itemId: string, versionNumber: number) {
    this.data.itemVersions = this.data.itemVersions.filter(
      (v) => !(v.itemId === itemId && v.versionNumber === versionNumber),
    );
    this.persist();
  }
  async deleteItemVersionsForItem(itemId: string) {
    this.data.itemVersions = this.data.itemVersions.filter((v) => v.itemId !== itemId);
    this.persist();
  }

  // KB versions (releases)
  async putKbVersion(v: KbVersion) {
    this.upsert(this.data.kbVersions, (x) => x.versionId, v);
  }
  async getKbVersion(versionId: string) {
    return (
      this.data.kbVersions.find(byId((v) => v.versionId, versionId)) ?? null
    );
  }
  async listKbVersions(kbId: string) {
    return this.data.kbVersions
      .filter((v) => v.kbId === kbId)
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }
  async deleteKbVersion(versionId: string) {
    this.data.kbVersions = this.data.kbVersions.filter((v) => v.versionId !== versionId);
    this.persist();
  }
  async deleteKbVersionsForKb(kbId: string) {
    this.data.kbVersions = this.data.kbVersions.filter((v) => v.kbId !== kbId);
    this.persist();
  }

  // edges
  async putEdge(edge: KbEdge) {
    this.upsert(this.data.edges, (e) => e.edgeId, edge);
  }
  async deleteEdge(edgeId: string) {
    this.data.edges = this.data.edges.filter((e) => e.edgeId !== edgeId);
    this.persist();
  }
  async listEdgesTouching(itemIds: string[]) {
    const want = new Set(itemIds);
    return this.data.edges.filter(
      (e) => want.has(e.fromItemId) || (e.toItemId ? want.has(e.toItemId) : false),
    );
  }

  // packs
  async putPack(pack: KbPack) {
    this.upsert(this.data.packs, (p) => p.packId, pack);
  }
  async getPack(packId: string) {
    return this.data.packs.find(byId((p) => p.packId, packId)) ?? null;
  }
  async listPacksForKb(kbId: string) {
    return this.data.packs
      .filter((p) => p.kbId === kbId)
      .sort((a, b) => a.ordinal - b.ordinal);
  }
  async deletePack(packId: string) {
    this.data.packs = this.data.packs.filter((p) => p.packId !== packId);
    this.persist();
  }

  // pack versions
  async putPackVersion(v: KbPackVersion) {
    this.upsert(
      this.data.packVersions,
      (x) => `${x.packId}@${x.versionNumber}`,
      v,
    );
  }
  async getPackVersion(packId: string, versionNumber: number) {
    return (
      this.data.packVersions.find(
        (v) => v.packId === packId && v.versionNumber === versionNumber,
      ) ?? null
    );
  }
  async listPackVersions(packId: string) {
    return this.data.packVersions
      .filter((v) => v.packId === packId)
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }
  async deletePackVersionsForPack(packId: string) {
    this.data.packVersions = this.data.packVersions.filter((v) => v.packId !== packId);
    this.persist();
  }

  // players & sandboxes
  async putPlayer(player: KbPlayer) {
    this.upsert(this.data.players, (p) => p.playerId, player);
  }
  async getPlayer(playerId: string) {
    return this.data.players.find(byId((p) => p.playerId, playerId)) ?? null;
  }
  async listPlayersForKb(kbId: string) {
    return this.data.players.filter((p) => p.kbId === kbId);
  }
  async listPlayers() {
    return [...this.data.players];
  }
  async deletePlayer(playerId: string) {
    this.data.players = this.data.players.filter((p) => p.playerId !== playerId);
    this.persist();
  }
  async putSandbox(sandbox: KbSandbox) {
    this.upsert(this.data.sandboxes, (s) => s.sandboxId, sandbox);
  }
  async getSandbox(sandboxId: string) {
    return (
      this.data.sandboxes.find(byId((s) => s.sandboxId, sandboxId)) ?? null
    );
  }
  async listSandboxesForKb(kbId: string) {
    return this.data.sandboxes.filter((s) => s.kbId === kbId);
  }
  async deleteSandbox(sandboxId: string) {
    this.data.sandboxes = this.data.sandboxes.filter((s) => s.sandboxId !== sandboxId);
    this.persist();
  }

  // suggestions
  async putSuggestion(s: KbSuggestion) {
    this.upsert(this.data.suggestions, (x) => x.suggestionId, s);
  }
  async getSuggestion(suggestionId: string) {
    return (
      this.data.suggestions.find(byId((s) => s.suggestionId, suggestionId)) ??
      null
    );
  }
  async listSuggestionsForKb(kbId: string) {
    return this.data.suggestions
      .filter((s) => s.kbId === kbId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async deleteSuggestion(suggestionId: string) {
    this.data.suggestions = this.data.suggestions.filter(
      (s) => s.suggestionId !== suggestionId,
    );
    this.persist();
  }

  // sources
  async putSource(source: KbSource) {
    this.upsert(this.data.sources, (s) => s.sourceId, source);
  }
  async getSource(sourceId: string) {
    return this.data.sources.find(byId((s) => s.sourceId, sourceId)) ?? null;
  }
  async listSources() {
    return [...this.data.sources].sort((a, b) => a.title.localeCompare(b.title));
  }
  async deleteSource(sourceId: string) {
    this.data.sources = this.data.sources.filter((s) => s.sourceId !== sourceId);
    this.persist();
  }
  async putDocument(doc: KbSourceDocument) {
    this.upsert(this.data.documents, (d) => d.sourceId, doc);
  }
  async getDocument(sourceId: string) {
    return this.data.documents.find(byId((d) => d.sourceId, sourceId)) ?? null;
  }
  async deleteDocument(sourceId: string) {
    this.data.documents = this.data.documents.filter((d) => d.sourceId !== sourceId);
    this.persist();
  }
  async replacePassages(sourceId: string, passages: KbSourcePassage[]) {
    this.data.passages = this.data.passages
      .filter((p) => p.sourceId !== sourceId)
      .concat(passages);
    this.persist();
  }
  async listPassages(sourceId: string) {
    return this.data.passages
      .filter((p) => p.sourceId === sourceId)
      .sort((a, b) => a.ordinal - b.ordinal);
  }

  // extraction jobs
  async putJob(job: KbExtractionJob) {
    this.upsert(this.data.jobs, (j) => j.jobId, job);
  }
  async getJob(jobId: string) {
    return this.data.jobs.find(byId((j) => j.jobId, jobId)) ?? null;
  }
  async listJobsForKb(kbId: string) {
    return this.data.jobs
      .filter((j) => j.kbId === kbId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async deleteJob(jobId: string) {
    this.data.jobs = this.data.jobs.filter((j) => j.jobId !== jobId);
    this.persist();
  }

  // compiles
  async putCompile(compile: CompiledKb) {
    this.upsert(this.data.compiles, (c) => c.compileId, compile);
  }
  async getCompile(compileId: string) {
    return (
      this.data.compiles.find(byId((c) => c.compileId, compileId)) ?? null
    );
  }
  async listCompilesForKb(kbId: string, limit = 20) {
    return this.data.compiles
      .filter((c) => c.kbId === kbId)
      .sort((a, b) => b.version - a.version)
      .slice(0, limit);
  }
  async deleteCompilesForKb(kbId: string) {
    this.data.compiles = this.data.compiles.filter((c) => c.kbId !== kbId);
    this.persist();
  }

  // benchmark runs + markings
  async putBenchmarkRun(run: KbBenchmarkRun) {
    this.upsert(this.data.benchmarkRuns, (r) => r.runId, run);
  }
  async getBenchmarkRun(runId: string) {
    return this.data.benchmarkRuns.find(byId((r) => r.runId, runId)) ?? null;
  }
  async listBenchmarkRunsForKb(kbId: string) {
    return this.data.benchmarkRuns
      .filter((r) => r.kbId === kbId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async putBenchmarkMarking(m: KbBenchmarkMarking) {
    this.upsert(this.data.benchmarkMarkings, (x) => x.markingId, m);
  }
  async listBenchmarkMarkingsForKb(kbId: string) {
    return this.data.benchmarkMarkings
      .filter((m) => m.kbId === kbId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
