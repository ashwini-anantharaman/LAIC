/**
 * Author workspace for one Structure unit (category / card group / checkpoint
 * group / concept category). Two tabs:
 *   Write    — manual per-slot editors, incl. image/video attach per item
 *   Generate — pick sources → mark up → generate (fills this unit's slots)
 */
import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, PenLine, Plus, Sparkles, Trash2 } from 'lucide-react';
import { MarkupWorkspace, type MarkupSource } from '../MarkupWorkspace';
import {
  errorMessage,
  generateConceptCard,
  generateFlashcards,
  generateQuiz,
  generateVideoScript,
  suggestTutorialMarkupFlags,
  type GeneratedCard,
  type GeneratedConceptCard,
  type GeneratedQuizQuestion,
  type TutorialExtract,
} from '../../../../lib/api';
import { categoryBody, resolveConceptCategories } from '../../../../lib/conceptCard';
import { sourcePoolToMarkupSources } from '../../../../lib/tutorialV2/draftModel';
import {
  X_SLOT_NOUN,
  blankQuestion,
  blankSlot,
  bumpXAuthorMode,
  slotHasContent,
  type StructuredV2Draft,
  type XV2Slot,
  type XV2Unit,
} from '../../../../lib/objectV2/structuredDraft';
import { ItemMediaAttach } from './ItemMediaAttach';
import type { QuestionContent } from '../../../../lib/types';

type Tab = 'write' | 'generate';
type GenStep = 'pick' | 'markup' | 'run';

const inputStyle: React.CSSProperties = {
  fontSize: 13,
  border: '1px solid rgba(0,0,0,0.1)',
  background: 'rgba(255,255,255,0.9)',
  outline: 'none',
};

export function XV2UnitWorkspace({
  draft,
  unit,
  allowAiGenerate = true,
  onChangeUnit,
  onMarkDone,
}: {
  draft: StructuredV2Draft;
  unit: XV2Unit;
  allowAiGenerate?: boolean;
  onChangeUnit: (patch: Partial<XV2Unit>) => void;
  onMarkDone: (done: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>('write');
  const slotNoun = X_SLOT_NOUN[draft.type];

  const updateSlot = (slotId: string, patch: Partial<XV2Slot>) => {
    onChangeUnit({
      slots: unit.slots.map((s) => {
        if (s.id !== slotId) return s;
        const next = { ...s, ...patch };
        return { ...next, done: slotHasContent(next) };
      }),
      authorMode: bumpXAuthorMode(unit.authorMode, 'written'),
    });
  };

  const addSlot = () => {
    onChangeUnit({ slots: [...unit.slots, blankSlot(draft.type, unit.slots.length)] });
  };
  const removeSlot = (slotId: string) => {
    onChangeUnit({ slots: unit.slots.filter((s) => s.id !== slotId) });
  };

  const doneCount = unit.slots.filter(slotHasContent).length;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-3 mb-3">
        <div className="flex gap-2">
          {(['write', ...(allowAiGenerate ? ['generate'] as const : [])] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border"
              style={{
                fontSize: 12.5,
                fontWeight: 650,
                background: tab === t ? '#0B0F1A' : '#fff',
                color: tab === t ? '#fff' : '#374151',
                borderColor: tab === t ? '#0B0F1A' : 'rgba(0,0,0,0.1)',
              }}
            >
              {t === 'write' ? <PenLine size={12} /> : <Sparkles size={12} />}
              {t === 'write' ? 'Write yourself' : 'Generate with AI'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 12, color: '#6B7280' }}>{doneCount}/{unit.slots.length} {slotNoun}s</span>
          <button
            type="button"
            onClick={() => onMarkDone(!unit.done)}
            className="px-3 py-1.5 rounded-full border"
            style={{
              fontSize: 12,
              fontWeight: 650,
              background: unit.done ? 'rgba(5,150,105,0.12)' : '#fff',
              color: unit.done ? '#065F46' : '#374151',
              borderColor: unit.done ? 'rgba(5,150,105,0.4)' : 'rgba(0,0,0,0.1)',
            }}
          >
            {unit.done ? '✓ Done' : 'Mark done'}
          </button>
        </div>
      </div>

      {tab === 'write' ? (
        <div className="space-y-3">
          {unit.slots.map((slot, i) => (
            <SlotEditor
              key={slot.id}
              slot={slot}
              index={i}
              type={draft.type}
              onChange={(patch) => updateSlot(slot.id, patch)}
              onRemove={unit.slots.length > 1 ? () => removeSlot(slot.id) : undefined}
            />
          ))}
          {draft.type !== 'concept-card' && (
            <button
              type="button"
              onClick={addSlot}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border"
              style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.12)', background: '#fff' }}
            >
              <Plus size={13} /> Add {slotNoun}
            </button>
          )}
        </div>
      ) : (
        <UnitGeneratePane draft={draft} unit={unit} onChangeUnit={onChangeUnit} onDone={() => setTab('write')} />
      )}
    </div>
  );
}

/* ── manual slot editors (shared with Review) ───────────────── */

export function SlotEditor({
  slot, index, type, onChange, onRemove,
}: {
  slot: XV2Slot;
  index: number;
  type: StructuredV2Draft['type'];
  onChange: (patch: Partial<XV2Slot>) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="rounded-2xl border p-3.5" style={{ background: 'rgba(255,255,255,0.9)', borderColor: 'rgba(0,0,0,0.08)' }}>
      <div className="flex items-center justify-between mb-2">
        <p style={{ fontSize: 12, fontWeight: 700, color: slotHasContent(slot) ? '#065F46' : '#6B7280' }}>
          {slot.title || `${X_SLOT_NOUN[type]} ${index + 1}`}
          {slotHasContent(slot) ? ' ✓' : ''}
        </p>
        {onRemove && (
          <button type="button" onClick={onRemove} className="p-1" title="Remove">
            <Trash2 size={13} style={{ color: '#EF4444' }} />
          </button>
        )}
      </div>

      {(slot.kind === 'question' || slot.kind === 'checkpoint') && (
        <QuestionSlotFields slot={slot} onChange={onChange} />
      )}

      {slot.kind === 'card' && (
        <div className="space-y-2">
          <textarea
            value={slot.card?.front || ''}
            onChange={(e) => onChange({ card: { ...(slot.card || { front: '', back: '' }), front: e.target.value } })}
            placeholder="Front — prompt / term"
            rows={2}
            className="w-full rounded-xl px-3 py-2 resize-none"
            style={inputStyle}
          />
          <textarea
            value={slot.card?.back || ''}
            onChange={(e) => onChange({ card: { ...(slot.card || { front: '', back: '' }), back: e.target.value } })}
            placeholder="Back — answer / definition"
            rows={2}
            className="w-full rounded-xl px-3 py-2 resize-none"
            style={inputStyle}
          />
          <div className="flex gap-2">
            <input
              value={slot.card?.hint || ''}
              onChange={(e) => onChange({ card: { ...(slot.card || { front: '', back: '' }), hint: e.target.value } })}
              placeholder="Hint (optional)"
              className="flex-1 rounded-xl px-3 py-2"
              style={inputStyle}
            />
            <input
              value={slot.card?.hook || ''}
              onChange={(e) => onChange({ card: { ...(slot.card || { front: '', back: '' }), hook: e.target.value } })}
              placeholder="Memory hook (optional)"
              className="flex-1 rounded-xl px-3 py-2"
              style={inputStyle}
            />
          </div>
          <ItemMediaAttach
            imageUrl={slot.card?.imageUrl}
            videoUrl={slot.card?.videoUrl}
            onChange={(m) => onChange({
              card: {
                ...(slot.card || { front: '', back: '' }),
                ...(m.imageUrl !== undefined ? { imageUrl: m.imageUrl || undefined } : {}),
                ...(m.videoUrl !== undefined ? { videoUrl: m.videoUrl || undefined } : {}),
              },
            })}
            compact
          />
        </div>
      )}

      {slot.kind === 'category' && (
        <div className="space-y-2">
          <textarea
            value={slot.body || ''}
            onChange={(e) => onChange({ body: e.target.value })}
            placeholder={`Write the “${slot.title}” panel…`}
            rows={4}
            className="w-full rounded-xl px-3 py-2 resize-none"
            style={inputStyle}
          />
          <ItemMediaAttach
            imageUrl={slot.media?.kind === 'image' ? slot.media.url : ''}
            videoUrl={slot.media?.kind === 'video' ? slot.media.url : ''}
            onChange={(m) => {
              if (m.imageUrl !== undefined) {
                onChange({ media: m.imageUrl ? { url: m.imageUrl, kind: 'image' } : undefined });
              } else if (m.videoUrl !== undefined) {
                onChange({ media: m.videoUrl ? { url: m.videoUrl, kind: 'video' } : undefined });
              }
            }}
            compact
          />
        </div>
      )}

      {slot.kind === 'media' && slot.media && (
        <ItemMediaAttach
          imageUrl={slot.media.kind === 'image' ? slot.media.url : ''}
          videoUrl={slot.media.kind === 'video' ? slot.media.url : ''}
          onChange={(m) => {
            const url = m.imageUrl ?? m.videoUrl ?? '';
            const kind = m.imageUrl !== undefined ? 'image' : 'video';
            onChange({ media: { ...slot.media!, url, kind } });
          }}
        />
      )}
    </div>
  );
}

function QuestionSlotFields({ slot, onChange }: { slot: XV2Slot; onChange: (patch: Partial<XV2Slot>) => void }) {
  const q: QuestionContent = slot.question || blankQuestion();
  const setQ = (patch: Partial<QuestionContent>) => onChange({ question: { ...q, ...patch } });
  const options = q.options || [];

  return (
    <div className="space-y-2">
      {slot.kind === 'checkpoint' && (
        <label className="flex items-center gap-2" style={{ fontSize: 12, color: '#6B7280' }}>
          Pause at
          <input
            type="number"
            min={0}
            value={slot.time ?? 30}
            onChange={(e) => onChange({ time: Math.max(0, Number(e.target.value) || 0) })}
            className="w-20 rounded-lg px-2 py-1"
            style={inputStyle}
          />
          seconds
        </label>
      )}
      <textarea
        value={q.question}
        onChange={(e) => setQ({ question: e.target.value })}
        placeholder="Question stem…"
        rows={2}
        className="w-full rounded-xl px-3 py-2 resize-none"
        style={inputStyle}
      />
      <div className="space-y-1.5">
        {options.map((opt, oi) => (
          <div key={oi} className="flex items-center gap-2">
            <input
              type="radio"
              checked={(q.correct ?? 0) === oi}
              onChange={() => setQ({ correct: oi })}
              title="Correct answer"
            />
            <input
              value={opt}
              onChange={(e) => setQ({ options: options.map((o, j) => (j === oi ? e.target.value : o)) })}
              placeholder={`Option ${oi + 1}`}
              className="flex-1 rounded-lg px-2.5 py-1.5"
              style={inputStyle}
            />
            {options.length > 2 && (
              <button
                type="button"
                onClick={() => setQ({
                  options: options.filter((_, j) => j !== oi),
                  correct: (q.correct ?? 0) >= oi && (q.correct ?? 0) > 0 ? (q.correct ?? 0) - 1 : q.correct,
                })}
                className="p-1"
              >
                <Trash2 size={12} style={{ color: '#9AA3AF' }} />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setQ({ options: [...options, ''] })}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
          style={{ fontSize: 11.5, color: '#6B7280' }}
        >
          <Plus size={11} /> option
        </button>
      </div>
      <input
        value={q.explanation || ''}
        onChange={(e) => setQ({ explanation: e.target.value })}
        placeholder="Explanation shown after answering (optional)"
        className="w-full rounded-xl px-3 py-2"
        style={inputStyle}
      />
      <ItemMediaAttach
        imageUrl={q.imageUrl}
        videoUrl={q.videoUrl}
        onChange={(m) => setQ({
          ...(m.imageUrl !== undefined ? { imageUrl: m.imageUrl || undefined } : {}),
          ...(m.videoUrl !== undefined ? { videoUrl: m.videoUrl || undefined } : {}),
        })}
        compact
      />
    </div>
  );
}

/* ── per-unit AI generation ─────────────────────────────────── */

function highlightsToExtracts(highlights: any[]): TutorialExtract[] {
  return (highlights || [])
    .filter((h: any) => (h.tag === 'Use' || h.tag === 'Support' || !h.tag) && String(h.text || '').trim())
    .map((h: any) => ({
      kind: h.tag === 'Support' ? 'Fact' : 'Key point',
      text: String(h.text || '').trim(),
      from: h.sourceLabel || (h.page ? `p.${h.page}` : 'Source'),
      authorNote: String(h.comment || '').trim() || undefined,
    }));
}

function UnitGeneratePane({
  draft, unit, onChangeUnit, onDone,
}: {
  draft: StructuredV2Draft;
  unit: XV2Unit;
  onChangeUnit: (patch: Partial<XV2Unit>) => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<GenStep>('pick');
  const [activeTag, setActiveTag] = useState('Use');
  const [aiSuggestions, setAiSuggestions] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [scanning, setScanning] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const pool = draft.sourcePool || [];
  const picked = unit.pickedSourceIds || [];
  const highlights = unit.highlights || [];
  const markupFlags = unit.markupFlags || [];

  const markupBundle = useMemo(
    () => sourcePoolToMarkupSources(pool, picked.length ? picked : undefined),
    [pool, picked],
  );

  const toggleSource = (id: string) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    onChangeUnit({ pickedSourceIds: next });
  };

  const handleScanFlags = async (instruction?: string) => {
    const sentences = markupBundle.docParas.map((text, i) => ({ text, page: markupBundle.pages[i] || 1 }));
    if (!sentences.length) { setFlagError('Pick sources with text first.'); return; }
    const focus = String(instruction || unit.intent || unit.title || '').trim();
    if (!focus) { setFlagError('Enter a scan focus.'); return; }
    setFlagError(null);
    setScanning(true);
    try {
      const result = await suggestTutorialMarkupFlags(sentences, {
        instruction: focus,
        objective: String(draft.metadata.objective || '') || focus,
        title: draft.title || undefined,
      });
      onChangeUnit({ markupFlags: result.flags || [] });
      if (!(result.flags || []).length) setFlagError('No review items found — try a clearer focus.');
    } catch (e) {
      setFlagError(errorMessage(e, 'Document scan failed.'));
    } finally {
      setScanning(false);
    }
  };

  const runGenerate = async () => {
    const extracts = highlightsToExtracts(highlights);
    if (!extracts.length) {
      setError('Mark up Use/Support passages first — generation is grounded in your markup.');
      setStep('markup');
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    setBusy(true);
    setStep('run');
    setProgress('Starting…');
    const fv = draft.fv || {};
    const objective = String(draft.metadata.objective || '').trim();
    const scope = [unit.title, unit.intent].filter(Boolean).join(' — ');

    try {
      if (draft.type === 'quiz') {
        const collected: GeneratedQuizQuestion[] = [];
        for await (const ev of generateQuiz({
          title: draft.title || unit.title,
          config: {
            verify: objective || unit.title,
            purpose: fv.purpose ?? 'Formative check',
            concepts: scope,
            lvl: fv.lvl ?? 'Basic',
            qtypes: Array.isArray(fv.qtypes) && fv.qtypes.length ? fv.qtypes : ['Multiple choice', 'True/false'],
            cog: Array.isArray(fv.cog) && fv.cog.length ? fv.cog : ['Recall', 'Understand'],
            diff: fv.diff ?? 'Balanced',
            wrong: fv.wrong ?? 'Plausible common errors',
            adaptive: 'No',
            nq: Math.max(1, unit.slots.filter((s) => s.kind === 'question').length),
            passOn: fv.passOn !== false,
            pass: fv.pass ?? '70%',
            show: fv.show ?? 'After attempt',
            perq: fv.perq !== false,
          } as any,
          extracts,
          highlights: highlights.map((h: any) => ({
            text: h.text, tag: h.tag, comment: h.comment, page: h.page, idx: h.idx, sourceLabel: h.sourceLabel,
          })),
        }, ctrl.signal)) {
          if (ev.type === 'progress') setProgress(ev.message);
          else if (ev.type === 'question') { collected.push(ev.question); setProgress(`${collected.length} question${collected.length === 1 ? '' : 's'}…`); }
          else if (ev.type === 'error') throw new Error(ev.message);
          else if (ev.type === 'done') break;
        }
        if (!collected.length) throw new Error('No questions were generated.');
        const slots = unit.slots.filter((s) => s.kind === 'question');
        const nextSlots = unit.slots.map((s) => {
          if (s.kind !== 'question') return s;
          const idx = slots.indexOf(s);
          const q = collected[idx];
          if (!q) return s;
          return {
            ...s,
            question: {
              question: q.question,
              type: q.type || 'multiple-choice',
              options: q.options || [],
              correct: q.correct ?? 0,
              explanation: q.explanation || '',
              ...(Array.isArray((q as any).hints) ? { hints: (q as any).hints } : {}),
            } as QuestionContent,
            done: true,
          };
        });
        // Extra generated questions beyond the slot count become new slots.
        const extra = collected.slice(slots.length).map((q, i) => ({
          ...blankSlot('quiz', nextSlots.length + i),
          question: {
            question: q.question, type: q.type || 'multiple-choice', options: q.options || [],
            correct: q.correct ?? 0, explanation: q.explanation || '',
          } as QuestionContent,
          done: true,
        }));
        onChangeUnit({
          slots: [...nextSlots, ...extra],
          authorMode: bumpXAuthorMode(unit.authorMode, 'generated'),
          done: true,
        });
      } else if (draft.type === 'flashcard-set') {
        const collected: GeneratedCard[] = [];
        for await (const ev of generateFlashcards({
          title: draft.title || unit.title,
          config: {
            mem: objective || unit.intent || unit.title,
            aud: fv.aud ?? 'High school',
            lvl: fv.lvl ?? 'Basic',
            cc: [unit.title],
            pull: Array.isArray(fv.pull) && fv.pull.length ? fv.pull : ['Glossary / key terms in source'],
            dir: fv.dir ?? 'Front→back',
            hooks: fv.hooks ?? false,
            nc: Math.max(1, unit.slots.filter((s) => s.kind === 'card').length),
          },
          extracts,
        }, ctrl.signal)) {
          if (ev.type === 'progress') setProgress(ev.message);
          else if (ev.type === 'card') { collected.push(ev.card); setProgress(`${collected.length} card${collected.length === 1 ? '' : 's'}…`); }
          else if (ev.type === 'error') throw new Error(ev.message);
          else if (ev.type === 'done') break;
        }
        if (!collected.length) throw new Error('No cards were generated.');
        const cardSlots = unit.slots.filter((s) => s.kind === 'card');
        const nextSlots = unit.slots.map((s) => {
          if (s.kind !== 'card') return s;
          const idx = cardSlots.indexOf(s);
          const c = collected[idx];
          if (!c) return s;
          return {
            ...s,
            card: {
              front: c.front, back: c.back,
              ...(c.hook ? { hook: c.hook } : {}), ...(c.hint ? { hint: c.hint } : {}),
              ...(c.imageUrl ? { imageUrl: c.imageUrl } : {}),
            },
            done: true,
          };
        });
        const extra = collected.slice(cardSlots.length).map((c, i) => ({
          ...blankSlot('flashcard-set', nextSlots.length + i),
          card: { front: c.front, back: c.back, ...(c.hook ? { hook: c.hook } : {}), ...(c.hint ? { hint: c.hint } : {}) },
          done: true,
        }));
        onChangeUnit({
          slots: [...nextSlots, ...extra],
          authorMode: bumpXAuthorMode(unit.authorMode, 'generated'),
          done: true,
        });
      } else if (draft.type === 'concept-card') {
        const slot = unit.slots.find((s) => s.kind === 'category');
        if (!slot) throw new Error('No category slot in this unit.');
        const catId = slot.categoryId || 'meaning';
        const allCats = resolveConceptCategories(draft.fv.categories);
        const onlyThis = allCats.map((c) => ({ ...c, enabled: c.id === catId }));
        if (!onlyThis.some((c) => c.enabled)) {
          onlyThis.push({ id: catId, label: slot.title, enabled: true, builtin: false, tone: 'blue' });
        }
        let card: GeneratedConceptCard | null = null;
        for await (const ev of generateConceptCard({
          title: draft.title || slot.title,
          config: {
            concept: objective || draft.title || slot.title,
            aud: fv.aud ?? 'High school',
            lvl: fv.lvl ?? 'Basic',
            voi: fv.voi ?? 'Plain & friendly',
            len: fv.len ?? 'Standard',
            categories: onlyThis,
          },
          extracts,
          markupUnits: extracts.map((e) => ({ kind: e.kind, text: e.text, from: e.from, authorNote: e.authorNote })),
          prompt: unit.intent ? `Focus this ${slot.title} panel: ${unit.intent}` : undefined,
        }, ctrl.signal)) {
          if (ev.type === 'progress') setProgress(ev.message);
          else if (ev.type === 'card') card = ev.card;
          else if (ev.type === 'error') throw new Error(ev.message);
          else if (ev.type === 'done') break;
        }
        if (!card) throw new Error('Nothing was generated.');
        const body = categoryBody(card as any, catId)
          || (card as any).extraSections?.find((s: any) => s.id === catId)?.body
          || (card as any).oneSentenceMeaning
          || '';
        if (!String(body).trim()) throw new Error(`The model returned no “${slot.title}” content — try clearer markup.`);
        onChangeUnit({
          slots: unit.slots.map((s) => (s.id === slot.id ? { ...s, body: String(body).trim(), done: true } : s)),
          authorMode: bumpXAuthorMode(unit.authorMode, 'generated'),
          done: true,
        });
      } else {
        // video-script — needs the video from Sources
        if (!draft.video?.url && !draft.video?.videoId) {
          throw new Error('Add a YouTube video in Sources first — checkpoints attach to it.');
        }
        const cpSlots = unit.slots.filter((s) => s.kind === 'checkpoint');
        let content: any = null;
        for await (const ev of generateVideoScript({
          title: draft.title || unit.title,
          config: {
            obj: objective || unit.intent || unit.title,
            aud: fv.aud ?? 'High school',
            lvl: fv.lvl ?? 'Basic',
            ncp: Math.max(1, cpSlots.length),
            showTranscript: fv.showTranscript !== false,
            enableChat: fv.enableChat !== false,
            requireAnswer: true,
          },
          extracts,
          videoUrl: draft.video?.url || undefined,
          videoId: draft.video?.videoId || undefined,
          videoTitle: draft.video?.title || undefined,
          transcriptSegments: draft.video?.transcript?.length ? draft.video.transcript : undefined,
        }, ctrl.signal)) {
          if (ev.type === 'progress') setProgress(ev.message);
          else if (ev.type === 'result') content = ev.content;
          else if (ev.type === 'error') throw new Error(ev.message);
          else if (ev.type === 'done') break;
        }
        const cps: any[] = content?.checkpoints || [];
        if (!cps.length) throw new Error('No checkpoints were generated.');
        const nextSlots = unit.slots.map((s) => {
          if (s.kind !== 'checkpoint') return s;
          const idx = cpSlots.indexOf(s);
          const cp = cps[idx];
          if (!cp) return s;
          return { ...s, time: cp.time ?? s.time, question: { ...cp.question }, done: true };
        });
        const extra = cps.slice(cpSlots.length).map((cp, i) => ({
          ...blankSlot('video-script', nextSlots.length + i),
          time: cp.time,
          question: { ...cp.question },
          done: true,
        }));
        onChangeUnit({
          slots: [...nextSlots, ...extra],
          authorMode: bumpXAuthorMode(unit.authorMode, 'generated'),
          done: true,
        });
      }
      setBusy(false);
      onDone();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') { setBusy(false); return; }
      setError(errorMessage(e, 'Generation failed.'));
      setBusy(false);
    } finally {
      abortRef.current = null;
    }
  };

  const steps: { id: GenStep; label: string }[] = [
    { id: 'pick', label: '1. Pick sources' },
    { id: 'markup', label: '2. Mark up' },
    { id: 'run', label: '3. Generate' },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {steps.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => !busy && setStep(s.id)}
            className="px-3 py-1.5 rounded-full border"
            style={{
              fontSize: 12,
              fontWeight: 600,
              background: step === s.id ? '#EEF2FF' : '#fff',
              borderColor: step === s.id ? '#14B8A6' : 'rgba(0,0,0,0.1)',
              color: '#374151',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {(error || flagError) && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background: '#FEF2F2', color: '#991B1B', fontSize: 13 }}>
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error || flagError}</span>
        </div>
      )}

      {step === 'pick' && (
        <div className="space-y-2">
          {!pool.length && (
            <p style={{ fontSize: 13.5, color: '#B45309' }}>
              No sources yet — go back to the Sources step and add material first.
            </p>
          )}
          {pool.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer"
              style={{
                borderColor: picked.includes(s.id) ? '#A78BFA' : 'rgba(0,0,0,0.08)',
                background: picked.includes(s.id) ? '#F5F3FF' : '#fff',
              }}
            >
              <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggleSource(s.id)} />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 12, color: '#9AA3AF' }}>{s.kind} · {s.sentences?.length || 0} sentences</div>
              </div>
            </label>
          ))}
          <button
            type="button"
            disabled={!picked.length && !!pool.length}
            onClick={() => setStep('markup')}
            className="mt-2 px-4 py-2 rounded-full text-white disabled:opacity-40"
            style={{ fontSize: 13, fontWeight: 600, background: '#0B0F1A' }}
          >
            Continue to mark up →
          </button>
        </div>
      )}

      {step === 'markup' && (
        <div>
          {!markupBundle.docParas.length ? (
            <p style={{ fontSize: 13.5, color: '#B45309' }}>Pick sources with text first.</p>
          ) : (
            <MarkupWorkspace
              sources={markupBundle.sources as MarkupSource[]}
              docParas={markupBundle.docParas}
              pages={markupBundle.pages}
              highlights={highlights}
              setHighlights={(h: any) => onChangeUnit({ highlights: typeof h === 'function' ? h(highlights) : h })}
              activeTag={activeTag}
              setActiveTag={setActiveTag}
              aiSuggestions={aiSuggestions}
              setAiSuggestions={setAiSuggestions}
              query={query}
              setQuery={setQuery}
              markupFlags={markupFlags}
              setMarkupFlags={(f: any) => onChangeUnit({ markupFlags: typeof f === 'function' ? f(markupFlags) : f })}
              onScanFlags={handleScanFlags}
              scanningFlags={scanning}
              flagError={flagError}
              definedSections={[]}
            />
          )}
          <button
            type="button"
            onClick={() => void runGenerate()}
            className="mt-4 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-white"
            style={{ fontSize: 13, fontWeight: 650, background: '#059669' }}
          >
            <Sparkles size={14} /> Generate {unit.title}
          </button>
        </div>
      )}

      {step === 'run' && (
        <div className="py-8 text-center">
          {busy ? (
            <>
              <Loader2 size={26} className="animate-spin mx-auto mb-3" style={{ color: '#0B0F1A' }} />
              <p style={{ fontSize: 14, fontWeight: 650 }}>Generating…</p>
              <p style={{ fontSize: 13, color: '#6B7280', marginTop: 6 }}>{progress}</p>
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="mt-4 px-3 py-1.5 rounded-full border"
                style={{ fontSize: 12 }}
              >
                Cancel
              </button>
            </>
          ) : error ? (
            <>
              <p style={{ fontSize: 14, color: '#B91C1C', marginBottom: 12 }}>{error}</p>
              <button
                type="button"
                onClick={() => setStep('markup')}
                className="px-4 py-2 rounded-full text-white"
                style={{ fontSize: 13, fontWeight: 600, background: '#0B0F1A' }}
              >
                Back to mark up
              </button>
            </>
          ) : (
            <p style={{ fontSize: 13.5, color: '#065F46' }}>Generated — switching to Write so you can refine each item.</p>
          )}
        </div>
      )}
    </div>
  );
}
