// @bridge/assignments — the assignment as a component family.
//
// WHAT LIVES HERE: the view model (rows in, view out, pure), the copy, the
// palette contract, the ports the host fills, and the props-driven React that
// renders an assignment in a list and in its editor.
//
// WHAT DOES NOT: stores, request context, server actions and colour values. The
// host owns all four — which is what lets this be mounted by a second surface
// later without dragging bridge-web's plumbing behind it.
//
// ADDING A FEATURE (the reason this package exists): a new kind of thing inside
// an assignment — a drill, a tutorial, several boards — is a new member of
// AssignmentContent in @bridge/sessions plus a renderer here. No migration (the
// brief's contents live in one jsonb column), no change to the fan-out, and no
// page edits: the surfaces read `view.contents`.

export { buildAssignmentView, groupIntoAssignments, isLegacyKey, legacyKey } from "./view";
export type {
  AssignmentLearnerView,
  AssignmentReviewerView,
  AssignmentView,
  BuildAssignmentViewInput,
} from "./view";

export {
  EMPTY_COPY,
  STATUS_LABEL,
  deleteAssignmentCopy,
  peopleLine,
  removeLearnerCopy,
  removeReviewerCopy,
  reviewerState,
  reviewersWillReview,
} from "./copy";

export { BIRDBRIDGE_THEME } from "./theme";
export type { AssignmentTheme } from "./theme";

export type {
  AssignmentActions,
  AssignmentFlash,
  AssignmentLinks,
  PickablePerson,
} from "./ports";

export { AssignmentCard } from "./ui/AssignmentCard";
export { AssignmentSheet, SHEET_CSS } from "./ui/AssignmentSheet";
