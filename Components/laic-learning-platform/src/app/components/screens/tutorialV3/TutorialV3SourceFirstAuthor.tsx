/**
 * The Author step on the source-first path.
 *
 * There is nothing to author. The structure came from the sources and so does
 * the content, so this screen is one button and an honest account of what it is
 * doing to what.
 *
 * It reuses the batch runner rather than having a generator of its own: same
 * per-target isolation, same commit-as-you-go, same reporting. The only
 * difference from a hand-driven batch is that the units come from the pool
 * instead of from markup, because on this path there is no markup step.
 */

import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2, Sparkles } from 'lucide-react';
import { getTutorialTemplate } from '../../../../lib/tutorialV3/tutorialTemplates';
import { embedTypeLabel } from '../../../../lib/tutorialV3/recipeStructure';
import { unitsFromSourcePool } from '../../../../lib/tutorialV3/sourceFirst';
import {
  runBatchGenerate,
  type BatchOutcome,
  type BatchTarget,
} from '../../../../lib/tutorialV3/batchGenerate';
import type { TutorialV3Draft, V3Section, V3TopLevelSlot } from '../../../../lib/tutorialV3/types';
import { V3_NAVY, V3_SAGE, V3_SAGE_BORDER, V3_SAGE_TINT } from '../../../../lib/tutorialV3/authorTheme';

export function TutorialV3SourceFirstAuthor({
  draft,
  onSectionDone,
  onSlotDone,
  onReview,
}: {
  draft: TutorialV3Draft;
  onSectionDone: (sectionId: string, patch: Partial<V3Section>) => void;
  onSlotDone: (slotId: string, patch: Partial<V3TopLevelSlot>) => void;
  onReview: () => void;
}) {
  const template = getTutorialTemplate(draft.templateId);
  const pool = draft.sourcePool || [];

  const targets = useMemo<BatchTarget[]>(() => [
    ...(draft.topLevelSlots || [])
      .filter((s) => s.kind === 'generate')
      .map((s) => ({
        kind: 'slot' as const,
        id: s.id,
        title: embedTypeLabel(String(s.objectType)),
        objectType: String(s.objectType),
      })),
    ...(draft.sections || []).map((s) => ({
      kind: 'section' as const,
      id: s.id,
      title: s.title,
    })),
  ], [draft.sections, draft.topLevelSlots]);

  const pickedSourceIds = useMemo(() => {
    const fromSection = (draft.sections || [])[0]?.pickedSourceIds;
    return fromSection?.length ? fromSection : pool.map((s) => s.id);
  }, [draft.sections, pool]);

  const units = useMemo(
    () => unitsFromSourcePool(pool, pickedSourceIds),
    [pool, pickedSourceIds],
  );

  /**
   * What each target already holds, read off the draft.
   *
   * Coming back to this step used to show nothing but the generate button, as
   * though the run had never happened — the record of it lived only in React
   * state that died with the screen. The draft already knows what was written,
   * so the screen reads it rather than remembering it.
   */
  const authored = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of targets) {
      if (t.kind === 'section') {
        map[t.id] = ((draft.sections || []).find((sec) => sec.id === t.id)?.parts || []).length;
      } else {
        const slot = (draft.topLevelSlots || []).find((sl) => sl.id === t.id);
        map[t.id] = (slot?.parts?.length || (slot?.part ? 1 : 0));
      }
    }
    return map;
  }, [targets, draft.sections, draft.topLevelSlots]);

  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(() => Object.values(authored).some((n) => n > 0));
  const [outcomes, setOutcomes] = useState<Record<string, BatchOutcome>>(
    () => Object.fromEntries(targets.map((t) => [
      t.id,
      { target: t, status: authored[t.id] ? 'done' as const : 'pending' as const },
    ])),
  );
  const abortRef = useRef<AbortController | null>(null);

  /** `only` re-runs a subset — what "try the failed ones again" actually means. */
  const run = async (only?: BatchTarget[]) => {
    const batch = only?.length ? only : targets;
    setStarted(true);
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
        markup: { pickedSourceIds, highlights: [], units },
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

  const done = Object.values(outcomes).filter((o) => o.status === 'done').length;
  const failed = Object.values(outcomes).filter((o) => o.status === 'failed').length;
  const finished = started && !busy;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-0">
      <div
        className="rounded-2xl px-4 py-3 mb-5"
        style={{ background: V3_SAGE_TINT, border: `1px solid ${V3_SAGE_BORDER}` }}
      >
        <p style={{ fontSize: 13.5, fontWeight: 700, color: '#2f4e39' }}>
          {targets.length} to generate, all from your sources
        </p>
        <p style={{ fontSize: 12.5, color: '#44403c', marginTop: 3, lineHeight: 1.5 }}>
          Reading {units.length} unit{units.length === 1 ? '' : 's'} from the {pickedSourceIds.length} source
          {pickedSourceIds.length === 1 ? '' : 's'} you attached. There is no markup step on this path — every
          picked source counts. Each piece is written on its own, so one failing does not stop the others.
        </p>
      </div>

      {!started && (
        <button
          type="button"
          onClick={() => void run()}
          disabled={!targets.length || !units.length}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-white disabled:opacity-40"
          style={{ fontSize: 14.5, fontWeight: 700, background: V3_SAGE }}
        >
          <Sparkles size={16} />
          Generate the whole tutorial
        </button>
      )}
      {!started && !units.length && (
        <p style={{ fontSize: 13, color: '#B45309', marginTop: 10 }}>
          The picked sources have no readable text.
        </p>
      )}

      {started && (
        <div className="space-y-2">
          <p style={{ fontSize: 13, color: '#57534e', marginBottom: 8 }}>
            {busy
              ? 'Writing one piece at a time — you can leave this running.'
              : `Finished · ${done} generated${failed ? `, ${failed} failed` : ''}.`}
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
                  {authored[t.id] > 0 && (
                    <p style={{ fontSize: 12, color: '#57534e', marginTop: 2 }}>
                      {authored[t.id]} block{authored[t.id] === 1 ? '' : 's'} written
                    </p>
                  )}
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

          <div className="flex flex-wrap gap-2 pt-2">
            {finished && Object.values(authored).some((n) => !n) && (
              <button
                type="button"
                onClick={() => void run(targets.filter((t) => !authored[t.id]))}
                className="px-4 py-2.5 rounded-full text-white"
                style={{ fontSize: 13.5, fontWeight: 650, background: V3_SAGE }}
              >
                Generate what is still empty
              </button>
            )}
            {finished && (
              <button
                type="button"
                onClick={onReview}
                className="px-5 py-3 rounded-full text-white"
                style={{ fontSize: 14, fontWeight: 700, background: V3_NAVY }}
              >
                Continue to review
              </button>
            )}
            {finished && failed > 0 && (
              <button
                type="button"
                onClick={() => void run(
                  Object.values(outcomes).filter((o) => o.status === 'failed').map((o) => o.target),
                )}
                className="px-4 py-2.5 rounded-full border"
                style={{ fontSize: 13, fontWeight: 650, color: '#44403c', borderColor: 'rgba(0,0,0,0.12)', background: '#fff' }}
              >
                Try the failed ones again
              </button>
            )}
            {busy && (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="px-4 py-2 rounded-full border"
                style={{ fontSize: 12.5, fontWeight: 600, color: '#6B7280', borderColor: 'rgba(0,0,0,0.12)', background: '#fff' }}
              >
                Stop
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
