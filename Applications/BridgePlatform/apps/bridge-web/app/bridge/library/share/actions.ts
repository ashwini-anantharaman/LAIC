"use server";

// Distribution (owner decision 2026-07-29): only admins see the program
// library; they make items available to people from here. Each recipient
// gets their OWN copy (provenance `shared`) in their personal instance —
// the same copy primitive as assignments, without assignment tracking.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import {
  bridgeLibrary,
  canShareLibrary,
  libraryPrincipalOf,
} from "@/lib/libraryComponent";
import { getMyLearners, getProgramCoaches } from "@/lib/nexus";

export async function shareEntryAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  if (!(await canShareLibrary(context))) throw new Error("Sharing requires library distribution access");

  const entryId = String(formData.get("entryId"));
  const recipientIds = formData.getAll("recipient").map(String).filter(Boolean);
  if (recipientIds.length === 0) {
    redirect(
      `/bridge/library/share/${encodeURIComponent(entryId)}?error=${encodeURIComponent("Pick at least one person.")}`,
    );
  }

  // Only people actually in this program (server-checked, like assign) —
  // learners AND coaches are valid recipients (coaches receive program
  // boards into their own shelf, then assign from there).
  const [people, coaches] = await Promise.all([getMyLearners(), getProgramCoaches()]);
  const known = new Set([
    ...(people.map((p) => p.user_id).filter(Boolean) as string[]),
    ...coaches.map((co) => co.coach_id),
  ]);

  const service = bridgeLibrary();
  const principal = await libraryPrincipalOf(context);
  let shared = 0;
  for (const recipientId of recipientIds) {
    if (!known.has(recipientId)) continue; // not in the program — skip silently
    // copyTo is idempotent per (source, recipient, kind): re-sharing is a no-op.
    await service.copyTo(principal, entryId, {
      ownerId: recipientId,
      scopeLevel: "user",
      provenance: "shared",
    });
    shared++;
  }
  await audit(context, "library.shared", "kb_library", entryId, {
    shared,
    recipients: recipientIds.length,
  });
  revalidatePath("/bridge/library");
  redirect(`/bridge/library?scope=program&shared=${shared}`);
}
