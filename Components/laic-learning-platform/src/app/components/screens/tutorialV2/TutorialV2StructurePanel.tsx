/**
 * Tutorial V2 Structure — recipe checklist:
 * library pick slots, generate-later slots, and N section title rows.
 * Also assigns student-preview pages (which outline items share a learner page).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Library, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { LearningObject, TutorialTemplate } from '../../../../lib/types';
import {
  analyzeTemplateRecipe,
  applyLibraryPickToSlot,
  embedTypeLabel,
  structureIsReady,
  type RecipeStructureAnalysis,
  type StructureSectionTitle,
} from '../../../../lib/tutorialV2/recipeStructure';
import {
  listEmbeddableLibraryObjects,
  type LibraryObjectChoice,
} from '../../../../lib/tutorialV2/tutorialTemplates';
import { findLibraryLearningObject } from '../../../../lib/libraryEmbed';
import type { V2TopLevelSlot } from '../../../../lib/tutorialV2/types';
import { LibraryPickerModal } from '../../LibraryPickerModal';

/** Everything the Blank canvas "Add content" sidebar can generate. */
const ADD_GENERATE_TYPES: { type: string; label: string }[] = [
  { type: 'quiz', label: 'Quiz' },
  { type: 'flashcard-set', label: 'Flashcards' },
  { type: 'concept-card', label: 'Concept card' },
  { type: 'summary', label: 'Summary' },
  { type: 'reflection', label: 'Reflection' },
  { type: 'assignment', label: 'Assignment' },
  { type: 'drill', label: 'Drill' },
];

export function TutorialV2StructurePanel({
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
  slots: V2TopLevelSlot[];
  onChangeSlots: (next: V2TopLevelSlot[]) => void;
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

  // Ensure every outline row has a learnerPage once Structure is shown.
  useEffect(() => {
    if (!sectionTitles.length) return;
    if (sectionTitles.every((r) => r.learnerPage != null)) return;
    onChangeSectionTitles(sectionTitles.map((r, i) => ({
      ...r,
      learnerPage: r.learnerPage ?? (i + 1),
    })));
  }, [sectionTitles, onChangeSectionTitles]);

  useEffect(() => {
    if (!slots.length) return;
    if (slots.every((s) => s.learnerPage != null)) return;
    onChangeSlots(slots.map((s, i) => ({
      ...s,
      learnerPage: s.learnerPage ?? (i + 1),
    })));
  }, [slots, onChangeSlots]);

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

  const addSection = () => onChangeSectionTitles([
    ...sectionTitles,
    {
      title: `Section ${sectionTitles.length + 1}`,
      intent: '',
      learnerPage: sectionTitles.length + 1,
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
        <p style={{ fontSize: 11, fontWeight: 650, color: '#6D28D9', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 6 }}>
          <Sparkles size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
          Generate with AI
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ADD_GENERATE_TYPES.map((g) => (
            <button
              key={g.type}
              type="button"
              onClick={() => addContentSlot('generate', g.type)}
              className="px-2.5 py-1.5 rounded-full border"
              style={{ fontSize: 11.5, fontWeight: 600, borderColor: 'rgba(109,40,217,0.25)', background: 'rgba(109,40,217,0.05)', color: '#5B21B6' }}
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
        <p style={{ fontSize: 11, fontWeight: 650, color: '#065F46', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 6 }}>
          <Library size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
          From Content Library
        </p>
        <button
          type="button"
          onClick={() => addContentSlot('library', 'reused-from-library')}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full border"
          style={{ fontSize: 12, fontWeight: 600, borderColor: 'rgba(5,150,105,0.3)', background: 'rgba(5,150,105,0.05)', color: '#065F46' }}
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
          style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.18)' }}
        >
          <p style={{ fontSize: 12, fontWeight: 650, color: '#1D4ED8', letterSpacing: '.04em', textTransform: 'uppercase' }}>
            Student preview pages
          </p>
          <p style={{ fontSize: 12.5, color: '#1E40AF', marginTop: 4, lineHeight: 1.45 }}>
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
              style={{ fontSize: 11.5, fontWeight: 600, color: '#1D4ED8', borderColor: 'rgba(29,78,216,0.25)', background: '#fff' }}
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
              style={{ fontSize: 11.5, fontWeight: 600, color: '#1D4ED8', borderColor: 'rgba(29,78,216,0.25)', background: '#fff' }}
            >
              All on page 1
            </button>
          </div>
        </div>
      )}

      {!writeYourself && slots.filter((s) => s.kind === 'library').length > 0 && (
        <div>
          <p style={{ fontSize: 12, fontWeight: 650, color: '#9AA3AF', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 8 }}>
            From Content Library
          </p>
          <div className="space-y-2">
            {slots.filter((s) => s.kind === 'library').map((slot, idx) => (
              <LibrarySlotRow
                key={slot.id}
                slot={slot}
                pageOptionCount={pageOptionCount}
                learnerPage={slot.learnerPage ?? (idx + 1)}
                onChangePage={(page) => {
                  onChangeSlots(slots.map((s) => (s.id === slot.id ? { ...s, learnerPage: page } : s)));
                }}
                onBrowse={() => {
                  setPickerSlotId(slot.id);
                  setPickerType(slot.objectType);
                }}
                onRemove={freeform && slot.recipeIndex === -1
                  ? () => onChangeSlots(slots.filter((s) => s.id !== slot.id))
                  : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {!writeYourself && slots.filter((s) => s.kind === 'generate').length > 0 && (
        <div>
          <p style={{ fontSize: 12, fontWeight: 650, color: '#9AA3AF', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 8 }}>
            To generate
          </p>
          <div className="space-y-2">
            {slots.filter((s) => s.kind === 'generate').map((slot, idx) => (
              <GenerateSlotRow
                key={slot.id}
                slot={slot}
                pageOptionCount={pageOptionCount}
                learnerPage={slot.learnerPage ?? (idx + 1)}
                onChangePage={(page) => {
                  onChangeSlots(slots.map((s) => (s.id === slot.id ? { ...s, learnerPage: page } : s)));
                }}
                onRemove={freeform && slot.recipeIndex === -1
                  ? () => onChangeSlots(slots.filter((s) => s.id !== slot.id))
                  : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {(writeYourself || analysis.hasSections) && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p style={{ fontSize: 12, fontWeight: 650, color: '#9AA3AF', letterSpacing: '.04em', textTransform: 'uppercase' }}>
              Sections ({sectionTitles.length || ((writeYourself || freeform) ? 0 : analysis.sectionCount)})
            </p>
            {(writeYourself || freeform) && (
              <button
                type="button"
                onClick={() => onChangeSectionTitles([
                  ...sectionTitles,
                  {
                    title: `Section ${sectionTitles.length + 1}`,
                    intent: '',
                    learnerPage: sectionTitles.length + 1,
                  },
                ])}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border"
                style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
              >
                <Plus size={12} /> Add section
              </button>
            )}
          </div>
          <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 8 }}>
            {(writeYourself || freeform)
              ? 'Add as many sections as you need. Use the page dropdown to control student preview paging.'
              : (
                <>
                  Sources and markup apply to these sections
                  {analysis.sectionRecipe.some((r) => r.kind === 'embedded')
                    ? ' (including per-section generated content from the recipe).'
                    : '.'}
                  {' '}Set student page per section below.
                </>
              )}
          </p>
          <div className="space-y-2">
            {sectionTitles.map((row, i) => (
              <div
                key={row.id || `sec-row-${i}`}
                className="rounded-xl px-3 py-2.5 flex items-start gap-2"
                style={{ background: 'white', border: '1px solid rgba(0,0,0,0.06)' }}
              >
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: '#EEF2FF', color: '#4338CA', fontSize: 12, fontWeight: 700 }}
                >
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <input
                    className="w-full"
                    value={row.title}
                    onChange={(e) => {
                      const next = sectionTitles.map((r, j) => (j === i ? { ...r, title: e.target.value } : r));
                      onChangeSectionTitles(next);
                    }}
                    placeholder={`Section ${i + 1} title`}
                    style={{ fontSize: 14, fontWeight: 650, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 10px' }}
                  />
                  <input
                    className="w-full"
                    value={row.intent || ''}
                    onChange={(e) => {
                      const next = sectionTitles.map((r, j) => (j === i ? { ...r, intent: e.target.value } : r));
                      onChangeSectionTitles(next);
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
                        onChangeSectionTitles(sectionTitles.map((r, j) => (
                          j === i ? { ...r, learnerPage: page } : r
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
            ))}
          </div>
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
        color: '#1D4ED8',
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
  slot: V2TopLevelSlot;
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
      className="rounded-xl px-3.5 py-3"
      style={{
        background: picked ? 'rgba(5,150,105,0.06)' : 'rgba(254,243,199,0.55)',
        border: `1px solid ${picked ? 'rgba(5,150,105,0.25)' : '#FCD34D'}`,
      }}
    >
      <div className="flex items-start gap-2">
        <Library size={14} style={{ color: picked ? '#047857' : '#92400E', marginTop: 2 }} />
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 13, fontWeight: 650, color: picked ? '#065F46' : '#92400E' }}>
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
  slot: V2TopLevelSlot;
  pageOptionCount: number;
  learnerPage: number;
  onChangePage: (page: number) => void;
  onRemove?: () => void;
}) {
  const label = embedTypeLabel(String(slot.objectType));
  return (
    <div
      className="rounded-xl px-3.5 py-3 flex items-start gap-2"
      style={{ background: 'rgba(237,233,254,0.7)', border: '1px solid rgba(109,40,217,0.2)' }}
    >
      <Sparkles size={14} style={{ color: '#6D28D9', marginTop: 2 }} />
      <div className="flex-1 min-w-0">
        <p style={{ fontSize: 13, fontWeight: 650, color: '#5B21B6' }}>
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
  slots: V2TopLevelSlot[],
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
