"use server";

// Phase 3: a coach assigns a library entry to learners on their roster —
// one assignment row per learner so status tracks individually.

import { redirect } from "next/navigation";
import { requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { bridgeLibrary, itemToEntry, libraryPrincipalOf } from "@/lib/libraryComponent";
import { getMyLearners, isBridgeCoach, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { assignmentStore, libraryStore } from "@/lib/sessions";

export async function assignEntryAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  if (!isBridgeCoach(context)) throw new Error("Coach access required");

  const entryId = String(formData.get("entryId"));
  const note = String(formData.get("note") ?? "").trim();
  const learnerIds = formData.getAll("learner").map(String).filter(Boolean);
  if (learnerIds.length === 0) {
    redirect(`/m/assign?entry=${encodeURIComponent(entryId)}&error=${encodeURIComponent("Pick at least one learner.")}`);
  }

  const entry = await libraryStore().getEntry(entryId);
  if (!entry) throw new Error("That library entry no longer exists");

  // Assign only to people actually on this coach's roster (server-checked).
  const roster = await getMyLearners();
  const byId = new Map(
    roster.filter((l) => l.user_id).map((l) => [l.user_id as string, l]),
  );

  const { newId } = await import("@bridge/kb");
  const store = assignmentStore();
  const service = bridgeLibrary();
  const principal = await libraryPrincipalOf(context);
  const orgId = orgScopeOf(context);
  const programId = (await nexusProgramIdOf()) ?? undefined;
  const now = new Date().toISOString();
  let created = 0;
  for (const learnerId of learnerIds) {
    const learner = byId.get(learnerId);
    if (!learner) continue; // not on the roster — skip silently
    // Idempotent per learner+source: don't stack duplicate open assignments.
    const existing = await store.listAssignments({
      coachId: context.nexusUserId,
      learnerId,
      sourceEntryId: entryId,
    });
    if (existing.some((a) => a.status !== "completed")) continue;

    // Copy-on-assign (0022) via the library component: the learner receives
    // their OWN copy in their instance, stamped with provenance. copyTo is
    // idempotent per (source, learner) and policy-checks the coach's access.
    const copy = itemToEntry(
      await service.copyTo(principal, entryId, {
        ownerId: learnerId,
        scopeLevel: "user",
        provenance: "assigned",
      }),
    );

    await store.putAssignment({
      assignmentId: newId("as"),
      programOrganizationId: orgId,
      nexusProgramId: programId,
      coachId: context.nexusUserId,
      coachName: context.displayName ?? undefined,
      learnerId,
      learnerName: learner.name ?? learner.email ?? undefined,
      entryId: copy.entryId,
      sourceEntryId: entryId,
      entryKind: entry.kind,
      entryName: entry.name,
      ...(note ? { note } : {}),
      status: "assigned",
      createdAt: now,
    });
    created++;
  }
  await audit(context, "assignment.created", "assignment", entryId, {
    assigned: created,
    learners: learnerIds.length,
  });
  redirect(`/m/assignments?assigned=${created}`);
}
