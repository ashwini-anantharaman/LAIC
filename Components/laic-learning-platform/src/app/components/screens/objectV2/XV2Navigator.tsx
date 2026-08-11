/**
 * Author hub — one row per Structure unit with status, opens the unit
 * workspace; Review gate once required units have content.
 */
import React, { useState } from 'react';
import { Check, ChevronRight, PenLine, Sparkles } from 'lucide-react';
import {
  X_SLOT_NOUN,
  allUnitsReady,
  slotHasContent,
  unitStatus,
  type StructuredV2Draft,
} from '../../../../lib/objectV2/structuredDraft';

const STATUS_STYLE = {
  not_started: { bg: '#F3F4F6', text: '#6B7280', label: 'Not started' },
  in_progress: { bg: '#FEF3C7', text: '#92400E', label: 'In progress' },
  done: { bg: '#D1FAE5', text: '#065F46', label: 'Done' },
} as const;

export function XV2Navigator({
  draft,
  onOpenUnit,
  onReview,
  onBatchGenerate,
}: {
  draft: StructuredV2Draft;
  onOpenUnit: (unitId: string) => void;
  onReview: () => void;
  /** When set, rows are multi-selectable and the batch AI button shows. */
  onBatchGenerate?: (unitIds: string[]) => void;
}) {
  const canReview = allUnitsReady(draft.units);
  const slotNoun = X_SLOT_NOUN[draft.type];
  const [selected, setSelected] = useState<string[]>([]);
  const allIds = draft.units.map((u) => u.id);
  const allSelected = selected.length === allIds.length && allIds.length > 0;
  const toggleUnit = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p style={{ fontSize: 13, color: '#6B7280' }}>
          {canReview
            ? 'All parts have content — review when ready.'
            : 'Open each part below — write it yourself or generate it from your sources.'}
        </p>
        <button
          type="button"
          disabled={!canReview}
          onClick={onReview}
          className="px-4 py-2 rounded-full text-white disabled:opacity-40 shrink-0"
          style={{ fontSize: 13, fontWeight: 650, background: '#0B0F1A' }}
          title={canReview ? 'Review & submit' : 'Author every required part first'}
        >
          Review & submit →
        </button>
      </div>

      {onBatchGenerate && (
        <div
          className="flex flex-wrap items-center gap-2 mb-3 px-3 py-2.5 rounded-2xl border"
          style={{ background: '#F5F3FF', borderColor: 'rgba(124,58,237,0.25)' }}
        >
          <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 12.5, fontWeight: 650, color: '#5B21B6' }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? [] : allIds)}
            />
            Select all
          </label>
          <span style={{ fontSize: 12, color: '#6D28D9' }}>
            {selected.length
              ? `${selected.length} categor${selected.length === 1 ? 'y' : 'ies'} selected`
              : 'Tick categories below to generate several in one run'}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            disabled={!selected.length}
            onClick={() => onBatchGenerate(selected)}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-white disabled:opacity-40"
            style={{ fontSize: 12.5, fontWeight: 650, background: '#7C3AED' }}
          >
            <Sparkles size={13} /> Generate selected with AI
          </button>
        </div>
      )}

      <div className="space-y-2">
        {draft.units.map((unit, i) => {
          const status = unitStatus(unit);
          const st = STATUS_STYLE[status];
          const filled = unit.slots.filter(slotHasContent).length;
          return (
            <button
              key={unit.id}
              type="button"
              onClick={() => onOpenUnit(unit.id)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all hover:shadow-sm"
              style={{
                background: 'rgba(255,255,255,0.9)',
                borderColor: onBatchGenerate && selected.includes(unit.id) ? '#A78BFA' : 'rgba(0,0,0,0.08)',
              }}
            >
              {onBatchGenerate && (
                <input
                  type="checkbox"
                  checked={selected.includes(unit.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleUnit(unit.id)}
                  className="shrink-0"
                  title="Select for batch generation"
                />
              )}
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: status === 'done' ? '#D1FAE5' : '#EEF2FF',
                  color: status === 'done' ? '#065F46' : '#4338CA',
                  fontSize: 12.5,
                  fontWeight: 700,
                }}
              >
                {status === 'done' ? <Check size={13} /> : i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 14, fontWeight: 650, color: '#0B1220' }} className="truncate">{unit.title}</p>
                <p style={{ fontSize: 12, color: '#9AA3AF' }} className="truncate">
                  {filled}/{unit.slots.length} {slotNoun}{unit.slots.length === 1 ? '' : 's'}
                  {unit.intent ? ` · ${unit.intent}` : ' · Write yourself or generate with AI'}
                </p>
              </div>
              {unit.authorMode !== 'empty' && (
                <span className="inline-flex items-center gap-1 shrink-0" style={{ fontSize: 11, color: '#9AA3AF' }}>
                  {unit.authorMode === 'generated' ? <Sparkles size={11} /> : <PenLine size={11} />}
                  {unit.authorMode}
                </span>
              )}
              <span
                className="px-2 py-0.5 rounded-full shrink-0"
                style={{ fontSize: 11, fontWeight: 650, background: st.bg, color: st.text }}
              >
                {st.label}
              </span>
              <ChevronRight size={15} style={{ color: '#C4CBD4' }} className="shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
