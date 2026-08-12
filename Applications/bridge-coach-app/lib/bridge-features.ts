// The bridge PLATFORM's feature flags for this caller — the app's read side
// of GET /api/bridge/me. CACHE ONLY: the React hooks live in
// use-bridge-can.ts (the bridge-role.ts / use-can.ts split), which keeps this
// file below auth-context in the dependency graph — auth-context clears this
// cache on sign-out, so this file must never import back up into it.
//
// Stale-while-revalidate, keyed token::program like summary-cache: the last
// answer renders instantly and refreshes behind; gates update in place.

import { bridgeRequest } from "./bridge-api";

export type BridgeMe = {
  nexusUserId: string;
  displayName: string | null;
  roles: string[];
  isAdmin: boolean;
  isCoach: boolean;
  features: Record<string, boolean>;
  library: { canCreate: boolean; programScope: boolean };
};

let cached: { key: string; me: BridgeMe } | null = null;
let inflight: { key: string; promise: Promise<BridgeMe> } | null = null;
const listeners = new Set<(me: BridgeMe) => void>();

function keyOf(token: string, programId: string): string {
  return `${token}::${programId}`;
}

/** The last answer for this session/program — render it NOW, refresh behind. */
export function peekBridgeMe(token: string, programId: string): BridgeMe | null {
  return cached?.key === keyOf(token, programId) ? cached.me : null;
}

/** Fetch fresh and remember it; concurrent callers share one round-trip. */
export function refreshBridgeMe(token: string, programId: string): Promise<BridgeMe> {
  const key = keyOf(token, programId);
  if (inflight && inflight.key === key) return inflight.promise;
  const promise = bridgeRequest<BridgeMe>("/api/bridge/me", { token, programId })
    .then((me) => {
      cached = { key, me };
      for (const notify of listeners) notify(me);
      return me;
    })
    .finally(() => {
      if (inflight?.key === key) inflight = null;
    });
  inflight = { key, promise };
  return promise;
}

export function clearBridgeMeCache(): void {
  cached = null;
  inflight = null;
}

/** Redraw when any refresh lands — one fetch, every gate updated. */
export function subscribeToBridgeMe(notify: (me: BridgeMe) => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}
