// Short-TTL cache for Nexus admin reads (catalogue, roles, people): every
// call to the backend pays its per-request verification chain (~0.5–1s), and
// the admin pages were re-fetching on every navigation. Same reasoning as the
// context cache in lib/nexus.ts. Mutations MUST invalidate their keys so
// edits render immediately — see the call sites in nexusBridgeRoles/People.

const TTL_MS = 60_000;
const store = (
  globalThis as unknown as {
    __nexusReadCache?: Map<string, { value: unknown; expires: number }>;
  }
).__nexusReadCache ??= new Map();

/**
 * Read through a short-TTL cache that survives across REQUESTS.
 *
 * React's cache() only memoizes within one request, so anything read on every
 * page render was paying its round trip on every navigation. Use this for reads
 * that are (a) hot on a path someone is waiting on and (b) have a known write
 * site that can invalidate them — never for anything a stale answer could
 * mislead about.
 */
export async function cachedRead<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await fetcher();
  if (store.size > 200) store.clear();
  store.set(key, { value, expires: Date.now() + TTL_MS });
  return value;
}

/** Drop cached reads whose key starts with `prefix` (mutation call sites). */
export function invalidateReads(prefix: string): void {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}

/** The original Nexus-shaped names, kept for the existing call sites. */
export const cachedNexusGet = cachedRead;
export const invalidateNexusReads = invalidateReads;
