import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Shuffle, MoreHorizontal, ThumbsUp, ThumbsDown,
  Bookmark, RotateCcw, HelpCircle, Check, Flame, RefreshCw, Layers, X,
  Plus, Trash2, Sparkles, Loader2, Eye, Pencil,
} from 'lucide-react';
import { useApp } from '../../App';
import { editFlashcard, errorMessage } from '../../../lib/api';

export interface StudyCard {
  id?: string;
  front: string;
  back: string;
  hook?: string;
  /** Optional learner hint on the prompt side. */
  hint?: string;
  /** Image → label: picture shown on the front side. */
  imageUrl?: string;
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

/** Exact colors of the Spaced Repetition rating buttons. */
const SPACED_BTN = {
  again: { solid: '#EC4899', bg: '#FDF2F8', fg: '#DB2777' },
  hard:  { solid: '#F97316', bg: '#FFF7ED', fg: '#EA580C' },
  good:  { solid: '#22C55E', bg: '#ECFDF5', fg: '#059669' },
  easy:  { solid: '#6366F1', bg: '#EEF2FF', fg: '#4F46E5' },
} as const;

/** Exact colors of the Confidence rating buttons. */
const CONF_BTN = {
  again: { solid: '#F97316', bg: '#FFF7ED', fg: '#EA580C' }, // Not Very Confident
  good:  { solid: '#22C55E', bg: '#ECFDF5', fg: '#059669' }, // Somewhat Confident
  easy:  { solid: '#7C3AED', bg: '#F5F3FF', fg: '#6D28D9' }, // Very Confident
  hard:  { solid: '#F97316', bg: '#FFF7ED', fg: '#EA580C' }, // unused in confidence UI
} as const;

/**
 * Stage colors track the button that puts a card there:
 * learning ← Again (spaced) / Not Very (confidence),
 * review ← Good / Somewhat,
 * mastered ← Easy / Very Confident.
 * Hard stays in learning and uses the Hard button color in spaced mode chips.
 */
function stagePalette(mode: 'spaced' | 'confidence') {
  const b = mode === 'confidence' ? CONF_BTN : SPACED_BTN;
  return {
    mastered: { bar: b.easy.solid, bg: b.easy.bg, fg: b.easy.fg },
    review:   { bar: b.good.solid, bg: b.good.bg, fg: b.good.fg },
    // Spaced: Again pink for learning (fail → relearn). Confidence: Not Very orange.
    learning: { bar: b.again.solid, bg: b.again.bg, fg: b.again.fg },
    new:      { bar: '#E5E7EB', bg: '#F3F4F6', fg: '#6B7280' },
    hard:     { bar: b.hard.solid, bg: b.hard.bg, fg: b.hard.fg },
  };
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Learning steps + graduation thresholds (SM-2 style). */
const AGAIN_INTERVAL = 0;          // due again in this session ("now")
const HARD_LEARNING = 6 * MIN;     // early Hard
const GOOD_LEARNING = 10 * MIN;    // first Good while learning
const EASY_GRADUATE = 3 * DAY;     // Easy jumps to day-scale
const MASTERED_MIN_INTERVAL = 21 * DAY;
const MASTERED_MIN_REPS = 3;
/** Max brand-new cards introduced per calendar day. */
const NEW_CARD_CAP = 20;
/** Again/Hard due within this window stay part of the open session. */
const SESSION_WINDOW = 30 * MIN;

function freshSchedule(_now = Date.now()): CardSchedule {
  // New cards are not due until the session introduces them (capped).
  return { dueAt: 0, intervalMs: 0, ease: 2.5, reps: 0, lapses: 0, stage: 'new' };
}

function deriveStage(intervalMs: number, reps: number): Stage {
  if (intervalMs < DAY) return 'learning';
  if (intervalMs >= MASTERED_MIN_INTERVAL && reps >= MASTERED_MIN_REPS) return 'mastered';
  return 'review';
}

/**
 * Recompute ease / interval / reps / due after a rating.
 * Again → near-zero, re-queue same session; Hard → short growth;
 * Good → interval × ease; Easy → ease bump + easy bonus.
 */
function applyGrade(prev: CardSchedule, grade: Grade, now = Date.now()): CardSchedule {
  let ease = prev.ease || 2.5;
  let reps = prev.reps || 0;
  let lapses = prev.lapses || 0;
  let intervalMs = prev.intervalMs || 0;
  const wasNew = prev.stage === 'new';

  if (grade === 'again') {
    lapses += 1;
    reps = 0;
    ease = Math.max(1.3, ease - 0.2);
    intervalMs = AGAIN_INTERVAL;
    return {
      dueAt: now, // same-session re-queue (appended to end of queue)
      intervalMs,
      ease,
      reps,
      lapses,
      lastGrade: grade,
      stage: 'learning',
    };
  }

  if (grade === 'hard') {
    ease = Math.max(1.3, ease - 0.15);
    if (wasNew || reps === 0 || intervalMs < DAY) {
      intervalMs = HARD_LEARNING;
    } else {
      intervalMs = Math.round(Math.max(intervalMs * 1.2, HARD_LEARNING));
    }
    reps += 1;
    return {
      dueAt: now + intervalMs,
      intervalMs,
      ease,
      reps,
      lapses,
      lastGrade: grade,
      stage: deriveStage(intervalMs, reps),
    };
  }

  if (grade === 'good') {
    // Keep ease stable on the normal path.
    if (wasNew || reps === 0) {
      intervalMs = GOOD_LEARNING;
    } else if (intervalMs < DAY) {
      // Graduate from learning steps onto a day-scale review interval.
      intervalMs = DAY;
    } else {
      intervalMs = Math.round(intervalMs * ease);
    }
    reps += 1;
    return {
      dueAt: now + intervalMs,
      intervalMs,
      ease,
      reps,
      lapses,
      lastGrade: grade,
      stage: deriveStage(intervalMs, reps),
    };
  }

  // easy — bump ease + aggressive growth
  ease = Math.min(3.2, ease + 0.15);
  if (wasNew || reps === 0 || intervalMs < DAY) {
    intervalMs = EASY_GRADUATE;
  } else {
    intervalMs = Math.round(intervalMs * ease * 1.3);
  }
  reps += 1;
  return {
    dueAt: now + intervalMs,
    intervalMs,
    ease,
    reps,
    lapses,
    lastGrade: grade,
    stage: deriveStage(intervalMs, reps),
  };
}

/** Preview the interval label shown under each rating button. */
function previewInterval(prev: CardSchedule, grade: Grade): number {
  return applyGrade(prev, grade, Date.now()).intervalMs;
}

function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

type PersistBlob = {
  schedules: Record<number, CardSchedule>;
  newDate: string;
  newCount: number;
};

type AdaptiveEngine = 'spaced' | 'confidence';
type ConfidenceLevel = 'not-very' | 'somewhat' | 'very';

/** Confidence UI → SM-2 grades (no Hard — coarser 3-button signal). */
const CONFIDENCE_TO_GRADE: Record<ConfidenceLevel, Grade> = {
  'not-very': 'again',
  somewhat: 'good',
  very: 'easy',
};

function emptyBlob(cardCount: number): PersistBlob {
  const schedules: Record<number, CardSchedule> = {};
  for (let i = 0; i < cardCount; i++) schedules[i] = freshSchedule();
  return { schedules, newDate: todayKey(), newCount: 0 };
}

function persistStorageKey(base: string | undefined, engine: AdaptiveEngine): string | undefined {
  if (!base) return undefined;
  return `laic-sr:${base}:${engine}`;
}

function loadPersist(base: string | undefined, engine: AdaptiveEngine, cardCount: number): PersistBlob {
  const key = persistStorageKey(base, engine);
  if (!key || typeof window === 'undefined') return emptyBlob(cardCount);
  try {
    let raw = localStorage.getItem(key);
    // Migrate legacy single-key saves into the spaced engine once.
    if (!raw && engine === 'spaced' && base) {
      raw = localStorage.getItem(`laic-sr:${base}`);
    }
    if (!raw) return emptyBlob(cardCount);
    const parsed = JSON.parse(raw) as PersistBlob;
    if (!parsed?.schedules) return emptyBlob(cardCount);
    const schedules: Record<number, CardSchedule> = {};
    for (let i = 0; i < cardCount; i++) {
      schedules[i] = parsed.schedules[i] || freshSchedule();
    }
    return {
      schedules,
      newDate: parsed.newDate || todayKey(),
      newCount: parsed.newCount || 0,
    };
  } catch {
    return emptyBlob(cardCount);
  }
}

function savePersist(base: string | undefined, engine: AdaptiveEngine, blob: PersistBlob) {
  const key = persistStorageKey(base, engine);
  if (!key || typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(blob));
  } catch { /* quota / private mode */ }
}

/** Due cards (dueAt ≤ now) + capped brand-new cards. Reviews first. */
function buildDueQueue(
  order: number[],
  schedules: Record<number, CardSchedule>,
  now: number,
  newBudget: number,
): number[] {
  const due = order
    .filter((i) => {
      const s = schedules[i];
      if (!s || s.stage === 'new') return false;
      return (s.dueAt || 0) <= now;
    })
    .sort((a, b) => (schedules[a].dueAt || 0) - (schedules[b].dueAt || 0));

  const news = order.filter((i) => (schedules[i]?.stage || 'new') === 'new').slice(0, Math.max(0, newBudget));
  return [...due, ...news];
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

type SessionStats = {
  answers: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
  graduated: number; // entered review/mastered this session
};

function CardFaceText({
  text,
  imageUrl,
  emphasize,
}: {
  text: string;
  imageUrl?: string;
  emphasize?: boolean;
}) {
  const cueOnly = /^what is shown\??$/i.test(text.trim());
  return (
    <div className="w-full flex flex-col items-center gap-3">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={cueOnly ? 'Flashcard illustration' : text}
          style={{
            maxWidth: '100%',
            maxHeight: emphasize ? 220 : 200,
            objectFit: 'contain',
            borderRadius: 12,
          }}
        />
      ) : null}
      {/* Hide generic "What is shown?" when the image is the prompt. */}
      {text && !(imageUrl && cueOnly) ? (
        <p style={{
          fontSize: emphasize ? 22 : 18,
          fontWeight: emphasize ? 600 : 500,
          color: '#0B1220',
          lineHeight: 1.5,
          textAlign: 'center',
        }}>
          {text}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Full flashcard study experience. Spaced Repetition and Confidence each have
 * their own persisted memory state, but share one SM-2 scheduler + due-queue.
 * Confidence maps: Not Very→Again, Somewhat→Good, Very→Easy (no Hard).
 */
export function FlashcardStudy({
  cards,
  direction = 'Front→back',
  storageKey,
}: {
  cards: StudyCard[];
  direction?: string;
  storageKey?: string;
}) {
  const [mode, setMode] = useState<Mode>('standard');
  const [modeOpen, setModeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shuffleOpen, setShuffleOpen] = useState(false);

  const [order, setOrder] = useState<number[]>(() => cards.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [startBack, setStartBack] = useState<Record<number, boolean>>({});
  const [now, setNow] = useState(() => Date.now());

  /** Independent engines — switching tabs never mixes their schedules. */
  const [engines, setEngines] = useState<Record<AdaptiveEngine, PersistBlob>>(() => ({
    spaced: loadPersist(storageKey, 'spaced', cards.length),
    confidence: loadPersist(storageKey, 'confidence', cards.length),
  }));

  const engine: AdaptiveEngine | null =
    mode === 'spaced' || mode === 'confidence' ? mode : null;

  const schedules = engine ? engines[engine].schedules : {};
  const newDate = engine ? engines[engine].newDate : todayKey();
  const newCount = engine ? engines[engine].newCount : 0;

  /** Explicit session queue for adaptive modes — front card is shown. */
  const [queue, setQueue] = useState<number[]>([]);
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    answers: 0, again: 0, hard: 0, good: 0, easy: 0, graduated: 0,
  });

  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [reactions, setReactions] = useState<Record<number, 'up' | 'down'>>({});

  const newBudget = (newDate === todayKey() ? Math.max(0, NEW_CARD_CAP - newCount) : NEW_CARD_CAP);
  const isAdaptive = engine != null;

  const patchEngine = (eng: AdaptiveEngine, updater: (prev: PersistBlob) => PersistBlob) => {
    setEngines((prev) => {
      const nextBlob = updater(prev[eng]);
      savePersist(storageKey, eng, nextBlob);
      return { ...prev, [eng]: nextBlob };
    });
  };

  // Tick so Hard (6m) / delayed cards re-enter and countdowns update.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setOrder(cards.map((_, i) => i));
    setPos(0);
    setFlipped(false);
    setEngines({
      spaced: loadPersist(storageKey, 'spaced', cards.length),
      confidence: loadPersist(storageKey, 'confidence', cards.length),
    });
  }, [cards.length, storageKey]);

  useEffect(() => {
    if (direction === 'Both') {
      const map: Record<number, boolean> = {};
      for (let i = 0; i < cards.length; i++) map[i] = Math.random() < 0.5;
      setStartBack(map);
    } else {
      setStartBack({});
    }
  }, [direction, cards.length]);

  // Entering Spaced or Confidence: load THAT engine's state and start a fresh session queue.
  useEffect(() => {
    if (!engine) return;
    const t = Date.now();
    const blob = engines[engine];
    const budget = blob.newDate === todayKey() ? Math.max(0, NEW_CARD_CAP - blob.newCount) : NEW_CARD_CAP;
    setNow(t);
    setQueue(buildDueQueue(order, blob.schedules, t, budget));
    setPos(0);
    setFlipped(false);
    setSessionStats({ answers: 0, again: 0, hard: 0, good: 0, easy: 0, graduated: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset session only when mode/deck changes
  }, [mode, cards.length]);

  // As time passes, append cards that just became due (e.g. Hard → 6m).
  useEffect(() => {
    if (!engine) return;
    setQueue((prev) => {
      const inQ = new Set(prev);
      const newlyDue = order
        .filter((i) => {
          if (inQ.has(i)) return false;
          const s = schedules[i];
          if (!s || s.stage === 'new') return false;
          return (s.dueAt || 0) <= now;
        })
        .sort((a, b) => (schedules[a].dueAt || 0) - (schedules[b].dueAt || 0));
      return newlyDue.length ? [...prev, ...newlyDue] : prev;
    });
  }, [now, engine, order, schedules]);

  // Standard / bookmarked: linear deck.
  const deck = useMemo(() => {
    if (mode === 'bookmarked') return order.filter((i) => bookmarks.has(i));
    return order;
  }, [mode, order, bookmarks]);

  const waiting = isAdaptive && queue.length === 0 && cards.length > 0;
  const remainingNew = order.filter((i) => (schedules[i]?.stage || 'new') === 'new').length;
  const newCapHit = waiting && remainingNew > 0 && newBudget === 0;

  const nextUpcoming = useMemo(() => {
    if (!waiting) return null;
    let best: { idx: number; dueAt: number } | null = null;
    for (const i of order) {
      const s = schedules[i];
      if (!s || s.stage === 'new') continue;
      const due = s.dueAt || 0;
      if (due > now && (!best || due < best.dueAt)) best = { idx: i, dueAt: due };
    }
    return best;
  }, [waiting, order, schedules, now]);

  const total = isAdaptive ? queue.length : deck.length;
  const safePos = Math.min(pos, Math.max(0, total - 1));
  const cardIdx = waiting ? undefined : (isAdaptive ? queue[0] : deck[safePos]);
  const card = cardIdx != null ? cards[cardIdx] : undefined;

  useEffect(() => { setPos(0); setFlipped(false); setHintOpen(false); }, [mode]);
  useEffect(() => { setHintOpen(false); }, [cardIdx]);

  useEffect(() => {
    if (!isAdaptive && pos >= deck.length && deck.length > 0) setPos(0);
  }, [deck.length, pos, isAdaptive]);

  const goPrev = () => { if (safePos > 0) { setPos(safePos - 1); setFlipped(false); setHintOpen(false); } };
  const goNext = () => { if (safePos < total - 1) { setPos(safePos + 1); setFlipped(false); setHintOpen(false); } };
  const flip = () => setFlipped((f) => !f);

  /** Shared scheduler + due-queue — both modes call this with an SM-2 grade. */
  const applyRating = (grade: Grade, eng: AdaptiveEngine) => {
    if (cardIdx == null) return;
    const t = Date.now();
    const prev = engines[eng].schedules[cardIdx] || freshSchedule(t);
    const wasNew = prev.stage === 'new';
    const next = applyGrade(prev, grade, t);

    patchEngine(eng, (blob) => {
      const today = todayKey();
      const rolled = blob.newDate !== today;
      return {
        schedules: { ...blob.schedules, [cardIdx]: next },
        newDate: today,
        newCount: wasNew ? (rolled ? 1 : blob.newCount + 1) : (rolled ? 0 : blob.newCount),
      };
    });

    const graduated =
      (prev.stage === 'new' || prev.stage === 'learning') &&
      (next.stage === 'review' || next.stage === 'mastered');

    setSessionStats((s) => ({
      answers: s.answers + 1,
      again: s.again + (grade === 'again' ? 1 : 0),
      hard: s.hard + (grade === 'hard' ? 1 : 0),
      good: s.good + (grade === 'good' ? 1 : 0),
      easy: s.easy + (grade === 'easy' ? 1 : 0),
      graduated: s.graduated + (graduated ? 1 : 0),
    }));

    // Again (Not Very) → back of this session's queue. Hard → re-enters when due.
    // Good/Somewhat & Easy/Very leave until a future due date.
    setQueue((q) => {
      const rest = q.filter((i) => i !== cardIdx);
      if (grade === 'again') return [...rest, cardIdx];
      return rest;
    });

    setFlipped(false);
    setNow(t);
    setPos(0);
  };

  /** Spaced Repetition — full 4-grade SM-2. */
  const rateSpaced = (grade: Grade) => {
    if (mode !== 'spaced') return;
    applyRating(grade, 'spaced');
  };

  /** Confidence — 3 buttons mapped onto Again / Good / Easy. */
  const rateConfidence = (level: ConfidenceLevel) => {
    if (mode !== 'confidence') return;
    applyRating(CONFIDENCE_TO_GRADE[level], 'confidence');
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
  const restart = () => {
    if (engine) {
      const blob = engines[engine];
      const budget = blob.newDate === todayKey() ? Math.max(0, NEW_CARD_CAP - blob.newCount) : NEW_CARD_CAP;
      setQueue(buildDueQueue(order, blob.schedules, Date.now(), budget));
    }
    setPos(0);
    setFlipped(false);
    setMenuOpen(false);
  };
  const resetProgress = () => {
    if (engine) {
      const init = emptyBlob(cards.length);
      patchEngine(engine, () => init);
      setQueue(buildDueQueue(order, init.schedules, Date.now(), NEW_CARD_CAP));
    }
    setReactions({});
    setBookmarks(new Set());
    setPos(0);
    setFlipped(false);
    setMenuOpen(false);
    setSessionStats({ answers: 0, again: 0, hard: 0, good: 0, easy: 0, graduated: 0 });
    if (mode === 'bookmarked') setMode('standard');
  };

  const studyAhead = () => {
    if (!nextUpcoming || !engine) return;
    const t = Date.now();
    patchEngine(engine, (blob) => ({
      ...blob,
      schedules: {
        ...blob.schedules,
        [nextUpcoming.idx]: { ...(blob.schedules[nextUpcoming.idx] || freshSchedule()), dueAt: t },
      },
    }));
    setQueue((q) => (q.includes(nextUpcoming.idx) ? q : [...q, nextUpcoming.idx]));
    setNow(t);
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
      if (mode === 'confidence' && flipped && ['1', '2', '3'].includes(e.key)) {
        rateConfidence((['not-very', 'somewhat', 'very'] as ConfidenceLevel[])[Number(e.key) - 1]);
      }
      if (mode === 'spaced' && flipped && ['1', '2', '3', '4'].includes(e.key)) {
        rateSpaced((['again', 'hard', 'good', 'easy'] as Grade[])[Number(e.key) - 1]);
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
  const promptText = card ? (promptIsBack ? card.back : card.front) : '';
  const answerText = card ? (promptIsBack ? card.front : card.back) : '';

  // Retention hub: stages for retention %, last ratings for bar (= button colors).
  const hub = useMemo(() => {
    let learning = 0, review = 0, mastered = 0, newCount = 0;
    let again = 0, hard = 0, good = 0, easy = 0;
    for (let i = 0; i < cards.length; i++) {
      const s = schedules[i];
      const stage = s?.stage || 'new';
      if (stage === 'new') newCount++;
      else if (stage === 'learning') learning++;
      else if (stage === 'review') review++;
      else mastered++;

      const g = s?.lastGrade;
      if (stage !== 'new' && g === 'again') again++;
      else if (stage !== 'new' && g === 'hard') hard++;
      else if (stage !== 'new' && g === 'good') good++;
      else if (stage !== 'new' && g === 'easy') easy++;
    }
    const retention = cards.length === 0 ? 0
      : Math.round(((learning * 0.25 + review * 0.65 + mastered * 1) / cards.length) * 100);
    return {
      learning, review, mastered, newCount, retention,
      dueNow: isAdaptive ? queue.length : deck.length,
      grades: { again, hard, good, easy },
    };
  }, [cards.length, schedules, deck.length, queue.length, isAdaptive]);

  const paletteMode: 'spaced' | 'confidence' = mode === 'confidence' ? 'confidence' : 'spaced';
  const palette = stagePalette(paletteMode);

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
            <RetentionHub hub={hub} large={false} variant={paletteMode} />
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
          <div className="flex flex-col items-center text-center py-14 px-4" style={{ maxWidth: 440 }}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(37,99,235,0.1)' }}>
              <Check size={26} style={{ color: '#2563EB' }} />
            </div>
            <p style={{ fontSize: 17, fontWeight: 700, color: '#0B1220', marginBottom: 6 }}>
              {newCapHit ? 'All due cards done' : nextUpcoming && nextUpcoming.dueAt - now <= SESSION_WINDOW ? 'Short break' : 'Session complete'}
            </p>
            <p style={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.55, marginBottom: 12 }}>
              {newCapHit
                ? <>You've hit today's new-card cap ({NEW_CARD_CAP}). Come back tomorrow for {remainingNew} more new card{remainingNew === 1 ? '' : 's'}.</>
                : nextUpcoming
                  ? <>Next review in <strong style={{ color: '#0B1220' }}>{fmtCountdown(nextUpcoming.dueAt - now)}</strong>. {mode === 'confidence' ? 'Not Very cards return soon; Somewhat/Very leave the session.' : 'Again/Hard cards return soon; Good/Easy leave the session.'}</>
                  : 'Nothing is due. Schedules are saved — come back when cards are due again.'}
            </p>
            {sessionStats.answers > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mb-4" style={{ fontSize: 12 }}>
                <span className="px-2.5 py-1 rounded-full" style={{ background: '#F3F4F6', color: '#6B7280' }}>
                  {sessionStats.answers} reviewed
                </span>
                {mode === 'confidence' ? (
                  <>
                    {sessionStats.again > 0 && (
                      <span className="px-2.5 py-1 rounded-full" style={{ background: CONF_BTN.again.bg, color: CONF_BTN.again.fg }}>
                        {sessionStats.again} not very
                      </span>
                    )}
                    {sessionStats.good > 0 && (
                      <span className="px-2.5 py-1 rounded-full" style={{ background: CONF_BTN.good.bg, color: CONF_BTN.good.fg }}>
                        {sessionStats.good} somewhat
                      </span>
                    )}
                    {sessionStats.easy > 0 && (
                      <span className="px-2.5 py-1 rounded-full" style={{ background: CONF_BTN.easy.bg, color: CONF_BTN.easy.fg }}>
                        {sessionStats.easy} very
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    {sessionStats.again > 0 && (
                      <span className="px-2.5 py-1 rounded-full" style={{ background: SPACED_BTN.again.bg, color: SPACED_BTN.again.fg }}>
                        {sessionStats.again} again
                      </span>
                    )}
                    {sessionStats.hard > 0 && (
                      <span className="px-2.5 py-1 rounded-full" style={{ background: SPACED_BTN.hard.bg, color: SPACED_BTN.hard.fg }}>
                        {sessionStats.hard} hard
                      </span>
                    )}
                    {sessionStats.good > 0 && (
                      <span className="px-2.5 py-1 rounded-full" style={{ background: SPACED_BTN.good.bg, color: SPACED_BTN.good.fg }}>
                        {sessionStats.good} good
                      </span>
                    )}
                    {sessionStats.easy > 0 && (
                      <span className="px-2.5 py-1 rounded-full" style={{ background: SPACED_BTN.easy.bg, color: SPACED_BTN.easy.fg }}>
                        {sessionStats.easy} easy
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
            <RetentionHub hub={hub} large variant={paletteMode} />
            {nextUpcoming && nextUpcoming.dueAt - now <= SESSION_WINDOW && (
              <p style={{ fontSize: 12, color: '#9AA3AF', marginTop: 12 }}>
                Waiting for Hard cards to come due — they'll appear automatically.
              </p>
            )}
            {nextUpcoming && nextUpcoming.dueAt - now > SESSION_WINDOW && (
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
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={{
                      background: palette[currentSched.stage].bg,
                      color: palette[currentSched.stage].fg,
                    }}>
                    {mode === 'confidence'
                      ? (currentSched.stage === 'mastered' ? 'very confident'
                        : currentSched.stage === 'review' ? 'somewhat'
                          : 'not very')
                      : currentSched.stage}
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

            <button
              type="button"
              onClick={flip}
              aria-label={flipped ? 'Flip to term' : 'Flip to definition'}
              className="w-full text-center"
              style={{ perspective: 1400, border: 0, background: 'transparent', padding: 0, cursor: 'pointer' }}
            >
              <div
                key={cardIdx}
                style={{
                  position: 'relative',
                  width: '100%',
                  minHeight: 300,
                  transformStyle: 'preserve-3d',
                  transition: 'transform 0.55s cubic-bezier(0.4, 0.2, 0.2, 1)',
                  transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
              >
                {/* Front (prompt) */}
                <div
                  className="rounded-[20px] flex items-center justify-center px-8 py-6"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    minHeight: 300,
                    background: '#fff',
                    boxShadow: '0 10px 34px -14px rgba(30,50,80,0.28)',
                    border: '1px solid rgba(0,0,0,0.05)',
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                    transform: 'rotateY(0deg)',
                  }}
                >
                  <CardFaceText
                    text={promptText}
                    imageUrl={!promptIsBack ? card.imageUrl : undefined}
                    emphasize
                  />
                </div>
                {/* Back (answer) */}
                <div
                  className="rounded-[20px] flex items-center justify-center px-8 py-6"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    minHeight: 300,
                    background: '#fff',
                    boxShadow: '0 10px 34px -14px rgba(30,50,80,0.28)',
                    border: '1px solid rgba(0,0,0,0.05)',
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                  }}
                >
                  <div className="w-full flex flex-col items-center">
                    <CardFaceText
                      text={answerText}
                      imageUrl={promptIsBack ? card.imageUrl : undefined}
                    />
                    {card.hook && (
                      <p style={{ fontSize: 12.5, color: '#7C3AED', marginTop: 14, fontStyle: 'italic' }}>💡 {card.hook}</p>
                    )}
                  </div>
                </div>
              </div>
            </button>
            {!flipped && card.hint && (
              <div className="mt-3 text-center">
                {!hintOpen ? (
                  <button type="button" onClick={() => setHintOpen(true)}
                    className="px-3 py-1.5 rounded-full border text-xs font-semibold"
                    style={{ borderColor: 'rgba(37,99,235,0.25)', color: '#2563EB', background: 'rgba(37,99,235,0.06)' }}>
                    Show hint
                  </button>
                ) : (
                  <p style={{ fontSize: 13, color: '#2563EB', lineHeight: 1.45 }}>Hint: {card.hint}</p>
                )}
              </div>
            )}
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
                <RateButton n={1} label="Not Very Confident" sub={`now · ${fmtInterval(previewInterval(currentSched || freshSchedule(), 'again'))}`} color={CONF_BTN.again.solid} icon={<HelpCircle size={15} />} onClick={() => rateConfidence('not-very')} />
                <RateButton n={2} label="Somewhat Confident" sub={fmtInterval(previewInterval(currentSched || freshSchedule(), 'good'))} color={CONF_BTN.good.solid} icon={<ThumbsUp size={15} />} onClick={() => rateConfidence('somewhat')} />
                <RateButton n={3} label="Very Confident" sub={fmtInterval(previewInterval(currentSched || freshSchedule(), 'easy'))} color={CONF_BTN.easy.solid} icon={<Flame size={15} />} onClick={() => rateConfidence('very')} />
              </div>
            </>
          ) : mode === 'spaced' && flipped ? (
            <>
              <p style={{ fontSize: 12, color: '#9AA3AF', marginBottom: 2 }}>Rate recall · Again/Hard re-queue this session · Good/Easy leave</p>
              <div className="flex items-center gap-3 flex-wrap justify-center">
                <RateButton n={1} label="Again" sub={fmtInterval(previewInterval(currentSched || freshSchedule(), 'again'))} color={SPACED_BTN.again.solid} icon={<RotateCcw size={15} />} onClick={() => rateSpaced('again')} />
                <RateButton n={2} label="Hard" sub={fmtInterval(previewInterval(currentSched || freshSchedule(), 'hard'))} color={SPACED_BTN.hard.solid} icon={<HelpCircle size={15} />} onClick={() => rateSpaced('hard')} />
                <RateButton n={3} label="Good" sub={fmtInterval(previewInterval(currentSched || freshSchedule(), 'good'))} color={SPACED_BTN.good.solid} icon={<Check size={15} />} onClick={() => rateSpaced('good')} />
                <RateButton n={4} label="Easy" sub={fmtInterval(previewInterval(currentSched || freshSchedule(), 'easy'))} color={SPACED_BTN.easy.solid} icon={<Flame size={15} />} onClick={() => rateSpaced('easy')} />
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

function RetentionHub({ hub, large, variant }: {
  hub: {
    learning: number; review: number; mastered: number; newCount: number;
    retention: number; dueNow: number;
    grades: { again: number; hard: number; good: number; easy: number };
  };
  large?: boolean;
  variant: 'spaced' | 'confidence';
}) {
  const btn = variant === 'confidence' ? CONF_BTN : SPACED_BTN;
  const { again, hard, good, easy } = hub.grades;
  // Bar = last button pressed on each card (+ new). Colors match the buttons exactly.
  const segments = variant === 'confidence'
    ? [
        { n: easy, color: btn.easy.solid, label: 'very confident' },
        { n: good, color: btn.good.solid, label: 'somewhat' },
        { n: again, color: btn.again.solid, label: 'not very' },
        { n: hub.newCount, color: '#E5E7EB', label: 'new' },
      ]
    : [
        { n: easy, color: btn.easy.solid, label: 'easy' },
        { n: good, color: btn.good.solid, label: 'good' },
        { n: hard, color: btn.hard.solid, label: 'hard' },
        { n: again, color: btn.again.solid, label: 'again' },
        { n: hub.newCount, color: '#E5E7EB', label: 'new' },
      ];
  const total = Math.max(1, segments.reduce((s, x) => s + x.n, 0));
  const title = variant === 'confidence' ? 'CONFIDENCE' : 'SPACED LEARNING';

  return (
    <div className="w-full" style={{ maxWidth: large ? 380 : 340 }}>
      <div className="flex items-center justify-between mb-1.5">
        <span style={{ fontSize: large ? 12.5 : 11, fontWeight: 700, color: '#6B7280', letterSpacing: '.04em' }}>
          {title}
        </span>
        <span style={{ fontSize: large ? 13 : 11.5, fontWeight: 700, color: '#0B1220' }}>{hub.retention}% retained</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden" style={{ background: '#E5E7EB' }}>
        {segments.map((seg) => (
          <div key={seg.label} style={{ width: `${(seg.n / total) * 100}%`, background: seg.color, transition: 'width .25s' }} />
        ))}
      </div>
      <div className="flex items-center gap-3 mt-1.5 flex-wrap" style={{ fontSize: large ? 11.5 : 10.5, color: '#6B7280' }}>
        {segments.map((seg) => (
          <span key={seg.label}>
            <span style={{ color: seg.color === '#E5E7EB' ? '#9AA3AF' : seg.color, fontWeight: 700 }}>●</span>{' '}
            {seg.n} {seg.label}
          </span>
        ))}
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

type EditorMode = 'edit' | 'preview';

function AskAiCard({
  card, onApply, onClose,
}: {
  card: StudyCard;
  onApply: (patch: Partial<StudyCard>) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const chips = ['Make the front clearer', 'Simplify the answer', 'Add a helpful hint', 'Add a memory hook', 'Make it harder'];
  const field: React.CSSProperties = { fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' };

  const run = async (instruction: string) => {
    const ins = instruction.trim();
    if (!ins || busy) return;
    setBusy(true); setErr(null);
    try {
      const edited = await editFlashcard({
        front: card.front, back: card.back, hook: card.hook, hint: card.hint, imageUrl: card.imageUrl,
      }, ins);
      onApply({
        front: edited.front,
        back: edited.back,
        hook: edited.hook,
        hint: edited.hint,
        imageUrl: edited.imageUrl || card.imageUrl,
      });
      setText('');
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {chips.map((c) => (
          <button key={c} disabled={busy} onClick={() => run(c)} className="px-2.5 py-1 rounded-full border text-xs"
            style={{ background: '#FEF3C7', borderColor: '#FCD34D', color: '#92400E', opacity: busy ? 0.55 : 1 }}>{c}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} disabled={busy}
          onKeyDown={(e) => { if (e.key === 'Enter') run(text); }}
          placeholder="Tell the AI how to change this card…"
          className="flex-1 rounded-xl px-3 py-2" style={field} />
        <button onClick={() => run(text)} disabled={busy || !text.trim()} className="px-3 py-2 rounded-xl text-white"
          style={{ background: '#0B0F1A', opacity: busy || !text.trim() ? 0.6 : 1 }}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        </button>
      </div>
      {busy && <p style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 6 }}>Rewriting with AI…</p>}
      {err && <p style={{ fontSize: 11.5, color: '#DC2626', marginTop: 6 }}>{err}</p>}
    </div>
  );
}

/**
 * Creator wrapper: edit cards (manual / AI / add / hints) + student preview study UI.
 */
export function FlashcardEditor({ typeId, title, scope, fv, cards, initialId, initialStatus, pipelineDraft, onBack, onDone }: any) {
  const { addObject } = useApp();
  const [docTitle, setDocTitle] = useState<string>(title || 'Flashcard set');
  const [submitted, setSubmitted] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [mode, setMode] = useState<EditorMode>('edit');
  const [localCards, setLocalCards] = useState<StudyCard[]>(() =>
    (cards || []).map((c: StudyCard, i: number) => ({ ...c, id: c.id || `c-${i}` })),
  );
  const [editId, setEditId] = useState<string | null>(null);
  const [aiId, setAiId] = useState<string | null>(null);
  const [objectStatus, setObjectStatus] = useState(initialStatus || 'draft');
  const savedId = useRef<string | null>(initialId || null);
  const field: React.CSSProperties = { fontSize: 13, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.85)', outline: 'none' };
  const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 3, display: 'block' };

  useEffect(() => {
    setLocalCards((cards || []).map((c: StudyCard, i: number) => ({ ...c, id: c.id || `c-${i}` })));
  }, [cards]);
  useEffect(() => { if (initialId) savedId.current = initialId; }, [initialId]);
  useEffect(() => { if (initialStatus) setObjectStatus(initialStatus); }, [initialStatus]);

  const briefChips: string[] = [
    fv?.aud || 'High school',
    fv?.lvl || 'Basic',
    ...(Array.isArray(fv?.cc) ? fv.cc : [fv?.cc || 'Key terms → definitions']),
    fv?.dir || 'Front→back',
  ].filter(Boolean);
  const direction = (fv?.dir as string) || 'Front→back';

  const updateCard = (id: string, patch: Partial<StudyCard>) =>
    setLocalCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const addCard = () => {
    const id = `c-new-${Date.now()}`;
    setLocalCards((p) => [...p, { id, front: '', back: '', hint: '', hook: '' }]);
    setEditId(id);
    setAiId(null);
    setMode('edit');
  };

  const save = (status: 'draft' | 'in-review') => {
    const block = {
      id: `blk-${Date.now()}`,
      type: 'flashcard-set',
      content: {
        cards: localCards.map((c) => ({
          front: c.front,
          back: c.back,
          ...(c.hook ? { hook: c.hook } : {}),
          ...(c.hint ? { hint: c.hint } : {}),
          ...(c.imageUrl ? { imageUrl: c.imageUrl } : {}),
        })),
        direction,
      },
    };
    const keepStatus = objectStatus === 'in-review' && status === 'draft' ? 'in-review' : status;
    const id = addObject({
      id: savedId.current || undefined,
      type: typeId,
      title: (docTitle || 'Flashcard set').trim(),
      status: keepStatus,
      description: (fv?.mem as string)?.trim() || `A ${localCards.length}-card study set.`,
      estimatedTime: `${Math.max(3, Math.round(localCards.length * 0.5))} min`,
      blocks: [block] as any,
      tags: briefChips,
      sourceIds: [],
      pipelineDraft: pipelineDraft || undefined,
      scope,
    });
    savedId.current = id;
    setObjectStatus(keepStatus);
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
          <ChevronLeft size={15} />Back to pipeline
        </button>
        <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)}
          className="flex-1 bg-transparent outline-none" style={{ fontSize: 15, fontWeight: 700, color: '#0B1220' }} />
        <div className="flex rounded-full border p-0.5" style={{ borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
          <button onClick={() => setMode('edit')} className="flex items-center gap-1 px-3 py-1.5 rounded-full"
            style={{ fontSize: 12, fontWeight: 600, background: mode === 'edit' ? '#0B0F1A' : 'transparent', color: mode === 'edit' ? '#fff' : '#6B7280' }}>
            <Pencil size={12} />Edit
          </button>
          <button onClick={() => setMode('preview')} className="flex items-center gap-1 px-3 py-1.5 rounded-full"
            style={{ fontSize: 12, fontWeight: 600, background: mode === 'preview' ? '#0B0F1A' : 'transparent', color: mode === 'preview' ? '#fff' : '#6B7280' }}>
            <Eye size={12} />Student preview
          </button>
        </div>
        <span style={{ fontSize: 11.5, color: savedNote ? '#059669' : '#9AA3AF' }}>
          {savedNote ? '✓ Saved' : `${localCards.length} cards`}
        </span>
        <button onClick={handleSaveDraft} className="flex items-center gap-1.5 px-4 py-2 rounded-full border" style={{ fontSize: 12.5, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
          Save draft
        </button>
        <button onClick={() => { save('in-review'); setSubmitted(true); }} className="px-4 py-2 rounded-full text-white" style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 600 }}>
          Submit for review
        </button>
      </div>

      {mode === 'preview' ? (
        <div className="flex-1 min-h-0">
          <FlashcardStudy cards={localCards} direction={direction} storageKey={savedId.current || initialId || undefined} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-6 max-w-2xl mx-auto w-full">
          <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 12, lineHeight: 1.5 }}>
            Edit cards by hand, use <strong>Ask AI</strong>, add hints, or add more cards. Switch to Student preview to study them.
          </p>
          {localCards.map((c, i) => {
            const id = c.id || `c-${i}`;
            return (
              <div key={id} className="mb-3 rounded-2xl border overflow-hidden" style={{ background: 'rgba(255,255,255,0.88)', borderColor: 'rgba(0,0,0,0.08)' }}>
                <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.5)' }}>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#F3F4F6', color: '#374151' }}>Card {i + 1}</span>
                    {c.hint && <span className="px-2 py-0.5 rounded text-xs" style={{ background: '#EFF6FF', color: '#2563EB' }}>hint</span>}
                    {c.imageUrl && <span className="px-2 py-0.5 rounded text-xs" style={{ background: '#ECFDF5', color: '#059669' }}>image</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setAiId(aiId === id ? null : id); setEditId(null); }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs"
                      style={{ color: '#D97706', background: aiId === id ? '#FEF3C7' : 'transparent' }}>
                      <Sparkles size={11} />Ask AI
                    </button>
                    <button onClick={() => { setEditId(editId === id ? null : id); setAiId(null); }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs"
                      style={{ color: '#2563EB', background: editId === id ? '#EFF6FF' : 'transparent' }}>
                      ✎ Edit
                    </button>
                    <button onClick={() => { if (i > 0) setLocalCards((p) => { const n = [...p]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; }); }}
                      disabled={i === 0} className="px-1 text-sm" style={{ color: i === 0 ? '#E5E7EB' : '#6B7280' }}>↑</button>
                    <button onClick={() => { if (i < localCards.length - 1) setLocalCards((p) => { const n = [...p]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; return n; }); }}
                      disabled={i === localCards.length - 1} className="px-1 text-sm" style={{ color: i === localCards.length - 1 ? '#E5E7EB' : '#6B7280' }}>↓</button>
                    <button onClick={() => setLocalCards((p) => p.filter((x) => (x.id || '') !== id))}><Trash2 size={12} style={{ color: '#EF4444' }} /></button>
                  </div>
                </div>
                <div className="p-4">
                  {editId === id ? (
                    <div className="space-y-2.5">
                      <div>
                        <label style={lbl}>Front (prompt)</label>
                        <textarea value={c.front} onChange={(e) => updateCard(id, { front: e.target.value })} rows={2}
                          className="w-full rounded-xl px-3 py-2 resize-y" style={field} />
                      </div>
                      <div>
                        <label style={lbl}>Back (answer)</label>
                        <textarea value={c.back} onChange={(e) => updateCard(id, { back: e.target.value })} rows={2}
                          className="w-full rounded-xl px-3 py-2 resize-y" style={field} />
                      </div>
                      <div>
                        <label style={lbl}>Hint (optional — learner can reveal)</label>
                        <input value={c.hint || ''} onChange={(e) => updateCard(id, { hint: e.target.value })}
                          placeholder="Short cue without the full answer"
                          className="w-full rounded-xl px-3 py-2" style={field} />
                      </div>
                      <div>
                        <label style={lbl}>Memory hook (optional)</label>
                        <input value={c.hook || ''} onChange={(e) => updateCard(id, { hook: e.target.value })}
                          className="w-full rounded-xl px-3 py-2" style={field} />
                      </div>
                      {c.imageUrl && (
                        <img src={c.imageUrl} alt="" style={{ maxHeight: 120, borderRadius: 10, objectFit: 'contain' }} />
                      )}
                    </div>
                  ) : aiId === id ? (
                    <AskAiCard card={c} onApply={(patch) => updateCard(id, patch)} onClose={() => setAiId(null)} />
                  ) : (
                    <div>
                      {c.imageUrl && (
                        <img src={c.imageUrl} alt="" style={{ maxHeight: 100, borderRadius: 10, objectFit: 'contain', marginBottom: 8 }} />
                      )}
                      <p style={{ fontSize: 13.5, fontWeight: 600, color: '#0B1220', marginBottom: 4 }}>{c.front || '(empty front)'}</p>
                      <p style={{ fontSize: 13, color: '#374151' }}>{c.back || '(empty back)'}</p>
                      {c.hint && <p style={{ fontSize: 12, color: '#2563EB', marginTop: 8 }}>Hint: {c.hint}</p>}
                      {c.hook && <p style={{ fontSize: 12, color: '#7C3AED', marginTop: 4, fontStyle: 'italic' }}>💡 {c.hook}</p>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <button onClick={addCard}
            className="w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl border-2 border-dashed"
            style={{ borderColor: 'rgba(0,0,0,0.12)', fontSize: 13, fontWeight: 600, color: '#0B1220', background: 'rgba(255,255,255,0.6)' }}>
            <Plus size={14} />Add card
          </button>
        </div>
      )}
    </div>
  );
}
