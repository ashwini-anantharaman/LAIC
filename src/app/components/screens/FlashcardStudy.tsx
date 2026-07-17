import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Shuffle, MoreHorizontal, ThumbsUp, ThumbsDown,
  Bookmark, RotateCcw, HelpCircle, Check, Flame, RefreshCw, Layers, X,
} from 'lucide-react';
import { useApp } from '../../App';

export interface StudyCard {
  id?: string;
  front: string;
  back: string;
  hook?: string;
}

type Mode = 'standard' | 'spaced' | 'confidence' | 'bookmarked';
type Grade = 'again' | 'hard' | 'good' | 'easy';
type Stage = 'new' | 'learning' | 'review' | 'mastered';

interface CardSchedule {
  dueAt: number;
  intervalMs: number;
  ease: number;
  reps: number;
  lapses: number;
  lastGrade?: Grade;
  stage: Stage;
}

const MODES: { id: Mode; label: string; icon: React.ReactNode }[] = [
  { id: 'standard', label: 'Standard', icon: <Layers size={15} /> },
  { id: 'spaced', label: 'Spaced Repetition', icon: <RefreshCw size={15} /> },
  { id: 'confidence', label: 'Confidence', icon: <Flame size={15} /> },
  { id: 'bookmarked', label: 'Bookmarked Flashcards', icon: <Bookmark size={15} /> },
];

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Base intervals — Again/Hard come back soon; Good/Easy get spaced out. */
const BASE_INTERVAL: Record<Grade, number> = {
  again: 0,           // due immediately (reappears next)
  hard: 6 * MIN,      // 6 minutes
  good: 10 * MIN,     // 10 minutes (grows with ease)
  easy: 3 * DAY,      // 3 days
};

function freshSchedule(now = Date.now()): CardSchedule {
  return { dueAt: now, intervalMs: 0, ease: 2.5, reps: 0, lapses: 0, stage: 'new' };
}

function applyGrade(prev: CardSchedule, grade: Grade, now = Date.now()): CardSchedule {
  let { ease, reps, lapses, intervalMs } = prev;

  if (grade === 'again') {
    lapses += 1;
    reps = 0;
    ease = Math.max(1.3, ease - 0.2);
    return { dueAt: now, intervalMs: BASE_INTERVAL.again, ease, reps, lapses, lastGrade: grade, stage: 'learning' };
  }

  if (grade === 'hard') {
    ease = Math.max(1.3, ease - 0.15);
    intervalMs = BASE_INTERVAL.hard;
    reps += 1;
    return { dueAt: now + intervalMs, intervalMs, ease, reps, lapses, lastGrade: grade, stage: 'learning' };
  }

  if (grade === 'good') {
    ease = Math.min(3.0, ease + 0.05);
    intervalMs = reps === 0 ? BASE_INTERVAL.good : Math.round(Math.max(BASE_INTERVAL.good, intervalMs) * ease);
    reps += 1;
    const stage: Stage = intervalMs >= DAY ? 'mastered' : 'review';
    return { dueAt: now + intervalMs, intervalMs, ease, reps, lapses, lastGrade: grade, stage };
  }

  // easy
  ease = Math.min(3.2, ease + 0.15);
  intervalMs = reps === 0 ? BASE_INTERVAL.easy : Math.round(Math.max(BASE_INTERVAL.easy, intervalMs * ease * 1.3));
  reps += 1;
  return { dueAt: now + intervalMs, intervalMs, ease, reps, lapses, lastGrade: grade, stage: 'mastered' };
}

function fmtInterval(ms: number): string {
  if (ms <= 0) return 'now';
  if (ms < MIN) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (ms < HOUR) return `${Math.round(ms / MIN)}m`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h`;
  const d = Math.round(ms / DAY);
  return d === 1 ? '1d' : `${d}d`;
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'now';
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/**
 * Full flashcard study experience: Standard / Spaced Repetition / Confidence /
 * Bookmarked modes. Confidence + Spaced share an adaptive scheduler — Again/Hard
 * bring a card back soon; Good/Easy space it out. Progress hub tracks retention.
 */
export function FlashcardStudy({ cards, direction = 'Front→back' }: { cards: StudyCard[]; direction?: string }) {
  const [mode, setMode] = useState<Mode>('standard');
  const [modeOpen, setModeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shuffleOpen, setShuffleOpen] = useState(false);

  const [order, setOrder] = useState<number[]>(() => cards.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [startBack, setStartBack] = useState<Record<number, boolean>>({});
  const [now, setNow] = useState(() => Date.now());

  const [schedules, setSchedules] = useState<Record<number, CardSchedule>>(() => {
    const init: Record<number, CardSchedule> = {};
    cards.forEach((_, i) => { init[i] = freshSchedule(); });
    return init;
  });

  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [reactions, setReactions] = useState<Record<number, 'up' | 'down'>>({});

  // Tick so due cards reappear and countdowns update.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setOrder(cards.map((_, i) => i));
    setPos(0);
    setFlipped(false);
    const init: Record<number, CardSchedule> = {};
    cards.forEach((_, i) => { init[i] = freshSchedule(); });
    setSchedules(init);
  }, [cards.length]);

  useEffect(() => {
    if (direction === 'Both') {
      const map: Record<number, boolean> = {};
      for (let i = 0; i < cards.length; i++) map[i] = Math.random() < 0.5;
      setStartBack(map);
    } else {
      setStartBack({});
    }
  }, [direction, cards.length]);

  const isAdaptive = mode === 'spaced' || mode === 'confidence';

  // Standard / bookmarked: linear deck. Adaptive: only cards that are due now.
  const deck = useMemo(() => {
    if (mode === 'bookmarked') return order.filter((i) => bookmarks.has(i));
    if (!isAdaptive) return order;
    return order
      .filter((i) => (schedules[i]?.dueAt ?? 0) <= now)
      .sort((a, b) => (schedules[a]?.dueAt ?? 0) - (schedules[b]?.dueAt ?? 0));
  }, [mode, order, bookmarks, isAdaptive, schedules, now]);

  const waiting = isAdaptive && deck.length === 0 && cards.length > 0;
  const nextUpcoming = useMemo(() => {
    if (!waiting) return null;
    let best: { idx: number; dueAt: number } | null = null;
    for (const i of order) {
      const due = schedules[i]?.dueAt ?? 0;
      if (due > now && (!best || due < best.dueAt)) best = { idx: i, dueAt: due };
    }
    return best;
  }, [waiting, order, schedules, now]);

  const total = deck.length;
  const safePos = Math.min(pos, Math.max(0, total - 1));
  const cardIdx = waiting ? undefined : deck[safePos];
  const card = cardIdx != null ? cards[cardIdx] : undefined;

  useEffect(() => { setPos(0); setFlipped(false); }, [mode]);

  // Keep pos valid when the due-queue shrinks after a rating.
  useEffect(() => {
    if (pos >= deck.length && deck.length > 0) setPos(0);
  }, [deck.length, pos]);

  const goPrev = () => { if (safePos > 0) { setPos(safePos - 1); setFlipped(false); } };
  const goNext = () => { if (safePos < total - 1) { setPos(safePos + 1); setFlipped(false); } };
  const flip = () => setFlipped((f) => !f);

  const rate = (grade: Grade) => {
    if (cardIdx == null) return;
    const t = Date.now();
    setSchedules((prev) => ({
      ...prev,
      [cardIdx]: applyGrade(prev[cardIdx] || freshSchedule(t), grade, t),
    }));
    setFlipped(false);
    setNow(t);
    // After Again the card stays due — advance past it so the next due card
    // (often this same card if it's the only due one) is selected fresh.
    setPos(0);
  };

  // Confidence UI (1–3) maps onto the same adaptive grades.
  const rateConfidence = (v: 1 | 2 | 3) => {
    rate(v === 1 ? 'again' : v === 2 ? 'good' : 'easy');
  };

  const toggleBookmark = () => {
    if (cardIdx == null) return;
    setBookmarks((prev) => {
      const next = new Set(prev);
      next.has(cardIdx) ? next.delete(cardIdx) : next.add(cardIdx);
      return next;
    });
  };
  const react = (r: 'up' | 'down') => {
    if (cardIdx == null) return;
    setReactions((p) => ({ ...p, [cardIdx]: p[cardIdx] === r ? undefined as any : r }));
  };

  const doShuffle = () => {
    const shuffled = [...order];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setOrder(shuffled);
    setPos(0);
    setFlipped(false);
    setShuffleOpen(false);
  };
  const restart = () => { setPos(0); setFlipped(false); setMenuOpen(false); };
  const resetProgress = () => {
    const init: Record<number, CardSchedule> = {};
    cards.forEach((_, i) => { init[i] = freshSchedule(); });
    setSchedules(init);
    setReactions({});
    setBookmarks(new Set());
    setPos(0);
    setFlipped(false);
    setMenuOpen(false);
    if (mode === 'bookmarked') setMode('standard');
  };

  const studyAhead = () => {
    if (!nextUpcoming) return;
    // Pull the next scheduled card forward so the learner can keep going.
    setSchedules((prev) => ({
      ...prev,
      [nextUpcoming.idx]: { ...(prev[nextUpcoming.idx] || freshSchedule()), dueAt: Date.now() },
    }));
    setNow(Date.now());
    setFlipped(false);
    setPos(0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); if (card) flip(); return; }
      if (!isAdaptive) {
        if (e.key === 'ArrowLeft') { goPrev(); return; }
        if (e.key === 'ArrowRight') { goNext(); return; }
      }
      if (mode === 'confidence' && flipped && ['1', '2', '3'].includes(e.key)) rateConfidence(Number(e.key) as 1 | 2 | 3);
      if (mode === 'spaced' && flipped && ['1', '2', '3', '4'].includes(e.key)) {
        rate((['again', 'hard', 'good', 'easy'] as Grade[])[Number(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const activeMode = MODES.find((m) => m.id === mode)!;
  const promptIsBack =
    direction === 'Back→front' ||
    (direction === 'Both' && cardIdx != null && !!startBack[cardIdx]);
  const showingBack = promptIsBack ? !flipped : flipped;
  const sideLabel = showingBack ? 'Definition' : 'Term';
  const faceText = card ? (showingBack ? card.back : card.front) : '';

  // Retention hub stats
  const hub = useMemo(() => {
    let learning = 0, review = 0, mastered = 0, newCount = 0;
    for (let i = 0; i < cards.length; i++) {
      const s = schedules[i]?.stage || 'new';
      if (s === 'new') newCount++;
      else if (s === 'learning') learning++;
      else if (s === 'review') review++;
      else mastered++;
    }
    const scored = learning + review + mastered;
    // Retention weight: learning 0.25, review 0.65, mastered 1.0
    const retention = cards.length === 0 ? 0
      : Math.round(((learning * 0.25 + review * 0.65 + mastered * 1) / cards.length) * 100);
    return { learning, review, mastered, newCount, scored, retention, dueNow: deck.length };
  }, [cards.length, schedules, deck.length]);

  const WINDOW = 11;
  let winStart = Math.max(0, Math.min(safePos - 5, total - WINDOW));
  if (winStart < 0) winStart = 0;
  const winIdx = Array.from({ length: Math.min(WINDOW, total) }, (_, k) => winStart + k);

  const currentSched = cardIdx != null ? schedules[cardIdx] : undefined;

  return (
    <div className="flex flex-col h-full min-h-[72vh]">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="relative">
          <button onClick={() => { setModeOpen((v) => !v); setMenuOpen(false); }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all"
            style={{ background: 'rgba(255,255,255,0.9)', borderColor: 'rgba(0,0,0,0.1)', fontSize: 13, fontWeight: 600, color: '#0B1220' }}>
            <span style={{ color: '#2563EB' }}>{activeMode.icon}</span>
            {activeMode.label}
            <ChevronRight size={13} style={{ transform: modeOpen ? 'rotate(-90deg)' : 'rotate(90deg)', color: '#9AA3AF' }} />
          </button>
          {modeOpen && (
            <div className="absolute left-0 mt-1 rounded-xl border shadow-lg z-30 overflow-hidden" style={{ background: '#fff', borderColor: 'rgba(0,0,0,0.08)', minWidth: 210 }}>
              {MODES.map((m) => {
                const on = m.id === mode;
                return (
                  <button key={m.id} onClick={() => { setMode(m.id); setModeOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
                    style={{ fontSize: 13, fontWeight: on ? 650 : 500, color: on ? '#2563EB' : '#374151', background: on ? 'rgba(37,99,235,0.06)' : 'transparent' }}>
                    <span style={{ color: on ? '#2563EB' : '#9AA3AF' }}>{m.icon}</span>{m.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Progress: dots for standard/bookmarks; retention bar for adaptive modes */}
        <div className="flex-1 flex items-center justify-center overflow-hidden px-2">
          {isAdaptive ? (
            <RetentionHub hub={hub} />
          ) : (
            <div className="flex items-center gap-1.5">
              {winStart > 0 && <ChevronLeft size={13} style={{ color: '#C4CBD4' }} />}
              {winIdx.map((k) => (
                <span key={k}
                  style={{
                    width: k === safePos ? 12 : 8, height: k === safePos ? 12 : 8, borderRadius: '50%',
                    background: k === safePos ? '#2563EB' : k < safePos ? '#9AA3AF' : '#E5E7EB',
                    border: k === safePos ? '2px solid rgba(37,99,235,0.25)' : 'none',
                    transition: 'all .15s',
                  }} />
              ))}
              {winStart + WINDOW < total && <ChevronRight size={13} style={{ color: '#C4CBD4' }} />}
            </div>
          )}
        </div>

        <div className="relative flex items-center gap-2">
          <button onClick={() => { setMenuOpen((v) => !v); setModeOpen(false); }} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100" style={{ color: '#6B7280' }}>
            <MoreHorizontal size={16} />
          </button>
          {!isAdaptive && (
            <button onClick={() => setShuffleOpen(true)} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100" style={{ color: '#6B7280' }}>
              <Shuffle size={15} />
            </button>
          )}
          <div className="flex items-center gap-1">
            {!isAdaptive && (
              <button onClick={goPrev} disabled={safePos === 0} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100" style={{ color: safePos === 0 ? '#D1D5DB' : '#374151' }}>
                <ChevronLeft size={16} />
              </button>
            )}
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', minWidth: isAdaptive ? 70 : 42, textAlign: 'center' }}>
              {isAdaptive
                ? (waiting ? 'Caught up' : `${hub.dueNow} due`)
                : (total === 0 ? '0 / 0' : `${safePos + 1} / ${total}`)}
            </span>
            {!isAdaptive && (
              <button onClick={goNext} disabled={safePos >= total - 1} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100" style={{ color: safePos >= total - 1 ? '#D1D5DB' : '#374151' }}>
                <ChevronRight size={16} />
              </button>
            )}
          </div>
          {menuOpen && (
            <div className="absolute right-0 top-9 rounded-xl border shadow-lg z-30 overflow-hidden" style={{ background: '#fff', borderColor: 'rgba(0,0,0,0.08)', minWidth: 170 }}>
              <button onClick={restart} className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50" style={{ fontSize: 13, color: '#374151' }}><RotateCcw size={13} />Restart from first</button>
              <button onClick={resetProgress} className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50" style={{ fontSize: 13, color: '#DC2626' }}><X size={13} />Reset progress</button>
            </div>
          )}
        </div>
      </div>

      {/* Card area */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 pb-2">
        {waiting ? (
          <div className="flex flex-col items-center text-center py-14 px-4" style={{ maxWidth: 420 }}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(37,99,235,0.1)' }}>
              <Check size={26} style={{ color: '#2563EB' }} />
            </div>
            <p style={{ fontSize: 17, fontWeight: 700, color: '#0B1220', marginBottom: 6 }}>You're caught up</p>
            <p style={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.55, marginBottom: 14 }}>
              {nextUpcoming
                ? <>Next review in <strong style={{ color: '#0B1220' }}>{fmtCountdown(nextUpcoming.dueAt - now)}</strong>. Hard cards come back sooner; easy ones stay spaced out.</>
                : 'All cards in this set are scheduled. Reset progress to start a fresh session.'}
            </p>
            <RetentionHub hub={hub} large />
            {nextUpcoming && (
              <button onClick={studyAhead} className="mt-5 px-5 py-2.5 rounded-xl text-white" style={{ background: '#2563EB', fontSize: 13, fontWeight: 600 }}>
                Study ahead — review next card now
              </button>
            )}
          </div>
        ) : !card ? (
          <div className="flex flex-col items-center text-center py-16">
            <Bookmark size={30} style={{ color: '#C4CBD4', marginBottom: 10 }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: '#0B1220', marginBottom: 4 }}>
              {mode === 'bookmarked' ? 'No bookmarked cards yet' : 'No cards'}
            </p>
            <p style={{ fontSize: 13, color: '#9AA3AF' }}>
              {mode === 'bookmarked' ? 'Bookmark cards while studying to build a focused set.' : 'Generate a set to start studying.'}
            </p>
          </div>
        ) : (
          <div className="w-full" style={{ maxWidth: 620 }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#6B7280' }}>{sideLabel}</span>
                <span className="px-1.5 rounded" style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', background: '#F3F4F6' }}>{isAdaptive ? hub.dueNow : safePos + 1}</span>
                {isAdaptive && currentSched && currentSched.stage !== 'new' && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold capitalize"
                    style={{
                      background: currentSched.stage === 'mastered' ? '#ECFDF5' : currentSched.stage === 'review' ? '#EFF6FF' : '#FFF7ED',
                      color: currentSched.stage === 'mastered' ? '#059669' : currentSched.stage === 'review' ? '#2563EB' : '#EA580C',
                    }}>
                    {currentSched.stage}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => react('up')} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100" style={{ color: reactions[cardIdx!] === 'up' ? '#059669' : '#9AA3AF' }}><ThumbsUp size={14} /></button>
                <button onClick={() => react('down')} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100" style={{ color: reactions[cardIdx!] === 'down' ? '#DC2626' : '#9AA3AF' }}><ThumbsDown size={14} /></button>
                <button onClick={toggleBookmark} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100" style={{ color: bookmarks.has(cardIdx!) ? '#2563EB' : '#9AA3AF' }}>
                  <Bookmark size={14} fill={bookmarks.has(cardIdx!) ? '#2563EB' : 'none'} />
                </button>
              </div>
            </div>

            <button onClick={flip} className="w-full text-center transition-all" style={{ perspective: 1000 }}>
              <div className="rounded-[20px] flex items-center justify-center px-8"
                style={{ minHeight: 300, background: '#fff', boxShadow: '0 10px 34px -14px rgba(30,50,80,0.28)', border: '1px solid rgba(0,0,0,0.05)' }}>
                <div>
                  <p style={{ fontSize: showingBack ? 18 : 22, fontWeight: showingBack ? 500 : 600, color: '#0B1220', lineHeight: 1.5 }}>
                    {faceText}
                  </p>
                  {flipped && card.hook && (
                    <p style={{ fontSize: 12.5, color: '#7C3AED', marginTop: 14, fontStyle: 'italic' }}>💡 {card.hook}</p>
                  )}
                </div>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      {card && (
        <div className="px-5 py-4 flex flex-col items-center gap-2">
          {mode === 'confidence' && flipped ? (
            <>
              <p style={{ fontSize: 12, color: '#9AA3AF', marginBottom: 2 }}>How confident are you? · schedules the next review</p>
              <div className="flex items-center gap-3 flex-wrap justify-center">
                <RateButton n={1} label="Not Very Confident" sub="again · now" color="#F97316" icon={<HelpCircle size={15} />} onClick={() => rateConfidence(1)} />
                <RateButton n={2} label="Somewhat Confident" sub="good · 10m+" color="#22C55E" icon={<ThumbsUp size={15} />} onClick={() => rateConfidence(2)} />
                <RateButton n={3} label="Very Confident" sub="easy · 3d+" color="#7C3AED" icon={<Flame size={15} />} onClick={() => rateConfidence(3)} />
              </div>
            </>
          ) : mode === 'spaced' && flipped ? (
            <>
              <p style={{ fontSize: 12, color: '#9AA3AF', marginBottom: 2 }}>Rate recall · Again/Hard return soon · Good/Easy space out</p>
              <div className="flex items-center gap-3 flex-wrap justify-center">
                <RateButton n={1} label="Again" sub={fmtInterval(BASE_INTERVAL.again)} color="#EC4899" icon={<RotateCcw size={15} />} onClick={() => rate('again')} />
                <RateButton n={2} label="Hard" sub={fmtInterval(BASE_INTERVAL.hard)} color="#F97316" icon={<HelpCircle size={15} />} onClick={() => rate('hard')} />
                <RateButton n={3} label="Good" sub={fmtInterval(currentSched && currentSched.reps > 0 ? Math.round(Math.max(BASE_INTERVAL.good, currentSched.intervalMs) * currentSched.ease) : BASE_INTERVAL.good)} color="#22C55E" icon={<Check size={15} />} onClick={() => rate('good')} />
                <RateButton n={4} label="Easy" sub={fmtInterval(BASE_INTERVAL.easy)} color="#6366F1" icon={<Flame size={15} />} onClick={() => rate('easy')} />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              {!isAdaptive && (
                <button onClick={goPrev} disabled={safePos === 0} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border transition-all"
                  style={{ fontSize: 13, color: safePos === 0 ? '#C4CBD4' : '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.9)' }}>
                  <ChevronLeft size={14} />Previous
                </button>
              )}
              <button onClick={flip} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border transition-all"
                style={{ fontSize: 13, fontWeight: 600, color: '#0B1220', borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.95)' }}>
                <kbd style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', background: '#F3F4F6', padding: '2px 5px', borderRadius: 4 }}>SPACE</kbd>Flip
              </button>
              {!isAdaptive && (
                <button onClick={goNext} disabled={safePos >= total - 1} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border transition-all"
                  style={{ fontSize: 13, color: safePos >= total - 1 ? '#C4CBD4' : '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.9)' }}>
                  Next<ChevronRight size={14} />
                </button>
              )}
              {isAdaptive && !flipped && (
                <p style={{ fontSize: 12, color: '#9AA3AF' }}>Flip to rate & schedule</p>
              )}
            </div>
          )}
        </div>
      )}

      {shuffleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(30,40,55,0.45)' }} onClick={() => setShuffleOpen(false)}>
          <div className="rounded-2xl p-6 w-full max-w-md mx-4" style={{ background: '#fff', boxShadow: '0 24px 60px -20px rgba(0,0,0,0.4)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-2">
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0B1220' }}>Shuffle flashcards?</h3>
              <button onClick={() => setShuffleOpen(false)} style={{ color: '#9AA3AF' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.55, marginBottom: 20 }}>Cards will be reordered randomly. Your progress will be kept.</p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setShuffleOpen(false)} className="px-5 py-2.5 rounded-xl border" style={{ fontSize: 13, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.12)' }}>Cancel</button>
              <button onClick={doShuffle} className="px-5 py-2.5 rounded-xl text-white" style={{ fontSize: 13, fontWeight: 600, background: '#2563EB' }}>Shuffle</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RetentionHub({ hub, large }: {
  hub: { learning: number; review: number; mastered: number; newCount: number; retention: number; dueNow: number };
  large?: boolean;
}) {
  const total = Math.max(1, hub.newCount + hub.learning + hub.review + hub.mastered);
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="w-full" style={{ maxWidth: large ? 360 : 320 }}>
      <div className="flex items-center justify-between mb-1.5">
        <span style={{ fontSize: large ? 12.5 : 11, fontWeight: 700, color: '#6B7280', letterSpacing: '.04em' }}>
          SPACED LEARNING
        </span>
        <span style={{ fontSize: large ? 13 : 11.5, fontWeight: 700, color: '#0B1220' }}>{hub.retention}% retained</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden" style={{ background: '#E5E7EB' }}>
        <div style={{ width: seg(hub.mastered), background: '#22C55E', transition: 'width .25s' }} />
        <div style={{ width: seg(hub.review), background: '#2563EB', transition: 'width .25s' }} />
        <div style={{ width: seg(hub.learning), background: '#F97316', transition: 'width .25s' }} />
        <div style={{ width: seg(hub.newCount), background: '#E5E7EB' }} />
      </div>
      <div className="flex items-center gap-3 mt-1.5 flex-wrap" style={{ fontSize: large ? 11.5 : 10.5, color: '#6B7280' }}>
        <span><span style={{ color: '#22C55E', fontWeight: 700 }}>●</span> {hub.mastered} mastered</span>
        <span><span style={{ color: '#2563EB', fontWeight: 700 }}>●</span> {hub.review} review</span>
        <span><span style={{ color: '#F97316', fontWeight: 700 }}>●</span> {hub.learning} learning</span>
        <span><span style={{ color: '#9AA3AF', fontWeight: 700 }}>●</span> {hub.newCount} new</span>
      </div>
    </div>
  );
}

function RateButton({ n, label, sub, color, icon, onClick }: { n: number; label: string; sub?: string; color: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative flex flex-col items-center justify-center rounded-xl text-white transition-transform hover:-translate-y-0.5"
      style={{ background: color, minWidth: 128, padding: '10px 14px' }}>
      <span className="absolute top-1 left-1.5" style={{ fontSize: 10, fontWeight: 700, opacity: 0.85 }}>{n}</span>
      <span className="mb-0.5">{icon}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{label}</span>
      {sub && <span style={{ fontSize: 10.5, opacity: 0.9 }}>{sub}</span>}
    </button>
  );
}

/**
 * Creator wrapper: shows the generated flashcards in the study UI, plus a
 * header to save the set as a draft / submit for review (persists to library).
 */
export function FlashcardEditor({ typeId, title, scope, fv, cards, onBack, onDone }: any) {
  const { addObject } = useApp();
  const [docTitle, setDocTitle] = useState<string>(title || 'Flashcard set');
  const [submitted, setSubmitted] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [localCards, setLocalCards] = useState<StudyCard[]>(cards || []);
  const savedId = useRef<string | null>(null);

  useEffect(() => { setLocalCards(cards || []); }, [cards]);

  const briefChips: string[] = [fv?.aud || 'High school', fv?.lvl || 'Basic', fv?.cc || 'Key terms → definitions', fv?.dir || 'Front→back'].filter(Boolean);
  const direction = (fv?.dir as string) || 'Front→back';

  const save = (status: 'draft' | 'in-review') => {
    const block = {
      id: `blk-${Date.now()}`,
      type: 'flashcard-set',
      content: {
        cards: localCards.map((c) => ({ front: c.front, back: c.back, ...(c.hook ? { hook: c.hook } : {}) })),
        direction,
      },
    };
    const id = addObject({
      id: savedId.current || undefined,
      type: typeId,
      title: (docTitle || 'Flashcard set').trim(),
      status,
      description: (fv?.mem as string)?.trim() || `A ${localCards.length}-card study set.`,
      estimatedTime: `${Math.max(3, Math.round(localCards.length * 0.5))} min`,
      blocks: [block] as any,
      tags: briefChips,
      sourceIds: [],
    });
    savedId.current = id;
    return id;
  };

  const handleSaveDraft = () => { save('draft'); setSavedNote(true); setTimeout(() => onDone(), 650); };

  if (submitted) return (
    <div className="flex flex-col items-center justify-center p-10 text-center min-h-[50vh]">
      <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: '#FEF3C7' }}>
        <Check size={24} style={{ color: '#D97706' }} />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0B1220', marginBottom: 6 }}>Submitted for review</h2>
      <p style={{ fontSize: 13.5, color: '#6B7280', maxWidth: 380, marginBottom: 14 }}>
        "{docTitle}" has been submitted. A reviewer will provide feedback before it can be published.
      </p>
      <button onClick={onDone} className="px-6 py-2.5 rounded-full text-white" style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600 }}>
        ✓ Done — go to library
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="sticky top-0 z-20 flex items-center gap-3 px-5 py-3 border-b border-white/40" style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)' }}>
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: '#6B7280' }}>
          <ChevronLeft size={15} />Back to Create
        </button>
        <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)}
          className="flex-1 bg-transparent outline-none" style={{ fontSize: 15, fontWeight: 700, color: '#0B1220' }} />
        <span style={{ fontSize: 11.5, color: savedNote ? '#059669' : '#9AA3AF' }}>
          {savedNote ? '✓ Saved to Object Library' : `${localCards.length} cards`}
        </span>
        <button onClick={handleSaveDraft} className="flex items-center gap-1.5 px-4 py-2 rounded-full border" style={{ fontSize: 12.5, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
          Save draft
        </button>
        <button onClick={() => { save('in-review'); setSubmitted(true); }} className="px-4 py-2 rounded-full text-white" style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 600 }}>
          Submit for review
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <FlashcardStudy cards={localCards} direction={direction} />
      </div>
    </div>
  );
}
