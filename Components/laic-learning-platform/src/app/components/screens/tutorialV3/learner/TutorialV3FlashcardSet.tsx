/**
 * Tutorial V3 flashcard set — the reference export's `GenericFlashcardBlock`.
 *
 * A single deck: prompt side, click or Space to reveal, then Again or Got it.
 * A card the learner misses returns three slots later in the same session, the
 * strip along the top shows every card in the set at once, and the session ends
 * on a green panel counting mastered, revisited and unfinished.
 *
 * The direction toggle starts on whatever the author chose in Define, and the
 * learner may change it; the hook and the hint are shown when the author wrote
 * them and simply do not appear when they did not.
 *
 * Keyboard shortcuts are scoped to this deck rather than to the window, because
 * a tutorial page may carry more than one and Space must only ever flip the one
 * the learner is actually working in.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FlashcardSetContent } from '../../../../../lib/types';
import { useLearnerProgress } from './LearnerProgressContext';
import { SAGE } from './warm/theme';

type Direction = 'front-back' | 'back-front' | 'both';

function initialDirection(authored?: string): Direction {
  const d = String(authored || '').toLowerCase();
  if (d.startsWith('back')) return 'back-front';
  if (d.startsWith('both')) return 'both';
  return 'front-back';
}

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function ytId(url?: string): string {
  const raw = (url || '').trim();
  if (!raw) return '';
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  const m = raw.match(/(?:youtu\.be\/|youtube\.com\/(?:embed|shorts|live|v)\/|watch\?.*?v=)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
}

/** Author media on a card face. Absent on most cards, and then costs nothing. */
function CardMedia({ imageUrl, videoUrl }: { imageUrl?: string; videoUrl?: string }) {
  const yt = ytId(videoUrl);
  if (yt) {
    return (
      <div className="rounded-xl overflow-hidden mt-3" style={{ aspectRatio: '16 / 9' }}>
        <iframe
          title="Card video"
          src={`https://www.youtube-nocookie.com/embed/${yt}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ width: '100%', height: '100%', border: 0 }}
        />
      </div>
    );
  }
  if (imageUrl) {
    return <img src={imageUrl} alt="" className="mt-3 rounded-xl" style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain' }} />;
  }
  return null;
}

export function TutorialV3FlashcardSet({
  content,
  objectId,
  blockId,
}: {
  content: FlashcardSetContent;
  objectId: string;
  blockId: string;
}) {
  const cards = useMemo(() => content.cards || [], [content.cards]);
  const total = cards.length;

  const [dir, setDir] = useState<Direction>(() => initialDirection(content.direction));
  const [queue, setQueue] = useState<number[]>(() => cards.map((_, i) => i));
  const [done, setDone] = useState<number[]>([]);
  const [again, setAgain] = useState<number[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const deckRef = useRef<HTMLDivElement | null>(null);
  const { markBlockDone } = useLearnerProgress();

  // A different set in the same slot starts a fresh session. Keyed on the deck's
  // identity and size rather than on the array: the reader rebuilds its block
  // objects on every render, so a reference comparison would reset the session
  // continuously.
  useEffect(() => {
    setQueue(Array.from({ length: total }, (_, i) => i));
    setDone([]);
    setAgain([]);
    setIdx(0);
    setFlipped(false);
    setShowHint(false);
  }, [objectId, blockId, total]);

  const cardIndex = queue[idx];
  const card = cardIndex == null ? undefined : cards[cardIndex];
  const complete = total > 0 && queue.length === 0;

  // Clearing the queue is what finishes this block.
  useEffect(() => {
    if (complete) markBlockDone(blockId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete, blockId]);

  const advance = useCallback((gotIt: boolean) => {
    const id = queue[idx];
    if (id == null) return;
    if (gotIt) setDone((prev) => (prev.includes(id) ? prev : [...prev, id]));
    else setAgain((prev) => (prev.includes(id) ? prev : [...prev, id]));

    const next = [...queue];
    next.splice(idx, 1);
    // A missed card comes back three slots later, in the same session.
    if (!gotIt) next.splice(Math.min(idx + 3, next.length), 0, id);
    setQueue(next);
    setFlipped(false);
    setShowHint(false);
    if (idx >= next.length && next.length > 0) setIdx(next.length - 1);
  }, [queue, idx]);

  // Scoped to the deck: a page with two decks must not flip both at once.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.code === 'Space') { e.preventDefault(); setFlipped((f) => !f); }
    if (e.code === 'ArrowRight' && flipped) { e.preventDefault(); advance(true); }
    if (e.code === 'ArrowLeft' && flipped) { e.preventDefault(); advance(false); }
  };

  const restart = () => {
    setQueue(cards.map((_, i) => i));
    setDone([]);
    setAgain([]);
    setIdx(0);
    setFlipped(false);
    setShowHint(false);
  };

  if (!total) return null;

  const frontText = dir === 'back-front' ? card?.back : card?.front;
  const backText = dir === 'back-front' ? card?.front : card?.back;
  const frontLabel = dir === 'back-front' ? 'Definition' : 'Question';
  const backLabel = dir === 'back-front' ? 'Term' : 'Answer';

  if (complete) {
    const revisited = again.filter((i) => !done.includes(i)).length;
    return (
      <div>
        <h2 className="text-2xl font-bold text-stone-900 mb-5">Flashcards</h2>
        <div className="rounded-2xl bg-green-50 p-7 mb-4">
          <p className="text-xl font-bold text-green-800 mb-4">Session complete! 🎉</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { val: done.length, label: 'mastered', color: 'text-green-700' },
              { val: again.length, label: 'revisited', color: 'text-amber-600' },
              { val: Math.max(0, total - done.length), label: 'unfinished', color: 'text-stone-400' },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-2xl p-4 text-center shadow-sm">
                <div className={`text-3xl font-black mb-1 ${s.color}`}>{s.val}</div>
                <div className="text-xs text-stone-500 font-semibold">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {revisited > 0 && (
            <button
              type="button"
              onClick={() => {
                setQueue(again.filter((i) => !done.includes(i)));
                setAgain([]);
                setIdx(0);
                setFlipped(false);
              }}
              className="px-5 py-2.5 rounded-full border-2 border-amber-300 text-amber-700 bg-amber-50 text-sm font-bold hover:bg-amber-100"
            >
              Study {revisited} missed again
            </button>
          )}
          <button
            type="button"
            onClick={restart}
            className="px-5 py-2.5 rounded-full border-2 border-stone-200 text-stone-500 text-sm font-bold hover:bg-stone-50"
          >
            Restart all
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={deckRef} onKeyDown={onKeyDown} tabIndex={-1} className="outline-none">
      <div className="flex items-center justify-between mb-5 gap-4">
        <h2 className="text-2xl font-bold text-stone-900">Flashcards</h2>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-stone-400 font-semibold">{done.length}/{total} done</span>
          <button
            type="button"
            title="Shuffle remaining"
            aria-label="Shuffle remaining"
            onClick={() => { setQueue(shuffle(queue)); setIdx(0); setFlipped(false); }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm text-stone-500 hover:shadow text-sm"
          >
            ⇄
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-stone-500 font-bold">Direction</span>
        {(['front-back', 'back-front', 'both'] as Direction[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => { setDir(d); setFlipped(false); }}
            className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-colors ${
              dir === d ? 'text-white border-transparent' : 'border-stone-200 text-stone-500 hover:border-stone-400'
            }`}
            style={dir === d ? { background: SAGE } : undefined}
          >
            {d === 'front-back' ? 'Q → A' : d === 'back-front' ? 'A → Q' : 'Both'}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 mb-5" aria-hidden>
        {cards.map((_c, i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-full transition-colors ${
              done.includes(i) ? 'bg-green-400' : again.includes(i) ? 'bg-red-300' : 'bg-stone-200'
            }`}
            style={cardIndex === i && !done.includes(i) && !again.includes(i) ? { background: SAGE } : undefined}
          />
        ))}
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => setFlipped(!flipped)}
        onKeyDown={(e) => { if (e.key === 'Enter') setFlipped((f) => !f); }}
        className="rounded-2xl cursor-pointer select-none transition-all hover:shadow-md flex flex-col justify-between min-h-52 p-7 mb-4 shadow-sm"
        style={{ background: flipped ? '#f0fdf4' : '#ffffff', border: `2px solid ${flipped ? '#86efac' : '#e8e5df'}` }}
      >
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-stone-400 font-bold">{flipped ? backLabel : frontLabel}</p>
            <span className="text-xs text-stone-300 font-semibold">{idx + 1}/{queue.length}</span>
          </div>
          <p className="text-stone-900 text-[15px] leading-relaxed font-medium">{flipped ? backText : frontText}</p>
          <CardMedia imageUrl={card?.imageUrl} videoUrl={card?.videoUrl} />

          {!flipped && showHint && card?.hint && (
            <p className="mt-3 text-amber-700 text-sm bg-amber-50 rounded-xl px-3 py-2 font-medium">💡 {card.hint}</p>
          )}

          {flipped && card?.hook && (
            <div className="mt-4 pt-3 border-t border-green-200">
              <p className="text-green-800 text-sm leading-relaxed font-medium">{card.hook}</p>
            </div>
          )}
        </div>
        <p className="text-stone-400 text-xs mt-4 text-center font-semibold">
          {flipped ? 'Click to flip back' : 'Click to reveal · Space'}
        </p>
      </div>

      {flipped ? (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => advance(false)}
            className="flex-1 py-3 rounded-full border-2 border-red-200 text-red-600 text-sm font-bold hover:bg-red-50"
          >
            ← Again
          </button>
          <button
            type="button"
            onClick={() => advance(true)}
            className="flex-1 py-3 rounded-full border-2 border-green-300 bg-green-50 text-green-700 text-sm font-bold hover:bg-green-100"
          >
            Got it → ✓
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          {card?.hint && !showHint ? (
            <button
              type="button"
              onClick={() => setShowHint(true)}
              className="text-sm text-amber-600 hover:text-amber-800 font-bold"
            >
              💡 hint
            </button>
          ) : <div />}
          <p className="text-xs text-stone-300 font-semibold">← Again · Space · → Got it</p>
        </div>
      )}
    </div>
  );
}
