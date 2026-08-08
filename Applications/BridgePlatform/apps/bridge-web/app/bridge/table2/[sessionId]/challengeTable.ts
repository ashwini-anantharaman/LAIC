// The table page's CHALLENGE BRANCH, server side (spec ADDENDUM A4).
//
// A challenge board is played at the ordinary table — the strip is challenge
// chrome layered ABOVE an unforked PlayTable, never a second table. So this
// module answers exactly one question for the page: "does this session belong
// to a challenge, and if so what chrome does it wear?" It returns null for
// every ordinary table, and null again when the challenge store is unreachable:
// a challenge read must never take the table down.
//
// It is also where a challenge board's COMPLETION is noticed. The freeze runs
// here, on the render that first sees `phase === "complete"` — the same lazy
// reconcile as assignments — and the frozen play IS the sequential pointer, so
// the next entry lands on the next board with no separate cursor to keep true.
//
// The standings the overlay shows are built by the RESULTS view model, not by a
// second adapter: a viewer who opens the overlay mid-board and then walks to
// /bridge/challenges/[id]/results must read the same figures, ranks and marks,
// so there is one builder and this is a caller of it.
//
// SERVER-ONLY.

import type { ChallengeBoard, ChallengePlay } from "@bridge/challenges";
import type { NexusBridgeContext } from "@bridge/nexus-client";
import type { SessionView } from "@bridge/sessions";
import type {
  ChallengeBoardCell,
  ChallengeStripProps,
  LeaderboardProps,
} from "@bridge/table-ui";
import { freezeChallengePlay } from "@/app/bridge/challenges/[id]/play/entry";
import { buildResultsView } from "@/app/bridge/challenges/[id]/results/resultsView";
import { canUse } from "@/lib/access";
import {
  challengeStore,
  challengeViewerAccess,
  getChallengeBoard,
  listChallengeBaselines,
  listChallengeBoards,
  listChallengeInvites,
  listChallengePlays,
} from "@/lib/challenges";
import { TABLE_CONTROL_KEYS, type TableControlAccess } from "./challengeControls";

/** Everything the table needs to dress itself as a challenge board. */
export interface ChallengeTableContext {
  challengeId: string;
  boardNo: number;
  /** Carries `controlOverrides` — the exception layer over the catalogue. */
  board: ChallengeBoard;
  /** The strip above the top toolbar; the host binds `onResults`. */
  strip: Omit<ChallengeStripProps, "onResults">;
  /** Fed straight to the overlay's <Leaderboard>. Empty while results are locked. */
  standings: LeaderboardProps;
  /** The viewer's own board-by-board line, for the overlay's compact strip. */
  boards: ChallengeBoardCell[];
  /** The quiet line under the overlay heading. */
  subtitle: string;
}

/** The access catalogue's answer for every control the table gates on. */
export async function tableControlAccess(
  context: NexusBridgeContext,
): Promise<TableControlAccess> {
  const entries = await Promise.all(
    TABLE_CONTROL_KEYS.map(async (key) => [key, await canUse(context, key)] as const),
  );
  return Object.fromEntries(entries) as TableControlAccess;
}

/**
 * The challenge this session belongs to, or null. Also freezes the play when
 * the board has just finished — see the module note.
 */
export async function challengeTableContext(
  view: SessionView,
  context: NexusBridgeContext,
): Promise<ChallengeTableContext | null> {
  const userId = context.nexusUserId;
  const sessionId = view.record.sessionId;

  // The reverse lookup, through the RAW store: everything below reads through
  // the request-cached readers, and the freeze must land before they memoize.
  // Scoped to this viewer's own plays, so a challenge board only ever wears its
  // chrome for the person whose attempt it is.
  let play: ChallengePlay | null = null;
  try {
    const mine = await challengeStore().listPlays({ userId });
    play = mine.find((p) => p.sessionId === sessionId) ?? null;
  } catch (error) {
    console.error("challenges: table lookup unreadable — plain table", error);
    return null;
  }
  if (!play) return null;

  // COMPLETION: the last trick has resolved, so freeze the snapshot + rawScore
  // into the play record. This also advances the pointer — `nextBoardNo` is the
  // first board without a completed play.
  if (play.status === "in_progress" && view.state.phase === "complete") {
    play = await freezeChallengePlay(play);
  }

  const challengeId = play.challengeId;
  const boardNo = play.boardNo;
  const [access, board] = await Promise.all([
    challengeViewerAccess(challengeId, userId),
    getChallengeBoard(challengeId, boardNo),
  ]);
  const challenge = access.challenge;
  if (!challenge || !board) return null;

  const strip: Omit<ChallengeStripProps, "onResults"> = {
    title: challenge.title,
    boardNo,
    boardsTotal: access.totalBoards,
    // ONE rule, from one place (A3). False renders no button at all — the strip
    // never advertises standings the viewer may not see.
    showResults: access.resultsUnlocked,
  };

  // Locked: the button is absent, so the overlay can never open — don't read
  // the whole challenge to build standings nobody can ask for.
  if (!access.resultsUnlocked) {
    return {
      challengeId,
      boardNo,
      board,
      strip,
      subtitle: challenge.title,
      standings: { rows: [], scoringLabel: "" },
      boards: [],
    };
  }

  const [invites, plays, baselines, boards] = await Promise.all([
    listChallengeInvites(challengeId),
    listChallengePlays(challengeId),
    listChallengeBaselines(challengeId),
    listChallengeBoards(challengeId),
  ]);

  const names: Record<string, string> = {};
  for (const invite of invites) if (invite.userName) names[invite.userId] = invite.userName;
  if (context.displayName) names[userId] ??= context.displayName;

  const results = buildResultsView({
    challenge,
    boards,
    plays,
    invites,
    baselines,
    viewerId: userId,
    viewerFinished: access.viewerFinished,
    viewerIsModerator: access.viewerIsModerator,
    resultsUnlocked: access.resultsUnlocked,
    names,
  });

  return {
    challengeId,
    boardNo,
    board,
    strip,
    subtitle: results.subtitle,
    standings: {
      rows: results.leaderboard,
      benRow: results.benRow ?? undefined,
      scoringLabel: results.scoringLabel,
      note: results.summaryLine,
      emptyLabel: "Nobody has finished every board yet.",
    },
    // The viewer's own line, from the same squares the results view draws — the
    // board open at the table behind the sheet is outlined in the accent.
    boards: results.squares.map((square) => ({
      boardNo: square.boardNo,
      text: square.score ?? "",
      value: square.value,
      tone: square.tone,
      current: square.boardNo === boardNo,
    })),
  };
}
