"use server";

// Skins & appearance page actions. The staged appearance is a full
// TableAppearance chosen entirely on the client; on save we validate it through
// normalizeAppearance (never trust the client shape) and persist it against the
// signed-in user's OWN id — the id is resolved server-side from the session, a
// client-supplied userId is never accepted. Saving revalidates the layout so
// every table the user opens next dresses itself with the new look.

import { normalizeAppearance } from "@bridge/table-config";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveAppearance } from "@/lib/appearance";
import { requireContext } from "@/lib/api";
import { requireFeature } from "@/lib/access";

/**
 * Persist the staged appearance for the signed-in user. The form carries a
 * single JSON field ("appearance"); we parse it defensively and normalize
 * before writing, so a malformed or hostile payload degrades to the built-in
 * defaults rather than corrupting the stored row.
 */
export async function saveAppearanceAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  await requireFeature(context, "page.skins");

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
  revalidatePath("/", "layout");
  redirect("/bridge/skins?saved=1");
}
