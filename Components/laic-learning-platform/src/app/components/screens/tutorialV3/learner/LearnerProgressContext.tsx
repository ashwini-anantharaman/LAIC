/**
 * The channel every Tutorial V3 learner block reports through.
 *
 * A block calls `markBlockDone` when the learner has finished it — answered
 * every question, cleared every card, revealed every panel. That is what turns
 * the sidebar's dots and drives the progress meter; nothing infers completion
 * from scroll position or from the author's own "done" flag.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  EMPTY_PROGRESS,
  loadProgress,
  saveProgress,
  type LearnerProgressState,
} from './progress';

interface LearnerProgressApi {
  progress: LearnerProgressState;
  /** Mark a block finished. Idempotent — blocks may report repeatedly. */
  markBlockDone: (blockId: string) => void;
  /** Undo a completion (a quiz that was reset, a restarted card deck). */
  markBlockUndone: (blockId: string) => void;
  /** Record that the learner opened a section. */
  visitSection: (sectionId: string) => void;
  isBookmarked: (key: string) => boolean;
  toggleBookmark: (key: string) => void;
}

const Ctx = createContext<LearnerProgressApi | null>(null);

export function LearnerProgressProvider({
  objectId,
  children,
}: {
  objectId: string;
  children: React.ReactNode;
}) {
  const [progress, setProgress] = useState<LearnerProgressState>(EMPTY_PROGRESS);

  // Reload when the reader moves to a different object — a preview and a saved
  // tutorial keep separate progress under separate ids.
  useEffect(() => {
    setProgress(loadProgress(objectId));
  }, [objectId]);

  const update = useCallback((fn: (p: LearnerProgressState) => LearnerProgressState) => {
    setProgress((prev) => {
      const next = fn(prev);
      if (next === prev) return prev;
      saveProgress(objectId, next);
      return next;
    });
  }, [objectId]);

  const markBlockDone = useCallback((blockId: string) => {
    if (!blockId) return;
    update((p) => (p.doneBlocks.includes(blockId)
      ? p
      : { ...p, doneBlocks: [...p.doneBlocks, blockId] }));
  }, [update]);

  const markBlockUndone = useCallback((blockId: string) => {
    if (!blockId) return;
    update((p) => (p.doneBlocks.includes(blockId)
      ? { ...p, doneBlocks: p.doneBlocks.filter((id) => id !== blockId) }
      : p));
  }, [update]);

  const visitSection = useCallback((sectionId: string) => {
    if (!sectionId) return;
    update((p) => (p.visitedSections.includes(sectionId)
      ? p
      : { ...p, visitedSections: [...p.visitedSections, sectionId] }));
  }, [update]);

  const toggleBookmark = useCallback((key: string) => {
    if (!key) return;
    update((p) => ({
      ...p,
      bookmarks: p.bookmarks.includes(key)
        ? p.bookmarks.filter((b) => b !== key)
        : [...p.bookmarks, key],
    }));
  }, [update]);

  const api = useMemo<LearnerProgressApi>(() => ({
    progress,
    markBlockDone,
    markBlockUndone,
    visitSection,
    isBookmarked: (key: string) => progress.bookmarks.includes(key),
    toggleBookmark,
  }), [progress, markBlockDone, markBlockUndone, visitSection, toggleBookmark]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/**
 * Blocks render outside the provider in the authoring editor too, so this
 * returns a working no-op rather than throwing — a concept card in the Edit
 * pane should not crash because nothing is tracking learner progress there.
 */
export function useLearnerProgress(): LearnerProgressApi {
  const ctx = useContext(Ctx);
  const [local, setLocal] = useState<LearnerProgressState>(EMPTY_PROGRESS);
  const fallback = useMemo<LearnerProgressApi>(() => ({
    progress: local,
    markBlockDone: (id) => setLocal((p) => (p.doneBlocks.includes(id) ? p : { ...p, doneBlocks: [...p.doneBlocks, id] })),
    markBlockUndone: (id) => setLocal((p) => ({ ...p, doneBlocks: p.doneBlocks.filter((b) => b !== id) })),
    visitSection: (id) => setLocal((p) => (p.visitedSections.includes(id) ? p : { ...p, visitedSections: [...p.visitedSections, id] })),
    isBookmarked: (key) => local.bookmarks.includes(key),
    toggleBookmark: (key) => setLocal((p) => ({
      ...p,
      bookmarks: p.bookmarks.includes(key) ? p.bookmarks.filter((b) => b !== key) : [...p.bookmarks, key],
    })),
  }), [local]);
  return ctx || fallback;
}
