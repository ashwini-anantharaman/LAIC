import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, Sparkles, Loader2, Eye, Pencil } from 'lucide-react';
import { useApp } from '../../App';
import type { ConceptCardContent, ConceptCardViewKey, CreatorPipelineDraft } from '../../../lib/types';
import type { GeneratedConceptCard } from '../../../lib/api';
import { editConceptCard, errorMessage } from '../../../lib/api';
import { ConceptCardView } from './LearnerReader';

type Mode = 'edit' | 'preview';

const field: React.CSSProperties = {
  fontSize: 13, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.85)', outline: 'none',
};
const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 3, display: 'block' };

function inferViews(c: GeneratedConceptCard | ConceptCardContent): ConceptCardViewKey[] {
  if (Array.isArray(c.includedViews) && c.includedViews.length) return c.includedViews;
  const v: ConceptCardViewKey[] = ['definition'];
  if (c.analogy) v.push('analogy');
  if (c.example) v.push('example');
  if (c.visualSuggestion) v.push('visual');
  if (c.misconception) v.push('misconception');
  return v;
}

function toContent(c: GeneratedConceptCard | ConceptCardContent): ConceptCardContent {
  const includedViews = inferViews(c);
  const out: ConceptCardContent = {
    term: c.term || '',
    definition: c.definition || '',
    voice: c.voice,
    length: c.length,
    includedViews,
    citations: c.citations,
  };
  if (includedViews.includes('analogy')) out.analogy = c.analogy || '';
  if (includedViews.includes('example')) out.example = c.example || '';
  if (includedViews.includes('visual')) out.visualSuggestion = c.visualSuggestion || '';
  if (includedViews.includes('misconception')) out.misconception = c.misconception || '';
  return out;
}

function AskAiConcept({
  card, onApply, onClose,
}: {
  card: ConceptCardContent;
  onApply: (next: ConceptCardContent) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const views = card.includedViews || ['definition'];
  const chips = [
    views.includes('definition') ? 'Simplify the definition' : null,
    views.includes('analogy') ? 'Improve the analogy' : null,
    views.includes('misconception') ? 'Sharpen the misconception' : null,
    views.includes('example') ? 'Make the example clearer' : null,
    'Match a tighter length',
  ].filter(Boolean) as string[];

  const run = async (instruction: string) => {
    const ins = instruction.trim();
    if (!ins || busy) return;
    setBusy(true); setErr(null);
    try {
      const edited = await editConceptCard(card, ins);
      onApply(toContent(edited));
      setText('');
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border p-4 mb-4" style={{ borderColor: 'rgba(217,119,6,0.25)', background: 'rgba(254,243,199,0.35)' }}>
      <p style={{ fontSize: 12.5, fontWeight: 650, color: '#92400E', marginBottom: 8 }}>Ask AI to revise this concept card</p>
      <div className="flex flex-wrap gap-2 mb-2">
        {chips.map((c) => (
          <button key={c} disabled={busy} onClick={() => run(c)} className="px-2.5 py-1 rounded-full border text-xs"
            style={{ background: '#FEF3C7', borderColor: '#FCD34D', color: '#92400E', opacity: busy ? 0.55 : 1 }}>{c}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} disabled={busy}
          onKeyDown={(e) => { if (e.key === 'Enter') run(text); }}
          placeholder="Tell the AI how to change this concept card…"
          className="flex-1 rounded-xl px-3 py-2" style={field} />
        <button onClick={() => run(text)} disabled={busy || !text.trim()} className="px-3 py-2 rounded-xl text-white"
          style={{ background: '#0B0F1A', opacity: busy || !text.trim() ? 0.6 : 1 }}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        </button>
        <button onClick={onClose} className="px-3 py-2 rounded-xl border text-xs" style={{ color: '#6B7280', borderColor: 'rgba(0,0,0,0.1)' }}>Close</button>
      </div>
      {busy && <p style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 6 }}>Rewriting with AI…</p>}
      {err && <p style={{ fontSize: 11.5, color: '#DC2626', marginTop: 6 }}>{err}</p>}
    </div>
  );
}

export function ConceptCardEditor({
  typeId, title, scope, fv, card, initialId, initialStatus, pipelineDraft, onBack, onDone,
}: {
  typeId: string;
  title: string;
  scope?: string;
  fv: Record<string, any>;
  card: GeneratedConceptCard | ConceptCardContent | null;
  initialId?: string;
  initialStatus?: string;
  pipelineDraft?: CreatorPipelineDraft;
  onBack: () => void;
  onDone: () => void;
}) {
  const { addObject } = useApp();
  const [docTitle, setDocTitle] = useState(title || 'Concept card');
  const [submitted, setSubmitted] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [mode, setMode] = useState<Mode>('edit');
  const [aiOpen, setAiOpen] = useState(false);
  const [local, setLocal] = useState<ConceptCardContent>(() => toContent(card || { term: '', definition: '' }));
  const [objectStatus, setObjectStatus] = useState(initialStatus || 'draft');
  const savedId = useRef<string | null>(initialId || null);

  useEffect(() => { if (card) setLocal(toContent(card)); }, [card]);
  useEffect(() => { if (initialId) savedId.current = initialId; }, [initialId]);
  useEffect(() => { if (initialStatus) setObjectStatus(initialStatus); }, [initialStatus]);

  const set = (patch: Partial<ConceptCardContent>) => setLocal((p) => ({ ...p, ...patch }));

  const briefChips = [
    fv?.aud || 'High school',
    fv?.lvl || 'Basic',
    fv?.voi || 'Plain & friendly',
    fv?.len || 'Standard',
    ...(Array.isArray(fv?.incl) ? fv.incl : [fv?.incl].filter(Boolean)),
  ].filter(Boolean);

  const views = local.includedViews?.length ? local.includedViews : inferViews(local);
  const content: ConceptCardContent = {
    term: local.term.trim(),
    definition: local.definition.trim(),
    example: views.includes('example') ? (local.example?.trim() || undefined) : undefined,
    analogy: views.includes('analogy') ? (local.analogy?.trim() || undefined) : undefined,
    visualSuggestion: views.includes('visual') ? (local.visualSuggestion?.trim() || undefined) : undefined,
    misconception: views.includes('misconception') ? (local.misconception?.trim() || undefined) : undefined,
    voice: local.voice || fv?.voi,
    length: local.length || fv?.len,
    includedViews: views,
    citations: local.citations,
  };

  const save = (status: 'draft' | 'in-review') => {
    const block = { id: `blk-${Date.now()}`, type: 'concept-card' as const, content };
    const keepStatus = objectStatus === 'in-review' && status === 'draft' ? 'in-review' : status;
    const id = addObject({
      id: savedId.current || undefined,
      type: typeId,
      title: (docTitle || content.term || 'Concept card').trim(),
      status: keepStatus,
      description: (fv?.concept as string)?.trim() || content.definition.slice(0, 140),
      estimatedTime: '3 min',
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
          {savedNote ? '✓ Saved' : 'Concept card'}
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
              Student preview · {content.voice || fv?.voi || 'Voice'} · {content.length || fv?.len || 'Standard'} length
            </p>
            <ConceptCardView content={content} />
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <p style={{ fontSize: 12.5, color: '#6B7280', lineHeight: 1.5, flex: 1 }}>
                Edit by hand or use <strong>Ask AI</strong>. Switch to Student preview to see the learner view.
              </p>
              <button onClick={() => setAiOpen((v) => !v)} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ color: '#D97706', background: aiOpen ? '#FEF3C7' : 'rgba(254,243,199,0.5)' }}>
                <Sparkles size={12} />Ask AI
              </button>
            </div>
            {aiOpen && (
              <AskAiConcept card={content} onApply={(next) => setLocal(next)} onClose={() => setAiOpen(false)} />
            )}
            <div className="space-y-3 rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.88)', borderColor: 'rgba(0,0,0,0.08)' }}>
              <div>
                <label style={lbl}>Term / concept</label>
                <input value={local.term} onChange={(e) => set({ term: e.target.value })} className="w-full rounded-xl px-3 py-2" style={field} />
              </div>
              {views.includes('definition') && (
                <div>
                  <label style={lbl}>Definition{content.citations?.definition ? ` · ${content.citations.definition}` : ''}</label>
                  <textarea value={local.definition} onChange={(e) => set({ definition: e.target.value })} rows={3}
                    className="w-full rounded-xl px-3 py-2 resize-y" style={field} />
                </div>
              )}
              {views.includes('analogy') && (
                <div>
                  <label style={lbl}>Everyday analogy{content.citations?.analogy ? ` · ${content.citations.analogy}` : ''}</label>
                  <textarea value={local.analogy || ''} onChange={(e) => set({ analogy: e.target.value })} rows={2}
                    className="w-full rounded-xl px-3 py-2 resize-y" style={field} />
                </div>
              )}
              {views.includes('example') && (
                <div>
                  <label style={lbl}>Worked example{content.citations?.example ? ` · ${content.citations.example}` : ''}</label>
                  <textarea value={local.example || ''} onChange={(e) => set({ example: e.target.value })} rows={2}
                    className="w-full rounded-xl px-3 py-2 resize-y" style={field} />
                </div>
              )}
              {views.includes('visual') && (
                <div>
                  <label style={lbl}>Visual suggestion{content.citations?.visual ? ` · ${content.citations.visual}` : ''}</label>
                  <textarea value={local.visualSuggestion || ''} onChange={(e) => set({ visualSuggestion: e.target.value })} rows={2}
                    className="w-full rounded-xl px-3 py-2 resize-y" style={field} />
                </div>
              )}
              {views.includes('misconception') && (
                <div>
                  <label style={lbl}>Common misconception{content.citations?.misconception ? ` · ${content.citations.misconception}` : ''}</label>
                  <textarea value={local.misconception || ''} onChange={(e) => set({ misconception: e.target.value })} rows={2}
                    className="w-full rounded-xl px-3 py-2 resize-y" style={field} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
