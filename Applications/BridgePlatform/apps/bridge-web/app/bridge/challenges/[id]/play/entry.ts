// The challenge ENTRY (spec ADDENDUM A1): tapping a challenge starts or
// resumes play immediately on the viewer's next unplayed board. There is no
// landing page, no cover card and no board browser — this module resolves where
// the tap lands and hands back one href.
//
// ONE ATTEMPT, RESUME-ONLY (spec §2). Starting a board IS the attempt. The
// plays table is keyed (challenge, board, user), so the record is an upsert and
// an attempt cannot fork; and a board that already carries a session is always
// RESUMED — this module never rewinds, re-seats or re-deals a started board.
//
// It also owns the other half of that contract: FREEZING a finished board.
// Completion is reconciled lazily at the read surfaces, exactly like
// assignments (lib/assignments.ts reconcileAssignments/autoSubmitToCoach): the
// entry reconciles before it decides where to send you, the table reconciles
// while you are sitting at it, and the frozen `completed` play IS the
// sequential pointer — the next board is simply the first without one.
//
// SERVER-ONLY: touches the session service and the challenge store.

import {
  boardParticipants,
  challengeBoardIsOver,
  isBiddingOnly,
  type Challenge,
  type ChallengeBoard,
  type ChallengePlay,
  type ChallengeSnapshot,
} from "@bridge/challenges";
import type { Seat } from "@bridge/events";
import { SessionService, type SeatConfig } from "@bridge/sessions";
import type { NexusBridgeContext } from "@bridge/nexus-client";
import { audit } from "@/lib/audit";
import {
  challengeStore,
  challengeViewerAccess,
  getChallenge,
  getChallengeBoard,
} from "@/lib/challenges";
import { ensureSeeds } from "@/lib/kb";
import { nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { assertAiAllowed, assertKbAllowed } from "@/lib/org";
import { resolveQuickPlayLineup, type QuickPlayLineup } from "@/lib/quickPlay";
import { sessionService } from "@/lib/sessions";

const SEATS: readonly Seat[] = ["N", "E", "S", "W"];

// ── freezing a finished board ───────────────────────────────────────────────

/**
 * WHEN AN ATTEMPT IS OVER — now @bridge/challenges' `challengeBoardIsOver`, so
 * the embedded solo player (which has no server to ask) obeys the same rule.
 * Re-exported here because the table imports it from this module.
 */
export { challengeBoardIsOver };

/**
 * If this attempt's session has finished, freeze the play: a render-ready
 * snapshot (the SubmissionBoard shape, per spec §4 "reuse the submissions
 * freeze pattern verbatim") plus the duplicate raw score from the
 * PARTICIPANT'S side, so raw scores compare directly across a field that all
 * sat the same seat. Returns the play unchanged when there is nothing to do.
 *
 * Idempotent and best-effort: a completed play is returned untouched, and a
 * session that has vanished leaves the record alone rather than throwing.
 */
export async function freezeChallengePlay(play: ChallengePlay): Promise<ChallengePlay> {
  if (play.status === "completed") return play;

  let view;
  try {
    view = await sessionService().view(play.sessionId);
  } catch {
    return play;
  }
  const { record, state } = view;

  // The format decides when this attempt ends, so it is read before anything
  // else. An unreadable challenge falls back to the full-board rule — the
  // conservative answer, which never ends a board early.
  const challenge = await getChallenge(play.challengeId);
  const biddingOnly = challenge ? isBiddingOnly(challenge) : false;
  if (!challengeBoardIsOver(state.phase, biddingOnly)) return play;

  const { resultLabel, scoreBoard, seededDeal } = await import("@bridge/engine");
  const { contractLabel } = await import("@bridge/events");

  const board = await getChallengeBoard(play.challengeId, play.boardNo);
  // Null on a bidding-only board that stopped at the end of the auction —
  // there are no tricks to score, and that absence is the point.
  const score = scoreBoard(state);
  // scoreBoard reports from NS's side; every participant plays the board's
  // humanSeat, so flip it for an E/W seat and the figure always reads "good for
  // the participant". A passed-out board is a flat 0 for the whole field.
  const humanSeat = board?.humanSeat ?? "S";
  // NO SCORE IS NOT A SCORE OF ZERO. A bidding-only board leaves `rawScore`
  // absent rather than writing a 0 that would join a field as a flat board.
  const rawScore = score
    ? humanSeat === "N" || humanSeat === "S"
      ? score.nsScore
      : -score.nsScore
    : undefined;

  const snapshot: ChallengeSnapshot = {
    name: record.board.name,
    dealer: record.board.dealer,
    vul: record.board.vul,
    hands: record.board.hands ?? seededDeal(record.board.seed),
    auction: state.auction.map((x) => ({ seat: x.seat, call: x.call })),
    play: state.tricks.flatMap((t) => t.plays.map((p) => ({ seat: p.seat, card: p.card }))),
    // One formatter, shared with the baselines' freeze, so a learner's contract
    // and BEN's are printed the same way when they are set side by side — and
    // so a doubled contract stops losing its X on this path.
    contractLabel: state.contract ? contractLabel(state.contract) : undefined,
    resultLabel: score ? resultLabel(score) : undefined,
    // The structured contract is what a bidding-only board is scored on; null
    // says "passed out", which is a result, not a gap.
    contract: state.contract,
  };

  const completed: ChallengePlay = {
    ...play,
    status: "completed",
    snapshot,
    ...(rawScore === undefined ? {} : { rawScore }),
    completedAt: record.updatedAt ?? new Date().toISOString(),
  };
  await challengeStore().putPlay(completed);
  return completed;
}

/**
 * Freeze every finished-but-unrecorded attempt this viewer holds in one
 * challenge. Uses the RAW store rather than the cached readers on purpose: the
 * cached readers memoize per request, so a reconcile must run before anything
 * reads through them or the page would decide on pre-freeze plays.
 */
export async function reconcileChallengePlays(
  challengeId: string,
  userId: string,
): Promise<ChallengePlay[]> {
  let plays: ChallengePlay[] = [];
  try {
    plays = await challengeStore().listPlays({ challengeId, userId });
  } catch (error) {
    console.error("challenges: plays unreadable — entry degrades", error);
    return [];
  }
  const out: ChallengePlay[] = [];
  for (const play of plays) {
    out.push(play.status === "in_progress" ? await freezeChallengePlay(play) : play);
  }
  return out;
}

// ── the entry ───────────────────────────────────────────────────────────────

/** Where an entry attempt lands, or `null` when there is no such challenge. */
export type ChallengeEntryHref = string | null;

/**
 * THE HOUSE PLAYER PLAYS THE OTHER THREE (owner direction 2026-08-11,
 * superseding spec §2's BEN-everywhere): challenge robots are the same KB
 * house lineup a fresh Play-tab board seats, resolved through the same
 * resolveQuickPlayLineup. BEN was 20-45s per card, which made a six-board
 * challenge an afternoon on a phone; BEN still computes the results page's
 * comparison baselines, where nobody is waiting on it. With no compiling
 * knowledge base there is no opposition — refuse to start rather than burn
 * the one attempt; the list page renders `?error=` as a banner.
 */
const NO_LINEUP_HREF = `/bridge/challenges?error=${encodeURIComponent(
  "No knowledge base compiles yet, so there are no house players to seat.",
)}`;

/** The lineup, or the honest refusal — shared by the scored and practice doors. */
async function houseLineup(context: NexusBridgeContext): Promise<QuickPlayLineup | null> {
  await ensureSeeds();
  await assertAiAllowed(context);
  const lineup = await resolveQuickPlayLineup(context);
  if (!lineup) return null;
  // The lineup cache is a shortcut, never a permission (quick-play's own rule).
  await assertKbAllowed(context, lineup.kbId);
  return lineup;
}

/**
 * Resolve the tap (spec A1). In order:
 *
 *  - reconcile, so a board finished in a previous sitting counts;
 *  - an unaccepted invite opens nothing — accept/decline lives on the list card;
 *  - a viewer who has finished every board (or an archived challenge) gets the
 *    results view instead;
 *  - a board already started RESUMES, always;
 *  - otherwise the board's session is created, seating the viewer at the
 *    board's `humanSeat` with BEN everywhere else, and the attempt is claimed.
 */
export async function enterChallenge(
  challengeId: string,
  context: NexusBridgeContext,
): Promise<ChallengeEntryHref> {
  const userId = context.nexusUserId;
  const store = challengeStore();

  // Reconcile FIRST and through the raw store: everything below reads through
  // the request-cached readers, which must see the post-freeze picture.
  const plays = await reconcileChallengePlays(challengeId, userId);

  const access = await challengeViewerAccess(challengeId, userId);
  const challenge = access.challenge;
  if (!challenge) return null;

  // The creator is auto-invited and auto-accepted; the reader's moderator rule
  // already tolerates a not-yet-written creator row, so this one does too.
  const accepted = access.viewerAccepted || challenge.createdBy === userId;
  if (!accepted) return "/bridge/challenges";

  const resultsHref = `/bridge/challenges/${challengeId}/results`;
  if (access.viewerFinished || access.nextBoardNo === null || challenge.status === "archived") {
    return resultsHref;
  }
  const boardNo = access.nextBoardNo;

  // RESUME. One attempt: a board with a live session is re-opened exactly as it
  // was left, never restarted.
  const existing = plays.find((p) => p.boardNo === boardNo);
  if (existing?.sessionId) {
    try {
      await sessionService().requireSession(existing.sessionId);
      return `/bridge/table2/${existing.sessionId}`;
    } catch {
      // The sitting itself is gone (its KB was deleted). There is nothing left
      // to resume, so the attempt is re-seated below on the same play record —
      // the only case in which a started board gets a new session.
      console.error(`challenges: session ${existing.sessionId} vanished — re-seating board ${boardNo}`);
    }
  }

  const board = await getChallengeBoard(challengeId, boardNo);
  if (!board) return null;

  const lineup = await houseLineup(context);
  if (!lineup) return NO_LINEUP_HREF;
  const ai = SessionService.seatFromPlayer(lineup.house, lineup.compiled);

  const record = await sessionService().createSession({
    kbId: lineup.kbId,
    compiled: lineup.compiled,
    seats: seatsForBoard(board, userId, ai),
    seed: boardNo,
    hands: board.pack,
    dealer: board.dealer,
    vul: board.vul,
    boardName: `${challenge.title} · Board ${boardNo}`,
    createdBy: userId,
    programOrganizationId: orgScopeOf(context),
    nexusProgramId: (await nexusProgramIdOf()) ?? undefined,
    // THE STAMP is scoring's spine (freeze, the strip, the results view), and
    // it would route BEN seats through the challenge decision cache if BEN
    // ever sat here again — the house player is the opposition now (owner
    // direction 2026-08-11).
    challenge: { challengeId, boardNo },
  });

  // Claim guard: two taps in flight would each have created a session, and the
  // (challenge, board, user) key means the second write would silently orphan
  // the first attempt. Re-read before claiming and yield to whoever got there —
  // but only to a session we had NOT already seen, or the re-seat path above
  // would hand the viewer straight back to the sitting that vanished.
  const claimed = await store.getPlay(challengeId, boardNo, userId);
  if (
    claimed?.sessionId &&
    claimed.sessionId !== record.sessionId &&
    claimed.sessionId !== existing?.sessionId
  ) {
    return `/bridge/table2/${claimed.sessionId}`;
  }

  const startedAt = new Date().toISOString();
  await store.putPlay({
    challengeId,
    boardNo,
    userId,
    sessionId: record.sessionId,
    status: "in_progress",
    // A re-seated attempt keeps the moment it was first started: the attempt is
    // the same one, it is only its sitting that had to be rebuilt.
    startedAt: existing?.startedAt ?? startedAt,
  });

  // The first participant to START a board locks the boards, seats and control
  // overrides (spec §2). Invites stay addable forever.
  if (!challenge.lockedAt) {
    const locked: Challenge = { ...challenge, lockedAt: startedAt };
    await store.putChallenge(locked);
  }

  await audit(context, "profile.update", "kb_session", record.sessionId, {
    challengeId,
    boardNo,
    challengeBoardStarted: true,
  });

  return `/bridge/table2/${record.sessionId}`;
}

/**
 * REPLAY FOR PRACTICE — the unscored copy (spec §2, "Attempts"; the results
 * view links here with `?board=k&practice=1`).
 *
 * What makes it practice is what it does NOT do. It writes no play record, so
 * the (challenge, board, user) attempt is untouched and the frozen first
 * completion stays the scored result forever; it moves no pointer, because the
 * pointer IS the set of completed plays; and it never sets `lockedAt`, which
 * only a real first start may do. Nothing about the challenge changes — the
 * only write is the new session itself.
 *
 * It lands at an ORDINARY table: with no play record, `challengeTableContext`
 * finds nothing and the board wears no strip, no Results button, no control
 * overrides. The session IS stamped `practice`, though — the format
 * (bidding-only) reads off it, and the robots are the same house lineup the
 * scored sitting seats.
 *
 * NO CHROME IS NOT NO FORMAT (owner, 2026-08-10). What a board asks for belongs
 * to the challenge, not to the decoration, so a replay of a BIDDING-ONLY board
 * ends with the auction exactly as the scored attempt did — the table reads
 * that off this stamp (`practiceIsBiddingOnly`, table2/[sessionId]/
 * challengeTable.ts), and the results view's replay button names the exercise
 * before it is tapped. Playing such a board out here would be a different
 * exercise wearing the same deal, offered by accident.
 *
 * GUARDED. Only a participant who has ACCEPTED and FINISHED every board may
 * open one: before that, a practice copy would sit beside a live attempt on the
 * same deal, which is exactly the spoiler the whole-challenge unlock forbids.
 * An unfinished viewer is sent to the results view, which tells them so.
 */
export async function enterChallengePractice(
  challengeId: string,
  boardNo: number,
  context: NexusBridgeContext,
): Promise<ChallengeEntryHref> {
  const userId = context.nexusUserId;

  // The same lazy freeze the scored entry runs first: "have you finished?" is
  // only true once every finished sitting has been reconciled into a play.
  await reconcileChallengePlays(challengeId, userId);

  const access = await challengeViewerAccess(challengeId, userId);
  const challenge = access.challenge;
  if (!challenge) return null;

  const accepted = access.viewerAccepted || challenge.createdBy === userId;
  if (!accepted) return "/bridge/challenges";

  const resultsHref = `/bridge/challenges/${challengeId}/results`;
  // Not finished: no practice copy, and no scored board started by accident.
  if (!access.viewerFinished) return resultsHref;

  const board = await getChallengeBoard(challengeId, boardNo);
  if (!board) return resultsHref;

  const lineup = await houseLineup(context);
  if (!lineup) return NO_LINEUP_HREF;
  const ai = SessionService.seatFromPlayer(lineup.house, lineup.compiled);

  const record = await sessionService().createSession({
    kbId: lineup.kbId,
    compiled: lineup.compiled,
    seats: seatsForBoard(board, userId, ai),
    seed: boardNo,
    hands: board.pack,
    dealer: board.dealer,
    vul: board.vul,
    boardName: `${challenge.title} · Board ${boardNo} · practice`,
    createdBy: userId,
    programOrganizationId: orgScopeOf(context),
    nexusProgramId: (await nexusProgramIdOf()) ?? undefined,
    challenge: { challengeId, boardNo, practice: true },
  });

  await audit(context, "profile.update", "kb_session", record.sessionId, {
    challengeId,
    boardNo,
    challengePractice: true,
  });

  return `/bridge/table2/${record.sessionId}`;
}

// ── seating ─────────────────────────────────────────────────────────────────

/**
 * The board's seat plan as session seat configs. Read through
 * `boardParticipants` rather than assuming three robot opponents (ADDENDUM
 * A6) — the day a live human-vs-human table arrives, only the plan changes.
 * Every non-human seat is `ai` — the KB house player the ordinary Play-tab
 * board seats (owner direction 2026-08-11; BEN sat here before, and still
 * computes the results baselines).
 */
export function seatsForBoard(
  board: Pick<ChallengeBoard, "humanSeat" | "participants">,
  userId: string,
  ai: SeatConfig,
): Record<Seat, SeatConfig> {
  const seats = {} as Record<Seat, SeatConfig>;
  for (const participant of boardParticipants(board, userId)) {
    seats[participant.seat] =
      participant.kind === "user"
        ? { kind: "human", nexusUserId: participant.userId ?? userId }
        : ai;
  }
  for (const seat of SEATS) seats[seat] ??= ai;
  return seats;
}
