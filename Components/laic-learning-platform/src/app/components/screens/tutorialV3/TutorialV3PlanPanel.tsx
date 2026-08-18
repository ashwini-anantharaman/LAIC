/**
 * Tutorial V3 Plan panel — clone of V1 TutorialPlanPanel (template-driven outline + embeds).
 */
import React, { useEffect, useState } from 'react';
import { Plus, Trash2, ChevronDown } from 'lucide-react';
import type { DefinedSection, LearningObject, TutorialDefinition, TutorialTemplate } from '../../../../lib/types';
import {
  embedTypeLabel,
  isEmbedAttachedToSection,
  listEmbedsForDefinition,
  listTemplateRecipeEmbeds,
  newSectionId,
  patchEmbedPlan,
  setSectionEmbedAttached,
  type ListedEmbed,
} from '../../../../lib/tutorialV3/tutorialDefinition';
import {
  listEmbeddableLibraryObjects,
  type LibraryObjectChoice,
} from '../../../../lib/tutorialV3/tutorialTemplates';
import { LibraryPickerModal } from '../../LibraryPickerModal';

export function TutorialV3PlanPanel({
  def,
  setDef,
  template,
  templateName,
  createdObjects = [],
}: {
  def: TutorialDefinition;
  setDef: (next: TutorialDefinition | ((p: TutorialDefinition) => TutorialDefinition)) => void;
  template?: TutorialTemplate | null;
  templateName?: string;
  createdObjects?: LearningObject[];
}) {
  const templateEmbeds = template ? listTemplateRecipeEmbeds(template) : [];
  const allEmbedIds = templateEmbeds.map((e) => e.id);
  const embeds = template ? listEmbedsForDefinition(def, template) : [];
  const genEmbeds = embeds.filter((e) => e.effectiveMode === 'generate');
  const libEmbeds = embeds.filter((e) => e.effectiveMode === 'pick_from_library');
  const genTypes = [...new Set(genEmbeds.map((e) => embedTypeLabel(e.item.objectType)))];

  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const [pickerType, setPickerType] = useState<string>('reused-from-library');
  const [library, setLibrary] = useState<LibraryObjectChoice[]>([]);
  const [libraryStatus, setLibraryStatus] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle');

  useEffect(() => {
    if (!pickerKey) return;
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
  }, [pickerKey, createdObjects]);

  const updateSection = (id: string, patch: Partial<DefinedSection>) => {
    setDef((p) => ({
      ...p,
      sections: p.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  };
  const addSection = () => {
    setDef((p) => ({
      ...p,
      sections: [
        ...p.sections,
        {
          id: newSectionId(),
          title: `Section ${p.sections.length + 1}`,
          intent: '',
          // New sections start with no embeds — author tags which content belongs here.
          attachedEmbedIds: [],
        },
      ],
    }));
  };

  const toggleEmbedOnSection = (sectionId: string, recipeItemId: string, attached: boolean) => {
    setDef((p) => setSectionEmbedAttached(p, sectionId, recipeItemId, attached, allEmbedIds));
  };
  const removeSection = (id: string) => {
    setDef((p) => ({
      ...p,
      sections: p.sections.length <= 1 ? p.sections : p.sections.filter((s) => s.id !== id),
    }));
  };
  const moveSection = (id: string, dir: -1 | 1) => {
    setDef((p) => {
      const i = p.sections.findIndex((s) => s.id === id);
      if (i < 0) return p;
      const j = i + dir;
      if (j < 0 || j >= p.sections.length) return p;
      const next = [...p.sections];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...p, sections: next };
    });
  };
  const patchPlan = (key: string, patch: Parameters<typeof patchEmbedPlan>[2]) => {
    setDef((p) => patchEmbedPlan(p, key, patch));
  };

  const renderEmbedRow = (e: ListedEmbed) => {
    const typeLabel = embedTypeLabel(e.item.objectType);
    const mode = e.effectiveMode;
    const unresolved = e.item.sourceMode === 'prompt_on_author' && mode == null;

    if (mode === 'pick_from_library' || (e.item.sourceMode === 'pick_from_library' && !unresolved)) {
      const pin = e.item.versionPin;
      if (pin?.objectId) {
        return (
          <div key={e.key} className="rounded-lg px-2.5 py-2" style={{ background: 'rgba(77,124,90,0.06)', border: '1px solid rgba(77,124,90,0.2)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#2f4e39' }}>
              ✓ {typeLabel}: {e.item.libraryTitle || pin.objectId}
              {pin.versionId ? ` · pinned ${pin.versionId}` : ''}
              {' — from library'}
            </p>
            <button
              type="button"
              onClick={() => {
                setPickerKey(e.key);
                setPickerType(e.item.objectType);
              }}
              className="mt-1.5 px-2.5 py-1 rounded-full border"
              style={{ fontSize: 11.5, fontWeight: 600, background: '#fff', borderColor: 'rgba(0,0,0,0.1)', color: '#3d6349' }}
            >
              Change library content…
            </button>
          </div>
        );
      }
      // Template left a library slot — course developer must pick.
      return (
        <div key={e.key} className="rounded-lg px-2.5 py-2 space-y-2" style={{ background: 'rgba(254,243,199,0.55)', border: '1px solid #FCD34D' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#92400E' }}>
            Choose a library {typeLabel}
            {e.item.libraryTitle ? ` (“${e.item.libraryTitle}”)` : ''}
            {e.item.required ? ' (required)' : ' (optional)'}
          </p>
          {e.authoringNote && (
            <p style={{ fontSize: 11.5, color: '#6B7280' }}>Note: {e.authoringNote}</p>
          )}
          <button
            type="button"
            onClick={() => {
              setPickerKey(e.key);
              setPickerType(e.item.objectType);
            }}
            className="px-2.5 py-1 rounded-full border"
            style={{ fontSize: 11.5, fontWeight: 600, background: '#fff', borderColor: 'rgba(0,0,0,0.1)' }}
          >
            Browse Content Library…
          </button>
        </div>
      );
    }

    if (unresolved) {
      return (
        <div key={e.key} className="rounded-lg px-2.5 py-2 space-y-2" style={{ background: 'rgba(254,243,199,0.55)', border: '1px solid #FCD34D' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#92400E' }}>
            Choose how to source this {typeLabel}:
            {e.item.required ? ' (required)' : ' (optional)'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => patchPlan(e.key, { resolvedMode: 'generate' })}
              className="px-2.5 py-1 rounded-full border"
              style={{ fontSize: 11.5, fontWeight: 600, background: '#fff', borderColor: 'rgba(0,0,0,0.1)' }}
            >
              Generate new
            </button>
            <button
              type="button"
              onClick={() => {
                setPickerKey(e.key);
                setPickerType(e.item.objectType);
              }}
              className="px-2.5 py-1 rounded-full border"
              style={{ fontSize: 11.5, fontWeight: 600, background: '#fff', borderColor: 'rgba(0,0,0,0.1)' }}
            >
              Pick from library
            </button>
          </div>
        </div>
      );
    }

    // generate (or resolved generate)
    const objVal = e.override?.objective ?? e.effectiveMeta?.objective ?? '';
    return (
      <div key={e.key} className="rounded-lg px-2.5 py-2 space-y-1.5" style={{ background: 'rgba(239,246,255,0.9)', border: '1px solid rgba(37,99,235,0.2)' }}>
        <p style={{ fontSize: 12, fontWeight: 650, color: '#1E40AF' }}>
          ⚙ {typeLabel} (generate) — authored from this section&apos;s units
          {e.item.objectType === 'scenario' ? ' · deferred (placeholder at generate)' : ''}
        </p>
        {e.authoringNote && (
          <p style={{ fontSize: 11.5, color: '#6B7280' }}>Note: {e.authoringNote}</p>
        )}
        <input
          value={objVal}
          onChange={(ev) => patchPlan(e.key, { objective: ev.target.value })}
          placeholder="Optional objective / intent for this embed"
          className="w-full rounded-lg px-2 py-1.5"
          style={{ fontSize: 12, border: '1px solid rgba(0,0,0,0.08)', background: '#fff', outline: 'none' }}
        />
      </div>
    );
  };

  return (
    <div className="p-5 max-w-2xl">
      <div className="mb-4 rounded-2xl p-4 border" style={{ background: 'rgba(255,255,255,0.7)', borderColor: 'rgba(0,0,0,0.08)' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#0B1220', marginBottom: 4 }}>Plan this tutorial</p>
        <p style={{ fontSize: 12.5, color: '#6B7280', lineHeight: 1.5 }}>
          Set the learning objective and named sections first. Tag which generate/library content belongs to each section so they don’t overlap. Mark up and Extract assign source units into these sections — the AI will not invent the outline.
        </p>
        {templateName && (
          <p style={{ fontSize: 12, color: '#3d6349', marginTop: 8 }}>
            Template · {templateName} — teaching blocks come from the default recipe; content is tagged per section below.
          </p>
        )}
        {templateEmbeds.length > 0 && (
          <p style={{ fontSize: 12, color: '#374151', marginTop: 10, fontWeight: 500 }}>
            Template offers {templateEmbeds.length} content slot{templateEmbeds.length === 1 ? '' : 's'}
            {genTypes.length ? ` · currently tagged to generate: ${genEmbeds.length} (${genTypes.join(', ')})` : ''}
            {libEmbeds.length ? ` · ${libEmbeds.length} from library` : ''}.
          </p>
        )}
      </div>

      <div className="mb-4 p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.7)', borderColor: 'rgba(0,0,0,0.08)' }}>
        <p style={{ fontSize: 12.5, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Learning objective</p>
        <textarea
          value={def.objective}
          onChange={(e) => setDef((p) => ({ ...p, objective: e.target.value }))}
          rows={3}
          placeholder="What the learner can do after the whole tutorial"
          className="w-full rounded-xl px-3 py-2"
          style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', outline: 'none', lineHeight: 1.45 }}
        />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <p style={{ fontSize: 13, fontWeight: 700, color: '#0B1220' }}>Sections</p>
        <button
          type="button"
          onClick={addSection}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full border"
          style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
        >
          <Plus size={13} /> Add section
        </button>
      </div>

      <div className="space-y-2">
        {def.sections.map((s, i) => {
          const sectionEmbeds = embeds.filter((e) => e.sectionId === s.id);
          return (
            <div key={s.id} className="p-3 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.85)', borderColor: 'rgba(0,0,0,0.08)' }}>
              <div className="flex items-center gap-2 mb-2">
                <span style={{ fontSize: 11, fontWeight: 700, color: '#9AA3AF', width: 22 }}>{i + 1}</span>
                <input
                  value={s.title}
                  onChange={(e) => updateSection(s.id, { title: e.target.value })}
                  placeholder={`Section ${i + 1} title`}
                  className="flex-1 rounded-lg px-2.5 py-1.5 font-semibold"
                  style={{ fontSize: 13.5, border: '1px solid rgba(0,0,0,0.1)', background: '#fff', outline: 'none', color: '#0B1220' }}
                />
                <button type="button" title="Move up" disabled={i === 0} onClick={() => moveSection(s.id, -1)} className="p-1.5 rounded-lg disabled:opacity-30" style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
                  <ChevronDown size={13} style={{ transform: 'rotate(180deg)', color: '#6B7280' }} />
                </button>
                <button type="button" title="Move down" disabled={i === def.sections.length - 1} onClick={() => moveSection(s.id, 1)} className="p-1.5 rounded-lg disabled:opacity-30" style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
                  <ChevronDown size={13} style={{ color: '#6B7280' }} />
                </button>
                <button type="button" title="Remove" disabled={def.sections.length <= 1} onClick={() => removeSection(s.id)} className="p-1.5 rounded-lg disabled:opacity-30">
                  <Trash2 size={13} style={{ color: '#EF4444' }} />
                </button>
              </div>
              <input
                value={s.intent}
                onChange={(e) => updateSection(s.id, { intent: e.target.value })}
                placeholder="What this section teaches (one line)"
                className="w-full rounded-lg px-2.5 py-1.5 mb-2"
                style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: '#FAFBFC', outline: 'none' }}
              />

              {templateEmbeds.length > 0 && (
                <div className="mb-2">
                  <p style={{ fontSize: 10.5, fontWeight: 700, color: '#9AA3AF', letterSpacing: '.04em', marginBottom: 6 }}>
                    CONTENT FOR THIS SECTION
                  </p>
                  <p style={{ fontSize: 11.5, color: '#9AA3AF', marginBottom: 6 }}>
                    Tag which template content belongs here. Leave others off so sections don’t share the same generated content.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {templateEmbeds.map((emb) => {
                      const on = isEmbedAttachedToSection(s, emb.id);
                      const modeLabel = emb.sourceMode === 'pick_from_library'
                        ? 'library'
                        : emb.sourceMode === 'prompt_on_author'
                          ? 'choose later'
                          : 'generate';
                      return (
                        <button
                          key={emb.id}
                          type="button"
                          onClick={() => toggleEmbedOnSection(s.id, emb.id, !on)}
                          className="px-2.5 py-1 rounded-full border"
                          style={{
                            fontSize: 11.5,
                            fontWeight: on ? 650 : 500,
                            background: on ? '#1e2b3d' : '#fff',
                            color: on ? '#fff' : '#374151',
                            borderColor: on ? '#1e2b3d' : 'rgba(0,0,0,0.1)',
                          }}
                          title={emb.authoringNote || embedTypeLabel(emb.objectType)}
                        >
                          {on ? '✓ ' : ''}{embedTypeLabel(emb.objectType)} · {modeLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {sectionEmbeds.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  <p style={{ fontSize: 10.5, fontWeight: 700, color: '#9AA3AF', letterSpacing: '.04em' }}>TAGGED OBJECT SETTINGS</p>
                  {sectionEmbeds.map(renderEmbedRow)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <LibraryPickerModal
        open={!!pickerKey}
        onClose={() => setPickerKey(null)}
        library={library}
        libraryStatus={libraryStatus === 'idle' && library.length ? 'idle' : libraryStatus}
        libraryEmptyCopy="No Content Library items available to pin yet."
        slotObjectType={pickerType as any}
        onConfirm={(objectId, versionId, title) => {
          if (!pickerKey) return;
          patchPlan(pickerKey, {
            resolvedMode: 'pick_from_library',
            versionPin: { objectId, versionId },
            libraryTitle: title,
          });
          setPickerKey(null);
        }}
      />
    </div>
  );
}