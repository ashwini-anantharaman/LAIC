"use server";

// Per-user table appearance (skins & layout) writes for the table2 ☰ menu.
// Each quick row binds a small patch; the action re-reads the user's current
// appearance, merges the patch, persists it, and revalidates the table so the
// server re-render redresses it. Menu state is client-side, so it survives.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeAppearance, type TableAppearance } from "@bridge/table-config";
import { requireContext } from "@/lib/api";
import { requireFeature } from "@/lib/access";
import { getAppearance, saveAppearance } from "@/lib/appearance";

/**
 * Merge `patch` onto the caller's saved appearance and persist it. Bound with
 * the session id + patch at the row, so the ☰ can call it with no arguments.
 */
export async function patchAppearanceAction(
  sessionId: string,
  patch: Partial<TableAppearance>,
): Promise<void> {
  const context = await requireContext();
  await requireFeature(context, "table.skin_settings");
  const current = await getAppearance(context.nexusUserId);
  await saveAppearance(context.nexusUserId, normalizeAppearance({ ...current, ...patch }));
  revalidatePath(`/bridge/table2/${sessionId}`);
}

/**
 * The in-table configurator's save (owner, 2026-08-18: appearance lives AT the
 * table). The overlay stages a whole TableAppearance exactly as the skins page
 * does; this persists it — same normalize-never-trust posture as the page's
 * action — and lands back on the board so the new look is under the fingers
 * that chose it. Gated by table.skin_settings, the table-side surface, so a
 * program that hides the ☰ Skin row hides this the same way; page.skins keeps
 * gating only the standalone page.
 */
export async function saveTableAppearanceAction(
  sessionId: string,
  formData: FormData,
): Promise<void> {
  const context = await requireContext();
  await requireFeature(context, "table.skin_settings");

  let parsed: unknown = {};
  const raw = formData.get("appearance");
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  }
  await saveAppearance(context.nexusUserId, normalizeAppearance(parsed));
  revalidatePath(`/bridge/table2/${sessionId}`);
  redirect(`/bridge/table2/${sessionId}`);
}
