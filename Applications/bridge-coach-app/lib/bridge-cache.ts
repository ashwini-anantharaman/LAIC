// Generic stale-while-revalidate cache for bridge-platform read models —
// summary-cache.ts's pattern (render the LAST answer instantly, refresh
// behind it, share concurrent fetches), made reusable so every native screen
// that replaced a WebView doesn't grow its own copy.
//
// Keys are the caller's to build and MUST carry the session token and program
// (`token::program[::more]`): a refresh from a previous session resolving
// after sign-out must never show the next user someone else's data.
//
// Every cache registers itself for clearAllBridgeCaches(), which auth-context
// calls on sign-out. This file is below auth-context in the dependency graph
// (auth-context imports it, never the reverse).

type Listener<T> = (key: string, value: T) => void;

export interface BridgeCache<T> {
  /** The last answer for this key — render it NOW, refresh behind. */
  peek(key: string): T | null;
  /** Fetch fresh and remember it; concurrent callers share one round-trip. */
  refresh(key: string, fetcher: () => Promise<T>): Promise<T>;
  /** Redraw when any refresh lands — one fetch, every subscriber updated. */
  subscribe(listener: Listener<T>): () => void;
  clear(): void;
}

const registry: { clear(): void }[] = [];

export function createBridgeCache<T>(): BridgeCache<T> {
  let cached: { key: string; value: T } | null = null;
  let inflight: { key: string; promise: Promise<T> } | null = null;
  const listeners = new Set<Listener<T>>();

  const cache: BridgeCache<T> = {
    peek(key) {
      return cached?.key === key ? cached.value : null;
    },
    refresh(key, fetcher) {
      if (inflight && inflight.key === key) return inflight.promise;
      const promise = fetcher()
        .then((value) => {
          cached = { key, value };
          for (const notify of listeners) notify(key, value);
          return value;
        })
        .finally(() => {
          if (inflight?.key === key) inflight = null;
        });
      inflight = { key, promise };
      return promise;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear() {
      cached = null;
      inflight = null;
    },
  };
  registry.push(cache);
  return cache;
}

/** Sign-out wipes every read model at once — called by auth-context. */
export function clearAllBridgeCaches(): void {
  for (const cache of registry) cache.clear();
}
