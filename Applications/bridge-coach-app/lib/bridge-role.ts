// Which view does this person get — coach or learner?
//
// Two independent signals, in priority order:
//
//  1. THEIR NEXUS MEMBERSHIP ROLE for the program this app is about
//     (/auth/me → memberships[].role, picked by primaryMembership). This is what
//     links the app to the console: whoever an admin adds to a program in Nexus
//     lands in the right view here automatically, with no list to maintain. An
//     "owner" or "administrator" (a super admin is the org owner) gets the coach
//     view; every other membership role gets the learner view — including
//     "instructor", which Nexus writes as the low-privilege BASE membership for
//     everyone it enrolls, so it identifies nobody. A membership elsewhere
//     is irrelevant — being an admin of another program must not grant coach
//     access to this club.
//
//  2. The Bridge platform grant (/bridge/context), asked about the SELECTED
//     CLUB. For a club's people the server derives the answer from their club
//     role: a role granting the coaching menu (app.coaching.view — the club's
//     "Mentors"-shaped roles) emits bridge_coach, everyone else emits
//     bridge_club_member. Only the ROLES array is trusted here — accessLevel
//     once said "coach" for every club member while roles said
//     bridge_club_member, and believing it put the whole of B2F3 into the
//     coach view. The grant can only ever add coach access, never remove it.
//
// Anyone we cannot classify is a learner: the learner view is the safe default,
// since it exposes no coach-only surfaces.

import {
  AppContext,
  BridgeContext,
  NexusError,
  NexusMembership,
  NexusUser,
  fetchAppContext,
  fetchBridgeContext,
  fetchMe,
} from "./nexus";

export type { BridgeContext } from "./nexus";

/**
 * Membership roles that administer a program, and so get the coach view.
 *
 * "instructor" (and its legacy alias "teacher") is deliberately NOT here.
 * Nexus writes membership role "instructor" as the LOW-PRIVILEGE BASE for
 * everyone enrolled through any path — the club invite, both gate joins — and
 * the schema's membershipRole enum has no "member" at all, so instructor is
 * what every club member holds ("the real permissions come from the role",
 * per the gate-join path). Treating it as coach-ish put the whole of B2F3,
 * assigned Members and all, into the coach view before the bridge grant was
 * even consulted. Real coach-ness arrives via signal 2: the bridge grant's
 * roles array (bridge_coach — from a club role granting the coaching menu, or
 * a platform-role assignment in the main program).
 */
const ADMIN_ROLES = new Set(["owner", "administrator"]);

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

// Session-scoped cache, keyed by TOKEN AND PROGRAM: an in-flight fetch from a
// previous session that resolves after sign-out must never leak its role into
// the next. The in-flight promise is shared too, so the sign-in prime and the
// first screen to ask don't race each other into duplicate round-trips.
//
// A MAP, not one slot. The app asks both questions constantly and side by side:
// the tabs layout's gates (useCan → useRoleContext) ask APP-WIDE, while Play,
// Coach and the profile sheet ask about the SELECTED CLUB. With a single slot
// each answer evicted the other on arrival, so every one of those reads missed
// and paid a fresh round-trip — which is what made Play's coach-only Curated
// Deals card arrive seconds after the grid, on every visit and not just the
// first. Same shape as appCache below, and for the same reason.
const roleCache = new Map<string, RoleContext>();
const roleInflight = new Map<string, Promise<RoleContext>>();
const roleKey = (token: string, programId?: string) => `${token}::${programId ?? ""}`;

/** The last resolved context for this token, synchronously — render it NOW.
 *  Null only before the first resolve (the sign-in prime usually beats any
 *  screen here). */
export function peekRoleContext(token: string, programId?: string): RoleContext | null {
  // Same key shape as getRoleContext — a bare-token compare would never hit and
  // would quietly throw away the sign-in prime.
  return roleCache.get(roleKey(token, programId)) ?? null;
}

/**
 * A 4xx is an ANSWER (403 = "no bridge grant", by design for partner-program
 * members); a network failure or 5xx is a hiccup. The distinction decides
 * whether the resolve below may be cached: caching a hiccup would pin the
 * safe-default learner view on a real coach for the whole session.
 */
type Settled<T> = { answered: boolean; value: T | null };

async function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  try {
    return { answered: true, value: await promise };
  } catch (e) {
    const answered = e instanceof NexusError && e.status >= 400 && e.status < 500;
    return { answered, value: null };
  }
}

/**
 * /auth/me, shared across every PROGRAM key for one token.
 *
 * A resolve is two halves, and only one of them is club-scoped: the bridge grant
 * is asked per program, but memberships and the profile role belong to the
 * PERSON and come back identical whichever program was named. Without this the
 * club-scoped resolve — the one the Play tab's coach-only card waits on — repeats
 * an /auth/me the app-wide resolve has already paid for, and the card lands a
 * whole round-trip after the rest of the grid.
 *
 * A hiccup is dropped rather than pinned, for the same reason the resolves below
 * only cache an ANSWERED result.
 */
let meCache: { token: string; promise: Promise<Settled<NexusUser>> } | null = null;

function settledMe(token: string): Promise<Settled<NexusUser>> {
  if (meCache?.token === token) return meCache.promise;
  const entry = { token, promise: settle(fetchMe(token)) };
  meCache = entry;
  void entry.promise.then((me) => {
    if (!me.answered && meCache === entry) meCache = null;
  });
  return entry.promise;
}

/**
 * The caller's context, optionally FOR A CLUB.
 *
 * `programId` matters: the bridge context answers "what standing do you have in
 * THIS program", and a club's people have none in the app-wide Bridge Program —
 * they are in their club. Asking the wrong program returns no standing, which
 * reads as "not a coach" however much access the club granted. Pass the selected
 * club and the answer is about the club.
 *
 * Omitting it asks about the app-wide program, which is right for the one caller
 * that only wants `memberships` (the club LIST — it cannot pass a club, since the
 * clubs are what it is fetching).
 *
 * The cache is keyed by token AND program for the same reason `getAppContext` is:
 * one person has different standing in each club, so a single slot would serve
 * the previous club's answer after a switch.
 */
export async function getRoleContext(
  token: string,
  programId?: string,
): Promise<RoleContext> {
  const key = roleKey(token, programId);
  const hit = roleCache.get(key);
  if (hit) return hit;
  const pending = roleInflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    // Independent and all optional — one failing must not deny the others.
    const [bridge, me] = await Promise.all([
      settle(fetchBridgeContext(token, programId)),
      settledMe(token),
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
    if (bridge.answered || me.answered) roleCache.set(key, value);
    return value;
  })().finally(() => {
    if (roleInflight.get(key) === promise) roleInflight.delete(key);
  });
  roleInflight.set(key, promise);
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
 * Is `capability` within the org's CEILING for this club?
 *
 * Provisioning is a different question from "what does your role grant", and it has
 * to be asked FIRST, because the two cases below that make the app usable —
 * the structural-tier bypass and the empty-set fallback — both answer yes without
 * ever consulting a capability set. If the ceiling were folded into that set, an
 * admin would ignore it, which is the person most likely to test the toggle.
 *
 * Silence means UNRESTRICTED, deliberately: an older server sends neither field, and
 * a club with no `feature_access` recorded is provisioned "Full", not "None". Reading
 * absence as denial is precisely the mistake that took the `+` from B2F3's mentors.
 * Real denial arrives as `app_enabled === false`.
 *
 * Only `app.*` ids are club-app capabilities; anything else is another catalogue's
 * and no business of this ceiling.
 */
function withinProvisioning(context: RoleContext | null, capability: string): boolean {
  const app = context?.app;
  if (!app || !capability.startsWith("app.")) return true;
  if (app.app_enabled === false) return false;
  const provisioned = app.provisioned_capabilities;
  if (!provisioned || provisioned.length === 0) return true;
  return provisioned.includes(capability);
}

/**
 * May this person do `capability`?
 *
 * The org's ceiling is checked first (withinProvisioning) — a club cannot exceed
 * what it was provisioned, whoever is asking. Within the ceiling, three cases:
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
  if (!withinProvisioning(context, capability)) return false;
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
  // their coach-ness carried by the bridge_coach platform role. A club's
  // people DO hold a Bridge grant now (the app asks about the club), and it
  // carries their standing: bridge_coach for a role that grants the coaching
  // menu, bridge_club_member for everyone else.
  return _bridgeGrantsCoach(context.bridge);
}

/**
 * ROLES ONLY, deliberately — the same gate as the bridge web's isBridgeCoach.
 * accessLevel is NOT consulted: it is a coarse level readout, and for a club
 * it once said "coach" beside roles:["bridge_club_member"] (the flat partner
 * grant mapped through the level table), which put every club member — the
 * whole of B2F3 — into the coach view. The roles array is the field the
 * server actually decides per person; trust nothing softer.
 */
function _bridgeGrantsCoach(bridge: BridgeContext | null): boolean {
  if (!bridge) return false;
  return (
    bridge.is_admin ||
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
export async function refreshRoleContext(
  token: string,
  programId?: string,
): Promise<RoleContext> {
  // The cache key is `token::program`, so match on the PREFIX — every program's
  // answer for this token is stale, not just the one being asked about, and
  // leaving the others in place would keep serving the permissions this
  // function exists to clear.
  for (const key of [...roleCache.keys()]) {
    if (key.startsWith(`${token}::`)) roleCache.delete(key);
  }
  for (const key of [...roleInflight.keys()]) {
    if (key.startsWith(`${token}::`)) roleInflight.delete(key);
  }
  // Memberships and the profile role are half of what a resolve decides on, so
  // a refresh that kept them would re-resolve against the same stale answer.
  if (meCache?.token === token) meCache = null;
  // Per-club access is part of what a refresh is for — a role edited in the
  // console changes capabilities, not memberships.
  clearAppContext();
  const value = await getRoleContext(token, programId);
  for (const fn of roleListeners) fn(value);
  return value;
}

export function clearBridgeRoleCache(): void {
  roleCache.clear();
  roleInflight.clear();
  meCache = null;
  clearAppContext();
}

/**
 * Back-compat alias: every call site already does
 * `getBridgeContextCached(token).then(ctx => isCoach(ctx))`, and both halves
 * still typecheck against the richer context.
 */
export const getBridgeContextCached = getRoleContext;

/** A membership that represents a club: a partner program the person is in. */
export function isClubMembership(m: NexusMembership): boolean {
  return !!m.program_id && m.program_category === "partner";
}

/** One club as the app lists it. Mirrors the club context's `Club`. */
export type ClubMembership = {
  programId: string;
  name: string;
  orgName: string;
  /** The membership role in THIS club — the coarse tier, not its capabilities. */
  role: string;
};

/** Every club this person belongs to, alphabetical so the list is stable. */
export function clubsOf(memberships: NexusMembership[]): ClubMembership[] {
  return memberships
    .filter(isClubMembership)
    .map((m) => ({
      programId: m.program_id as string,
      name: m.program_name ?? m.org_name,
      orgName: m.org_name,
      role: m.role,
    }))
    // Deduplicate: two memberships in one program would otherwise list it twice.
    .filter((c, i, all) => all.findIndex((o) => o.programId === c.programId) === i)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The program a CLUB-ONLY account should start in: their first club
 * (alphabetical, stable), or null for everyone else. Shared by the club
 * context's default selection and the sign-in prime — the prime used to fetch
 * the app-wide summary for these accounts, a guaranteed 403 that cost a full
 * round-trip before the real fetch could even start.
 */
export function clubDefaultProgramId(memberships: NexusMembership[]): string | null {
  const clubs = clubsOf(memberships);
  if (clubs.length === 0 || memberships.length === 0) return null;
  const clubIds = new Set(clubs.map((c) => c.programId));
  const clubOnly = memberships.every((m) => m.program_id && clubIds.has(m.program_id));
  return clubOnly ? clubs[0]!.programId : null;
}

/**
 * The club the app OPENS IN, exactly as the club context will select it: one
 * club is not a choice, so it is picked outright; a club-only account with
 * several gets their default; everyone else starts on My Clubs (null).
 *
 * The sign-in prime and the club context must agree here, because everything
 * primed is cached PER PROGRAM. Priming app-wide for someone the context then
 * drops into their single club warms the wrong key, and the first screen pays
 * for a resolve it looked like it already had — which is what left the Play
 * tab's coach-only card arriving a round-trip after the rest of the grid.
 */
export function initialClubProgramId(memberships: NexusMembership[]): string | null {
  const clubs = clubsOf(memberships);
  if (clubs.length === 1) return clubs[0]!.programId;
  return clubDefaultProgramId(memberships);
}

