// Which view does this person get — coach or learner?
//
// Two independent signals, in priority order:
//
//  1. THEIR NEXUS MEMBERSHIP ROLE (/auth/me → memberships[].role). This is what
//     links the app to the console: whoever an admin adds to a program in Nexus
//     lands in the right view here automatically, with no list to maintain. An
//     "owner" or "administrator" (a super admin is the org owner) gets the coach
//     view; "member" and "student" get the learner view.
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
  NexusError,
  NexusMembership,
  fetchBridgeContext,
  fetchMe,
} from "./nexus";

export type { BridgeContext } from "./nexus";

/** Membership roles that administer a program, and so get the coach view. */
const ADMIN_ROLES = new Set(["owner", "administrator", "instructor", "teacher", "coach"]);

/** Profile-level roles that administer, for accounts holding no membership. */
const ADMIN_PROFILE_ROLES = new Set(["org_admin", "platform_admin", "teacher"]);

/** Everything we know about the caller's standing, resolved once per session. */
export type RoleContext = {
  bridge: BridgeContext | null;
  memberships: NexusMembership[];
  profileRole: string | null;
};

// Session-scoped cache, keyed by TOKEN: an in-flight fetch from a previous
// session that resolves after sign-out must never leak its role into the next.
// The in-flight promise is shared too, so the sign-in prime and the first
// screen to ask don't race each other into duplicate round-trips.
let cached: { token: string; value: RoleContext } | null = null;
let inflight: { token: string; promise: Promise<RoleContext> } | null = null;

/** The last resolved context for this token, synchronously — render it NOW.
 *  Null only before the first resolve (the sign-in prime usually beats any
 *  screen here). */
export function peekRoleContext(token: string): RoleContext | null {
  return cached?.token === token ? cached.value : null;
}

/**
 * A 4xx is an ANSWER (403 = "no bridge grant", by design for partner-program
 * members); a network failure or 5xx is a hiccup. The distinction decides
 * whether the resolve below may be cached: caching a hiccup would pin the
 * safe-default learner view on a real coach for the whole session.
 */
async function settle<T>(promise: Promise<T>): Promise<{ answered: boolean; value: T | null }> {
  try {
    return { answered: true, value: await promise };
  } catch (e) {
    const answered = e instanceof NexusError && e.status >= 400 && e.status < 500;
    return { answered, value: null };
  }
}

export async function getRoleContext(token: string): Promise<RoleContext> {
  if (cached && cached.token === token) return cached.value;
  if (inflight && inflight.token === token) return inflight.promise;

  const promise = (async () => {
    // Independent and both optional — one failing must not deny the other.
    const [bridge, me] = await Promise.all([
      settle(fetchBridgeContext(token)),
      settle(fetchMe(token)),
    ]);

    const value: RoleContext = {
      bridge: bridge.value,
      memberships: me.value?.memberships ?? [],
      profileRole: me.value?.role ?? null,
    };
    // Only an ANSWERED resolve is worth remembering; a hiccup retries on the
    // next call instead of masquerading as "learner" until sign-out.
    if (bridge.answered || me.answered) cached = { token, value };
    return value;
  })().finally(() => {
    if (inflight?.token === token) inflight = null;
  });
  inflight = { token, promise };
  return promise;
}

/** True when any membership — or the profile role — administers. */
export function isCoach(context: RoleContext | BridgeContext | null): boolean {
  if (!context) return false;

  // Tolerate a bare BridgeContext so any older call site keeps working.
  if (!("memberships" in context)) return _bridgeGrantsCoach(context);

  if (context.memberships.some((m) => ADMIN_ROLES.has(m.role.toLowerCase()))) {
    return true;
  }
  // Only trusted when there is no membership to judge by: a profile role of
  // "teacher" can outlive a demotion to member inside a specific program.
  if (
    context.memberships.length === 0 &&
    context.profileRole &&
    ADMIN_PROFILE_ROLES.has(context.profileRole.toLowerCase())
  ) {
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
  inflight = null;
}

/**
 * Back-compat alias: every call site already does
 * `getBridgeContextCached(token).then(ctx => isCoach(ctx))`, and both halves
 * still typecheck against the richer context.
 */
export const getBridgeContextCached = getRoleContext;
