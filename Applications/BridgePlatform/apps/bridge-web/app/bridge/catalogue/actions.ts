"use server";

// Access Catalogue server actions — save / reset the bridge catalogue. The
// backend is only reachable server-side (httpOnly session cookie), so the
// client editor round-trips the working doc through these. Bridge-admin only.

import { revalidatePath } from "next/cache";
import { getBridgeContext } from "@/lib/nexus";
import { nexusProgramId } from "@/lib/nexusPeople";
import {
  resetBridgeCatalogue,
  resetLibraryCatalogue,
  saveBridgeCatalogue,
  saveLibraryCatalogue,
  type BridgeCatalogue,
} from "@/lib/nexusBridgeRoles";

async function requireAdminProgramId(): Promise<string> {
  const context = await getBridgeContext();
  if (!context) throw new Error("Not signed in");
  if (!context.is_admin) throw new Error("Bridge admin access required");
  const programId = nexusProgramId(context);
  if (!programId) throw new Error("No Nexus program in this context");
  return programId;
}

/** Save the catalogue. `docJson` is the serialized working document from the
 *  client. `provider` picks WHICH document: bridge's own (program-scoped) or
 *  the library component's (platform-level, its own provider). */
export async function saveCatalogueAction(
  docJson: string,
  provider: "bridge" | "library" = "bridge",
): Promise<void> {
  const programId = await requireAdminProgramId();
  const doc = JSON.parse(docJson) as BridgeCatalogue;
  if (doc?.documentType !== "capability_catalogue" || !Array.isArray(doc.capabilities) || !Array.isArray(doc.groups)) {
    throw new Error("Not a valid catalogue document");
  }
  if (provider === "library") await saveLibraryCatalogue(doc);
  else await saveBridgeCatalogue(programId, doc);
  revalidatePath("/bridge/catalogue");
}

export async function resetCatalogueAction(
  provider: "bridge" | "library" = "bridge",
): Promise<void> {
  const programId = await requireAdminProgramId();
  if (provider === "library") await resetLibraryCatalogue();
  else await resetBridgeCatalogue(programId);
  revalidatePath("/bridge/catalogue");
}
