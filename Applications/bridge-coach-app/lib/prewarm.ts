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

const TTL = 4 * 60_000; // functions stay warm ~10min; refresh well inside it
const last = new Map<string, number>();

export function prewarmBridgePages(paths: readonly string[]): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  if (window.location.protocol !== "https:") return;
  for (const p of paths) {
    const url = `${window.location.origin}${p}`;
    const at = last.get(url) ?? 0;
    if (Date.now() - at < TTL) continue;
    last.set(url, Date.now());
    fetch(url, { credentials: "include" }).catch(() => {
      // Warming is best-effort; a failed ping costs nothing.
    });
  }
}
