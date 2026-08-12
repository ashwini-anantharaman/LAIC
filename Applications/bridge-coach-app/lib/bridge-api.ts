// The app's client for the BRIDGE PLATFORM's JSON API (apps/bridge-web
// app/api/**) — the native-screen replacement for loading those screens in a
// WebView. Mirrors lib/nexus.ts's request(): bearer token, one refresh-retry
// on 401, NexusError-style failures. Two deliberate differences:
//
//   • Every call carries `x-program-id`. The platform scopes sessions/library
//     rows by it (0022 instance scoping) — a call without one would silently
//     read/write the wrong instance, so a missing program id REFUSES here
//     rather than travel.
//   • Access failures come back as 404 (`requireContext` renders AccessError
//     as "Not found", never 403) — callers treat 404 as "not yours/not there".
//
// Base URL: on the deployed web build the platform is proxied through the
// app's own origin (vercel.json), so that origin is the base. Everywhere else
// it derives from the launch URL the embeds already use, or
// EXPO_PUBLIC_BRIDGE_API_URL overrides it outright.

import { Platform } from "react-native";

import { BRIDGE_LAUNCH_URL_OVERRIDE } from "./config";
import { reportSessionExpired, requestSessionRefresh } from "./session-expiry";

export class BridgeApiError extends Error {
  status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "BridgeApiError";
    this.status = status;
  }
}

/** The bridge platform's base URL, or null when none is configured. */
export function bridgeApiBase(): string | null {
  const explicit = process.env.EXPO_PUBLIC_BRIDGE_API_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  // Deployed web: the platform is proxied through the app's own origin so the
  // embed's cookies stay first-party — the same proxy serves this API.
  if (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    window.location.protocol === "https:"
  ) {
    return window.location.origin;
  }
  const launch = BRIDGE_LAUNCH_URL_OVERRIDE;
  if (!launch) return null;
  return launch.replace(/\/nexus\/launch\/?$/, "");
}

export async function bridgeRequest<T>(
  path: string,
  options: {
    token: string;
    /** REQUIRED — the instance scope. Callers resolve it before calling. */
    programId: string;
    method?: string;
    body?: unknown;
    /** Set on the one retry after a refresh — never retry twice. */
    _retried?: boolean;
  },
): Promise<T> {
  const base = bridgeApiBase();
  if (!base) throw new BridgeApiError(0, "No bridge platform configured.");
  if (!options.programId) {
    // Refuse, don't travel: without the scope the platform would answer from
    // the wrong instance and the bug would look like missing data.
    throw new BridgeApiError(0, "No program selected.");
  }

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.token}`,
        "x-program-id": options.programId,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new BridgeApiError(0, "Cannot reach the bridge platform.");
  }

  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    // Same net as lib/nexus.ts: a token-bearing 401 tries one refresh-retry,
    // then reports expiry so the whole app signs out at once.
    if (response.status === 401) {
      if (!options._retried) {
        const fresh = await requestSessionRefresh();
        if (fresh && fresh !== options.token) {
          return bridgeRequest<T>(path, { ...options, token: fresh, _retried: true });
        }
      }
      reportSessionExpired();
    }
    const detail =
      typeof json.error === "string" ? json.error : `Request failed (${response.status})`;
    throw new BridgeApiError(response.status, detail);
  }
  return json as T;
}
