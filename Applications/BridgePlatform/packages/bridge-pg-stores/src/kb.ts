// KbStore over the 0013 schema. Jsonb-primary (the 0011 hybrid pattern):
// scalar columns exist only for identity/tenant filtering; the full record
// round-trips through the `record`/`artifact` jsonb column, so this store
// stays thin and the TS model in @bridge/kb is the single source of shape.

import type {
  CompiledKb,
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
  KbStore,
  KbSuggestion,
  KbVersion,
  KnowledgeBase,
  KnowledgeItem,
  KnowledgeItemVersion,
} from "@bridge/kb";
import type { SupabaseClient } from "@supabase/supabase-js";
import { check } from "./client";

/* eslint-disable @typescript-eslint/no-explicit-any */

const records = <T>(rows: any[]): T[] => rows.map((r) => r.record as T);

export class PgKbStore implements KbStore {
  constructor(private readonly db: SupabaseClient) {}

  // ---- knowledge bases -----------------------------------------------------

  async putKb(kb: KnowledgeBase) {
    check(
      await this.db
        .from("bridge_kbs")
        .upsert({ kb_id: kb.kbId, record: kb, updated_at: kb.updatedAt }, { onConflict: "kb_id" }),
      "kbs.put",
    );
  }
  async getKb(kbId: string) {
    const rows = check(await this.db.from("bridge_kbs").select("record").eq("kb_id", kbId), "kbs.get");
    return rows.length ? (rows[0] as any).record as KnowledgeBase : null;
  }
  async listKbs() {
    const rows = check(await this.db.from("bridge_kbs").select("record"), "kbs.list");
    return records<KnowledgeBase>(rows).sort((a, b) => a.name.localeCompare(b.name));
  }
  async deleteKb(kbId: string) {
    check(await this.db.from("bridge_kbs").delete().eq("kb_id", kbId), "kbs.delete");
  }

  // ---- items + memberships ---------------------------------------------------

  async putItem(item: KnowledgeItem) {
    check(
      await this.db
        .from("bridge_kb_items")
        .upsert(
          { item_id: item.itemId, record: item, updated_at: item.updatedAt },
          { onConflict: "item_id" },
        ),
      "items.put",
    );
  }
  async getItem(itemId: string) {
    const rows = check(
      await this.db.from("bridge_kb_items").select("record").eq("item_id", itemId),
      "items.get",
    );
    return rows.length ? (rows[0] as any).record as KnowledgeItem : null;
  }
  async getItems(itemIds: string[]) {
    if (!itemIds.length) return [];
    const rows = check(
      await this.db.from("bridge_kb_items").select("record").in("item_id", itemIds),
      "items.getMany",
    );
    return records<KnowledgeItem>(rows);
  }
  async listItemsForKb(kbId: string) {
    const ms = check(
      await this.db.from("bridge_kb_memberships").select("item_id").eq("kb_id", kbId),
      "memberships.forKb",
    );
    return this.getItems(ms.map((m: any) => m.item_id));
  }
  async deleteItem(itemId: string) {
    check(await this.db.from("bridge_kb_items").delete().eq("item_id", itemId), "items.delete");
  }
  async addMembership(m: KbMembership) {
    check(
      await this.db
        .from("bridge_kb_memberships")
        .upsert({ kb_id: m.kbId, item_id: m.itemId }, { onConflict: "kb_id,item_id" }),
      "memberships.add",
    );
  }
  async removeMembership(m: KbMembership) {
    check(
      await this.db
        .from("bridge_kb_memberships")
        .delete()
        .eq("kb_id", m.kbId)
        .eq("item_id", m.itemId),
      "memberships.remove",
    );
  }
  async listMembershipsForItem(itemId: string) {
    const rows = check(
      await this.db.from("bridge_kb_memberships").select("*").eq("item_id", itemId),
      "memberships.forItem",
    );
    return rows.map((r: any): KbMembership => ({ kbId: r.kb_id, itemId: r.item_id }));
  }
  async listMembershipsForKb(kbId: string) {
    const rows = check(
      await this.db.from("bridge_kb_memberships").select("*").eq("kb_id", kbId),
      "memberships.forKbList",
    );
    return rows.map((r: any): KbMembership => ({ kbId: r.kb_id, itemId: r.item_id }));
  }

  // ---- item versions (immutable snapshots) -----------------------------------

  async putItemVersion(v: KnowledgeItemVersion) {
    check(
      await this.db.from("bridge_kb_item_versions").upsert(
        {
          item_id: v.itemId,
          version_number: v.versionNumber,
          record: v,
          committed_at: v.committedAt,
        },
        { onConflict: "item_id,version_number" },
      ),
      "itemVersions.put",
    );
  }
  async getItemVersion(itemId: string, versionNumber: number) {
    const rows = check(
      await this.db
        .from("bridge_kb_item_versions")
        .select("record")
        .eq("item_id", itemId)
        .eq("version_number", versionNumber),
      "itemVersions.get",
    );
    return rows.length ? ((rows[0] as any).record as KnowledgeItemVersion) : null;
  }
  async listItemVersions(itemId: string) {
    const rows = check(
      await this.db
        .from("bridge_kb_item_versions")
        .select("record")
        .eq("item_id", itemId)
        .order("version_number", { ascending: false }),
      "itemVersions.list",
    );
    return records<KnowledgeItemVersion>(rows);
  }
  async deleteItemVersion(itemId: string, versionNumber: number) {
    check(
      await this.db
        .from("bridge_kb_item_versions")
        .delete()
        .eq("item_id", itemId)
        .eq("version_number", versionNumber),
      "itemVersions.delete",
    );
  }
  async deleteItemVersionsForItem(itemId: string) {
    check(
      await this.db.from("bridge_kb_item_versions").delete().eq("item_id", itemId),
      "itemVersions.deleteForItem",
    );
  }

  // ---- KB versions (releases) ------------------------------------------------

  async putKbVersion(v: KbVersion) {
    check(
      await this.db.from("bridge_kb_versions").upsert(
        {
          version_id: v.versionId,
          kb_id: v.kbId,
          version_number: v.versionNumber,
          record: v,
          published_at: v.publishedAt,
        },
        { onConflict: "version_id" },
      ),
      "kbVersions.put",
    );
  }
  async getKbVersion(versionId: string) {
    const rows = check(
      await this.db.from("bridge_kb_versions").select("record").eq("version_id", versionId),
      "kbVersions.get",
    );
    return rows.length ? ((rows[0] as any).record as KbVersion) : null;
  }
  async listKbVersions(kbId: string) {
    const rows = check(
      await this.db
        .from("bridge_kb_versions")
        .select("record")
        .eq("kb_id", kbId)
        .order("version_number", { ascending: false }),
      "kbVersions.list",
    );
    return records<KbVersion>(rows);
  }
  async deleteKbVersion(versionId: string) {
    check(
      await this.db.from("bridge_kb_versions").delete().eq("version_id", versionId),
      "kbVersions.delete",
    );
  }
  async deleteKbVersionsForKb(kbId: string) {
    check(
      await this.db.from("bridge_kb_versions").delete().eq("kb_id", kbId),
      "kbVersions.deleteForKb",
    );
  }

  // ---- edges -----------------------------------------------------------------

  async putEdge(edge: KbEdge) {
    check(
      await this.db.from("bridge_kb_edges").upsert(
        {
          edge_id: edge.edgeId,
          from_item_id: edge.fromItemId,
          to_item_id: edge.toItemId ?? null,
          record: edge,
        },
        { onConflict: "edge_id" },
      ),
      "edges.put",
    );
  }
  async deleteEdge(edgeId: string) {
    check(await this.db.from("bridge_kb_edges").delete().eq("edge_id", edgeId), "edges.delete");
  }
  async listEdgesTouching(itemIds: string[]) {
    if (!itemIds.length) return [];
    const list = `(${itemIds.map((i) => `"${i}"`).join(",")})`;
    const rows = check(
      await this.db
        .from("bridge_kb_edges")
        .select("record")
        .or(`from_item_id.in.${list},to_item_id.in.${list}`),
      "edges.touching",
    );
    return records<KbEdge>(rows);
  }

  // ---- packs -----------------------------------------------------------------

  async putPack(pack: KbPack) {
    check(
      await this.db.from("bridge_kb_packs").upsert(
        { pack_id: pack.packId, kb_id: pack.kbId, record: pack, updated_at: pack.updatedAt },
        { onConflict: "pack_id" },
      ),
      "packs.put",
    );
  }
  async getPack(packId: string) {
    const rows = check(
      await this.db.from("bridge_kb_packs").select("record").eq("pack_id", packId),
      "packs.get",
    );
    return rows.length ? (rows[0] as any).record as KbPack : null;
  }
  async listPacksForKb(kbId: string) {
    const rows = check(
      await this.db.from("bridge_kb_packs").select("record").eq("kb_id", kbId),
      "packs.forKb",
    );
    return records<KbPack>(rows).sort((a, b) => a.ordinal - b.ordinal);
  }
  async deletePack(packId: string) {
    check(await this.db.from("bridge_kb_packs").delete().eq("pack_id", packId), "packs.delete");
  }

  // ---- pack versions (auto snapshots) -----------------------------------------

  async putPackVersion(v: KbPackVersion) {
    check(
      await this.db.from("bridge_kb_pack_versions").upsert(
        {
          pack_id: v.packId,
          version_number: v.versionNumber,
          kb_id: v.kbId,
          record: v,
          saved_at: v.savedAt,
        },
        { onConflict: "pack_id,version_number" },
      ),
      "packVersions.put",
    );
  }
  async getPackVersion(packId: string, versionNumber: number) {
    const rows = check(
      await this.db
        .from("bridge_kb_pack_versions")
        .select("record")
        .eq("pack_id", packId)
        .eq("version_number", versionNumber),
      "packVersions.get",
    );
    return rows.length ? ((rows[0] as any).record as KbPackVersion) : null;
  }
  async listPackVersions(packId: string) {
    const rows = check(
      await this.db
        .from("bridge_kb_pack_versions")
        .select("record")
        .eq("pack_id", packId)
        .order("version_number", { ascending: false }),
      "packVersions.list",
    );
    return records<KbPackVersion>(rows);
  }
  async deletePackVersionsForPack(packId: string) {
    check(
      await this.db.from("bridge_kb_pack_versions").delete().eq("pack_id", packId),
      "packVersions.deleteForPack",
    );
  }

  // ---- players & sandboxes -----------------------------------------------------

  async putPlayer(player: KbPlayer) {
    check(
      await this.db.from("bridge_kb_players").upsert(
        {
          player_id: player.playerId,
          kb_id: player.kbId,
          record: player,
          updated_at: player.updatedAt,
        },
        { onConflict: "player_id" },
      ),
      "players.put",
    );
  }
  async getPlayer(playerId: string) {
    const rows = check(
      await this.db.from("bridge_kb_players").select("record").eq("player_id", playerId),
      "players.get",
    );
    return rows.length ? (rows[0] as any).record as KbPlayer : null;
  }
  async listPlayersForKb(kbId: string) {
    const rows = check(
      await this.db.from("bridge_kb_players").select("record").eq("kb_id", kbId),
      "players.forKb",
    );
    return records<KbPlayer>(rows);
  }
  async listPlayers() {
    const rows = check(await this.db.from("bridge_kb_players").select("record"), "players.list");
    return records<KbPlayer>(rows);
  }
  async deletePlayer(playerId: string) {
    check(
      await this.db.from("bridge_kb_players").delete().eq("player_id", playerId),
      "players.delete",
    );
  }
  async putSandbox(sandbox: KbSandbox) {
    check(
      await this.db.from("bridge_kb_sandboxes").upsert(
        {
          sandbox_id: sandbox.sandboxId,
          kb_id: sandbox.kbId,
          record: sandbox,
          updated_at: sandbox.updatedAt,
        },
        { onConflict: "sandbox_id" },
      ),
      "sandboxes.put",
    );
  }
  async getSandbox(sandboxId: string) {
    const rows = check(
      await this.db.from("bridge_kb_sandboxes").select("record").eq("sandbox_id", sandboxId),
      "sandboxes.get",
    );
    return rows.length ? (rows[0] as any).record as KbSandbox : null;
  }
  async listSandboxesForKb(kbId: string) {
    const rows = check(
      await this.db.from("bridge_kb_sandboxes").select("record").eq("kb_id", kbId),
      "sandboxes.forKb",
    );
    return records<KbSandbox>(rows);
  }
  async deleteSandbox(sandboxId: string) {
    check(
      await this.db.from("bridge_kb_sandboxes").delete().eq("sandbox_id", sandboxId),
      "sandboxes.delete",
    );
  }

  // ---- suggestions -------------------------------------------------------------

  async putSuggestion(s: KbSuggestion) {
    check(
      await this.db.from("bridge_kb_suggestions").upsert(
        {
          suggestion_id: s.suggestionId,
          kb_id: s.kbId,
          record: s,
          created_at: s.createdAt,
        },
        { onConflict: "suggestion_id" },
      ),
      "suggestions.put",
    );
  }
  async getSuggestion(suggestionId: string) {
    const rows = check(
      await this.db
        .from("bridge_kb_suggestions")
        .select("record")
        .eq("suggestion_id", suggestionId),
      "suggestions.get",
    );
    return rows.length ? (rows[0] as any).record as KbSuggestion : null;
  }
  async listSuggestionsForKb(kbId: string) {
    const rows = check(
      await this.db
        .from("bridge_kb_suggestions")
        .select("record")
        .eq("kb_id", kbId)
        .order("created_at", { ascending: false }),
      "suggestions.forKb",
    );
    return records<KbSuggestion>(rows);
  }
  async deleteSuggestion(suggestionId: string) {
    check(
      await this.db.from("bridge_kb_suggestions").delete().eq("suggestion_id", suggestionId),
      "suggestions.delete",
    );
  }

  // ---- sources -------------------------------------------------------------------

  async putSource(source: KbSource) {
    check(
      await this.db
        .from("bridge_kb_sources")
        .upsert({ source_id: source.sourceId, record: source }, { onConflict: "source_id" }),
      "sources.put",
    );
  }
  async getSource(sourceId: string) {
    const rows = check(
      await this.db.from("bridge_kb_sources").select("record").eq("source_id", sourceId),
      "sources.get",
    );
    return rows.length ? (rows[0] as any).record as KbSource : null;
  }
  async listSources() {
    const rows = check(await this.db.from("bridge_kb_sources").select("record"), "sources.list");
    return records<KbSource>(rows).sort((a, b) => a.title.localeCompare(b.title));
  }
  async putDocument(doc: KbSourceDocument) {
    check(
      await this.db
        .from("bridge_kb_documents")
        .upsert({ source_id: doc.sourceId, record: doc }, { onConflict: "source_id" }),
      "documents.put",
    );
  }
  async getDocument(sourceId: string) {
    const rows = check(
      await this.db.from("bridge_kb_documents").select("record").eq("source_id", sourceId),
      "documents.get",
    );
    return rows.length ? (rows[0] as any).record as KbSourceDocument : null;
  }
  async replacePassages(sourceId: string, passages: KbSourcePassage[]) {
    check(
      await this.db.from("bridge_kb_passages").delete().eq("source_id", sourceId),
      "passages.clear",
    );
    if (passages.length) {
      check(
        await this.db.from("bridge_kb_passages").insert(
          passages.map((p) => ({
            passage_id: p.passageId,
            source_id: p.sourceId,
            ordinal: p.ordinal,
            record: p,
          })),
        ),
        "passages.insert",
      );
    }
  }
  async listPassages(sourceId: string) {
    const rows = check(
      await this.db
        .from("bridge_kb_passages")
        .select("record")
        .eq("source_id", sourceId)
        .order("ordinal"),
      "passages.list",
    );
    return records<KbSourcePassage>(rows);
  }

  // ---- extraction jobs --------------------------------------------------------------

  async putJob(job: KbExtractionJob) {
    check(
      await this.db.from("bridge_kb_jobs").upsert(
        {
          job_id: job.jobId,
          kb_id: job.kbId,
          source_id: job.sourceId,
          record: job,
          created_at: job.createdAt,
        },
        { onConflict: "job_id" },
      ),
      "jobs.put",
    );
  }
  async getJob(jobId: string) {
    const rows = check(
      await this.db.from("bridge_kb_jobs").select("record").eq("job_id", jobId),
      "jobs.get",
    );
    return rows.length ? (rows[0] as any).record as KbExtractionJob : null;
  }
  async listJobsForKb(kbId: string) {
    const rows = check(
      await this.db
        .from("bridge_kb_jobs")
        .select("record")
        .eq("kb_id", kbId)
        .order("created_at", { ascending: false }),
      "jobs.forKb",
    );
    return records<KbExtractionJob>(rows);
  }
  async deleteJob(jobId: string) {
    check(await this.db.from("bridge_kb_jobs").delete().eq("job_id", jobId), "jobs.delete");
  }

  // ---- compiles ------------------------------------------------------------------------

  async putCompile(compile: CompiledKb) {
    check(
      await this.db.from("bridge_kb_compiles").upsert(
        {
          compile_id: compile.compileId,
          kb_id: compile.kbId,
          version: compile.version,
          artifact: compile,
          compiled_at: compile.compiledAt,
        },
        { onConflict: "compile_id" },
      ),
      "compiles.put",
    );
  }
  async getCompile(compileId: string) {
    const rows = check(
      await this.db.from("bridge_kb_compiles").select("artifact").eq("compile_id", compileId),
      "compiles.get",
    );
    return rows.length ? (rows[0] as any).artifact as CompiledKb : null;
  }
  async listCompilesForKb(kbId: string, limit = 20) {
    const rows = check(
      await this.db
        .from("bridge_kb_compiles")
        .select("artifact")
        .eq("kb_id", kbId)
        .order("version", { ascending: false })
        .limit(limit),
      "compiles.forKb",
    );
    return rows.map((r: any) => r.artifact as CompiledKb);
  }
  async deleteCompilesForKb(kbId: string) {
    check(
      await this.db.from("bridge_kb_compiles").delete().eq("kb_id", kbId),
      "compiles.deleteForKb",
    );
  }
}
