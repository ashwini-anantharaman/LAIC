/**
 * Zone 1 — Platform core: the Coach Profile registry + Studio operations (M2/B5).
 *
 * In-memory (the durable adapter is a later concern) store of CoachProfiles and
 * the behavioral/scope objects they reference, plus the admin operations that
 * make "coach-by-config" real: clone a preset, tweak policy/scope, publish a
 * version (preserving clone lineage), deploy an instance, and preview behavior
 * against a sample scenario — all without code changes.
 */
import type {
  CoachProfile,
  CoachInstance,
  CoachingPolicyProfile,
  KnowledgeScope,
  CoachCapabilityScope,
} from "../../contracts/index";
import { CONTRACTS_SCHEMA_VERSION, validate } from "../../contracts/index";
import { resolvePolicy } from "../config/index";
import {
  decideIntervention,
  applyCapabilityScope,
  defaultCapabilityScope,
  type InterventionDecision,
} from "../policy/index";
import type { EvaluationResult } from "../types/index";
import { bridgeBeginnerPreset } from "./presets";

export interface CloneRequest {
  basePresetId: string;
  name: string;
  ownerType?: CoachProfile["ownerType"];
  ownerId?: string;
  /** overrides applied to the cloned CoachingPolicyProfile.interventionPolicy */
  policyOverrides?: Partial<CoachingPolicyProfile["interventionPolicy"]>;
  /** concepts to forbid in the cloned KnowledgeScope (e.g. "disable slam bidding") */
  forbiddenConceptIds?: string[];
}

export interface DeployRequest {
  profileId: string;
  mode?: CoachInstance["mode"];
  deployedTo?: CoachInstance["deployedTo"];
}

export interface ProfileBundle {
  profile: CoachProfile;
  policyProfile: CoachingPolicyProfile;
  knowledgeScope: KnowledgeScope;
  capabilityScope: CoachCapabilityScope;
}

function assertValid(name: string, obj: unknown): void {
  const r = validate(name, obj);
  if (!r.valid) throw new Error(`${name} failed validation: ${r.errors.join("; ")}`);
}

function bumpMinor(version: string): string {
  const [maj, min = "0"] = version.split(".");
  return `${maj}.${Number(min) + 1}.0`;
}

export class ProfileRegistry {
  private profiles = new Map<string, CoachProfile>();
  private policyProfiles = new Map<string, CoachingPolicyProfile>();
  private knowledgeScopes = new Map<string, KnowledgeScope>();
  private capabilityScopes = new Map<string, CoachCapabilityScope>();
  private versions = new Map<string, CoachProfile[]>();
  private instances = new Map<string, CoachInstance>();
  private seq = 0;

  constructor(seedPresets = true) {
    if (seedPresets) this.addPreset(bridgeBeginnerPreset());
  }

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  addPreset(bundle: ProfileBundle): void {
    this.profiles.set(bundle.profile.id, bundle.profile);
    this.policyProfiles.set(bundle.policyProfile.profileId, bundle.policyProfile);
    this.knowledgeScopes.set(bundle.knowledgeScope.id, bundle.knowledgeScope);
    this.capabilityScopes.set(bundle.capabilityScope.id, bundle.capabilityScope);
  }

  listProfiles(): CoachProfile[] {
    return [...this.profiles.values()];
  }

  listPresets(): CoachProfile[] {
    return this.listProfiles().filter((p) => p.ownerType === "platform" && !p.basePresetId);
  }

  getBundle(profileId: string): ProfileBundle {
    const profile = this.profiles.get(profileId);
    if (!profile) throw new Error(`Unknown profile: ${profileId}`);
    return {
      profile,
      policyProfile: this.policyProfiles.get(profile.coachingPolicyProfileId)!,
      knowledgeScope: this.knowledgeScopes.get(profile.knowledgeScopeId)!,
      capabilityScope:
        this.capabilityScopes.get(profile.capabilityScopeId) ?? defaultCapabilityScope(),
    };
  }

  /** Clone a preset into a new draft, applying policy/scope overrides. */
  clone(req: CloneRequest): CoachProfile {
    const base = this.getBundle(req.basePresetId);

    const newProfileId = this.id("profile");
    const cppId = this.id("cpp");
    const ksId = this.id("ks");

    const policyProfile: CoachingPolicyProfile = {
      ...structuredClone(base.policyProfile),
      profileId: cppId,
      interventionPolicy: { ...base.policyProfile.interventionPolicy, ...(req.policyOverrides ?? {}) },
    };
    assertValid("CoachingPolicyProfile", policyProfile);

    const knowledgeScope: KnowledgeScope = {
      ...structuredClone(base.knowledgeScope),
      id: ksId,
      forbiddenConceptIds: [
        ...(base.knowledgeScope.forbiddenConceptIds ?? []),
        ...(req.forbiddenConceptIds ?? []),
      ],
    };
    assertValid("KnowledgeScope", knowledgeScope);

    const profile: CoachProfile = {
      ...structuredClone(base.profile),
      id: newProfileId,
      name: req.name,
      version: "0.1.0",
      status: "draft",
      ownerType: req.ownerType ?? "program",
      ownerId: req.ownerId ?? "unknown",
      basePresetId: base.profile.id, // clone lineage
      coachingPolicyProfileId: cppId,
      knowledgeScopeId: ksId,
    };
    assertValid("CoachProfile", profile);

    this.profiles.set(profile.id, profile);
    this.policyProfiles.set(policyProfile.profileId, policyProfile);
    this.knowledgeScopes.set(knowledgeScope.id, knowledgeScope);
    return profile;
  }

  /** Publish the current draft as a new version, preserving version history. */
  publishVersion(profileId: string): { profile: CoachProfile; versions: string[] } {
    const current = this.profiles.get(profileId);
    if (!current) throw new Error(`Unknown profile: ${profileId}`);
    const published: CoachProfile = {
      ...current,
      status: "published",
      version: current.status === "published" ? bumpMinor(current.version) : current.version,
    };
    assertValid("CoachProfile", published);
    this.profiles.set(profileId, published);
    const history = this.versions.get(profileId) ?? [];
    history.push(structuredClone(published));
    this.versions.set(profileId, history);
    return { profile: published, versions: history.map((v) => v.version) };
  }

  /** Deploy a published profile to a concrete place as a CoachInstance. */
  deploy(req: DeployRequest): CoachInstance {
    const bundle = this.getBundle(req.profileId);
    if (bundle.profile.status !== "published") {
      throw new Error(`Profile ${req.profileId} must be published before deploy (is "${bundle.profile.status}").`);
    }
    const instance: CoachInstance = {
      schemaVersion: CONTRACTS_SCHEMA_VERSION,
      id: this.id("instance"),
      coachProfileId: bundle.profile.id,
      domainId: bundle.profile.domainId,
      mode: req.mode ?? bundle.profile.defaultMode,
      deployedTo: req.deployedTo,
      status: "active",
      createdAt: "1970-01-01T00:00:00.000Z", // stamped by the caller/service in real use
    };
    assertValid("CoachInstance", instance);
    this.instances.set(instance.id, instance);
    return instance;
  }

  getInstance(id: string): CoachInstance | undefined {
    return this.instances.get(id);
  }

  /** Preview the resolved behavior of a profile against a sample evaluation. */
  preview(
    profileId: string,
    evaluation: EvaluationResult,
    opts: { hintRequested?: boolean; currentHintLevel?: number } = {},
  ): { decision: InterventionDecision; resolvedPolicy: ReturnType<typeof resolvePolicy> } {
    const bundle = this.getBundle(profileId);
    const resolvedPolicy = resolvePolicy(bundle.policyProfile);
    const decision = applyCapabilityScope(
      decideIntervention({
        evaluation,
        policy: resolvedPolicy,
        hintRequested: opts.hintRequested,
        currentHintLevel: opts.currentHintLevel,
      }),
      bundle.capabilityScope,
    );
    return { decision, resolvedPolicy };
  }
}
