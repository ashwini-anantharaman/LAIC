"use server";

// Collection management (admin): create/update/delete collections through
// the library component, and write the AUDIENCE designation (roleId →
// collection ids) to Nexus — the resolved grants come back to learners via
// /bridge/my-collections. Content grouping and access designation stay two
// documents; this surface just edits both in one gesture.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { bridgeLibrary, canShareLibrary, libraryPrincipalOf } from "@/lib/libraryComponent";
import {
  getCollectionDesignations,
  setCollectionDesignations,
} from "@/lib/nexusBridgeRoles";
import { nexusProgramId } from "@/lib/nexusPeople";
import { getBridgeContext } from "@/lib/nexus";

async function requireCurator() {
  const context = await requireContext();
  if (!(await canShareLibrary(context))) throw new Error("Library curation requires distribution access");
  return context;
}

export async function saveCollectionAction(formData: FormData): Promise<void> {
  const context = await requireCurator();
  const id = String(formData.get("collectionId") ?? "").trim() || undefined;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/bridge/library/collections?error=Name%20is%20required");
  const description = String(formData.get("description") ?? "").trim();
  const itemIds = formData.getAll("item").map(String).filter(Boolean);
  const audience = formData.getAll("audience").map(String).filter(Boolean);

  const principal = await libraryPrincipalOf(context);
  const collection = await bridgeLibrary().saveCollection(principal, {
    ...(id ? { id } : {}),
    name,
    ...(description ? { description } : {}),
    itemIds,
  });

  // Audience → designation map: ensure the collection appears under exactly
  // the checked roles (and nowhere else).
  const full = await getBridgeContext();
  const programId = full ? nexusProgramId(full) : null;
  if (programId) {
    const map = await getCollectionDesignations(programId);
    const chosen = new Set(audience);
    for (const role of Object.keys(map)) {
      map[role] = (map[role] ?? []).filter((cid) => cid !== collection.id);
    }
    for (const role of chosen) map[role] = [...(map[role] ?? []), collection.id];
    await setCollectionDesignations(programId, map);
  }

  await audit(context, "library.shared", "kb_library", collection.id, {
    collection: true,
    items: itemIds.length,
    audience,
  });
  revalidatePath("/bridge/library/collections");
  redirect("/bridge/library/collections?saved=1");
}

export async function deleteCollectionAction(formData: FormData): Promise<void> {
  const context = await requireCurator();
  const id = String(formData.get("collectionId"));
  const principal = await libraryPrincipalOf(context);
  await bridgeLibrary().deleteCollection(principal, id);
  const full = await getBridgeContext();
  const programId = full ? nexusProgramId(full) : null;
  if (programId) {
    const map = await getCollectionDesignations(programId);
    for (const role of Object.keys(map)) map[role] = (map[role] ?? []).filter((c) => c !== id);
    await setCollectionDesignations(programId, map);
  }
  revalidatePath("/bridge/library/collections");
  redirect("/bridge/library/collections?deleted=1");
}
