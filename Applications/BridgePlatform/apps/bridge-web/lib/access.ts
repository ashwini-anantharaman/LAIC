// Server-side singleton access catalogue (§7 gating). The catalogue is a small
// program-wide read model — cache() memoizes the single global fetch per
// request. Enforcement helpers throw AccessError (a 404, never 403) so a gated
// page reads as "not found". Server-side only: the store touches Postgres/JSON.

import {
  canAccess,
  defaultCatalogue,
  GLOBAL_CATALOGUE_ID,
  type AccessCatalogue,
  type AccessStore,
} from "@bridge/access";
import { JsonFileAccessStore } from "@bridge/access/fileStore";
import { hasPermission } from "@bridge/nexus-client";
import { PgAccessStore } from "@bridge/pg-stores";
import type { NexusBridgeContext } from "@laic/learner-contracts";
import { join } from "node:path";
import { cache } from "react";
import { dataDir, pgClient, storeBackend } from "./backend";
import { AccessError } from "./api";

const globalCache = globalThis as unknown as { __bridgeAccessStore?: AccessStore };

export function accessStore(): AccessStore {
  if (!globalCache.__bridgeAccessStore) {
    globalCache.__bridgeAccessStore =
      storeBackend() === "postgres"
        ? new PgAccessStore(pgClient())
        : new JsonFileAccessStore(join(process.cwd(), dataDir(), "access-store.json"));
  }
  return globalCache.__bridgeAccessStore;
}

/**
 * The program-wide catalogue, or the all-defaults catalogue when unset — or
 * when the store is UNREACHABLE (missing table, db hiccup). Access config
 * failing to load must degrade to the built-in defaults, never take every
 * page down with it.
 */
export const getCatalogue = cache(async (): Promise<AccessCatalogue> => {
  try {
    return (await accessStore().getCatalogue(GLOBAL_CATALOGUE_ID)) ?? defaultCatalogue();
  } catch (error) {
    console.error("access catalogue unreadable — serving built-in defaults", error);
    return defaultCatalogue();
  }
});

export async function canUse(context: NexusBridgeContext, key: string): Promise<boolean> {
  return canAccess(await getCatalogue(), key, context.roles);
}

/** Throws AccessError (rendered as 404) when the context may not use `key`. */
export async function requireFeature(context: NexusBridgeContext, key: string): Promise<void> {
  if (!(await canUse(context, key))) throw new AccessError(`Feature not available: ${key}`);
}

/** Who may edit the catalogue itself: org- or program-level managers. */
export function canEditCatalogue(context: NexusBridgeContext): boolean {
  return (
    hasPermission(context, "bridge.org.manage") ||
    hasPermission(context, "bridge.program.manage")
  );
}
