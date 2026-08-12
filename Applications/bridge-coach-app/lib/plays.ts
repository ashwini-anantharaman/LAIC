// My Games + review threads — the native client for the bridge platform's
// plays/reviews routes (M2 of the webview→native migration). Types mirror
// what the routes serialize; the read model is cached stale-while-revalidate
// so the screen paints from the last answer while a refresh rides behind.

import { bridgeRequest } from "./bridge-api";
import { createBridgeCache } from "./bridge-cache";

// ── Types (fields the app renders) ──────────────────────────────────────────

export type Seat = "N" | "E" | "S" | "W";

export type CardRef = { suit: "S" | "H" | "D" | "C"; rank: number };

export type SubmissionBoard = {
  name: string;
  dealer: Seat;
  vul: string;
  hands: Record<Seat, CardRef[]>;
  auction: { seat: Seat; call: string }[];
  play: { seat: Seat; card: CardRef }[];
  contractLabel?: string;
  resultLabel?: string;
};

export type PlaySubmission = {
  submissionId: string;
  sessionId: string;
  learnerId: string;
  learnerName?: string;
  coachId: string;
  coachName?: string;
  status: "submitted" | "reviewed";
  note?: string;
  board: SubmissionBoard;
  createdAt: string;
};

export type CompletedGame = {
  sessionId: string;
  boardName: string;
  status: string;
  updatedAt: string;
};

export type CoachRef = { coach_id: string; name: string | null };

export type MyGames = {
  completed: CompletedGame[];
  submissions: PlaySubmission[];
  coaches: CoachRef[];
};

export type ReviewComment = {
  commentId: string;
  submissionId: string;
  authorId: string;
  authorName?: string;
  body: string;
  createdAt: string;
};

export type ReviewThread = {
  submission: PlaySubmission;
  comments: ReviewComment[];
  viewer: { isCoach: boolean };
};

// ── The read model, cached ───────────────────────────────────────────────────

const games = createBridgeCache<MyGames>();

function gamesKey(token: string, programId: string): string {
  return `${token}::${programId}::plays`;
}

export function peekMyGames(token: string, programId: string): MyGames | null {
  return games.peek(gamesKey(token, programId));
}

export function refreshMyGames(token: string, programId: string): Promise<MyGames> {
  return games.refresh(gamesKey(token, programId), () =>
    bridgeRequest<MyGames>("/api/bridge/plays", { token, programId }),
  );
}

export function subscribeToMyGames(notify: (value: MyGames) => void): () => void {
  return games.subscribe((_key, value) => notify(value));
}

// ── Actions (each returns what the screen needs to update in place) ─────────

export function sendPlay(
  token: string,
  programId: string,
  sessionId: string,
  coachId?: string,
): Promise<{ submissionId: string; alreadySent: boolean }> {
  return bridgeRequest(`/api/bridge/plays/${encodeURIComponent(sessionId)}/send`, {
    token,
    programId,
    method: "POST",
    body: coachId ? { coachId } : {},
  });
}

export function removeBoard(
  token: string,
  programId: string,
  sessionId: string,
): Promise<{ removed: boolean; reviewsRemoved: number }> {
  return bridgeRequest(`/api/bridge/plays/${encodeURIComponent(sessionId)}`, {
    token,
    programId,
    method: "DELETE",
  });
}

export function replayBoard(
  token: string,
  programId: string,
  sessionId: string,
): Promise<{ sessionId: string }> {
  return bridgeRequest(`/api/bridge/plays/${encodeURIComponent(sessionId)}/replay`, {
    token,
    programId,
    method: "POST",
  });
}

export function fetchReview(
  token: string,
  programId: string,
  submissionId: string,
): Promise<ReviewThread> {
  return bridgeRequest(`/api/bridge/reviews/${encodeURIComponent(submissionId)}`, {
    token,
    programId,
  });
}

export function addReviewComment(
  token: string,
  programId: string,
  submissionId: string,
  body: string,
): Promise<{ commentId: string; status: "submitted" | "reviewed" }> {
  return bridgeRequest(
    `/api/bridge/reviews/${encodeURIComponent(submissionId)}/comments`,
    { token, programId, method: "POST", body: { body } },
  );
}
