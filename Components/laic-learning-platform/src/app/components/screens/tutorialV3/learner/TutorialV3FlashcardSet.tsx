/**
 * Tutorial V3 flashcard set.
 *
 * The deck a learner meets here is the one the flashcard pipeline produces —
 * the same FlashcardStudy component a standalone set renders in. A set does not
 * change shape because it was embedded in a tutorial; only the chrome around it
 * is V3's.
 *
 * The study engine is left exactly as it is — spaced repetition, confidence and
 * bookmarked modes, the new/learning/review/mastered stages, cross-session
 * persistence, keyboard shortcuts, shuffle, all three directions, hint and
 * hook. It is richer than the Figma version and none of it is replaced.
 *
 * What is added is chrome the engine's own state already justified but never
 * drew: where a requeued card comes back, how the whole set is going, and what
 * the session amounted to when it ends.
 */

import React, { useState } from 'react';
import type { FlashcardSetContent } from '../../../../../lib/types';
import { FlashcardStudy, type FlashcardSessionInfo, type StudyCard } from '../../FlashcardStudy';
import { useLearnerProgress } from './LearnerProgressContext';

/** Per-card colour in the strip, worst-known state wins. */
function stripColor(stage: string, lapses: number, isCurrent: boolean): string {
  if (stage === 'mastered' || stage === 'review') return '#059669';
  if (isCurrent) return '#d97706';
  if (lapses > 0) return '#FCA5A5';
  if (stage === 'learning') return '#FBBF24';
  return 'rgba(0,0,0,0.09)';
}

export function TutorialV3FlashcardSet({
  content,
  objectId,
  blockId,
  title,
}: {
  content: FlashcardSetContent;
  objectId: string;
  blockId: string;
  /** Shown above the deck when the embed carried one. */
  title?: string;
}) {
  const cards: StudyCard[] = (content.cards || []).map((c, i) => ({
    id: `fc-${i}`,
    front: c.front,
    back: c.back,
    hook: c.hook,
    hint: c.hint,
    imageUrl: c.imageUrl,
    videoUrl: c.videoUrl,
  }));

  const [session, setSession] = useState<FlashcardSessionInfo | null>(null);
  const { markBlockDone } = useLearnerProgress();

  const total = cards.length;
  const byCard = session?.byCard || {};

  const mastered = Object.values(byCard).filter((s) => s.stage === 'mastered' || s.stage === 'review').length;
  const revisited = Object.values(byCard).filter((s) => s.lapses > 0 && s.stage !== 'mastered' && s.stage !== 'review').length;
  const unfinished = Math.max(0, total - mastered - revisited);

  // Every card carried past learning is what finishes the block.
  React.useEffect(() => {
    if (total > 0 && mastered >= total) markBlockDone(blockId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mastered, total, blockId]);

  /**
   * How far ahead the current card returns. The engine appends a re-queued card
   * to the back of the session queue, so its distance is simply how many cards
   * stand between here and there.
   */
  const returnsIn = (() => {
    if (!session || session.currentIdx == null) return 0;
    const q = session.queue;
    const later = q.indexOf(session.currentIdx, session.position + 1);
    return later > 0 ? later - session.position : 0;
  })();

  const sessionOver = !!session && total > 0 && session.queue.length === 0;

  return (
    <div className="space-y-3">
      {title && (
        <h2 style={{ fontSize: 19, fontWeight: 700, color: '#0B1220' }}>{title}</h2>
      )}

      {/* Per-card progress across the whole set, not just the queue. */}
      {total > 1 && session && (
        <div>
          <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
            <span style={{ fontSize: 10.5, letterSpacing: '0.12em', color: '#9AA3AF', fontWeight: 700 }}>SET PROGRESS</span>
            <span style={{ fontSize: 11.5, color: '#6B7280', fontWeight: 650 }}>{mastered}/{total} learned</span>
          </div>
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: total }).map((_, i) => {
              const s = byCard[i] || { stage: 'new', lapses: 0, reps: 0 };
              return (
                <div
                  key={i}
                  style={{
                    height: 5,
                    flex: 1,
                    borderRadius: 99,
                    background: stripColor(s.stage, s.lapses, session.currentIdx === i),
                    transition: 'background 200ms ease',
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* The queue badge sits above the deck so it reads as a note about the
          card on screen rather than as part of the card's content. */}
      {returnsIn > 0 && (
        <div>
          <span
            className="inline-block px-2 py-0.5 rounded"
            style={{ fontSize: 10.5, fontWeight: 650, color: '#6B7280', background: 'rgba(0,0,0,0.05)' }}
          >
            returns in {returnsIn}
          </span>
        </div>
      )}

      <FlashcardStudy
        cards={cards}
        direction={content.direction || 'Front→back'}
        storageKey={objectId ? `${objectId}:${blockId}` : undefined}
        onSessionChange={setSession}
      />

      {sessionOver && (
        <div
          className="rounded-[18px]"
          style={{ background: 'rgba(5,150,105,0.06)', border: '1.5px solid rgba(5,150,105,0.22)', padding: 18 }}
        >
          <p style={{ fontSize: 17, fontWeight: 700, color: '#065F46', marginBottom: 12 }}>Session complete</p>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { val: mastered, label: 'mastered', color: '#047857' },
              { val: revisited, label: 'revisited', color: '#B45309' },
              { val: unfinished, label: 'unfinished', color: '#9AA3AF' },
            ].map((s) => (
              <div
                key={s.label}
                className="text-center rounded-xl"
                style={{ background: '#fff', border: '1px solid rgba(5,150,105,0.15)', padding: '14px 8px' }}
              >
                <div style={{ fontSize: 26, fontWeight: 750, color: s.color, lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontSize: 10.5, color: '#9AA3AF', marginTop: 5 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {revisited > 0 && (
            <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 12, lineHeight: 1.5 }}>
              The {revisited} you stumbled on are scheduled to come back — switch to Spaced
              or Confidence above to study just those again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
