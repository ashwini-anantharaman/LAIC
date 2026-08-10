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
import { accessStore, canEditCatalogue, invalidateCatalogue } from "@/lib/access";
import { AccessError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getBridgeContext } from "@/lib/nexus";
import {
  inviteBridgePerson,
  nexusProgramId,
  removeBridgePerson,
  setBridgeRole,
} from "@/lib/nexusPeople";
import { testAsPerson } from "@/lib/nexusBridgeRoles";

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
  // The gate must not lag behind its own edit.
  await invalidateCatalogue();
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
  // The gate must not lag behind its own edit.
  await invalidateCatalogue();
  await audit(context, "access.catalogue.update", "access_catalogue", GLOBAL_CATALOGUE_ID, {
    reset: true,
  });
  revalidatePath("/", "layout");
  redirect("/bridge/teams?reset=1");
}

// ── People management (ported from the Quan branch, catalogue-compatible slice)
// Granting a person one of the STANDARD bridge roles, inviting, removing, and
// "Test as". These write to Nexus (the identity authority) and feed our access
// catalogue, which gates what each of those standard roles can do. His custom
// capability-role builder and catalogue-DOCUMENT editor are deliberately NOT
// ported — they presume his capability store, which this platform replaced with
// @bridge/access. All of this is a live-Nexus (http-mode) admin surface.

async function requireAdminProgramId(): Promise<string> {
  const context = await getBridgeContext();
  if (!context) throw new AccessError("Not signed in");
  if (context.is_admin !== true) throw new AccessError("Bridge admin access required");
  const programId = nexusProgramId(context);
  if (!programId) throw new AccessError("No Nexus program in this context");
  return programId;
}

/** Assign (or clear) a person's standard bridge role. */
export async function assignRoleAction(formData: FormData): Promise<void> {
  const programId = await requireAdminProgramId();
  const email = String(formData.get("email") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!email) throw new AccessError("email required");
  await setBridgeRole(programId, email, role === "none" ? null : role);
  revalidatePath("/bridge/teams");
}

/** Invite a person to the program with a pre-assigned standard role. */
export async function inviteAction(formData: FormData): Promise<void> {
  const programId = await requireAdminProgramId();
  const email = String(formData.get("email") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  if (!email) throw new AccessError("email required");
  const inv = await inviteBridgePerson(programId, {
    email,
    displayName: displayName || undefined,
    role: role === "none" ? null : role,
  });
  revalidatePath("/bridge/teams");
  redirect(
    `/bridge/teams?tab=people&invited=${encodeURIComponent(inv.redeem_url)}&who=${encodeURIComponent(email)}`,
  );
}

/** Remove a person from the program. */
export async function removePersonAction(formData: FormData): Promise<void> {
  const programId = await requireAdminProgramId();
  const email = String(formData.get("email") ?? "");
  if (!email) throw new AccessError("email required");
  await removeBridgePerson(programId, email);
  revalidatePath("/bridge/teams");
}

/** Impersonate a person for testing (Nexus test-as). */
export async function testAsAction(formData: FormData): Promise<void> {
  const context = await getBridgeContext();
  if (!context) throw new AccessError("Not signed in");
  if (context.is_admin !== true) throw new AccessError("Bridge admin access required");
  const email = String(formData.get("email") ?? "");
  if (!email) throw new AccessError("email required");
  await testAsPerson(email, context.laicOrgId ?? null);
  redirect("/bridge/home");
}
