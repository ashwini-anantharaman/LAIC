// Which view does this person get — coach or learner?
//
// Two independent signals, in priority order:
//
//  1. THEIR NEXUS MEMBERSHIP ROLE for the program this app is about
//     (/auth/me → memberships[].role, picked by primaryMembership). This is what
//     links the app to the console: whoever an admin adds to a program in Nexus
//     lands in the right view here automatically, with no list to maintain. An
//     "owner" or "administrator" (a super admin is the org owner) gets the coach
//     view; "member" and "student" get the learner view. A membership elsewhere
//     is irrelevant — being an admin of another program must not grant coach
//     access to this club.
//
//  2. The Bridge platform grant (/bridge/context), which is program-scoped to
//     the Bridge Program. People in a PARTNER program such as Club 1 have no
//     Bridge grant at all — that endpoint 403s for them — so it can only ever
//     add coach access, never remove it.
//
// Anyone we cannot classify is a learner: the learner view is the safe default,
// since it exposes no coach-only surfaces.

import {
  BridgeContext,
  NexusMembership,
  NexusUser,
  fetchBridgeContext,
  fetchMe,
} from "./nexus";

export type { BridgeContext } from "./nexus";

/** Membership roles that administer a program, and so get the coach view. */
const ADMIN_ROLES = new Set(["owner", "administrator", "instructor", "teacher", "coach"]);

/**
 * Profile-level roles that administer, used ONLY when someone holds no
 * membership at all.
 *
 * "teacher" is deliberately NOT here. The platform writes profiles.role =
 * "teacher" for everyone invited into a program — see the enroll path in
 * routes/offerings.ts, which passes role: "teacher" unconditionally — so it says
 * nothing about whether the person administers anything. Trusting it put every
 * Club 1 member into the coach view.
 *
 * profiles.role is also constrained to just ('student','teacher') by migration
 * 0001, so it is far too coarse to carry an authorization decision. The
 * membership role is the real signal.
 */
const ADMIN_PROFILE_ROLES = new Set(["org_admin", "platform_admin"]);

/** Everything we know about the caller's standing, resolved once per session. */
export type RoleContext = {
  bridge: BridgeContext | null;
  memberships: NexusMembership[];
  profileRole: string | null;
};

// Session-scoped cache, keyed by TOKEN: an in-flight fetch from a previous
// session that resolves after sign-out must never leak its role into the next.
let cached: { token: string; value: RoleContext } | null = null;

export async function getRoleContext(token: string): Promise<RoleContext> {
  if (cached && cached.token === token) return cached.value;

  // Independent and both optional — one failing must not deny the other.
  const [bridge, me] = await Promise.all([
    fetchBridgeContext(token).catch(() => null),
    fetchMe(token).catch(() => null as NexusUser | null),
  ]);

  const value: RoleContext = {
    bridge,
    memberships: me?.memberships ?? [],
    profileRole: me?.role ?? null,
  };
  cached = { token, value };
  return value;
}

/** True when the person's OWN program membership administers it. */
export function isCoach(context: RoleContext | BridgeContext | null): boolean {
  if (!context) return false;

  // Tolerate a bare BridgeContext so any older call site keeps working.
  if (!("memberships" in context)) return _bridgeGrantsCoach(context);

  // Judge by the membership this app is ABOUT — the person's club/program — not
  // by any membership anywhere. Someone can be a learner in Club 1 and an
  // administrator of an unrelated program; that must not make them a coach here.
  const primary = primaryMembership(context);
  if (primary) return ADMIN_ROLES.has(primary.role.toLowerCase());
  // No membership to judge by — fall back to the profile role, then to a Bridge
  // platform grant.
  if (context.profileRole && ADMIN_PROFILE_ROLES.has(context.profileRole.toLowerCase())) {
    return true;
  }
  return _bridgeGrantsCoach(context.bridge);
}

function _bridgeGrantsCoach(bridge: BridgeContext | null): boolean {
  if (!bridge) return false;
  return (
    bridge.is_admin ||
    bridge.accessLevel === "coach" ||
    bridge.accessLevel === "admin" ||
    bridge.roles.includes("bridge_coach") ||
    bridge.roles.includes("bridge_program_admin")
  );
}

/** The program this person belongs to — a partner club wins over the default. */
export function primaryMembership(context: RoleContext): NexusMembership | null {
  const withProgram = context.memberships.filter((m) => m.program_id);
  return (
    withProgram.find((m) => m.program_category === "partner") ??
    withProgram[0] ??
    context.memberships[0] ??
    null
  );
}

export function clearBridgeRoleCache(): void {
  cached = null;
}

/**
 * Back-compat alias: every call site already does
 * `getBridgeContextCached(token).then(ctx => isCoach(ctx))`, and both halves
 * still typecheck against the richer context.
 */
export const getBridgeContextCached = getRoleContext;
