/** Supabase Auth JWT verification and platform user context. */

import type { Context } from "hono";

import { getSettings } from "./config";
import { HttpError } from "./httpError";
import * as platformDb from "./platformDb";
import * as local from "./platformLocalStore";
import type { Membership } from "./permissions";
import { createEphemeralClient, requireAdminClient, requireClient } from "./supabaseClient";
import { verifyJwtLocally } from "./jwtLocal";
import { dbEnabled } from "./db/client";
import * as demoAuth from "./db/demoAuthRepo";
import * as pg from "./db/identityRepo";

type Row = Record<string, any>;

export interface PlatformUser {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  memberships: Membership[];
}

/**
 * Resolved identity for a Registered App calling the signup hook. A distinct
 * principal type from PlatformUser — an app's API key, not a user session.
 */
export interface AuthenticatedApp {
  id: string;
  organization_id: string;
  program_id: string | null;
  offering_id: string | null;
  app_slug: string;
  allowed_identifiers: string;
  status: string;
  launch_url: string | null;
  launch_context: Row;
}

// Test hooks mirroring FastAPI's `app.dependency_overrides[...]`.
let _currentUserOverride: (() => PlatformUser | Promise<PlatformUser>) | null = null;
export function setCurrentUserOverride(
  fn: (() => PlatformUser | Promise<PlatformUser>) | null,
): void {
  _currentUserOverride = fn;
}

let _authenticatedAppOverride: (() => AuthenticatedApp | Promise<AuthenticatedApp>) | null = null;
export function setAuthenticatedAppOverride(
  fn: (() => AuthenticatedApp | Promise<AuthenticatedApp>) | null,
): void {
  _authenticatedAppOverride = fn;
}

const _ROLE_ALIASES: Record<string, string> = { teacher: "instructor" };

/**
 * Run the whole platform locally (demo mode) when Supabase isn't configured
 * OR isn't reachable / not migrated. Mirrors platformDb's local-store fallback
 * so auth and data storage always agree on which backend is in use.
 */
export async function demoMode(): Promise<boolean> {
  if (!getSettings().supabaseEnabled) return true;
  try {
    return await platformDb.useLocal();
  } catch {
    return true;
  }
}

function _rowToMembership(row: Row, stageRow?: Row | null): Membership {
  return {
    id: row.id,
    org_id: row.org_id,
    profile_id: row.profile_id,
    role: _ROLE_ALIASES[row.role] ?? row.role,
    stage_node_id: row.stage_node_id ?? null,
    access: row.access ?? "view",
    stage_path: stageRow ? stageRow.path ?? null : null,
    stage_type: stageRow ? stageRow.stage_type ?? null : null,
    program_id: row.program_id ?? null,
  };
}

function _bearerToken(c: Context): string | null {
  const header = c.req.header("Authorization") ?? c.req.header("authorization");
  if (!header) return null;
  const parts = header.split(/\s+/);
  if (parts.length !== 2 || !/^bearer$/i.test(parts[0]) || !parts[1]) return null;
  return parts[1];
}

export async function verifyToken(token: string): Promise<{ id: string; email: string }> {
  if (await demoMode()) {
    const user = dbEnabled() ? await demoAuth.getDemoAuthUser(token) : local.localAuthGetUser(token);
    if (user === null) throw new HttpError(401, "Invalid token");
    return { id: user.id, email: user.email };
  }
  // In-process first: the project's tokens are ES256 JWTs whose public keys
  // are published, so the signature checks locally in microseconds instead of
  // one HTTPS round trip to Supabase Auth per request (~150-300ms, and the
  // floor under EVERY endpoint's latency — see jwtLocal.ts, including the
  // revocation trade accepted there).
  const verdict = await verifyJwtLocally(token);
  if (verdict.kind === "verified") return { id: verdict.id, email: verdict.email };
  // A token of ours that failed its checks is a hard 401 — falling back to the
  // network here would turn a forged signature into a second opinion.
  if (verdict.kind === "invalid") throw new HttpError(401, "Invalid token");
  // Unverifiable (not a JWT, foreign alg, unknown kid, JWKS unreachable):
  // the pre-existing network path decides, exactly as before.
  const client = requireAdminClient();
  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data || !data.user) throw new HttpError(401, "Invalid token");
    return { id: data.user.id, email: data.user.email ?? "" };
  } catch (exc) {
    if (exc instanceof HttpError) throw exc;
    throw new HttpError(401, "Invalid token");
  }
}

export async function loadPlatformUser(userId: string, email: string): Promise<PlatformUser> {
  // Canonical Postgres path (v0.4): identity is resolved via a privileged
  // bootstrap read; tenant DATA reads then run under RLS context.
  if (dbEnabled()) {
    const { profile, memberships } = await pg.loadUser(userId);
    if (!profile) throw new HttpError(404, "Profile not found");
    return {
      id: userId,
      email: email || (profile.email as string) || "",
      display_name: (profile.display_name as string) ?? null,
      role: (profile.role as string) || "student",
      memberships,
    };
  }

  if (await platformDb.useLocal()) {
    const profile = local.localGetProfile(userId);
    if (!profile) throw new HttpError(404, "Profile not found");
    const membershipRows = local.localGetMemberships(userId);
    const stageMap = new Map<string, Row>();
    for (const m of membershipRows) {
      const orgId = m.org_id;
      if (orgId) {
        for (const s of local.localListStageNodes(orgId)) {
          stageMap.set(s.id, s as unknown as Row);
        }
      }
    }
    const memberships = membershipRows.map((m) =>
      _rowToMembership(m, m.stage_node_id ? stageMap.get(m.stage_node_id) : null),
    );
    return {
      id: userId,
      email: email || profile.email || "",
      display_name: profile.display_name || profile.name || null,
      role: profile.role || "student",
      memberships,
    };
  }

  const client = requireClient();

  const { data: profiles, error: profileError } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .limit(1);
  if (profileError || !profiles || profiles.length === 0) {
    throw new HttpError(404, "Profile not found");
  }
  const profile = profiles[0];

  const { data: membershipRows } = await client
    .from("org_memberships")
    .select("*")
    .eq("profile_id", userId);
  const rows: Row[] = membershipRows ?? [];

  const stageIds = rows.filter((m) => m.stage_node_id).map((m) => m.stage_node_id);
  const stageMap = new Map<string, Row>();
  if (stageIds.length > 0) {
    const { data: stages } = await client.from("stage_nodes").select("*").in("id", stageIds);
    for (const s of stages ?? []) stageMap.set(s.id, s);
  }

  const memberships = rows.map((m) =>
    _rowToMembership(m, m.stage_node_id ? stageMap.get(m.stage_node_id) : null),
  );

  return {
    id: userId,
    email: email || profile.email || "",
    display_name: profile.display_name || profile.name || null,
    role: profile.role || "student",
    memberships,
  };
}

// ── Per-request identity, without a per-request identity QUERY ───────────────
// After the JWT verifies locally, profile+memberships was the remaining
// round trip on every request — and it costs more for exactly the people who
// use the platform most (a coach's membership fan-out reads measurably slower
// than a learner's). One profile rarely changes second to second, so warm
// instances remember it briefly.
//
// TTL 30s: a role change or new membership shows up within half a minute on a
// warm instance — well inside the 1-hour staleness the token itself already
// carries. The cache serves ONLY getCurrentUser/getOptionalUser; login and
// signup flows call loadPlatformUser directly and always read fresh, so
// "sign up then land on your dashboard" can never see the pre-signup void.
// Under vitest the cache is off: tests mutate roles mid-flow and assert the
// next request sees it.
const USER_CACHE_TTL_MS = 30_000;
const USER_CACHE_MAX = 5_000;
const _userCache = new Map<string, { user: PlatformUser; at: number }>();

async function _cachedPlatformUser(authId: string, email: string): Promise<PlatformUser> {
  if (process.env.VITEST) return loadPlatformUser(authId, email);
  const hit = _userCache.get(authId);
  if (hit && Date.now() - hit.at < USER_CACHE_TTL_MS) return hit.user;
  const user = await loadPlatformUser(authId, email);
  if (_userCache.size >= USER_CACHE_MAX) _userCache.clear(); // crude, sufficient
  _userCache.set(authId, { user, at: Date.now() });
  return user;
}

/** Drop one user's (or everyone's) cached identity — call after writes that
 *  must be visible on the very next request rather than within the TTL. */
export function invalidatePlatformUser(authId?: string): void {
  if (authId) _userCache.delete(authId);
  else _userCache.clear();
}

export async function getCurrentUser(c: Context): Promise<PlatformUser> {
  if (_currentUserOverride) return _currentUserOverride();
  const token = _bearerToken(c);
  if (!token) throw new HttpError(401, "Authentication required");
  const auth = await verifyToken(token);
  return _cachedPlatformUser(auth.id, auth.email);
}

export async function getOptionalUser(c: Context): Promise<PlatformUser | null> {
  if (_currentUserOverride) return _currentUserOverride();
  const token = _bearerToken(c);
  if (!token) return null;
  try {
    const auth = await verifyToken(token);
    return await _cachedPlatformUser(auth.id, auth.email);
  } catch (exc) {
    if (exc instanceof HttpError) return null;
    throw exc;
  }
}

export async function createAuthUser(email: string, password: string): Promise<Row> {
  if (await demoMode()) {
    return dbEnabled() ? demoAuth.createDemoAuthUser(email, password) : local.localAuthCreateUser(email, password);
  }
  const client = requireAdminClient();
  try {
    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    if (!data || !data.user) throw new HttpError(400, "Failed to create user");
    return { id: data.user.id, email: data.user.email ?? email };
  } catch (exc) {
    if (exc instanceof HttpError) throw exc;
    const msg = String((exc as Error)?.message ?? exc);
    if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("duplicate")) {
      throw new HttpError(409, "Email already registered");
    }
    throw new HttpError(400, `Signup failed: ${msg}`);
  }
}

/**
 * Set someone's password on their behalf — an ADMIN action, never self-service.
 * The caller is responsible for proving the actor may administer this person
 * (see the credentials route's guards); this function only does the write.
 *
 * Covers all three auth backends: Supabase in production, the Postgres-backed
 * demo store, and the JSON local store.
 */
export async function setAuthUserPassword(email: string, password: string): Promise<Row> {
  if (await demoMode()) {
    return dbEnabled()
      ? demoAuth.setDemoAuthPassword(email, password)
      : local.localAuthSetPassword(email, password);
  }
  const client = requireAdminClient();
  // Supabase's admin API keys off the auth user id, so resolve the email first.
  const { data: list, error: listErr } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw new HttpError(502, `Could not look up the account: ${listErr.message}`);
  const target = (list?.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  if (!target) throw new HttpError(404, "No account for that email");
  const { error } = await client.auth.admin.updateUserById(target.id, { password });
  if (error) throw new HttpError(400, `Could not set the password: ${error.message}`);
  return { id: target.id, email: target.email ?? email };
}

/**
 * Bearer-token auth for /api/hook/* — a per-app API key, verified against
 * registered_apps.api_key_hash. Separate from getCurrentUser by design.
 * Per-app rate limiting is applied at the hook route layer (see routes/hook.ts
 * `_authAndLimit` + src/rateLimit.ts), v0.4 §31.
 */
export async function getAuthenticatedApp(c: Context): Promise<AuthenticatedApp> {
  if (_authenticatedAppOverride) return _authenticatedAppOverride();
  const token = _bearerToken(c);
  if (!token) throw new HttpError(401, "App API key required");
  const row = await platformDb.getRegisteredAppByHash(local.hashApiKey(token));
  if (!row || row.status !== "active") {
    throw new HttpError(401, "Invalid or revoked app API key");
  }
  return {
    id: row.id,
    organization_id: row.organization_id,
    program_id: row.program_id ?? null,
    offering_id: row.offering_id ?? null,
    app_slug: row.app_slug,
    allowed_identifiers: row.allowed_identifiers ?? "email",
    status: row.status,
    launch_url: row.launch_url ?? null,
    launch_context: row.launch_context ?? {},
  };
}

/**
 * Swap a short-lived, single-use launch token (minted by
 * GET /api/apps/{id}/launch-context for one specific user) for a real session
 * access_token. Deliberately simple — no OAuth/PKCE: the token was already tied
 * to a user_id at issuance, so a successful consume just mints that user a fresh
 * session. Replaces handing a long-lived platform session token in a URL.
 */
/**
 * Mint a real Supabase session (an access-token JWT) for a known user BY EMAIL,
 * without their password — via an admin-generated magic link that an ephemeral
 * client immediately verifies. Supabase mode only. Shared by the launch-token
 * exchange and, in dev, the "test as" quick-login, so both produce a genuine
 * JWT the rest of the app accepts (never a raw id).
 */
export async function mintSupabaseSession(email: string): Promise<string> {
  const admin = requireAdminClient();
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !link?.properties?.hashed_token) {
    throw new HttpError(500, `Failed to mint session: ${linkError?.message ?? "no link"}`);
  }
  const ephemeral = createEphemeralClient();
  const { data: verified, error: verifyError } = await ephemeral.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError || !verified?.session) throw new HttpError(500, "Failed to mint session");
  return verified.session.access_token;
}

export async function exchangeLaunchToken(rawToken: string): Promise<Row> {
  const consumed = await platformDb.consumeLaunchToken(rawToken);
  if (!consumed) throw new HttpError(401, "Invalid or expired launch token");
  const userId = consumed.user_id;

  if (await demoMode()) {
    // Demo-mode access tokens are the AUTH credential id (see localAuthSignIn),
    // but the launch token stores the org-scoped profile id (person-FK rule) —
    // resolve back to the credential. Legacy/local rows have profile id ==
    // auth id, so the fallback keeps them working.
    const profile = await platformDb.getProfile(userId);
    return { access_token: (profile?.auth_user_id as string) ?? userId };
  }

  const profile = await platformDb.getProfile(userId);
  const email = profile?.email;
  if (!email) throw new HttpError(500, "Could not resolve user for launch token");
  try {
    return { access_token: await mintSupabaseSession(email) };
  } catch (exc) {
    if (exc instanceof HttpError) throw exc;
    throw new HttpError(500, `Failed to exchange launch token: ${exc}`);
  }
}

export async function signInUser(email: string, password: string): Promise<Row> {
  if (await demoMode()) {
    return dbEnabled() ? demoAuth.signInDemoAuthUser(email, password) : local.localAuthSignIn(email, password);
  }
  // Ephemeral client so login never overwrites the admin client's service-role session.
  const client = createEphemeralClient();
  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data?.session || !data?.user) {
      throw new HttpError(401, "Invalid credentials");
    }
    return {
      id: data.user.id,
      email: data.user.email ?? email,
      access_token: data.session.access_token,
    };
  } catch (exc) {
    if (exc instanceof HttpError) throw exc;
    throw new HttpError(401, "Invalid credentials");
  }
}
