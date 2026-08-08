// Prewarming, not caching: the bridge screens a card opens are served by a
// serverless function that goes COLD between uses — the first hit after idle
// pays spin-up, a Nexus context round-trip and a fresh DB pool, felt as
// seconds of white iframe. While the learner is still LOOKING at the launcher
// screen, ping the pages its cards lead to; by the time they tap, the
// function is warm and SSR is the only cost left.
//
// Deployed web only: there the bridge is same-origin (vercel.json proxy), so
// the ping carries the session cookie and warms the real query path. Native
// talks to a cross-site origin where a stray fetch is just CORS noise.

import { Platform } from "react-native";

import { LEARNING_PLATFORM_URL, NEXUS_API_URL } from "./config";

const TTL = 4 * 60_000; // functions stay warm ~10min; refresh well inside it
const last = new Map<string, number>();

// ── Whole-stack warm-up from the sign-in screen ──────────────────────────────
// The sign-in screen is dead time: the learner is typing a password while
// every backend sits cold. Start touching ALL of them the moment the screen
// mounts — the Nexus API, the bridge pages the app embeds, the learning
// platform — and let sign-in itself WAIT for the sweep (owner request
// 2026-08-06: "sign in once everything has been accessed once"). The wait is
// capped: a hung ping must never hold the door shut.

const WARM_CAP_MS = 8_000;
let allWarm: Promise<void> | null = null;

export function startPrewarmAll(): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  if (allWarm) return;
  const targets = [
    `${NEXUS_API_URL}/health`,
    LEARNING_PLATFORM_URL,
    // Same-origin bridge pages (the vercel.json proxy). Without a session
    // cookie they bounce to /welcome, but the bounce itself warms the
    // function, the Next.js render path and the DB pool — the expensive part.
    ...(window.location.protocol === "https:"
      ? ["/welcome", "/m/plays", "/m/library", "/m/assigned", "/m/reviews"].map(
          (p) => `${window.location.origin}${p}`,
        )
      : []),
  ];
  const sweep = Promise.allSettled(
    targets.map((u) => fetch(u, { credentials: "include" })),
  ).then(() => undefined);
  const cap = new Promise<void>((resolve) => setTimeout(resolve, WARM_CAP_MS));
  allWarm = Promise.race([sweep, cap]);
}

/** Resolves when the sweep has settled (or immediately if none started). */
export function prewarmAllDone(): Promise<void> {
  return allWarm ?? Promise.resolve();
}

export function prewarmBridgePages(paths: readonly string[], bridgeOrigin?: string | null): void {
  // WEB: ping through the same-origin proxy so the cookie session rides along
  // and the ping warms the real query path. NATIVE: React Native's fetch has
  // no CORS and carries no WebView cookies — the ping bounces to /welcome,
  // but the bounce itself warms the function, the render path and the DB
  // pool, which is the expensive part (the sign-in sweep's reasoning). The
  // caller passes the bridge origin (launch-cache knows it after sign-in).
  let base: string | null = null;
  if (Platform.OS === "web") {
    if (typeof window === "undefined" || window.location.protocol !== "https:") return;
    base = window.location.origin;
  } else {
    base = bridgeOrigin ?? null;
  }
  if (!base) return;
  for (const p of paths) {
    const url = `${base}${p}`;
    const at = last.get(url) ?? 0;
    if (Date.now() - at < TTL) continue;
    last.set(url, Date.now());
    fetch(url, Platform.OS === "web" ? { credentials: "include" } : undefined).catch(() => {
      // Warming is best-effort; a failed ping costs nothing.
    });
  }
}
