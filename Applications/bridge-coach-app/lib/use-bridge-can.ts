// Bridge-platform capability hooks — the second of the two catalogues.
//
// useCan (lib/use-can.ts) answers for the CLUB app's own capabilities
// ("app.*", from the Nexus club-app context). useBridgeCan here answers for
// the bridge PLATFORM's surfaces ("page.library", "challenge.create", …),
// resolved SERVER-SIDE by GET /api/bridge/me — including the club-capability
// fallback logic, which lives on the platform and is never re-derived in the
// app. Two catalogues, two hooks, same shape.

import { useEffect, useState } from "react";

import { useAuth } from "./auth-context";
import {
  peekBridgeMe,
  refreshBridgeMe,
  subscribeToBridgeMe,
  type BridgeMe,
} from "./bridge-features";
import { useSelectedClubId } from "./club-context";
import { PROGRAM_ID } from "./config";

/**
 * The whole /api/bridge/me answer, cached per session/program. Null while the
 * first fetch is out (or signed out) — gates that need an answer before then
 * take a `fallback` through useBridgeCan below.
 */
export function useBridgeMe(): BridgeMe | null {
  const { token } = useAuth();
  const clubId = useSelectedClubId();
  const programId = clubId ?? PROGRAM_ID;
  const [me, setMe] = useState<BridgeMe | null>(() =>
    token ? peekBridgeMe(token, programId) : null,
  );

  useEffect(() => {
    if (!token) {
      setMe(null);
      return;
    }
    let cancelled = false;
    setMe(peekBridgeMe(token, programId));
    refreshBridgeMe(token, programId)
      .then((v) => !cancelled && setMe(v))
      .catch(() => {});
    const stop = subscribeToBridgeMe((v) => {
      if (!cancelled) setMe(v);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [token, programId]);

  return me;
}

/**
 * May the signed-in person use this bridge-platform surface?
 *
 * `fallback` is the answer while the flags haven't arrived yet (first paint,
 * offline) — set it to what the surface did before it was gated, so a slow
 * network degrades to the old behavior instead of a locked door.
 */
export function useBridgeCan(featureKey: string, fallback = false): boolean {
  const me = useBridgeMe();
  if (!me) return fallback;
  return me.features[featureKey] ?? fallback;
}
