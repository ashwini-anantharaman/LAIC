import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, MessageSquare, BookOpen, Layers, Play, Pause } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../../App';
import { OBJECTS } from '../../../lib/data';
import type { Block, QuizContent, FlashcardSetContent, BridgePlayContent, BiddingSequenceContent, ImageContent, VideoEmbedContent } from '../../../lib/types';
import { FlashcardStudy, type StudyCard } from './FlashcardStudy';

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

function ConceptCard({ content }: { content: { term: string; definition: string; example?: string } }) {
  return (
    <div className="rounded-[22px] p-5" style={{ background: 'rgba(5,150,105,0.06)', border: '1.5px solid rgba(5,150,105,0.15)' }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: '#059669', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Concept</p>
      <p style={{ fontSize: 16, fontWeight: 700, color: '#0B1220', marginBottom: 8, letterSpacing: '-0.2px' }}>{content.term}</p>
      <p style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.6, marginBottom: content.example ? 10 : 0 }}>{content.definition}</p>
      {content.example && (
        <p style={{ fontSize: 12.5, color: '#6B7280', fontStyle: 'italic', borderLeft: '2px solid #059669', paddingLeft: 10 }}>
          {content.example}
        </p>
      )}
    </div>
  );
}

function QuizBlock({ content }: { content: QuizContent }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="space-y-5">
      {content.questions.map((q, qi) => (
        <div key={qi} className="rounded-[22px] p-5" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', marginBottom: 6 }}>Question {qi + 1}</p>
          <p style={{ fontSize: 14.5, fontWeight: 600, color: '#0B1220', marginBottom: 14, lineHeight: 1.4 }}>{q.question}</p>
          <div className="space-y-2">
            {q.options.map((opt, oi) => {
              const chosen = answers[qi] === oi;
              const correct = submitted && oi === q.correct;
              const wrong = submitted && chosen && oi !== q.correct;
              return (
                <button
                  key={oi}
                  disabled={submitted}
                  onClick={() => setAnswers(prev => ({ ...prev, [qi]: oi }))}
                  className="w-full text-left px-4 py-2.5 rounded-xl transition-all"
                  style={{
                    fontSize: 13.5,
                    background: correct ? 'rgba(5,150,105,0.1)' : wrong ? 'rgba(239,68,68,0.08)' : chosen ? 'rgba(11,15,26,0.07)' : 'rgba(0,0,0,0.04)',
                    border: correct ? '1.5px solid rgba(5,150,105,0.3)' : wrong ? '1.5px solid rgba(239,68,68,0.25)' : '1.5px solid transparent',
                    color: '#0B1220',
                    fontWeight: chosen ? 600 : 400,
                  }}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {submitted && answers[qi] !== undefined && (
            <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 10, lineHeight: 1.5 }}>{q.explanation}</p>
          )}
        </div>
      ))}
      {!submitted && Object.keys(answers).length > 0 && (
        <button
          onClick={() => setSubmitted(true)}
          className="w-full py-3 rounded-full text-white"
          style={{ background: '#0B0F1A', fontSize: 14, fontWeight: 600 }}
        >
          Submit answers
        </button>
      )}
    </div>
  );
}

function FlashcardSet({ content }: { content: FlashcardSetContent }) {
  const cards: StudyCard[] = (content.cards || []).map((c, i) => ({
    id: `fc-${i}`,
    front: c.front,
    back: c.back,
    hook: c.hook,
  }));
  return <FlashcardStudy cards={cards} direction={content.direction || 'Front→back'} />;
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

function BlockRenderer({ block }: { block: Block }) {
  switch (block.type) {
    case 'rich-text':
      return <RichText text={(block.content as { text: string }).text} />;
    case 'concept-card':
      return <ConceptCard content={block.content as Parameters<typeof ConceptCard>[0]['content']} />;
    case 'quiz':
      return <QuizBlock content={block.content as QuizContent} />;
    case 'flashcard-set':
      return <FlashcardSet content={block.content as FlashcardSetContent} />;
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
          style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 600, color: '#059669' }}
        >
          <MessageSquare size={12} />
          Ask AI
        </button>
      </div>

      {/* Content */}
      <div className="px-5 py-6 max-w-xl mx-auto space-y-5">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen size={13} style={{ color: '#9AA3AF' }} />
            <span style={{ fontSize: 11.5, color: '#9AA3AF', fontWeight: 500 }}>Lesson</span>
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
              <BlockRenderer block={block} />
            </motion.div>
          ))
        ) : (
          <div className="flex flex-col items-center py-12 text-center">
            <Layers size={32} className="text-[#C4CBD4] mb-3" />
            <p style={{ fontSize: 14, color: '#9AA3AF' }}>Content blocks coming soon.</p>
          </div>
        )}

        {/* Ask AI panel */}
        <AnimatePresence>
          {showAsk && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="rounded-[22px] p-4"
              style={{ background: 'white', boxShadow: '0 8px 24px -8px rgba(30,50,80,0.12)' }}
            >
              <p style={{ fontSize: 13.5, fontWeight: 600, color: '#0B1220', marginBottom: 8 }}>Ask AI about this lesson</p>
              <input
                className="w-full px-3 py-2 rounded-xl outline-none"
                style={{ background: 'rgba(0,0,0,0.04)', fontSize: 13.5, color: '#0B1220' }}
                placeholder="e.g. What's the difference between ruffing and discarding?"
              />
              <button
                className="mt-3 w-full py-2.5 rounded-full text-white"
                style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600 }}
              >
                Ask
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="h-8" />
      </div>
    </motion.div>
  );
}
