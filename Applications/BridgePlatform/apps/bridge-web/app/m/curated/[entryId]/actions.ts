"use server";

// Post-publish editing of a curated deal (owner pick #6, 2026-08-15). The
// LINE is fixed — it is the recorded sitting, and changing it would orphan
// every annotation — but the coach's words are theirs to fix without
// replaying the board: notes, reasons and hint ladders, per annotation.
//
// Copy-on-assign is what makes this safe: learners already assigned hold
// their own copy of the entry, so an edit here reaches FUTURE assignments
// only and can never shift the ground under a sitting in progress.

import { canAccessAdminArea } from "@bridge/nexus-client";
import { redirect } from "next/navigation";

import { requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { parseCurated, serializeCurated, type CuratedAnnotation } from "@/lib/curated";
import { libraryStore } from "@/lib/sessions";

export async function saveCuratedEditsAction(formData: FormData): Promise<void> {
  const entryId = String(formData.get("entryId") ?? "");
  const context = await requireContext();
  const entry = await libraryStore().getEntry(entryId);
  // Creatorship (or adminship) grants the pen — same rule as assignments.
  if (
    !entry?.curatedJson ||
    (entry.createdBy !== context.nexusUserId && !canAccessAdminArea(context))
  ) {
    redirect("/m/assignments");
  }

  // The FORM is keyed by the parsed payload's order, so the rebuild walks the
  // same list the page rendered. An annotation whose fields were all emptied
  // simply falls out — clearing IS deleting, the checkbox is just the
  // deliberate way to say it.
  const existing = parseCurated(entry.curatedJson).annotations;
  const kept: CuratedAnnotation[] = [];
  existing.forEach((ann, i) => {
    if (formData.get(`remove_${i}`) === "on") return;
    const note = String(formData.get(`note_${i}`) ?? "").trim();
    const why = String(formData.get(`why_${i}`) ?? "").trim();
    const hints = String(formData.get(`hints_${i}`) ?? "")
      .split("\n")
      .map((h) => h.trim())
      .filter(Boolean)
      .slice(0, 5);
    kept.push({
      at: ann.at,
      ...(note ? { note } : {}),
      ...(why ? { why } : {}),
      ...(hints.length >= 2 ? { hints } : {}),
    });
  });
  // Every payload enters storage through the same tolerant door — the parser
  // enforces the caps and drops annotations that say nothing.
  const payload = parseCurated(serializeCurated({ annotations: kept }));

  const name = String(formData.get("name") ?? "").trim();
  await libraryStore().putEntry({
    ...entry,
    ...(name ? { name } : {}),
    curatedJson: serializeCurated(payload),
  });
  await audit(context, "profile.update", "kb_library", entryId, {
    curated: true,
    annotations: payload.annotations.length,
  });
  redirect(`/m/curated/${encodeURIComponent(entryId)}?saved=1`);
}
