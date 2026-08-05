// Server-side per-user table appearance (skins & layout). A tiny read model —
// one row per user — behind the same store seam as the access catalogue:
// Postgres when STORE_BACKEND=postgres, else a JSON dev file. cache() memoizes
// the per-user fetch across a request; a store hiccup fails open to the built-in
// DEFAULT_APPEARANCE so the table always dresses itself. Server-side only.

import {
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  type TableAppearance,
  type TableConfigStore,
} from "@bridge/table-config";
import { JsonFileTableConfigStore } from "@bridge/table-config/fileStore";
import { PgTableConfigStore } from "@bridge/pg-stores";
import { join } from "node:path";
import { cache } from "react";
import { dataDir, pgClient, storeBackend } from "./backend";

const globalCache = globalThis as unknown as { __bridgeTableConfigStore?: TableConfigStore };

export function tableConfigStore(): TableConfigStore {
  if (!globalCache.__bridgeTableConfigStore) {
    globalCache.__bridgeTableConfigStore =
      storeBackend() === "postgres"
        ? new PgTableConfigStore(pgClient())
        : new JsonFileTableConfigStore(join(process.cwd(), dataDir(), "table-config-store.json"));
  }
  return globalCache.__bridgeTableConfigStore;
}

/**
 * The user's saved appearance, always normalized — or the built-in defaults
 * when unset OR when the store is UNREACHABLE. Appearance config failing to
 * load must degrade to defaults, never take the table down with it.
 */
export const getAppearance = cache(async (userId: string): Promise<TableAppearance> => {
  try {
    const stored = await tableConfigStore().getForUser(userId);
    return stored ? normalizeAppearance(stored) : DEFAULT_APPEARANCE;
  } catch (error) {
    console.error("table appearance unreadable — serving built-in defaults", error);
    return DEFAULT_APPEARANCE;
  }
});

export async function saveAppearance(userId: string, appearance: TableAppearance): Promise<void> {
  await tableConfigStore().putForUser(userId, normalizeAppearance(appearance));
}
