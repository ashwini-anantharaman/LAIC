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
//
// THE IN-FLIGHT FETCH IS SHARED. Sign-in primes this cache, and the Coach tab
// refreshes on focus — when the learner taps the tab a second after signing
// in, those are the SAME request, not two. Without sharing, the tab started a
// fresh round-trip from zero and the wait doubled; joining the prime means
// the answer lands as early as it possibly can.

import { BridgeSummary, fetchBridgeSummary } from "./nexus";

// Keyed by token AND program: a club member's summary is their club's world,
// and one cache slot serving both scopes would flash the wrong counts.
const keyOf = (token: string, programId?: string) => `${token}|${programId ?? ""}`;

let cached: { key: string; summary: BridgeSummary } | null = null;
let inflight: { key: string; promise: Promise<BridgeSummary> } | null = null;

/** The last summary for this token — render it NOW, refresh behind it. */
export function peekSummary(token: string, programId?: string): BridgeSummary | null {
  return cached?.key === keyOf(token, programId) ? cached.summary : null;
}

/** Fetch fresh and remember it; concurrent callers share one round-trip. */
export function refreshSummary(token: string, programId?: string): Promise<BridgeSummary> {
  const key = keyOf(token, programId);
  if (inflight && inflight.key === key) return inflight.promise;
  const promise = fetchBridgeSummary(token, programId)
    .then((summary) => {
      cached = { key, summary };
      return summary;
    })
    .finally(() => {
      if (inflight?.key === key) inflight = null;
    });
  inflight = { key, promise };
  return promise;
}

export function clearSummaryCache(): void {
  cached = null;
  inflight = null;
}
