"use server";

// Phase 3: the learner starts (or resumes) an assigned board — a fresh
// session dealt from the assigned entry, vs house players, learner in South.

import { redirect } from "next/navigation";
import { resolveEntryLineup } from "@/app/bridge/library/actions";
import { requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { ensureSeeds } from "@/lib/kb";
import { nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { assertAiAllowed } from "@/lib/org";
import { assignmentStore, libraryStore, sessionIsGone, sessionService } from "@/lib/sessions";

export async function startAssignmentAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const assignmentId = String(formData.get("assignmentId"));

  const store = assignmentStore();
  const assignment = await store.getAssignment(assignmentId);
  if (!assignment) throw new Error("Assignment not found");
  if (assignment.learnerId !== context.nexusUserId) {
    throw new Error("Only the assigned learner can start this board");
  }

  // Already underway — go back to the table, IF that table is still there.
  // STRAIGHT to the real table page: /m/table/<id> only exists to redirect
  // there, and that extra hop is another server round trip the learner waits
  // through before the board paints.
  //
  // A dangling sessionId is a dead end (see the API route's twin): the table
  // answers boardGone and the learner is bounced back to the list, for good,
  // because the row still says "started". Falling through deals a fresh board
  // off the same entry.
  if (
    assignment.sessionId &&
    assignment.status === "started" &&
    !(await sessionIsGone(assignment.sessionId))
  ) {
    redirect(`/bridge/table2/${assignment.sessionId}`);
  }

  const entry = await libraryStore().getEntry(assignment.entryId);
  if (!entry?.hands) throw new Error("This assignment's board no longer exists");

  await ensureSeeds();
  await assertAiAllowed(context);
  const { kbId, compiled, seats } = await resolveEntryLineup(entry, "", context);
  const record = await sessionService().createSession({
    kbId,
    compiled,
    seats,
    seed: 1,
    hands: entry.hands,
    dealer: entry.dealer ?? "N",
    vul: entry.vul ?? "none",
    boardName: entry.name,
    createdBy: context.nexusUserId,
    programOrganizationId: orgScopeOf(context),
    // Without the program stamp the session is invisible to every
    // program-scoped read (My Games, Resume, summary counts).
    nexusProgramId: (await nexusProgramIdOf()) ?? undefined,
    // A curated entry's session carries the stamp (owner design 2026-08-15):
    // the robots follow the coach's recorded line and the coach-overlay API
    // finds the annotations from the sessionId.
    ...(entry.curatedJson ? { curated: { entryId: entry.entryId } } : {}),
  });

  await store.putAssignment({
    ...assignment,
    status: "started",
    sessionId: record.sessionId,
    startedAt: new Date().toISOString(),
  });
  await audit(context, "assignment.started", "assignment", assignmentId, {
    sessionId: record.sessionId,
  });
  redirect(`/bridge/table2/${record.sessionId}`);
}
