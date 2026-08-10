// Everything an assignment SAYS, in one place.
//
// This was scattered across two pages and written twice in places, which is how
// the careful distinctions drift. Two of them matter enough to state here:
//
//  • Nothing an assignment removes is destroyed — a learner's game and a
//    reviewer's written feedback both survive — so none of this copy may borrow
//    My Games' "won't be recoverable". That sentence belongs only where deletion
//    is real, and using it here would make a reversible act read as final.
//  • People are named verbatim. Never a first name, never initials: coaches
//    called "Coach One" and "Coach Anna" both reduce to "Coach", which is the
//    bug that started the multi-coach work.

import type { AssignmentStatus } from "@bridge/sessions";
import type { AssignmentLearnerView, AssignmentReviewerView, AssignmentView } from "./view";

export const STATUS_LABEL: Record<AssignmentStatus, string> = {
  assigned: "not started",
  started: "in progress",
  completed: "completed ✓",
};

/**
 * Who is involved, in one line, counts only — the owner asked that this need not
 * be explicit on the card, and naming reviewers there would crowd it.
 */
export function peopleLine(view: AssignmentView): string {
  const creator = view.creatorIsViewer ? "you" : view.creatorName;
  const n = view.learners.length;
  const learners = `${n} learner${n === 1 ? "" : "s"}`;
  const r = view.reviewers.length;
  const review = r > 1 ? `${r} reviewers` : "you review";
  return `${creator} · ${learners} · ${review}`;
}

/** What has come back to one reviewer so far. */
export function reviewerState(r: AssignmentReviewerView): string {
  if (r.sent === 0) return "nothing to review yet";
  if (r.reviewed > 0) return `${r.reviewed} reviewed`;
  return `${r.sent} to review`;
}

export function removeLearnerCopy(learner: AssignmentLearnerView): string {
  const who = learner.name;
  if (learner.status === "assigned") {
    return `Remove ${who} from this assignment? It disappears from their list. Nothing else changes.`;
  }
  if (learner.status === "started") {
    return `Remove ${who} from this assignment? The board they've already started stays in their My Games — this only takes it off their assignment list.`;
  }
  const n = learner.threads.length;
  const kept = n > 0 ? `, and the ${n} feedback thread${n === 1 ? "" : "s"} on it stay too` : "";
  return `Remove ${who} from this assignment? Their finished game stays in their My Games${kept}. This only takes the board off their assignment list.`;
}

export function removeReviewerCopy(r: AssignmentReviewerView): string {
  const who = r.name;
  if (r.sent === 0) {
    return `Remove ${who} as a reviewer? No plays have been sent to them yet, so nothing is lost — they just won't be given any from this assignment.`;
  }
  // Careful not to overclaim: their existing threads stay open to them, because
  // the plays already with them are not withdrawn.
  return `Remove ${who} as a reviewer? Anything they've written stays — learners keep their feedback, and those threads stay open. They just won't be given any new plays from this assignment.`;
}

/** The learner's inbox line, when several coaches will look at one board. */
export function reviewersWillReview(count: number): string | null {
  return count > 1 ? `${count} coaches will review` : null;
}

export const EMPTY_COPY = {
  noLearners: "Nobody has this assignment.",
  noRosterAtAll:
    "Nobody has hired you yet — learners appear here once they pick you as their coach.",
  rosterExhausted: "Everyone on your roster already has this.",
  noOtherCoaches: "No other coaches in this program yet.",
  allCoachesReviewing: "Every coach in the program is already a reviewer.",
  noInstruction: "No instruction.",
  legacyPrompt:
    "This assignment was made before reviewers existed. Turn it into an editable assignment to add them — nothing your learners see changes.",
} as const;
