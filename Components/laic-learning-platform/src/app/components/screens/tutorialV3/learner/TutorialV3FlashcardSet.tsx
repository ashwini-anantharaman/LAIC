/**
 * Tutorial V3 flashcard set — the reference export's `FlashcardBlock` from
 * `blocks.tsx`.
 *
 * A mono FLASHCARD SET chip, a done counter and shuffle, the direction row, a
 * thin per-card strip, then the deck: click or Space to reveal, then Again or
 * Got it. A missed card returns three slots later and says so on its face when
 * it comes back. The session ends on a green panel counting mastered,
 * revisited and unfinished.
 *
 * The direction starts wherever Define set it and the learner may change it;
 * hook and hint appear when the author wrote them and simply do not when they
 * did not.
 *
 * Keyboard shortcuts are scoped to this deck rather than to the window, because
 * a page may carry more than one and Space must only flip the one in hand.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { FlashcardSetContent } from '../../../../../lib/types';
import { useLearnerProgress } from './LearnerProgressContext';
import { NAVY } from './warm/theme';

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
      <div className="rounded overflow-hidden mt-3" style={{ aspectRatio: '16 / 9' }}>
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
    return <img src={imageUrl} alt="" className="mt-3 rounded" style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain' }} />;
  }
  return null;
}

function faceLabel(dir: Direction, flipped: boolean): string {
  if (dir === 'back-front') return flipped ? 'TERM' : 'DEFINITION';
  return flipped ? 'ANSWER' : 'QUESTION';
}

export function TutorialV3FlashcardSet({
  content,
  objectId,
  blockId,
  title = 'Key Terms',
}: {
  content: FlashcardSetContent;
  objectId: string;
  blockId: string;
  title?: string;
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

  const { markBlockDone } = useLearnerProgress();

  // A different set in the same slot starts a fresh session. Keyed on identity
  // and size rather than on the array: the reader rebuilds its block objects on
  // every render, so a reference comparison would reset the session forever.
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
    setQueue(Array.from({ length: total }, (_, i) => i));
    setDone([]);
    setAgain([]);
    setIdx(0);
    setFlipped(false);
    setShowHint(false);
  };

  if (!total) return null;

  const header = (
    <div className="flex items-center justify-between mb-4 gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-mono text-[10px] tracking-widest text-stone-500 bg-stone-100 px-2 py-0.5 rounded shrink-0">
          FLASHCARD SET
        </span>
        <h2 className="text-xl text-stone-900 truncate">{title}</h2>
      </div>
      {!complete && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-xs text-stone-400">{done.length}/{total} done</span>
          <button
            type="button"
            title="Shuffle remaining"
            aria-label="Shuffle remaining"
            onClick={() => { setQueue(shuffle(queue)); setIdx(0); setFlipped(false); }}
            className="w-7 h-7 flex items-center justify-center rounded border border-stone-200 text-stone-400 hover:border-stone-400 hover:text-stone-700 text-sm"
          >
            ⇄
          </button>
        </div>
      )}
    </div>
  );

  if (complete) {
    const revisited = again.filter((i) => !done.includes(i)).length;
    return (
      <div>
        {header}
        <div className="rounded-xl border border-green-200 bg-green-50 p-7 mb-4">
          <p className="text-2xl text-green-800 mb-4">Session complete!</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { val: done.length, label: 'mastered', color: 'text-green-700' },
              { val: again.length, label: 'revisited', color: 'text-amber-600' },
              { val: Math.max(0, total - done.length), label: 'unfinished', color: 'text-stone-400' },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-lg border border-green-100 p-4 text-center">
                <div className={`text-3xl mb-1 ${s.color}`}>{s.val}</div>
                <div className="font-mono text-[10px] text-stone-400">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        {revisited > 0 && (
          <button
            type="button"
            onClick={() => {
              setQueue(again.filter((i) => !done.includes(i)));
              setAgain([]);
              setIdx(0);
              setFlipped(false);
            }}
            className="text-sm font-medium px-4 py-2 rounded border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 mr-3"
          >
            Study {revisited} missed card{revisited === 1 ? '' : 's'} again
          </button>
        )}
        <button
          type="button"
          onClick={restart}
          className="text-sm text-stone-500 border border-stone-200 rounded px-4 py-2 hover:bg-stone-50"
        >
          Restart all
        </button>
      </div>
    );
  }

  /** How far ahead a re-queued card comes back, counted from here. */
  const returnsIn = (() => {
    if (cardIndex == null) return 0;
    const later = queue.indexOf(cardIndex, idx + 1);
    return later > 0 ? later - idx : 0;
  })();

  const frontText = dir === 'back-front' ? card?.back : card?.front;
  const backText = dir === 'back-front' ? card?.front : card?.back;

  return (
    <div onKeyDown={onKeyDown} tabIndex={-1} className="outline-none">
      {header}

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="font-mono text-[10px] text-stone-400 tracking-wider">DIRECTION</span>
        {(['front-back', 'back-front', 'both'] as Direction[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => { setDir(d); setFlipped(false); }}
            className={`text-xs font-mono px-2.5 py-1 rounded border transition-colors ${
              dir === d ? 'text-white border-transparent' : 'border-stone-200 text-stone-500 hover:border-stone-400'
            }`}
            style={dir === d ? { background: NAVY } : undefined}
          >
            {d === 'front-back' ? 'Term → Def' : d === 'back-front' ? 'Def → Term' : 'Both ways'}
          </button>
        ))}
      </div>

      <div className="flex gap-1 mb-5" aria-hidden>
        {cards.map((_c, i) => {
          const isDone = done.includes(i);
          const isAgain = again.includes(i) && !isDone;
          const isCurrent = cardIndex === i;
          return (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                isDone ? 'bg-green-500' : isAgain ? 'bg-red-300' : isCurrent ? 'bg-amber-500' : 'bg-stone-200'
              }`}
            />
          );
        })}
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => setFlipped(!flipped)}
        onKeyDown={(e) => { if (e.key === 'Enter') setFlipped((f) => !f); }}
        className="rounded-xl border-2 cursor-pointer select-none transition-all hover:shadow-md flex flex-col justify-between min-h-48 p-7 mb-4"
        style={{ background: flipped ? '#f0fdf4' : '#fff', borderColor: flipped ? '#86efac' : '#e2e0dc' }}
      >
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono text-[10px] text-stone-400 tracking-wider">{faceLabel(dir, flipped)}</p>
            <div className="flex items-center gap-2">
              {returnsIn > 0 && (
                <span className="font-mono text-[9px] text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">
                  returns in {returnsIn}
                </span>
              )}
              <span className="font-mono text-[10px] text-stone-300">{idx + 1}/{queue.length}</span>
            </div>
          </div>
          <p className="text-stone-900 text-[15px] leading-relaxed">{flipped ? backText : frontText}</p>
          <CardMedia imageUrl={card?.imageUrl} videoUrl={card?.videoUrl} />

          {!flipped && showHint && card?.hint && (
            <p className="mt-3 text-amber-700 text-sm bg-amber-50 rounded px-3 py-2 border border-amber-100">💡 {card.hint}</p>
          )}

          {flipped && card?.hook && (
            <div className="mt-4 pt-3 border-t border-green-200">
              <p className="font-mono text-[10px] text-green-600 tracking-wider mb-1">HOOK</p>
              <p className="text-green-800 text-sm leading-relaxed">{card.hook}</p>
            </div>
          )}
        </div>
        <p className="text-stone-400 text-xs mt-4 text-center">
          {flipped ? 'Click to flip back' : 'Click to reveal · Space'}
        </p>
      </div>

      {flipped ? (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => advance(false)}
            className="flex-1 py-2.5 rounded-lg border-2 border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
          >
            Again ←
          </button>
          <button
            type="button"
            onClick={() => advance(true)}
            className="flex-1 py-2.5 rounded-lg border-2 border-green-300 bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors"
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
              className="text-sm text-amber-600 hover:text-amber-800 font-mono"
            >
              💡 hint
            </button>
          ) : <div />}
          <p className="font-mono text-[10px] text-stone-300">← Again · Space to flip · → Got it</p>
        </div>
      )}
    </div>
  );
}
