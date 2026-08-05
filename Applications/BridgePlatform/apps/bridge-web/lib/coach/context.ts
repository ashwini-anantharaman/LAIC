// Who the coach is coaching, and under what tenancy.
//
// The coaching engine is domain- AND app-agnostic: it is told an opaque
// learnerId and a PlatformContext, never how this app models people. Threading
// the context now costs nothing (it is a types-only contract and we run
// in-process) and is what keeps the door open to the coach becoming a service
// later — at which point every event, note and observation already carries the
// scope a query would have to be filtered by.

import type { PlatformContext, NexusBridgeContext } from "@laic/learner-contracts";

/** The bridge domain's id in the coaching engine's registry. */
export const BRIDGE_DOMAIN_ID = "bridge_gameplay";

/** The `schemaVersion` stamped on notes — the coach contracts' version. */
export const CONTRACT_VERSION = "1.0.0";

/**
 * What every note needs beyond its own text: who it is for, and under what
 * behaviour it was produced. A note is only interpretable against the policy
 * that generated it — "the coach didn't tell me" means something different
 * under a socratic profile than under a direct one.
 */
export interface NoteContext {
  learnerId: string;
  policyVersion: string;
  profileId: string;
}

export interface CoachIdentity {
  /** Opaque to the coach. The Nexus person id — stable across sessions. */
  learnerId: string;
  platform: PlatformContext;
}

export function coachIdentity(context: NexusBridgeContext): CoachIdentity {
  return {
    learnerId: context.nexusUserId,
    platform: {
      appId: context.appId,
      programId: context.programId,
      domainId: "bridge",
      // The REAL org partition when the launch carried one; `laicOrgId` is the
      // logical org either way.
      organizationScopeId: context.programOrganizationId ?? context.laicOrgId,
      ...(context.groupId ? { groupId: context.groupId } : {}),
    },
  };
}
