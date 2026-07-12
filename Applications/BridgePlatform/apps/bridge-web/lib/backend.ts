// Store-backend selection: "file" (JSON dev stores, offline-friendly) or
// "postgres" (shared Supabase project — team-real state). Server-side only:
// the service-role key must never reach the browser.

import { createPgClient } from "@bridge/pg-stores";
import type { SupabaseClient } from "@supabase/supabase-js";

const globalCache = globalThis as unknown as { __bridgePgClient?: SupabaseClient };

export function storeBackend(): "file" | "postgres" {
  const v = process.env.STORE_BACKEND ?? "file";
  if (v !== "file" && v !== "postgres") throw new Error(`Invalid STORE_BACKEND "${v}"`);
  return v;
}

export function pgClient(): SupabaseClient {
  if (!globalCache.__bridgePgClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
      throw new Error(
        "STORE_BACKEND=postgres requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-side)",
      );
    globalCache.__bridgePgClient = createPgClient({ url, serviceRoleKey: key });
  }
  return globalCache.__bridgePgClient;
}

/** Run `seed` once before the first store operation (lazy async seeding). */
export function withLazySeed<T extends object>(store: T, seed: (s: T) => Promise<void>): T {
  let seeded: Promise<void> | null = null;
  return new Proxy(store, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        seeded ??= seed(target);
        await seeded;
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}
