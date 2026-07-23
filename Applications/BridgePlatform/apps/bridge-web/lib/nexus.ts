import {
  createNexusClient,
  type NexusBridgeContext,
} from "@bridge/nexus-client";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { createSupabaseServerClient } from "./supabase-server";

export const DEV_USER_COOKIE = "bridge_dev_user";

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

    // http mode (Phase 10+): Supabase session JWT -> Nexus context endpoint.
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;

    const baseUrl = process.env.NEXUS_API_BASE_URL;
    if (!baseUrl) {
      throw new Error("NEXUS_CLIENT_MODE=http requires NEXUS_API_BASE_URL");
    }
    return createNexusClient({
      mode: "http",
      baseUrl,
      accessToken: session.access_token,
    }).getBridgeContext();
  },
);
