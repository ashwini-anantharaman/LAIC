// Stale-while-revalidate for the bridge summary.
//
// Four screens (Play, Coach, Today, Resume) fetch the summary on every focus,
// and each fetch is a serverless round-trip — so every tab press showed a
// spinner while data that was seconds old reloaded. The cache renders the
// LAST summary instantly and refreshes behind it; the screen updates in
// place if anything actually changed.
//
// Keyed by the session token, like launch-cache: a refresh from a previous
// session resolving after sign-out must never show the next user someone
// else's boards.

import { BridgeSummary, fetchBridgeSummary } from "./nexus";

let cached: { token: string; summary: BridgeSummary } | null = null;

/** The last summary for this token — render it NOW, refresh behind it. */
export function peekSummary(token: string): BridgeSummary | null {
  return cached?.token === token ? cached.summary : null;
}

/** Fetch fresh and remember it. */
export async function refreshSummary(token: string): Promise<BridgeSummary> {
  const summary = await fetchBridgeSummary(token);
  cached = { token, summary };
  return summary;
}

export function clearSummaryCache(): void {
  cached = null;
}
