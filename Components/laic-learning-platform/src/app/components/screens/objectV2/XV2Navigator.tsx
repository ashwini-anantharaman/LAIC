/**
 * Author hub — one row per Structure unit with status, opens the unit
 * workspace; Review gate once required units have content.
 */
import React from 'react';
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
}: {
  draft: StructuredV2Draft;
  onOpenUnit: (unitId: string) => void;
  onReview: () => void;
}) {
  const canReview = allUnitsReady(draft.units);
  const slotNoun = X_SLOT_NOUN[draft.type];

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
              style={{ background: 'rgba(255,255,255,0.9)', borderColor: 'rgba(0,0,0,0.08)' }}
            >
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
