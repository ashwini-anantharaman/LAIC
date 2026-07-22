// Server-side KB store/service singletons (STORE_BACKEND seam), plus the
// one seed the platform ships: the registered Claude source — the NAMED
// source for platform-authored judgments (owner sourcing policy 2026-07-12).

import {
  CLAUDE_SOURCE,
  JsonFileKbStore,
  KbService,
  type CompiledKb,
  type KbStore,
} from "@bridge/kb";
import { PgKbStore } from "@bridge/pg-stores";
import { join } from "node:path";
import { dataDir, pgClient, storeBackend } from "./backend";

const globalCache = globalThis as unknown as {
  __bridgeKbStore?: KbStore;
  __bridgeKbService?: KbService;
  __bridgeKbSeeded?: Promise<void>;
};

/**
 * Compiled artifacts are IMMUTABLE — every recompile mints a new compileId —
 * so an in-process cache by id is always correct. They're also the largest
 * blobs we move (hundreds of KB) and the hottest reads (every table view,
 * every AI step), so this one cache removes most of prod's Postgres traffic.
 * The small LRU cap bounds memory on long-lived instances.
 */
const COMPILE_CACHE_MAX = 24;
function withCompileCache(store: KbStore): KbStore {
  const cache = new Map<string, CompiledKb>();
  const getCompile = async (compileId: string): Promise<CompiledKb | null> => {
    const hit = cache.get(compileId);
    if (hit) {
      cache.delete(compileId); // refresh LRU position
      cache.set(compileId, hit);
      return hit;
    }
    const compiled = await store.getCompile(compileId);
    if (compiled) {
      cache.set(compileId, compiled);
      if (cache.size > COMPILE_CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
    }
    return compiled;
  };
  return new Proxy(store, {
    get: (target, prop, receiver) =>
      prop === "getCompile" ? getCompile : Reflect.get(target, prop, receiver),
  });
}

export function kbStore(): KbStore {
  globalCache.__bridgeKbStore ??= withCompileCache(
    storeBackend() === "postgres"
      ? new PgKbStore(pgClient())
      : new JsonFileKbStore(join(process.cwd(), dataDir(), "kb-store.json")),
  );
  return globalCache.__bridgeKbStore;
}

export function kbService(): KbService {
  globalCache.__bridgeKbService ??= new KbService(kbStore());
  return globalCache.__bridgeKbService;
}

/** Idempotent: ensure the Claude source exists before anything cites it. */
export async function ensureSeeds(): Promise<void> {
  globalCache.__bridgeKbSeeded ??= (async () => {
    const store = kbStore();
    if (!(await store.getSource(CLAUDE_SOURCE.sourceId))) {
      await store.putSource(CLAUDE_SOURCE);
    }
  })();
  return globalCache.__bridgeKbSeeded;
}
