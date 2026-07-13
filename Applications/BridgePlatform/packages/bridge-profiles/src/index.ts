/**
 * @bridge/profiles
 *
 * AI player profiles on published packages (Bridge plan §11):
 *  - Resolution chain (§11.4): package setting defaults + preset values +
 *    owner overrides = resolved configuration, hashed for replay stability.
 *  - Ownership (locked decision 9.2): system profiles are global read-only;
 *    org/coach/learner profiles are tenant-scoped; customization is
 *    copy-on-write into the caller's scope.
 *  - Convention card (§11.5): DERIVED output generated from the package +
 *    resolved settings — every entry links to the knowledge items behind it.
 *  - "Rules this player follows": the full rule set with active/inactive
 *    status under this profile's resolved configuration.
 */

import type { Setting, SettingValue } from "@bridge/config";
import type { BridgeRulePackage, SettingGate } from "@bridge/engine";
import { unknownConceptIds } from "@bridge/taxonomy";
import type { NexusBridgeContext } from "@laic/learner-contracts";

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export interface ConfigPreset {
  presetId: string;
  name: string;
  description: string;
  values: Record<string, SettingValue>;
}

/**
 * LEGACY fallback presets (§11.3): presets are package CONTENT since Phase 15
 * (BridgeRulePackage.presets, generated from configuration_preset knowledge
 * items). This list only serves package versions generated before presets
 * existed — prefer `packagePresets(pkg)`.
 */
export const BN_PRESETS: ConfigPreset[] = [
  {
    presetId: "bn_default",
    name: "Beginner Natural (standard)",
    description: "Package defaults: all Level-1 agreements on.",
    values: {},
  },
  {
    presetId: "bn_no_1nt",
    name: "Beginner Natural — without the 1NT response",
    description: "The 6–9 1NT response is off; weak responding hands pass.",
    values: { bn_1nt_response: false },
  },
];

export interface BridgeAiPlayerProfile {
  aiPlayerProfileId: string;
  name: string;
  description?: string;
  ownerType: "system" | "program_org" | "coach" | "learner";
  /** nexusUserId for coach/learner profiles. */
  ownerId?: string;
  /** Tenant scope for non-system profiles. */
  programOrganizationId?: string;
  packageRef: { packageId: string; version: string };
  selectedPresetId?: string;
  valueOverrides: Record<string, SettingValue>;
  resolvedValueHash: string;
  /** Set when this player was configured inside a coach's sandbox — only the
   *  sandbox's exposed settings may ever be changed on it. */
  sandboxId?: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

/** FNV-1a 32-bit over a stable JSON encoding (matches @bridge/sessions). */
export function hashSettingValues(values: Record<string, SettingValue>): string {
  const stable = JSON.stringify(
    Object.keys(values)
      .sort()
      .map((k) => [k, values[k]]),
  );
  let h = 0x811c9dc5;
  for (let i = 0; i < stable.length; i++) {
    h ^= stable.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** The package's shipped presets, falling back to legacy dev data (§11.3). */
export function packagePresets(pkg: BridgeRulePackage): readonly ConfigPreset[] {
  return pkg.presets?.length ? pkg.presets : BN_PRESETS;
}

/** Resolution chain §11.4: defaults + preset + overrides. */
export function resolveProfileValues(
  settings: readonly Setting[],
  presetId: string | undefined,
  overrides: Record<string, SettingValue>,
  presets: readonly ConfigPreset[] = BN_PRESETS,
): { values: Record<string, SettingValue>; hash: string } {
  const values: Record<string, SettingValue> = {};
  for (const s of settings) values[s.key] = s.default;
  const preset = presets.find((p) => p.presetId === presetId);
  Object.assign(values, preset?.values ?? {}, overrides);
  return { values, hash: hashSettingValues(values) };
}

// ---------------------------------------------------------------------------
// Sandboxes: a coach curates WHICH settings a learner may touch (the
// prototype's visibility layer, made first-class). The learner configures a
// player inside the sandbox: base preset + coach overrides form the
// baseline, and ONLY exposedSettingKeys accept learner overrides — enforced
// server-side, not just hidden in the UI.
// ---------------------------------------------------------------------------

export interface BridgeSandbox {
  sandboxId: string;
  name: string;
  description?: string;
  ownerType: "system" | "program_org" | "coach" | "learner";
  ownerId?: string;
  programOrganizationId?: string;
  packageRef: { packageId: string; version: string };
  basePresetId?: string;
  baseOverrides: Record<string, SettingValue>;
  /** The only setting keys a learner may override inside this sandbox. */
  exposedSettingKeys: string[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Teaching scopes — a COACH'S judgment, not system truth
// ---------------------------------------------------------------------------
// There is no objective "Level 1". Fellow-authored teaching_scope knowledge
// items are SUGGESTED defaults only; the operative object is this record,
// owned and editable by a coach (or org) exactly like an AI profile:
// system entries are read-only suggestions, customize = copy-on-write.

import type { EvaluatorFilterSpec } from "@bridge/dealer";

export interface TeachingScopeRecord {
  teachingScopeId: string;
  name: string;
  description?: string;
  ownerType: "system" | "program_org" | "coach" | "learner";
  ownerId?: string;
  programOrganizationId?: string;
  /** Lineage to the fellow-suggested knowledge item, when derived (not authority). */
  derivedFromItemId?: string;
  evaluatorFilter: EvaluatorFilterSpec;
  targetConceptIds: string[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Bridge user profile (Bridge plan §3.4 — bridge_user_profiles in 0002):
// per-person table preferences, self-owned.
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
// Org model (§3.4-3.5 — 0010): bridge-owned extension of a Nexus program
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
  /** System families this org teaches/allows (empty = all). */
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
// Store + tenant-scoped service
// ---------------------------------------------------------------------------

export interface ProfileStoreData {
  profiles: BridgeAiPlayerProfile[];
  sandboxes?: BridgeSandbox[];
  scopes?: TeachingScopeRecord[];
  userProfiles?: BridgeUserProfile[];
  orgProfiles?: BridgeProgramOrganizationProfile[];
  affiliations?: BridgeCoachAffiliation[];
}

export interface ProfileStore {
  list(): Promise<BridgeAiPlayerProfile[]>;
  get(id: string): Promise<BridgeAiPlayerProfile | null>;
  save(profile: BridgeAiPlayerProfile): Promise<void>;
  listSandboxes(): Promise<BridgeSandbox[]>;
  getSandbox(id: string): Promise<BridgeSandbox | null>;
  saveSandbox(sandbox: BridgeSandbox): Promise<void>;
  listScopes(): Promise<TeachingScopeRecord[]>;
  getScope(id: string): Promise<TeachingScopeRecord | null>;
  saveScope(scope: TeachingScopeRecord): Promise<void>;
  getUserProfile(nexusUserId: string): Promise<BridgeUserProfile | null>;
  saveUserProfile(profile: BridgeUserProfile): Promise<void>;
  getOrgProfile(programOrganizationId: string): Promise<BridgeProgramOrganizationProfile | null>;
  saveOrgProfile(profile: BridgeProgramOrganizationProfile): Promise<void>;
  listAffiliations(nexusUserId: string): Promise<BridgeCoachAffiliation[]>;
  saveAffiliation(affiliation: BridgeCoachAffiliation): Promise<void>;
}

export class InMemoryProfileStore implements ProfileStore {
  protected data: ProfileStoreData;
  constructor(seed?: Partial<ProfileStoreData>) {
    this.data = { profiles: [], ...structuredClone(seed ?? {}) };
  }
  protected persist(): void {}
  async list(): Promise<BridgeAiPlayerProfile[]> {
    return structuredClone(this.data.profiles);
  }
  async get(id: string): Promise<BridgeAiPlayerProfile | null> {
    const p = this.data.profiles.find((x) => x.aiPlayerProfileId === id);
    return p ? structuredClone(p) : null;
  }
  async save(profile: BridgeAiPlayerProfile): Promise<void> {
    const i = this.data.profiles.findIndex(
      (x) => x.aiPlayerProfileId === profile.aiPlayerProfileId,
    );
    if (i >= 0) this.data.profiles[i] = structuredClone(profile);
    else this.data.profiles.push(structuredClone(profile));
    this.persist();
  }
  async listSandboxes(): Promise<BridgeSandbox[]> {
    return structuredClone(this.data.sandboxes ?? []);
  }
  async getSandbox(id: string): Promise<BridgeSandbox | null> {
    return structuredClone((this.data.sandboxes ?? []).find((s) => s.sandboxId === id) ?? null);
  }
  async saveSandbox(sandbox: BridgeSandbox): Promise<void> {
    this.data.sandboxes = [
      ...(this.data.sandboxes ?? []).filter((s) => s.sandboxId !== sandbox.sandboxId),
      structuredClone(sandbox),
    ];
    this.persist();
  }
  async listScopes(): Promise<TeachingScopeRecord[]> {
    return structuredClone(this.data.scopes ?? []);
  }
  async getScope(id: string): Promise<TeachingScopeRecord | null> {
    return structuredClone((this.data.scopes ?? []).find((x) => x.teachingScopeId === id) ?? null);
  }
  async saveScope(scope: TeachingScopeRecord): Promise<void> {
    this.data.scopes = [
      ...(this.data.scopes ?? []).filter((x) => x.teachingScopeId !== scope.teachingScopeId),
      structuredClone(scope),
    ];
    this.persist();
  }
  async getUserProfile(nexusUserId: string): Promise<BridgeUserProfile | null> {
    const u = (this.data.userProfiles ?? []).find((x) => x.nexusUserId === nexusUserId);
    return u ? structuredClone(u) : null;
  }
  async saveUserProfile(profile: BridgeUserProfile): Promise<void> {
    this.data.userProfiles = [
      ...(this.data.userProfiles ?? []).filter((x) => x.nexusUserId !== profile.nexusUserId),
      structuredClone(profile),
    ];
    this.persist();
  }
  async getOrgProfile(programOrganizationId: string): Promise<BridgeProgramOrganizationProfile | null> {
    return structuredClone(
      (this.data.orgProfiles ?? []).find((o) => o.programOrganizationId === programOrganizationId) ?? null,
    );
  }
  async saveOrgProfile(profile: BridgeProgramOrganizationProfile): Promise<void> {
    this.data.orgProfiles = [
      ...(this.data.orgProfiles ?? []).filter(
        (o) => o.programOrganizationId !== profile.programOrganizationId,
      ),
      structuredClone(profile),
    ];
    this.persist();
  }
  async listAffiliations(nexusUserId: string): Promise<BridgeCoachAffiliation[]> {
    return structuredClone((this.data.affiliations ?? []).filter((a) => a.nexusUserId === nexusUserId));
  }
  async saveAffiliation(affiliation: BridgeCoachAffiliation): Promise<void> {
    this.data.affiliations = [
      ...(this.data.affiliations ?? []).filter(
        (a) => a.coachAffiliationId !== affiliation.coachAffiliationId,
      ),
      structuredClone(affiliation),
    ];
    this.persist();
  }
}

interface Owned {
  ownerType: "system" | "program_org" | "coach" | "learner";
  ownerId?: string;
  programOrganizationId?: string;
}

export function canSeeProfile(p: Owned, ctx: NexusBridgeContext): boolean {
  if (p.ownerType === "system") return true;
  if (p.ownerId === ctx.nexusUserId) return true;
  if (p.programOrganizationId && p.programOrganizationId === ctx.programOrganizationId) return true;
  if (ctx.accessLevel === "admin" && !ctx.programOrganizationId) return true;
  return false;
}

export function canEditProfile(p: Owned, ctx: NexusBridgeContext): boolean {
  if (p.ownerType === "system") return false; // customize = copy, never edit
  if (p.ownerId === ctx.nexusUserId) return true;
  if (
    p.ownerType === "program_org" &&
    p.programOrganizationId === ctx.programOrganizationId &&
    ctx.accessLevel === "admin"
  )
    return true;
  return false;
}

export class ProfileService {
  constructor(
    private readonly store: ProfileStore,
    private readonly newId: () => string = () => `aip_${crypto.randomUUID().slice(0, 12)}`,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async listProfiles(ctx: NexusBridgeContext): Promise<BridgeAiPlayerProfile[]> {
    return (await this.store.list()).filter((p) => canSeeProfile(p, ctx));
  }

  async getProfile(id: string, ctx: NexusBridgeContext): Promise<BridgeAiPlayerProfile | null> {
    const p = await this.store.get(id);
    return p && canSeeProfile(p, ctx) ? p : null;
  }

  /**
   * Create a player pinned to an exact package version — the one-click end
   * of the book→player flow (generate a package from a book, then play it).
   */
  async createProfile(
    ctx: NexusBridgeContext,
    input: {
      name: string;
      description?: string;
      packageRef: { packageId: string; version: string };
      settings: readonly Setting[];
      selectedPresetId?: string;
      presets?: readonly ConfigPreset[];
    },
  ): Promise<BridgeAiPlayerProfile> {
    const { hash } = resolveProfileValues(
      input.settings,
      input.selectedPresetId,
      {},
      input.presets ?? BN_PRESETS,
    );
    const profile: BridgeAiPlayerProfile = {
      aiPlayerProfileId: this.newId(),
      name: input.name,
      description: input.description,
      ownerType: ctx.accessLevel === "coach" ? "coach" : "learner",
      ownerId: ctx.nexusUserId,
      programOrganizationId: ctx.programOrganizationId,
      packageRef: input.packageRef,
      selectedPresetId: input.selectedPresetId,
      valueOverrides: {},
      resolvedValueHash: hash,
      status: "active",
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    await this.store.save(profile);
    return profile;
  }

  /** Copy-on-customize: clone any visible profile into the caller's scope. */
  async customize(
    sourceId: string,
    ctx: NexusBridgeContext,
    settings: readonly Setting[],
    name?: string,
    presets: readonly ConfigPreset[] = BN_PRESETS,
  ): Promise<BridgeAiPlayerProfile> {
    const source = await this.getProfile(sourceId, ctx);
    if (!source) throw new Error("Profile not found");
    const { hash } = resolveProfileValues(settings, source.selectedPresetId, source.valueOverrides, presets);
    const copy: BridgeAiPlayerProfile = {
      ...source,
      aiPlayerProfileId: this.newId(),
      name: name ?? `${source.name} (my copy)`,
      ownerType: ctx.accessLevel === "coach" ? "coach" : "learner",
      ownerId: ctx.nexusUserId,
      programOrganizationId: ctx.programOrganizationId,
      resolvedValueHash: hash,
      status: "active",
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    await this.store.save(copy);
    return copy;
  }

  async updateValues(
    id: string,
    ctx: NexusBridgeContext,
    settings: readonly Setting[],
    changes: { name?: string; selectedPresetId?: string; valueOverrides?: Record<string, SettingValue> },
    presets: readonly ConfigPreset[] = BN_PRESETS,
  ): Promise<BridgeAiPlayerProfile> {
    const p = await this.store.get(id);
    if (!p || !canSeeProfile(p, ctx)) throw new Error("Profile not found");
    if (!canEditProfile(p, ctx))
      throw new Error("System and foreign profiles are read-only — customize to make your own copy");
    // Sandboxed profiles: unexposed settings must stay at the sandbox
    // baseline — enforced here so no edit path can bypass the sandbox.
    if (p.sandboxId && changes.valueOverrides) {
      const sandbox = await this.store.getSandbox(p.sandboxId);
      if (sandbox) {
        const baseline = resolveProfileValues(
          settings,
          sandbox.basePresetId,
          sandbox.baseOverrides,
          presets,
        ).values;
        const offending = Object.keys(changes.valueOverrides).filter(
          (k) =>
            !sandbox.exposedSettingKeys.includes(k) &&
            JSON.stringify(changes.valueOverrides![k]) !== JSON.stringify(baseline[k]),
        );
        this.assertWithinSandboxChanged(sandbox, offending);
      }
    }
    const selectedPresetId = changes.selectedPresetId ?? p.selectedPresetId;
    const valueOverrides = changes.valueOverrides ?? p.valueOverrides;
    const { hash } = resolveProfileValues(settings, selectedPresetId, valueOverrides, presets);
    const updated: BridgeAiPlayerProfile = {
      ...p,
      name: changes.name ?? p.name,
      selectedPresetId,
      valueOverrides,
      resolvedValueHash: hash,
      updatedAt: this.now(),
    };
    await this.store.save(updated);
    return updated;
  }

  // ---- sandboxes (§ coach-curated configuration surfaces) ------------------

  /** Coaches (and reviewers/admins) curate sandboxes for their learners. */
  async createSandbox(
    ctx: NexusBridgeContext,
    input: {
      name: string;
      description?: string;
      packageRef: { packageId: string; version: string };
      basePresetId?: string;
      baseOverrides?: Record<string, SettingValue>;
      exposedSettingKeys: string[];
    },
  ): Promise<BridgeSandbox> {
    if (!["coach", "reviewer", "admin"].includes(ctx.accessLevel))
      throw new Error("Sandboxes are coach tools — coach, reviewer, or admin access required");
    if (!input.exposedSettingKeys.length)
      throw new Error("A sandbox must expose at least one setting");
    const sandbox: BridgeSandbox = {
      sandboxId: this.newId().replace("aip_", "sbx_"),
      name: input.name,
      description: input.description,
      ownerType: ctx.accessLevel === "coach" ? "coach" : "program_org",
      ownerId: ctx.nexusUserId,
      programOrganizationId: ctx.programOrganizationId,
      packageRef: input.packageRef,
      basePresetId: input.basePresetId,
      baseOverrides: input.baseOverrides ?? {},
      exposedSettingKeys: input.exposedSettingKeys,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    await this.store.saveSandbox(sandbox);
    return sandbox;
  }

  async listSandboxes(ctx: NexusBridgeContext): Promise<BridgeSandbox[]> {
    return (await this.store.listSandboxes()).filter((s) => canSeeProfile(s, ctx));
  }

  async getSandbox(id: string, ctx: NexusBridgeContext): Promise<BridgeSandbox | null> {
    const s = await this.store.getSandbox(id);
    return s && canSeeProfile(s, ctx) ? s : null;
  }

  private assertWithinSandboxChanged(sandbox: BridgeSandbox, changedKeys: string[]): void {
    const outside = changedKeys.filter((k) => !sandbox.exposedSettingKeys.includes(k));
    if (outside.length)
      throw new Error(
        `Setting${outside.length > 1 ? "s" : ""} [${outside.join(", ")}] ${outside.length > 1 ? "are" : "is"} not exposed by this sandbox`,
      );
  }

  /** Reject any learner override outside the sandbox's exposed keys. */
  private assertWithinSandbox(
    sandbox: BridgeSandbox,
    overrides: Record<string, SettingValue>,
  ): void {
    const outside = Object.keys(overrides).filter(
      (k) => !sandbox.exposedSettingKeys.includes(k),
    );
    if (outside.length)
      throw new Error(
        `Setting${outside.length > 1 ? "s" : ""} [${outside.join(", ")}] ${outside.length > 1 ? "are" : "is"} not exposed by this sandbox`,
      );
  }

  /**
   * A learner configures THEIR player inside a coach's sandbox: baseline =
   * sandbox preset + coach overrides; the learner's choices are accepted only
   * for exposed settings. The result is a normal pinned AI profile carrying
   * sandboxId lineage.
   */
  async configureFromSandbox(
    ctx: NexusBridgeContext,
    sandboxId: string,
    input: {
      name?: string;
      overrides: Record<string, SettingValue>;
      settings: readonly Setting[];
      presets?: readonly ConfigPreset[];
    },
  ): Promise<BridgeAiPlayerProfile> {
    const sandbox = await this.getSandbox(sandboxId, ctx);
    if (!sandbox) throw new Error("Sandbox not found");
    this.assertWithinSandbox(sandbox, input.overrides);
    const valueOverrides = { ...sandbox.baseOverrides, ...input.overrides };
    const { hash } = resolveProfileValues(
      input.settings,
      sandbox.basePresetId,
      valueOverrides,
      input.presets ?? BN_PRESETS,
    );
    const profile: BridgeAiPlayerProfile = {
      aiPlayerProfileId: this.newId(),
      name: input.name || `My ${sandbox.name} player`,
      description: `Configured inside the "${sandbox.name}" sandbox.`,
      ownerType: ctx.accessLevel === "coach" ? "coach" : "learner",
      ownerId: ctx.nexusUserId,
      programOrganizationId: ctx.programOrganizationId,
      packageRef: sandbox.packageRef,
      selectedPresetId: sandbox.basePresetId,
      valueOverrides,
      resolvedValueHash: hash,
      sandboxId: sandbox.sandboxId,
      status: "active",
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    await this.store.save(profile);
    return profile;
  }

  // ---- teaching scopes (same ownership semantics as profiles) -------------

  async listScopes(ctx: NexusBridgeContext): Promise<TeachingScopeRecord[]> {
    return (await this.store.listScopes()).filter((s) => canSeeProfile(s, ctx));
  }

  async getScope(id: string, ctx: NexusBridgeContext): Promise<TeachingScopeRecord | null> {
    const s = await this.store.getScope(id);
    return s && canSeeProfile(s, ctx) ? s : null;
  }

  /** Copy a visible scope into the caller's ownership — their judgment now. */
  async customizeScope(
    sourceId: string,
    ctx: NexusBridgeContext,
    name?: string,
  ): Promise<TeachingScopeRecord> {
    const source = await this.getScope(sourceId, ctx);
    if (!source) throw new Error("Teaching scope not found");
    const copy: TeachingScopeRecord = {
      ...source,
      teachingScopeId: this.newId().replace("aip_", "ts_"),
      name: name ?? `${source.name} (my judgment)`,
      ownerType: ctx.accessLevel === "coach" ? "coach" : "learner",
      ownerId: ctx.nexusUserId,
      programOrganizationId: ctx.programOrganizationId,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    await this.store.saveScope(copy);
    return copy;
  }

  async updateScope(
    id: string,
    ctx: NexusBridgeContext,
    changes: Partial<Pick<TeachingScopeRecord, "name" | "description" | "evaluatorFilter" | "targetConceptIds">>,
  ): Promise<TeachingScopeRecord> {
    const s = await this.store.getScope(id);
    if (!s || !canSeeProfile(s, ctx)) throw new Error("Teaching scope not found");
    if (!canEditProfile(s, ctx))
      throw new Error("System and foreign scopes are read-only — customize to make your own");
    if (changes.targetConceptIds) {
      const unknown = unknownConceptIds(changes.targetConceptIds);
      if (unknown.length)
        throw new Error(
          `Unknown concept ids: ${unknown.join(", ")} — targetConceptIds must reference the concept taxonomy (§15.1)`,
        );
    }
    const updated = { ...s, ...changes, updatedAt: this.now() };
    await this.store.saveScope(updated);
    return updated;
  }

  /** Idempotent seed of a fellow-SUGGESTED default (read-only; customize to own). */
  async ensureSystemScope(
    scope: Omit<TeachingScopeRecord, "ownerType" | "createdAt" | "updatedAt">,
  ): Promise<TeachingScopeRecord> {
    const existing = await this.store.getScope(scope.teachingScopeId);
    if (existing) return existing;
    const record: TeachingScopeRecord = {
      ...scope,
      ownerType: "system",
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    await this.store.saveScope(record);
    return record;
  }

  /** A user's own table preferences (§3.4) — always self-owned. */
  async getUserProfile(ctx: NexusBridgeContext): Promise<BridgeUserProfile | null> {
    return this.store.getUserProfile(ctx.nexusUserId);
  }

  async saveUserProfile(
    ctx: NexusBridgeContext,
    changes: Partial<Pick<BridgeUserProfile, "displayNameAtTable" | "preferredSeat" | "preferredFeedbackMode">>,
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

  // ---- org model (§3.4-3.5) ------------------------------------------------

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
        "bridgeOrgType" | "allowedBiddingSystems" | "defaultLearnerLevel" | "allowBenPlayers" | "allowAiPlayers"
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
      coachAffiliationId: this.newId().replace("aip_", "aff_"),
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
  async switchActiveOrg(ctx: NexusBridgeContext, programOrganizationId: string | null): Promise<void> {
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

  /** Idempotent system-profile seed (dev bootstrap). */
  async ensureSystemProfile(
    packageRef: { packageId: string; version: string },
    settings: readonly Setting[],
  ): Promise<BridgeAiPlayerProfile> {
    const id = `aip_system_${packageRef.packageId}`;
    const existing = await this.store.get(id);
    if (existing) return existing;
    const { hash } = resolveProfileValues(settings, "bn_default", {});
    const profile: BridgeAiPlayerProfile = {
      aiPlayerProfileId: id,
      name: "Beginner Natural (standard)",
      description: "System profile — read-only; customize to adjust settings.",
      ownerType: "system",
      packageRef,
      selectedPresetId: "bn_default",
      valueOverrides: {},
      resolvedValueHash: hash,
      status: "active",
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    await this.store.save(profile);
    return profile;
  }
}

// ---------------------------------------------------------------------------
// Convention card + "rules this player follows" (derived output, §11.5)
// ---------------------------------------------------------------------------

const sameValue = (a: SettingValue | undefined, b: SettingValue): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

export function gatesPass(gates: SettingGate[], values: Record<string, SettingValue>): boolean {
  return gates.every((g) =>
    g.equals !== undefined ? sameValue(values[g.key], g.equals) : Boolean(values[g.key]),
  );
}

export interface CardEntry {
  label: string;
  ruleId: string;
  /** Gate state under this profile's resolved values. */
  active: boolean;
  settingKeys: string[];
  knowledgeItemIds: string[];
}

export interface ConventionCard {
  profileName: string;
  packageRef: { packageId: string; version: string };
  resolvedValueHash: string;
  settings: Array<{ key: string; label: string; value: SettingValue; uiOnly?: boolean }>;
  sections: Array<{ title: string; entries: CardEntry[] }>;
}

/** Derived from the package + resolved settings — never hand-maintained. */
export function generateConventionCard(
  pkg: BridgeRulePackage,
  values: Record<string, SettingValue>,
  profileName: string,
): ConventionCard {
  const entry = (r: {
    ruleId: string;
    title: string;
    settingGates: SettingGate[];
    provenance: { knowledgeItemIds: string[] };
  }): CardEntry => ({
    label: r.title,
    ruleId: r.ruleId,
    active: gatesPass(r.settingGates, values),
    settingKeys: r.settingGates.map((g) => g.key),
    knowledgeItemIds: r.provenance.knowledgeItemIds,
  });

  const openings = pkg.bidRules.filter((r) => r.auctionContext.role === "opening");
  const responses = pkg.bidRules.filter((r) => r.auctionContext.role === "response");
  const other = pkg.bidRules.filter(
    (r) => r.auctionContext.role !== "opening" && r.auctionContext.role !== "response",
  );

  return {
    profileName,
    packageRef: { packageId: pkg.packageId, version: pkg.version },
    resolvedValueHash: hashSettingValues(values),
    settings: pkg.settings.map((s) => ({
      key: s.key,
      label: s.label,
      value: values[s.key]!,
      uiOnly: s.uiOnly,
    })),
    sections: [
      { title: "Opening bids", entries: openings.map(entry) },
      { title: "Responses", entries: responses.map(entry) },
      { title: "Other agreements", entries: other.map(entry) },
      { title: "Leads & card play", entries: pkg.playRules.map(entry) },
    ],
  };
}
