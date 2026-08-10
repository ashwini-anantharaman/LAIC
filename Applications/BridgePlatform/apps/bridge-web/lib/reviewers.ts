// WHO MAY BE NAMED A REVIEWER ON AN ASSIGNMENT. One file, one policy.
//
// TODAY: every coach in the program. The owner said explicitly (2026-08-09)
// that this WILL be narrowed later — so it lives here alone, and narrowing it
// is a change to THIS FILE, not a hunt through pages and actions.
//
// Never call getProgramCoaches() from a page or an action to build a reviewer
// pool. That scattering is the mistake this module exists to prevent: once the
// policy narrows, any surface that kept its own list would still offer the whole
// program, and a coach named from it becomes a reviewer with a real thread on a
// learner's play.
//
// Modelled on app/bridge/challenges/people.ts, which exists for the same reason.

import { STUB_USERS, stubDisplayName } from "@bridge/nexus-client";
import type { NexusBridgeContext } from "@laic/learner-contracts";
import { cache } from "react";
import { getProgramCoaches, nexusMode } from "@/lib/nexus";

export interface ReviewerCandidate {
  /** The id space bridge_play_submissions.coach_id keys on — a Nexus profile
   *  id. Stored verbatim: a mismatch here leaves the reviewer's queue silently
   *  empty forever. */
  reviewerId: string;
  name: string;
  /** Quiet right-hand detail on the picker row ("4 learners"). */
  detail?: string;
}

/** Everyone the caller may name, minus the caller — their row is the fixed
 *  creator row, not a candidate. */
export const reviewerCandidates = cache(
  async (context: NexusBridgeContext): Promise<ReviewerCandidate[]> => {
    const byId = new Map<string, ReviewerCandidate>();
    const add = (person: ReviewerCandidate) => {
      if (!person.reviewerId || person.reviewerId === context.nexusUserId) return;
      if (!byId.has(person.reviewerId)) byId.set(person.reviewerId, person);
    };

    // Stub mode has no Nexus to ask (nexusGet yields nothing), so without this
    // branch the picker is empty in local dev and the feature is untestable
    // outside a live program.
    if (nexusMode() === "stub") {
      for (const user of STUB_USERS)
        add({ reviewerId: user.context.nexusUserId, name: user.displayName });
    } else {
      for (const coach of await getProgramCoaches().catch(() => [])) {
        const count = Number(coach.learner_count ?? 0);
        add({
          reviewerId: coach.coach_id,
          name: coach.name ?? coach.coach_id,
          detail: `${count} learner${count === 1 ? "" : "s"}`,
        });
      }
    }

    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  },
);

/**
 * The same rule, for an id arriving from a form — so the picker and the guard
 * can never disagree about who is eligible. Callers MUST refuse on null rather
 * than trust the posted id, the posture sendPlayToCoachAction takes with
 * coaches (app/m/plays/actions.ts).
 */
export async function findReviewerCandidate(
  context: NexusBridgeContext,
  reviewerId: string,
): Promise<ReviewerCandidate | null> {
  if (!reviewerId) return null;
  return (
    (await reviewerCandidates(context)).find((c) => c.reviewerId === reviewerId) ?? null
  );
}

/** The creator's own row: always a reviewer at create time, never a candidate. */
export function selfReviewer(context: NexusBridgeContext): ReviewerCandidate {
  return {
    reviewerId: context.nexusUserId,
    // Stub contexts carry no displayName, so the dev roster supplies it rather
    // than showing a raw id.
    name:
      context.displayName ?? stubDisplayName(context.nexusUserId) ?? context.nexusUserId,
    detail: "creator",
  };
}
