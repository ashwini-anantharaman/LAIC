// Assignment helpers (Phase 3). Completion is reconciled LAZILY: the read
// surfaces check 'started' assignments against their session and flip them to
// 'completed' — the game engine stays unaware of assignments.
//
// Auto-submit (coach loop closure): the moment an assignment flips to
// completed, the play is submitted to the ASSIGNING coach for review —
// the learner doesn't have to remember to send it. Idempotent per
// (session, learner, coach); best-effort (a failed submit never blocks
// the completion flip).

import type { Assignment, SubmissionBoard } from "@bridge/sessions";
import { assignmentStore, sessionService, submissionStore } from "./sessions";

export async function reconcileAssignments(
  assignments: Assignment[],
): Promise<Assignment[]> {
  const out: Assignment[] = [];
  for (const a of assignments) {
    if (a.status === "started" && a.sessionId) {
      try {
        const record = await sessionService().requireSession(a.sessionId);
        if (record.status === "completed") {
          const updated: Assignment = {
            ...a,
            status: "completed",
            completedAt: record.updatedAt,
          };
          await assignmentStore().putAssignment(updated);
          try {
            await autoSubmitToCoach(updated);
          } catch {
            // Review submission is a bonus on top of completion — never block.
          }
          out.push(updated);
          continue;
        }
      } catch {
        // Session vanished (KB deletion) — leave the assignment as-is.
      }
    }
    out.push(a);
  }
  return out;
}

/** Freeze the completed play and submit it to the assigning coach. */
async function autoSubmitToCoach(a: Assignment): Promise<void> {
  if (!a.sessionId) return;
  const store = submissionStore();
  const existing = await store.listSubmissions({ sessionId: a.sessionId });
  if (existing.some((s) => s.learnerId === a.learnerId && s.coachId === a.coachId)) return;

  const { record, state } = await sessionService().view(a.sessionId);
  if (state.phase !== "complete") return;

  const { seededDeal, resultLabel, scoreBoard } = await import("@bridge/engine");
  const { callLabel } = await import("@bridge/events");
  const { newId } = await import("@bridge/kb");

  const score = scoreBoard(state);
  const board: SubmissionBoard = {
    name: record.board.name,
    dealer: record.board.dealer,
    vul: record.board.vul,
    hands: record.board.hands ?? seededDeal(record.board.seed),
    auction: state.auction.map((x) => ({ seat: x.seat, call: x.call })),
    play: state.tricks.flatMap((t) => t.plays.map((p) => ({ seat: p.seat, card: p.card }))),
    contractLabel: state.contract
      ? `${callLabel(`${state.contract.level}${state.contract.strain}`)} by ${state.contract.declarer}`
      : undefined,
    resultLabel: score ? resultLabel(score) : undefined,
  };

  await store.putSubmission({
    submissionId: newId("ps"),
    programOrganizationId: a.programOrganizationId,
    nexusProgramId: a.nexusProgramId,
    sessionId: a.sessionId,
    learnerId: a.learnerId,
    learnerName: a.learnerName,
    coachId: a.coachId,
    coachName: a.coachName,
    status: "submitted",
    note: `Assigned board “${a.entryName}” — submitted automatically on completion.`,
    board,
    createdAt: new Date().toISOString(),
  });
}
