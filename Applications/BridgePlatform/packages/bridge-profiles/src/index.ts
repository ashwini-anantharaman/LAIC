/**
 * @bridge/profiles — the surviving IDENTITY layer (Knowledge Rework
 * decision 18): per-user table preferences, the bridge-owned org profile
 * (§3.4), and coach affiliations with explicit context switching (§3.5).
 *
 * AI player profiles, sandboxes, and teaching scopes were rebuilt on the
 * knowledge-base model and live in @bridge/kb (players/sandboxes) from
 * Stage E of the rework.
 */

import type { NexusBridgeContext } from "@laic/learner-contracts";

// ---------------------------------------------------------------------------
// Per-user table profile
// ---------------------------------------------------------------------------

export type FeedbackMode = "full_trace" | "hints_only" | "minimal";

export interface BridgeUserProfile {
  nexusUserId: string;
  displayNameAtTable?: string;
  preferredSeat?: "N" | "E" | "S" | "W";
  preferredFeedbackMode?: FeedbackMode;
  /**
   * §3.5 explicit context switching: a coach affiliated with several orgs
   * picks which one they are acting for; getBridgeContext applies it only
   * when an ACTIVE affiliation to that org exists.
   */
  activeProgramOrganizationId?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Org model (§3.4-3.5): bridge-owned extension of a Nexus program
// organization + many-to-many coach affiliations.
// ---------------------------------------------------------------------------

export type BridgeOrgType =
  | "acbl_like_partner"
  | "bridge_club"
  | "coach_organization"
  | "independent_coach_group"
  | "class_group"
  | "pilot_partner";

export interface BridgeProgramOrganizationProfile {
  programOrganizationId: string;
  bridgeOrgType: BridgeOrgType;
  /**
   * Knowledge bases this org teaches/allows (empty = all). Pre-rework this
   * held system-family strings; it now holds kbIds (spec Stage G wires the
   * enforcement at session creation).
   */
  allowedBiddingSystems: string[];
  defaultLearnerLevel?: string;
  defaultConventionProfileId?: string;
  /** BEN seats stay off until the BEN adapter ships (deferred 2026-07-12). */
  allowBenPlayers: boolean;
  allowAiPlayers: boolean;
  updatedBy: string;
  updatedAt: string;
}

export type AffiliationType =
  | "independent"
  | "organization_coach"
  | "club_coach"
  | "class_coach"
  | "reviewer"
  | "fellow";

export interface BridgeCoachAffiliation {
  coachAffiliationId: string;
  nexusUserId: string;
  programOrganizationId?: string;
  groupId?: string;
  affiliationType: AffiliationType;
  status: "active" | "pending" | "inactive";
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Store seam
// ---------------------------------------------------------------------------

export interface ProfileStoreData {
  userProfiles: BridgeUserProfile[];
  orgProfiles: BridgeProgramOrganizationProfile[];
  affiliations: BridgeCoachAffiliation[];
}

export function emptyProfileStoreData(): ProfileStoreData {
  return { userProfiles: [], orgProfiles: [], affiliations: [] };
}

export interface ProfileStore {
  getUserProfile(nexusUserId: string): Promise<BridgeUserProfile | null>;
  saveUserProfile(profile: BridgeUserProfile): Promise<void>;
  getOrgProfile(programOrganizationId: string): Promise<BridgeProgramOrganizationProfile | null>;
  saveOrgProfile(profile: BridgeProgramOrganizationProfile): Promise<void>;
  listAffiliations(nexusUserId: string): Promise<BridgeCoachAffiliation[]>;
  saveAffiliation(affiliation: BridgeCoachAffiliation): Promise<void>;
}

export class InMemoryProfileStore implements ProfileStore {
  constructor(protected data: ProfileStoreData = emptyProfileStoreData()) {}

  protected persist(): void {
    // In-memory: nothing to do. File store overrides.
  }

  async getUserProfile(nexusUserId: string) {
    return this.data.userProfiles.find((p) => p.nexusUserId === nexusUserId) ?? null;
  }
  async saveUserProfile(profile: BridgeUserProfile) {
    const i = this.data.userProfiles.findIndex((p) => p.nexusUserId === profile.nexusUserId);
    if (i >= 0) this.data.userProfiles[i] = profile;
    else this.data.userProfiles.push(profile);
    this.persist();
  }

  async getOrgProfile(programOrganizationId: string) {
    return (
      this.data.orgProfiles.find((p) => p.programOrganizationId === programOrganizationId) ?? null
    );
  }
  async saveOrgProfile(profile: BridgeProgramOrganizationProfile) {
    const i = this.data.orgProfiles.findIndex(
      (p) => p.programOrganizationId === profile.programOrganizationId,
    );
    if (i >= 0) this.data.orgProfiles[i] = profile;
    else this.data.orgProfiles.push(profile);
    this.persist();
  }

  async listAffiliations(nexusUserId: string) {
    return this.data.affiliations.filter((a) => a.nexusUserId === nexusUserId);
  }
  async saveAffiliation(affiliation: BridgeCoachAffiliation) {
    const i = this.data.affiliations.findIndex(
      (a) => a.coachAffiliationId === affiliation.coachAffiliationId,
    );
    if (i >= 0) this.data.affiliations[i] = affiliation;
    else this.data.affiliations.push(affiliation);
    this.persist();
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface ProfileServiceOptions {
  now?: () => string;
  newId?: () => string;
}

export class ProfileService {
  private readonly now: () => string;
  private readonly newId: () => string;

  constructor(
    private readonly store: ProfileStore,
    options: ProfileServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.newId =
      options.newId ?? (() => `aff_${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`);
  }

  async getUserProfile(ctx: NexusBridgeContext): Promise<BridgeUserProfile | null> {
    return this.store.getUserProfile(ctx.nexusUserId);
  }

  async saveUserProfile(
    ctx: NexusBridgeContext,
    changes: Partial<
      Pick<BridgeUserProfile, "displayNameAtTable" | "preferredSeat" | "preferredFeedbackMode">
    >,
  ): Promise<BridgeUserProfile> {
    const existing = await this.store.getUserProfile(ctx.nexusUserId);
    const profile: BridgeUserProfile = {
      nexusUserId: ctx.nexusUserId,
      createdAt: existing?.createdAt ?? this.now(),
      ...existing,
      ...changes,
      updatedAt: this.now(),
    };
    await this.store.saveUserProfile(profile);
    return profile;
  }

  /** The caller's org's bridge profile (§3.4); null when none configured. */
  async getOrgProfile(ctx: NexusBridgeContext): Promise<BridgeProgramOrganizationProfile | null> {
    if (!ctx.programOrganizationId) return null;
    return this.store.getOrgProfile(ctx.programOrganizationId);
  }

  /** Org admins (bridge.org.manage) configure their own org's profile. */
  async saveOrgProfile(
    ctx: NexusBridgeContext,
    changes: Partial<
      Pick<
        BridgeProgramOrganizationProfile,
        | "bridgeOrgType"
        | "allowedBiddingSystems"
        | "defaultLearnerLevel"
        | "allowBenPlayers"
        | "allowAiPlayers"
      >
    >,
  ): Promise<BridgeProgramOrganizationProfile> {
    if (!ctx.programOrganizationId)
      throw new Error("No program organization in context — org profile is org-scoped");
    if (!ctx.permissions.includes("bridge.org.manage"))
      throw new Error("Missing permission: bridge.org.manage");
    const existing = await this.store.getOrgProfile(ctx.programOrganizationId);
    const profile: BridgeProgramOrganizationProfile = {
      programOrganizationId: ctx.programOrganizationId,
      bridgeOrgType: "bridge_club",
      allowedBiddingSystems: [],
      allowBenPlayers: false,
      allowAiPlayers: true,
      ...existing,
      ...changes,
      updatedBy: ctx.nexusUserId,
      updatedAt: this.now(),
    };
    await this.store.saveOrgProfile(profile);
    return profile;
  }

  async listMyAffiliations(ctx: NexusBridgeContext): Promise<BridgeCoachAffiliation[]> {
    return this.store.listAffiliations(ctx.nexusUserId);
  }

  /** Self-service affiliation declaration; lands PENDING unless the caller
   *  administers the target org (org confirmation is the §3.5 trust step). */
  async addAffiliation(
    ctx: NexusBridgeContext,
    input: { programOrganizationId?: string; groupId?: string; affiliationType: AffiliationType },
  ): Promise<BridgeCoachAffiliation> {
    const selfAdministered =
      ctx.permissions.includes("bridge.org.manage") &&
      ctx.programOrganizationId === input.programOrganizationId;
    const affiliation: BridgeCoachAffiliation = {
      coachAffiliationId: this.newId(),
      nexusUserId: ctx.nexusUserId,
      programOrganizationId: input.programOrganizationId,
      groupId: input.groupId,
      affiliationType: input.affiliationType,
      status: selfAdministered || input.affiliationType === "independent" ? "active" : "pending",
      createdAt: this.now(),
    };
    await this.store.saveAffiliation(affiliation);
    return affiliation;
  }

  /**
   * §3.5 explicit context switch: only orgs the coach holds an ACTIVE
   * affiliation to are valid targets; empty clears back to the Nexus default.
   */
  async switchActiveOrg(
    ctx: NexusBridgeContext,
    programOrganizationId: string | null,
  ): Promise<void> {
    if (programOrganizationId) {
      const affiliations = await this.store.listAffiliations(ctx.nexusUserId);
      const ok = affiliations.some(
        (a) => a.status === "active" && a.programOrganizationId === programOrganizationId,
      );
      if (!ok) throw new Error("No active affiliation to that organization");
    }
    const existing = await this.store.getUserProfile(ctx.nexusUserId);
    await this.store.saveUserProfile({
      nexusUserId: ctx.nexusUserId,
      createdAt: existing?.createdAt ?? this.now(),
      ...existing,
      activeProgramOrganizationId: programOrganizationId ?? undefined,
      updatedAt: this.now(),
    });
  }
}
