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
  AppContext,
  BridgeContext,
  NexusError,
  NexusMembership,
  fetchAppContext,
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
  /**
   * The APP's own access — provider `club-app`, resolved from the one role this
   * person holds in their club. Distinct from `bridge`, which is the desktop
   * Bridge Platform's grant.
   */
  app: AppContext | null;
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
    // Independent and all optional — one failing must not deny the others.
    const [bridge, me] = await Promise.all([
      settle(fetchBridgeContext(token)),
      settle(fetchMe(token)),
    ]);

    const memberships = me.value?.memberships ?? [];
    const value: RoleContext = {
      bridge: bridge.value,
      memberships,
      profileRole: me.value?.role ?? null,
      // Filled in per club by getAppContext — a person may be a Mentor in one
      // club and a plain member in another, so there is no single answer here.
      app: null,
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

// ── Capabilities — the fine-grained layer ────────────────────────────────────
//
// A person holds ONE role in a program (that is what the Nexus partner page
// assigns), the role has a name, and the role carries a set of capability ids
// from the APP's own access catalogue (provider `club-app`). The server resolves role → capabilities and
// sends them on /bridge/context; every gate in the app reads them through can().
//
// isCoach stays, and stays meaningful: it is the STRUCTURAL TIER check
// (owner/administrator of this program), which the catalogue design keeps
// bypassing every fine grant. A club's admin does not need a role to run it.

/** The capability ids this person's app role grants; empty when they hold none. */
export function capabilitiesOf(context: RoleContext | null): Set<string> {
  return new Set(context?.app?.capabilities ?? []);
}

/** Does this person hold a fine-grained role at all? */
export function hasFineGrants(context: RoleContext | null): boolean {
  return capabilitiesOf(context).size > 0;
}

/**
 * May this person do `capability`?
 *
 * Three cases, in order:
 *   1. A structural tier (the club's owner/administrator) — always yes. They
 *      bypass the catalogue server-side too, so gating them here would only
 *      disagree with the server.
 *   2. A fine-grained role — exactly what the role grants, nothing more.
 *   3. NO role yet — fall back to `fallback`, which each call site sets to the
 *      behaviour that shipped before roles existed. Without this an account that
 *      predates role assignment would lose surfaces it has always had, and the
 *      server's own convention (enforce.ts: "empty set → the coarse guard
 *      governs") would disagree with the app. Once a club assigns roles, case 2
 *      takes over and the fallback stops being reached.
 */
export function can(
  context: RoleContext | null,
  capability: string,
  fallback = false,
): boolean {
  if (!context) return fallback;
  if (isCoach(context)) return true;
  const caps = capabilitiesOf(context);
  if (caps.size === 0) return fallback;
  return caps.has(capability);
}

/** The name of the ONE role this person holds, for display beside them. */
export function roleNameOf(context: RoleContext | null): string | null {
  return context?.app?.role_name ?? null;
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
  if (primary && ADMIN_ROLES.has(primary.role.toLowerCase())) return true;
  // No membership to judge by — the profile role may still administer.
  if (
    !primary &&
    context.profileRole &&
    ADMIN_PROFILE_ROLES.has(context.profileRole.toLowerCase())
  ) {
    return true;
  }
  // The Bridge grant last, and it only ever ADDS coach access (the header's
  // promise) — a hired coach is usually enrolled as a plain "member", with
  // their coach-ness carried by the bridge_coach platform role. The Club 1
  // fix above is not weakened: partner-program members have no Bridge grant
  // at all (/bridge/context 403s for them), so nothing here promotes them.
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

// ── The app's access, per club ───────────────────────────────────────────────
//
// Keyed by (token, programId): capabilities belong to a club, so switching clubs
// switches what you may do. Cached so every gate on a screen shares one fetch.
const appCache = new Map<string, AppContext | null>();
const appInflight = new Map<string, Promise<AppContext | null>>();
const appKey = (token: string, programId: string) => `${token}::${programId}`;

/** The caller's access in ONE club, or null when it cannot be resolved. */
export async function getAppContext(
  token: string,
  programId: string,
): Promise<AppContext | null> {
  const key = appKey(token, programId);
  if (appCache.has(key)) return appCache.get(key) ?? null;
  const existing = appInflight.get(key);
  if (existing) return existing;

  const promise = settle(fetchAppContext(token, programId))
    .then(({ answered, value }) => {
      // Only an ANSWERED resolve is cached; a hiccup would otherwise pin an
      // empty capability set (and so the permissive fallback) for the session.
      if (answered) appCache.set(key, value);
      return value;
    })
    .finally(() => appInflight.delete(key));
  appInflight.set(key, promise);
  return promise;
}

/** Synchronously, for a first paint that does not flash the fallback. */
export function peekAppContext(token: string, programId: string): AppContext | null {
  return appCache.get(appKey(token, programId)) ?? null;
}

/** Drop the app access for one club (or all), so the next read refetches. */
export function clearAppContext(token?: string, programId?: string): void {
  if (token && programId) {
    appCache.delete(appKey(token, programId));
    return;
  }
  appCache.clear();
  appInflight.clear();
}

/** Everyone currently rendering a gate, so a refresh redraws all of them. */
const roleListeners = new Set<(ctx: RoleContext) => void>();

export function subscribeToRoleContext(fn: (ctx: RoleContext) => void): () => void {
  roleListeners.add(fn);
  return () => roleListeners.delete(fn);
}

/**
 * Re-resolve from the server, ignoring the cache, and tell every gate.
 *
 * Roles are edited in the Nexus console while the app is open, and the resolve
 * is cached for the session — so without this, a permission change needed a
 * sign-out to take effect. Called when the app returns to the foreground, which
 * is exactly when someone comes back from changing something.
 */
export async function refreshRoleContext(token: string): Promise<RoleContext> {
  if (cached?.token === token) cached = null;
  inflight = null;
  // Per-club access is part of what a refresh is for — a role edited in the
  // console changes capabilities, not memberships.
  clearAppContext();
  const value = await getRoleContext(token);
  for (const fn of roleListeners) fn(value);
  return value;
}

export function clearBridgeRoleCache(): void {
  cached = null;
  inflight = null;
  clearAppContext();
}

/**
 * Back-compat alias: every call site already does
 * `getBridgeContextCached(token).then(ctx => isCoach(ctx))`, and both halves
 * still typecheck against the richer context.
 */
export const getBridgeContextCached = getRoleContext;
