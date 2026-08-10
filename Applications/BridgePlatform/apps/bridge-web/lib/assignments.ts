// Assignment helpers (Phase 3): completing an assigned board flips it to
// 'completed' and submits the play for review, so the learner never has to
// remember to send it. Since 0028 it goes to EVERY REVIEWER on the brief, one
// submission each, because reviewers get separate threads (owner direction
// 2026-08-09). A pre-0028 row has no brief, and then the reviewer set is the
// assigning coach alone — exactly the old behaviour.
//
// WHEN THIS RUNS — and this was the feature's worst flaw. Delivery used to
// happen only inside reconcileAssignments, which only runs when someone opens a
// LIST. If nobody opened /m/assigned or /m/assignments, a finished board stayed
// 'started' and the reviewers' submissions were never created: the coach's queue
// was silently short and nothing anywhere said so.
//
// So there are now two triggers, and the important one is first:
//   1. deliverForSession — called by the TABLE when it renders a finished board.
//      That is the actual completion event, it always happens (the player is
//      looking at the final position), and it runs after the response so it
//      costs the player nothing.
//   2. reconcileAssignments — the backstop on the lists, unchanged, for boards
//      finished before this existed or whose delivery failed at the time.
//
// Both are idempotent per (session, learner, coach), which is what makes having
// two triggers safe.

import type {
  Assignment,
  AssignmentBrief,
  SubmissionBoard,
} from "@bridge/sessions";
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
            await autoSubmitToReviewers(updated);
          } catch (err) {
            // Review submission is a bonus on top of completion — never block.
            // LOGGED, though: this catch used to be the only thing between a
            // fan-out bug and total silence, and a learner's feedback simply
            // never arriving is invisible from every surface.
            console.error("reconcileAssignments: fan-out for", a.assignmentId, err);
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

/**
 * Deliver the assignment(s) attached to ONE session, because that session just
 * finished. This is the completion event: called from the table page when it
 * renders a complete board.
 *
 * Silent by design about the ordinary case (no assignment for this session — most
 * boards) and never throws: it runs after a response has already been sent, so
 * there is nobody left to show an error to. Failures are logged, and the lists'
 * reconcile remains the backstop.
 */
export async function deliverForSession(sessionId: string): Promise<void> {
  try {
    const store = assignmentStore();
    // Only rows that are actually waiting on this board. A completed row has
    // already been delivered (or had nothing to deliver).
    const rows = (await store.listAssignments({ status: "started" })).filter(
      (a) => a.sessionId === sessionId,
    );
    if (rows.length === 0) return;

    const record = await sessionService().requireSession(sessionId);
    if (record.status !== "completed") return;

    for (const a of rows) {
      try {
        const updated: Assignment = {
          ...a,
          status: "completed",
          completedAt: record.updatedAt,
        };
        await store.putAssignment(updated);
        await autoSubmitToReviewers(updated);
      } catch (err) {
        console.error("deliverForSession:", a.assignmentId, err);
      }
    }
  } catch (err) {
    console.error("deliverForSession:", sessionId, err);
  }
}

/** One reviewer who should receive a learner's finished play. */
type Reviewer = { id: string; name?: string; isCreator: boolean };

/** Everyone who reviews this assignment's plays. */
async function reviewersFor(a: Assignment): Promise<Reviewer[]> {
  if (!a.briefId) {
    // Pre-0028 row: the assigning coach, byte-identical to the old behaviour.
    return [{ id: a.coachId, name: a.coachName, isCreator: true }];
  }
  const rows = await assignmentStore().listReviewers({ briefId: a.briefId });
  return rows.map((r) => ({
    id: r.reviewerId,
    name: r.reviewerName,
    isCreator: r.isCreator,
  }));
}

/**
 * Freeze the finished board once. Returns null when the session isn't actually
 * complete — folding the event stream per reviewer would multiply the cost of
 * one completion by the reviewer count on a lazy read path.
 */
async function freezeBoard(sessionId: string): Promise<SubmissionBoard | null> {
  const { record, state } = await sessionService().view(sessionId);
  if (state.phase !== "complete") return null;

  const { seededDeal, resultLabel, scoreBoard } = await import("@bridge/engine");
  const { callLabel } = await import("@bridge/events");

  const score = scoreBoard(state);
  return {
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
}

/**
 * Why this reviewer has this play. Three near-identical threads on one board are
 * only legible if each says who it is with and how it got there; the reviewer's
 * name is already on the card, so this carries the WHY.
 */
function submissionNote(title: string, r: Reviewer, late: boolean): string {
  const who = r.name ?? "your reviewer";
  const why = r.isCreator ? "who set this assignment" : "named as a reviewer on it";
  return late
    ? `Assignment “${title}” — ${who}, ${why}, was added after you finished, so this game is now with them too.`
    : `Assignment “${title}” — sent to ${who}, ${why}, when you finished.`;
}

/** The brief's title, or the per-row entry name for a pre-0028 assignment. */
async function titleFor(a: Assignment): Promise<string> {
  if (!a.briefId) return a.entryName;
  const brief = await assignmentStore().getBrief(a.briefId);
  return brief?.title ?? a.entryName;
}

/**
 * Send one learner's finished play to one reviewer, unless they already hold it.
 * Returns whether a submission was created.
 */
async function submitOne(
  a: Assignment,
  r: Reviewer,
  title: string,
  board: SubmissionBoard,
  late: boolean,
): Promise<boolean> {
  const store = submissionStore();
  const existing = await store.listSubmissions({ sessionId: a.sessionId! });
  if (existing.some((s) => s.learnerId === a.learnerId && s.coachId === r.id)) return false;

  const { newId } = await import("@bridge/kb");
  await store.putSubmission({
    submissionId: newId("ps"),
    programOrganizationId: a.programOrganizationId,
    nexusProgramId: a.nexusProgramId,
    sessionId: a.sessionId!,
    learnerId: a.learnerId,
    learnerName: a.learnerName,
    coachId: r.id,
    coachName: r.name,
    status: "submitted",
    note: submissionNote(title, r, late),
    board,
    createdAt: new Date().toISOString(),
  });
  return true;
}

/** Freeze the completed play and submit it to every reviewer on the brief. */
async function autoSubmitToReviewers(a: Assignment): Promise<void> {
  if (!a.sessionId) return;
  const reviewers = await reviewersFor(a);
  // An empty reviewer set is a CHOICE (brief.reviewNotRequired), so there is no
  // fallback: quietly re-inserting someone would make a genuine bug — reviewer
  // rows that failed to write — look like normal operation.
  if (reviewers.length === 0) return;

  const store = submissionStore();
  const existing = await store.listSubmissions({ sessionId: a.sessionId });
  const already = new Set(
    existing.filter((s) => s.learnerId === a.learnerId).map((s) => s.coachId),
  );
  const missing = reviewers.filter((r) => !already.has(r.id));
  if (missing.length === 0) return;

  const board = await freezeBoard(a.sessionId);
  if (!board) return;
  const title = await titleFor(a);

  for (const r of missing) {
    try {
      await submitOne(a, r, title, board, false);
    } catch (err) {
      // One reviewer failing must not cost the others theirs. The next read
      // surface retries, and the (session, learner, coach) guard makes that
      // safe — but only if the failures are visible enough to notice.
      console.error("autoSubmitToReviewers:", r.id, "of", a.assignmentId, err);
    }
  }
}

/**
 * A reviewer added AFTER learners already finished gets their plays too.
 *
 * The only reason to name a reviewer is to get their feedback, so a reviewer who
 * opens an empty queue is exactly the silent failure this design exists to
 * prevent. Safe by the same idempotency contract as the completion fan-out.
 */
export async function fanOutBriefToReviewer(
  brief: AssignmentBrief,
  reviewer: Reviewer,
): Promise<{ created: number }> {
  // Query-level filter, never a client filter over a capped page — that would
  // quietly skip learners.
  const rows = await assignmentStore().listAssignments({
    briefId: brief.briefId,
    status: "completed",
  });
  let created = 0;
  for (const a of rows) {
    if (!a.sessionId) continue;
    try {
      const board = await freezeBoard(a.sessionId);
      if (!board) continue;
      if (await submitOne(a, reviewer, brief.title, board, true)) created++;
    } catch (err) {
      console.error("fanOutBriefToReviewer:", a.assignmentId, err);
    }
  }
  return { created };
}
