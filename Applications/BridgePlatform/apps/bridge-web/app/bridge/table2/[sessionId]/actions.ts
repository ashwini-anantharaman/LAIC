"use server";

// Per-user table appearance (skins & layout) writes for the table2 ☰ menu.
// Each quick row binds a small patch; the action re-reads the user's current
// appearance, merges the patch, persists it, and revalidates the table so the
// server re-render redresses it. Menu state is client-side, so it survives.

import { revalidatePath } from "next/cache";
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
