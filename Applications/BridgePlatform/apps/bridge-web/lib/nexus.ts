import {
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
    // Preferred credential: the launch-handoff cookie (app/nexus/launch) —
    // Nexus's own session token, working against its dev demo-auth today and
    // carrying a Supabase JWT unchanged later. Fallback: a shared Supabase
    // session, when that env is configured.
    const baseUrl = process.env.NEXUS_API_BASE_URL;
    if (!baseUrl) {
      throw new Error("NEXUS_CLIENT_MODE=http requires NEXUS_API_BASE_URL");
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

    try {
      return await createNexusClient({
        mode: "http",
        baseUrl,
        accessToken,
        ...(programId ? { programId } : {}),
      }).getBridgeContext();
    } catch (err) {
      // Expired session or a role that doesn't grant Bridge (Nexus 403) —
      // treat as signed out; the layout routes to /welcome.
      console.error("getBridgeContext (http) failed:", err);
      return null;
    }
  },
);
