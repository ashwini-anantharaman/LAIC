// Creating a challenge — native client for POST /api/bridge/challenges and
// its invite directory (M3f of the webview→native migration). The draft
// shape mirrors the platform's ChallengeDraft (app/bridge/challenges/draft.ts)
// — the server re-validates with the same shared rules, so errors come back
// as its exact sentences.

import { bridgeRequest } from "./bridge-api";
import type { Seat } from "./plays";

export type ChallengeFormat = "full" | "bidding-only";
export type ChallengeScoring = "imps" | "mp" | "total";
export type StandingsVisibility = "after-finish" | "always";

export type ChallengeBoardDraft = {
  boardNo: number;
  /** The deal seed — the server re-deals the identical pack from it. */
  seed: number;
  dealer: Seat;
  humanSeat: Seat;
};

export type ChallengeDraft = {
  title: string;
  description: string;
  format?: ChallengeFormat;
  scoring: ChallengeScoring;
  standingsVisibility: StandingsVisibility;
  boards: ChallengeBoardDraft[];
  controlOverrides: Record<string, "show" | "hide">;
  invites: { userId: string; moderator: boolean }[];
  editorBadge: boolean;
  /**
   * A PRIVATE TABLE — owned by the person who made it rather than a club, so it is
   * visible to exactly the people invited and appears on no club's list. Opt-in and
   * explicit: the server refuses an unowned challenge otherwise, precisely so that a
   * club's challenge cannot leak everywhere by accident.
   */
  personal?: boolean;
};

export type ChallengePerson = { userId: string; name: string; handle?: string };

export const MIN_BOARDS = 1;
export const MAX_BOARDS = 16;

/** Scored play defaults — hands stay hidden, no take-backs (the wizard's
 *  checklist defaults; the native wizard doesn't carry the checklist yet). */
export const DEFAULT_CONTROL_OVERRIDES: Record<string, "show" | "hide"> = {
  "table.hands_view": "hide",
  "table.undo": "hide",
};

export function fetchChallengePeople(
  token: string,
  programId: string,
): Promise<{ people: ChallengePerson[] }> {
  return bridgeRequest("/api/bridge/challenges/people", { token, programId });
}

export function createChallenge(
  token: string,
  programId: string,
  draft: ChallengeDraft,
): Promise<{ challengeId: string; title: string; invited: number }> {
  return bridgeRequest("/api/bridge/challenges", {
    token,
    programId,
    method: "POST",
    body: draft,
  });
}
