import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, Eye, Loader2, Pencil, Sparkles } from 'lucide-react';
import { useApp } from '../../App';
import type {
  AssignmentContent, CreatorPipelineDraft, DrillContent, DrillItem,
  ReflectionContent, ReflectionPrompt, SummaryContent,
} from '../../../lib/types';
import { editStructuredObject, errorMessage, type StructuredObjectKind } from '../../../lib/api';

type Mode = 'edit' | 'preview';

const field: React.CSSProperties = {
  fontSize: 13, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.85)', outline: 'none',
};
const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 3, display: 'block' };

function EditorShell({
  title, setTitle, mode, setMode, onBack, onSaveDraft, onSubmit, savedNote, label, children,
}: {
  title: string; setTitle: (t: string) => void; mode: Mode; setMode: (m: Mode) => void;
  onBack: () => void; onSaveDraft: () => void; onSubmit: () => void; savedNote: boolean; label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="sticky top-0 z-20 flex items-center gap-3 px-5 py-3 border-b border-white/40" style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)' }}>
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: '#6B7280' }}>
          <ChevronLeft size={15} />Back to pipeline
        </button>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
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
        <span style={{ fontSize: 11.5, color: savedNote ? '#059669' : '#9AA3AF' }}>{savedNote ? '✓ Saved' : label}</span>
        <button onClick={onSaveDraft} className="px-4 py-2 rounded-full border" style={{ fontSize: 12.5, color: '#374151', borderColor: 'rgba(0,0,0,0.1)' }}>Save draft</button>
        <button onClick={onSubmit} className="px-4 py-2 rounded-full text-white" style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 600 }}>Submit for review</button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-6 max-w-2xl mx-auto w-full">{children}</div>
    </div>
  );
}

function AskAiBox({ kind, item, onApply }: { kind: StructuredObjectKind; item: any; onApply: (next: any) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (instruction: string) => {
    const ins = instruction.trim();
    if (!ins || busy) return;
    setBusy(true); setErr(null);
    try {
      onApply(await editStructuredObject(kind, item, ins));
      setText('');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-2xl border p-4 mb-4" style={{ borderColor: 'rgba(217,119,6,0.25)', background: 'rgba(254,243,199,0.35)' }}>
      <p style={{ fontSize: 12.5, fontWeight: 650, color: '#92400E', marginBottom: 8 }}>Ask AI to revise</p>
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} disabled={busy}
          onKeyDown={(e) => { if (e.key === 'Enter') run(text); }}
          placeholder="Tell the AI how to change this…"
          className="flex-1 rounded-xl px-3 py-2" style={field} />
        <button onClick={() => run(text)} disabled={busy || !text.trim()} className="px-3 py-2 rounded-xl text-white"
          style={{ background: '#0B0F1A', opacity: busy || !text.trim() ? 0.6 : 1 }}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        </button>
      </div>
      {err && <p style={{ fontSize: 11.5, color: '#DC2626', marginTop: 6 }}>{err}</p>}
    </div>
  );
}

function Submitted({ title, onDone }: { title: string; onDone: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-10 text-center min-h-[50vh]">
      <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: '#FEF3C7' }}>
        <Check size={24} style={{ color: '#D97706' }} />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0B1220', marginBottom: 6 }}>Submitted for review</h2>
      <p style={{ fontSize: 13.5, color: '#6B7280', maxWidth: 380, marginBottom: 14 }}>"{title}" has been submitted.</p>
      <button onClick={onDone} className="px-6 py-2.5 rounded-full text-white" style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600 }}>
        ✓ Done — go to library
      </button>
    </div>
  );
}

/* ─── Learner / preview views ─────────────────────────────────────── */

export function SummaryView({ content }: { content: SummaryContent }) {
  return (
    <div className="space-y-4">
      <div>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Summary</p>
        {content.topic && <h2 style={{ fontSize: 18, fontWeight: 750, color: '#0B1220', marginTop: 4 }}>{content.topic}</h2>}
        <p style={{ fontSize: 12, color: '#9AA3AF', marginTop: 4 }}>{[content.shape, content.length, content.audience].filter(Boolean).join(' · ')}</p>
      </div>
      {content.tldr && (
        <div className="rounded-2xl p-4" style={{ background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.15)' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#059669', marginBottom: 6 }}>TL;DR</p>
          <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>{content.tldr}</p>
        </div>
      )}
      {!!content.keyPoints?.length && (
        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(0,0,0,0.08)' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>Key points</p>
          <ol className="space-y-2" style={{ paddingLeft: 18 }}>
            {content.keyPoints.map((kp, i) => (
              <li key={i} style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.55 }}>{kp}</li>
            ))}
          </ol>
        </div>
      )}
      {content.body && (
        <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.65 }}>{content.body}</p>
      )}
    </div>
  );
}

export function ReflectionView({ content }: { content: ReflectionContent }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  return (
    <div className="space-y-4">
      <div>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#9333EA', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Reflection</p>
        <p style={{ fontSize: 12, color: '#9AA3AF', marginTop: 4 }}>{[content.goal, content.voice, content.visibility].filter(Boolean).join(' · ')}</p>
      </div>
      {(content.prompts || []).map((p, i) => (
        <div key={p.id || i} className="rounded-2xl p-4 border" style={{ background: 'rgba(255,255,255,0.92)', borderColor: 'rgba(0,0,0,0.08)' }}>
          <p style={{ fontSize: 14, fontWeight: 650, color: '#0B1220', marginBottom: 8 }}>{p.prompt}</p>
          {!!p.starters?.length && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {p.starters.map((s) => (
                <button key={s} type="button" onClick={() => setAnswers((a) => ({ ...a, [p.id]: (a[p.id] || '') + (a[p.id] ? ' ' : '') + s }))}
                  className="px-2.5 py-1 rounded-full text-xs border" style={{ color: '#6B21A8', borderColor: '#E9D5FF', background: '#FAF5FF' }}>{s}</button>
              ))}
            </div>
          )}
          <textarea value={answers[p.id] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [p.id]: e.target.value }))}
            rows={3} placeholder="Write your reflection…" className="w-full rounded-xl px-3 py-2 resize-y" style={field} />
        </div>
      ))}
    </div>
  );
}

export function AssignmentView({ content }: { content: AssignmentContent }) {
  return (
    <div className="space-y-4">
      <div>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#EA580C', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Assignment</p>
        <h2 style={{ fontSize: 18, fontWeight: 750, color: '#0B1220', marginTop: 4 }}>{content.objective}</h2>
        <p style={{ fontSize: 12, color: '#9AA3AF', marginTop: 4 }}>
          {[content.taskType, content.deliverable, content.expectedLength, content.requireCitations ? 'citations required' : ''].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(0,0,0,0.08)' }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>Task</p>
        <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>{content.prompt}</p>
      </div>
      {!!content.requirements?.length && (
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#0B1220', marginBottom: 6 }}>Requirements</p>
          <ul className="space-y-1.5" style={{ paddingLeft: 18 }}>
            {content.requirements.map((r, i) => <li key={i} style={{ fontSize: 13.5, color: '#374151' }}>{r}</li>)}
          </ul>
        </div>
      )}
      {!!content.rubric?.length && (
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#0B1220', marginBottom: 6 }}>Rubric</p>
          <div className="space-y-2">
            {content.rubric.map((r, i) => (
              <div key={i} className="rounded-xl px-3 py-2 border" style={{ borderColor: 'rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.85)' }}>
                <p style={{ fontSize: 13, fontWeight: 650, color: '#0B1220' }}>{r.criterion}</p>
                {r.description && <p style={{ fontSize: 12.5, color: '#6B7280' }}>{r.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function DrillView({ content }: { content: DrillContent }) {
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const items = content.items || [];
  const item = items[idx];
  if (!item) return <p style={{ color: '#9AA3AF' }}>No drill items yet.</p>;
  const next = () => { setIdx((i) => Math.min(items.length - 1, i + 1)); setRevealed(false); setChosen(null); };
  return (
    <div className="space-y-4">
      <div>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#DC2626', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Drill</p>
        <h2 style={{ fontSize: 18, fontWeight: 750, color: '#0B1220', marginTop: 4 }}>{content.skill}</h2>
        <p style={{ fontSize: 12, color: '#9AA3AF', marginTop: 4 }}>
          {[content.format, content.difficultyCurve, content.feedback, `Item ${idx + 1} of ${items.length}`].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="rounded-2xl p-5 border" style={{ background: 'rgba(255,255,255,0.92)', borderColor: 'rgba(0,0,0,0.08)' }}>
        <p style={{ fontSize: 15, fontWeight: 650, color: '#0B1220', marginBottom: 12 }}>{item.prompt}</p>
        {item.choices?.length ? (
          <div className="space-y-2">
            {item.choices.map((c) => (
              <button key={c} type="button" disabled={revealed} onClick={() => { setChosen(c); if (content.feedback === 'Immediate') setRevealed(true); }}
                className="w-full text-left px-3 py-2 rounded-xl border"
                style={{
                  fontSize: 13.5,
                  borderColor: revealed && c === item.answer ? '#059669' : chosen === c ? '#0B0F1A' : 'rgba(0,0,0,0.1)',
                  background: revealed && c === item.answer ? 'rgba(5,150,105,0.08)' : '#fff',
                }}>{c}</button>
            ))}
          </div>
        ) : (
          <button type="button" onClick={() => setRevealed(true)} className="px-4 py-2 rounded-full text-white" style={{ background: '#0B0F1A', fontSize: 13 }}>
            {revealed ? 'Answer shown' : 'Reveal answer'}
          </button>
        )}
        {revealed && (
          <p style={{ fontSize: 13.5, color: '#059669', marginTop: 12, fontWeight: 600 }}>Answer: {item.answer}</p>
        )}
        {item.hint && !revealed && (
          <p style={{ fontSize: 12, color: '#9AA3AF', marginTop: 10 }}>Hint: {item.hint}</p>
        )}
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={idx === 0} onClick={() => { setIdx((i) => i - 1); setRevealed(false); setChosen(null); }}
          className="px-4 py-2 rounded-full border" style={{ fontSize: 13, opacity: idx === 0 ? 0.4 : 1 }}>Back</button>
        {!revealed && content.feedback !== 'Immediate' && (
          <button type="button" onClick={() => setRevealed(true)} className="px-4 py-2 rounded-full border" style={{ fontSize: 13 }}>Check</button>
        )}
        <button type="button" disabled={idx >= items.length - 1} onClick={next}
          className="px-4 py-2 rounded-full text-white ml-auto" style={{ background: '#0B0F1A', fontSize: 13, opacity: idx >= items.length - 1 ? 0.4 : 1 }}>Next</button>
      </div>
    </div>
  );
}

/* ─── Editors ─────────────────────────────────────────────────────── */

type CommonProps = {
  typeId: string; title: string; scope?: string; fv: Record<string, any>;
  initialId?: string; initialStatus?: string; pipelineDraft?: CreatorPipelineDraft;
  onBack: () => void; onDone: () => void;
};

function useObjectSave(typeId: string, initialId?: string, initialStatus?: string) {
  const { addObject } = useApp();
  const savedId = useRef<string | null>(initialId || null);
  const [objectStatus, setObjectStatus] = useState(initialStatus || 'draft');
  useEffect(() => { if (initialId) savedId.current = initialId; }, [initialId]);
  useEffect(() => { if (initialStatus) setObjectStatus(initialStatus); }, [initialStatus]);
  const save = (opts: {
    title: string; description: string; blocks: any[]; tags: string[];
    status: 'draft' | 'in-review'; scope?: string; pipelineDraft?: CreatorPipelineDraft; estimatedTime?: string;
  }) => {
    const keepStatus = objectStatus === 'in-review' && opts.status === 'draft' ? 'in-review' : opts.status;
    const id = addObject({
      id: savedId.current || undefined,
      type: typeId,
      title: opts.title.trim(),
      status: keepStatus,
      description: opts.description,
      estimatedTime: opts.estimatedTime || '10 min',
      blocks: opts.blocks,
      tags: opts.tags,
      sourceIds: [],
      pipelineDraft: opts.pipelineDraft,
      scope: opts.scope as any,
    });
    savedId.current = id;
    setObjectStatus(keepStatus);
    return id;
  };
  return { save, objectStatus };
}

export function SummaryEditor({ typeId, title, scope, fv, content: initial, initialId, initialStatus, pipelineDraft, onBack, onDone }: CommonProps & { content: SummaryContent | null }) {
  const [docTitle, setDocTitle] = useState(title || 'Summary');
  const [mode, setMode] = useState<Mode>('edit');
  const [aiOpen, setAiOpen] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [local, setLocal] = useState<SummaryContent>(() => initial || { shape: fv.shape || 'Key points', keyPoints: [] });
  const { save } = useObjectSave(typeId, initialId, initialStatus);
  useEffect(() => { if (initial) setLocal(initial); }, [initial]);

  const persist = (status: 'draft' | 'in-review') => save({
    title: docTitle || local.topic || 'Summary',
    description: local.tldr || local.keyPoints?.[0] || local.topic || '',
    blocks: [{ id: `blk-${Date.now()}`, type: 'summary', content: local }],
    tags: [fv.aud, fv.shape, fv.len].filter(Boolean),
    status, scope, pipelineDraft, estimatedTime: '5 min',
  });

  if (submitted) return <Submitted title={docTitle} onDone={onDone} />;
  return (
    <EditorShell title={docTitle} setTitle={setDocTitle} mode={mode} setMode={setMode} onBack={onBack}
      savedNote={savedNote} label="Summary"
      onSaveDraft={() => { persist('draft'); setSavedNote(true); setTimeout(onDone, 650); }}
      onSubmit={() => { persist('in-review'); setSubmitted(true); }}>
      {mode === 'preview' ? <SummaryView content={local} /> : (
        <>
          <div className="flex justify-end mb-3">
            <button onClick={() => setAiOpen((v) => !v)} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ color: '#D97706', background: '#FEF3C7' }}>
              <Sparkles size={12} />Ask AI
            </button>
          </div>
          {aiOpen && <AskAiBox kind="summary" item={local} onApply={setLocal} />}
          <div className="space-y-3 rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.88)', borderColor: 'rgba(0,0,0,0.08)' }}>
            <div><label style={lbl}>Topic</label>
              <input value={local.topic || ''} onChange={(e) => setLocal({ ...local, topic: e.target.value })} className="w-full rounded-xl px-3 py-2" style={field} /></div>
            <div><label style={lbl}>TL;DR</label>
              <textarea value={local.tldr || ''} onChange={(e) => setLocal({ ...local, tldr: e.target.value })} rows={2} className="w-full rounded-xl px-3 py-2 resize-y" style={field} /></div>
            <div><label style={lbl}>Key points (one per line)</label>
              <textarea value={(local.keyPoints || []).join('\n')} onChange={(e) => setLocal({ ...local, keyPoints: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
                rows={5} className="w-full rounded-xl px-3 py-2 resize-y" style={field} /></div>
            <div><label style={lbl}>Body / abstract</label>
              <textarea value={local.body || ''} onChange={(e) => setLocal({ ...local, body: e.target.value })} rows={4} className="w-full rounded-xl px-3 py-2 resize-y" style={field} /></div>
          </div>
        </>
      )}
    </EditorShell>
  );
}

export function ReflectionEditor({ typeId, title, scope, fv, content: initial, initialId, initialStatus, pipelineDraft, onBack, onDone }: CommonProps & { content: ReflectionContent | null }) {
  const [docTitle, setDocTitle] = useState(title || 'Reflection');
  const [mode, setMode] = useState<Mode>('edit');
  const [aiOpen, setAiOpen] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [local, setLocal] = useState<ReflectionContent>(() => initial || {
    goal: fv.goal || 'Apply to real life', style: fv.style || 'Open-ended',
    visibility: fv.who || 'Private to learner', voice: fv.voi, prompts: [],
  });
  const { save } = useObjectSave(typeId, initialId, initialStatus);
  useEffect(() => { if (initial) setLocal(initial); }, [initial]);

  const setPrompt = (i: number, patch: Partial<ReflectionPrompt>) => {
    setLocal((p) => ({ ...p, prompts: p.prompts.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  };

  const persist = (status: 'draft' | 'in-review') => save({
    title: docTitle, description: local.prompts[0]?.prompt?.slice(0, 140) || local.goal,
    blocks: [{ id: `blk-${Date.now()}`, type: 'reflection', content: local }],
    tags: [fv.goal, fv.aud, fv.voi].filter(Boolean), status, scope, pipelineDraft, estimatedTime: '10 min',
  });

  if (submitted) return <Submitted title={docTitle} onDone={onDone} />;
  return (
    <EditorShell title={docTitle} setTitle={setDocTitle} mode={mode} setMode={setMode} onBack={onBack}
      savedNote={savedNote} label="Reflection"
      onSaveDraft={() => { persist('draft'); setSavedNote(true); setTimeout(onDone, 650); }}
      onSubmit={() => { persist('in-review'); setSubmitted(true); }}>
      {mode === 'preview' ? <ReflectionView content={local} /> : (
        <>
          <div className="flex justify-end mb-3">
            <button onClick={() => setAiOpen((v) => !v)} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ color: '#D97706', background: '#FEF3C7' }}>
              <Sparkles size={12} />Ask AI
            </button>
          </div>
          {aiOpen && <AskAiBox kind="reflection" item={local} onApply={setLocal} />}
          <div className="space-y-3">
            {(local.prompts || []).map((p, i) => (
              <div key={p.id || i} className="rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.88)', borderColor: 'rgba(0,0,0,0.08)' }}>
                <label style={lbl}>Prompt {i + 1}</label>
                <textarea value={p.prompt} onChange={(e) => setPrompt(i, { prompt: e.target.value })} rows={2} className="w-full rounded-xl px-3 py-2 resize-y mb-2" style={field} />
                <label style={lbl}>Sentence starters (comma-separated)</label>
                <input value={(p.starters || []).join(', ')} onChange={(e) => setPrompt(i, { starters: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  className="w-full rounded-xl px-3 py-2" style={field} />
              </div>
            ))}
          </div>
        </>
      )}
    </EditorShell>
  );
}

export function AssignmentEditor({ typeId, title, scope, fv, content: initial, initialId, initialStatus, pipelineDraft, onBack, onDone }: CommonProps & { content: AssignmentContent | null }) {
  const [docTitle, setDocTitle] = useState(title || 'Assignment');
  const [mode, setMode] = useState<Mode>('edit');
  const [aiOpen, setAiOpen] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [local, setLocal] = useState<AssignmentContent>(() => initial || {
    objective: fv.obj || '', taskType: fv.tt || 'Short essay', deliverable: fv.del || 'Written text',
    expectedLength: fv.el, requireCitations: fv.cite !== false, prompt: '', requirements: [], rubric: [],
  });
  const { save } = useObjectSave(typeId, initialId, initialStatus);
  useEffect(() => { if (initial) setLocal(initial); }, [initial]);

  const persist = (status: 'draft' | 'in-review') => save({
    title: docTitle, description: local.objective || local.prompt.slice(0, 140),
    blocks: [{ id: `blk-${Date.now()}`, type: 'assignment', content: local }],
    tags: [fv.tt, fv.aud, fv.lvl].filter(Boolean), status, scope, pipelineDraft, estimatedTime: '25 min',
  });

  if (submitted) return <Submitted title={docTitle} onDone={onDone} />;
  return (
    <EditorShell title={docTitle} setTitle={setDocTitle} mode={mode} setMode={setMode} onBack={onBack}
      savedNote={savedNote} label="Assignment"
      onSaveDraft={() => { persist('draft'); setSavedNote(true); setTimeout(onDone, 650); }}
      onSubmit={() => { persist('in-review'); setSubmitted(true); }}>
      {mode === 'preview' ? <AssignmentView content={local} /> : (
        <>
          <div className="flex justify-end mb-3">
            <button onClick={() => setAiOpen((v) => !v)} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ color: '#D97706', background: '#FEF3C7' }}>
              <Sparkles size={12} />Ask AI
            </button>
          </div>
          {aiOpen && <AskAiBox kind="assignment" item={local} onApply={setLocal} />}
          <div className="space-y-3 rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.88)', borderColor: 'rgba(0,0,0,0.08)' }}>
            <div><label style={lbl}>Objective</label>
              <textarea value={local.objective} onChange={(e) => setLocal({ ...local, objective: e.target.value })} rows={2} className="w-full rounded-xl px-3 py-2 resize-y" style={field} /></div>
            <div><label style={lbl}>Task prompt</label>
              <textarea value={local.prompt} onChange={(e) => setLocal({ ...local, prompt: e.target.value })} rows={4} className="w-full rounded-xl px-3 py-2 resize-y" style={field} /></div>
            <div><label style={lbl}>Requirements (one per line)</label>
              <textarea value={(local.requirements || []).join('\n')} onChange={(e) => setLocal({ ...local, requirements: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
                rows={4} className="w-full rounded-xl px-3 py-2 resize-y" style={field} /></div>
            <div><label style={lbl}>Rubric (criterion: description, one per line)</label>
              <textarea
                value={(local.rubric || []).map((r) => `${r.criterion}${r.description ? `: ${r.description}` : ''}`).join('\n')}
                onChange={(e) => setLocal({
                  ...local,
                  rubric: e.target.value.split('\n').map((line) => {
                    const [criterion, ...rest] = line.split(':');
                    return { criterion: (criterion || '').trim(), description: rest.join(':').trim() || undefined };
                  }).filter((r) => r.criterion),
                })}
                rows={4} className="w-full rounded-xl px-3 py-2 resize-y" style={field} />
            </div>
          </div>
        </>
      )}
    </EditorShell>
  );
}

export function DrillEditor({ typeId, title, scope, fv, content: initial, initialId, initialStatus, pipelineDraft, onBack, onDone }: CommonProps & { content: DrillContent | null }) {
  const [docTitle, setDocTitle] = useState(title || 'Drill');
  const [mode, setMode] = useState<Mode>('edit');
  const [aiOpen, setAiOpen] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [local, setLocal] = useState<DrillContent>(() => initial || {
    skill: fv.skill || '', format: fv.fmt || 'Recall', difficultyCurve: fv.diff || 'Easy → hard',
    feedback: fv.fb || 'Immediate', timed: !!fv.timed, repeatUntilMastery: !!fv.rep, items: [],
  });
  const { save } = useObjectSave(typeId, initialId, initialStatus);
  useEffect(() => { if (initial) setLocal(initial); }, [initial]);

  const setItem = (i: number, patch: Partial<DrillItem>) => {
    setLocal((p) => ({ ...p, items: p.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  };

  const persist = (status: 'draft' | 'in-review') => save({
    title: docTitle || local.skill || 'Drill', description: `Drill: ${local.skill}`,
    blocks: [{ id: `blk-${Date.now()}`, type: 'drill', content: local }],
    tags: [fv.fmt, fv.lvl, fv.diff].filter(Boolean), status, scope, pipelineDraft, estimatedTime: '8 min',
  });

  if (submitted) return <Submitted title={docTitle} onDone={onDone} />;
  return (
    <EditorShell title={docTitle} setTitle={setDocTitle} mode={mode} setMode={setMode} onBack={onBack}
      savedNote={savedNote} label="Drill"
      onSaveDraft={() => { persist('draft'); setSavedNote(true); setTimeout(onDone, 650); }}
      onSubmit={() => { persist('in-review'); setSubmitted(true); }}>
      {mode === 'preview' ? <DrillView content={local} /> : (
        <>
          <div className="flex justify-end mb-3">
            <button onClick={() => setAiOpen((v) => !v)} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ color: '#D97706', background: '#FEF3C7' }}>
              <Sparkles size={12} />Ask AI
            </button>
          </div>
          {aiOpen && <AskAiBox kind="drill" item={local} onApply={setLocal} />}
          <div className="mb-3"><label style={lbl}>Skill</label>
            <input value={local.skill} onChange={(e) => setLocal({ ...local, skill: e.target.value })} className="w-full rounded-xl px-3 py-2" style={field} /></div>
          <div className="space-y-2">
            {(local.items || []).map((it, i) => (
              <div key={it.id || i} className="rounded-2xl border p-3" style={{ background: 'rgba(255,255,255,0.88)', borderColor: 'rgba(0,0,0,0.08)' }}>
                <p style={{ fontSize: 11, color: '#9AA3AF', marginBottom: 4 }}>Item {i + 1}</p>
                <input value={it.prompt} onChange={(e) => setItem(i, { prompt: e.target.value })} placeholder="Prompt" className="w-full rounded-xl px-3 py-2 mb-2" style={field} />
                <input value={it.answer} onChange={(e) => setItem(i, { answer: e.target.value })} placeholder="Answer" className="w-full rounded-xl px-3 py-2" style={field} />
              </div>
            ))}
          </div>
        </>
      )}
    </EditorShell>
  );
}
