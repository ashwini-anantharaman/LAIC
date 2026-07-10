/**
 * Bridge Program context endpoint — the Bridge workstream's integration
 * surface (see NEXUS_BRIDGE_INTEGRATION.md for review notes).
 *
 * Assembles the `NexusBridgeContext` consumed by Applications/BridgePlatform
 * (shape: Components/laic-learner-contracts; Bridge plan §3.3). This is a THIN
 * projection of existing Nexus data — organizations act as Bridge Program
 * Organizations, stage scopes act as groups, membership roles map onto bridge
 * roles.
 */

import { Hono } from "hono";

import { getSettings, type Settings } from "../config";
import { getCurrentUser, type PlatformUser } from "../auth";

// Existing Nexus membership roles -> bridge roles (documented mapping).
const MEMBERSHIP_ROLE_MAP: Record<string, string> = {
  owner: "bridge_org_admin",
  administrator: "bridge_org_admin",
  teacher: "bridge_coach",
  student: "bridge_learner",
};

const ROLE_PERMISSIONS: Record<string, string[]> = {
  bridge_learner: ["bridge.session.create", "bridge.session.play", "bridge.progress.read_own"],
  bridge_coach: [
    "bridge.session.create",
    "bridge.session.play",
    "bridge.progress.read_own",
    "bridge.progress.read_learners",
    "bridge.group.manage",
    "bridge.config.manage_own",
  ],
  bridge_org_admin: [
    "bridge.session.create",
    "bridge.session.play",
    "bridge.org.manage",
    "bridge.config.manage_org",
    "bridge.progress.read_org",
  ],
  bridge_program_admin: [
    "bridge.program.manage",
    "bridge.org.manage",
    "bridge.knowledge.review",
    "bridge.knowledge.publish",
    "bridge.progress.read_program",
  ],
  bridge_reviewer: [
    "bridge.session.create",
    "bridge.session.play",
    "bridge.knowledge.review",
    "bridge.knowledge.edit",
  ],
};

const _ACCESS_PRECEDENCE = ["admin", "coach", "reviewer", "learner", "guest"];

function _emails(csv: string): Set<string> {
  return new Set(
    (csv || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function computeBridgeContext(user: PlatformUser, settings: Settings): Record<string, unknown> {
  const roles: string[] = [];
  const accessCandidates: string[] = [];

  // Program-level roles are config-seeded (env) until a grant UI exists.
  const email = (user.email || "").toLowerCase();
  if (_emails(settings.bridgeProgramAdminEmails).has(email)) {
    roles.push("bridge_program_admin");
    accessCandidates.push("admin");
  }
  if (_emails(settings.bridgeReviewerEmails).has(email)) {
    roles.push("bridge_reviewer", "bridge_fellow");
    accessCandidates.push("reviewer");
  }

  // Organization scope: the user's first membership. Its org acts as the
  // Bridge Program Organization; its stage scope acts as the group.
  const membership = user.memberships.length ? user.memberships[0] : null;
  if (membership !== null) {
    const mapped = MEMBERSHIP_ROLE_MAP[membership.role];
    if (mapped && !roles.includes(mapped)) {
      roles.push(mapped);
      accessCandidates.push(
        mapped === "bridge_org_admin" ? "admin" : mapped === "bridge_coach" ? "coach" : "learner",
      );
    }
  }

  if (roles.length === 0) {
    roles.push("bridge_guest");
    accessCandidates.push("guest");
  }

  const permissions = Array.from(
    new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r] ?? [])),
  ).sort();
  const accessLevel = _ACCESS_PRECEDENCE.find((a) => accessCandidates.includes(a))!;

  // Program admins/reviewers operate program-wide: no org scope attached.
  const programScoped = (accessLevel === "admin" || accessLevel === "reviewer") && membership === null;

  return {
    nexusUserId: user.id,
    laicOrgId: settings.laicOrgId,
    programId: "bridge_program",
    programOrganizationId: programScoped ? null : membership ? membership.org_id : null,
    groupId: membership ? membership.stage_node_id : null,
    appId: "bridge_ai_coach",
    roles,
    permissions,
    accessLevel,
  };
}

export const bridgeRouter = new Hono();

bridgeRouter.get("/context", async (c) => {
  const user = await getCurrentUser(c);
  return c.json(computeBridgeContext(user, getSettings()));
});
