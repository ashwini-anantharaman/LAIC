"use server";

// Access catalogue editor actions (§7 gating). The catalogue is the single
// program-wide read model the whole app enforces against; only org- or
// program-level managers may write it. Every write is audited and revalidates
// the layout so the nav re-gates everywhere at once.

import {
  ACCESS_FEATURES,
  ALL_BRIDGE_ROLES,
  defaultCatalogue,
  GLOBAL_CATALOGUE_ID,
  type AccessCatalogue,
} from "@bridge/access";
import type { BridgeRole } from "@laic/learner-contracts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { accessStore, canEditCatalogue } from "@/lib/access";
import { AccessError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";

/** Roles differ from the feature default (order-independent set compare). */
function differsFromDefault(roles: readonly BridgeRole[], defaults: readonly BridgeRole[]): boolean {
  if (roles.length !== defaults.length) return true;
  const set = new Set(defaults);
  return roles.some((r) => !set.has(r));
}

/**
 * Read every checkbox back into a full rule per feature. Writing the WHOLE row
 * (even rows left at their defaults) freezes the saved table against future
 * changes to the built-in defaults — a saved catalogue is predictable.
 */
export async function saveCatalogueAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  if (!canEditCatalogue(context)) throw new AccessError("Cannot edit access catalogue");

  const rules: Record<string, BridgeRole[]> = {};
  let changed = 0;
  for (const feature of ACCESS_FEATURES) {
    const roles = ALL_BRIDGE_ROLES.filter(
      (role) => formData.get(`${feature.key}::${role}`) === "on",
    );
    rules[feature.key] = roles;
    if (differsFromDefault(roles, feature.defaultRoles)) changed += 1;
  }

  await accessStore().putCatalogue({
    catalogueId: GLOBAL_CATALOGUE_ID,
    rules,
    updatedBy: context.nexusUserId,
    updatedAt: new Date().toISOString(),
  });
  await audit(context, "access.catalogue.update", "access_catalogue", GLOBAL_CATALOGUE_ID, {
    changed,
  });
  revalidatePath("/", "layout");
  redirect("/bridge/teams?saved=1");
}

/** Restore the built-in defaults (an empty ruleset), stamped with the editor. */
export async function resetCatalogueAction(): Promise<void> {
  const context = await requireContext();
  if (!canEditCatalogue(context)) throw new AccessError("Cannot edit access catalogue");

  const reset: AccessCatalogue = {
    ...defaultCatalogue(),
    updatedBy: context.nexusUserId,
    updatedAt: new Date().toISOString(),
  };
  await accessStore().putCatalogue(reset);
  await audit(context, "access.catalogue.update", "access_catalogue", GLOBAL_CATALOGUE_ID, {
    reset: true,
  });
  revalidatePath("/", "layout");
  redirect("/bridge/teams?reset=1");
}
