import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, MessageCircle, FileText, HelpCircle, Check, X, Send, Loader2 } from 'lucide-react';
import { askAboutVideo, errorMessage } from '../../../lib/api';
import type {
  LearningObject, QuestionContent, VideoScriptContent, VideoScriptCheckpoint, VideoScriptTranscriptSegment,
} from '../../../lib/types';

function parseYtId(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    return u.searchParams.get('v') || '';
  } catch {
    const m = String(url || '').match(/(?:v=|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    return m?.[1] || '';
  }
}

function loadYouTubeApi(): Promise<void> {
  return new Promise((resolve) => {
    const w = window as any;
    if (w.YT?.Player) { resolve(); return; }
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
  });
}

function fmtClock(s: number): string {
  const n = Math.max(0, Math.floor(s));
  const m = Math.floor(n / 60);
  const r = n % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

type SideTab = 'question' | 'transcript' | 'chat';

function CheckpointQuestion({
  checkpoint,
  onContinue,
}: {
  checkpoint: VideoScriptCheckpoint;
  onContinue: () => void;
}) {
  const q = checkpoint.question;
  const [picked, setPicked] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setPicked(null);
    setSubmitted(false);
  }, [checkpoint.id]);

  const submit = () => {
    if (picked == null) return;
    setSubmitted(true);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: '#059669' }}>
          <HelpCircle size={14} />
        </div>
        <div>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: '#059669', letterSpacing: '.04em' }}>CHECKPOINT</p>
          <p style={{ fontSize: 12, color: '#9AA3AF' }}>Answer to continue watching</p>
        </div>
      </div>
      <p style={{ fontSize: 15, fontWeight: 650, color: '#0B1220', lineHeight: 1.45, marginBottom: 14 }}>
        {q.question}
      </p>
      <div className="space-y-2 flex-1 overflow-y-auto">
        {(q.options || []).map((opt, i) => {
          const isPick = picked === i;
          const isCorrect = submitted && i === (q.correct ?? 0);
          const isWrong = submitted && isPick && !isCorrect;
          return (
            <button
              key={i}
              type="button"
              disabled={submitted}
              onClick={() => setPicked(i)}
              className="w-full flex items-start gap-2.5 text-left px-3 py-2.5 rounded-xl border transition-all"
              style={{
                background: isCorrect ? 'rgba(5,150,105,0.1)' : isWrong ? 'rgba(185,28,28,0.08)' : isPick ? 'rgba(11,15,26,0.04)' : '#fff',
                borderColor: isCorrect ? '#059669' : isWrong ? '#B91C1C' : isPick ? '#0B0F1A' : 'rgba(0,0,0,0.1)',
              }}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{
                  background: isCorrect ? '#059669' : isWrong ? '#B91C1C' : isPick ? '#0B0F1A' : 'rgba(0,0,0,0.06)',
                  color: isCorrect || isWrong || isPick ? '#fff' : '#6B7280',
                  fontSize: 11, fontWeight: 700,
                }}>
                {isCorrect ? <Check size={11} /> : isWrong ? <X size={11} /> : String.fromCharCode(65 + i)}
              </span>
              <span style={{ fontSize: 13.5, color: '#0B1220', lineHeight: 1.4 }}>{opt}</span>
            </button>
          );
        })}
      </div>
      {submitted && q.explanation && (
        <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 12, lineHeight: 1.5 }}>
          {q.explanation}
        </p>
      )}
      {!submitted ? (
        <button
          type="button"
          disabled={picked == null}
          onClick={submit}
          className="mt-4 w-full py-2.5 rounded-full text-white"
          style={{ background: picked == null ? '#E5E7EB' : '#0B0F1A', color: picked == null ? '#9AA3AF' : '#fff', fontSize: 13.5, fontWeight: 650 }}
        >
          Submit answer
        </button>
      ) : (
        <button
          type="button"
          onClick={onContinue}
          className="mt-4 w-full py-2.5 rounded-full text-white"
          style={{ background: '#059669', fontSize: 13.5, fontWeight: 650 }}
        >
          Continue video →
        </button>
      )}
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Renders chat markdown so learners see bold/lists — never raw asterisks. */
function ChatBody({ text, dark }: { text: string; dark?: boolean }) {
  const html = (() => {
    let s = escapeHtml(text || '');
    // Strip leftover unpaired emphasis markers after converting pairs.
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/\*\*/g, '').replace(/(^|[\s(])\*([^*\n]+)/g, '$1$2');
    s = s.replace(/(?:^|\n)((?:[-•]\s+.+(?:\n|$))+)/g, (block) => {
      const items = block
        .trim()
        .split('\n')
        .map((line) => line.replace(/^[-•]\s+/, '').trim())
        .filter(Boolean)
        .map((item) => `<li style="margin:0 0 5px">${item}</li>`)
        .join('');
      return `<ul style="margin:8px 0 2px;padding-left:18px;list-style:disc">${items}</ul>`;
    });
    s = s.replace(/\n{2,}/g, '<br/><br/>').replace(/\n/g, '<br/>');
    return s;
  })();

  return (
    <div
      style={{ fontSize: 13.5, lineHeight: 1.55, color: dark ? '#fff' : '#0B1220' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function fallbackTimestamps(
  question: string,
  reply: string,
  transcript: VideoScriptTranscriptSegment[],
  currentTime: number,
): number[] {
  if (!transcript.length) return Number.isFinite(currentTime) ? [Math.max(0, currentTime)] : [];
  const words = `${question} ${reply}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);
  let best = transcript[0];
  let bestScore = -1;
  for (const seg of transcript) {
    const t = (seg.text || '').toLowerCase();
    let score = 0;
    for (const w of words) if (t.includes(w)) score += 1;
    // Slight preference for nearby playback position
    const dist = Math.abs((seg.start || 0) - (currentTime || 0));
    score -= dist / 600;
    if (score > bestScore) { bestScore = score; best = seg; }
  }
  return [Math.round((best?.start || 0) * 10) / 10];
}

type ChatMsg = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamps?: number[];
};

function VideoChat({
  obj,
  contextExtra,
  currentTime,
  transcript,
  onSeek,
  seekDisabled,
}: {
  obj: LearningObject;
  contextExtra: string;
  currentTime: number;
  transcript: VideoScriptTranscriptSegment[];
  onSeek: (t: number) => void;
  seekDisabled?: boolean;
}) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setErr(null);
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: 'user', content: text };
    setMsgs((p) => [...p, userMsg]);
    setBusy(true);
    try {
      const history = [...msgs, userMsg].slice(-8).map((m) => ({ role: m.role, content: m.content }));
      const { reply, timestamps } = await askAboutVideo({
        title: obj.title,
        context: contextExtra,
        message: text,
        currentTime,
        history,
      });
      const refs = timestamps.length
        ? timestamps
        : fallbackTimestamps(text, reply, transcript, currentTime);
      setMsgs((p) => [...p, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: reply,
        timestamps: refs,
      }]);
    } catch (e) {
      setErr(errorMessage(e, 'Could not answer that.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 10, lineHeight: 1.45 }}>
        Ask about this video — answers stay grounded in the transcript. Tap a time to jump there.
      </p>
      <div className="flex-1 overflow-y-auto space-y-3 mb-3 min-h-[160px]">
        {msgs.length === 0 && (
          <p style={{ fontSize: 13, color: '#9AA3AF' }}>Try: “What was the main idea just explained?”</p>
        )}
        {msgs.map((m) => (
          <div
            key={m.id}
            style={{
              marginLeft: m.role === 'user' ? 28 : 0,
              marginRight: m.role === 'assistant' ? 12 : 0,
            }}
          >
            <div
              className="px-3.5 py-2.5 rounded-2xl"
              style={{
                background: m.role === 'user' ? '#0B0F1A' : 'rgba(0,0,0,0.04)',
                border: m.role === 'assistant' ? '1px solid rgba(0,0,0,0.06)' : 'none',
              }}
            >
              {m.role === 'user'
                ? <p style={{ fontSize: 13.5, lineHeight: 1.5, color: '#fff', margin: 0 }}>{m.content}</p>
                : <ChatBody text={m.content} />}
            </div>
            {m.role === 'assistant' && (m.timestamps || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5 px-0.5">
                <span style={{ fontSize: 11, color: '#9AA3AF', alignSelf: 'center' }}>In video:</span>
                {m.timestamps!.map((t) => (
                  <button
                    key={`${m.id}-${t}`}
                    type="button"
                    disabled={seekDisabled}
                    onClick={() => onSeek(t)}
                    className="px-2 py-0.5 rounded-full transition-colors"
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      background: seekDisabled ? 'rgba(0,0,0,0.04)' : 'rgba(37,99,235,0.1)',
                      color: seekDisabled ? '#9AA3AF' : '#2563EB',
                      border: '1px solid rgba(37,99,235,0.2)',
                      cursor: seekDisabled ? 'default' : 'pointer',
                    }}
                    title={`Jump to ${fmtClock(t)}`}
                  >
                    ▶ {fmtClock(t)}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: '#9AA3AF' }}>
            <Loader2 size={12} className="animate-spin" /> Thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {err && <p style={{ fontSize: 12, color: '#B91C1C', marginBottom: 6 }}>{err}</p>}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
          placeholder="Ask about the video…"
          className="flex-1 rounded-xl px-3 py-2 outline-none"
          style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', background: '#fff' }}
        />
        <button type="button" onClick={() => void send()} disabled={busy || !input.trim()}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
          style={{ background: busy || !input.trim() ? '#E5E7EB' : '#0B0F1A' }}>
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

export function VideoScriptPlayer({
  content,
  object,
}: {
  content: VideoScriptContent;
  object: LearningObject;
}) {
  const id = content.videoId || parseYtId(content.videoUrl);
  const checkpoints = useMemo(
    () => [...(content.checkpoints || [])].sort((a, b) => a.time - b.time),
    [content.checkpoints],
  );
  const showTranscript = content.showTranscript !== false;
  const enableChat = content.enableChat !== false;
  const requireAnswer = content.requireAnswer !== false;

  const holderRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [duration, setDuration] = useState(0);
  const [cleared, setCleared] = useState<Set<string>>(() => new Set());
  const clearedRef = useRef<Set<string>>(new Set());
  const [activeCp, setActiveCp] = useState<VideoScriptCheckpoint | null>(null);
  const [tab, setTab] = useState<SideTab>(showTranscript ? 'transcript' : enableChat ? 'chat' : 'question');
  const firingRef = useRef<string | null>(null);

  const chatContext = useMemo(() => {
    const lines = [
      `Title: ${object.title}`,
      `Type: video-script`,
      `Video: ${content.videoUrl}`,
      '',
      '--- Transcript ---',
      ...(content.transcript || []).map((s) => `[${fmtClock(s.start)}] ${s.text}`),
      '',
      '--- Checkpoint questions ---',
      ...checkpoints.map((c, i) => {
        const q = c.question;
        return `Checkpoint ${i + 1} @ ${fmtClock(c.time)}\nQ: ${q.question}\nOptions: ${(q.options || []).join(' | ')}\nAnswer: ${(q.options || [])[q.correct ?? 0] || ''}\n${q.explanation || ''}`;
      }),
    ];
    return lines.join('\n');
  }, [object.title, content.videoUrl, content.transcript, checkpoints]);

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
          controls: 0, disablekb: 1, rel: 0, modestbranding: 1,
          playsinline: 1, iv_load_policy: 3, fs: 0,
        },
        events: {
          onReady: (e: any) => {
            const frame = e.target.getIframe?.();
            if (frame) {
              frame.style.position = 'absolute';
              frame.style.inset = '0';
              frame.style.width = '100%';
              frame.style.height = '100%';
              frame.style.border = '0';
              frame.style.pointerEvents = 'none';
            }
            const d = e.target.getDuration?.();
            if (d) setDuration(d);
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

  useEffect(() => {
    if (!ready) return;
    const loop = () => {
      const p = playerRef.current;
      if (p?.getCurrentTime) {
        const t = p.getCurrentTime();
        setPos(t);
        if (!activeCp && requireAnswer) {
          const next = checkpoints.find((c) => !clearedRef.current.has(c.id) && t >= c.time - 0.15);
          if (next && firingRef.current !== next.id) {
            firingRef.current = next.id;
            try { p.pauseVideo(); } catch { /* noop */ }
            setActiveCp(next);
            setTab('question');
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [ready, checkpoints, cleared, activeCp, requireAnswer]);

  const maxSeekable = () => {
    if (!requireAnswer) return duration || Infinity;
    const next = checkpoints.find((c) => !cleared.has(c.id));
    return next ? next.time : (duration || Infinity);
  };

  const toggle = () => {
    const p = playerRef.current;
    if (!p || activeCp) return;
    if (playing) p.pauseVideo();
    else p.playVideo();
  };

  const seekTo = (t: number) => {
    const p = playerRef.current;
    if (!p || activeCp) return;
    const capped = Math.min(Math.max(0, t), maxSeekable());
    p.seekTo(capped, true);
    setPos(capped);
  };

  const completeCheckpoint = () => {
    if (!activeCp) return;
    const idDone = activeCp.id;
    const resumeAt = activeCp.time + 0.4;
    const nextCleared = new Set([...clearedRef.current, idDone]);
    clearedRef.current = nextCleared;
    setCleared(nextCleared);
    firingRef.current = null;
    setActiveCp(null);
    if (showTranscript) setTab('transcript');
    else if (enableChat) setTab('chat');
    const p = playerRef.current;
    try {
      p?.seekTo(resumeAt, true);
      p?.playVideo();
    } catch { /* noop */ }
  };

  if (!id) {
    return (
      <div className="rounded-2xl p-6 text-center" style={{ background: 'rgba(0,0,0,0.04)' }}>
        <p style={{ fontSize: 13.5, color: '#6B7280' }}>No video URL on this video script.</p>
      </div>
    );
  }

  const pct = duration > 0 ? Math.min(100, (pos / duration) * 100) : 0;
  const tabs: { id: SideTab; label: string; icon: React.ReactNode; show: boolean }[] = [
    { id: 'question', label: 'Question', icon: <HelpCircle size={13} />, show: !!activeCp || checkpoints.length > 0 },
    { id: 'transcript', label: 'Transcript', icon: <FileText size={13} />, show: showTranscript },
    { id: 'chat', label: 'Chat', icon: <MessageCircle size={13} />, show: enableChat },
  ].filter((t) => t.show) as any;

  return (
    <div className="w-full">
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.9fr)]">
        {/* Video column */}
        <div>
          <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 18, overflow: 'hidden', background: '#000', boxShadow: '0 8px 28px -12px rgba(30,50,80,0.35)' }}>
            <div ref={holderRef} style={{ position: 'absolute', inset: 0 }} />
            {activeCp && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 3, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="px-4 py-3 rounded-2xl text-center" style={{ background: 'rgba(255,255,255,0.95)', maxWidth: 280 }}>
                  <HelpCircle size={22} style={{ color: '#059669', margin: '0 auto 6px' }} />
                  <p style={{ fontSize: 13.5, fontWeight: 650, color: '#0B1220' }}>Checkpoint — answer in the panel →</p>
                </div>
              </div>
            )}
            <button type="button" onClick={toggle} disabled={!!activeCp} aria-label={playing ? 'Pause' : 'Play'}
              style={{ position: 'absolute', inset: 0, background: 'transparent', border: 0, cursor: activeCp ? 'default' : 'pointer', zIndex: 1 }}>
              {!playing && !activeCp && (
                <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 58, height: 58, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Play size={24} fill="#fff" color="#fff" />
                </span>
              )}
            </button>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2, padding: '10px 12px', background: 'linear-gradient(transparent, rgba(0,0,0,0.65))' }}>
              <div className="flex items-center gap-2.5">
                <button type="button" onClick={toggle} disabled={!!activeCp}
                  style={{ background: 'transparent', border: 0, cursor: activeCp ? 'default' : 'pointer', padding: 0, opacity: activeCp ? 0.4 : 1 }}>
                  {playing ? <Pause size={16} fill="#fff" color="#fff" /> : <Play size={16} fill="#fff" color="#fff" />}
                </button>
                <div
                  onClick={(e) => {
                    if (activeCp || !duration) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    seekTo(((e.clientX - r.left) / r.width) * duration);
                  }}
                  style={{ flex: 1, height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.28)', position: 'relative', cursor: activeCp ? 'default' : 'pointer' }}
                >
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: '#3B82F6', borderRadius: 4 }} />
                  {checkpoints.map((c) => (
                    <div
                      key={c.id}
                      title={`Checkpoint @ ${fmtClock(c.time)}`}
                      style={{
                        position: 'absolute',
                        left: `${duration > 0 ? (c.time / duration) * 100 : 0}%`,
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 14, height: 14, borderRadius: '50%',
                        background: cleared.has(c.id) ? '#059669' : activeCp?.id === c.id ? '#F59E0B' : '#EF4444',
                        border: '2px solid #fff',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                        zIndex: 2,
                      }}
                    />
                  ))}
                </div>
                <span style={{ color: '#fff', fontSize: 11, fontVariantNumeric: 'tabular-nums', minWidth: 74, textAlign: 'right' }}>
                  {fmtClock(pos)} / {fmtClock(duration)}
                </span>
              </div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: '#9AA3AF', marginTop: 8 }}>
            {checkpoints.length} checkpoint{checkpoints.length !== 1 ? 's' : ''}
            {cleared.size > 0 ? ` · ${cleared.size} cleared` : ''}
            {requireAnswer ? ' · answer required to continue' : ''}
          </p>
        </div>

        {/* Sidebar */}
        <div className="rounded-[20px] border flex flex-col min-h-[360px] overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.92)', borderColor: 'rgba(0,0,0,0.08)', boxShadow: '0 4px 20px -10px rgba(30,50,80,0.15)' }}>
          <div className="flex border-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5"
                style={{
                  fontSize: 12.5, fontWeight: 650,
                  color: tab === t.id ? '#0B1220' : '#9AA3AF',
                  background: tab === t.id ? 'rgba(255,255,255,0.9)' : 'transparent',
                  borderBottom: tab === t.id ? '2px solid #0B0F1A' : '2px solid transparent',
                }}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            {tab === 'question' && (
              activeCp ? (
                <CheckpointQuestion
                  checkpoint={activeCp}
                  onContinue={completeCheckpoint}
                />
              ) : (
                <div className="text-center py-10">
                  <HelpCircle size={28} style={{ color: '#C4CBD4', margin: '0 auto 10px' }} />
                  <p style={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.5 }}>
                    Watch the video. When a checkpoint is reached, the video pauses and the question appears here.
                  </p>
                  <div className="mt-4 space-y-1.5 text-left">
                    {checkpoints.map((c, i) => (
                      <div key={c.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl"
                        style={{ background: cleared.has(c.id) ? 'rgba(5,150,105,0.08)' : 'rgba(0,0,0,0.03)' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: cleared.has(c.id) ? '#059669' : '#9AA3AF' }}>
                          {fmtClock(c.time)}
                        </span>
                        <span style={{ fontSize: 12.5, color: '#374151', flex: 1 }} className="truncate">
                          Q{i + 1}. {c.question.question}
                        </span>
                        {cleared.has(c.id) && <Check size={13} style={{ color: '#059669' }} />}
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
            {tab === 'transcript' && showTranscript && (
              <div className="space-y-1">
                {(content.transcript || []).length === 0 ? (
                  <p style={{ fontSize: 13, color: '#9AA3AF' }}>No transcript available for this video.</p>
                ) : (
                  (content.transcript || []).map((seg) => {
                    const on = pos >= seg.start && (seg.end == null || pos < seg.end);
                    return (
                      <button
                        key={seg.id}
                        type="button"
                        onClick={() => seekTo(seg.start)}
                        disabled={!!activeCp || seg.start > maxSeekable() + 0.05}
                        className="w-full text-left flex gap-2.5 px-2.5 py-2 rounded-xl transition-colors"
                        style={{
                          background: on ? 'rgba(59,130,246,0.1)' : 'transparent',
                          opacity: seg.start > maxSeekable() + 0.05 ? 0.4 : 1,
                        }}
                      >
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: on ? '#2563EB' : '#9AA3AF', fontVariantNumeric: 'tabular-nums', minWidth: 36 }}>
                          {fmtClock(seg.start)}
                        </span>
                        <span style={{ fontSize: 13, color: '#0B1220', lineHeight: 1.45 }}>{seg.text}</span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
            {tab === 'chat' && enableChat && (
              <VideoChat
                obj={object}
                contextExtra={chatContext}
                currentTime={pos}
                transcript={content.transcript || []}
                onSeek={seekTo}
                seekDisabled={!!activeCp}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Lightweight edit helpers for authoring checkpoint questions. */
export function emptyCheckpoint(time = 30): VideoScriptCheckpoint {
  return {
    id: `cp-${Date.now()}`,
    time,
    question: {
      question: '',
      type: 'multiple-choice',
      options: ['', '', '', ''],
      correct: 0,
      explanation: '',
    },
  };
}

export function patchCheckpointQuestion(
  cp: VideoScriptCheckpoint,
  patch: Partial<QuestionContent> & { time?: number },
): VideoScriptCheckpoint {
  const { time, ...qPatch } = patch;
  return {
    ...cp,
    time: time != null ? time : cp.time,
    question: { ...cp.question, ...qPatch },
  };
}
