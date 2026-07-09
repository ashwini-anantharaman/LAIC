"use server";

import { BEGINNER_NATURAL_PACKAGE_ID } from "@bridge/knowledge";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBridgeContext } from "@/lib/nexus";
import { profileService } from "@/lib/profiles";
import { latestPublishedPackage } from "@/lib/sessions";

async function requireContext() {
  const context = await getBridgeContext();
  if (!context) throw new Error("Not signed in");
  return context;
}

export async function customizeProfile(formData: FormData) {
  const context = await requireContext();
  const pkg = await latestPublishedPackage(BEGINNER_NATURAL_PACKAGE_ID);
  const copy = await (await profileService()).customize(
    String(formData.get("profileId")),
    context,
    pkg.settings,
  );
  redirect(`/bridge/players/${copy.aiPlayerProfileId}`);
}

export async function updateProfile(formData: FormData) {
  const context = await requireContext();
  const pkg = await latestPublishedPackage(BEGINNER_NATURAL_PACKAGE_ID);
  const id = String(formData.get("profileId"));
  const overrides: Record<string, boolean> = {};
  for (const setting of pkg.settings) {
    if (setting.control === "toggle")
      overrides[setting.key] = formData.get(`setting:${setting.key}`) === "on";
  }
  await (await profileService()).updateValues(id, context, pkg.settings, {
    name: String(formData.get("name") || "") || undefined,
    selectedPresetId: String(formData.get("presetId") || "") || undefined,
    valueOverrides: overrides,
  });
  revalidatePath(`/bridge/players/${id}`);
  redirect(`/bridge/players/${id}`);
}
