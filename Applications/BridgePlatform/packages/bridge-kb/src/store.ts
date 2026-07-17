// KB store seam: one interface over all rework entities, with an in-memory
// implementation (tests, and the base of the JSON dev store). The Postgres
// store in @bridge/pg-stores implements the same interface (hybrid jsonb
// mapping, as before the rework).

import type { CompiledKb } from "./compiled";
import type {
  KbEdge,
  KbExtractionJob,
  KbMembership,
  KbPack,
  KbPlayer,
  KbSandbox,
  KbSource,
  KbSourceDocument,
  KbSourcePassage,
  KbSuggestion,
  KnowledgeBase,
  KnowledgeItem,
} from "./model";

export interface KbStore {
  // knowledge bases
  putKb(kb: KnowledgeBase): Promise<void>;
  getKb(kbId: string): Promise<KnowledgeBase | null>;
  listKbs(): Promise<KnowledgeBase[]>;

  // items + memberships
  putItem(item: KnowledgeItem): Promise<void>;
  getItem(itemId: string): Promise<KnowledgeItem | null>;
  getItems(itemIds: string[]): Promise<KnowledgeItem[]>;
  /** Items belonging to the KB (via memberships), any status. */
  listItemsForKb(kbId: string): Promise<KnowledgeItem[]>;
  addMembership(m: KbMembership): Promise<void>;
  removeMembership(m: KbMembership): Promise<void>;
  listMembershipsForItem(itemId: string): Promise<KbMembership[]>;
  listMembershipsForKb(kbId: string): Promise<KbMembership[]>;

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

  // players & sandboxes
  putPlayer(player: KbPlayer): Promise<void>;
  getPlayer(playerId: string): Promise<KbPlayer | null>;
  listPlayersForKb(kbId: string): Promise<KbPlayer[]>;
  listPlayers(): Promise<KbPlayer[]>;
  putSandbox(sandbox: KbSandbox): Promise<void>;
  getSandbox(sandboxId: string): Promise<KbSandbox | null>;
  listSandboxesForKb(kbId: string): Promise<KbSandbox[]>;

  // suggestions
  putSuggestion(s: KbSuggestion): Promise<void>;
  getSuggestion(suggestionId: string): Promise<KbSuggestion | null>;
  listSuggestionsForKb(kbId: string): Promise<KbSuggestion[]>;

  // sources
  putSource(source: KbSource): Promise<void>;
  getSource(sourceId: string): Promise<KbSource | null>;
  listSources(): Promise<KbSource[]>;
  putDocument(doc: KbSourceDocument): Promise<void>;
  getDocument(sourceId: string): Promise<KbSourceDocument | null>;
  /** Wholesale replace (documents are re-uploaded as a unit). */
  replacePassages(sourceId: string, passages: KbSourcePassage[]): Promise<void>;
  listPassages(sourceId: string): Promise<KbSourcePassage[]>;

  // extraction jobs
  putJob(job: KbExtractionJob): Promise<void>;
  getJob(jobId: string): Promise<KbExtractionJob | null>;
  listJobsForKb(kbId: string): Promise<KbExtractionJob[]>;

  // compiles
  putCompile(compile: CompiledKb): Promise<void>;
  getCompile(compileId: string): Promise<CompiledKb | null>;
  listCompilesForKb(kbId: string, limit?: number): Promise<CompiledKb[]>;

  /**
   * Delete a KB and everything scoped to it: memberships, packs, players,
   * sandboxes, suggestions, jobs, compiles, plus items whose ONLY membership
   * was this KB (shared items survive in their other KBs) and edges touching
   * the deleted items. Sources/documents are global and untouched.
   */
  deleteKbCascade(kbId: string): Promise<void>;
}

export interface KbStoreData {
  kbs: KnowledgeBase[];
  items: KnowledgeItem[];
  memberships: KbMembership[];
  edges: KbEdge[];
  packs: KbPack[];
  players: KbPlayer[];
  sandboxes: KbSandbox[];
  suggestions: KbSuggestion[];
  sources: KbSource[];
  documents: KbSourceDocument[];
  passages: KbSourcePassage[];
  jobs: KbExtractionJob[];
  compiles: CompiledKb[];
}

export function emptyKbStoreData(): KbStoreData {
  return {
    kbs: [],
    items: [],
    memberships: [],
    edges: [],
    packs: [],
    players: [],
    sandboxes: [],
    suggestions: [],
    sources: [],
    documents: [],
    passages: [],
    jobs: [],
    compiles: [],
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
  async putDocument(doc: KbSourceDocument) {
    this.upsert(this.data.documents, (d) => d.sourceId, doc);
  }
  async getDocument(sourceId: string) {
    return this.data.documents.find(byId((d) => d.sourceId, sourceId)) ?? null;
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

  async deleteKbCascade(kbId: string) {
    const mine = this.data.memberships.filter((m) => m.kbId === kbId);
    const mineIds = new Set(mine.map((m) => m.itemId));
    // Items shared with another KB survive; the rest go, with their edges.
    const orphaned = new Set(
      [...mineIds].filter(
        (itemId) =>
          !this.data.memberships.some((m) => m.itemId === itemId && m.kbId !== kbId),
      ),
    );
    this.data.memberships = this.data.memberships.filter((m) => m.kbId !== kbId);
    this.data.items = this.data.items.filter((i) => !orphaned.has(i.itemId));
    this.data.edges = this.data.edges.filter(
      (e) => !orphaned.has(e.fromItemId) && !(e.toItemId && orphaned.has(e.toItemId)),
    );
    this.data.packs = this.data.packs.filter((p) => p.kbId !== kbId);
    this.data.players = this.data.players.filter((p) => p.kbId !== kbId);
    this.data.sandboxes = this.data.sandboxes.filter((s) => s.kbId !== kbId);
    this.data.suggestions = this.data.suggestions.filter((s) => s.kbId !== kbId);
    this.data.jobs = this.data.jobs.filter((j) => j.kbId !== kbId);
    this.data.compiles = this.data.compiles.filter((c) => c.kbId !== kbId);
    this.data.kbs = this.data.kbs.filter((k) => k.kbId !== kbId);
    this.persist();
  }
}
