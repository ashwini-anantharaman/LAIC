/**
 * @laic/learner-contracts
 *
 * Shared cross-platform type contracts for the LAIC / MindBrainAI Nexus
 * ecosystem. Types are transcribed from the shared architecture documents,
 * which remain authoritative on any conflict:
 *
 *  - `learner-model-architecture-context.md` §3.1 (common learner model)
 *  - `Shared_Data_Model_and_API_Contract_v1.md` §2.4 (platform context), §11 (event envelope)
 *  - `Bridge_Platform_Implementation_Plan_v2.md` §3.3 (Nexus -> Bridge context)
 *
 * This package is types-only: no runtime code, no dependencies.
 * Changes require cross-workstream agreement (see README).
 */

// ---------------------------------------------------------------------------
// Platform context — Shared Data Model §2.4
// Every progress/event/recommendation record carries this so that domain
// isolation can be enforced on every query.
// ---------------------------------------------------------------------------

export type DomainId =
  | "bridge"
  | "brain_bee"
  | "mindai_bee"
  | "dance"
  | "singing"
  | (string & {});

export type PlatformContext = {
  appId: string;
  programId: string;
  domainId: DomainId;
  offeringId?: string;
  organizationScopeId?: string;
  groupId?: string;
};

// ---------------------------------------------------------------------------
// Event envelope — Shared Data Model §11
// All platforms publish events in this consistent envelope.
// ---------------------------------------------------------------------------

export type SourcePlatform =
  | "nexus"
  | "learning"
  | "bridge"
  | "coaching"
  | "app_shell";

export type PlatformEventEnvelope<TPayload = Record<string, unknown>> = {
  id: string;
  eventType: string;
  sourcePlatform: SourcePlatform;
  context: PlatformContext;
  actorUserId?: string;
  subjectUserId?: string;
  objectType?: string;
  objectId?: string;
  payload: TPayload;
  /** ISO 8601 timestamp. */
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Common learner model contract — learner-model doc §3.1
// Defined by Coaching/Common conceptually; each domain platform extends these
// shapes (e.g. BridgeLearnerProfile extends CommonLearnerDomainProfile) but
// stores its own domain-scoped records. There is one profile per person per
// domain — never a blended cross-domain profile.
// ---------------------------------------------------------------------------

export type CommonLearnerDomainProfile = {
  domainProfileId: string;
  nexusUserId: string;
  domainId: DomainId;
  programId: string;
  organizationScopeId?: string;
  selfDeclaredLevel?: string;
  assessedLevel?: string;
  status: "active" | "inactive" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type CommonProgressSignal = {
  progressSignalId: string;
  nexusUserId: string;
  domainId: DomainId;
  programId: string;
  domainProfileId: string;
  activityRefId?: string;
  sessionRefId?: string;
  signalType: string;
  relatedSkillIds: string[];
  relatedConceptIds: string[];
  sourceEventIds: string[];
  /** 0..1 — signal extractors must avoid overclaiming. */
  confidence: number;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Nexus -> Bridge launch context — Bridge plan §3.3
// Nexus owns identity/auth/orgs/roles/entitlements. The Bridge Platform
// receives this context object and keys everything off `nexusUserId`.
// Bridge must not create its own generic user system (Shared Data Model §17).
// ---------------------------------------------------------------------------

export type BridgeRole =
  | "bridge_program_admin"
  | "bridge_org_admin"
  | "bridge_club_admin"
  | "bridge_coach"
  | "bridge_reviewer"
  | "bridge_fellow"
  | "bridge_learner"
  | "bridge_guest";

export type BridgeAccessLevel =
  | "admin"
  | "coach"
  | "learner"
  | "reviewer"
  | "guest";

export type NexusBridgeContext = {
  nexusUserId: string;
  laicOrgId: string;
  programId: "bridge_program";
  programOrganizationId?: string;
  groupId?: string;
  appId: "bridge_ai_coach" | (string & {});
  roles: BridgeRole[];
  permissions: string[];
  accessLevel: BridgeAccessLevel;
  /** The person's display name in this org (Nexus profile). Additive; UI-only. */
  displayName?: string;
};
