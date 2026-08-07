/**
 * Tutorial V2 Structure — recipe checklist:
 * library pick slots, generate-later slots, and N section title rows.
 * No template picker / objective here.
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
} from '../../../../lib/tutorialV2/recipeStructure';
import {
  listEmbeddableLibraryObjects,
  type LibraryObjectChoice,
} from '../../../../lib/tutorialV2/tutorialTemplates';
import { findLibraryLearningObject } from '../../../../lib/libraryEmbed';
import type { V2TopLevelSlot } from '../../../../lib/tutorialV2/types';
import { LibraryPickerModal } from '../../LibraryPickerModal';

export function TutorialV2StructurePanel({
  template,
  slots,
  onChangeSlots,
  sectionTitles,
  onChangeSectionTitles,
  createdObjects = [],
  /** Write-it-yourself: freeform section count, no template framing. */
  writeYourself = false,
}: {
  template: TutorialTemplate;
  slots: V2TopLevelSlot[];
  onChangeSlots: (next: V2TopLevelSlot[]) => void;
  sectionTitles: { id?: string; title: string; intent?: string }[];
  onChangeSectionTitles: (next: { id?: string; title: string; intent?: string }[]) => void;
  createdObjects?: LearningObject[];
  writeYourself?: boolean;
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

  // Keep section title rows aligned with template section count (unless write-yourself).
  useEffect(() => {
    if (writeYourself) {
      if (!sectionTitles.length) {
        onChangeSectionTitles([
          { title: 'Section 1', intent: '' },
          { title: 'Section 2', intent: '' },
          { title: 'Section 3', intent: '' },
        ]);
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
      next.push({ title: `Section ${next.length + 1}`, intent: '' });
    }
    onChangeSectionTitles(next);
  }, [analysis.hasSections, analysis.sectionCount, writeYourself]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickerSlot = slots.find((s) => s.id === pickerSlotId) || null;

  const empty = !analysis.hasSections
    && !analysis.libraryEmbeds.length
    && !analysis.topLevelGenerateEmbeds.length;

  return (
    <div className="space-y-5 px-1">
      <div>
        <p style={{ fontSize: 13.5, color: '#6B7280' }}>
          {writeYourself
            ? 'Name the sections you want to write. You’ll add text, images, and videos in Author.'
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

      {!writeYourself && slots.filter((s) => s.kind === 'library').length > 0 && (
        <div>
          <p style={{ fontSize: 12, fontWeight: 650, color: '#9AA3AF', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 8 }}>
            From Content Library
          </p>
          <div className="space-y-2">
            {slots.filter((s) => s.kind === 'library').map((slot) => (
              <LibrarySlotRow
                key={slot.id}
                slot={slot}
                onBrowse={() => {
                  setPickerSlotId(slot.id);
                  setPickerType(slot.objectType);
                }}
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
            {slots.filter((s) => s.kind === 'generate').map((slot) => (
              <GenerateSlotRow key={slot.id} slot={slot} />
            ))}
          </div>
        </div>
      )}

      {(writeYourself || analysis.hasSections) && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p style={{ fontSize: 12, fontWeight: 650, color: '#9AA3AF', letterSpacing: '.04em', textTransform: 'uppercase' }}>
              Sections ({sectionTitles.length || (writeYourself ? 0 : analysis.sectionCount)})
            </p>
            {writeYourself && (
              <button
                type="button"
                onClick={() => onChangeSectionTitles([
                  ...sectionTitles,
                  { title: `Section ${sectionTitles.length + 1}`, intent: '' },
                ])}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border"
                style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
              >
                <Plus size={12} /> Add section
              </button>
            )}
          </div>
          <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 8 }}>
            {writeYourself
              ? 'Add as many sections as you need. Each one is written by hand next.'
              : (
                <>
                  Sources and markup apply to these sections
                  {analysis.sectionRecipe.some((r) => r.kind === 'embedded')
                    ? ' (including per-section generated content from the recipe).'
                    : '.'}
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
                </div>
                {writeYourself && sectionTitles.length > 1 && (
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

function LibrarySlotRow({
  slot,
  onBrowse,
}: {
  slot: V2TopLevelSlot;
  onBrowse: () => void;
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
          <button
            type="button"
            onClick={onBrowse}
            className="mt-2 px-3 py-1.5 rounded-full border"
            style={{ fontSize: 12, fontWeight: 600, background: '#fff', borderColor: 'rgba(0,0,0,0.1)' }}
          >
            {picked ? 'Change…' : 'Browse Content Library…'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GenerateSlotRow({ slot }: { slot: V2TopLevelSlot }) {
  const label = embedTypeLabel(String(slot.objectType));
  return (
    <div
      className="rounded-xl px-3.5 py-3 flex items-start gap-2"
      style={{ background: 'rgba(237,233,254,0.7)', border: '1px solid rgba(109,40,217,0.2)' }}
    >
      <Sparkles size={14} style={{ color: '#6D28D9', marginTop: 2 }} />
      <div>
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
      </div>
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
