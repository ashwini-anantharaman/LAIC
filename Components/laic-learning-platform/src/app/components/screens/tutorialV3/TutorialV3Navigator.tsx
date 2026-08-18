/**
 * Tutorial V3 section navigator — outline + status + enter section / generate slot.
 */
import React from 'react';
import { Check, PenLine, Sparkles, ChevronRight, Eye, Database, Trash2, GripVertical } from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TutorialV3Draft, V3Section, V3TopLevelSlot } from '../../../../lib/tutorialV3/types';
import {
  allRequiredDone,
  deriveSectionStatus,
  doneCount,
  requiredSectionsRemaining,
} from '../../../../lib/tutorialV3/draftModel';
import { embedTypeLabel } from '../../../../lib/tutorialV3/recipeStructure';
import { V3_NAVY, V3_SAGE } from '../../../../lib/tutorialV3/authorTheme';

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  not_started: { bg: '#F3F4F6', text: '#6B7280', label: 'Not started' },
  in_progress: { bg: '#FEF3C7', text: '#92400E', label: 'In progress' },
  done: { bg: '#D1FAE5', text: '#2f4e39', label: 'Done' },
};

const MODE_HINT: Record<string, string> = {
  empty: '',
  written: 'written',
  generated: 'generated',
  mixed: 'mixed',
};

export function TutorialV3Navigator({
  draft,
  showSources = false,
  writeYourself = false,
  onOpenSection,
  onOpenSlot,
  onDeleteSection,
  onReview,
  onBatchGenerate,
  onReorderSections,
  onDeleteSlot,
  onBackToSources,
  onBackToStructure,
  onBackToPlan,
}: {
  draft: TutorialV3Draft;
  /** Template path only — Sources is a real pipeline step when the recipe needs it. */
  showSources?: boolean;
  writeYourself?: boolean;
  onOpenSection: (sectionId: string) => void;
  onOpenSlot: (slotId: string) => void;
  /** Author can remove any section from the outline. */
  onDeleteSection?: (sectionId: string) => void;
  onReview: () => void;
  /**
   * Mark up once, generate several. Absent on the write-yourself path, where
   * there is no AI step to batch.
   */
  onBatchGenerate?: (
    targets: { kind: 'section' | 'slot'; id: string }[],
    opts?: { noMarkup?: boolean },
  ) => void;
  /**
   * Reorder the outline — sections and top-level content in one running order.
   * The ids arrive interleaved, exactly as the rows now read top to bottom.
   * Absent when the caller has no way to persist it.
   */
  onReorderSections?: (orderedIds: string[]) => void;
  /** Remove a generate slot, the way a section can already be removed. */
  onDeleteSlot?: (slotId: string) => void;
  onBackToSources: () => void;
  onBackToStructure: () => void;
  onBackToPlan?: () => void;
}) {
  /**
   * Which rows the author has ticked for a shared markup run. Kept here rather
   * than in the draft: it is a choice about this one action, not part of the
   * tutorial.
   */
  const [selected, setSelected] = React.useState<string[]>([]);
  /** Ticked ids, resolved to what each one actually is. */
  const asTargets = (ids: string[]) => ids.map((id) => ({
    kind: (draft.sections.some((sec) => sec.id === id) ? 'section' : 'slot') as 'section' | 'slot',
    id,
  }));
  const toggleSelected = (id: string) => setSelected(
    (prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]),
  );

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  /*
    Sections and top-level content are stored in two arrays, but the author
    arranged them as one sequence in the template and reads them back as one
    sequence here. `order` is what makes the two arrays a single list; drafts
    made before it existed fall back to the old content-then-sections reading.
  */
  const rows = React.useMemo(() => {
    const slotRows = (draft.topLevelSlots || []).map((slot, i) => ({
      kind: 'slot' as const,
      id: slot.id,
      slot,
      order: slot.order ?? i,
    }));
    const sectionRows = draft.sections.map((sec, i) => ({
      kind: 'section' as const,
      id: sec.id,
      sec,
      ordinal: i,
      order: sec.order ?? slotRows.length + i,
    }));
    return [...slotRows, ...sectionRows].sort((a, b) => a.order - b.order);
  }, [draft.topLevelSlots, draft.sections]);

  const handleReorder = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorderSections) return;
    const ids = rows.map((r) => r.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorderSections(arrayMove(ids, from, to));
  };

  const { done, total } = doneCount(draft.sections);
  const remaining = requiredSectionsRemaining(draft.sections);
  const slots = draft.topLevelSlots || [];
  const canReview = allRequiredDone(draft.sections, slots)
    && (total > 0 || slots.some((s) => s.done || (s.parts || []).length > 0 || !!s.part));
  const hasLibrarySlots = slots.some((s) => s.kind === 'library');
  const hasGenerateSlots = slots.some((s) => s.kind === 'generate');
  const pendingGenerate = slots.filter((s) => s.kind === 'generate' && !s.done).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#9AA3AF', letterSpacing: '.04em', textTransform: 'uppercase' }}>
            {total > 0 ? 'Sections' : 'Tutorial'}
          </p>
          <h2 style={{ fontSize: 20, fontWeight: 750, color: '#0B1220', letterSpacing: '-0.3px', marginTop: 2 }}>
            {draft.title || 'Untitled tutorial'}
          </h2>
          <p style={{ fontSize: 13.5, color: '#6B7280', marginTop: 4 }}>
            {writeYourself
              ? (total > 0
                ? `${done} of ${total} sections done${remaining > 0 ? ` · ${remaining} remaining` : ' · ready to review'} — write text, images, and videos in each section`
                : 'Open each section and write it by hand')
              : total > 0
                ? `${done} of ${total} sections done${remaining > 0 ? ` · ${remaining} required remaining` : ' · ready to review'}`
                : pendingGenerate > 0
                  ? `${pendingGenerate} content item${pendingGenerate === 1 ? '' : 's'} still open — write or generate each below`
                  : canReview
                    ? 'All recipe content ready — Review & submit for Edit + Student preview'
                    : hasLibrarySlots
                      ? 'Library content selected — review when ready'
                      : 'Open each item to write it yourself, or use AI generate if you want'}
          </p>
        </div>
        <button
          type="button"
          disabled={!canReview}
          onClick={onReview}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-white disabled:opacity-40"
          style={{ fontSize: 13, fontWeight: 600, background: '#1e2b3d' }}
        >
          <Eye size={14} />
          Review & submit
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {onBackToPlan && (
          <button
            type="button"
            onClick={onBackToPlan}
            className="px-3 py-1.5 rounded-full border"
            style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
          >
            ← Plan
          </button>
        )}
        <button
          type="button"
          onClick={onBackToStructure}
          className="px-3 py-1.5 rounded-full border"
          style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
        >
          ← Structure
        </button>
        {showSources && (
          <button
            type="button"
            onClick={onBackToSources}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border"
            style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
          >
            <Database size={12} /> ← Sources
          </button>
        )}
      </div>

      {onBatchGenerate && (draft.sections.length + slots.filter((s) => s.kind === 'generate').length) > 1 && (
        <div
          className="flex items-center justify-between gap-3 flex-wrap rounded-2xl px-4 py-3 mb-4"
          style={{
            background: selected.length ? 'rgba(77,124,90,0.08)' : 'rgba(255,255,255,0.72)',
            border: `1px solid ${selected.length ? V3_SAGE : 'rgba(0,0,0,0.06)'}`,
          }}
        >
          <div className="min-w-0">
            <p style={{ fontSize: 13.5, fontWeight: 650, color: '#0B1220' }}>
              {selected.length
                ? `${selected.length} selected`
                : 'Generating several from the same sources?'}
            </p>
            <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 2, lineHeight: 1.45 }}>
              {selected.length
                ? 'Mark up once and every one selected is generated from that markup — or let the model read the sources whole and decide what matters.'
                : 'Tick the ones that share a source, then generate them together instead of one at a time.'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto sm:shrink-0">
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => setSelected([])}
                className="px-3 py-1.5 rounded-full border"
                style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', borderColor: 'rgba(0,0,0,0.12)', background: '#fff' }}
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelected([
                ...slots.filter((s) => s.kind === 'generate').map((s) => s.id),
                ...draft.sections.map((s) => s.id),
              ])}
              className="px-3 py-1.5 rounded-full border"
              style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.12)', background: '#fff' }}
            >
              Select all
            </button>
            <button
              type="button"
              disabled={!selected.length}
              onClick={() => onBatchGenerate(asTargets(selected))}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border disabled:opacity-40 flex-1 sm:flex-none justify-center"
              style={{ fontSize: 12.5, fontWeight: 650, color: '#2f4e39', borderColor: V3_SAGE, background: '#fff' }}
            >
              Mark up once and generate
            </button>
            <button
              type="button"
              disabled={!selected.length}
              onClick={() => onBatchGenerate(asTargets(selected), { noMarkup: true })}
              title="No markup step — the model reads the whole source and decides what matters"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-white disabled:opacity-40 flex-1 sm:flex-none justify-center"
              style={{ fontSize: 12.5, fontWeight: 650, background: V3_SAGE }}
            >
              <Sparkles size={13} />
              Generate based on what AI recommends
            </button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <p style={{ fontSize: 12, fontWeight: 650, color: '#9AA3AF', letterSpacing: '.04em', textTransform: 'uppercase' }}>
            Tutorial outline
          </p>
          {onReorderSections && rows.length > 1 && (
            <p className="hidden sm:block" style={{ fontSize: 12, color: '#9AA3AF' }}>
              Drag to change the order students read
            </p>
          )}
        </div>
      )}

      <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleReorder}>
      <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
      <div className="space-y-2">
        {rows.map((row) => (row.kind === 'slot' ? (
          <SlotRow
            key={row.id}
            slot={row.slot}
            onOpen={row.slot.kind === 'generate' ? () => onOpenSlot(row.slot.id) : undefined}
            selectable={!!onBatchGenerate && row.slot.kind === 'generate'}
            selected={selected.includes(row.id)}
            onToggleSelected={() => toggleSelected(row.id)}
            onDelete={onDeleteSlot ? () => onDeleteSlot(row.slot.id) : undefined}
            reorderable={!!onReorderSections}
          />
        ) : (
          <SectionRow
            key={row.id}
            index={row.ordinal}
            sec={row.sec}
            onOpen={() => onOpenSection(row.sec.id)}
            onDelete={onDeleteSection ? () => onDeleteSection(row.sec.id) : undefined}
            selectable={!!onBatchGenerate}
            selected={selected.includes(row.id)}
            onToggleSelected={() => toggleSelected(row.id)}
            reorderable={!!onReorderSections}
          />
        )))}
        {!draft.sections.length && !slots.length && (
          <p style={{ fontSize: 13.5, color: '#9AA3AF' }}>
            No sections yet — go back to Structure and save a skeleton.
          </p>
        )}
        {!draft.sections.length && slots.length > 0 && (
          <p style={{ fontSize: 13.5, color: '#6B7280' }}>
            No sections in this template — open each content item above to write it yourself, or generate with AI.
          </p>
        )}
      </div>
      </SortableContext>
      </DndContext>
    </div>
  );
}


/** The tick that puts a row into a shared markup run. */
function SelectBox({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`Include ${label} in a shared markup run`}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className="shrink-0 flex items-center justify-center rounded-md self-center ml-3"
      style={{
        width: 20,
        height: 20,
        border: `1.5px solid ${checked ? V3_SAGE : 'rgba(0,0,0,0.2)'}`,
        background: checked ? V3_SAGE : '#fff',
        color: '#fff',
      }}
    >
      {checked && <Check size={13} />}
    </button>
  );
}

function SlotRow({
  slot,
  onOpen,
  selectable = false,
  selected = false,
  onToggleSelected,
  onDelete,
  reorderable = false,
}: {
  slot: V3TopLevelSlot;
  onOpen?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
  onDelete?: () => void;
  reorderable?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slot.id,
    disabled: !reorderable,
  });
  const label = slot.kind === 'library'
    ? (slot.libraryTitle || embedTypeLabel(String(slot.objectType)))
    : embedTypeLabel(String(slot.objectType));
  const status = slot.done
    ? 'Ready'
    : slot.kind === 'generate'
      ? 'Not authored'
      : 'Not picked';
  const clickable = !!onOpen;

  const grip = reorderable ? (
    <button
      type="button"
      className="shrink-0 self-center pl-2 pr-0.5 cursor-grab active:cursor-grabbing"
      aria-label={`Reorder ${label}`}
      {...attributes}
      {...listeners}
    >
      <GripVertical size={15} style={{ color: '#C4CBD4' }} />
    </button>
  ) : null;

  const inner = (
    <>
      <span
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{
          background: slot.done ? '#D1FAE5' : slot.kind === 'generate' ? '#E0E7FF' : '#F3F4F6',
          color: slot.done ? '#2f4e39' : slot.kind === 'generate' ? '#3730A3' : '#6B7280',
        }}
      >
        {slot.done ? <Check size={14} /> : slot.kind === 'generate' ? <PenLine size={14} /> : <Sparkles size={14} />}
      </span>
      <div className="min-w-0 flex-1">
        <span style={{ fontSize: 14.5, fontWeight: 650, color: '#0B1220' }}>{label}</span>
        {slot.kind === 'generate' && !slot.done && (
          <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 2 }}>
            Write yourself or generate with AI
          </p>
        )}
      </div>
      <span
        className="px-2 py-0.5 rounded-full shrink-0"
        style={{
          fontSize: 11,
          fontWeight: 600,
          background: slot.done ? '#D1FAE5' : '#FEF3C7',
          color: slot.done ? '#2f4e39' : '#92400E',
        }}
      >
        {status}
      </span>
      {clickable && <ChevronRight size={16} style={{ color: '#9AA3AF' }} className="shrink-0" />}
    </>
  );

  if (clickable) {
    return (
      <div
        ref={setNodeRef}
        className="flex items-stretch gap-1 rounded-2xl"
        style={{
          background: slot.done ? 'rgba(77,124,90,0.06)' : 'rgba(255,255,255,0.72)',
          border: `1px solid ${selected ? V3_SAGE : 'rgba(0,0,0,0.06)'}`,
          boxShadow: isDragging
            ? '0 12px 28px -12px rgba(30,50,80,0.4)'
            : '0 4px 16px -8px rgba(30,50,80,0.12)',
          transform: CSS.Transform.toString(transform),
          transition,
          position: isDragging ? 'relative' : undefined,
          zIndex: isDragging ? 5 : undefined,
        }}
      >
        {grip}
        {selectable && onToggleSelected && (
          <SelectBox checked={selected} onToggle={onToggleSelected} label={label} />
        )}
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left"
        >
          {inner}
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            title="Remove this content"
            aria-label={`Remove ${label}`}
            className="shrink-0 self-center px-3"
          >
            <Trash2 size={14} style={{ color: '#EF4444' }} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className="flex items-center gap-3 pl-1 pr-4 py-3.5 rounded-2xl"
      style={{
        background: slot.done ? 'rgba(77,124,90,0.06)' : 'rgba(249,250,251,0.95)',
        border: '1px solid rgba(0,0,0,0.06)',
        transform: CSS.Transform.toString(transform),
        transition,
        position: isDragging ? 'relative' : undefined,
        zIndex: isDragging ? 5 : undefined,
      }}
    >
      {grip}
      {!grip && <span className="pl-3" />}
      {inner}
    </div>
  );
}

function SectionRow({
  index,
  sec,
  onOpen,
  onDelete,
  selectable = false,
  selected = false,
  onToggleSelected,
  reorderable = false,
}: {
  index: number;
  sec: V3Section;
  onOpen: () => void;
  onDelete?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
  reorderable?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sec.id,
    disabled: !reorderable,
  });
  const status = deriveSectionStatus(sec);
  const style = STATUS_STYLE[status];
  const mode = MODE_HINT[sec.authorMode] || '';

  return (
    <div
      ref={setNodeRef}
      className="flex items-stretch gap-1 rounded-2xl"
      style={{
        background: isDragging ? '#fff' : 'rgba(255,255,255,0.72)',
        border: `1px solid ${selected ? V3_SAGE : 'rgba(0,0,0,0.06)'}`,
        boxShadow: isDragging
          ? '0 12px 28px -12px rgba(30,50,80,0.4)'
          : '0 4px 16px -8px rgba(30,50,80,0.12)',
        transform: CSS.Transform.toString(transform),
        transition,
        position: isDragging ? 'relative' : undefined,
        zIndex: isDragging ? 5 : undefined,
      }}
    >
      {reorderable && (
        <button
          type="button"
          className="shrink-0 self-center pl-2 pr-0.5 cursor-grab active:cursor-grabbing"
          aria-label={`Reorder ${sec.title}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={15} style={{ color: '#C4CBD4' }} />
        </button>
      )}
      {selectable && onToggleSelected && (
        <SelectBox checked={selected} onToggle={onToggleSelected} label={sec.title} />
      )}
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-colors hover:bg-white"
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ background: status === 'done' ? '#D1FAE5' : '#e9f0ea', color: status === 'done' ? '#2f4e39' : '#3d6349', fontSize: 13, fontWeight: 700 }}
        >
          {status === 'done' ? <Check size={14} /> : index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: 14.5, fontWeight: 650, color: '#0B1220' }}>{sec.title || `Section ${index + 1}`}</span>
            {!sec.required && (
              <span style={{ fontSize: 11, color: '#9AA3AF' }}>optional</span>
            )}
          </div>
          {sec.intent ? (
            <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 2 }} className="truncate">{sec.intent}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {mode ? (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ fontSize: 11, color: '#6B7280', background: '#F3F4F6' }}>
              {mode === 'generated' ? <Sparkles size={10} /> : <PenLine size={10} />}
              {mode}
            </span>
          ) : null}
          <span className="px-2 py-0.5 rounded-full" style={{ fontSize: 11, fontWeight: 600, background: style.bg, color: style.text }}>
            {style.label}
          </span>
          <ChevronRight size={16} style={{ color: '#9AA3AF' }} />
        </div>
      </button>
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 px-3 rounded-r-2xl hover:bg-red-50 transition-colors"
          style={{ color: '#EF4444' }}
          title={`Delete ${sec.title || `Section ${index + 1}`}`}
          aria-label={`Delete ${sec.title || `Section ${index + 1}`}`}
        >
          <Trash2 size={15} />
        </button>
      ) : null}
    </div>
  );
}
