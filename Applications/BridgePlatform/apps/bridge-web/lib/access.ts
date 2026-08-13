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

/**
 * A CLUB member's app capabilities, from the Nexus bridge context.
 *
 * Empty for anyone who did not reach the bridge through a partner club.
 */
function clubAppCapabilities(context: NexusBridgeContext): string[] | null {
  const ext = context as NexusBridgeContext & {
    nexus_club_program_id?: string | null;
    nexus_app_capabilities?: string[];
  };
  if (!ext.nexus_club_program_id) return null;
  return Array.isArray(ext.nexus_app_capabilities) ? ext.nexus_app_capabilities : [];
}

/**
 * Is an `app.*` capability within what the ORG provisioned for this club?
 *
 * Asked before any role rule, because the rule below falls back to a coarse "a
 * mentor may create" when a club has authored no app permissions — and that
 * fallback must not outrank provisioning. Provisioning is the ceiling; roles
 * distribute beneath it.
 *
 * Absence means UNRESTRICTED, matching the server that sends it: a club with no
 * `feature_access` recorded is provisioned "Full", and an older Nexus sends neither
 * field. Denial arrives explicitly as `nexus_app_enabled === false`.
 */
function withinAppProvisioning(context: NexusBridgeContext, capability: string): boolean {
  const ext = context as NexusBridgeContext & {
    nexus_app_enabled?: boolean;
    nexus_app_provisioned_capabilities?: string[] | null;
  };
  if (ext.nexus_app_enabled === false) return false;
  const provisioned = ext.nexus_app_provisioned_capabilities;
  if (!Array.isArray(provisioned) || provisioned.length === 0) return true;
  return provisioned.includes(capability);
}

/**
 * May this caller create a challenge?
 *
 * Two gates, not one. bridge-access lets every club member reach
 * challenge.create at the platform level ON PURPOSE and leaves the real decision
 * to the club — "the platform allows it, the club role gates it". That second
 * gate lives in the APP's catalogue (`app.challenge.create`), which this app
 * could not see, so in practice every club member got a + regardless of the role
 * their club gave them.
 *
 * A non-club caller is unaffected: the platform check alone, exactly as before.
 */
export async function canCreateChallenge(context: NexusBridgeContext): Promise<boolean> {
  if (!(await canUse(context, "challenge.create"))) return false;
  const appCaps = clubAppCapabilities(context);
  if (appCaps === null) return true; // not a club caller

  // The org's ceiling first: a club that was not provisioned challenge creation
  // cannot create, whatever its own roles say and whoever is asking.
  if (!withinAppProvisioning(context, "app.challenge.create")) return false;

  // THREE cases, the same order the app's own `can()` uses — the third is the one
  // that matters. A club role that carries no club-app capabilities at all is not
  // saying "denied", it is saying NOTHING: the club has not authored app
  // permissions for it. Treating silence as denial took the + away from mentors
  // who had always had it.
  //
  // So with no fine grants, fall back to the rule that shipped before app roles
  // existed: a club's MENTOR may create, a plain member may not. /bridge/context
  // emits bridge_coach for a club instructor and bridge_club_member otherwise, so
  // that distinction is already in the roles we hold.
  if (appCaps.length === 0) return context.roles.includes("bridge_coach");

  // A role that DOES carry app capabilities is honoured exactly.
  return appCaps.includes("app.challenge.create");
}

/** The 404 form of canCreateChallenge, for pages and server actions. */
export async function requireCreateChallenge(context: NexusBridgeContext): Promise<void> {
  if (!(await canCreateChallenge(context))) notFound();
}

/** Who may edit the catalogue itself: org- or program-level managers. */
export function canEditCatalogue(context: NexusBridgeContext): boolean {
  return (
    hasPermission(context, "bridge.org.manage") ||
    hasPermission(context, "bridge.program.manage")
  );
}
