"use server";

// Phase 2 (coach/learner): a learner sends a COMPLETED play to their hired
// coach. The submission freezes a render-ready snapshot (KbSuggestion's
// reasoning: the source session can be forked/rewound later; the review must
// not drift). The coach comes from Nexus — the roster lives there.

import type { SubmissionBoard } from "@bridge/sessions";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getMyCoach, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { sessionService, submissionStore } from "@/lib/sessions";

export async function sendPlayToCoachAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const sessionId = String(formData.get("sessionId"));
  const note = String(formData.get("note") ?? "").trim();

  const coach = await getMyCoach();
  if (!coach) {
    redirect(`/m/plays?error=${encodeURIComponent("You don't have a coach yet — hire one in the app first.")}`);
  }

  const { record, state } = await sessionService().view(sessionId);
  if (record.createdBy !== context.nexusUserId) {
    throw new Error("Only your own plays can be sent for review");
  }
  if (state.phase !== "complete") {
    redirect(`/m/plays?error=${encodeURIComponent("Finish the board before sending it for review.")}`);
  }

  // Idempotent: the same play, already with this coach, doesn't duplicate.
  const existing = await submissionStore().listSubmissions({ sessionId });
  if (
    existing.some(
      (s) => s.learnerId === context.nexusUserId && s.coachId === coach.coach_id,
    )
  ) {
    redirect("/m/plays?sent=1");
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
  redirect("/m/plays?sent=1");
}

/**
 * Replay a finished board: a FRESH fork — same deal, same pinned compile,
 * same lineup, zero events — landing straight at the new table. The original
 * session (and any review of it) stays untouched; that's what fork is for.
 */
export async function replayBoardAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const sessionId = String(formData.get("sessionId"));

  const service = sessionService();
  let record;
  try {
    record = await service.requireSession(sessionId);
  } catch {
    redirect(`/m/plays?error=${encodeURIComponent("That board doesn't exist any more.")}`);
  }
  if (record.createdBy !== context.nexusUserId) {
    throw new Error("Only your own boards can be replayed");
  }

  let next;
  try {
    next = await service.fork(sessionId, record.seats, context.nexusUserId, { fresh: true });
  } catch {
    redirect(`/m/plays?error=${encodeURIComponent("Couldn't set up the replay — try again.")}`);
  }
  await audit(context, "session.fork", "session", next.sessionId, {
    replayOf: sessionId,
    fresh: true,
  });
  redirect(`/m/table/${next.sessionId}?from=games`);
}
