// ProfileStore over db/migrations/0003 (+0005 bridge_teaching_scopes).

import type { BridgeAiPlayerProfile, ProfileStore, TeachingScopeRecord } from "@bridge/profiles";
import type { SupabaseClient } from "@supabase/supabase-js";
import { check } from "./client";

/* eslint-disable @typescript-eslint/no-explicit-any */

const rowToProfile = (r: any): BridgeAiPlayerProfile => ({
  aiPlayerProfileId: r.ai_player_profile_id, name: r.name,
  description: r.description ?? undefined, ownerType: r.owner_type,
  ownerId: r.owner_id ?? undefined,
  programOrganizationId: r.program_organization_id ?? undefined,
  packageRef: { packageId: r.package_id, version: r.package_version },
  selectedPresetId: r.selected_preset_id ?? undefined,
  valueOverrides: r.value_overrides ?? {}, resolvedValueHash: r.resolved_value_hash,
  status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
});

const rowToScope = (r: any): TeachingScopeRecord => ({
  teachingScopeId: r.teaching_scope_id, name: r.name,
  description: r.description ?? undefined, ownerType: r.owner_type,
  ownerId: r.owner_id ?? undefined,
  programOrganizationId: r.program_organization_id ?? undefined,
  derivedFromItemId: r.derived_from_item_id ?? undefined,
  evaluatorFilter: r.evaluator_filter, targetConceptIds: r.target_concept_ids ?? [],
  createdAt: r.created_at, updatedAt: r.updated_at,
});

export class PgProfileStore implements ProfileStore {
  constructor(private readonly db: SupabaseClient) {}

  async list() {
    return check(await this.db.from("bridge_ai_player_profiles").select("*").order("created_at"), "profiles.list").map(rowToProfile);
  }
  async get(id: string) {
    const rows = check(await this.db.from("bridge_ai_player_profiles").select("*").eq("ai_player_profile_id", id), "profiles.get");
    return rows.length ? rowToProfile(rows[0]) : null;
  }
  async save(p: BridgeAiPlayerProfile) {
    check(await this.db.from("bridge_ai_player_profiles").upsert({
      ai_player_profile_id: p.aiPlayerProfileId, name: p.name,
      description: p.description ?? null, owner_type: p.ownerType,
      owner_id: p.ownerId ?? null, program_organization_id: p.programOrganizationId ?? null,
      package_id: p.packageRef.packageId, package_version: p.packageRef.version,
      selected_preset_id: p.selectedPresetId ?? null, value_overrides: p.valueOverrides,
      resolved_value_hash: p.resolvedValueHash, status: p.status,
      created_at: p.createdAt, updated_at: p.updatedAt,
    }, { onConflict: "ai_player_profile_id" }), "profiles.save");
  }

  async listScopes() {
    return check(await this.db.from("bridge_teaching_scopes").select("*").order("created_at"), "scopes.list").map(rowToScope);
  }
  async getScope(id: string) {
    const rows = check(await this.db.from("bridge_teaching_scopes").select("*").eq("teaching_scope_id", id), "scopes.get");
    return rows.length ? rowToScope(rows[0]) : null;
  }
  async saveScope(s: TeachingScopeRecord) {
    check(await this.db.from("bridge_teaching_scopes").upsert({
      teaching_scope_id: s.teachingScopeId, name: s.name,
      description: s.description ?? null, owner_type: s.ownerType,
      owner_id: s.ownerId ?? null, program_organization_id: s.programOrganizationId ?? null,
      derived_from_item_id: s.derivedFromItemId ?? null,
      evaluator_filter: s.evaluatorFilter, target_concept_ids: s.targetConceptIds,
      created_at: s.createdAt, updated_at: s.updatedAt,
    }, { onConflict: "teaching_scope_id" }), "scopes.save");
  }
}
