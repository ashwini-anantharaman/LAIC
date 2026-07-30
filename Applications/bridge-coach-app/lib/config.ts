// Central app configuration.
//
// Option A identity: this app IS the Life in AI Center Bridge Program app.
// The org/gate slugs below are the app's identity against the Nexus API;
// registration goes through the program's participant gate, sign-in through
// the org-scoped login.

import { Platform } from "react-native";

// ── Environments ─────────────────────────────────────────────────────────────
// The dev stack is platform-aware:
//   • web (desktop browser preview): localhost — same-site iframes keep the
//     platforms' cookie sessions working, and nothing depends on tunnels.
//   • native (phone via Expo tunnel): Cloudflare quick tunnels — the phone
//     can't reach localhost. Tunnel URLs are SESSION-SCOPED: when the tunnels
//     die, update TUNNEL below (or clear it and phone testing pauses).
// A real deployment replaces both with stable URLs.

const LOCAL = {
  api: "http://localhost:8000",
  learning: "http://localhost:5174",
  bridgeLaunch: "http://localhost:3000/nexus/launch",
};

const TUNNEL = {
  api: "https://newspaper-folding-buying-papers.trycloudflare.com",
  learning: "https://instantly-killing-webshots-subtle.trycloudflare.com",
  // Override the backend's launch_url (its BRIDGE_PLATFORM_URL env points at
  // localhost) with the bridge tunnel so the phone can reach it.
  bridgeLaunch:
    "https://identical-conceptual-wav-growth.trycloudflare.com/nexus/launch" as
      | string
      | null,
};

const ACTIVE = Platform.OS === "web" ? LOCAL : TUNNEL;

/** Nexus API base URL. */
export const NEXUS_API_URL = ACTIVE.api;

/** Learning platform origin (must be built with a matching VITE_API_BASE_URL). */
export const LEARNING_PLATFORM_URL = ACTIVE.learning;

/**
 * Bridge platform launch URL override. null = trust the launch endpoint's
 * launch_url (the backend's BRIDGE_PLATFORM_URL). The web preview overrides
 * to localhost so its iframe stays same-site (cookie sessions survive).
 */
export const BRIDGE_LAUNCH_URL_OVERRIDE: string | null =
  Platform.OS === "web" ? LOCAL.bridgeLaunch : TUNNEL.bridgeLaunch;

// ── Program identity ─────────────────────────────────────────────────────────

/** Organization this app belongs to. */
export const ORG_SLUG = "life-in-ai-center";

/** The Bridge Program's participant signup gate (slug within the org). */
export const GATE_SLUG = "student-signup";

/** The Bridge Program id (fixed — the app is published for this program). */
export const PROGRAM_ID = "eef9985b-b85f-4eeb-bd1e-bcc1f66b0f83";
