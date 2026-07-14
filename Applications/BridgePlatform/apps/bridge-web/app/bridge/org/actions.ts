"use server";

// Org model server actions (§3.4–3.5): profile save, affiliation
// declaration, explicit context switch. All audited.

import type { AffiliationType, BridgeOrgType } from "@bridge/profiles";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { getBridgeContext } from "@/lib/nexus";
import { profileService } from "@/lib/profiles";

async function requireContext() {
  const context = await getBridgeContext();
  if (!context) throw new Error("Not signed in");
  return context;
}

export async function saveOrgProfileAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const saved = await profileService().saveOrgProfile(context, {
    bridgeOrgType: String(formData.get("bridgeOrgType")) as BridgeOrgType,
    allowedBiddingSystems: String(formData.get("allowedBiddingSystems") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    allowAiPlayers: formData.get("allowAiPlayers") === "on",
    allowBenPlayers: formData.get("allowBenPlayers") === "on",
  });
  await audit(context, "org.profile.update", "org_profile", saved.programOrganizationId);
  revalidatePath("/bridge/org");
}

export async function addAffiliationAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const programOrganizationId =
    String(formData.get("programOrganizationId") ?? "").trim() || undefined;
  const affiliation = await profileService().addAffiliation(context, {
    programOrganizationId,
    affiliationType: String(formData.get("affiliationType")) as AffiliationType,
  });
  await audit(context, "org.affiliation.change", "affiliation", affiliation.coachAffiliationId, {
    status: affiliation.status,
  });
  revalidatePath("/bridge/org");
}

export async function switchActiveOrgAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const target = String(formData.get("programOrganizationId") ?? "").trim() || null;
  await profileService().switchActiveOrg(context, target);
  await audit(context, "org.affiliation.change", "active_org", target ?? "cleared");
  revalidatePath("/bridge/org");
  revalidatePath("/bridge/home");
}
