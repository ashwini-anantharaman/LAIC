// The API twin of /m/assignments/actions.ts's requireEditable: load one
// assignment (brief id or legacy key) and refuse anyone who may not change
// it. Same two rules as the actions — creatorship, not reviewership, grants
// edit; the check reads the package's view so route and page can never
// disagree about who may edit. Refusals are AccessError → 404 (the API
// layer's one posture: what you can't touch reads as not-there).

import type { NexusBridgeContext } from "@laic/learner-contracts";
import { AccessError, requireContext } from "./api";
import { loadAssignment, type LoadedAssignment } from "./assignmentSets";

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
