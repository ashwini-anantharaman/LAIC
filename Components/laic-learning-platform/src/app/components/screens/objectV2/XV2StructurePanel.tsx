/**
 * Structure step — the units/slots extracted from the object's template.
 * Two levels: categories/groups first, each proposing individual item slots.
 * Author can rename, add, remove at both levels before authoring.
 */
import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  X_SLOT_NOUN,
  X_UNIT_NOUN,
  blankSlot,
  newXId,
  slotHasContent,
  type StructuredObjectType,
  type XV2Unit,
} from '../../../../lib/objectV2/structuredDraft';

export function XV2StructurePanel({
  type,
  units,
  onChangeUnits,
  templateName,
}: {
  type: StructuredObjectType;
  units: XV2Unit[];
  onChangeUnits: (next: XV2Unit[]) => void;
  templateName?: string | null;
}) {
  const unitNoun = X_UNIT_NOUN[type];
  const slotNoun = X_SLOT_NOUN[type];
  const isConcept = type === 'concept-card';

  const updateUnit = (id: string, patch: Partial<XV2Unit>) => {
    onChangeUnits(units.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  };

  const addUnit = () => {
    const idx = units.length;
    const title = isConcept
      ? 'New category'
      : type === 'flashcard-set'
        ? 'New card group'
        : type === 'quiz'
          ? `Category ${idx + 1}`
          : 'More checkpoints';
    onChangeUnits([...units, {
      id: newXId('unit'),
      title,
      intent: '',
      slots: isConcept
        ? [blankSlot('concept-card', 0, { title, categoryId: undefined })]
        : [blankSlot(type, 0)],
      authorMode: 'empty',
      done: false,
      required: true,
    }]);
  };

  const removeUnit = (id: string) => onChangeUnits(units.filter((u) => u.id !== id));

  const setSlotCount = (unit: XV2Unit, count: number) => {
    const n = Math.max(1, Math.min(30, count));
    let slots = unit.slots;
    if (n > slots.length) {
      const extra = Array.from({ length: n - slots.length }, (_, i) => blankSlot(type, slots.length + i));
      slots = [...slots, ...extra];
    } else if (n < slots.length) {
      // Drop empty slots from the end first; never drop authored content silently.
      const keep = [...slots];
      for (let i = keep.length - 1; i >= 0 && keep.length > n; i--) {
        if (!slotHasContent(keep[i])) keep.splice(i, 1);
      }
      slots = keep;
    }
    updateUnit(unit.id, { slots });
  };

  return (
    <div className="space-y-3">
      <p style={{ fontSize: 12.5, color: '#6B7280' }}>
        {templateName ? <>From template <strong>{templateName}</strong> — </> : null}
        {isConcept
          ? 'each category below becomes a panel on the sheet. Author each one by hand or generate it from your sources.'
          : `${unitNoun[0].toUpperCase()}${unitNoun.slice(1)}s split this ${type === 'video-script' ? 'video' : 'content'} into parts; each proposes individual ${slotNoun} slots you author or generate.`}
      </p>

      {units.map((unit, ui) => (
        <div
          key={unit.id}
          className="rounded-2xl border p-3"
          style={{ background: 'rgba(255,255,255,0.85)', borderColor: 'rgba(0,0,0,0.08)' }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
              style={{ background: '#EEF2FF', color: '#4338CA', fontSize: 12, fontWeight: 700 }}
            >
              {ui + 1}
            </span>
            <input
              value={unit.title}
              onChange={(e) => updateUnit(unit.id, { title: e.target.value })}
              className="flex-1 rounded-xl px-3 py-2"
              style={{ fontSize: 13.5, fontWeight: 650, border: '1px solid rgba(0,0,0,0.1)', background: '#fff', outline: 'none' }}
            />
            {!isConcept && (
              <label className="flex items-center gap-1.5 shrink-0" style={{ fontSize: 12, color: '#6B7280' }}>
                {slotNoun}s
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={unit.slots.length}
                  onChange={(e) => setSlotCount(unit, Number(e.target.value) || 1)}
                  className="w-14 rounded-lg px-2 py-1.5"
                  style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.1)', background: '#fff', outline: 'none' }}
                />
              </label>
            )}
            {units.length > 1 && (
              <button
                type="button"
                onClick={() => removeUnit(unit.id)}
                className="p-1.5 shrink-0"
                title={`Remove ${unitNoun}`}
              >
                <Trash2 size={14} style={{ color: '#EF4444' }} />
              </button>
            )}
          </div>
          <input
            value={unit.intent || ''}
            onChange={(e) => updateUnit(unit.id, { intent: e.target.value })}
            placeholder={isConcept
              ? 'What this panel should convey (optional)'
              : `What this ${unitNoun} covers — steers AI generation (optional)`}
            className="w-full mt-2 rounded-xl px-3 py-2"
            style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.7)', outline: 'none' }}
          />
          {!isConcept && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {unit.slots.map((s, si) => (
                <span
                  key={s.id}
                  className="px-2 py-0.5 rounded-full"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    background: slotHasContent(s) ? 'rgba(5,150,105,0.12)' : '#F3F4F6',
                    color: slotHasContent(s) ? '#065F46' : '#6B7280',
                  }}
                >
                  {s.title || `${slotNoun} ${si + 1}`}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={addUnit}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border"
        style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.12)', background: '#fff' }}
      >
        <Plus size={13} /> Add {unitNoun}
      </button>
    </div>
  );
}
