// The API twin of /m/assignments/actions.ts's requireEditable: load one
// assignment (brief id or legacy key) and refuse anyone who may not change
// it. Same two rules as the actions — creatorship, not reviewership, grants
// edit; the check reads the package's view so route and page can never
// disagree about who may edit. Refusals are AccessError → 404 (the API
// layer's one posture: what you can't touch reads as not-there).

import type { NexusBridgeContext } from "@laic/learner-contracts";
import { AccessError, requireContext } from "./api";
import { loadAssignment, type LoadedAssignment } from "./assignmentSets";
import { audit } from "./audit";
import { assignmentStore } from "./sessions";

export async function requireEditableAssignment(
  key: string,
): Promise<{ context: NexusBridgeContext; set: LoadedAssignment }> {
  const context = await requireContext();
  const set = await loadAssignment(key, context);
  if (!set) throw new AccessError("No such assignment");
  // A reviewer may look, never change.
  if (!set.view.canEdit) throw new AccessError("Not editable");
  return { context, set };
}

/**
 * Delete one whole assignment — the brief and every learner's row.
 *
 * DETACH, NEVER DESTROY (owner direction 2026-08-09) governs this exactly as
 * it governs removing a single learner, only more so, because this removes
 * them all at once. The ROWS go. The sessions the learners played, their
 * submissions and every word of feedback written on them are left standing:
 * a deleted assignment stops being ASKED FOR, it does not erase anyone's
 * work. A learner keeps the boards they played, in My Plays, where a board
 * they were never assigned would also live.
 *
 * The brief goes last. If the process dies mid-way the brief still points at
 * the rows that remain, which the pages already render; the other order would
 * strand rows under a brief that no longer exists.
 *
 * Shared by the ✎ sheet's action and the native editor's DELETE so the two
 * can never mean different things by "delete".
 */
export async function deleteAssignmentSet(
  context: NexusBridgeContext,
  set: LoadedAssignment,
): Promise<{ learners: number; keptSessions: number }> {
  const keptSessions = set.issues.filter((a) => a.sessionId).length;
  for (const a of set.issues) {
    await assignmentStore().deleteAssignment(a.assignmentId);
  }
  if (set.brief) await assignmentStore().deleteBrief(set.brief.briefId);
  await audit(context, "assignment.deleted", "assignment", set.view.key, {
    learners: set.issues.length,
    keptSessions,
  });
  return { learners: set.issues.length, keptSessions };
}
