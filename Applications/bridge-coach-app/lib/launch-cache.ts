import {
  launchBridgePlatform,
  launchLearningPlatform,
  PlatformLaunch,
} from "./nexus";

// Launch tokens are single-use, so this cache holds at most ONE unused launch
// per platform, prefetched while the student is a screen away — tapping
// through then skips the mint round-trip.
// Entries are keyed by the SESSION TOKEN that minted them: a prefetch from a
// previous session resolving after sign-out must never hand the next user a
// launch that signs them in as someone else.

export type LaunchTarget = "learning" | "bridge";

const MINT: Record<LaunchTarget, (token: string, programId?: string) => Promise<PlatformLaunch>> = {
  learning: launchLearningPlatform,
  bridge: launchBridgePlatform,
};

type CacheEntry = { token: string; launch: PlatformLaunch; programId?: string };

const cached: Partial<Record<LaunchTarget, CacheEntry>> = {};
const inflight: Partial<Record<LaunchTarget, { token: string; promise: Promise<void> }>> = {};

function isFresh(launch: PlatformLaunch): boolean {
  // Leave a safety margin so we never hand out an about-to-expire token.
  return new Date(launch.expires_at).getTime() - Date.now() > 60_000;
}

/** Fire-and-forget: make sure an unused launch is (being) fetched. */
export function prefetchLaunch(
  token: string,
  target: LaunchTarget,
  programId?: string,
): void {
  const have = cached[target];
  if (have && have.token === token && have.programId === programId && isFresh(have.launch)) return;
  if (inflight[target]?.token === token) return;
  const promise = MINT[target](token, programId)
    .then((launch) => {
      cached[target] = { token, launch, programId };
    })
    .catch(() => {
      /* opening the screen will mint on demand */
    })
    .finally(() => {
      if (inflight[target]?.token === token) inflight[target] = undefined;
    });
  inflight[target] = { token, promise };
}

/** Consume the prefetched launch, or mint one on demand. */
export async function takeLaunch(
  token: string,
  target: LaunchTarget,
  /**
   * Which program to launch as. A club's people must launch THEIR CLUB — the
   * app-wide program gives them no standing on the platform. A prewarmed launch
   * is only reused when it was minted for the same program, since the program is
   * what the platform reads the caller's roles from.
   */
  programId?: string,
): Promise<PlatformLaunch> {
  const pending = inflight[target];
  if (pending?.token === token) await pending.promise;
  const have = cached[target];
  cached[target] = undefined;
  if (have && have.token === token && have.programId === programId && isFresh(have.launch)) {
    return have.launch;
  }
  return MINT[target](token, programId);
}

// One SIGNED-IN bridge origin per session token: after the first launch
// handshake, the embed's cookie session lives on that origin — so every later
// screen can load its destination directly and skip the mint + exchange
// round-trips entirely (the slow part of screen switching). Keyed by session
// token for the same reason the cache above is: no cross-user leaks.
let bridgeOrigin: { token: string; origin: string } | null = null;

export function rememberBridgeOrigin(token: string, origin: string): void {
  bridgeOrigin = { token, origin };
}

/** The signed-in origin for this token, or null when a handshake is needed. */
export function peekBridgeOrigin(token: string): string | null {
  return bridgeOrigin?.token === token ? bridgeOrigin.origin : null;
}

/** The session died on that origin (bounced to /welcome) — handshake again. */
export function forgetBridgeOrigin(): void {
  bridgeOrigin = null;
}

export function clearLaunchCache(): void {
  cached.learning = undefined;
  cached.bridge = undefined;
  inflight.learning = undefined;
  inflight.bridge = undefined;
  bridgeOrigin = null;
}
