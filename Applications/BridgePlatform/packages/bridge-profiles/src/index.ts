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
 * Dev presets for Beginner Natural. Presets are configuration content and
 * graduate to knowledge items with the Phase 9 registry ingestion (plan
 * §11.3: "presets should not be just labels"); until then they live here,
 * flagged as dev data.
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
    description: "The 6–10 1NT response is off; weak responding hands pass.",
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
// Store + tenant-scoped service
// ---------------------------------------------------------------------------

export interface ProfileStoreData {
  profiles: BridgeAiPlayerProfile[];
  scopes?: TeachingScopeRecord[];
}

export class InMemoryProfileStore {
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
    private readonly store: InMemoryProfileStore,
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

  /** Copy-on-customize: clone any visible profile into the caller's scope. */
  async customize(
    sourceId: string,
    ctx: NexusBridgeContext,
    settings: readonly Setting[],
    name?: string,
  ): Promise<BridgeAiPlayerProfile> {
    const source = await this.getProfile(sourceId, ctx);
    if (!source) throw new Error("Profile not found");
    const { hash } = resolveProfileValues(settings, source.selectedPresetId, source.valueOverrides);
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
  ): Promise<BridgeAiPlayerProfile> {
    const p = await this.store.get(id);
    if (!p || !canSeeProfile(p, ctx)) throw new Error("Profile not found");
    if (!canEditProfile(p, ctx))
      throw new Error("System and foreign profiles are read-only — customize to make your own copy");
    const selectedPresetId = changes.selectedPresetId ?? p.selectedPresetId;
    const valueOverrides = changes.valueOverrides ?? p.valueOverrides;
    const { hash } = resolveProfileValues(settings, selectedPresetId, valueOverrides);
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
  settings: Array<{ key: string; label: string; value: SettingValue }>;
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
    settings: pkg.settings.map((s) => ({ key: s.key, label: s.label, value: values[s.key]! })),
    sections: [
      { title: "Opening bids", entries: openings.map(entry) },
      { title: "Responses", entries: responses.map(entry) },
      { title: "Other agreements", entries: other.map(entry) },
      { title: "Leads & card play", entries: pkg.playRules.map(entry) },
    ],
  };
}
