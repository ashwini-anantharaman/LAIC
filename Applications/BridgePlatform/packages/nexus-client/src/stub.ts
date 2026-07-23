import type { NexusBridgeContext } from "@laic/learner-contracts";
import { NexusContextError, type NexusClient } from "./types";

/**
 * Stubbed Nexus context for development, explicitly permitted by Bridge plan
 * Sequence 1 ("Auth/context loading from Nexus or stubbed Nexus context").
 * Replaced by HttpNexusClient in Phase 10 when TheNexusPlatform backend gains
 * GET /api/platform/bridge/context.
 *
 * Seed world: LAIC org -> Bridge Program -> one sample Bridge Program
 * Organization (a bridge club) with a beginners group, plus program-level
 * admin and reviewer users.
 */

export const STUB_LAIC_ORG_ID = "org_laic";
export const STUB_PROGRAM_ORG_ID = "bporg_sunrise_bridge_club";
export const STUB_GROUP_ID = "group_tuesday_beginners";
export const STUB_APP_ID = "bridge_ai_coach";

export type StubUser = {
  devUserId: string;
  displayName: string;
  /** Shown in the dev user picker. */
  description: string;
  context: NexusBridgeContext;
};

const base = {
  laicOrgId: STUB_LAIC_ORG_ID,
  programId: "bridge_program",
  appId: STUB_APP_ID,
} as const;

export const STUB_USERS: StubUser[] = [
  {
    devUserId: "user_learner_lena",
    displayName: "Lena Novak",
    description: "Learner in the Tuesday Beginners group at Sunrise Bridge Club.",
    context: {
      ...base,
      nexusUserId: "user_learner_lena",
      programOrganizationId: STUB_PROGRAM_ORG_ID,
      groupId: STUB_GROUP_ID,
      roles: ["bridge_learner"],
      permissions: [
        "bridge.session.create",
        "bridge.session.play",
        "bridge.progress.read_own",
      ],
      accessLevel: "learner",
    },
  },
  {
    devUserId: "user_coach_carlos",
    displayName: "Carlos Reyes",
    description: "Coach of the Tuesday Beginners group at Sunrise Bridge Club.",
    context: {
      ...base,
      nexusUserId: "user_coach_carlos",
      programOrganizationId: STUB_PROGRAM_ORG_ID,
      groupId: STUB_GROUP_ID,
      roles: ["bridge_coach"],
      permissions: [
        "bridge.session.create",
        "bridge.session.play",
        "bridge.progress.read_own",
        "bridge.progress.read_learners",
        "bridge.group.manage",
        "bridge.config.manage_own",
      ],
      accessLevel: "coach",
    },
  },
  {
    devUserId: "user_orgadmin_olivia",
    displayName: "Olivia Grant",
    description: "Admin of the Sunrise Bridge Club program organization.",
    context: {
      ...base,
      nexusUserId: "user_orgadmin_olivia",
      programOrganizationId: STUB_PROGRAM_ORG_ID,
      roles: ["bridge_org_admin", "bridge_club_admin"],
      permissions: [
        "bridge.session.create",
        "bridge.session.play",
        "bridge.org.manage",
        "bridge.config.manage_org",
        "bridge.progress.read_org",
      ],
      accessLevel: "admin",
    },
  },
  {
    devUserId: "user_progadmin_paul",
    displayName: "Paul Osei",
    description: "LAIC Bridge Program admin (program-level, no single club).",
    context: {
      ...base,
      nexusUserId: "user_progadmin_paul",
      roles: ["bridge_program_admin"],
      permissions: [
        "bridge.program.manage",
        "bridge.org.manage",
        "bridge.knowledge.review",
        "bridge.knowledge.edit",
        "bridge.knowledge.publish",
        "bridge.progress.read_program",
      ],
      accessLevel: "admin",
    },
  },
  {
    devUserId: "user_reviewer_rhea",
    displayName: "Rhea Kapoor",
    description: "Bridge fellow / expert reviewer of the knowledge base.",
    context: {
      ...base,
      nexusUserId: "user_reviewer_rhea",
      roles: ["bridge_reviewer", "bridge_fellow"],
      permissions: [
        "bridge.session.create",
        "bridge.session.play",
        "bridge.knowledge.review",
        "bridge.knowledge.edit",
      ],
      accessLevel: "reviewer",
    },
  },
  {
    // The single shared account behind the fellows-testing deployment: full
    // fellow/reviewer reach so they can exercise the whole workspace.
    devUserId: "user_fellow_demo",
    displayName: "Fellow",
    description: "Shared fellows-testing account.",
    context: {
      ...base,
      nexusUserId: "user_fellow_demo",
      roles: ["bridge_reviewer", "bridge_fellow"],
      permissions: [
        "bridge.session.create",
        "bridge.session.play",
        "bridge.knowledge.review",
        "bridge.knowledge.edit",
      ],
      accessLevel: "reviewer",
    },
  },
  {
    // The single shared account behind the mobile deployment: same
    // fellow/reviewer reach as the fellows-testing account, so the phone UI
    // can exercise the whole workspace.
    devUserId: "user_mobile_demo",
    displayName: "Mobile",
    description: "Shared mobile-testing account.",
    context: {
      ...base,
      nexusUserId: "user_mobile_demo",
      roles: ["bridge_reviewer", "bridge_fellow"],
      permissions: [
        "bridge.session.create",
        "bridge.session.play",
        "bridge.knowledge.review",
        "bridge.knowledge.edit",
      ],
      accessLevel: "reviewer",
    },
  },
];

export function findStubUser(devUserId: string): StubUser | undefined {
  return STUB_USERS.find((u) => u.devUserId === devUserId);
}

/** Look up the display name for a resolved context (stub mode only). */
export function stubDisplayName(nexusUserId: string): string | undefined {
  return STUB_USERS.find((u) => u.context.nexusUserId === nexusUserId)
    ?.displayName;
}

export class StubNexusClient implements NexusClient {
  constructor(private readonly devUserId: string) {}

  async getBridgeContext(): Promise<NexusBridgeContext> {
    const user = findStubUser(this.devUserId);
    if (!user) {
      throw new NexusContextError(
        `Unknown stub user "${this.devUserId}". Known users: ${STUB_USERS.map((u) => u.devUserId).join(", ")}`,
      );
    }
    return structuredClone(user.context);
  }
}
