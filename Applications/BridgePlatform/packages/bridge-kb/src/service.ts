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
  KbPackVersion,
  KbPlayer,
  KbSandbox,
  KbSuggestion,
  KbVersion,
  KbVersionItemRef,
  KnowledgeBase,
  KnowledgeItem,
  KnowledgeItemVersion,
  LevelDef,
} from "./model";
import type { KbStore } from "./store";
import { validatePlayerStatic } from "./validatePlayer";
import { itemIsDirty, packIsDirty, snapshotItem, snapshotPack } from "./versioning";

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

  /**
   * Delete a KB and everything scoped to it (memberships, packs, players,
   * sandboxes, suggestions, extraction jobs, compiles, published versions).
   * Items are only hard-deleted when this was their last membership —
   * otherwise they simply stop belonging here (they're still shared/forked
   * elsewhere). Registered sources are never deleted (they're KB-agnostic).
   * Refuses to delete a KB that other KBs were derived from — re-parent or
   * delete the derivatives first, so the tree never has a dangling branch.
   */
  async deleteKb(kbId: string): Promise<void> {
    const all = await this.store.listKbs();
    const children = all.filter((k) => k.derivedFromKbId === kbId);
    if (children.length)
      throw new Error(
        `Cannot delete: ${children.map((c) => c.name).join(", ")} ${children.length === 1 ? "was" : "were"} derived from this KB. Delete or branch ${children.length === 1 ? "it" : "them"} elsewhere first.`,
      );

    const memberships = await this.store.listMembershipsForKb(kbId);
    for (const m of memberships) {
      await this.store.removeMembership(m);
      const stillMember = await this.store.listMembershipsForItem(m.itemId);
      if (!stillMember.length) {
        const edges = await this.store.listEdgesTouching([m.itemId]);
        for (const edge of edges) await this.store.deleteEdge(edge.edgeId);
        await this.store.deleteItemVersionsForItem(m.itemId);
        await this.store.deleteItem(m.itemId);
      }
    }

    for (const pack of await this.store.listPacksForKb(kbId)) {
      await this.store.deletePackVersionsForPack(pack.packId);
      await this.store.deletePack(pack.packId);
    }
    for (const player of await this.store.listPlayersForKb(kbId)) await this.store.deletePlayer(player.playerId);
    for (const sandbox of await this.store.listSandboxesForKb(kbId)) await this.store.deleteSandbox(sandbox.sandboxId);
    for (const suggestion of await this.store.listSuggestionsForKb(kbId)) await this.store.deleteSuggestion(suggestion.suggestionId);
    for (const job of await this.store.listJobsForKb(kbId)) await this.store.deleteJob(job.jobId);
    await this.store.deleteCompilesForKb(kbId);
    await this.store.deleteKbVersionsForKb(kbId);
    await this.store.deleteKb(kbId);
  }

  /** Hide/unhide a KB everywhere without touching its data (reversible). */
  async setKbArchived(kbId: string, archived: boolean): Promise<void> {
    const kb = await this.getKb(kbId);
    await this.store.putKb({ ...kb, archived: archived || undefined, updatedAt: this.now() });
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
        | "internalNotes"
        | "tags"
      >
    >,
    editedBy: string,
  ): Promise<KnowledgeItem> {
    const target = await this.applyItemEdit(kbId, itemId, changes, editedBy);
    await this.recompile(kbId);
    return target;
  }

  /** saveItem's core (fork-on-write for shared items) WITHOUT the recompile —
   *  bulk operations apply many edits and recompile once at the end. */
  private async applyItemEdit(
    kbId: string,
    itemId: string,
    changes: Parameters<KbService["saveItem"]>[2],
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
          // A fork is a new item lineage: its committed-version history starts
          // fresh (version snapshots key on itemId).
          committedVersion: undefined,
          mainVersion: undefined,
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
          await this.writePackWithSnapshot(
            {
              ...pack,
              itemIds: pack.itemIds.map((id) => (id === itemId ? target.itemId : id)),
              updatedAt: this.now(),
            },
            editedBy,
          );
        }
      }
    }
    return target;
  }

  /**
   * Bulk status change (trust badge). Items already at `status` are skipped;
   * shared items fork exactly as saveItem would. One recompile at the end.
   */
  async setItemsStatus(
    kbId: string,
    itemIds: string[],
    status: KnowledgeItem["status"],
    editedBy: string,
  ): Promise<{ changed: { itemId: string; title: string }[] }> {
    const changed: { itemId: string; title: string }[] = [];
    for (const itemId of new Set(itemIds)) {
      const existing = await this.store.getItem(itemId);
      if (!existing || existing.status === status) continue;
      const target = await this.applyItemEdit(kbId, itemId, { status }, editedBy);
      changed.push({ itemId: target.itemId, title: target.title });
    }
    if (changed.length) await this.recompile(kbId);
    return { changed };
  }

  /** List an item into another KB while identical (shared membership). */
  async shareItem(kbId: string, itemId: string): Promise<void> {
    const item = await this.store.getItem(itemId);
    if (!item) throw new Error(`No item ${itemId}`);
    await this.store.addMembership({ kbId, itemId });
    await this.recompile(kbId);
  }

  // ---- item versions (immutable committed snapshots) -------------------------

  /**
   * Freeze the item head as the next immutable version, and make it the item's
   * MAIN version. No-op-safe: if the head isn't dirty against the current main
   * version, that version is returned unchanged (nothing new is minted). This
   * is the "only create a version when something changed" guarantee at the
   * item level.
   */
  async commitItemVersion(
    itemId: string,
    committedBy: string,
    changeNote?: string,
  ): Promise<KnowledgeItemVersion> {
    const item = await this.store.getItem(itemId);
    if (!item) throw new Error(`No item ${itemId}`);
    const history = await this.store.listItemVersions(itemId); // newest first
    const mainSnapshot =
      item.mainVersion != null
        ? (history.find((v) => v.versionNumber === item.mainVersion) ?? null)
        : null;
    if (!itemIsDirty(item, mainSnapshot)) return mainSnapshot!; // clean vs main
    const versionNumber = (history[0]?.versionNumber ?? 0) + 1; // max + 1, contiguous
    const snapshot = snapshotItem(item, versionNumber, committedBy, this.now(), changeNote);
    await this.store.putItemVersion(snapshot);
    await this.store.putItem({
      ...item,
      committedVersion: versionNumber,
      mainVersion: versionNumber,
      updatedAt: this.now(),
    });
    return snapshot;
  }

  async listItemVersions(itemId: string): Promise<KnowledgeItemVersion[]> {
    return this.store.listItemVersions(itemId);
  }

  /**
   * Designate a past committed version as the item's MAIN version: the head is
   * set to that version's content and the main pointer moves to it — WITHOUT
   * minting a new version (a pointer move, exactly like KB-level rollback). A
   * later edit is what mints the next version. Goes through saveItem, so a
   * shared item still forks on divergence (one KB never rewrites another); a
   * fork starts a fresh lineage, so its main pointer resets.
   */
  async setItemMainVersion(
    kbId: string,
    itemId: string,
    versionNumber: number,
    editedBy: string,
  ): Promise<KnowledgeItem> {
    const version = await this.store.getItemVersion(itemId, versionNumber);
    if (!version) throw new Error(`No version ${versionNumber} of item ${itemId}`);
    const saved = await this.saveItem(
      kbId,
      itemId,
      {
        title: version.title,
        humanReadableText: version.humanReadableText,
        knowledgeType: version.knowledgeType,
        phase: version.phase,
        payload: version.payload,
        settings: version.settings,
        sourceReferences: version.sourceReferences,
        supportedLevels: version.supportedLevels,
        status: version.status,
        internalNotes: version.internalNotes,
        tags: version.tags,
      },
      editedBy,
    );
    // Not forked → the same lineage; point main at the chosen version (head now
    // matches it, so it reads clean). Forked → fresh lineage, leave main unset.
    if (saved.itemId === itemId) {
      const updated = { ...saved, mainVersion: versionNumber, updatedAt: this.now() };
      await this.store.putItem(updated);
      return updated;
    }
    return saved;
  }

  /**
   * Delete a committed item version snapshot. Refuses to delete the MAIN
   * version (repoint main first) or one a published KB release still pins in
   * its manifest (that would leave the lockfile dangling).
   */
  async deleteItemVersion(
    kbId: string,
    itemId: string,
    versionNumber: number,
  ): Promise<void> {
    const item = await this.store.getItem(itemId);
    if (!item) throw new Error(`No item ${itemId}`);
    if (item.mainVersion === versionNumber)
      throw new Error(
        `v${versionNumber} is the main version — make another version main before deleting it.`,
      );

    // A release in any KB this item belongs to may pin this snapshot.
    const memberships = await this.store.listMembershipsForItem(itemId);
    for (const m of memberships) {
      const releases = await this.store.listKbVersions(m.kbId);
      const pinned = releases.find((r) =>
        r.items.some((i) => i.itemId === itemId && i.versionNumber === versionNumber),
      );
      if (pinned)
        throw new Error(
          `v${versionNumber} is pinned by published release v${pinned.versionNumber} — it can't be deleted.`,
        );
    }
    await this.store.deleteItemVersion(itemId, versionNumber);
  }

  /**
   * Bulk-delete knowledge items from a KB. Items pinned by a published
   * release are blocked (the release manifest must stay resolvable — this is
   * what makes the Base release's items undeletable). Deletable items are
   * stripped from every set that lists them BEFORE the membership goes (a
   * set referencing a missing item fails compile), and each strip is a
   * normal snapshot-versioned set save, so it's restorable. The item record,
   * its versions, and its edges are destroyed only when no other KB still
   * shares the item. One recompile at the end.
   */
  async deleteItems(
    kbId: string,
    itemIds: string[],
    deletedBy: string,
  ): Promise<{
    deleted: { itemId: string; title: string }[];
    blocked: { itemId: string; title: string; reason: string }[];
    setsTouched: string[];
  }> {
    const memberships = await this.store.listMembershipsForKb(kbId);
    const memberIds = new Set(memberships.map((m) => m.itemId));
    const releases = await this.store.listKbVersions(kbId);

    const deleted: { itemId: string; title: string }[] = [];
    const blocked: { itemId: string; title: string; reason: string }[] = [];
    for (const itemId of new Set(itemIds)) {
      const item = await this.store.getItem(itemId);
      if (!item || !memberIds.has(itemId)) {
        blocked.push({ itemId, title: item?.title ?? itemId, reason: "not in this knowledge base" });
        continue;
      }
      const pin = releases.find((r) => r.items.some((i) => i.itemId === itemId));
      if (pin) {
        blocked.push({
          itemId,
          title: item.title,
          reason: `pinned by published release v${pin.versionNumber}`,
        });
        continue;
      }
      deleted.push({ itemId, title: item.title });
    }

    const setsTouched: string[] = [];
    if (deleted.length) {
      const removeSet = new Set(deleted.map((d) => d.itemId));
      for (const pack of await this.store.listPacksForKb(kbId)) {
        if (!pack.itemIds.some((id) => removeSet.has(id))) continue;
        setsTouched.push(pack.name);
        await this.writePackWithSnapshot(
          {
            ...pack,
            itemIds: pack.itemIds.filter((id) => !removeSet.has(id)),
            updatedAt: this.now(),
          },
          deletedBy,
        );
      }
      for (const { itemId } of deleted) {
        for (const m of memberships.filter((x) => x.itemId === itemId))
          await this.store.removeMembership(m);
        const stillMember = await this.store.listMembershipsForItem(itemId);
        if (!stillMember.length) {
          const edges = await this.store.listEdgesTouching([itemId]);
          for (const edge of edges) await this.store.deleteEdge(edge.edgeId);
          await this.store.deleteItemVersionsForItem(itemId);
          await this.store.deleteItem(itemId);
        }
      }
      await this.recompile(kbId);
    }
    return { deleted, blocked, setsTouched };
  }

  /**
   * Delete a registered source and everything under it: document, passages,
   * and extraction jobs (across every KB). Refuses while any item still cites
   * it — provenance must never dangle silently; delete or re-cite the items
   * first (the bulk delete on Master / the source review page makes that a
   * one-screen sweep). src_claude, the platform-global source, is permanent.
   */
  async deleteSource(sourceId: string): Promise<void> {
    if (sourceId === "src_claude")
      throw new Error("The Claude source is platform-global and can't be deleted.");
    const source = await this.store.getSource(sourceId);
    if (!source) throw new Error(`No source ${sourceId}`);

    const citing = new Map<string, number>(); // kb name -> count
    const kbs = await this.store.listKbs();
    for (const kb of kbs) {
      const n = (await this.store.listItemsForKb(kb.kbId)).filter((i) =>
        i.sourceReferences.some((r) => r.sourceId === sourceId),
      ).length;
      if (n > 0) citing.set(kb.name, n);
    }
    if (citing.size) {
      const detail = [...citing.entries()].map(([name, n]) => `${n} in "${name}"`).join(", ");
      throw new Error(
        `Items still cite this source (${detail}). Delete those items first, or leave the source as their provenance.`,
      );
    }

    for (const kb of kbs) {
      const jobs = await this.store.listJobsForKb(kb.kbId);
      for (const job of jobs)
        if (job.sourceId === sourceId) await this.store.deleteJob(job.jobId);
    }
    await this.store.replacePassages(sourceId, []);
    await this.store.deleteDocument(sourceId);
    await this.store.deleteSource(sourceId);
  }

  // ---- KB versions (releases: the manifest over compiles) --------------------

  /**
   * Publish an immutable KB release. Commits every dirty member item first
   * (so the manifest pins real snapshots), then requires a clean compile —
   * a broken KB cannot be released. The version pins the compiled artifact
   * plus each member's committed version number (a lockfile).
   *
   * Only mints a new version when something actually changed: if the current
   * compile is identical to the most recent release's, no duplicate is created
   * (`created: false`). Either way the (new or existing) release becomes the
   * active/main version.
   */
  async publishKbVersion(
    kbId: string,
    input: { label?: string; notes?: string; publishedBy: string },
  ): Promise<{ version: KbVersion; created: boolean }> {
    const kb = await this.getKb(kbId);
    const members = await this.store.listItemsForKb(kbId);

    const items: KbVersionItemRef[] = [];
    for (const member of members) {
      const committed = await this.commitItemVersion(member.itemId, input.publishedBy);
      items.push({ itemId: member.itemId, versionNumber: committed.versionNumber });
    }

    const result = await this.recompile(kbId);
    if (result.error || !result.compiled)
      throw new Error(
        `Cannot publish ${kbId}: it does not compile — ${result.error ?? "no artifact"}`,
      );

    // Dedupe: nothing changed since the latest release → don't mint a copy.
    const existing = await this.store.listKbVersions(kbId); // newest first
    const latest = existing[0];
    if (latest && latest.compileId === result.compiled.compileId) {
      if (kb.activeVersionId !== latest.versionId) {
        await this.store.putKb({ ...kb, activeVersionId: latest.versionId, updatedAt: this.now() });
      }
      return { version: latest, created: false };
    }

    const versionNumber = (kb.latestVersionNumber ?? 0) + 1;
    const version: KbVersion = {
      versionId: newId("kv"),
      kbId,
      versionNumber,
      label: input.label,
      notes: input.notes,
      compileId: result.compiled.compileId,
      items,
      publishedBy: input.publishedBy,
      publishedAt: this.now(),
    };
    await this.store.putKbVersion(version);
    await this.store.putKb({
      ...kb,
      latestVersionNumber: versionNumber,
      activeVersionId: version.versionId,
      updatedAt: this.now(),
    });
    return { version, created: true };
  }

  /**
   * Designate a published version as the active/main one (rollback or
   * roll-forward) without re-publishing. The version must belong to this KB.
   */
  async setActiveVersion(kbId: string, versionId: string): Promise<void> {
    const kb = await this.getKb(kbId);
    const version = await this.store.getKbVersion(versionId);
    if (!version || version.kbId !== kbId)
      throw new Error(`Version ${versionId} does not belong to ${kbId}`);
    await this.store.putKb({ ...kb, activeVersionId: versionId, updatedAt: this.now() });
  }

  /**
   * Delete a published KB release. Refuses to delete the ACTIVE version (make
   * another active first) or one a derived KB branched from (that would orphan
   * the derivation's baseline).
   */
  async deleteKbVersion(kbId: string, versionId: string): Promise<void> {
    const kb = await this.getKb(kbId);
    const version = await this.store.getKbVersion(versionId);
    if (!version || version.kbId !== kbId)
      throw new Error(`Version ${versionId} does not belong to ${kbId}`);
    if (kb.activeVersionId === versionId)
      throw new Error(
        `v${version.versionNumber} is the active version — make another version active before deleting it.`,
      );

    const allKbs = await this.store.listKbs();
    const branchedChild = allKbs.find(
      (k) => k.derivedFromKbId === kbId && k.derivedFromVersionId === versionId,
    );
    if (branchedChild)
      throw new Error(
        `"${branchedChild.name}" was derived from v${version.versionNumber} — it can't be deleted.`,
      );

    await this.store.deleteKbVersion(versionId);
  }

  async listKbVersions(kbId: string): Promise<KbVersion[]> {
    return this.store.listKbVersions(kbId);
  }

  async getKbVersion(versionId: string): Promise<KbVersion | null> {
    return this.store.getKbVersion(versionId);
  }

  /** The compile a consumer should resolve against for a pinned KB version. */
  async compileForVersion(versionId: string) {
    const version = await this.store.getKbVersion(versionId);
    if (!version) throw new Error(`No KB version ${versionId}`);
    const compiled = await this.store.getCompile(version.compileId);
    if (!compiled) throw new Error(`Pinned compile ${version.compileId} is missing`);
    return compiled;
  }

  // ---- derivation (master → limited; duplicate & build on top) ---------------

  /**
   * Create a new KB by branching from a master. `includeItemIds` selects the
   * subset (default: all members). Mode `linked` shares master items (they stay
   * in sync and fork on divergence); `copied` clones them independently up
   * front. The child keeps the master's systemLabel (pairing compatibility) and
   * records the parent link that makes the hierarchy a tree.
   */
  async deriveKb(
    masterKbId: string,
    input: {
      name: string;
      description?: string;
      createdBy: string;
      includeItemIds?: string[];
      mode: "linked" | "copied";
      includePacks?: boolean;
      fromVersionId?: string;
    },
  ): Promise<KnowledgeBase> {
    const master = await this.getKb(masterKbId);
    const masterVersions = await this.store.listKbVersions(masterKbId);
    const branchedFrom = input.fromVersionId ?? masterVersions[0]?.versionId;

    const child: KnowledgeBase = {
      kbId: newId("kb"),
      name: input.name,
      description: input.description,
      systemLabel: master.systemLabel,
      levels: master.levels,
      status: "active",
      derivedFromKbId: masterKbId,
      derivedFromVersionId: branchedFrom,
      createdBy: input.createdBy,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    await this.store.putKb(child);

    const members = await this.store.listItemsForKb(masterKbId);
    const wanted = input.includeItemIds
      ? new Set(input.includeItemIds)
      : new Set(members.map((i) => i.itemId));
    const idMap = new Map<string, string>(); // master itemId → child itemId

    for (const item of members) {
      if (!wanted.has(item.itemId)) continue;
      if (input.mode === "linked") {
        await this.store.addMembership({ kbId: child.kbId, itemId: item.itemId });
        idMap.set(item.itemId, item.itemId);
      } else {
        const copy: KnowledgeItem = {
          ...item,
          itemId: newId("ki"),
          forkedFromItemId: item.itemId,
          version: 1,
          committedVersion: undefined,
          createdBy: input.createdBy,
          createdAt: this.now(),
          updatedAt: this.now(),
        };
        await this.store.putItem(copy);
        await this.store.addMembership({ kbId: child.kbId, itemId: copy.itemId });
        idMap.set(item.itemId, copy.itemId);
      }
    }

    // Copied items need their edges re-pointed; linked items already share the
    // KB-agnostic edges (edges are keyed by itemId, not by KB).
    if (input.mode === "copied") {
      const edges = await this.store.listEdgesTouching([...idMap.keys()]);
      for (const edge of edges) {
        const from = idMap.get(edge.fromItemId);
        if (!from) continue;
        const to = edge.toItemId ? idMap.get(edge.toItemId) : undefined;
        if (edge.toItemId && !to) continue; // target not in the subset
        await this.store.putEdge({
          ...edge,
          edgeId: newId("ke"),
          fromItemId: from,
          toItemId: to,
          createdAt: this.now(),
        });
      }
    }

    if (input.includePacks) {
      const packs = await this.store.listPacksForKb(masterKbId);
      const packIdMap = new Map(packs.map((p) => [p.packId, newId("pk")]));
      for (const pack of packs) {
        await this.writePackWithSnapshot(
          {
            ...pack,
            packId: packIdMap.get(pack.packId)!,
            kbId: child.kbId,
            extendsPackId: pack.extendsPackId ? packIdMap.get(pack.extendsPackId) : undefined,
            itemIds: pack.itemIds
              .map((id) => idMap.get(id))
              .filter((x): x is string => Boolean(x)),
            derivedEnvelope: undefined,
            createdAt: this.now(),
            updatedAt: this.now(),
          },
          input.createdBy,
        );
      }
    }

    await this.recompile(child.kbId);
    return this.getKb(child.kbId);
  }

  /** Duplicate a KB wholesale (independent copy) to build on top of it. */
  async duplicateKb(
    kbId: string,
    input: { name: string; description?: string; createdBy: string },
  ): Promise<KnowledgeBase> {
    return this.deriveKb(kbId, {
      name: input.name,
      description: input.description,
      createdBy: input.createdBy,
      mode: "copied",
      includePacks: true,
    });
  }

  /**
   * Governance signal for a derived KB: whether the master has published a
   * newer version than the one this KB branched from.
   */
  async derivationStatus(kbId: string): Promise<{
    derived: boolean;
    masterKbId?: string;
    branchedFromVersionId?: string;
    masterLatestVersionId?: string;
    upgradeAvailable: boolean;
  }> {
    const kb = await this.getKb(kbId);
    if (!kb.derivedFromKbId) return { derived: false, upgradeAvailable: false };
    const masterVersions = await this.store.listKbVersions(kb.derivedFromKbId);
    const latest = masterVersions[0];
    return {
      derived: true,
      masterKbId: kb.derivedFromKbId,
      branchedFromVersionId: kb.derivedFromVersionId,
      masterLatestVersionId: latest?.versionId,
      upgradeAvailable: Boolean(latest && latest.versionId !== kb.derivedFromVersionId),
    };
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

  // ---- packs (knowledge sets: auto-versioned on every save) -------------------

  /**
   * putPack + auto-snapshot (deduped against the latest snapshot). Every
   * fellow-authored pack write goes through here so history never has gaps.
   * The compiler's envelope rewrites (deriveEnvelopes) deliberately bypass it.
   */
  private async writePackWithSnapshot(pack: KbPack, actor: string): Promise<void> {
    await this.store.putPack(pack);
    const latest = (await this.store.listPackVersions(pack.packId))[0] ?? null;
    if (packIsDirty(pack, latest)) {
      await this.store.putPackVersion(
        snapshotPack(pack, (latest?.versionNumber ?? 0) + 1, actor, this.now()),
      );
    }
  }

  /** True when `startPackId`'s Includes chain reaches `targetPackId`. */
  private async includesChainReaches(
    startPackId: string,
    targetPackId: string,
  ): Promise<boolean> {
    const seen = new Set<string>();
    let cursor: string | undefined = startPackId;
    while (cursor && !seen.has(cursor)) {
      if (cursor === targetPackId) return true;
      seen.add(cursor);
      cursor = (await this.store.getPack(cursor))?.extendsPackId;
    }
    return false;
  }

  async savePack(
    pack: Omit<KbPack, "packId" | "ordinal" | "createdAt" | "updatedAt"> & {
      packId?: string;
      ordinal?: number;
    },
  ): Promise<KbPack> {
    const existing = pack.packId ? await this.store.getPack(pack.packId) : null;
    const full: KbPack = {
      ...pack,
      packId: pack.packId ?? newId("pk"),
      ordinal: pack.ordinal ?? existing?.ordinal ?? 0,
      itemIds: [...pack.itemIds].sort(),
      createdAt: existing?.createdAt ?? this.now(),
      updatedAt: this.now(),
    };
    if (full.extendsPackId) {
      if (full.extendsPackId === full.packId)
        throw new Error("A set cannot include itself.");
      const target = await this.store.getPack(full.extendsPackId);
      if (!target || target.kbId !== full.kbId)
        throw new Error("The included set no longer exists.");
      if (await this.includesChainReaches(full.extendsPackId, full.packId))
        throw new Error(`Including "${target.name}" would create a loop.`);
    }
    await this.writePackWithSnapshot(full, full.createdBy);
    await this.recompile(full.kbId);
    return full;
  }

  async listPackVersions(packId: string): Promise<KbPackVersion[]> {
    return this.store.listPackVersions(packId);
  }

  /**
   * Restore a set to a past snapshot: overlay the snapshot's content onto the
   * head and save. Sanitizes first — item ids no longer in the KB are dropped
   * (and reported), a dangling or now-cyclic Includes is cleared (and
   * reported). The save mints the next snapshot; restoring the latest state
   * dedupes to a no-op.
   */
  async restorePackVersion(
    kbId: string,
    packId: string,
    versionNumber: number,
    restoredBy: string,
  ): Promise<{ pack: KbPack; droppedItemIds: string[]; droppedInclude?: string }> {
    const pack = await this.store.getPack(packId);
    if (!pack || pack.kbId !== kbId) throw new Error(`No set ${packId} in ${kbId}`);
    const snapshot = await this.store.getPackVersion(packId, versionNumber);
    if (!snapshot) throw new Error(`No version ${versionNumber} of set ${packId}`);

    const memberIds = new Set(
      (await this.store.listMembershipsForKb(kbId)).map((m) => m.itemId),
    );
    const droppedItemIds = snapshot.itemIds.filter((id) => !memberIds.has(id));

    let includeId = snapshot.extendsPackId;
    let droppedInclude: string | undefined;
    if (includeId) {
      const target = includeId === packId ? null : await this.store.getPack(includeId);
      const cyclic = target ? await this.includesChainReaches(includeId, packId) : true;
      if (!target || target.kbId !== kbId || cyclic) {
        droppedInclude = includeId;
        includeId = undefined;
      }
    }

    const restored = await this.savePack({
      ...pack,
      name: snapshot.name,
      description: snapshot.description,
      extendsPackId: includeId,
      itemIds: snapshot.itemIds.filter((id) => memberIds.has(id)),
      intendedComplete: snapshot.intendedComplete,
      envelopeOverrides: snapshot.envelopeOverrides,
      createdBy: restoredBy,
    });
    return { pack: restored, droppedItemIds, droppedInclude };
  }

  /**
   * Everything that references a set: players carrying it (directly, or via a
   * set that includes it — tagged `via`), sets whose Includes chain reaches
   * it, and sandboxes listing it. Powers both the delete guard and the set
   * detail page's "players using this set".
   */
  async packReferences(
    kbId: string,
    packId: string,
  ): Promise<{
    players: { player: KbPlayer; via?: KbPack }[];
    extendedBy: KbPack[];
    sandboxes: KbSandbox[];
  }> {
    const packs = await this.store.listPacksForKb(kbId);
    const byId = new Map(packs.map((p) => [p.packId, p]));
    const reachesTarget = (start: string): boolean => {
      const seen = new Set<string>();
      let cursor: string | undefined = start;
      while (cursor && !seen.has(cursor)) {
        if (cursor === packId) return true;
        seen.add(cursor);
        cursor = byId.get(cursor)?.extendsPackId;
      }
      return false;
    };
    const extendedBy = packs.filter((p) => p.packId !== packId && reachesTarget(p.packId));
    const descendantIds = new Set(extendedBy.map((p) => p.packId));

    const players: { player: KbPlayer; via?: KbPack }[] = [];
    for (const player of await this.store.listPlayersForKb(kbId)) {
      if (player.enabledPackIds.includes(packId)) {
        players.push({ player });
      } else {
        const viaId = player.enabledPackIds.find((id) => descendantIds.has(id));
        if (viaId) players.push({ player, via: byId.get(viaId) });
      }
    }

    const sandboxes = (await this.store.listSandboxesForKb(kbId)).filter(
      (s) => s.basePackIds.includes(packId) || s.exposedPackIds.includes(packId),
    );
    return { players, extendedBy, sandboxes };
  }

  /**
   * Delete a set. Refuses while anything references it — players (house
   * players from the Arena are ordinary players too), sets that include it,
   * or sandboxes — naming the blockers so the fellow knows what to repoint.
   */
  async deletePack(kbId: string, packId: string): Promise<void> {
    const pack = await this.store.getPack(packId);
    if (!pack || pack.kbId !== kbId) throw new Error(`No set ${packId} in ${kbId}`);
    const refs = await this.packReferences(kbId, packId);
    const blockers: string[] = [];
    if (refs.players.length)
      blockers.push(
        `player${refs.players.length === 1 ? "" : "s"} ${refs.players
          .map((p) => `"${p.player.name}"`)
          .join(", ")} carr${refs.players.length === 1 ? "ies" : "y"} it`,
      );
    if (refs.extendedBy.length)
      blockers.push(
        `set${refs.extendedBy.length === 1 ? "" : "s"} ${refs.extendedBy
          .map((p) => `"${p.name}"`)
          .join(", ")} include${refs.extendedBy.length === 1 ? "s" : ""} it`,
      );
    if (refs.sandboxes.length)
      blockers.push(
        `sandbox${refs.sandboxes.length === 1 ? "" : "es"} ${refs.sandboxes
          .map((s) => `"${s.name}"`)
          .join(", ")} expose${refs.sandboxes.length === 1 ? "s" : ""} it`,
      );
    if (blockers.length)
      throw new Error(
        `Cannot delete "${pack.name}": ${blockers.join("; ")}. Repoint or delete them first.`,
      );
    await this.store.deletePackVersionsForPack(packId);
    await this.store.deletePack(packId);
    await this.recompile(kbId);
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
    await this.deriveEnvelopes(compiled, packs);
    return { compiled };
  }

  /**
   * Spec §5: after each good compile, derive every pack's dealing envelope —
   * the capability gaps a probe player carrying just that pack would have.
   * Fellows read and tighten it; the CLOSED LOOP (zero-floor simulation with
   * the actual configs) is what dealing actually enforces.
   */
  private async deriveEnvelopes(compiled: CompiledKb, packs: KbPack[]): Promise<void> {
    for (const pack of packs) {
      const probe = {
        playerId: "probe",
        kbId: compiled.kbId,
        name: "probe",
        enabledPackIds: [pack.packId],
        settingOverrides: {},
        decisionPolicyId: "first_match" as const,
        fallbackPolicyId: "standard" as const,
        validationStatus: "draft" as const,
        ownerType: "system" as const,
        version: 1,
        createdAt: this.now(),
        updatedAt: this.now(),
      };
      const report = validatePlayerStatic(compiled, probe);
      const missing = report.static.filter((r) => !r.ok);
      const derived = {
        requireZeroFloorEvents: true,
        summary: missing.length
          ? `Incomplete: no coverage for ${missing.map((m) => m.categoryId).join(", ")}. ` +
            "Deals are accepted only when a full simulation with the actual players finishes with zero engine-floor events."
          : "Complete on its own — any deal is safe.",
      };
      if (JSON.stringify(pack.derivedEnvelope) !== JSON.stringify(derived)) {
        await this.store.putPack({ ...pack, derivedEnvelope: derived });
      }
    }
    return;
  }
}
