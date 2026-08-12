// Coach surfaces — the native client for the review queue and per-learner
// progress routes (M3b of the webview→native migration). Read models cached
// stale-while-revalidate like lib/plays.ts; the review THREAD itself
// (fetchReview/addReviewComment) lives in lib/plays.ts and is shared by both
// sides of the conversation.

import { bridgeRequest } from "./bridge-api";
import { createBridgeCache } from "./bridge-cache";
import type { PlaySubmission } from "./plays";

export type LearnerAssignment = {
  assignmentId: string;
  briefId?: string;
  entryName: string;
  status: "assigned" | "started" | "completed";
  createdAt: string;
  completedAt?: string;
  sessionId?: string;
};

export type LearnerProgress = {
  learner: { user_id: string; name: string | null; email: string | null };
  assignments: LearnerAssignment[];
  submissions: PlaySubmission[];
};

// ── The review queue ─────────────────────────────────────────────────────────

const queue = createBridgeCache<PlaySubmission[]>();

function queueKey(token: string, programId: string): string {
  return `${token}::${programId}::reviews`;
}

export function peekReviewQueue(token: string, programId: string): PlaySubmission[] | null {
  return queue.peek(queueKey(token, programId));
}

export function refreshReviewQueue(
  token: string,
  programId: string,
): Promise<PlaySubmission[]> {
  return queue.refresh(queueKey(token, programId), async () => {
    const body = await bridgeRequest<{ submissions: PlaySubmission[] }>(
      "/api/bridge/reviews",
      { token, programId },
    );
    return body.submissions;
  });
}

export function subscribeToReviewQueue(
  notify: (value: PlaySubmission[]) => void,
): () => void {
  return queue.subscribe((_key, value) => notify(value));
}

// ── One learner's progress ───────────────────────────────────────────────────

const progress = createBridgeCache<LearnerProgress>();

function progressKey(token: string, programId: string, learnerId: string): string {
  return `${token}::${programId}::learner::${learnerId}`;
}

export function peekLearnerProgress(
  token: string,
  programId: string,
  learnerId: string,
): LearnerProgress | null {
  return progress.peek(progressKey(token, programId, learnerId));
}

export function refreshLearnerProgress(
  token: string,
  programId: string,
  learnerId: string,
): Promise<LearnerProgress> {
  return progress.refresh(progressKey(token, programId, learnerId), () =>
    bridgeRequest<LearnerProgress>(
      `/api/bridge/learners/${encodeURIComponent(learnerId)}/progress`,
      { token, programId },
    ),
  );
}
