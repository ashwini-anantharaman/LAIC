import {
  canAccessAdminArea,
  createNexusClient,
  type NexusBridgeContext,
} from "@bridge/nexus-client";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { createSupabaseServerClient } from "./supabase-server";

import { NEXUS_EMBEDDED_COOKIE, NEXUS_PROGRAM_COOKIE, NEXUS_TOKEN_COOKIE } from "./nexusToken";

export const DEV_USER_COOKIE = "bridge_dev_user";
export { NEXUS_TOKEN_COOKIE };

/** The fellows-testing deployment: same build, but reached on a demo host,
 *  it hides the login and auto-signs the caller in as the shared "Fellow"
 *  account. Host-gated (one production build serves both aliases); the demo
 *  hosts default to any alias containing "nexus-bridge-fellows" and can be
 *  overridden with FELLOW_DEMO_HOSTS (comma-separated substrings). */
export const FELLOW_DEMO_USER = "user_fellow_demo";

export const isFellowDemo = cache(async (): Promise<boolean> => {
  const hosts = (process.env.FELLOW_DEMO_HOSTS ?? "nexus-bridge-fellows")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    const host = (await headers()).get("host") ?? "";
    return hosts.some((h) => host.includes(h));
  } catch {
    return false;
  }
});

/** The mobile deployment: same build, reached on a mobile demo host, it hides
 *  the login and auto-signs the caller in as the shared "Mobile" account, then
 *  routes to the /m/* phone UI. Host-gated exactly like the fellows demo — the
 *  hosts default to any alias containing "nexus-bridge-mobile" and can be
 *  overridden with MOBILE_SITE_HOSTS (comma-separated substrings). */
export const MOBILE_DEMO_USER = "user_mobile_demo";

export const isMobileSite = cache(async (): Promise<boolean> => {
  const hosts = (process.env.MOBILE_SITE_HOSTS ?? "nexus-bridge-mobile")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    const host = (await headers()).get("host") ?? "";
    return hosts.some((h) => host.includes(h));
  } catch {
    return false;
  }
});

export type NexusMode = "stub" | "http";

/** True when Bridge is running embedded inside a host app (the App Shell
 *  iframe). The host provides the exit control, so Bridge hides its own. */
export async function isEmbeddedLaunch(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(NEXUS_EMBEDDED_COOKIE)?.value === "1";
}

/**
 * The caller's Nexus session token for THIS request — the one credential the
 * whole context/roster/library layer resolves from. Two carriers, one answer:
 *   - `Authorization: Bearer <token>` — the native app, whose fetch has no
 *     WebView cookie jar to send (same token the cookie would carry).
 *   - the launch cookie — the browser/WebView flow, unchanged.
 * The header wins when both are present: a bearer caller is asking as itself,
 * whatever stale cookie the transport happened to carry.
 */
export async function requestAccessToken(): Promise<string | null> {
  try {
    const auth = (await headers()).get("authorization");
    const bearer = auth?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (bearer) return bearer;
  } catch {
    // Outside a request scope (build-time render) there is no header to read.
  }
  const cookieStore = await cookies();
  return cookieStore.get(NEXUS_TOKEN_COOKIE)?.value ?? null;
}

/** True when this request authenticated via the Authorization header. */
async function bearerRequest(): Promise<boolean> {
  try {
    return /^Bearer\s+.+$/i.test((await headers()).get("authorization") ?? "");
  } catch {
    return false;
  }
}

/**
 * The org that scopes this user's sessions/library rows (0019). Prefers the
 * §3.5 acting org when one is applied; falls back to the launch org.
 */
export function orgScopeOf(context: NexusBridgeContext): string {
  return context.programOrganizationId ?? context.laicOrgId;
}

/**
 * The REAL Nexus program uuid this session was launched for (0022 instance
 * scoping) — the contract's programId is a fixed string, so the uuid rides
 * the launch cookie. Null in stub/dev mode (no launch): artifacts then scope
 * by org only, which is the pre-0022 behavior.
 */
export async function nexusProgramIdOf(): Promise<string | null> {
  if (nexusMode() !== "http") return null;
  // Bearer callers carry the program alongside the token (`x-program-id`) —
  // they have no launch cookie, and without this every scoped store read
  // would land in the wrong 0022 instance scope.
  try {
    const header = (await headers()).get("x-program-id");
    if (header) return header;
  } catch {
    // No request scope — fall through to the cookie.
  }
  const cookieStore = await cookies();
  return cookieStore.get(NEXUS_PROGRAM_COOKIE)?.value ?? null;
}

/** Server-side GET against Nexus with the caller's token (http mode) —
 *  cookie or bearer, whichever this request carries. */
async function nexusGet<T>(path: string): Promise<T | null> {
  if (nexusMode() !== "http") return null;
  const baseUrl = process.env.NEXUS_API_BASE_URL;
  if (!baseUrl) return null;
  const accessToken = await requestAccessToken();
  if (!accessToken) return null;
  const programId = await nexusProgramIdOf();
  const sep = path.includes("?") ? "&" : "?";
  const qs = programId ? `${sep}program_id=${encodeURIComponent(programId)}` : "";
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}${qs}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Library collection ids this caller may view via role designation — the
 * resolved grants the library component's principal carries. Cached per
 * session token (same TTL story as the context cache).
 */
export async function getMyCollectionGrants(): Promise<string[]> {
  if (nexusMode() !== "http") return [];
  const token = await requestAccessToken();
  if (!token) return [];
  const { cachedNexusGet } = await import("./nexusCache");
  return cachedNexusGet(`mycols:${token}`, async () => {
    const body = await nexusGet<{ collections?: string[] }>(
      "/api/platform/bridge/my-collections",
    );
    return body?.collections ?? [];
  });
}

/**
 * The calling learner's hired coach, from Nexus (the roster lives there —
 * Bridge only references people). http mode only: in stub/dev there is no
 * Nexus, so there is no coach — callers surface "hire a coach first".
 */
export async function getMyCoach(): Promise<{ coach_id: string; name: string } | null> {
  const body = await nexusGet<{ coach?: { coach_id: string; name: string } | null }>(
    "/api/platform/bridge/my-coach",
  );
  return body?.coach ?? null;
}

/**
 * EVERY coach the calling learner has hired (multi-coach) — the send-for-review
 * picker's roster. Empty when none hired (or stub mode).
 *
 * Cached on the same short TTL, and for the same reason, as getMyLearners below:
 * this is a Nexus read, so it pays that service's whole per-request verification
 * chain, and My games asks for it on EVERY load just to decide the send picker's
 * options. A hire propagates within the minute.
 */
export async function getMyCoaches(): Promise<{ coach_id: string; name: string }[]> {
  const fetchCoaches = async () =>
    (
      await nexusGet<{ coaches?: { coach_id: string; name: string }[] }>(
        "/api/platform/bridge/my-coaches",
      )
    )?.coaches ?? [];
  const token = await requestAccessToken();
  // Keyed by the token, never cached without one: the answer is per-learner, and
  // a shared key would hand one learner another's coaches.
  if (!token) return fetchCoaches();
  const { cachedNexusGet } = await import("./nexusCache");
  return cachedNexusGet(`coaches:${token}`, fetchCoaches);
}

export type RosterLearner = {
  /** The id space bridge artifacts key on — a participant's context resolves
   *  nexusUserId to this same id. */
  user_id: string | null;
  email: string | null;
  name: string | null;
};

/**
 * The calling coach's roster (learners who hired them), from Nexus.
 *
 * Cached for the usual short TTL: every Nexus read pays that service's
 * per-request verification chain (~0.5s locally, more in production), and this
 * list is asked for by the assign picker AND by the assignment editor every time
 * it opens. A hire propagates within the minute.
 */
export async function getMyLearners(): Promise<RosterLearner[]> {
  const token = await requestAccessToken();
  if (!token) return (await nexusGet<RosterLearner[]>("/api/platform/bridge/learners")) ?? [];
  const { cachedNexusGet } = await import("./nexusCache");
  return cachedNexusGet(`learners:${token}`, async () => {
    return (await nexusGet<RosterLearner[]>("/api/platform/bridge/learners")) ?? [];
  });
}

export type ProgramCoach = {
  /** Same id space as bridge artifacts' createdBy (the bridge context's
   *  nexusUserId resolves to the member's profile id). */
  coach_id: string;
  name: string | null;
  learner_count: number;
};

/**
 * The program's coaches, from Nexus (names + ids only).
 *
 * Cached on the same short TTL as the roster, and for the same reason: this is
 * what the reviewer picker reads, so it was a fresh cross-service call every time
 * the assignment editor opened. Reviewer pools go through lib/reviewers.ts — do
 * not call this directly to build one.
 */
export async function getProgramCoaches(): Promise<ProgramCoach[]> {
  const token = await requestAccessToken();
  if (!token) return (await nexusGet<ProgramCoach[]>("/api/platform/bridge/coaches")) ?? [];
  const { cachedNexusGet } = await import("./nexusCache");
  return cachedNexusGet(`coaches:${token}`, async () => {
    return (await nexusGet<ProgramCoach[]>("/api/platform/bridge/coaches")) ?? [];
  });
}

/**
 * Which instance receives content a person AUTHORS (deal editor, imports,
 * lineups): staff author into the PROGRAM instance (shared content); everyone
 * else authors into their own. Recording at the table is always personal.
 */
export function authoredScope(context: NexusBridgeContext): "program" | "user" {
  return canAccessAdminArea(context) ? "program" : "user";
}

/** Coach-or-better in the bridge context (the coach surfaces' gate). */
export function isBridgeCoach(context: NexusBridgeContext): boolean {
  return (
    context.is_admin === true ||
    context.roles.includes("bridge_coach") ||
    context.roles.includes("bridge_program_admin")
  );
}

export function nexusMode(): NexusMode {
  const mode = process.env.NEXUS_CLIENT_MODE ?? "stub";
  if (mode !== "stub" && mode !== "http") {
    throw new Error(
      `Invalid NEXUS_CLIENT_MODE "${mode}" — expected "stub" or "http"`,
    );
  }
  return mode;
}

/**
 * §3.5 explicit context switching: when the user has selected an acting org
 * AND holds an ACTIVE affiliation to it, the bridge context is re-scoped to
 * that org. Applied on top of whatever Nexus says — Nexus stays the identity
 * authority; the switch is bridge-owned state.
 */
async function applyActiveOrg(context: NexusBridgeContext): Promise<NexusBridgeContext> {
  const { profileService } = await import("./profiles");
  const service = await profileService();
  const me = await service.getUserProfile(context);
  const target = me?.activeProgramOrganizationId;
  if (!target || target === context.programOrganizationId) return context;
  const affiliations = await service.listMyAffiliations(context);
  const ok = affiliations.some((a) => a.status === "active" && a.programOrganizationId === target);
  return ok ? { ...context, programOrganizationId: target } : context;
}

/**
 * Cross-REQUEST context cache (http mode): re-verifying the session against
 * Nexus costs ~0.6–1.6s of sequential round trips, and it was paid on every
 * page render. Cache the resolved context per (token, program) for a short
 * TTL — a role/permission change propagates within a minute, navigation
 * stops re-paying the verification chain on every click.
 */
const CONTEXT_TTL_MS = 60_000;
const contextCache = (
  globalThis as unknown as {
    __bridgeContextCache?: Map<string, { context: NexusBridgeContext; expires: number }>;
  }
).__bridgeContextCache ??= new Map();

/**
 * Resolve a context from an EXPLICIT token instead of the launch cookie — the
 * native club app holds the same Nexus session token the cookie would carry,
 * but React Native's fetch has no access to the WebView's cookie jar, so its
 * API calls send it as a bearer header. http mode only: a bearer token means
 * a real Nexus behind us. Shares the cross-request cache with the cookie path.
 */
export async function getBridgeContextFromToken(
  accessToken: string,
  programId?: string | null,
): Promise<NexusBridgeContext | null> {
  if (nexusMode() !== "http") return null;
  const baseUrl = process.env.NEXUS_API_BASE_URL;
  if (!baseUrl) return null;

  const cacheKey = `${accessToken}:${programId ?? ""}`;
  const hit = contextCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.context;

  try {
    const context = await createNexusClient({
      mode: "http",
      baseUrl,
      accessToken,
      ...(programId ? { programId } : {}),
    }).getBridgeContext();
    if (contextCache.size > 200) contextCache.clear();
    contextCache.set(cacheKey, { context, expires: Date.now() + CONTEXT_TTL_MS });
    return context;
  } catch (err) {
    // A dead session or a role without Bridge — the caller treats it as 404.
    console.error("getBridgeContextFromToken failed:", err);
    return null;
  }
}

/**
 * Resolve the caller's NexusBridgeContext for this request, or null when not
 * signed in (no dev user selected / no Supabase session). Cached per request
 * so layout and pages can each call it cheaply.
 */
export const getBridgeContext = cache(
  async (): Promise<NexusBridgeContext | null> => {
    if (nexusMode() === "stub") {
      // On the fellows-testing host, sign everyone in as the shared account —
      // no cookie, no login screen. The mobile host does the same with its own
      // shared account (fellow demo wins if a host somehow matched both).
      const cookieStore = await cookies();
      const devUserId = (await isFellowDemo())
        ? FELLOW_DEMO_USER
        : (await isMobileSite())
          ? MOBILE_DEMO_USER
          : cookieStore.get(DEV_USER_COOKIE)?.value;
      if (!devUserId) return null;
      try {
        const context = await createNexusClient({
          mode: "stub",
          devUserId,
        }).getBridgeContext();
        return await applyActiveOrg(context);
      } catch (err) {
        // Stale cookie pointing at a removed stub user: treat as signed out.
        // Store failures land here too — keep them visible in server logs.
        console.error("getBridgeContext failed:", err);
        return null;
      }
    }

    // http mode: a Nexus session token → GET /api/platform/bridge/context.
    // Credentials, in order:
    //   1. `Authorization: Bearer` (+ `x-program-id`) — the native app; shares
    //      the cross-request cache with the cookie path via
    //      getBridgeContextFromToken, so every route guarded by
    //      requireContext() is bearer-capable with no per-route work.
    //   2. the launch-handoff cookie (app/nexus/launch) — the browser/WebView.
    //   3. a shared Supabase session, when that env is configured.
    const baseUrl = process.env.NEXUS_API_BASE_URL;
    if (!baseUrl) {
      throw new Error("NEXUS_CLIENT_MODE=http requires NEXUS_API_BASE_URL");
    }

    if (await bearerRequest()) {
      return getBridgeContextFromToken(
        (await requestAccessToken()) as string,
        await nexusProgramIdOf(),
      );
    }

    const cookieStore = await cookies();
    let accessToken = cookieStore.get(NEXUS_TOKEN_COOKIE)?.value ?? null;
    // Optional fallback: a shared Supabase auth session. Only consulted when
    // BOTH env vars exist — the launch-token cookie is the primary (and, with
    // the in-app login removed, usually the only) credential.
    if (
      !accessToken &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      const supabase = await createSupabaseServerClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      accessToken = session?.access_token ?? null;
    }
    if (!accessToken) return null;

    // Scope to the program the console launched from (multi-program people).
    const programId = cookieStore.get(NEXUS_PROGRAM_COOKIE)?.value;

    const cacheKey = `${accessToken}:${programId ?? ""}`;
    const hit = contextCache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.context;

    try {
      const context = await createNexusClient({
        mode: "http",
        baseUrl,
        accessToken,
        ...(programId ? { programId } : {}),
      }).getBridgeContext();
      // Cap the cache so dead sessions don't accumulate forever.
      if (contextCache.size > 200) contextCache.clear();
      contextCache.set(cacheKey, { context, expires: Date.now() + CONTEXT_TTL_MS });
      return context;
    } catch (err) {
      // Expired session or a role that doesn't grant Bridge (Nexus 403) —
      // treat as signed out; the layout routes to /welcome.
      console.error("getBridgeContext (http) failed:", err);
      return null;
    }
  },
);
