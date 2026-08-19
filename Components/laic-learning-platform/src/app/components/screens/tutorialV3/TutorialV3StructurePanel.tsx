/**
 * Tutorial V3 Structure — recipe checklist:
 * library pick slots, generate-later slots, and N section title rows.
 * Also assigns student-preview pages (which outline items share a learner page).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, GripVertical, Library, Plus, Sparkles, Trash2 } from 'lucide-react';
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
import type { LearningObject, TutorialTemplate } from '../../../../lib/types';
import {
  analyzeTemplateRecipe,
  applyLibraryPickToSlot,
  defaultSectionOrder,
  embedTypeLabel,
  structureIsReady,
  type RecipeStructureAnalysis,
  type StructureSectionTitle,
} from '../../../../lib/tutorialV3/recipeStructure';
import {
  listEmbeddableLibraryObjects,
  type LibraryObjectChoice,
} from '../../../../lib/tutorialV3/tutorialTemplates';
import { findLibraryLearningObject } from '../../../../lib/libraryEmbed';
import type { V3TopLevelSlot } from '../../../../lib/tutorialV3/types';
import { LibraryPickerModal } from '../../LibraryPickerModal';
import { V3_SAGE, V3_SAGE_BORDER, V3_SAGE_DARK, V3_SAGE_TINT } from '../../../../lib/tutorialV3/authorTheme';

/** Everything the Blank canvas "Add content" sidebar can generate. */
const ADD_GENERATE_TYPES: { type: string; label: string }[] = [
  { type: 'quiz', label: 'Quiz' },
  { type: 'flashcard-set', label: 'Flashcards' },
  { type: 'concept-card', label: 'Concept card' },
  { type: 'summary', label: 'Summary' },
  { type: 'reflection', label: 'Reflection' },
  { type: 'assignment', label: 'Assignment' },
  { type: 'drill', label: 'Drill' },
  // Tutorial V3 block types. Same slot, same sources → markup → generate run;
  // they produce one block rather than a standalone library object.
  { type: 'lesson-overview', label: 'Lesson overview' },
  { type: 'lesson-complete', label: 'Lesson complete' },
  { type: 'reference-table', label: 'Reference table' },
  { type: 'quick-decisions', label: 'Quick decisions' },
  { type: 'matching', label: 'Matching' },
  { type: 'opening-question', label: 'Opening question' },
];

export function TutorialV3StructurePanel({
  template,
  slots,
  onChangeSlots,
  sectionTitles,
  onChangeSectionTitles,
  createdObjects = [],
  /** Write-it-yourself: freeform section count, no template framing. */
  writeYourself = false,
  /** Blank canvas: free section count + an "Add content" sidebar (Sources/AI stay on). */
  freeform = false,
}: {
  template: TutorialTemplate;
  slots: V3TopLevelSlot[];
  onChangeSlots: (next: V3TopLevelSlot[]) => void;
  sectionTitles: StructureSectionTitle[];
  onChangeSectionTitles: (next: StructureSectionTitle[]) => void;
  createdObjects?: LearningObject[];
  writeYourself?: boolean;
  freeform?: boolean;
}) {
  const analysis = useMemo(() => analyzeTemplateRecipe(template), [template]);

  const [pickerSlotId, setPickerSlotId] = useState<string | null>(null);
  const [pickerType, setPickerType] = useState<string>('reused-from-library');
  const [library, setLibrary] = useState<LibraryObjectChoice[]>([]);
  const [libraryStatus, setLibraryStatus] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle');

  useEffect(() => {
    if (!pickerSlotId) return;
    let cancelled = false;
    setLibraryStatus('loading');
    void listEmbeddableLibraryObjects({ extraObjects: createdObjects || [] })
      .then((rows) => {
        if (cancelled) return;
        setLibrary(rows);
        setLibraryStatus(rows.length ? 'idle' : 'empty');
      })
      .catch(() => {
        if (!cancelled) setLibraryStatus('error');
      });
    return () => { cancelled = true; };
  }, [pickerSlotId, createdObjects]);

  // Keep section title rows aligned with template section count (unless free-structure).
  useEffect(() => {
    if (writeYourself || freeform) {
      if (!sectionTitles.length && !freeform) {
        onChangeSectionTitles([
          { title: 'Section 1', intent: '', learnerPage: 1 },
          { title: 'Section 2', intent: '', learnerPage: 2 },
          { title: 'Section 3', intent: '', learnerPage: 3 },
        ]);
      }
      if (!sectionTitles.length && freeform) {
        onChangeSectionTitles([{ title: 'Section 1', intent: '', learnerPage: 1 }]);
      }
      return;
    }
    if (!analysis.hasSections) {
      if (sectionTitles.length) onChangeSectionTitles([]);
      return;
    }
    const n = analysis.sectionCount;
    if (sectionTitles.length === n) return;
    const next = sectionTitles.slice(0, n);
    while (next.length < n) {
      next.push({
        title: `Section ${next.length + 1}`,
        intent: '',
        learnerPage: next.length + 1,
      });
    }
    onChangeSectionTitles(next);
  }, [analysis.hasSections, analysis.sectionCount, writeYourself, freeform]); // eslint-disable-line react-hooks/exhaustive-deps

  /*
    Ensure every outline row has a learnerPage once Structure is shown.

    Both lists used to number from 1 independently, so a template's opening
    question and its first section each claimed page 1 and the student view
    showed them together without anyone asking for that. Numbering runs over
    the outline as one sequence instead.
  */
  useEffect(() => {
    if (sectionTitles.every((r) => r.learnerPage != null)
      && slots.every((s) => s.learnerPage != null)) return;
    const page = new Map<string, number>();
    rows.forEach((r, i) => page.set(r.key, i + 1));
    if (sectionTitles.some((r) => r.learnerPage == null)) {
      onChangeSectionTitles(sectionTitles.map((r, i) => ({
        ...r,
        learnerPage: r.learnerPage ?? page.get(r.id || `sec-row-${i}`) ?? (i + 1),
      })));
    }
    if (slots.some((s) => s.learnerPage == null)) {
      onChangeSlots(slots.map((s, i) => ({
        ...s,
        learnerPage: s.learnerPage ?? page.get(s.id) ?? (i + 1),
      })));
    }
    // `rows` is derived from the two lists this effect reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionTitles, slots, onChangeSectionTitles, onChangeSlots]);

  /*
    Sections and top-level content are two arrays, but the author arranged them
    as one sequence in the template recipe and expects Structure to read back
    that way. `order` is what joins them; rows without one fall back to the old
    content-then-sections reading so nothing already built shifts.
  */
  const rows = useMemo(() => {
    const slotRows = slots.map((slot, i) => ({
      kind: 'slot' as const,
      key: slot.id,
      slot,
      slotIndex: i,
      order: slot.order ?? i,
    }));
    const sectionRows = sectionTitles.map((row, i) => ({
      kind: 'section' as const,
      key: row.id || `sec-row-${i}`,
      row,
      index: i,
      order: row.order ?? defaultSectionOrder(analysis, i, sectionTitles.length),
    }));
    return [...slotRows, ...sectionRows].sort((a, b) => a.order - b.order);
  }, [slots, sectionTitles, analysis]);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** A drop rewrites `order` on both arrays from the list's new reading. */
  const handleReorder = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const keys = rows.map((r) => r.key);
    const from = keys.indexOf(String(active.id));
    const to = keys.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(rows, from, to);
    const slotOrder = new Map<string, number>();
    const sectionOrder = new Map<string, number>();
    next.forEach((r, i) => {
      if (r.kind === 'slot') slotOrder.set(r.slot.id, i);
      else sectionOrder.set(r.key, i);
    });
    onChangeSlots(slots.map((sl) => (
      slotOrder.has(sl.id) ? { ...sl, order: slotOrder.get(sl.id)! } : sl
    )));
    onChangeSectionTitles(sectionTitles.map((r, i) => {
      const key = r.id || `sec-row-${i}`;
      return sectionOrder.has(key) ? { ...r, order: sectionOrder.get(key)! } : r;
    }));
  };

  const pageOptionCount = Math.max(
    1,
    sectionTitles.length + slots.length,
    ...sectionTitles.map((r) => Number(r.learnerPage) || 1),
    ...slots.map((s) => Number(s.learnerPage) || 1),
  );

  const pickerSlot = slots.find((s) => s.id === pickerSlotId) || null;

  const empty = !analysis.hasSections
    && !analysis.libraryEmbeds.length
    && !analysis.topLevelGenerateEmbeds.length;

  /** Where the next added row goes: after everything already in the outline. */
  const nextOrder = () => (rows.length ? Math.max(...rows.map((r) => r.order)) + 1 : 0);

  const addSection = () => onChangeSectionTitles([
    ...sectionTitles,
    {
      title: `Section ${sectionTitles.length + 1}`,
      intent: '',
      learnerPage: sectionTitles.length + slots.length + 1,
      order: nextOrder(),
    },
  ]);

  /** Blank canvas: append an author-created slot (recipeIndex -1 = not from the recipe). */
  const addContentSlot = (kind: 'generate' | 'library', objectType: string) => {
    const id = `slot-add-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    onChangeSlots([...slots, {
      id,
      kind,
      objectType,
      required: false,
      recipeIndex: -1,
      done: false,
      learnerPage: sectionTitles.length + slots.length + 1,
      order: nextOrder(),
    }]);
    if (kind === 'library') {
      setPickerSlotId(id);
      setPickerType(objectType);
    }
  };

  const addSidebar = freeform ? (
    <aside
      className="w-full md:w-60 md:shrink-0 rounded-2xl px-3.5 py-4 space-y-4"
      style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}
    >
      <p style={{ fontSize: 11.5, fontWeight: 700, color: '#9AA3AF', letterSpacing: '.05em', textTransform: 'uppercase' }}>
        Add to tutorial
      </p>
      <button
        type="button"
        onClick={addSection}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full border"
        style={{ fontSize: 12.5, fontWeight: 650, borderColor: 'rgba(0,0,0,0.12)', color: '#0B1220', background: '#fff' }}
      >
        <Plus size={13} /> Section
      </button>
      <div>
        <p style={{ fontSize: 11, fontWeight: 650, color: '#4d7c5a', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 6 }}>
          <Sparkles size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
          Generate with AI
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ADD_GENERATE_TYPES.map((g) => (
            <button
              key={g.type}
              type="button"
              onClick={() => addContentSlot('generate', g.type)}
              className="px-3 py-1.5 rounded-full border transition-colors"
              style={{ fontSize: 12.5, fontWeight: 600, borderColor: 'rgba(0,0,0,0.12)', background: '#fff', color: '#44403c' }}
            >
              {g.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: '#6B7280', marginTop: 6, lineHeight: 1.4 }}>
          Each becomes a slot you'll ground in Sources and generate in Author.
        </p>
      </div>
      <div>
        <p style={{ fontSize: 11, fontWeight: 650, color: '#2f4e39', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 6 }}>
          <Library size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
          From Content Library
        </p>
        <button
          type="button"
          onClick={() => addContentSlot('library', 'reused-from-library')}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full border"
          style={{ fontSize: 12, fontWeight: 600, borderColor: 'rgba(77,124,90,0.3)', background: 'rgba(77,124,90,0.05)', color: '#2f4e39' }}
        >
          Embed existing content…
        </button>
      </div>
      <p style={{ fontSize: 11, color: '#9AA3AF', lineHeight: 1.45 }}>
        Text, images, and videos are authored inside each section — plus the Review sidebar's image picker.
      </p>
    </aside>
  ) : null;

  return (
    <div className={freeform ? 'px-1 flex flex-col md:flex-row gap-4 md:gap-5 md:items-start' : 'px-1'}>
    <div className="space-y-5 flex-1 min-w-0">
      <div>
        <p style={{ fontSize: 13.5, color: '#6B7280' }}>
          {writeYourself
            ? 'Name the sections you want to write. You’ll add text, images, and videos in Author.'
            : freeform
              ? 'Blank canvas — add as many sections and content items as you want using the panel on the right. Text, images, and videos are authored inside each section.'
              : (
                <>
                  From template <span style={{ fontWeight: 650, color: '#374151' }}>{template.name}</span>
                  {' — '}fill library slots and name sections. Steps that need generation come next.
                </>
              )}
        </p>
      </div>

      {!writeYourself && empty && (
        <div
          className="rounded-2xl px-4 py-5"
          style={{ background: 'rgba(254,243,199,0.5)', border: '1px solid #FCD34D' }}
        >
          <p style={{ fontSize: 13.5, fontWeight: 600, color: '#92400E' }}>
            This template’s recipe has no Section block and no embedded content.
          </p>
          <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 4 }}>
            Add a Section or embed slots in Template Library, then reopen Structure.
          </p>
        </div>
      )}

      {(sectionTitles.length > 0 || slots.length > 0) && (
        <div
          className="rounded-xl px-3.5 py-3"
          style={{ background: V3_SAGE_TINT, border: `1px solid ${V3_SAGE_BORDER}` }}
        >
          <p style={{ fontSize: 12, fontWeight: 650, color: V3_SAGE_DARK, letterSpacing: '.04em', textTransform: 'uppercase' }}>
            Student preview pages
          </p>
          <p style={{ fontSize: 12.5, color: '#44403c', marginTop: 4, lineHeight: 1.45 }}>
            Choose which sections share a page. Same page number = shown together; different numbers = Prev/Next in the student view.
          </p>
          <div className="flex flex-wrap gap-2 mt-2.5">
            <button
              type="button"
              onClick={() => {
                let page = 1;
                if (slots.length) {
                  onChangeSlots(slots.map((s) => ({ ...s, learnerPage: page++ })));
                }
                onChangeSectionTitles(sectionTitles.map((r) => ({ ...r, learnerPage: page++ })));
              }}
              className="px-2.5 py-1 rounded-full border"
              style={{ fontSize: 11.5, fontWeight: 600, color: V3_SAGE_DARK, borderColor: V3_SAGE_BORDER, background: '#fff' }}
            >
              One per page
            </button>
            <button
              type="button"
              onClick={() => {
                onChangeSectionTitles(sectionTitles.map((r) => ({ ...r, learnerPage: 1 })));
                if (slots.length) {
                  onChangeSlots(slots.map((s) => ({ ...s, learnerPage: 1 })));
                }
              }}
              className="px-2.5 py-1 rounded-full border"
              style={{ fontSize: 11.5, fontWeight: 600, color: V3_SAGE_DARK, borderColor: V3_SAGE_BORDER, background: '#fff' }}
            >
              All on page 1
            </button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p style={{ fontSize: 12, fontWeight: 650, color: '#9AA3AF', letterSpacing: '.04em', textTransform: 'uppercase' }}>
              Tutorial outline ({rows.length})
            </p>
            {(writeYourself || freeform) && (
              <button
                type="button"
                onClick={addSection}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border"
                style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
              >
                <Plus size={12} /> Add section
              </button>
            )}
          </div>
          <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 8 }}>
            This is the order students read, taken from your template. Drag any row to change it.
            {' '}Sources and markup apply to the sections.
          </p>

          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleReorder}>
          <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {rows.map((r) => {
              if (r.kind === 'slot') {
                if (writeYourself) return null;
                const slot = r.slot;
                const onChangePage = (page: number) => {
                  onChangeSlots(slots.map((s) => (s.id === slot.id ? { ...s, learnerPage: page } : s)));
                };
                const onRemove = freeform && slot.recipeIndex === -1
                  ? () => onChangeSlots(slots.filter((s) => s.id !== slot.id))
                  : undefined;
                return (
                  <SortableRow key={r.key} id={r.key}>
                    {slot.kind === 'library' ? (
                      <LibrarySlotRow
                        slot={slot}
                        pageOptionCount={pageOptionCount}
                        learnerPage={slot.learnerPage ?? (r.slotIndex + 1)}
                        onChangePage={onChangePage}
                        onBrowse={() => {
                          setPickerSlotId(slot.id);
                          setPickerType(slot.objectType);
                        }}
                        onRemove={onRemove}
                      />
                    ) : (
                      <GenerateSlotRow
                        slot={slot}
                        pageOptionCount={pageOptionCount}
                        learnerPage={slot.learnerPage ?? (r.slotIndex + 1)}
                        onChangePage={onChangePage}
                        onRemove={onRemove}
                      />
                    )}
                  </SortableRow>
                );
              }

              if (!writeYourself && !analysis.hasSections) return null;
              const { row, index: i } = r;
              const ordinal = rows.filter((x) => x.kind === 'section').findIndex((x) => x.key === r.key) + 1;
              return (
                <SortableRow key={r.key} id={r.key}>
                  <div
                    className="rounded-xl px-3 py-2.5 flex items-start gap-2 flex-1 min-w-0"
                    style={{ background: 'white', border: '1px solid rgba(0,0,0,0.06)' }}
                  >
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: '#e9f0ea', color: '#3d6349', fontSize: 12, fontWeight: 700 }}
                    >
                      {ordinal}
                    </span>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <input
                        className="w-full"
                        value={row.title}
                        onChange={(e) => {
                          onChangeSectionTitles(sectionTitles.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)));
                        }}
                        placeholder={`Section ${ordinal} title`}
                        style={{ fontSize: 14, fontWeight: 650, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 10px' }}
                      />
                      <input
                        className="w-full"
                        value={row.intent || ''}
                        onChange={(e) => {
                          onChangeSectionTitles(sectionTitles.map((x, j) => (j === i ? { ...x, intent: e.target.value } : x)));
                        }}
                        placeholder="What this section teaches (optional)"
                        style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.06)', borderRadius: 10, padding: '6px 10px', color: '#374151' }}
                      />
                      <label className="flex items-center gap-2">
                        <span style={{ fontSize: 11.5, fontWeight: 650, color: '#6B7280' }}>Student page</span>
                        <PageSelect
                          value={row.learnerPage ?? (i + 1)}
                          max={pageOptionCount}
                          onChange={(page) => {
                            onChangeSectionTitles(sectionTitles.map((x, j) => (
                              j === i ? { ...x, learnerPage: page } : x
                            )));
                          }}
                        />
                      </label>
                    </div>
                    {(writeYourself || freeform) && sectionTitles.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onChangeSectionTitles(sectionTitles.filter((_, j) => j !== i))}
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 shrink-0 mt-0.5"
                        title="Remove section"
                      >
                        <Trash2 size={13} style={{ color: '#EF4444' }} />
                      </button>
                    )}
                  </div>
                </SortableRow>
              );
            })}
          </div>
          </SortableContext>
          </DndContext>
        </div>
      )}

      </div>

      {addSidebar}

      <LibraryPickerModal
        open={!!pickerSlotId}
        onClose={() => setPickerSlotId(null)}
        library={library}
        libraryStatus={libraryStatus}
        libraryEmptyCopy="No matching content in Content Library yet."
        slotObjectType={pickerType as any}
        initialObjectId={pickerSlot?.versionPin?.objectId}
        initialVersionId={pickerSlot?.versionPin?.versionId}
        onConfirm={(objectId, versionId, title) => {
          const obj = findLibraryLearningObject(objectId, createdObjects || []);
          if (!obj || !pickerSlotId) {
            setPickerSlotId(null);
            return;
          }
          onChangeSlots(slots.map((s) => (
            s.id === pickerSlotId
              ? applyLibraryPickToSlot(s, { object: obj, versionId, title })
              : s
          )));
          setPickerSlotId(null);
        }}
      />
    </div>
  );
}

/**
 * One draggable row of the outline.
 *
 * The grip is a handle rather than the whole row: these rows hold text inputs
 * and page dropdowns, and a row that drags from anywhere would swallow every
 * attempt to put a cursor in a title.
 */
function SortableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      className="flex items-stretch gap-1"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        position: isDragging ? 'relative' : undefined,
        zIndex: isDragging ? 5 : undefined,
        boxShadow: isDragging ? '0 12px 28px -12px rgba(30,50,80,0.4)' : undefined,
        borderRadius: 12,
      }}
    >
      <button
        type="button"
        className="shrink-0 self-center px-1 cursor-grab active:cursor-grabbing"
        aria-label="Reorder this item"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={15} style={{ color: '#C4CBD4' }} />
      </button>
      <div className="flex-1 min-w-0 flex">{children}</div>
    </div>
  );
}

function PageSelect({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (page: number) => void;
}) {
  const opts = Array.from({ length: Math.max(1, max, value) }, (_, i) => i + 1);
  return (
    <select
      value={value}
      onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: V3_SAGE_DARK,
        border: '1px solid rgba(29,78,216,0.25)',
        borderRadius: 8,
        padding: '4px 8px',
        background: '#fff',
      }}
    >
      {opts.map((n) => (
        <option key={n} value={n}>Page {n}</option>
      ))}
    </select>
  );
}

function LibrarySlotRow({
  slot,
  onBrowse,
  pageOptionCount,
  learnerPage,
  onChangePage,
  onRemove,
}: {
  slot: V3TopLevelSlot;
  onBrowse: () => void;
  pageOptionCount: number;
  learnerPage: number;
  onChangePage: (page: number) => void;
  onRemove?: () => void;
}) {
  const label = embedTypeLabel(String(slot.objectType));
  const picked = !!slot.versionPin?.objectId;
  return (
    <div
      className="rounded-xl px-3.5 py-3 flex-1 min-w-0"
      style={{
        background: picked ? 'rgba(77,124,90,0.06)' : 'rgba(254,243,199,0.55)',
        border: `1px solid ${picked ? 'rgba(77,124,90,0.25)' : '#FCD34D'}`,
      }}
    >
      <div className="flex items-start gap-2">
        <Library size={14} style={{ color: picked ? '#3d6349' : '#92400E', marginTop: 2 }} />
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 13, fontWeight: 650, color: picked ? '#2f4e39' : '#92400E' }}>
            {picked
              ? `✓ ${label}: ${slot.libraryTitle || slot.versionPin?.objectId}`
              : `Choose a library ${label}${slot.required ? ' (required)' : ''}`}
          </p>
          {slot.authoringNote && (
            <p style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{slot.authoringNote}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button
              type="button"
              onClick={onBrowse}
              className="px-3 py-1.5 rounded-full border"
              style={{ fontSize: 12, fontWeight: 600, background: '#fff', borderColor: 'rgba(0,0,0,0.1)' }}
            >
              {picked ? 'Change…' : 'Browse Content Library…'}
            </button>
            <label className="inline-flex items-center gap-1.5">
              <span style={{ fontSize: 11.5, fontWeight: 650, color: '#6B7280' }}>Student page</span>
              <PageSelect value={learnerPage} max={pageOptionCount} onChange={onChangePage} />
            </label>
          </div>
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 shrink-0"
            title="Remove"
          >
            <Trash2 size={13} style={{ color: '#EF4444' }} />
          </button>
        )}
      </div>
    </div>
  );
}

function GenerateSlotRow({
  slot,
  pageOptionCount,
  learnerPage,
  onChangePage,
  onRemove,
}: {
  slot: V3TopLevelSlot;
  pageOptionCount: number;
  learnerPage: number;
  onChangePage: (page: number) => void;
  onRemove?: () => void;
}) {
  const label = embedTypeLabel(String(slot.objectType));
  return (
    <div
      className="rounded-xl px-3.5 py-3 flex items-start gap-2 flex-1 min-w-0"
      style={{ background: 'rgba(237,233,254,0.7)', border: '1px solid rgba(77,124,90,0.2)' }}
    >
      <Sparkles size={14} style={{ color: '#4d7c5a', marginTop: 2 }} />
      <div className="flex-1 min-w-0">
        <p style={{ fontSize: 13, fontWeight: 650, color: V3_SAGE_DARK }}>
          {label} — generate after Sources
          {slot.required ? '' : ' (optional)'}
        </p>
        {slot.authoringNote && (
          <p style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{slot.authoringNote}</p>
        )}
        <p style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
          After Sources, open this content from the outline to pick sources → mark up → generate.
        </p>
        <label className="inline-flex items-center gap-1.5 mt-2">
          <span style={{ fontSize: 11.5, fontWeight: 650, color: '#6B7280' }}>Student page</span>
          <PageSelect value={learnerPage} max={pageOptionCount} onChange={onChangePage} />
        </label>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 shrink-0"
          title="Remove"
        >
          <Trash2 size={13} style={{ color: '#EF4444' }} />
        </button>
      )}
    </div>
  );
}

export function useStructureGate(
  template: TutorialTemplate,
  slots: V3TopLevelSlot[],
  sectionTitles: { title: string }[],
): { analysis: RecipeStructureAnalysis; ready: boolean } {
  const analysis = useMemo(() => analyzeTemplateRecipe(template), [template]);
  const ready = structureIsReady(analysis, slots, sectionTitles);
  return { analysis, ready };
}

/** Small helper badge for empty structure — unused externally for now. */
export function StructureHintIcon() {
  return <BookOpen size={14} />;
}
