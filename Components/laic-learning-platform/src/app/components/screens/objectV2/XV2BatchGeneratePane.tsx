/**
 * Concept-card batch generation — one pick-sources → mark-up → generate run
 * that fills ANY selection of categories in a single AI call, instead of
 * repeating the pipeline once per category.
 */
import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { MarkupWorkspace, type MarkupSource } from '../MarkupWorkspace';
import {
  errorMessage,
  generateConceptCard,
  suggestTutorialMarkupFlags,
  type GeneratedConceptCard,
  type TutorialExtract,
} from '../../../../lib/api';
import { categoryBody, resolveConceptCategories, slugCategoryId } from '../../../../lib/conceptCard';
import { sourcePoolToMarkupSources } from '../../../../lib/tutorialV2/draftModel';
import {
  bumpXAuthorMode,
  touchXDraft,
  type StructuredV2Draft,
} from '../../../../lib/objectV2/structuredDraft';

type Step = 'pick' | 'markup' | 'run';

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

export function XV2BatchGeneratePane({
  draft,
  unitIds,
  onChangeDraft,
  onDone,
}: {
  draft: StructuredV2Draft;
  unitIds: string[];
  onChangeDraft: (next: StructuredV2Draft) => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>('pick');
  const [picked, setPicked] = useState<string[]>([]);
  const [highlights, setHighlights] = useState<any[]>([]);
  const [markupFlags, setMarkupFlags] = useState<any[]>([]);
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
  const selectedUnits = draft.units.filter((u) => unitIds.includes(u.id));

  const markupBundle = useMemo(
    () => sourcePoolToMarkupSources(pool, picked.length ? picked : undefined),
    [pool, picked],
  );

  const toggleSource = (id: string) => {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleScanFlags = async (instruction?: string) => {
    const sentences = markupBundle.docParas.map((text, i) => ({ text, page: markupBundle.pages[i] || 1 }));
    if (!sentences.length) { setFlagError('Pick sources with text first.'); return; }
    const focus = String(instruction || selectedUnits.map((u) => u.title).join(', ')).trim();
    setFlagError(null);
    setScanning(true);
    try {
      const result = await suggestTutorialMarkupFlags(sentences, {
        instruction: focus,
        objective: String(draft.metadata.objective || '') || focus,
        title: draft.title || undefined,
      });
      setMarkupFlags(result.flags || []);
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

    // Category id per selected unit (custom categories get a slug id).
    const idByUnit = new Map<string, string>();
    for (const u of selectedUnits) {
      const slot = u.slots.find((s) => s.kind === 'category');
      idByUnit.set(u.id, slot?.categoryId || slugCategoryId(slot?.title || u.title));
    }
    const wantedIds = new Set(idByUnit.values());

    // One config with exactly the selected categories enabled.
    const categories = resolveConceptCategories(fv.categories).map((c) => ({
      ...c,
      enabled: wantedIds.has(c.id),
    }));
    for (const u of selectedUnits) {
      const id = idByUnit.get(u.id)!;
      if (!categories.some((c) => c.id === id)) {
        categories.push({ id, label: u.title, enabled: true, builtin: false, tone: 'blue' });
      }
    }

    try {
      let card: GeneratedConceptCard | null = null;
      for await (const ev of generateConceptCard({
        title: draft.title || 'Concept card',
        config: {
          concept: objective || draft.title || selectedUnits[0]?.title || 'Concept',
          aud: fv.aud ?? 'High school',
          lvl: fv.lvl ?? 'Basic',
          voi: fv.voi ?? 'Plain & friendly',
          len: fv.len ?? 'Standard',
          categories,
        },
        extracts,
        markupUnits: extracts.map((e) => ({ kind: e.kind, text: e.text, from: e.from, authorNote: e.authorNote })),
      }, ctrl.signal)) {
        if (ev.type === 'progress') setProgress(ev.message);
        else if (ev.type === 'card') card = ev.card;
        else if (ev.type === 'error') throw new Error(ev.message);
        else if (ev.type === 'done') break;
      }
      if (!card) throw new Error('Nothing was generated.');

      const emptyOnes: string[] = [];
      const nextUnits = draft.units.map((u) => {
        if (!unitIds.includes(u.id)) return u;
        const catId = idByUnit.get(u.id)!;
        const body = String(
          categoryBody(card as any, catId)
          || (card as any).extraSections?.find((s: any) => s.id === catId)?.body
          || '',
        ).trim();
        if (!body) { emptyOnes.push(u.title); return u; }
        return {
          ...u,
          slots: u.slots.map((s) => (s.kind === 'category' ? { ...s, body, done: true } : s)),
          authorMode: bumpXAuthorMode(u.authorMode, 'generated'),
          done: true,
        };
      });
      onChangeDraft(touchXDraft(draft, { units: nextUnits }));
      setBusy(false);
      if (emptyOnes.length) {
        setError(`Generated, but no content came back for: ${emptyOnes.join(', ')}. Open those categories individually or retry with clearer markup.`);
      } else {
        onDone();
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') { setBusy(false); return; }
      setError(errorMessage(e, 'Generation failed.'));
      setBusy(false);
    } finally {
      abortRef.current = null;
    }
  };

  const steps: { id: Step; label: string }[] = [
    { id: 'pick', label: '1. Pick sources' },
    { id: 'markup', label: '2. Mark up' },
    { id: 'run', label: '3. Generate' },
  ];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-3 px-3 py-2 rounded-xl" style={{ background: '#F5F3FF', border: '1px solid rgba(124,58,237,0.25)' }}>
        <p style={{ fontSize: 12.5, fontWeight: 650, color: '#5B21B6' }}>
          Generating {selectedUnits.length} categor{selectedUnits.length === 1 ? 'y' : 'ies'} in one run
        </p>
        <p style={{ fontSize: 12, color: '#6D28D9' }}>{selectedUnits.map((u) => u.title).join(' · ')}</p>
      </div>

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
              setHighlights={setHighlights}
              activeTag={activeTag}
              setActiveTag={setActiveTag}
              aiSuggestions={aiSuggestions}
              setAiSuggestions={setAiSuggestions}
              query={query}
              setQuery={setQuery}
              markupFlags={markupFlags}
              setMarkupFlags={setMarkupFlags}
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
            <Sparkles size={14} /> Generate {selectedUnits.length} categor{selectedUnits.length === 1 ? 'y' : 'ies'}
          </button>
        </div>
      )}

      {step === 'run' && (
        <div className="py-8 text-center">
          {busy ? (
            <>
              <Loader2 size={26} className="animate-spin mx-auto mb-3" style={{ color: '#0B0F1A' }} />
              <p style={{ fontSize: 14, fontWeight: 650 }}>Generating {selectedUnits.length} categories…</p>
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
              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep('markup')}
                  className="px-4 py-2 rounded-full text-white"
                  style={{ fontSize: 13, fontWeight: 600, background: '#0B0F1A' }}
                >
                  Back to mark up
                </button>
                <button
                  type="button"
                  onClick={onDone}
                  className="px-4 py-2 rounded-full border"
                  style={{ fontSize: 13, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.12)' }}
                >
                  Back to outline
                </button>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 13.5, color: '#065F46' }}>Generated — returning to the outline.</p>
          )}
        </div>
      )}
    </div>
  );
}
