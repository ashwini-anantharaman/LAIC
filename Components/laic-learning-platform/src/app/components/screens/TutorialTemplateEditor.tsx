import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, X } from 'lucide-react';
import type {
  AssessmentPlacement,
  AtomicBlockType,
  EmbeddedObjectItem,
  EmbeddableObjectType,
  RecipeItem,
  SectionConnectionRule,
  TutorialTemplate,
  VersionPin,
} from '../../../lib/types';
import {
  ASSESSMENT_OPTIONS,
  ATOMIC_BLOCK_OPTIONS,
  CONNECTION_OPTIONS,
  EMBEDDED_OBJECT_OPTIONS,
  SOURCE_MODE_OPTIONS,
  blankCustomTemplateDraft,
  deriveMediaSlots,
  FREEFORM_TUTORIAL_TEMPLATE_ID,
  isContentBearing,
  isKnowledgeCheckStyle,
  listEmbeddableLibraryObjects,
  makeAtomicItem,
  makeEmbeddedItem,
  needsLibraryPin,
  saveCustomTutorialTemplate,
  toFlatSectionBlockRecipe,
  versionPinResolves,
  type LibraryObjectChoice,
} from '../../../lib/tutorialTemplates';
import { useApp } from '../../App';
import { LibraryPickerModal } from '../LibraryPickerModal';

interface Props {
  initial?: TutorialTemplate | null;
  onSave: (template: TutorialTemplate) => void;
  onCancel: () => void;
}

const field: React.CSSProperties = {
  fontSize: 13,
  border: '1px solid rgba(0,0,0,0.1)',
  background: 'rgba(255,255,255,0.9)',
  outline: 'none',
};

function cloneRecipe(recipe: RecipeItem[]): RecipeItem[] {
  return recipe.map((item) => {
    if (item.kind === 'atomic') {
      return {
        ...item,
        preferKinds: item.preferKinds ? [...item.preferKinds] : undefined,
        media: item.media ? { ...item.media } : undefined,
      };
    }
    return {
      ...item,
      versionPin: item.versionPin ? { ...item.versionPin } : undefined,
    };
  });
}

function atomicLabel(type: AtomicBlockType): string {
  return ATOMIC_BLOCK_OPTIONS.find((o) => o.type === type)?.label || type;
}

function embeddedLabel(type: EmbeddableObjectType): string {
  return EMBEDDED_OBJECT_OPTIONS.find((o) => o.type === type)?.label || type;
}

export function TutorialTemplateEditor({ initial, onSave, onCancel }: Props) {
  const { createdObjects } = useApp();
  const seed = initial
    ? {
        name: initial.name,
        description: initial.description,
        structureLocked: initial.id === FREEFORM_TUTORIAL_TEMPLATE_ID
          ? false
          : initial.structureLocked !== false,
        sectionConnection: initial.sectionConnection,
        assessmentPlacement: initial.assessmentPlacement,
        recipe: cloneRecipe(initial.recipe?.length ? initial.recipe : []),
        knobDefaults: { ...initial.knobDefaults },
      }
    : blankCustomTemplateDraft();

  const [name, setName] = useState(seed.name);
  const [description, setDescription] = useState(seed.description);
  const [structureLocked, setStructureLocked] = useState(seed.structureLocked !== false);
  const [sectionConnection, setSectionConnection] = useState<SectionConnectionRule>(seed.sectionConnection);
  const [assessmentPlacement, setAssessmentPlacement] = useState<AssessmentPlacement>(seed.assessmentPlacement);
  const [recipe, setRecipe] = useState<RecipeItem[]>(seed.recipe);
  const [secs, setSecs] = useState(seed.knobDefaults.secs ?? 6);
  const [words, setWords] = useState(
    typeof seed.knobDefaults.words === 'number' && seed.knobDefaults.words >= 0
      ? seed.knobDefaults.words
      : 0,
  );
  const [dpth, setDpth] = useState(seed.knobDefaults.dpth || 'Standard');
  const [end, setEnd] = useState(seed.knobDefaults.end || 'Recap only');
  const [chks, setChks] = useState(seed.knobDefaults.chks ?? 2);
  const isFreeformBuiltin = initial?.id === FREEFORM_TUTORIAL_TEMPLATE_ID;
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryObjectChoice[]>([]);
  const [libraryStatus, setLibraryStatus] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle');
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [pickerForId, setPickerForId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLibraryStatus('loading');
    listEmbeddableLibraryObjects({ extraObjects: createdObjects })
      .then((rows) => {
        if (cancelled) return;
        setLibrary(rows);
        setLibraryStatus(rows.length ? 'idle' : 'empty');
        setLibraryError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLibrary([]);
        setLibraryStatus('error');
        setLibraryError(err instanceof Error ? err.message : 'Activity objects unavailable');
      });
    return () => { cancelled = true; };
  }, [createdObjects]);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= recipe.length) return;
    setRecipe((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const removeAt = (i: number) => {
    setRecipe((prev) => prev.filter((_, idx) => idx !== i));
  };

  const addAtomic = (type: AtomicBlockType) => {
    setRecipe((prev) => [...prev, makeAtomicItem(type)]);
  };

  const addEmbedded = (type: EmbeddableObjectType) => {
    const item = makeEmbeddedItem(type);
    setRecipe((prev) => [...prev, item]);
    if (item.sourceMode === 'pick_from_library') openPicker(item.id);
  };

  const patchEmbedded = (id: string, patch: Partial<EmbeddedObjectItem>) => {
    setRecipe((prev) => prev.map((item) => {
      if (item.kind !== 'embedded' || item.id !== id) return item;
      const next: EmbeddedObjectItem = { ...item, ...patch };
      if (patch.objectType === 'reused-from-library' && !patch.sourceMode) {
        next.sourceMode = 'pick_from_library';
      }
      if (patch.sourceMode === 'generate' || patch.sourceMode === 'prompt_on_author') {
        next.versionPin = undefined;
        next.libraryTitle = undefined;
      }
      return next;
    }));
  };

  const setPinFromLibrary = (itemId: string, objectId: string, versionId: string, title?: string) => {
    const obj = library.find((o) => o.id === objectId);
    const pin: VersionPin | undefined =
      objectId && versionId ? { objectId, versionId } : undefined;
    patchEmbedded(itemId, {
      versionPin: pin,
      libraryTitle: title || obj?.title,
    });
  };

  const openPicker = (itemId: string) => setPickerForId(itemId);

  const setSourceMode = (itemId: string, mode: EmbeddedObjectItem['sourceMode']) => {
    patchEmbedded(itemId, { sourceMode: mode });
    if (mode === 'pick_from_library') openPicker(itemId);
  };

  const validate = (): { ok: boolean; error: string | null; warning: string | null; rows: Record<string, string> } => {
    const rows: Record<string, string> = {};
    if (!name.trim()) {
      return { ok: false, error: 'Give the template a name.', warning: null, rows };
    }
    if (!recipe.length) {
      return { ok: false, error: 'Add at least one item to the section recipe.', warning: null, rows };
    }
    if (!recipe.some(isContentBearing)) {
      return {
        ok: false,
        error: 'Include at least one content-bearing item (not only a section heading).',
        warning: null,
        rows,
      };
    }

    for (const item of recipe) {
      if (item.kind !== 'embedded') continue;
      if (!item.required) continue;
      if (!item.sourceMode) {
        rows[item.id] = 'Required embedded slots need a source mode.';
        continue;
      }
      if (needsLibraryPin(item)) {
        if (!item.versionPin?.objectId || !item.versionPin?.versionId) {
          rows[item.id] = 'Pick a library object and pin a version, or change the source mode.';
        } else if (libraryStatus === 'empty' || libraryStatus === 'error') {
          rows[item.id] = 'Activity objects is unavailable — required pick slots cannot be resolved yet.';
        } else if (!versionPinResolves(item.versionPin, library)) {
          rows[item.id] = 'Pinned object or version no longer resolves (dangling reference).';
        }
      }
    }

    if (Object.keys(rows).length) {
      return {
        ok: false,
        error: 'Fix required embedded-object settings before saving.',
        warning: null,
        rows,
      };
    }

    let warn: string | null = null;
    const hasCheck = recipe.some(isKnowledgeCheckStyle);
    if (
      (assessmentPlacement === 'after_each_section' || assessmentPlacement === 'checkpoints_after_each')
      && !hasCheck
    ) {
      warn = 'Assessment expects a per-section check — add an embedded Quiz or a Try-it block.';
    } else if (assessmentPlacement === 'none' && hasCheck) {
      warn = 'Assessment is None, but the recipe still includes a Quiz or Try-it check.';
    }

    return { ok: true, error: null, warning: warn, rows };
  };

  const handleSave = () => {
    const result = validate();
    setRowErrors(result.rows);
    setWarning(result.warning);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);

    const mediaSlots = deriveMediaSlots(recipe);
    const sectionBlockRecipe = toFlatSectionBlockRecipe(recipe);

    // TODO: persistence should move to backend/API (RAG/schema); reusing existing save boundary only — do not expand localStorage surface.
    const saved = saveCustomTutorialTemplate({
      id: initial?.id,
      name: name.trim(),
      description: description.trim(),
      structureLocked: isFreeformBuiltin ? false : structureLocked,
      sectionConnection,
      assessmentPlacement,
      recipe,
      sectionBlockRecipe,
      mediaSlots,
      knobDefaults: {
        ...seed.knobDefaults,
        secs,
        words,
        prog: sectionConnection === 'prerequisite_chain' ? 'Prerequisite chain'
          : sectionConnection === 'standalone' ? 'Themed clusters' : 'Linear build-up',
        dpth,
        end,
        chks,
        excpts: typeof seed.knobDefaults.excpts === 'number' ? seed.knobDefaults.excpts : 0,
        wex: recipe.some((r) => r.kind === 'atomic' && r.blockType === 'worked-example'),
      },
    });
    onSave(saved);
  };

  useEffect(() => {
    const hasCheck = recipe.some(isKnowledgeCheckStyle);
    if (
      (assessmentPlacement === 'after_each_section' || assessmentPlacement === 'checkpoints_after_each')
      && !hasCheck
    ) {
      setWarning('Assessment expects a per-section check — add an embedded Quiz or a Try-it block.');
    } else if (assessmentPlacement === 'none' && hasCheck) {
      setWarning('Assessment is None, but the recipe still includes a Quiz or Try-it check.');
    } else {
      setWarning(null);
    }
  }, [assessmentPlacement, recipe]);

  const pill = (on: boolean): React.CSSProperties => ({
    fontSize: 12,
    fontWeight: on ? 650 : 500,
    background: on ? '#0B0F1A' : 'rgba(255,255,255,0.9)',
    color: on ? '#fff' : '#374151',
    borderColor: on ? '#0B0F1A' : 'rgba(0,0,0,0.1)',
  });

  const chipStyle: React.CSSProperties = {
    fontSize: 11.5,
    color: '#374151',
    borderColor: 'rgba(0,0,0,0.1)',
    background: 'rgba(255,255,255,0.9)',
  };

  const libraryEmptyCopy = libraryStatus === 'error'
    ? (libraryError || 'Activity objects unavailable.')
    : libraryStatus === 'loading'
      ? 'Loading Activity objects…'
      : 'No objects in the Activity objects yet.';

  const pickerItem = pickerForId
    ? recipe.find((r): r is EmbeddedObjectItem => r.kind === 'embedded' && r.id === pickerForId)
    : null;

  return (
    <div className="rounded-2xl border p-4 mb-3" style={{ background: 'rgba(255,255,255,0.95)', borderColor: 'rgba(0,0,0,0.1)' }}>
      <div className="flex items-center justify-between mb-3">
        <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0B1220' }}>
          {initial ? 'Edit template' : 'Create template'}
        </p>
        <button type="button" onClick={onCancel} className="p-1 rounded-lg" aria-label="Close">
          <X size={15} style={{ color: '#6B7280' }} />
        </button>
      </div>

      <label style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Drill then explain"
        className="w-full rounded-xl px-3 py-2 mb-3"
        style={field}
      />

      <label style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Description</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="One line on how each section should teach"
        className="w-full rounded-xl px-3 py-2 mb-3 resize-none"
        style={field}
      />

      <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 6 }}>Section connection</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {CONNECTION_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setSectionConnection(o.id)}
            className="px-3 py-1.5 rounded-full border"
            style={pill(sectionConnection === o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 6 }}>Assessment</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {ASSESSMENT_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setAssessmentPlacement(o.id)}
            className="px-3 py-1.5 rounded-full border"
            style={pill(assessmentPlacement === o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-3">
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>
            Sections
          </label>
          <input
            type="number"
            min={2}
            max={20}
            value={secs}
            onChange={(e) => setSecs(Math.max(2, Math.min(20, Number(e.target.value) || 3)))}
            className="w-20 rounded-xl px-3 py-2"
            style={field}
          />
        </div>
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>
            Target words
          </label>
          <input
            type="number"
            min={0}
            value={words}
            onChange={(e) => setWords(Math.max(0, Number(e.target.value) || 0))}
            className="w-28 rounded-xl px-3 py-2"
            style={field}
            title="0 = auto from depth × sections"
          />
        </div>
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>
            Checks / section
          </label>
          <input
            type="number"
            min={0}
            max={3}
            value={chks}
            onChange={(e) => setChks(Math.max(0, Math.min(3, Number(e.target.value) || 0)))}
            className="w-20 rounded-xl px-3 py-2"
            style={field}
          />
        </div>
        <div className="flex-1 min-w-[120px]">
          <label style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>
            Depth
          </label>
          <select
            value={dpth}
            onChange={(e) => setDpth(e.target.value)}
            className="w-full rounded-xl px-3 py-2"
            style={field}
          >
            {['Overview', 'Standard', 'In-depth'].map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>
            End with
          </label>
          <select
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full rounded-xl px-3 py-2"
            style={field}
          >
            {['Recap only', 'End quiz', 'End assignment', 'None'].map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
      </div>

      <div
        className="mb-3 px-3 py-2.5 rounded-xl border flex items-start gap-3"
        style={{ borderColor: 'rgba(0,0,0,0.08)', background: 'rgba(249,250,251,0.95)' }}
      >
        <input
          id="structure-locked"
          type="checkbox"
          checked={isFreeformBuiltin ? false : structureLocked}
          disabled={isFreeformBuiltin}
          onChange={(e) => setStructureLocked(e.target.checked)}
          className="mt-0.5"
        />
        <label htmlFor="structure-locked" style={{ fontSize: 12.5, color: '#374151', cursor: isFreeformBuiltin ? 'default' : 'pointer' }}>
          <span style={{ fontWeight: 650, color: '#0B1220' }}>
            Lock structure for course developers
          </span>
          <span style={{ display: 'block', marginTop: 2, color: '#9AA3AF', fontSize: 12 }}>
            {isFreeformBuiltin
              ? 'The Freeform template always lets authors choose sections, words, and related knobs.'
              : structureLocked
                ? 'Authors see these values but cannot change section count, word target, progression, checks, or scoring.'
                : 'Authors may change structure knobs when creating a tutorial (same freedom as Freeform).'}
          </span>
        </label>
      </div>

      <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 4 }}>
        Per-section recipe (order = teaching order)
      </p>
      <p style={{ fontSize: 12.5, color: '#9AA3AF', marginBottom: 8 }}>
        Atomic blocks are written inline; embedded objects nest whole learning objects in the section.
      </p>

      {warning && (
        <p
          className="mb-2 px-3 py-2 rounded-xl"
          style={{ fontSize: 12.5, color: '#92400E', background: '#FFFBEB', border: '1px solid rgba(217,119,6,0.25)' }}
        >
          {warning}
        </p>
      )}

      <div className="space-y-1.5 mb-3">
        {recipe.map((item, i) => {
          if (item.kind === 'atomic') {
            const isMedia = item.blockType === 'media';
            return (
              <div
                key={item.id}
                className="rounded-xl border overflow-hidden"
                style={{ background: 'rgba(249,250,251,0.95)', borderColor: 'rgba(0,0,0,0.08)' }}
              >
                <div className="flex items-center gap-2 px-3 py-2" style={{ borderLeft: '3px solid #94A3B8' }}>
                  <span style={{ fontSize: 11, color: '#9AA3AF', fontFamily: 'monospace', width: 18 }}>{i + 1}</span>
                  <span
                    className="px-1.5 py-0.5 rounded"
                    style={{ fontSize: 10, fontWeight: 650, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#6B7280', background: 'rgba(0,0,0,0.04)' }}
                  >
                    Block
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0B1220', flex: 1 }}>
                    {atomicLabel(item.blockType)}
                  </span>
                  {isMedia && (
                    <span style={{ fontSize: 11, color: '#9AA3AF' }}>Optional</span>
                  )}
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1 disabled:opacity-30">
                    <ChevronUp size={14} style={{ color: '#6B7280' }} />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === recipe.length - 1} className="p-1 disabled:opacity-30">
                    <ChevronDown size={14} style={{ color: '#6B7280' }} />
                  </button>
                  <button type="button" onClick={() => removeAt(i)} className="p-1">
                    <Trash2 size={13} style={{ color: '#EF4444' }} />
                  </button>
                </div>
                {isMedia && (
                  <p className="px-3 pb-2" style={{ fontSize: 12, color: '#9AA3AF', paddingLeft: 44 }}>
                    Optional — skip if no matching media; never blocks generation.
                  </p>
                )}
              </div>
            );
          }

          const showPin = needsLibraryPin(item);
          const rowErr = rowErrors[item.id];
          const pinned = item.versionPin
            ? library.find((o) => o.id === item.versionPin?.objectId)
            : null;
          const pinnedVersion = pinned?.versions.find((v) => v.versionId === item.versionPin?.versionId);

          return (
            <div
              key={item.id}
              className="rounded-xl border overflow-hidden"
              style={{ background: 'rgba(249,250,251,0.95)', borderColor: 'rgba(0,0,0,0.08)' }}
            >
              <div className="flex items-center gap-2 px-3 py-2" style={{ borderLeft: '3px solid #059669' }}>
                <span style={{ fontSize: 11, color: '#9AA3AF', fontFamily: 'monospace', width: 18 }}>{i + 1}</span>
                <span
                  className="px-1.5 py-0.5 rounded"
                  style={{ fontSize: 10, fontWeight: 650, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#047857', background: 'rgba(5,150,105,0.08)' }}
                >
                  Embedded object
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0B1220', flex: 1 }}>
                  {embeddedLabel(item.objectType)}
                </span>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1 disabled:opacity-30">
                  <ChevronUp size={14} style={{ color: '#6B7280' }} />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === recipe.length - 1} className="p-1 disabled:opacity-30">
                  <ChevronDown size={14} style={{ color: '#6B7280' }} />
                </button>
                <button type="button" onClick={() => removeAt(i)} className="p-1">
                  <Trash2 size={13} style={{ color: '#EF4444' }} />
                </button>
              </div>

              <div className="px-3 pb-3 space-y-2.5" style={{ paddingLeft: 14, borderLeft: '3px solid #059669', marginLeft: 0 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>
                    Object type
                  </label>
                  <select
                    value={item.objectType}
                    onChange={(e) => patchEmbedded(item.id, { objectType: e.target.value as EmbeddableObjectType })}
                    className="w-full rounded-xl px-3 py-2"
                    style={field}
                  >
                    {EMBEDDED_OBJECT_OPTIONS.map((o) => (
                      <option key={o.type} value={o.type}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', marginBottom: 4 }}>Source mode</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SOURCE_MODE_OPTIONS.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setSourceMode(item.id, o.id)}
                        className="px-2.5 py-1 rounded-full border"
                        style={pill(item.sourceMode === o.id)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', marginBottom: 4 }}>Slot</p>
                  <div className="flex flex-wrap gap-1.5">
                    {([true, false] as const).map((req) => (
                      <button
                        key={String(req)}
                        type="button"
                        onClick={() => patchEmbedded(item.id, { required: req })}
                        className="px-2.5 py-1 rounded-full border"
                        style={pill(item.required === req)}
                      >
                        {req ? 'Required' : 'Optional'}
                      </button>
                    ))}
                  </div>
                </div>

                {showPin && (
                  <div className="space-y-2">
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block' }}>
                      Library object + version pin
                    </label>
                    {item.versionPin && (item.libraryTitle || pinned) ? (
                      <div
                        className="rounded-xl px-3 py-2"
                        style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(0,0,0,0.08)' }}
                      >
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220' }}>
                          {item.libraryTitle || pinned?.title}
                        </p>
                        <p style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                          {(pinned?.type || 'object')}
                          {pinnedVersion
                            ? ` · pinned v${pinnedVersion.versionNumber}${pinnedVersion.isLive ? ' (live)' : ''}`
                            : ' · version pinned'}
                        </p>
                      </div>
                    ) : (
                      <p style={{ fontSize: 12.5, color: '#9AA3AF' }}>
                        No object selected yet.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => openPicker(item.id)}
                      className="px-3 py-1.5 rounded-full border"
                      style={{ fontSize: 12, fontWeight: 600, color: '#047857', borderColor: 'rgba(5,150,105,0.35)', background: 'rgba(5,150,105,0.06)' }}
                    >
                      {item.versionPin ? 'Change library object…' : 'Browse Activity objects…'}
                    </button>
                  </div>
                )}

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>
                    Authoring note
                  </label>
                  <input
                    value={item.authoringNote || ''}
                    onChange={(e) => patchEmbedded(item.id, { authoringNote: e.target.value })}
                    placeholder="e.g. quiz should test only this section's concept"
                    className="w-full rounded-xl px-3 py-2"
                    style={field}
                  />
                </div>

                {rowErr && (
                  <p style={{ fontSize: 12, color: '#B91C1C' }}>{rowErr}</p>
                )}
              </div>
            </div>
          );
        })}

        {recipe.length === 0 && (
          <p style={{ fontSize: 12.5, color: '#9AA3AF' }}>
            No items yet — add a block or an embedded object below.
          </p>
        )}
      </div>

      <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 6 }}>Add block</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {ATOMIC_BLOCK_OPTIONS.map((o) => (
          <button
            key={o.type}
            type="button"
            onClick={() => addAtomic(o.type)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full border"
            style={chipStyle}
          >
            <Plus size={11} />{o.label}
          </button>
        ))}
      </div>

      <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 6 }}>Add embedded object</p>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {EMBEDDED_OBJECT_OPTIONS.map((o) => (
          <button
            key={o.type}
            type="button"
            onClick={() => addEmbedded(o.type)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full border"
            style={chipStyle}
          >
            <Plus size={11} />{o.label}
          </button>
        ))}
      </div>

      {error && (
        <p style={{ fontSize: 12.5, color: '#B91C1C', marginBottom: 10 }}>{error}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-2 rounded-full text-white"
          style={{ background: '#059669', fontSize: 13, fontWeight: 600 }}
        >
          Save template
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-full border"
          style={{ fontSize: 13, color: '#6B7280', borderColor: 'rgba(0,0,0,0.1)' }}
        >
          Cancel
        </button>
      </div>

      {pickerItem && (
        <LibraryPickerModal
          open={!!pickerForId}
          onClose={() => setPickerForId(null)}
          library={library}
          libraryStatus={libraryStatus}
          libraryEmptyCopy={libraryEmptyCopy}
          slotObjectType={pickerItem.objectType}
          initialObjectId={pickerItem.versionPin?.objectId}
          initialVersionId={pickerItem.versionPin?.versionId}
          onConfirm={(objectId, versionId, title) => {
            setPinFromLibrary(pickerItem.id, objectId, versionId, title);
            setPickerForId(null);
          }}
        />
      )}
    </div>
  );
}
