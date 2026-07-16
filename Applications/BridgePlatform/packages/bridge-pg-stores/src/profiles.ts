// ProfileStore (identity layer) over the KEPT tables: bridge_user_profiles
// (0002/0012), bridge_program_organization_profiles + bridge_coach_affiliations
// (0010). These survive the knowledge-rework wipe (spec decision 18).

import type {
  BridgeCoachAffiliation,
  BridgeProgramOrganizationProfile,
  BridgeUserProfile,
  ProfileStore,
} from "@bridge/profiles";
import type { SupabaseClient } from "@supabase/supabase-js";
import { check } from "./client";

/* eslint-disable @typescript-eslint/no-explicit-any */

export class PgProfileStore implements ProfileStore {
  constructor(private readonly db: SupabaseClient) {}

  async getUserProfile(nexusUserId: string) {
    const rows = check(
      await this.db.from("bridge_user_profiles").select("*").eq("nexus_user_id", nexusUserId),
      "userProfiles.get",
    );
    if (!rows.length) return null;
    const r = rows[0] as any;
    return {
      nexusUserId: r.nexus_user_id,
      displayNameAtTable: r.display_name_at_table ?? undefined,
      preferredSeat: r.preferred_seat ?? undefined,
      preferredFeedbackMode: r.preferred_feedback_mode ?? undefined,
      activeProgramOrganizationId: r.active_program_organization_id ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    } as BridgeUserProfile;
  }

  async saveUserProfile(p: BridgeUserProfile) {
    check(
      await this.db.from("bridge_user_profiles").upsert(
        {
          nexus_user_id: p.nexusUserId,
          display_name_at_table: p.displayNameAtTable ?? null,
          preferred_seat: p.preferredSeat ?? null,
          preferred_feedback_mode: p.preferredFeedbackMode ?? null,
          active_program_organization_id: p.activeProgramOrganizationId ?? null,
          created_at: p.createdAt,
          updated_at: p.updatedAt,
        },
        { onConflict: "nexus_user_id" },
      ),
      "userProfiles.save",
    );
  }

  async getOrgProfile(programOrganizationId: string) {
    const rows = check(
      await this.db
        .from("bridge_program_organization_profiles")
        .select("*")
        .eq("program_organization_id", programOrganizationId),
      "orgProfiles.get",
    );
    if (!rows.length) return null;
    const r = rows[0] as any;
    return {
      programOrganizationId: r.program_organization_id,
      bridgeOrgType: r.bridge_org_type,
      allowedBiddingSystems: r.allowed_bidding_systems ?? [],
      defaultLearnerLevel: r.default_learner_level ?? undefined,
      defaultConventionProfileId: r.default_convention_profile_id ?? undefined,
      allowBenPlayers: r.allow_ben_players,
      allowAiPlayers: r.allow_ai_players,
      updatedBy: r.updated_by,
      updatedAt: r.updated_at,
    } as BridgeProgramOrganizationProfile;
  }

  async saveOrgProfile(p: BridgeProgramOrganizationProfile) {
    check(
      await this.db.from("bridge_program_organization_profiles").upsert(
        {
          program_organization_id: p.programOrganizationId,
          bridge_org_type: p.bridgeOrgType,
          allowed_bidding_systems: p.allowedBiddingSystems,
          default_learner_level: p.defaultLearnerLevel ?? null,
          default_convention_profile_id: p.defaultConventionProfileId ?? null,
          allow_ben_players: p.allowBenPlayers,
          allow_ai_players: p.allowAiPlayers,
          updated_by: p.updatedBy,
          updated_at: p.updatedAt,
        },
        { onConflict: "program_organization_id" },
      ),
      "orgProfiles.save",
    );
  }

  async listAffiliations(nexusUserId: string) {
    const rows = check(
      await this.db.from("bridge_coach_affiliations").select("*").eq("nexus_user_id", nexusUserId),
      "affiliations.list",
    );
    return rows.map(
      (r: any): BridgeCoachAffiliation => ({
        coachAffiliationId: r.coach_affiliation_id,
        nexusUserId: r.nexus_user_id,
        programOrganizationId: r.program_organization_id ?? undefined,
        groupId: r.group_id ?? undefined,
        affiliationType: r.affiliation_type,
        status: r.status,
        createdAt: r.created_at,
      }),
    );
  }

  async saveAffiliation(a: BridgeCoachAffiliation) {
    check(
      await this.db.from("bridge_coach_affiliations").upsert(
        {
          coach_affiliation_id: a.coachAffiliationId,
          nexus_user_id: a.nexusUserId,
          program_organization_id: a.programOrganizationId ?? null,
          group_id: a.groupId ?? null,
          affiliation_type: a.affiliationType,
          status: a.status,
          created_at: a.createdAt,
        },
        { onConflict: "coach_affiliation_id" },
      ),
      "affiliations.save",
    );
  }
}
