"use server";

import { packagePresets } from "@bridge/profiles";

import { BEGINNER_NATURAL_PACKAGE_ID } from "@bridge/knowledge";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { getBridgeContext } from "@/lib/nexus";
import { profileService } from "@/lib/profiles";
import { latestPackage } from "@/lib/sessions";

async function requireContext() {
  const context = await getBridgeContext();
  if (!context) throw new Error("Not signed in");
  return context;
}

/** One-click player from an exact generated package version (book→player). */
export async function createPlayerFromPackage(formData: FormData) {
  const context = await requireContext();
  const packageId = String(formData.get("packageId"));
  const version = String(formData.get("version"));
  const record = await (await import("@/lib/knowledge")).knowledgeStore().getPackage(packageId, version);
  if (!record) throw new Error(`No package ${packageId}@${version}`);
  const profile = await (await profileService()).createProfile(context, {
    name: String(formData.get("name") || "") || `${packageId}@${version} player`,
    description: `Plays by ${packageId}@${version}. Toggle settings to customize.`,
    packageRef: { packageId, version },
    settings: record.pkg.settings,
    presets: packagePresets(record.pkg),
  });
  await audit(context, "profile.create", "ai_player_profile", profile.aiPlayerProfileId, {
    packageRef: profile.packageRef,
  });
  revalidatePath("/bridge/players");
  redirect(`/bridge/players/${profile.aiPlayerProfileId}`);
}

export async function customizeProfile(formData: FormData) {
  const context = await requireContext();
  const pkg = await latestPackage(BEGINNER_NATURAL_PACKAGE_ID);
  const copy = await (await profileService()).customize(
    String(formData.get("profileId")),
    context,
    pkg.settings,
    undefined,
    packagePresets(pkg),
  );
  await audit(context, "profile.customize", "ai_player_profile", copy.aiPlayerProfileId, {});
  redirect(`/bridge/players/${copy.aiPlayerProfileId}`);
}

export async function updateProfile(formData: FormData) {
  const context = await requireContext();
  const pkg = await latestPackage(BEGINNER_NATURAL_PACKAGE_ID);
  const id = String(formData.get("profileId"));
  const service = await profileService();
  const existing = await service.getProfile(id, context);
  const sandbox = existing?.sandboxId
    ? await service.getSandbox(existing.sandboxId, context)
    : null;
  const overrides: Record<string, boolean> = {};
  for (const setting of pkg.settings) {
    if (setting.control !== "toggle") continue;
    // Sandboxed profiles: the form only renders exposed settings — keep the
    // stored value for everything else instead of defaulting it to off.
    if (sandbox && !sandbox.exposedSettingKeys.includes(setting.key)) {
      const kept = existing?.valueOverrides[setting.key];
      if (kept !== undefined) overrides[setting.key] = Boolean(kept);
      continue;
    }
    overrides[setting.key] = formData.get(`setting:${setting.key}`) === "on";
  }
  await (await profileService()).updateValues(
    id,
    context,
    pkg.settings,
    {
      name: String(formData.get("name") || "") || undefined,
      selectedPresetId: String(formData.get("presetId") || "") || undefined,
      valueOverrides: overrides,
    },
    packagePresets(pkg),
  );
  await audit(context, "profile.update", "ai_player_profile", id, {});
  revalidatePath(`/bridge/players/${id}`);
  redirect(`/bridge/players/${id}`);
}

export async function customizeScope(formData: FormData) {
  const context = await requireContext();
  const copy = await (await profileService()).customizeScope(
    String(formData.get("scopeId")),
    context,
  );
  await audit(context, "scope.customize", "teaching_scope", copy.teachingScopeId, {});
  revalidatePath("/bridge/players");
  redirect("/bridge/players");
}

export async function updateScope(formData: FormData) {
  const context = await requireContext();
  const allowed = String(formData.get("requireIn") || "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  const reject = String(formData.get("rejectIn") || "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  await (await profileService()).updateScope(String(formData.get("scopeId")), context, {
    name: String(formData.get("name") || "") || undefined,
    evaluatorFilter: {
      seats: "dealer",
      ...(allowed.length ? { requireSystemicActionIn: allowed } : {}),
      ...(reject.length ? { rejectIfSystemicActionIn: reject } : {}),
    },
  });
  await audit(context, "scope.update", "teaching_scope", String(formData.get("scopeId")), {});
  revalidatePath("/bridge/players");
  redirect("/bridge/players");
}

// ---- sandboxes (coach-curated configuration surfaces) -----------------------

export async function createSandboxAction(formData: FormData) {
  const context = await requireContext();
  const pkg = await latestPackage(BEGINNER_NATURAL_PACKAGE_ID);
  const exposed = formData.getAll("exposed").map(String);
  const service = await profileService();
  const sandbox = await service.createSandbox(context, {
    name: String(formData.get("name") || "").trim() || "Untitled sandbox",
    description: String(formData.get("description") || "").trim() || undefined,
    packageRef: { packageId: pkg.packageId, version: pkg.version },
    basePresetId: String(formData.get("basePresetId") || "") || undefined,
    exposedSettingKeys: exposed,
  });
  await audit(context, "profile.create", "sandbox", sandbox.sandboxId, {
    exposed: sandbox.exposedSettingKeys,
  });
  revalidatePath("/bridge/players");
  redirect("/bridge/players");
}

export async function configureFromSandboxAction(formData: FormData) {
  const context = await requireContext();
  const sandboxId = String(formData.get("sandboxId"));
  const pkg = await latestPackage(BEGINNER_NATURAL_PACKAGE_ID);
  const service = await profileService();
  const sandbox = await service.getSandbox(sandboxId, context);
  if (!sandbox) throw new Error("Sandbox not found");
  // Only exposed keys are read from the form; the service re-enforces anyway.
  const overrides: Record<string, boolean> = {};
  for (const key of sandbox.exposedSettingKeys)
    overrides[key] = formData.get(`setting:${key}`) === "on";
  const profile = await service.configureFromSandbox(context, sandboxId, {
    name: String(formData.get("name") || "").trim() || undefined,
    overrides,
    settings: pkg.settings,
    presets: packagePresets(pkg),
  });
  await audit(context, "profile.create", "ai_player_profile", profile.aiPlayerProfileId, {
    sandboxId,
  });
  revalidatePath("/bridge/players");
  redirect(`/bridge/players/${profile.aiPlayerProfileId}`);
}
