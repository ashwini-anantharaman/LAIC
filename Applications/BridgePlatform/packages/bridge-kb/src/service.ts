// KbService (Knowledge Rework §3): every content save triggers a recompile.
// A structurally valid compile advances the KB's live pointer; a broken one
// leaves last-good serving and records the error (fellows iterate fearlessly,
// tables never pick up a broken artifact). Item edits fork on divergence when
// the item is shared with other KBs (decision 2).

import type { CompiledKb } from "./compiled";
import { compileKb } from "./compile";
import { newId } from "./ids";
import type {
  KbEdge,
  KbPack,
  KbSuggestion,
  KnowledgeBase,
  KnowledgeItem,
  LevelDef,
} from "./model";
import type { KbStore } from "./store";

export interface KbServiceOptions {
  now?: () => string;
}

export class KbService {
  private readonly now: () => string;

  constructor(
    private readonly store: KbStore,
    options: KbServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  // ---- knowledge bases -------------------------------------------------------

  async createKb(input: {
    name: string;
    systemLabel: string;
    description?: string;
    levels?: LevelDef[];
    createdBy: string;
  }): Promise<KnowledgeBase> {
    const kb: KnowledgeBase = {
      kbId: newId("kb"),
      name: input.name,
      systemLabel: input.systemLabel,
      description: input.description,
      levels: input.levels ?? [],
      status: "active",
      createdBy: input.createdBy,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    await this.store.putKb(kb);
    return kb;
  }

  async getKb(kbId: string): Promise<KnowledgeBase> {
    const kb = await this.store.getKb(kbId);
    if (!kb) throw new Error(`No knowledge base ${kbId}`);
    return kb;
  }

  /** The compile sessions/players resolve against (last-good). */
  async liveCompile(kbId: string): Promise<CompiledKb | null> {
    const kb = await this.getKb(kbId);
    if (!kb.liveCompileId) return null;
    return this.store.getCompile(kb.liveCompileId);
  }

  // ---- items (save = recompile; shared items fork on divergence) -------------

  async createItem(
    kbId: string,
    item: Omit<KnowledgeItem, "itemId" | "version" | "createdAt" | "updatedAt">,
  ): Promise<KnowledgeItem> {
    const full: KnowledgeItem = {
      ...item,
      itemId: newId("ki"),
      version: 1,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    await this.store.putItem(full);
    await this.store.addMembership({ kbId, itemId: full.itemId });
    await this.recompile(kbId);
    return full;
  }

  /**
   * Edit an item IN THE CONTEXT OF one KB. If the item is also a member of
   * other KBs, this forks: the edited copy replaces it in `kbId` only, with
   * lineage; the other KBs keep the original (copy-on-diverge, decision 2).
   */
  async saveItem(
    kbId: string,
    itemId: string,
    changes: Partial<
      Pick<
        KnowledgeItem,
        | "title"
        | "humanReadableText"
        | "knowledgeType"
        | "phase"
        | "payload"
        | "settings"
        | "sourceReferences"
        | "supportedLevels"
        | "status"
      >
    >,
    editedBy: string,
  ): Promise<KnowledgeItem> {
    const existing = await this.store.getItem(itemId);
    if (!existing) throw new Error(`No item ${itemId}`);
    const memberships = await this.store.listMembershipsForItem(itemId);
    if (!memberships.some((m) => m.kbId === kbId))
      throw new Error(`Item ${itemId} is not a member of ${kbId}`);

    const shared = memberships.length > 1;
    const target: KnowledgeItem = shared
      ? {
          ...existing,
          ...changes,
          itemId: newId("ki"),
          forkedFromItemId: itemId,
          version: 1,
          createdBy: editedBy,
          createdAt: this.now(),
          updatedAt: this.now(),
        }
      : { ...existing, ...changes, version: existing.version + 1, updatedAt: this.now() };

    await this.store.putItem(target);
    if (shared) {
      await this.store.removeMembership({ kbId, itemId });
      await this.store.addMembership({ kbId, itemId: target.itemId });
      // Packs in this KB tracking the old item follow the fork.
      for (const pack of await this.store.listPacksForKb(kbId)) {
        if (pack.itemIds.includes(itemId)) {
          await this.store.putPack({
            ...pack,
            itemIds: pack.itemIds.map((id) => (id === itemId ? target.itemId : id)),
            updatedAt: this.now(),
          });
        }
      }
    }
    await this.recompile(kbId);
    return target;
  }

  /** List an item into another KB while identical (shared membership). */
  async shareItem(kbId: string, itemId: string): Promise<void> {
    const item = await this.store.getItem(itemId);
    if (!item) throw new Error(`No item ${itemId}`);
    await this.store.addMembership({ kbId, itemId });
    await this.recompile(kbId);
  }

  // ---- edges -------------------------------------------------------------------

  async addEdge(
    kbId: string,
    edge: Omit<KbEdge, "edgeId" | "createdAt">,
  ): Promise<KbEdge> {
    const full: KbEdge = { ...edge, edgeId: newId("ke"), createdAt: this.now() };
    await this.store.putEdge(full);
    await this.recompile(kbId);
    return full;
  }

  async removeEdge(kbId: string, edgeId: string): Promise<void> {
    await this.store.deleteEdge(edgeId);
    await this.recompile(kbId);
  }

  // ---- packs --------------------------------------------------------------------

  async savePack(
    pack: Omit<KbPack, "packId" | "createdAt" | "updatedAt"> & { packId?: string },
  ): Promise<KbPack> {
    const existing = pack.packId ? await this.store.getPack(pack.packId) : null;
    const full: KbPack = {
      ...pack,
      packId: pack.packId ?? newId("pk"),
      createdAt: existing?.createdAt ?? this.now(),
      updatedAt: this.now(),
    };
    await this.store.putPack(full);
    await this.recompile(full.kbId);
    return full;
  }

  // ---- suggestions ----------------------------------------------------------------

  async createSuggestion(
    input: Omit<KbSuggestion, "suggestionId" | "status" | "createdAt">,
  ): Promise<KbSuggestion> {
    const full: KbSuggestion = {
      ...input,
      suggestionId: newId("sg"),
      status: "open",
      createdAt: this.now(),
    };
    await this.store.putSuggestion(full);
    return full;
  }

  async resolveSuggestion(suggestionId: string, resolvedBy: string): Promise<void> {
    const s = await this.store.getSuggestion(suggestionId);
    if (!s) throw new Error(`No suggestion ${suggestionId}`);
    await this.store.putSuggestion({
      ...s,
      status: "resolved",
      resolvedBy,
      resolvedAt: this.now(),
    });
  }

  // ---- compile (auto on save; last-good protection) --------------------------------

  async recompile(kbId: string): Promise<{ compiled?: CompiledKb; error?: string }> {
    const kb = await this.getKb(kbId);
    const [items, edges, packs, previous] = await Promise.all([
      this.store.listItemsForKb(kbId),
      this.store.listMembershipsForKb(kbId).then(async (ms) => {
        const ids = ms.map((m) => m.itemId);
        return this.store.listEdgesTouching(ids);
      }),
      this.store.listPacksForKb(kbId),
      this.store.listCompilesForKb(kbId, 1),
    ]);

    const version = (previous[0]?.version ?? 0) + 1;
    const { compiled, errors } = compileKb({
      kbId,
      version,
      compiledAt: this.now(),
      items,
      edges,
      packs,
    });

    if (!compiled) {
      const message = errors.map((e) => (e.itemId ? `[${e.itemId}] ${e.message}` : e.message)).join("; ");
      await this.store.putKb({
        ...kb,
        lastCompileError: { message, at: this.now() },
        updatedAt: this.now(),
      });
      return { error: message };
    }

    // Unchanged inputs: keep the existing artifact, clear any stale error.
    if (previous[0] && previous[0].inputHash === compiled.inputHash && kb.liveCompileId) {
      if (kb.lastCompileError) {
        await this.store.putKb({ ...kb, lastCompileError: undefined, updatedAt: this.now() });
      }
      return { compiled: previous[0] };
    }

    await this.store.putCompile(compiled);
    await this.store.putKb({
      ...kb,
      liveCompileId: compiled.compileId,
      latestCompileId: compiled.compileId,
      lastCompileError: undefined,
      updatedAt: this.now(),
    });
    return { compiled };
  }
}
