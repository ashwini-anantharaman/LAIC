import {
  createNexusClient,
  type NexusBridgeContext,
} from "@bridge/nexus-client";
import { cookies } from "next/headers";
import { cache } from "react";
import { createSupabaseServerClient } from "./supabase-server";

import { NEXUS_PROGRAM_COOKIE, NEXUS_TOKEN_COOKIE } from "./nexusToken";

export const DEV_USER_COOKIE = "bridge_dev_user";
export { NEXUS_TOKEN_COOKIE };

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
      const cookieStore = await cookies();
      const devUserId = cookieStore.get(DEV_USER_COOKIE)?.value;
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
