// Server-side challenge store + read model. Same store seam as the access
// catalogue and table appearance: Postgres when STORE_BACKEND=postgres, else a
// JSON dev file. cache() memoizes each read across a request.
//
// READS FAIL OPEN, WRITES DO NOT. A challenge read that throws (0027 not
// applied on this backend, a db hiccup) degrades to "nothing there" rather
// than 500-ing a page — the same posture as getCatalogue/getAppearance. Writes
// go through challengeStore() directly so a failed write always surfaces.

import {
  resultsUnlocked,
  type Challenge,
  type ChallengeBaseline,
  type ChallengeBoard,
  type ChallengeInvite,
  type ChallengePlay,
  type ChallengeStore,
} from "@bridge/challenges";
import { JsonFileChallengeStore } from "@bridge/challenges/fileStore";
import { PgChallengeStore } from "@bridge/pg-stores";
import { join } from "node:path";
import { cache } from "react";
import { dataDir, pgClient, storeBackend } from "./backend";

const globalCache = globalThis as unknown as { __bridgeChallengeStore?: ChallengeStore };

export function challengeStore(): ChallengeStore {
  if (!globalCache.__bridgeChallengeStore) {
    globalCache.__bridgeChallengeStore =
      storeBackend() === "postgres"
        ? new PgChallengeStore(pgClient())
        : new JsonFileChallengeStore(join(process.cwd(), dataDir(), "challenges-store.json"));
  }
  return globalCache.__bridgeChallengeStore;
}

/** Run a read, logging and degrading to `fallback` rather than taking a page down. */
async function safely<T>(what: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    console.error(`challenges: ${what} unreadable — degrading`, error);
    return fallback;
  }
}

export const getChallenge = cache(async (challengeId: string): Promise<Challenge | null> =>
  safely("challenge", () => challengeStore().getChallenge(challengeId), null),
);

export const listChallengeBoards = cache(
  async (challengeId: string): Promise<ChallengeBoard[]> =>
    safely("boards", () => challengeStore().listBoards(challengeId), []),
);

export const getChallengeBoard = cache(
  async (challengeId: string, boardNo: number): Promise<ChallengeBoard | null> =>
    safely("board", () => challengeStore().getBoard(challengeId, boardNo), null),
);

/** Every invite on a challenge — the participants list and the "waiting on" view. */
export const listChallengeInvites = cache(
  async (challengeId: string): Promise<ChallengeInvite[]> =>
    safely("invites", () => challengeStore().listInvites({ challengeId }), []),
);

/** The viewer's invites across all challenges — the challenges list page. */
export const listInvitesForUser = cache(
  async (userId: string): Promise<ChallengeInvite[]> =>
    safely("user invites", () => challengeStore().listInvites({ userId }), []),
);

/** The challenges a user was invited to (any invite status), newest first. */
export const listChallengesForUser = cache(async (userId: string): Promise<Challenge[]> => {
  const invites = await listInvitesForUser(userId);
  if (!invites.length) return [];
  const challengeIds = invites.map((i) => i.challengeId);
  return safely("user challenges", () => challengeStore().listChallenges({ challengeIds }), []);
});

export const listChallengePlays = cache(
  async (challengeId: string): Promise<ChallengePlay[]> =>
    safely("plays", () => challengeStore().listPlays({ challengeId }), []),
);

export const listPlaysForUser = cache(
  async (challengeId: string, userId: string): Promise<ChallengePlay[]> =>
    safely("user plays", () => challengeStore().listPlays({ challengeId, userId }), []),
);

export const listChallengeBaselines = cache(
  async (challengeId: string): Promise<ChallengeBaseline[]> =>
    safely("baselines", () => challengeStore().listBaselines(challengeId), []),
);

/**
 * One viewer's standing in one challenge — progress, moderator flag, and the
 * results gate. The gate is `resultsUnlocked` from @bridge/challenges, called
 * HERE and nowhere else in the app (ADDENDUM A3: one rule, one place), so the
 * list card, the results view and the in-table Results button cannot drift.
 */
export interface ChallengeViewerAccess {
  challenge: Challenge | null;
  totalBoards: number;
  /** Boards the viewer has completed. */
  finishedBoards: number;
  /**
   * The board tapping the challenge opens (ADDENDUM A1) — the first without a
   * COMPLETED play, so an in-progress board resumes rather than restarts.
   * Null once the viewer has finished, which is when results open instead.
   */
  nextBoardNo: number | null;
  viewerFinished: boolean;
  viewerIsModerator: boolean;
  /** Whether the invite has been accepted — nothing opens until it has (A1). */
  viewerAccepted: boolean;
  resultsUnlocked: boolean;
}

export const challengeViewerAccess = cache(
  async (challengeId: string, userId: string): Promise<ChallengeViewerAccess> => {
    const [challenge, boards, plays, invite] = await Promise.all([
      getChallenge(challengeId),
      listChallengeBoards(challengeId),
      listPlaysForUser(challengeId, userId),
      safely("invite", () => challengeStore().getInvite(challengeId, userId), null),
    ]);

    const completed = new Set(
      plays.filter((p) => p.status === "completed").map((p) => p.boardNo),
    );
    const totalBoards = boards.length;
    const viewerFinished = totalBoards > 0 && completed.size >= totalBoards;
    // The creator is always a moderator, even before their auto-invite lands.
    const viewerIsModerator = invite?.moderator ?? (challenge?.createdBy === userId);

    return {
      challenge,
      totalBoards,
      finishedBoards: completed.size,
      nextBoardNo: boards.find((b) => !completed.has(b.boardNo))?.boardNo ?? null,
      viewerFinished,
      viewerIsModerator,
      viewerAccepted: invite?.status === "accepted",
      resultsUnlocked: challenge
        ? resultsUnlocked({
            viewerFinished,
            viewerIsModerator,
            standingsVisibility: challenge.standingsVisibility,
          })
        : false,
    };
  },
);
