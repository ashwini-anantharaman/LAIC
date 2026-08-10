"use server";

// Phase 2 (coach/learner): a learner sends a COMPLETED play to their hired
// coach. The submission freezes a render-ready snapshot (KbSuggestion's
// reasoning: the source session can be forked/rewound later; the review must
// not drift). The coach comes from Nexus — the roster lives there.

import type { SubmissionBoard } from "@bridge/sessions";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getMyCoaches, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { sessionService, submissionStore } from "@/lib/sessions";

/** Back to My Games — narrowed to one coach when the form came from that view. */
function playsPath(coachField: FormDataEntryValue | null): string {
  const coachId = String(coachField ?? "").trim();
  return coachId ? `/m/plays?coach=${encodeURIComponent(coachId)}` : "/m/plays";
}

export async function sendPlayToCoachAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const sessionId = String(formData.get("sessionId"));
  const note = String(formData.get("note") ?? "").trim();

  // MULTI-COACH (owner direction 2026-08-09): the learner picks WHICH coach
  // this play goes to. The choice arrives as coach_id and must be one of
  // their own hires — never a free-typed id. With no coach_id (an old form),
  // the first hire keeps the legacy behaviour.
  const coaches = await getMyCoaches();
  if (coaches.length === 0) {
    redirect(`/m/plays?error=${encodeURIComponent("You don't have a coach yet — hire one in the app first.")}`);
  }
  const pickedId = String(formData.get("coach_id") ?? "");
  const coach = pickedId ? coaches.find((co) => co.coach_id === pickedId) : coaches[0]!;
  if (!coach) {
    redirect(`/m/plays?error=${encodeURIComponent("That coach isn't on your list any more — pick another.")}`);
  }
  // Sent from ONE COACH'S view (?coach=…)? Come back to it. Landing on the
  // unfiltered list would silently move the learner out of the place they were
  // standing. The invalid-coach cases above deliberately stay unfiltered —
  // there the filter itself is the broken thing.
  const back = playsPath(formData.get("coach"));

  const { record, state } = await sessionService().view(sessionId);
  if (record.createdBy !== context.nexusUserId) {
    throw new Error("Only your own plays can be sent for review");
  }
  if (state.phase !== "complete") {
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent("Finish the board before sending it for review.")}`);
  }

  // Idempotent: the same play, already with this coach, doesn't duplicate.
  const existing = await submissionStore().listSubmissions({ sessionId });
  if (
    existing.some(
      (s) => s.learnerId === context.nexusUserId && s.coachId === coach.coach_id,
    )
  ) {
    redirect(`${back}${back.includes("?") ? "&" : "?"}sent=1`);
  }

  const { seededDeal, resultLabel, scoreBoard } = await import("@bridge/engine");
  const { callLabel } = await import("@bridge/events");
  const { newId } = await import("@bridge/kb");

  const score = scoreBoard(state);
  const board: SubmissionBoard = {
    name: record.board.name,
    dealer: record.board.dealer,
    vul: record.board.vul,
    hands: record.board.hands ?? seededDeal(record.board.seed),
    auction: state.auction.map((a) => ({ seat: a.seat, call: a.call })),
    play: state.tricks.flatMap((t) => t.plays.map((p) => ({ seat: p.seat, card: p.card }))),
    contractLabel: state.contract
      ? `${callLabel(`${state.contract.level}${state.contract.strain}`)} by ${state.contract.declarer}`
      : undefined,
    resultLabel: score ? resultLabel(score) : undefined,
  };

  const submissionId = newId("ps");
  await submissionStore().putSubmission({
    submissionId,
    programOrganizationId: orgScopeOf(context),
    nexusProgramId: (await nexusProgramIdOf()) ?? undefined,
    sessionId,
    learnerId: context.nexusUserId,
    learnerName: context.displayName ?? undefined,
    coachId: coach.coach_id,
    coachName: coach.name,
    status: "submitted",
    ...(note ? { note } : {}),
    board,
    createdAt: new Date().toISOString(),
  });
  await audit(context, "play.submitted", "play_submission", submissionId, {
    sessionId,
    coachId: coach.coach_id,
  });
  redirect(`${back}${back.includes("?") ? "&" : "?"}sent=1`);
}

/**
 * Remove a finished board from My Games — the learner tidying their own
 * history. The board is DELETED, not hidden: there is no archive shelf, and a
 * list that quietly keeps what you removed is worse than no button at all.
 *
 * IT REMOVES THE GAME EVERYWHERE (owner direction 2026-08-09), including the
 * coach's side: every submission of this board goes too, and with it their
 * review queue entry and any feedback written on it (comments cascade off the
 * submission). The learner owns their own play, so removing it is not a
 * "withdraw from review" — the game stops existing for both people. The
 * confirm step in the UI says so in those words, because it cannot be undone.
 *
 * (The /m/table/[id]/discard route is the other half of this pair: it takes
 * UNFINISHED boards only, and deliberately refuses finished ones.)
 */
export async function removeBoardAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const sessionId = String(formData.get("sessionId"));
  const back = playsPath(formData.get("coach"));
  const withParam = (key: string, value: string) =>
    `${back}${back.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;

  const service = sessionService();
  let record;
  try {
    record = await service.requireSession(sessionId);
  } catch {
    // Already gone (a double submit, or removed in another tab). That IS the
    // asked-for outcome, so confirm it rather than raise.
    redirect(withParam("removed", "1"));
  }
  if (record.createdBy !== context.nexusUserId) {
    throw new Error("Only your own boards can be removed");
  }

  // Only the CALLER'S OWN submissions of this board. Filtering by learnerId as
  // well as session is what stops one learner's removal from reaching into
  // another's review of a shared board.
  const store = submissionStore();
  const mine = (await store.listSubmissions({ sessionId })).filter(
    (s) => s.learnerId === context.nexusUserId,
  );
  for (const sub of mine) {
    await store.deleteSubmission(sub.submissionId);
    await audit(context, "play.submitted", "play_submission", sub.submissionId, {
      sessionId,
      coachId: sub.coachId,
      removed: true,
    });
  }

  await service.deleteSession(sessionId);
  await audit(context, "session.discard", "session", sessionId, {
    board: record.board.name,
    from: "games",
    reviewsRemoved: mine.length,
  });
  redirect(withParam("removed", "1"));
}

/**
 * Replay a finished board: a FRESH fork — same deal, same pinned compile,
 * same lineup, zero events — landing straight at the new table. The original
 * session (and any review of it) stays untouched; that's what fork is for.
 */
export async function replayBoardAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const sessionId = String(formData.get("sessionId"));
  const back = playsPath(formData.get("coach"));

  const service = sessionService();
  let record;
  try {
    record = await service.requireSession(sessionId);
  } catch {
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent("That board doesn't exist any more.")}`);
  }
  if (record.createdBy !== context.nexusUserId) {
    throw new Error("Only your own boards can be replayed");
  }

  let next;
  try {
    next = await service.fork(sessionId, record.seats, context.nexusUserId, { fresh: true });
  } catch {
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent("Couldn't set up the replay — try again.")}`);
  }
  await audit(context, "session.fork", "session", next.sessionId, {
    replayOf: sessionId,
    fresh: true,
  });
  redirect(`/m/table/${next.sessionId}?from=games`);
}
