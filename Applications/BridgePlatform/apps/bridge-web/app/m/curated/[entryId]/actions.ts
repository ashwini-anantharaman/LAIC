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
import {
  parseCurated,
  serializeCurated,
  type CuratedAnnotation,
  type CuratedConstraint,
} from "@/lib/curated";
import { libraryStore } from "@/lib/sessions";

const CONSTRAINTS: readonly CuratedConstraint[] = ["locked", "guided", "free"];

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
  // THE BOARD SETTINGS (curated v2, owner design 2026-08-18) are the coach's
  // to edit here too — constraint, intro/debrief, pin. The learner seat is
  // NOT on the form: the annotations above are anchored to it. A v1 entry
  // whose form posts settings becomes v2 — same meaning, now said out loud.
  const parsed = parseCurated(entry.curatedJson);
  const constraintRaw = String(formData.get("constraint") ?? "");
  const constraint = CONSTRAINTS.includes(constraintRaw as CuratedConstraint)
    ? (constraintRaw as CuratedConstraint)
    : parsed.constraint;
  const intro = String(formData.get("intro") ?? "").trim();
  const debrief = String(formData.get("debrief") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();

  // Every payload enters storage through the same tolerant door — the parser
  // enforces the caps and drops annotations that say nothing.
  const payload = parseCurated(
    serializeCurated({
      v: 2,
      annotations: kept,
      ...(parsed.learnerSeat ? { learnerSeat: parsed.learnerSeat } : {}),
      ...(constraint ? { constraint } : {}),
      ...(intro ? { intro } : {}),
      ...(debrief ? { debrief } : {}),
      ...(pin ? { pin } : {}),
      // THE LESSON SURVIVES A WORDS-ONLY EDIT. This form rewrites the coach's
      // prose, not what the board teaches — rebuilding the payload without
      // carrying the topic and the chosen cards over would silently empty the
      // learner's Know panel the next time anyone fixed a typo.
      ...(parsed.kTags?.length ? { kTags: parsed.kTags } : {}),
      ...(parsed.kItems?.length ? { kItems: parsed.kItems } : {}),
    }),
  );

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
