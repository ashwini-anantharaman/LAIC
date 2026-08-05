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

const MINT: Record<LaunchTarget, (token: string) => Promise<PlatformLaunch>> = {
  learning: launchLearningPlatform,
  bridge: launchBridgePlatform,
};

type CacheEntry = { token: string; launch: PlatformLaunch };

const cached: Partial<Record<LaunchTarget, CacheEntry>> = {};
const inflight: Partial<Record<LaunchTarget, { token: string; promise: Promise<void> }>> = {};

function isFresh(launch: PlatformLaunch): boolean {
  // Leave a safety margin so we never hand out an about-to-expire token.
  return new Date(launch.expires_at).getTime() - Date.now() > 60_000;
}

/** Fire-and-forget: make sure an unused launch is (being) fetched. */
export function prefetchLaunch(token: string, target: LaunchTarget): void {
  const have = cached[target];
  if (have && have.token === token && isFresh(have.launch)) return;
  if (inflight[target]?.token === token) return;
  const promise = MINT[target](token)
    .then((launch) => {
      cached[target] = { token, launch };
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
): Promise<PlatformLaunch> {
  const pending = inflight[target];
  if (pending?.token === token) await pending.promise;
  const have = cached[target];
  cached[target] = undefined;
  if (have && have.token === token && isFresh(have.launch)) return have.launch;
  return MINT[target](token);
}

export function clearLaunchCache(): void {
  cached.learning = undefined;
  cached.bridge = undefined;
  inflight.learning = undefined;
  inflight.bridge = undefined;
}
