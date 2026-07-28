/**
 * In-session mastery queue — shared by FlashcardStudy (Again → re-append) and Drill.
 * Session-only: no localStorage, no SM-2 scheduling.
 */

export type SessionQueueOutcome = 'leave' | 'requeue';

export type SessionRequeueMode = 'end' | 'offset';

export interface ResolveSessionQueueOptions {
  /** Flashcards use 'end' (Again → back of queue). Drill mastery uses 'offset'. */
  requeueMode?: SessionRequeueMode;
  /** Slots later to re-insert when mode is 'offset' (default 3). */
  offset?: number;
}

/**
 * Advance the live session queue after resolving `itemId`.
 *
 * FlashcardStudy contract (byte-compatible when requeueMode is 'end'):
 *   rest = queue.filter(id => id !== itemId)
 *   again  → [...rest, itemId]
 *   leave  → rest
 */
export function resolveSessionQueueItem<T>(
  queue: T[],
  itemId: T,
  outcome: SessionQueueOutcome,
  options?: ResolveSessionQueueOptions,
): T[] {
  const rest = queue.filter((id) => id !== itemId);
  if (outcome === 'leave') return rest;

  const mode = options?.requeueMode ?? 'end';
  if (mode === 'end') return [...rest, itemId];

  const offset = Math.max(1, options?.offset ?? 3);
  const insertAt = Math.min(Math.max(0, offset - 1), rest.length);
  return [...rest.slice(0, insertAt), itemId, ...rest.slice(insertAt)];
}

/** True when the live session has nothing left to practice. */
export function isSessionQueueComplete<T>(queue: T[]): boolean {
  return queue.length === 0;
}

/** Build an initial session queue from item ids (stable order). */
export function buildSessionQueue<T>(ids: T[]): T[] {
  return ids.slice();
}
