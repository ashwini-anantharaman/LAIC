import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, BookOpen, Layers, Play, Pause } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../../App';
import { OBJECTS } from '../../../lib/data';
import type {
  Block, QuizContent, FlashcardSetContent, BridgePlayContent, BiddingSequenceContent,
  ImageContent, VideoEmbedContent, ConceptCardContent, SummaryContent, ReflectionContent,
  AssignmentContent, DrillContent,
} from '../../../lib/types';
import { FlashcardStudy, type StudyCard } from './FlashcardStudy';
import { AskAIChat } from './AskAIChat';
import { SummaryView, ReflectionView, AssignmentView, DrillView } from './StructuredObjectEditors';

function parseYtId(url: string): string {
  if (!url) return '';
  const m = url.match(/(?:youtu\.be\/|watch\?v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : /^[A-Za-z0-9_-]{11}$/.test(url) ? url : '';
}

function ImageBlock({ content }: { content: ImageContent }) {
  if (!content.url) return null;
  return (
    <figure style={{ margin: 0 }}>
      <img
        src={content.url}
        alt={content.alt || content.caption || ''}
        style={{ width: '100%', borderRadius: 18, display: 'block', boxShadow: '0 6px 24px -10px rgba(30,50,80,0.28)' }}
      />
      {content.caption && (
        <figcaption style={{ fontSize: 12.5, color: '#6B7280', textAlign: 'center', marginTop: 8, fontStyle: 'italic', lineHeight: 1.5 }}>
          {content.caption}
        </figcaption>
      )}
    </figure>
  );
}

/** Load the YouTube IFrame Player API once, resolving when it's ready. */
let ytApiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  const w = window as any;
  if (w.YT && w.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

function fmtClock(s: number): string {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/**
 * A truly CROPPED YouTube clip: the learner can only ever see [start, end].
 * We hide YouTube's native controls (no scrubber / keyboard seek), block
 * pointer events on the iframe, and drive playback through custom controls
 * whose timeline is clamped to the window. A rAF loop enforces the bounds
 * (re-seeks if the time ever drifts before start or past end).
 */
function VideoEmbed({ content }: { content: VideoEmbedContent }) {
  const id = content.videoId || parseYtId(content.url);
  const start = content.start && content.start > 0 ? Math.floor(content.start) : 0;
  const endRaw = content.end && content.end > start ? Math.floor(content.end) : undefined;

  const holderRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(start);
  const [end, setEnd] = useState<number | undefined>(endRaw);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    loadYouTubeApi().then(() => {
      if (cancelled || !holderRef.current) return;
      const YT = (window as any).YT;
      playerRef.current = new YT.Player(holderRef.current, {
        width: '100%',
        height: '100%',
        videoId: id,
        playerVars: {
          start, end: endRaw,
          controls: 0, disablekb: 1, rel: 0, modestbranding: 1,
          playsinline: 1, iv_load_policy: 3, fs: 0,
        },
        events: {
          onReady: (e: any) => {
            const frame = e.target.getIframe?.();
            if (frame) {
              frame.style.position = 'absolute'; frame.style.inset = '0';
              frame.style.width = '100%'; frame.style.height = '100%';
              frame.style.border = '0'; frame.style.pointerEvents = 'none';
            }
            if (endRaw == null) { const d = e.target.getDuration?.(); if (d) setEnd(Math.floor(d)); }
            e.target.seekTo(start, true);
            setReady(true);
          },
          onStateChange: (e: any) => {
            const YTns = (window as any).YT;
            setPlaying(e.data === YTns.PlayerState.PLAYING);
          },
        },
      });
    });
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try { playerRef.current?.destroy?.(); } catch { /* noop */ }
    };
  }, [id]);

  // Enforce the [start, end] window continuously.
  useEffect(() => {
    if (!ready) return;
    const loop = () => {
      const p = playerRef.current;
      if (p?.getCurrentTime) {
        let t = p.getCurrentTime();
        if (t < start - 0.4) { p.seekTo(start, true); t = start; }
        if (end != null && t >= end) { p.pauseVideo(); p.seekTo(start, true); t = start; }
        setPos(t);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [ready, start, end]);

  const toggle = () => {
    const p = playerRef.current;
    if (!p) return;
    if (playing) { p.pauseVideo(); return; }
    if (end != null && p.getCurrentTime() >= end - 0.2) p.seekTo(start, true);
    p.playVideo();
  };

  const seekFrac = (frac: number) => {
    const p = playerRef.current;
    if (!p || end == null) return;
    const target = start + Math.max(0, Math.min(1, frac)) * (end - start);
    p.seekTo(target, true);
    setPos(target);
  };

  if (!id) return null;

  const dur = (end ?? start) - start;
  const rel = Math.max(0, Math.min(dur, pos - start));
  const pct = dur > 0 ? (rel / dur) * 100 : 0;

  return (
    <figure style={{ margin: 0 }}>
      <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 18, overflow: 'hidden', boxShadow: '0 6px 24px -10px rgba(30,50,80,0.28)', background: '#000' }}>
        <div ref={holderRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

        {/* click-anywhere to play/pause (native controls are hidden) */}
        <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}
          style={{ position: 'absolute', inset: 0, background: 'transparent', border: 0, cursor: 'pointer', zIndex: 1 }}>
          {!playing && (
            <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 58, height: 58, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Play size={24} fill="#fff" color="#fff" />
            </span>
          )}
        </button>

        {/* custom control bar — timeline clamped to the clip window */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, background: 'linear-gradient(transparent, rgba(0,0,0,0.6))' }}>
          <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}
            style={{ background: 'transparent', border: 0, cursor: 'pointer', display: 'flex', padding: 0 }}>
            {playing ? <Pause size={16} fill="#fff" color="#fff" /> : <Play size={16} fill="#fff" color="#fff" />}
          </button>
          <div
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seekFrac((e.clientX - r.left) / r.width); }}
            style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.3)', position: 'relative', cursor: end != null ? 'pointer' : 'default' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: '#fff', borderRadius: 3 }} />
          </div>
          <span style={{ color: '#fff', fontSize: 11, fontVariantNumeric: 'tabular-nums', minWidth: 74, textAlign: 'right' }}>
            {fmtClock(rel)} / {fmtClock(dur)}
          </span>
        </div>
      </div>
      {content.caption && (
        <figcaption style={{ fontSize: 12.5, color: '#6B7280', textAlign: 'center', marginTop: 8, fontStyle: 'italic', lineHeight: 1.5 }}>
          {content.caption}
        </figcaption>
      )}
    </figure>
  );
}

function RichText({ text }: { text: string }) {
  const html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^## (.+)$/gm, '<h3 style="font-size:17px;font-weight:700;color:#0B1220;margin:20px 0 8px;letter-spacing:-0.3px">$1</h3>')
    .replace(/\n\n/g, '<br/><br/>');
  return <div style={{ fontSize: 14.5, lineHeight: 1.72, color: '#374151' }} dangerouslySetInnerHTML={{ __html: html }} />;
}

function ViewBlock({ label, children, tone = 'green' }: { label: string; children: React.ReactNode; tone?: 'green' | 'blue' | 'amber' | 'rose' }) {
  const colors = {
    green: { bg: 'rgba(5,150,105,0.06)', border: 'rgba(5,150,105,0.15)', label: '#059669' },
    blue: { bg: 'rgba(37,99,235,0.06)', border: 'rgba(37,99,235,0.15)', label: '#2563EB' },
    amber: { bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.2)', label: '#D97706' },
    rose: { bg: 'rgba(220,38,38,0.06)', border: 'rgba(220,38,38,0.15)', label: '#DC2626' },
  }[tone];
  return (
    <div className="rounded-[22px] p-5" style={{ background: colors.bg, border: `1.5px solid ${colors.border}` }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: colors.label, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</p>
      <div style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

/** Learner + teacher-preview concept card — tabs follow Define Include, not leftover fields. */
export function ConceptCardView({ content }: { content: ConceptCardContent }) {
  type V = 'definition' | 'analogy' | 'example' | 'visual' | 'misconception';
  const [view, setView] = useState<V>('definition');
  const included = content.includedViews?.length
    ? content.includedViews
    : ([
        content.definition ? 'definition' : null,
        content.analogy ? 'analogy' : null,
        content.example ? 'example' : null,
        content.visualSuggestion ? 'visual' : null,
        content.misconception ? 'misconception' : null,
      ].filter(Boolean) as V[]);

  const tabs: { id: V; label: string }[] = [
    { id: 'definition', label: 'Definition' },
    { id: 'analogy', label: 'Analogy' },
    { id: 'example', label: 'Example' },
    { id: 'visual', label: 'Visual' },
    { id: 'misconception', label: 'Watch out' },
  ].filter((t) => included.includes(t.id));

  const active = tabs.some((t) => t.id === view) ? view : (tabs[0]?.id || 'definition');
  const cite = (k: V) => content.citations?.[k];

  const body = (text: string, citation?: string) => (
    <>
      <div>{text}</div>
      {citation && (
        <p style={{ fontSize: 11, color: '#9AA3AF', marginTop: 10 }}>Source: {citation}</p>
      )}
    </>
  );

  return (
    <div className="space-y-3">
      <div>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#059669', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Concept</p>
        <h2 style={{ fontSize: 20, fontWeight: 750, color: '#0B1220', letterSpacing: '-0.3px', marginBottom: 4 }}>{content.term}</h2>
        {(content.voice || content.length) && (
          <p style={{ fontSize: 12, color: '#9AA3AF' }}>
            {[content.voice, content.length ? `${content.length} length` : ''].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setView(t.id)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                background: active === t.id ? '#0B0F1A' : 'rgba(255,255,255,0.85)',
                color: active === t.id ? '#fff' : '#374151',
                border: `1px solid ${active === t.id ? '#0B0F1A' : 'rgba(0,0,0,0.08)'}`,
              }}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      {active === 'definition' && (
        <ViewBlock label="Definition">{body(content.definition, cite('definition'))}</ViewBlock>
      )}
      {active === 'analogy' && (
        <ViewBlock label="Everyday analogy" tone="blue">{body(content.analogy || '', cite('analogy'))}</ViewBlock>
      )}
      {active === 'example' && (
        <ViewBlock label="Worked example" tone="amber">{body(content.example || '', cite('example'))}</ViewBlock>
      )}
      {active === 'visual' && (
        <ViewBlock label="Visual suggestion" tone="blue">{body(content.visualSuggestion || '', cite('visual'))}</ViewBlock>
      )}
      {active === 'misconception' && (
        <ViewBlock label="Common misconception" tone="rose">{body(content.misconception || '', cite('misconception'))}</ViewBlock>
      )}
    </div>
  );
}

function isQuestionCorrect(q: QuizContent['questions'][0], answer: unknown): boolean {
  if (q.type === 'short-answer') {
    const typed = String(answer ?? '').trim().toLowerCase();
    const sample = String(q.sampleAnswer || '').trim().toLowerCase();
    if (!typed || !sample) return false;
    return typed === sample || sample.includes(typed) || typed.includes(sample);
  }
  if (q.type === 'multi-select') {
    const chosen = Array.isArray(answer) ? [...answer].map(Number).sort((a, b) => a - b) : [];
    const need = [...(q.correctIndices || [])].map(Number).sort((a, b) => a - b);
    return chosen.length === need.length && chosen.every((v, i) => v === need[i]);
  }
  return Number(answer) === Number(q.correct);
}

function shouldShowExplanation(
  show: string | undefined,
  { submitted, answered }: { submitted: boolean; answered: boolean },
): boolean {
  const mode = show || 'After attempt';
  if (mode === 'Never') return false;
  if (mode === 'Immediately') return answered;
  // After attempt / After completion
  return submitted;
}

function diffRank(d?: string) {
  const x = String(d || 'medium').toLowerCase();
  if (x === 'easy') return 0;
  if (x === 'hard') return 2;
  return 1;
}

function pickAdaptiveStart(questions: QuizContent['questions']) {
  const mid = questions.findIndex((q) => diffRank(q.difficulty) === 1);
  if (mid >= 0) return mid;
  const easy = questions.findIndex((q) => diffRank(q.difficulty) === 0);
  return easy >= 0 ? easy : 0;
}

function pickAdaptiveNext(
  questions: QuizContent['questions'],
  used: Set<number>,
  lastCorrect: boolean,
  lastDiff: number,
): number | null {
  const unused = questions.map((_, i) => i).filter((i) => !used.has(i));
  if (!unused.length) return null;
  const target = lastCorrect ? Math.min(2, lastDiff + 1) : Math.max(0, lastDiff - 1);
  unused.sort((a, b) => Math.abs(diffRank(questions[a].difficulty) - target) - Math.abs(diffRank(questions[b].difficulty) - target));
  return unused[0];
}

function hasAnswer(a: unknown) {
  if (typeof a === 'string') return a.trim().length > 0;
  if (Array.isArray(a)) return a.length > 0;
  return a !== undefined;
}

export function QuizBlock({ content }: { content: QuizContent }) {
  const questions = content.questions || [];
  const adaptive = !!content.adaptive;
  const passMark = typeof content.passMark === 'number' ? content.passMark : 70;
  const showMode = content.showExplanations || 'After attempt';

  const [answers, setAnswers] = useState<Record<number, number | number[] | string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [path, setPath] = useState<number[]>(() => (adaptive && questions.length ? [pickAdaptiveStart(questions)] : []));
  const [locked, setLocked] = useState(false); // current adaptive item checked
  const [hintOpen, setHintOpen] = useState<Record<number, boolean>>({});

  const currentQi = adaptive ? path[path.length - 1] : -1;

  const scoredPath = (adaptive ? path : questions.map((_, i) => i))
    .filter((qi) => hasAnswer(answers[qi]));
  const correctCount = scoredPath.filter((qi) => isQuestionCorrect(questions[qi], answers[qi])).length;
  const attempted = scoredPath.length;
  const pct = attempted ? Math.round((correctCount / attempted) * 100) : 0;
  const passed = pct >= passMark;

  const answeredCount = questions.filter((_, qi) => hasAnswer(answers[qi])).length;

  const toggleMulti = (qi: number, oi: number) => {
    setAnswers((prev) => {
      const cur = Array.isArray(prev[qi]) ? [...(prev[qi] as number[])] : [];
      const next = cur.includes(oi) ? cur.filter((x) => x !== oi) : [...cur, oi];
      return { ...prev, [qi]: next };
    });
  };

  const renderQuestion = (q: QuizContent['questions'][0], qi: number, opts: { reveal: boolean; showExp: boolean; disabled: boolean; label: string }) => {
    const options = q.options || [];
    return (
      <div key={qi} className="rounded-[22px] p-5" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <p style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF' }}>{opts.label}</p>
          {q.type && q.type !== 'multiple-choice' && (
            <span className="px-2 py-0.5 rounded-full" style={{ fontSize: 10.5, fontWeight: 600, background: '#F3F4F6', color: '#6B7280' }}>{q.type}</span>
          )}
          {q.cognitiveLevel && (
            <span className="px-2 py-0.5 rounded-full" style={{ fontSize: 10.5, fontWeight: 600, background: 'rgba(37,99,235,0.08)', color: '#2563EB' }}>{q.cognitiveLevel}</span>
          )}
          {adaptive && q.difficulty && (
            <span className="px-2 py-0.5 rounded-full" style={{ fontSize: 10.5, fontWeight: 600, background: 'rgba(217,119,6,0.1)', color: '#D97706' }}>{q.difficulty}</span>
          )}
        </div>
        <p style={{ fontSize: 14.5, fontWeight: 600, color: '#0B1220', marginBottom: 14, lineHeight: 1.4 }}>{q.question}</p>

        {q.type === 'short-answer' ? (
          <input
            value={typeof answers[qi] === 'string' ? String(answers[qi]) : ''}
            disabled={opts.disabled}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [qi]: e.target.value }))}
            placeholder="Type your answer…"
            className="w-full rounded-xl px-4 py-2.5"
            style={{ fontSize: 13.5, border: '1px solid rgba(0,0,0,0.1)', outline: 'none', background: 'rgba(0,0,0,0.03)' }}
          />
        ) : (
          <div className="space-y-2">
            {options.map((opt, oi) => {
              const multi = q.type === 'multi-select';
              const chosen = multi
                ? Array.isArray(answers[qi]) && (answers[qi] as number[]).includes(oi)
                : answers[qi] === oi;
              const isRight = multi ? (q.correctIndices || []).includes(oi) : oi === q.correct;
              const correct = opts.reveal && isRight;
              const wrong = opts.reveal && chosen && !isRight;
              return (
                <button
                  key={oi}
                  disabled={opts.disabled}
                  onClick={() => multi ? toggleMulti(qi, oi) : setAnswers((prev) => ({ ...prev, [qi]: oi }))}
                  className="w-full text-left px-4 py-2.5 rounded-xl transition-all"
                  style={{
                    fontSize: 13.5,
                    background: correct ? 'rgba(5,150,105,0.1)' : wrong ? 'rgba(239,68,68,0.08)' : chosen ? 'rgba(11,15,26,0.07)' : 'rgba(0,0,0,0.04)',
                    border: correct ? '1.5px solid rgba(5,150,105,0.3)' : wrong ? '1.5px solid rgba(239,68,68,0.25)' : chosen ? '1.5px solid rgba(11,15,26,0.15)' : '1.5px solid transparent',
                    color: '#0B1220',
                    fontWeight: chosen ? 600 : 400,
                  }}
                >
                  {multi ? (chosen ? '☑ ' : '☐ ') : ''}{opt}
                </button>
              );
            })}
          </div>
        )}

        {q.hint && !opts.reveal && (
          <div className="mt-3">
            {!hintOpen[qi] ? (
              <button type="button" onClick={() => setHintOpen((p) => ({ ...p, [qi]: true }))}
                className="px-3 py-1.5 rounded-full border text-xs font-semibold"
                style={{ borderColor: 'rgba(37,99,235,0.25)', color: '#2563EB', background: 'rgba(37,99,235,0.06)' }}>
                Show hint
              </button>
            ) : (
              <p style={{ fontSize: 12.5, color: '#2563EB', lineHeight: 1.45 }}>Hint: {q.hint}</p>
            )}
          </div>
        )}
        {opts.reveal && q.type === 'short-answer' && q.sampleAnswer && (
          <p style={{ fontSize: 12.5, color: '#059669', marginTop: 10 }}>Sample answer: {q.sampleAnswer}</p>
        )}
        {opts.showExp && q.explanation && (
          <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 10, lineHeight: 1.5 }}>{q.explanation}</p>
        )}
      </div>
    );
  };

  const scoreBanner = submitted && (
    <div className="rounded-[22px] p-5 text-center" style={{
      background: passed ? 'rgba(5,150,105,0.08)' : 'rgba(239,68,68,0.06)',
      border: `1.5px solid ${passed ? 'rgba(5,150,105,0.25)' : 'rgba(239,68,68,0.2)'}`,
    }}>
      <p style={{ fontSize: 18, fontWeight: 750, color: '#0B1220', marginBottom: 4 }}>
        {pct}% · {correctCount}/{attempted || questions.length} correct
      </p>
      <p style={{ fontSize: 13.5, fontWeight: 600, color: passed ? '#059669' : '#DC2626' }}>
        {passed ? `Passed (mark ${passMark}%)` : `Not yet — need ${passMark}% to pass`}
      </p>
    </div>
  );

  if (adaptive) {
    const q = questions[currentQi];
    const answered = hasAnswer(answers[currentQi]);
    const reveal = locked || submitted;
    const showExp = shouldShowExplanation(showMode, { submitted: locked || submitted, answered }) && !!q?.explanation;

    const advance = () => {
      if (currentQi == null || currentQi < 0 || !q) return;
      const ok = isQuestionCorrect(q, answers[currentQi]);
      const used = new Set(path);
      const next = pickAdaptiveNext(questions, used, ok, diffRank(q.difficulty));
      if (next == null) {
        setSubmitted(true);
        return;
      }
      setPath((p) => [...p, next]);
      setLocked(false);
    };

    return (
      <div className="space-y-5">
        <p style={{ fontSize: 12.5, color: '#6B7280' }}>
          {content.purpose ? `${content.purpose} · ` : ''}Adaptive · Pass mark {passMark}%
          {!submitted && q ? ` · Question ${path.length} of ${questions.length}` : ''}
        </p>
        {!submitted && q && (
          <>
            {renderQuestion(q, currentQi, {
              reveal,
              showExp: !!showExp,
              disabled: locked || submitted,
              label: `Question ${path.length}`,
            })}
            {!locked && answered && (
              <button
                onClick={() => setLocked(true)}
                className="w-full py-3 rounded-full text-white"
                style={{ background: '#0B0F1A', fontSize: 14, fontWeight: 600 }}
              >
                Check answer
              </button>
            )}
            {locked && (
              <button
                onClick={advance}
                className="w-full py-3 rounded-full text-white"
                style={{ background: '#059669', fontSize: 14, fontWeight: 600 }}
              >
                {path.length >= questions.length ? 'See results' : 'Next question →'}
              </button>
            )}
          </>
        )}
        {scoreBanner}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p style={{ fontSize: 12.5, color: '#6B7280' }}>
        {content.purpose ? `${content.purpose} · ` : ''}Pass mark {passMark}%
      </p>
      {questions.map((q, qi) => {
        const answered = hasAnswer(answers[qi]);
        const showExp = shouldShowExplanation(showMode, { submitted, answered }) && !!q.explanation;
        const revealAnswers = submitted || (showMode === 'Immediately' && answered);
        return renderQuestion(q, qi, {
          reveal: revealAnswers,
          showExp: !!showExp,
          disabled: submitted,
          label: `Question ${qi + 1}`,
        });
      })}

      {!submitted && answeredCount > 0 && (
        <button
          onClick={() => setSubmitted(true)}
          className="w-full py-3 rounded-full text-white"
          style={{ background: '#0B0F1A', fontSize: 14, fontWeight: 600 }}
        >
          Submit answers
        </button>
      )}

      {scoreBanner}
    </div>
  );
}

function FlashcardSet({ content, objectId }: { content: FlashcardSetContent; objectId: string }) {
  const cards: StudyCard[] = (content.cards || []).map((c, i) => ({
    id: `fc-${i}`,
    front: c.front,
    back: c.back,
    hook: c.hook,
    hint: c.hint,
    imageUrl: c.imageUrl,
  }));
  return <FlashcardStudy cards={cards} direction={content.direction || 'Front→back'} storageKey={objectId} />;
}

function BridgePlay({ content }: { content: BridgePlayContent }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="rounded-[22px] p-5" style={{ background: '#F8FAF9', border: '1.5px solid rgba(5,150,105,0.15)' }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: '#059669', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Bridge Play</p>
      <p style={{ fontSize: 15, fontWeight: 700, color: '#0B1220', marginBottom: 4 }}>{content.title}</p>
      <p style={{ fontSize: 13.5, color: '#6B7280', marginBottom: 16, lineHeight: 1.5 }}>{content.description}</p>
      {/* Compass layout */}
      <div className="grid grid-cols-3 gap-2 mb-4" style={{ maxWidth: 260, margin: '0 auto 16px' }}>
        <div />
        <div className="flex flex-col items-center gap-1">
          <span style={{ fontSize: 10, color: '#9AA3AF', fontWeight: 600 }}>N</span>
          <div className="px-3 py-1.5 rounded-xl bg-white shadow-sm" style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{content.north}</div>
        </div>
        <div />
        <div className="flex items-center justify-end gap-1">
          <div className="px-3 py-1.5 rounded-xl bg-white shadow-sm" style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{content.west}</div>
          <span style={{ fontSize: 10, color: '#9AA3AF', fontWeight: 600 }}>W</span>
        </div>
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#059669', color: 'white', fontSize: 10, fontWeight: 700 }}>
            {content.trump}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span style={{ fontSize: 10, color: '#9AA3AF', fontWeight: 600 }}>E</span>
          <div className="px-3 py-1.5 rounded-xl bg-white shadow-sm" style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{content.east}</div>
        </div>
        <div />
        <div className="flex flex-col items-center gap-1">
          <p style={{ fontSize: 11.5, color: '#9AA3AF', marginBottom: 4 }}>Your hand (S)</p>
          <div className="flex gap-1.5">
            {content.south.map(card => (
              <button
                key={card}
                onClick={() => setSelected(card)}
                disabled={revealed}
                className="px-3 py-2 rounded-xl transition-all"
                style={{
                  background: selected === card ? '#0B0F1A' : 'white',
                  color: selected === card ? 'white' : '#374151',
                  fontSize: 14, fontWeight: 700,
                  boxShadow: selected === card ? 'none' : '0 2px 8px -3px rgba(30,50,80,0.15)',
                  border: revealed && card === content.correctAnswer ? '2px solid #059669' : '2px solid transparent',
                  transform: selected === card ? 'translateY(-4px)' : 'none',
                }}
              >{card}</button>
            ))}
          </div>
        </div>
        <div />
      </div>
      {selected && !revealed && (
        <button onClick={() => setRevealed(true)} className="w-full py-2.5 rounded-full text-white" style={{ background: '#0B0F1A', fontSize: 13.5, fontWeight: 600 }}>
          Play {selected}
        </button>
      )}
      {revealed && (
        <div className="rounded-2xl p-4" style={{ background: selected === content.correctAnswer ? 'rgba(5,150,105,0.08)' : 'rgba(239,68,68,0.06)', border: `1.5px solid ${selected === content.correctAnswer ? 'rgba(5,150,105,0.25)' : 'rgba(239,68,68,0.2)'}` }}>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: selected === content.correctAnswer ? '#059669' : '#DC2626', marginBottom: 4 }}>
            {selected === content.correctAnswer ? '✓ Correct!' : '✗ Not quite'}
          </p>
          <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.55 }}>{content.explanation}</p>
        </div>
      )}
    </div>
  );
}

function BiddingSequence({ content }: { content: BiddingSequenceContent }) {
  const [step, setStep] = useState(0);
  const visible = content.bids.slice(0, step + 1);

  return (
    <div className="rounded-[22px] p-5" style={{ background: '#F5F7FA', border: '1.5px solid rgba(0,0,0,0.07)' }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Bidding Sequence</p>
      <p style={{ fontSize: 15, fontWeight: 700, color: '#0B1220', marginBottom: 14 }}>{content.title}</p>
      <div className="grid grid-cols-4 gap-1 mb-4">
        {(['N', 'E', 'S', 'W'] as const).map(s => (
          <div key={s} className="text-center">
            <span style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF' }}>{s}</span>
          </div>
        ))}
        {Array.from({ length: Math.ceil(visible.length / 4) + 1 }).map((_, rowIdx) =>
          (['N', 'E', 'S', 'W'] as const).map((s, si) => {
            const bidIdx = rowIdx * 4 + si;
            const bid = content.bids[bidIdx];
            const isVisible = bidIdx < visible.length;
            return (
              <div key={`${rowIdx}-${s}`} className="text-center py-1.5">
                {isVisible && bid ? (
                  <span
                    className="inline-block px-2.5 py-1 rounded-lg"
                    style={{
                      fontSize: 13, fontWeight: 600,
                      background: bid.bid === 'Pass' ? 'rgba(0,0,0,0.05)' : '#0B0F1A',
                      color: bid.bid === 'Pass' ? '#9AA3AF' : 'white',
                    }}
                  >
                    {bid.bid}
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      {visible[visible.length - 1]?.explanation && (
        <p style={{ fontSize: 12.5, color: '#6B7280', fontStyle: 'italic', marginBottom: 12, lineHeight: 1.5 }}>
          {visible[visible.length - 1].explanation}
        </p>
      )}
      <div className="flex gap-2">
        {step < content.bids.length - 1 ? (
          <button onClick={() => setStep(s => s + 1)} className="px-4 py-2 rounded-full text-white" style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600 }}>
            Next bid →
          </button>
        ) : (
          <div className="px-4 py-2 rounded-full" style={{ background: 'rgba(5,150,105,0.1)', fontSize: 13, fontWeight: 600, color: '#059669' }}>
            Final: {content.finalContract}
          </div>
        )}
        {step > 0 && (
          <button onClick={() => setStep(0)} className="px-4 py-2 rounded-full" style={{ background: 'rgba(0,0,0,0.06)', fontSize: 13, color: '#374151' }}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function BlockRenderer({ block, objectId }: { block: Block; objectId: string }) {
  switch (block.type) {
    case 'rich-text':
      return <RichText text={(block.content as { text: string }).text} />;
    case 'concept-card':
      return <ConceptCardView content={block.content as ConceptCardContent} />;
    case 'quiz':
      return <QuizBlock content={block.content as QuizContent} />;
    case 'flashcard-set':
      return <FlashcardSet content={block.content as FlashcardSetContent} objectId={objectId} />;
    case 'bridge-play':
      return <BridgePlay content={block.content as BridgePlayContent} />;
    case 'bidding-sequence':
      return <BiddingSequence content={block.content as BiddingSequenceContent} />;
    case 'image':
      return <ImageBlock content={block.content as ImageContent} />;
    case 'video-embed':
      return <VideoEmbed content={block.content as VideoEmbedContent} />;
    case 'question': {
      const c = block.content as Parameters<typeof QuizBlock>[0]['content']['questions'][0];
      return <QuizBlock content={{ questions: [c] }} />;
    }
    case 'summary':
      return <SummaryView content={block.content as SummaryContent} />;
    case 'reflection':
      return <ReflectionView content={block.content as ReflectionContent} />;
    case 'assignment':
      return <AssignmentView content={block.content as AssignmentContent} />;
    case 'drill':
      return <DrillView content={block.content as DrillContent} />;
    default:
      return null;
  }
}

export function LearnerReader({ objectId }: { objectId: string }) {
  const { closeReader, createdObjects } = useApp();
  const obj = createdObjects.find(o => o.id === objectId) || OBJECTS.find(o => o.id === objectId);
  const [showAsk, setShowAsk] = useState(false);

  if (!obj) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.4 }}
      className="min-h-full"
    >
      {/* Reader header */}
      <div
        className="sticky top-0 z-10 px-5 py-3 flex items-center gap-3"
        style={{ background: 'rgba(242,245,248,0.85)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.5)' }}
      >
        <button
          onClick={closeReader}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-black/5"
          style={{ background: 'rgba(255,255,255,0.7)' }}
        >
          <ArrowLeft size={15} className="text-[#374151]" />
        </button>
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 14, fontWeight: 600, color: '#0B1220' }} className="truncate">{obj.title}</p>
          <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>{obj.estimatedTime} · {obj.type}</p>
        </div>
        <button
          onClick={() => setShowAsk(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all"
          style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.9)', fontSize: 12, fontWeight: 600, color: '#059669', boxShadow: '0 2px 8px -4px rgba(30,50,80,0.2)' }}
        >
          <img src="/owl-logo.png" alt="" style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }} />
          Ask AI
        </button>
      </div>

      {/* Content */}
      <div className="px-5 py-6 max-w-xl mx-auto space-y-5">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen size={13} style={{ color: '#9AA3AF' }} />
            <span style={{ fontSize: 11.5, color: '#9AA3AF', fontWeight: 500 }}>
              {obj.type === 'tutorial' ? 'Tutorial'
                : obj.type === 'flashcard-set' ? 'Flashcard set'
                  : obj.type === 'quiz' ? 'Quiz'
                    : obj.type === 'concept-card' ? 'Concept card'
                      : obj.type === 'summary' ? 'Summary'
                        : obj.type === 'reflection' ? 'Reflection'
                          : obj.type === 'assignment' ? 'Assignment'
                            : obj.type === 'drill' ? 'Drill'
                              : 'Lesson'}
            </span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 750, color: '#0B1220', letterSpacing: '-0.4px', lineHeight: 1.15, marginBottom: 6 }}>
            {obj.title}
          </h1>
          <p style={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.6 }}>{obj.description}</p>
        </motion.div>

        {obj.blocks.length > 0 ? (
          obj.blocks.map((block, i) => (
            <motion.div
              key={block.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 + i * 0.06 }}
            >
              <BlockRenderer block={block} objectId={obj.id} />
            </motion.div>
          ))
        ) : (
          <div className="flex flex-col items-center py-12 text-center">
            <Layers size={32} className="text-[#C4CBD4] mb-3" />
            <p style={{ fontSize: 14, color: '#9AA3AF' }}>Content blocks coming soon.</p>
          </div>
        )}

        <div className="h-8" />
      </div>

      <AskAIChat open={showAsk} onClose={() => setShowAsk(false)} obj={obj} />
    </motion.div>
  );
}
