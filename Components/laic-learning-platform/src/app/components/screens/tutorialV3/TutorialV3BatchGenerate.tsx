/**
 * Mark up once, generate several.
 *
 * The same three steps a single section runs — pick sources, mark up, generate
 * — except the markup is done once and applied to every target the author
 * ticked on the outline. Nothing new is asked of them; the repetition is what
 * goes away.
 *
 * Targets run one at a time and independently: a failure is reported against
 * that row and the rest carry on, because a batch that abandons four good
 * sections over one bad one is worse than no batch at all.
 */

import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, Loader2, Sparkles } from 'lucide-react';
import { MarkupWorkspace, type MarkupSource } from '../MarkupWorkspace';
import { sourcePoolToMarkupSources } from '../../../../lib/tutorialV3/draftModel';
import { unitsFromSourcePool } from '../../../../lib/tutorialV3/sourceFirst';
import { getTutorialTemplate } from '../../../../lib/tutorialV3/tutorialTemplates';
import { embedTypeLabel } from '../../../../lib/tutorialV3/recipeStructure';
import {
  runBatchGenerate,
  type BatchOutcome,
  type BatchTarget,
} from '../../../../lib/tutorialV3/batchGenerate';
import type { TutorialV3Draft, V3Section, V3TopLevelSlot } from '../../../../lib/tutorialV3/types';
import { V3_NAVY, V3_SAGE, V3_SAGE_BORDER, V3_SAGE_TINT } from '../../../../lib/tutorialV3/authorTheme';

type Step = 'pick' | 'markup' | 'run';

export function TutorialV3BatchGenerate({
  draft,
  selection,
  onBack,
  onSectionDone,
  onSlotDone,
  noMarkup = false,
}: {
  draft: TutorialV3Draft;
  selection: { kind: 'section' | 'slot'; id: string }[];
  /**
   * Skip the markup step: the model reads the picked sources whole and decides
   * what matters. Marking up is how an author says which passages count, so
   * when they have chosen not to, everything counts.
   */
  noMarkup?: boolean;
  onBack: () => void;
  onSectionDone: (sectionId: string, patch: Partial<V3Section>) => void;
  onSlotDone: (slotId: string, patch: Partial<V3TopLevelSlot>) => void;
}) {
  const pool = draft.sourcePool || [];
  const template = getTutorialTemplate(draft.templateId);

  /** The ticked rows, resolved to what they actually are. */
  const targets = useMemo<BatchTarget[]>(() => selection.map((sel) => {
    if (sel.kind === 'section') {
      const sec = (draft.sections || []).find((s) => s.id === sel.id);
      return { kind: 'section' as const, id: sel.id, title: sec?.title || 'Section' };
    }
    const slot = (draft.topLevelSlots || []).find((s) => s.id === sel.id);
    return {
      kind: 'slot' as const,
      id: sel.id,
      title: embedTypeLabel(String(slot?.objectType || 'content')),
      objectType: String(slot?.objectType || 'quiz'),
    };
  }), [selection, draft.sections, draft.topLevelSlots]);

  const [step, setStep] = useState<Step>('pick');
  const [picked, setPicked] = useState<string[]>(() => {
    // Seed from whatever the first target already had, so an author who marked
    // one up by hand is not made to start over.
    const first = selection[0];
    const src = first?.kind === 'section'
      ? (draft.sections || []).find((s) => s.id === first.id)?.pickedSourceIds
      : (draft.topLevelSlots || []).find((s) => s.id === first?.id)?.pickedSourceIds;
    return src?.length ? [...src] : pool.map((s) => s.id);
  });
  const [highlights, setHighlights] = useState<any[]>([]);
  const [markupFlags, setMarkupFlags] = useState<any[]>([]);
  const [activeTag, setActiveTag] = useState('Use');
  const [aiSuggestions, setAiSuggestions] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, BatchOutcome>>({});
  const abortRef = useRef<AbortController | null>(null);

  const markupBundle = useMemo(
    () => sourcePoolToMarkupSources(pool, picked.length ? picked : undefined),
    [pool, picked],
  );

  const usable = highlights.filter((h) => h.tag === 'Use' || h.tag === 'Support' || !h.tag).length;
  const poolUnits = useMemo(
    () => (noMarkup ? unitsFromSourcePool(pool, picked) : []),
    [noMarkup, pool, picked],
  );

  /** `only` re-runs a subset rather than the whole set. */
  const start = async (only?: BatchTarget[]) => {
    const batch = only?.length ? only : targets;
    setStep('run');
    setBusy(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // Only the rows being run are reset; anything already generated keeps its
    // result so a retry does not make finished work look pending again.
    setOutcomes((prev) => ({
      ...prev,
      ...Object.fromEntries(batch.map((t) => [t.id, { target: t, status: 'pending' as const }])),
    }));
    try {
      await runBatchGenerate({
        draft,
        template,
        targets: batch,
        markup: noMarkup
          ? { pickedSourceIds: picked, highlights: [], units: poolUnits }
          : { pickedSourceIds: picked, highlights, markupFlags },
        signal: ctrl.signal,
        onOutcome: (o) => setOutcomes((prev) => ({ ...prev, [o.target.id]: o })),
        onSectionDone,
        onSlotDone,
      });
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const doneCount = Object.values(outcomes).filter((o) => o.status === 'done').length;
  const failedCount = Object.values(outcomes).filter((o) => o.status === 'failed').length;
  const finished = step === 'run' && !busy;

  return (
    <div className="max-w-4xl mx-auto px-4 py-5">
      <button
        type="button"
        onClick={() => { abortRef.current?.abort(); onBack(); }}
        className="inline-flex items-center gap-1.5 mb-4"
        style={{ fontSize: 13, fontWeight: 650, color: '#57534e' }}
      >
        <ArrowLeft size={14} /> Back to the outline
      </button>

      <div
        className="rounded-2xl px-4 py-3 mb-5"
        style={{ background: V3_SAGE_TINT, border: `1px solid ${V3_SAGE_BORDER}` }}
      >
        <p style={{ fontSize: 13.5, fontWeight: 700, color: '#2f4e39' }}>
          Generating {targets.length} together
        </p>
        <p style={{ fontSize: 12.5, color: '#44403c', marginTop: 3, lineHeight: 1.5 }}>
          {targets.map((t) => t.title).join(' · ')}
        </p>
        <p style={{ fontSize: 12, color: '#57534e', marginTop: 6, lineHeight: 1.5 }}>
          {noMarkup
            ? 'No markup step — the model reads the picked sources whole and decides what matters. Anything you did not select stays yours to author.'
            : 'One markup pass, applied to every one of them.'}
        </p>
      </div>

      {/* Step rail */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(noMarkup ? (['pick', 'run'] as Step[]) : (['pick', 'markup', 'run'] as Step[])).map((s, i) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => !busy && setStep(s)}
            className="px-3 py-1.5 rounded-full border disabled:opacity-50"
            style={{
              fontSize: 12,
              fontWeight: 600,
              background: step === s ? V3_SAGE_TINT : '#fff',
              borderColor: step === s ? V3_SAGE_BORDER : 'rgba(0,0,0,0.1)',
              color: '#44403c',
            }}
          >
            {i + 1}. {s === 'pick' ? 'Pick sources' : s === 'markup' ? 'Mark up once' : 'Generate all'}
          </button>
        ))}
      </div>

      {step === 'pick' && (
        <div className="space-y-2">
          <p style={{ fontSize: 13, color: '#57534e', marginBottom: 8 }}>
            These sources are used for every one of the {targets.length} selected.
          </p>
          {!pool.length && (
            <p style={{ fontSize: 13.5, color: '#B45309' }}>
              No sources in the pool yet — attach sources first.
            </p>
          )}
          {pool.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer"
              style={{
                borderColor: picked.includes(s.id) ? V3_SAGE : 'rgba(0,0,0,0.08)',
                background: picked.includes(s.id) ? V3_SAGE_TINT : '#fff',
              }}
            >
              <input
                type="checkbox"
                checked={picked.includes(s.id)}
                onChange={() => setPicked((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))}
              />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0B1220' }}>{s.label}</div>
                <div style={{ fontSize: 12, color: '#9AA3AF' }}>{s.kind} · {s.sentences?.length || 0} sentences</div>
              </div>
            </label>
          ))}
          <button
            type="button"
            disabled={(!picked.length && !!pool.length) || (noMarkup && !poolUnits.length)}
            onClick={() => (noMarkup ? void start() : setStep('markup'))}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-white disabled:opacity-40"
            style={{ fontSize: 13, fontWeight: 650, background: V3_SAGE }}
          >
            {noMarkup ? <Sparkles size={14} /> : null}
            {noMarkup ? `Generate all ${targets.length} from these sources` : 'Continue to mark up'}
          </button>
        </div>
      )}

      {step === 'markup' && (
        <div>
          {!markupBundle.docParas.length ? (
            <p style={{ fontSize: 13.5, color: '#B45309' }}>Selected sources have no text yet.</p>
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
            />
          )}
          <button
            type="button"
            disabled={!usable}
            onClick={() => void start()}
            className="mt-4 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-white disabled:opacity-40"
            style={{ fontSize: 13.5, fontWeight: 650, background: V3_SAGE }}
          >
            <Sparkles size={14} />
            Generate all {targets.length} from this markup
          </button>
          {!usable && (
            <p style={{ fontSize: 12.5, color: '#B45309', marginTop: 8 }}>
              Tag at least one passage Use or Support — that is what generation reads.
            </p>
          )}
        </div>
      )}

      {step === 'run' && (
        <div className="space-y-2">
          <p style={{ fontSize: 13, color: '#57534e', marginBottom: 8 }}>
            {busy
              ? (noMarkup
                ? 'Generating one at a time — the model is reading your sources and deciding what matters. You can leave this running.'
                : 'Generating one at a time from your markup — you can leave this running.')
              : `Finished · ${doneCount} generated${failedCount ? `, ${failedCount} failed` : ''}.`}
          </p>
          {targets.map((t) => {
            const o = outcomes[t.id];
            const status = o?.status || 'pending';
            return (
              <div
                key={t.id}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{
                  background: status === 'failed' ? 'rgba(239,68,68,0.05)' : '#fff',
                  border: `1px solid ${status === 'failed' ? 'rgba(239,68,68,0.25)' : 'rgba(0,0,0,0.06)'}`,
                }}
              >
                <span className="shrink-0 flex items-center justify-center" style={{ width: 22, height: 22 }}>
                  {status === 'running' && <Loader2 size={15} className="animate-spin" style={{ color: V3_SAGE }} />}
                  {status === 'done' && <Check size={15} style={{ color: V3_SAGE }} />}
                  {status === 'failed' && <AlertTriangle size={15} style={{ color: '#DC2626' }} />}
                  {status === 'pending' && <span style={{ width: 8, height: 8, borderRadius: 99, background: '#D6D3D1' }} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p style={{ fontSize: 13.5, fontWeight: 650, color: '#0B1220' }}>{t.title}</p>
                  {o?.message && (
                    <p style={{ fontSize: 12, color: '#B91C1C', marginTop: 2, lineHeight: 1.45 }}>{o.message}</p>
                  )}
                </div>
                <span style={{ fontSize: 11.5, color: '#9AA3AF', fontWeight: 600 }}>
                  {status === 'pending' ? 'waiting' : status}
                </span>
              </div>
            );
          })}

          {finished && (
            <button
              type="button"
              onClick={onBack}
              className="mt-3 px-5 py-2.5 rounded-full text-white"
              style={{ fontSize: 13.5, fontWeight: 650, background: V3_NAVY }}
            >
              Back to the outline
            </button>
          )}
          {busy && (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="mt-3 px-4 py-2 rounded-full border"
              style={{ fontSize: 12.5, fontWeight: 600, color: '#6B7280', borderColor: 'rgba(0,0,0,0.12)', background: '#fff' }}
            >
              Stop
            </button>
          )}
        </div>
      )}
    </div>
  );
}
