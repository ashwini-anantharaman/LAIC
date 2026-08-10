// Server-side singleton access catalogue (§7 gating). The catalogue is a small
// program-wide read model — cache() memoizes the single global fetch per
// request. Enforcement helpers render notFound() (a 404, never 403) so a gated
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
import { notFound } from "next/navigation";
import { join } from "node:path";
import { cache } from "react";
import { dataDir, pgClient, storeBackend } from "./backend";

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
  // Cross-REQUEST too: one global row, gating every page, read on every render —
  // it was ~85ms of round trip on the path someone is waiting on. Editing the
  // catalogue invalidates it (invalidateCatalogue, called by the save actions),
  // so a permission change is not left waiting on a TTL.
  const { cachedRead } = await import("./nexusCache");
  return cachedRead("catalogue", async () => {
    try {
      return (await accessStore().getCatalogue(GLOBAL_CATALOGUE_ID)) ?? defaultCatalogue();
    } catch (error) {
      console.error("access catalogue unreadable — serving built-in defaults", error);
      return defaultCatalogue();
    }
  });
});

/** Call after ANY write to the catalogue — a gate must never lag behind its edit. */
export async function invalidateCatalogue(): Promise<void> {
  const { invalidateReads } = await import("./nexusCache");
  invalidateReads("catalogue");
}

export async function canUse(context: NexusBridgeContext, key: string): Promise<boolean> {
  return canAccess(await getCatalogue(), key, context.roles);
}

/**
 * Renders the 404 page when the context may not use `key`. notFound(), not
 * AccessError: every caller is a page or server action, and an AccessError
 * thrown from a server component escapes as a 500 (apiError only maps it for
 * API routes) — a gated page must read as "not found", never as an outage.
 */
export async function requireFeature(context: NexusBridgeContext, key: string): Promise<void> {
  if (!(await canUse(context, key))) notFound();
}

/** Who may edit the catalogue itself: org- or program-level managers. */
export function canEditCatalogue(context: NexusBridgeContext): boolean {
  return (
    hasPermission(context, "bridge.org.manage") ||
    hasPermission(context, "bridge.program.manage")
  );
}
