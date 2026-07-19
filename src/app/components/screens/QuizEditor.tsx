import React, { useEffect, useRef, useState } from 'react';
import {
  Check, ChevronLeft, Plus, Trash2, Sparkles, Loader2, Eye, Pencil,
} from 'lucide-react';
import { useApp } from '../../App';
import type { CreatorPipelineDraft, QuestionContent, QuizContent, QuestionType } from '../../../lib/types';
import type { GeneratedQuizQuestion } from '../../../lib/api';
import { editQuizQuestion, errorMessage } from '../../../lib/api';
import { QuizBlock } from './LearnerReader';

function toQuestionContent(q: GeneratedQuizQuestion | QuestionContent, i = 0): QuestionContent & { _id: string } {
  return {
    _id: (q as any).id || (q as any)._id || `q-${i}-${Date.now()}`,
    question: q.question,
    type: (q.type as QuestionType) || 'multiple-choice',
    options: q.options ? [...q.options] : ['', '', '', ''],
    correct: q.correct,
    correctIndices: q.correctIndices,
    sampleAnswer: q.sampleAnswer,
    explanation: q.explanation || '',
    hint: q.hint || '',
    cognitiveLevel: q.cognitiveLevel,
    difficulty: q.difficulty,
  };
}

type QDraft = QuestionContent & { _id: string };
type Mode = 'edit' | 'preview';

const QTYPES: QuestionType[] = ['multiple-choice', 'true-false', 'multi-select', 'short-answer', 'scenario'];

const field: React.CSSProperties = {
  fontSize: 13, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.85)', outline: 'none',
};
const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 3, display: 'block' };

function AskAiQuestion({ q, onApply, onClose }: { q: QDraft; onApply: (patch: Partial<QDraft>) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const chips = ['Make it harder', 'Simplify the wording', 'Improve the explanation', 'Add a helpful hint', 'Rewrite the wrong answers'];

  const run = async (instruction: string) => {
    const ins = instruction.trim();
    if (!ins || busy) return;
    setBusy(true); setErr(null);
    try {
      const { _id, ...rest } = q;
      const edited = await editQuizQuestion({ id: _id, ...rest } as GeneratedQuizQuestion, ins);
      onApply({
        question: edited.question,
        type: edited.type,
        options: edited.options || [],
        correct: edited.correct,
        correctIndices: edited.correctIndices,
        sampleAnswer: edited.sampleAnswer,
        explanation: edited.explanation || '',
        hint: edited.hint || '',
        cognitiveLevel: edited.cognitiveLevel,
        difficulty: edited.difficulty,
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
          placeholder="Tell the AI how to change this question…"
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

function ManualQuestionEdit({ q, onChange }: { q: QDraft; onChange: (patch: Partial<QDraft>) => void }) {
  const opts = q.options || ['', '', '', ''];
  const setOpt = (i: number, val: string) => onChange({ options: opts.map((o, idx) => (idx === i ? val : o)) });
  const toggleMulti = (i: number) => {
    const cur = new Set(q.correctIndices || []);
    if (cur.has(i)) cur.delete(i); else cur.add(i);
    onChange({ correctIndices: [...cur].sort((a, b) => a - b) });
  };

  return (
    <div className="space-y-2.5">
      <div>
        <label style={lbl}>Question type</label>
        <select value={q.type} onChange={(e) => {
          const type = e.target.value as QuestionType;
          if (type === 'true-false') onChange({ type, options: ['True', 'False'], correct: 0, correctIndices: undefined });
          else if (type === 'short-answer') onChange({ type, options: [], correct: undefined, correctIndices: undefined });
          else if (type === 'multi-select') onChange({ type, options: opts.length ? opts : ['', '', '', ''], correctIndices: q.correctIndices || [0], correct: undefined });
          else onChange({ type, options: opts.length >= 2 ? opts : ['', '', '', ''], correct: q.correct ?? 0, correctIndices: undefined });
        }} className="w-full rounded-xl px-3 py-2" style={field}>
          {QTYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label style={lbl}>Question</label>
        <textarea value={q.question} onChange={(e) => onChange({ question: e.target.value })} rows={2}
          className="w-full rounded-xl px-3 py-2 resize-y" style={field} />
      </div>
      {q.type === 'short-answer' ? (
        <div>
          <label style={lbl}>Sample / accepted answer</label>
          <input value={q.sampleAnswer || ''} onChange={(e) => onChange({ sampleAnswer: e.target.value })}
            className="w-full rounded-xl px-3 py-2" style={field} />
        </div>
      ) : (
        <div>
          <label style={lbl}>
            Options · {q.type === 'multi-select' ? 'toggle all correct answers' : 'click the circle for the correct answer'}
          </label>
          <div className="space-y-1.5">
            {(q.type === 'true-false' ? ['True', 'False'] : opts).map((o, oi) => {
              const isCorrect = q.type === 'multi-select'
                ? (q.correctIndices || []).includes(oi)
                : oi === (q.correct ?? 0);
              return (
                <div key={oi} className="flex items-center gap-2">
                  <button type="button"
                    onClick={() => q.type === 'multi-select' ? toggleMulti(oi) : onChange({ correct: oi })}
                    className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                    style={{ borderColor: isCorrect ? '#059669' : '#D1D5DB', background: isCorrect ? 'rgba(5,150,105,0.12)' : 'transparent' }}>
                    {isCorrect && <Check size={11} style={{ color: '#059669' }} />}
                  </button>
                  <input value={o} disabled={q.type === 'true-false'}
                    onChange={(e) => setOpt(oi, e.target.value)}
                    className="flex-1 rounded-xl px-3 py-1.5" style={field} />
                </div>
              );
            })}
          </div>
          {q.type !== 'true-false' && (
            <button type="button" onClick={() => onChange({ options: [...opts, ''] })}
              className="mt-1.5 text-xs font-semibold" style={{ color: '#2563EB' }}>+ Add option</button>
          )}
        </div>
      )}
      <div>
        <label style={lbl}>Hint (optional — learner can reveal)</label>
        <input value={q.hint || ''} onChange={(e) => onChange({ hint: e.target.value })}
          placeholder="A short cue without giving away the answer"
          className="w-full rounded-xl px-3 py-2" style={field} />
      </div>
      <div>
        <label style={lbl}>Explanation</label>
        <textarea value={q.explanation || ''} onChange={(e) => onChange({ explanation: e.target.value })} rows={2}
          className="w-full rounded-xl px-3 py-2 resize-y" style={field} />
      </div>
    </div>
  );
}

/** Draft editor after quiz generation — edit + student preview. */
export function QuizEditor({
  typeId, title, scope, fv, questions, passMark, showExplanations, adaptive,
  initialId, initialStatus, pipelineDraft, onBack, onDone,
}: {
  typeId: string;
  title: string;
  scope?: string;
  fv: Record<string, any>;
  questions: GeneratedQuizQuestion[];
  passMark?: number;
  showExplanations?: string;
  adaptive?: boolean;
  initialId?: string;
  initialStatus?: string;
  pipelineDraft?: CreatorPipelineDraft;
  onBack: () => void;
  onDone: () => void;
}) {
  const { addObject } = useApp();
  const [docTitle, setDocTitle] = useState(title || 'Quiz');
  const [submitted, setSubmitted] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [mode, setMode] = useState<Mode>('edit');
  const [localQs, setLocalQs] = useState<QDraft[]>(() => (questions || []).map((q, i) => toQuestionContent(q, i)));
  const [editId, setEditId] = useState<string | null>(null);
  const [aiId, setAiId] = useState<string | null>(null);
  const [objectStatus, setObjectStatus] = useState(initialStatus || 'draft');
  const [meta] = useState({
    passMark: typeof passMark === 'number' ? passMark : parseInt(String(fv?.pass || '70').replace('%', ''), 10) || 70,
    showExplanations: showExplanations || fv?.show || 'After attempt',
    purpose: fv?.purpose || 'Formative check',
    adaptive: typeof adaptive === 'boolean' ? adaptive : /^yes$/i.test(String(fv?.adaptive || 'No')),
  });
  const savedId = useRef<string | null>(initialId || null);

  useEffect(() => { setLocalQs((questions || []).map((q, i) => toQuestionContent(q, i))); }, [questions]);
  useEffect(() => { if (initialId) savedId.current = initialId; }, [initialId]);
  useEffect(() => { if (initialStatus) setObjectStatus(initialStatus); }, [initialStatus]);

  const updateQ = (id: string, patch: Partial<QDraft>) =>
    setLocalQs((prev) => prev.map((q) => (q._id === id ? { ...q, ...patch } : q)));

  const addQuestion = () => {
    const id = `q-new-${Date.now()}`;
    const q: QDraft = {
      _id: id,
      question: '',
      type: 'multiple-choice',
      options: ['', '', '', ''],
      correct: 0,
      explanation: '',
      hint: '',
    };
    setLocalQs((p) => [...p, q]);
    setEditId(id);
    setAiId(null);
    setMode('edit');
  };

  const briefChips: string[] = [
    fv?.purpose || 'Formative check',
    fv?.lvl || 'Basic',
    ...(Array.isArray(fv?.qtypes) ? fv.qtypes : [fv?.qtypes].filter(Boolean)),
    fv?.pass || '70%',
    meta.adaptive ? 'Adaptive' : 'Fixed',
  ].filter(Boolean);

  const quizContent: QuizContent = {
    questions: localQs.map(({ _id, ...rest }) => ({
      ...rest,
      hint: rest.hint?.trim() || undefined,
      explanation: rest.explanation || '',
    })),
    passMark: meta.passMark,
    showExplanations: meta.showExplanations,
    purpose: meta.purpose,
    adaptive: meta.adaptive,
  };

  const save = (status: 'draft' | 'in-review') => {
    const block = { id: `blk-${Date.now()}`, type: 'quiz' as const, content: quizContent };
    const keepStatus = objectStatus === 'in-review' && status === 'draft' ? 'in-review' : status;
    const id = addObject({
      id: savedId.current || undefined,
      type: typeId,
      title: (docTitle || 'Quiz').trim(),
      status: keepStatus,
      description: (fv?.verify as string)?.trim()
        || (fv?.concepts as string)?.trim()
        || `A ${localQs.length}-question quiz.`,
      estimatedTime: `${Math.max(5, Math.round(localQs.length * 1.5))} min`,
      blocks: [block] as any,
      tags: briefChips,
      sourceIds: [],
      pipelineDraft: pipelineDraft || undefined,
      scope: scope as any,
    });
    savedId.current = id;
    setObjectStatus(keepStatus);
    return id;
  };

  if (submitted) {
    return (
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
  }

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
          {savedNote ? '✓ Saved' : `${localQs.length} questions`}
        </span>
        <button onClick={() => { save('draft'); setSavedNote(true); setTimeout(() => onDone(), 650); }}
          className="px-4 py-2 rounded-full border" style={{ fontSize: 12.5, color: '#374151', borderColor: 'rgba(0,0,0,0.1)' }}>
          Save draft
        </button>
        <button onClick={() => { save('in-review'); setSubmitted(true); }}
          className="px-4 py-2 rounded-full text-white" style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 600 }}>
          Submit for review
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-6 max-w-2xl mx-auto w-full">
        {mode === 'preview' ? (
          <>
            <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 14 }}>
              Student preview · Pass {meta.passMark}% · {meta.showExplanations}
              {meta.adaptive ? ' · Adaptive' : ''}
            </p>
            <QuizBlock content={quizContent} />
          </>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 12, lineHeight: 1.5 }}>
              Edit questions by hand, use <strong>Ask AI</strong> per question, add hints, or add more questions. Switch to Student preview to try the quiz.
            </p>
            {localQs.map((q, i) => (
              <div key={q._id} className="mb-3 rounded-2xl border overflow-hidden" style={{ background: 'rgba(255,255,255,0.88)', borderColor: 'rgba(0,0,0,0.08)' }}>
                <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.5)' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#F3F4F6', color: '#374151' }}>Q{i + 1}</span>
                    <span className="px-2 py-0.5 rounded text-xs" style={{ background: '#FEF3C7', color: '#92400E' }}>{q.type}</span>
                    {q.hint && <span className="px-2 py-0.5 rounded text-xs" style={{ background: '#EFF6FF', color: '#2563EB' }}>hint</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setAiId(aiId === q._id ? null : q._id); setEditId(null); }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs"
                      style={{ color: '#D97706', background: aiId === q._id ? '#FEF3C7' : 'transparent' }}>
                      <Sparkles size={11} />Ask AI
                    </button>
                    <button onClick={() => { setEditId(editId === q._id ? null : q._id); setAiId(null); }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs"
                      style={{ color: '#2563EB', background: editId === q._id ? '#EFF6FF' : 'transparent' }}>
                      ✎ Edit
                    </button>
                    <button onClick={() => { if (i > 0) setLocalQs((p) => { const c = [...p]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c; }); }}
                      disabled={i === 0} className="px-1 text-sm" style={{ color: i === 0 ? '#E5E7EB' : '#6B7280' }}>↑</button>
                    <button onClick={() => { if (i < localQs.length - 1) setLocalQs((p) => { const c = [...p]; [c[i], c[i + 1]] = [c[i + 1], c[i]]; return c; }); }}
                      disabled={i === localQs.length - 1} className="px-1 text-sm" style={{ color: i === localQs.length - 1 ? '#E5E7EB' : '#6B7280' }}>↓</button>
                    <button onClick={() => setLocalQs((p) => p.filter((x) => x._id !== q._id))}><Trash2 size={12} style={{ color: '#EF4444' }} /></button>
                  </div>
                </div>
                <div className="p-4">
                  {editId === q._id ? (
                    <ManualQuestionEdit q={q} onChange={(patch) => updateQ(q._id, patch)} />
                  ) : aiId === q._id ? (
                    <AskAiQuestion q={q} onApply={(patch) => updateQ(q._id, patch)} onClose={() => setAiId(null)} />
                  ) : (
                    <div>
                      <p style={{ fontSize: 13.5, fontWeight: 600, color: '#0B1220', marginBottom: 6 }}>{q.question || '(empty question)'}</p>
                      {q.type === 'short-answer' ? (
                        <p style={{ fontSize: 12.5, color: '#6B7280' }}>Sample: {q.sampleAnswer || '—'}</p>
                      ) : (
                        <div className="space-y-1">
                          {(q.options || []).map((o, oi) => {
                            const ok = q.type === 'multi-select' ? (q.correctIndices || []).includes(oi) : oi === q.correct;
                            return (
                              <p key={oi} style={{ fontSize: 13, color: ok ? '#059669' : '#374151', fontWeight: ok ? 600 : 400 }}>
                                {ok ? '✓ ' : ''}{o || `Option ${oi + 1}`}
                              </p>
                            );
                          })}
                        </div>
                      )}
                      {q.hint && <p style={{ fontSize: 12, color: '#2563EB', marginTop: 8 }}>Hint: {q.hint}</p>}
                      {q.explanation && <p style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>{q.explanation}</p>}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <button onClick={addQuestion}
              className="w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl border-2 border-dashed"
              style={{ borderColor: 'rgba(0,0,0,0.12)', fontSize: 13, fontWeight: 600, color: '#0B1220', background: 'rgba(255,255,255,0.6)' }}>
              <Plus size={14} />Add question
            </button>
          </>
        )}
      </div>
    </div>
  );
}
