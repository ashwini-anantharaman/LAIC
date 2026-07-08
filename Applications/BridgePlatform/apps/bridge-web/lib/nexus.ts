import {
  createNexusClient,
  type NexusBridgeContext,
} from "@bridge/nexus-client";
import { cookies } from "next/headers";
import { cache } from "react";
import { createSupabaseServerClient } from "./supabase-server";

export const DEV_USER_COOKIE = "bridge_dev_user";

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
        return await createNexusClient({
          mode: "stub",
          devUserId,
        }).getBridgeContext();
      } catch {
        // Stale cookie pointing at a removed stub user: treat as signed out.
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
