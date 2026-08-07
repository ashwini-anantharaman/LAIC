import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, ChevronUp, ChevronDown, ChevronRight, X, Lock, Unlock,
  FileText, LayoutList, Eye, Sparkles, BookOpen, Puzzle,
} from 'lucide-react';
import type {
  AssessmentPlacement,
  AtomicBlockItem,
  AtomicBlockType,
  BlockCondition,
  ContentUnitKind,
  EmbeddedGenerateMeta,
  EmbeddedObjectItem,
  EmbeddableObjectType,
  RecipeItem,
  SectionArchetype,
  SectionConnectionRule,
  TutorialKnobLocks,
  TutorialTemplate,
} from '../../../lib/types';
import {
  ASSESSMENT_OPTIONS,
  ATOMIC_BLOCK_OPTIONS,
  CONNECTION_OPTIONS,
  EMBEDDED_OBJECT_OPTIONS,
  KNOB_LOCK_OPTIONS,
  SOURCE_MODE_OPTIONS,
  blankCustomTemplateDraft,
  cloneRecipeItems,
  FREEFORM_TUTORIAL_TEMPLATE_ID,
  isContentBearing,
  listTemplateValidationWarnings,
  makeAtomicItem,
  makeEmbeddedItem,
  needsLibraryPin,
  newRecipeItemId,
  saveCustomTutorialTemplate,
  recipeHasSectionBlock,
  stripSeededSectionArchetypes,
  toFlatSectionBlockRecipe,
} from '../../../lib/tutorialTemplates';

// Re-export type alias used in editor — KnobLockKey lives on TutorialKnobLocks keys
type LockKey = keyof TutorialKnobLocks;

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

const CONTENT_KINDS: ContentUnitKind[] = [
  'Definition', 'Key point', 'Example', 'Quote', 'Fact', 'Procedure',
];

const QUIZ_QTYPES = ['Multiple choice', 'True/false', 'Multi-select', 'Short answer', 'Scenario'];
const QUIZ_COG = ['Recall', 'Understand', 'Apply', 'Analyze'];
const FLASH_CC = ['Key terms → definitions', 'Concept → example', 'Question → answer', 'Image → label'];
const FLASH_PULL = [
  'Glossary / key terms in source', 'Concepts I focus on',
  'Examples & worked cases', 'Misconceptions to correct', 'Questions in the source',
];

function atomicLabel(type: AtomicBlockType): string {
  return ATOMIC_BLOCK_OPTIONS.find((o) => o.type === type)?.label || type;
}

function embeddedLabel(type: EmbeddableObjectType): string {
  return EMBEDDED_OBJECT_OPTIONS.find((o) => o.type === type)?.label || type;
}

function recipeSummary(recipe: RecipeItem[]): string {
  if (!recipe.length) return '(empty)';
  return recipe.map((item) => {
    if (item.kind === 'atomic') return atomicLabel(item.blockType);
    return embeddedLabel(item.objectType);
  }).join(' → ');
}

function emptyLocks(): TutorialKnobLocks {
  return { secs: false, prog: false, dpth: false, end: false, chks: false, scoring: false };
}

function seedLocks(t?: TutorialTemplate | null): TutorialKnobLocks {
  if (!t || t.id === FREEFORM_TUTORIAL_TEMPLATE_ID) return emptyLocks();
  if (t.knobLocks && typeof t.knobLocks === 'object') return { ...emptyLocks(), ...t.knobLocks };
  // Legacy all-or-nothing
  if (t.structureLocked !== false) {
    return { secs: true, prog: true, dpth: true, end: true, chks: true, scoring: true };
  }
  return emptyLocks();
}

function conditionSummary(condition: BlockCondition | undefined): string {
  const kind = condition?.kind || 'always';
  if (kind === 'if_source_kinds' && condition?.kind === 'if_source_kinds') {
    const kinds = condition.kinds || [];
    return kinds.length ? `If source has kinds` : 'If source has kinds';
  }
  if (kind === 'if_source_hint') return 'If source mentions…';
  return 'Always';
}

function atomicRowSummary(item: AtomicBlockItem): string {
  const req = item.blockType === 'section-heading'
    ? null
    : (item.required !== false ? 'Required' : 'Optional');
  const bits = [req, conditionSummary(item.condition)].filter(Boolean);
  return bits.join(' · ');
}

function sourceModeLabel(mode: EmbeddedObjectItem['sourceMode']): string {
  return SOURCE_MODE_OPTIONS.find((o) => o.id === mode)?.label || mode || '—';
}

function generationSettingsSummary(item: EmbeddedObjectItem, chksFallback: number): string {
  const gm = item.generateMeta || {};
  if (item.objectType === 'quiz') {
    const q = gm.questionCount ?? chksFallback ?? 2;
    const pass = gm.passOn === false ? 'no pass' : (gm.passMark || '70%');
    const diff = gm.diff || 'Balanced';
    return `${q}Q · ${pass} · ${diff}`;
  }
  if (item.objectType === 'flashcard-set') {
    return `${Number(gm.cardCount) || 8} cards · ${gm.dir || 'Front→back'}`;
  }
  if (item.objectType === 'concept-card') {
    return `${gm.voi || 'Plain & friendly'} · ${gm.len || 'Standard'}`;
  }
  if (item.objectType === 'assignment') {
    return `${gm.tt || 'Short essay'} · ${gm.del || 'Written text'}`;
  }
  if (gm.title) return gm.title;
  return 'defaults';
}

function embeddedRowSummary(
  item: EmbeddedObjectItem,
  chksFallback: number,
): string {
  const bits: string[] = [
    embeddedLabel(item.objectType),
    sourceModeLabel(item.sourceMode),
    item.required ? 'Required' : 'Optional',
  ];
  if (needsLibraryPin(item)) {
    const title = item.libraryTitle?.trim();
    bits.push(title || 'course developer picks');
  } else if (item.sourceMode === 'generate') {
    bits.push(generationSettingsSummary(item, chksFallback));
  }
  return bits.join(' · ');
}

function EditorGroupHeader({
  icon,
  title,
  subtitle,
  trailing,
  onClick,
  expanded,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onClick?: () => void;
  expanded?: boolean;
}) {
  const clickable = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className="w-full flex items-center gap-2.5 text-left disabled:cursor-default"
      style={{ background: 'transparent', border: 'none', padding: 0 }}
    >
      <span
        className="flex items-center justify-center rounded-lg shrink-0"
        style={{
          width: 28,
          height: 28,
          background: 'rgba(0,0,0,0.04)',
          color: '#6B7280',
        }}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p style={{ fontSize: 13, fontWeight: 700, color: '#0B1220' }}>{title}</p>
        {subtitle ? (
          <p style={{ fontSize: 12, color: '#9AA3AF', marginTop: 1 }}>{subtitle}</p>
        ) : null}
      </div>
      {trailing}
      {clickable && (
        <ChevronRight
          size={15}
          style={{
            color: '#9AA3AF',
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        />
      )}
    </button>
  );
}

export function TutorialTemplateEditor({ initial, onSave, onCancel }: Props) {
  const seed = initial
    ? {
        name: initial.name,
        description: initial.description,
        sectionConnection: initial.sectionConnection,
        assessmentPlacement: initial.assessmentPlacement,
        recipe: cloneRecipeItems(initial.recipe?.length ? initial.recipe : []),
        archetypes: stripSeededSectionArchetypes(initial.archetypes).map((a) => ({
          ...a,
          recipe: cloneRecipeItems(a.recipe || []),
        })),
        knobDefaults: { ...initial.knobDefaults },
        knobLocks: seedLocks(initial),
      }
    : {
        ...blankCustomTemplateDraft(),
        recipe: cloneRecipeItems(blankCustomTemplateDraft().recipe),
        archetypes: [],
        knobLocks: emptyLocks(),
      };

  const [name, setName] = useState(seed.name);
  const [description, setDescription] = useState(seed.description);
  const [knobLocks, setKnobLocks] = useState<TutorialKnobLocks>(seed.knobLocks);
  const [sectionConnection, setSectionConnection] = useState<SectionConnectionRule>(seed.sectionConnection);
  const [assessmentPlacement, setAssessmentPlacement] = useState<AssessmentPlacement>(seed.assessmentPlacement);
  const [recipe, setRecipe] = useState<RecipeItem[]>(seed.recipe);
  const [archetypes, setArchetypes] = useState<SectionArchetype[]>(seed.archetypes || []);
  /** Which recipe is being edited: default or an archetype id. */
  const [editTarget, setEditTarget] = useState<'default' | string>('default');
  const [secs, setSecs] = useState(seed.knobDefaults.secs ?? 6);
  const [dpth, setDpth] = useState(seed.knobDefaults.dpth || 'Standard');
  const [end, setEnd] = useState(seed.knobDefaults.end || 'Recap only');
  const [chks, setChks] = useState(seed.knobDefaults.chks ?? 2);
  const isFreeformBuiltin = initial?.id === FREEFORM_TUTORIAL_TEMPLATE_ID;
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  // Local UI disclosure only — not persisted.
  const [locksOpen, setLocksOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [optionsOpenIds, setOptionsOpenIds] = useState<Set<string>>(() => new Set());
  const [genSettingsOpenIds, setGenSettingsOpenIds] = useState<Set<string>>(() => new Set());

  const activeRecipe = editTarget === 'default'
    ? recipe
    : (archetypes.find((a) => a.id === editTarget)?.recipe || []);

  const setActiveRecipe = (updater: (prev: RecipeItem[]) => RecipeItem[]) => {
    if (editTarget === 'default') {
      setRecipe((prev) => updater(prev));
      return;
    }
    setArchetypes((prev) => prev.map((a) => (
      a.id === editTarget ? { ...a, recipe: updater(a.recipe || []) } : a
    )));
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleOptions = (id: string) => {
    setOptionsOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGenSettings = (id: string) => {
    setGenSettingsOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandNewItem = (id: string) => {
    setExpandedIds((prev) => new Set(prev).add(id));
  };

  const validationWarnings = useMemo(
    () => listTemplateValidationWarnings({ recipe, archetypes, assessmentPlacement }),
    [recipe, archetypes, assessmentPlacement],
  );

  useEffect(() => {
    setWarning(validationWarnings[0] || null);
  }, [validationWarnings]);

  const lockedCount = useMemo(
    () => (isFreeformBuiltin ? 0 : KNOB_LOCK_OPTIONS.filter((o) => !!knobLocks[o.key as LockKey]).length),
    [knobLocks, isFreeformBuiltin],
  );

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= activeRecipe.length) return;
    setActiveRecipe((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const removeAt = (i: number) => {
    const id = activeRecipe[i]?.id;
    setActiveRecipe((prev) => prev.filter((_, idx) => idx !== i));
    if (id) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setOptionsOpenIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setGenSettingsOpenIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const addAtomic = (type: AtomicBlockType) => {
    const item = makeAtomicItem(type);
    setActiveRecipe((prev) => [...prev, item]);
    expandNewItem(item.id);
  };

  const addEmbedded = (type: EmbeddableObjectType) => {
    const item = makeEmbeddedItem(type);
    setActiveRecipe((prev) => [...prev, item]);
    expandNewItem(item.id);
  };

  const patchAtomic = (id: string, patch: Partial<AtomicBlockItem>) => {
    setActiveRecipe((prev) => prev.map((item) => (
      item.kind === 'atomic' && item.id === id ? { ...item, ...patch } : item
    )));
  };

  const patchEmbedded = (id: string, patch: Partial<EmbeddedObjectItem>) => {
    setActiveRecipe((prev) => prev.map((item) => {
      if (item.kind !== 'embedded' || item.id !== id) return item;
      const next: EmbeddedObjectItem = { ...item, ...patch };
      if (patch.objectType === 'reused-from-library' && !patch.sourceMode) {
        next.sourceMode = 'pick_from_library';
      }
      // Template library slots never pin a concrete object — course developer chooses later.
      if (patch.sourceMode === 'pick_from_library'
        || patch.sourceMode === 'generate'
        || patch.sourceMode === 'prompt_on_author'
        || patch.objectType === 'reused-from-library') {
        next.versionPin = undefined;
      }
      return next;
    }));
  };

  const patchGenerateMeta = (id: string, patch: Partial<EmbeddedGenerateMeta>) => {
    setActiveRecipe((prev) => prev.map((item) => {
      if (item.kind !== 'embedded' || item.id !== id) return item;
      return { ...item, generateMeta: { ...(item.generateMeta || {}), ...patch } };
    }));
  };

  const setSourceMode = (itemId: string, mode: EmbeddedObjectItem['sourceMode']) => {
    patchEmbedded(itemId, { sourceMode: mode });
  };

  const toggleLock = (key: LockKey) => {
    if (isFreeformBuiltin) return;
    setKnobLocks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const addArchetype = () => {
    const id = `arch-${newRecipeItemId('t')}`;
    const arch: SectionArchetype = {
      id,
      name: `Section type ${archetypes.length + 1}`,
      description: '',
      recipe: cloneRecipeItems(recipe, true),
    };
    setArchetypes((prev) => [...prev, arch]);
    setEditTarget(id);
  };

  const removeArchetype = (id: string) => {
    setArchetypes((prev) => prev.filter((a) => a.id !== id));
    if (editTarget === id) setEditTarget('default');
  };

  const patchArchetypeMeta = (id: string, patch: Partial<Pick<SectionArchetype, 'name' | 'description'>>) => {
    setArchetypes((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const validate = (): { ok: boolean; error: string | null; warning: string | null; rows: Record<string, string> } => {
    const rows: Record<string, string> = {};
    if (!name.trim()) {
      return { ok: false, error: 'Give the template a name.', warning: null, rows };
    }
    if (!recipe.length) {
      return { ok: false, error: 'Add at least one item to the default section recipe.', warning: null, rows };
    }
    if (!recipe.some(isContentBearing)) {
      return {
        ok: false,
        error: 'Include at least one content-bearing item (not only a section heading).',
        warning: null,
        rows,
      };
    }

    const allRecipes: { label: string; items: RecipeItem[] }[] = [
      { label: 'default', items: recipe },
      ...archetypes.map((a) => ({ label: a.name, items: a.recipe || [] })),
    ];
    for (const { items } of allRecipes) {
      for (const item of items) {
        if (item.kind !== 'embedded') continue;
        if (!item.required) continue;
        if (!item.sourceMode) {
          rows[item.id] = 'Required embedded slots need a source mode.';
        }
        // Library slots are metadata-only in templates — course developer pins later.
      }
    }

    if (Object.keys(rows).length) {
      return {
        ok: false,
        error: 'Fix required embedded-content settings before saving.',
        warning: null,
        rows,
      };
    }

    const warns = listTemplateValidationWarnings({ recipe, archetypes, assessmentPlacement });
    return { ok: true, error: null, warning: warns[0] || null, rows };
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

    const stripPins = (items: RecipeItem[]): RecipeItem[] => items.map((item) => {
      if (item.kind !== 'embedded') return item;
      if (item.sourceMode === 'pick_from_library' || item.objectType === 'reused-from-library') {
        return { ...item, versionPin: undefined };
      }
      return item;
    });

    const cleanedRecipe = stripPins(recipe);
    const cleanedArchetypes = stripSeededSectionArchetypes(archetypes).map((a) => ({
      ...a,
      recipe: stripPins(a.recipe || []),
    }));
    const sectionBlockRecipe = toFlatSectionBlockRecipe(cleanedRecipe);
    const locks = isFreeformBuiltin ? emptyLocks() : knobLocks;
    const sectioned = recipeHasSectionBlock(cleanedRecipe);

    const saved = saveCustomTutorialTemplate({
      id: initial?.id,
      name: name.trim(),
      description: description.trim(),
      structureLocked: Object.values(locks).some(Boolean),
      knobLocks: locks,
      archetypes: cleanedArchetypes,
      sectionConnection,
      assessmentPlacement,
      recipe: cleanedRecipe,
      sectionBlockRecipe,
      mediaSlots: [],
      knobDefaults: {
        ...seed.knobDefaults,
        // Embed-only templates must not seed N Plan sections from a secs knob.
        secs: sectioned ? secs : 1,
        prog: sectionConnection === 'prerequisite_chain' ? 'Prerequisite chain'
          : sectionConnection === 'standalone' ? 'Themed clusters' : 'Linear build-up',
        dpth,
        end,
        chks,
        excpts: typeof seed.knobDefaults.excpts === 'number' ? seed.knobDefaults.excpts : 0,
        wex: cleanedRecipe.some((r) => r.kind === 'atomic' && r.blockType === 'worked-example'),
      },
    });
    onSave(saved);
  };

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

  const editingArch = editTarget !== 'default'
    ? archetypes.find((a) => a.id === editTarget)
    : null;

  const renderConditionControls = (
    itemId: string,
    condition: BlockCondition | undefined,
    onPatch: (c: BlockCondition | undefined) => void,
  ) => {
    const kind = condition?.kind || 'always';
    return (
      <div>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', marginBottom: 4 }}>When to include</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {([
            { id: 'always', label: 'Always' },
            { id: 'if_source_kinds', label: 'If source has kinds…' },
            { id: 'if_source_hint', label: 'If source mentions…' },
          ] as const).map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                if (o.id === 'always') onPatch({ kind: 'always' });
                else if (o.id === 'if_source_kinds') {
                  onPatch({ kind: 'if_source_kinds', kinds: condition?.kind === 'if_source_kinds' ? condition.kinds : ['Key point'] });
                } else {
                  onPatch({
                    kind: 'if_source_hint',
                    hint: condition?.kind === 'if_source_hint' ? condition.hint : 'misconception',
                  });
                }
              }}
              className="px-2.5 py-1 rounded-full border"
              style={pill(kind === o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
        {kind === 'if_source_kinds' && (
          <div className="flex flex-wrap gap-1">
            {CONTENT_KINDS.map((k) => {
              const selected = condition?.kind === 'if_source_kinds' && condition.kinds.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    const cur = condition?.kind === 'if_source_kinds' ? [...condition.kinds] : [];
                    const next = selected ? cur.filter((x) => x !== k) : [...cur, k];
                    onPatch({ kind: 'if_source_kinds', kinds: next.length ? next : ['Key point'] });
                  }}
                  className="px-2 py-0.5 rounded-full border"
                  style={{ ...chipStyle, ...(selected ? { background: '#0B0F1A', color: '#fff', borderColor: '#0B0F1A' } : {}) }}
                >
                  {k}
                </button>
              );
            })}
          </div>
        )}
        {kind === 'if_source_hint' && (
          <input
            value={condition?.kind === 'if_source_hint' ? condition.hint : ''}
            onChange={(e) => onPatch({ kind: 'if_source_hint', hint: e.target.value })}
            placeholder="e.g. misconception"
            className="w-full rounded-xl px-3 py-2"
            style={field}
          />
        )}
      </div>
    );
  };

  const renderMultiToggle = (
    options: string[],
    selected: string[] | undefined,
    onChange: (next: string[]) => void,
  ) => (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = (selected || []).includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => {
              const cur = selected || [];
              onChange(on ? cur.filter((x) => x !== o) : [...cur, o]);
            }}
            className="px-2 py-0.5 rounded-full border"
            style={{ ...chipStyle, ...(on ? { background: '#0B0F1A', color: '#fff', borderColor: '#0B0F1A' } : {}) }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );

  /** Type-specific generate knobs + extra instructions (title/objective shown as essentials above). */
  const renderGenerateControls = (item: EmbeddedObjectItem) => {
    const gm = item.generateMeta || {};
    return (
      <div
        className="rounded-xl px-3 py-2.5 space-y-2"
        style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(0,0,0,0.08)' }}
      >
        <p style={{ fontSize: 11, fontWeight: 700, color: '#047857', letterSpacing: '0.04em' }}>
          GENERATE NEW — FULL DEFINE CONTROLS
        </p>

        {item.objectType === 'quiz' && (
          <>
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', marginBottom: 4 }}>Pass mark on MCQs</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {([true, false] as const).map((on) => (
                  <button
                    key={String(on)}
                    type="button"
                    onClick={() => patchGenerateMeta(item.id, { passOn: on })}
                    className="px-2.5 py-1 rounded-full border"
                    style={pill((gm.passOn !== false) === on)}
                  >
                    {on ? 'Require pass mark' : 'No pass mark'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Questions</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={gm.questionCount ?? chks ?? 2}
                  onChange={(e) => patchGenerateMeta(item.id, {
                    questionCount: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                  })}
                  className="w-20 rounded-xl px-3 py-2"
                  style={field}
                />
              </div>
              {gm.passOn !== false && (
                <div className="flex-1 min-w-[100px]">
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Pass mark</label>
                  <select
                    value={gm.passMark || '70%'}
                    onChange={(e) => patchGenerateMeta(item.id, { passMark: e.target.value })}
                    className="w-full rounded-xl px-3 py-2"
                    style={field}
                  >
                    {['50%', '60%', '70%', '80%', '90%'].map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex-1 min-w-[120px]">
                <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Difficulty</label>
                <select
                  value={gm.diff || 'Balanced'}
                  onChange={(e) => patchGenerateMeta(item.id, { diff: e.target.value })}
                  className="w-full rounded-xl px-3 py-2"
                  style={field}
                >
                  {['Mostly easy', 'Balanced', 'Mostly hard', 'Ramped easy→hard'].map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Question types</label>
              {renderMultiToggle(QUIZ_QTYPES, gm.qtypes, (qtypes) => patchGenerateMeta(item.id, { qtypes }))}
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Cognitive levels</label>
              {renderMultiToggle(QUIZ_COG, gm.cog, (cog) => patchGenerateMeta(item.id, { cog }))}
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex-1 min-w-[140px]">
                <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Wrong answers</label>
                <select
                  value={gm.wrong || 'Plausible common errors'}
                  onChange={(e) => patchGenerateMeta(item.id, { wrong: e.target.value })}
                  className="w-full rounded-xl px-3 py-2"
                  style={field}
                >
                  {['Plausible common errors', 'Straightforward'].map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-[100px]">
                <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Adaptive</label>
                <select
                  value={gm.adaptive || 'No'}
                  onChange={(e) => patchGenerateMeta(item.id, { adaptive: e.target.value })}
                  className="w-full rounded-xl px-3 py-2"
                  style={field}
                >
                  {['Yes', 'No'].map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[120px]">
                <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Show explanations</label>
                <select
                  value={gm.show || 'After attempt'}
                  onChange={(e) => patchGenerateMeta(item.id, { show: e.target.value })}
                  className="w-full rounded-xl px-3 py-2"
                  style={field}
                >
                  {['Immediately', 'After attempt', 'After completion', 'Never'].map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2" style={{ fontSize: 12.5, color: '#374151' }}>
              <input
                type="checkbox"
                checked={gm.perq !== false}
                onChange={(e) => patchGenerateMeta(item.id, { perq: e.target.checked })}
              />
              Write per-question explanations
            </label>
          </>
        )}

        {item.objectType === 'flashcard-set' && (
          <>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Cards</label>
              <input
                type="number"
                min={3}
                max={40}
                value={Number(gm.cardCount) || 8}
                onChange={(e) => patchGenerateMeta(item.id, {
                  cardCount: Math.max(3, Math.min(40, Number(e.target.value) || 8)),
                })}
                className="w-24 rounded-xl px-3 py-2"
                style={field}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Card content</label>
              {renderMultiToggle(FLASH_CC, gm.cc, (cc) => patchGenerateMeta(item.id, { cc }))}
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Pull from</label>
              {renderMultiToggle(FLASH_PULL, gm.pull, (pull) => patchGenerateMeta(item.id, { pull }))}
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex-1 min-w-[120px]">
                <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Direction</label>
                <select
                  value={gm.dir || 'Front→back'}
                  onChange={(e) => patchGenerateMeta(item.id, { dir: e.target.value })}
                  className="w-full rounded-xl px-3 py-2"
                  style={field}
                >
                  {['Front→back', 'Back→front', 'Both'].map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 mt-5" style={{ fontSize: 12.5, color: '#374151' }}>
                <input
                  type="checkbox"
                  checked={!!gm.hooks}
                  onChange={(e) => patchGenerateMeta(item.id, { hooks: e.target.checked })}
                />
                Memory hooks
              </label>
            </div>
          </>
        )}

        {item.objectType === 'concept-card' && (
          <>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Concept focus</label>
              <input
                value={gm.conceptFocus || ''}
                onChange={(e) => patchGenerateMeta(item.id, { conceptFocus: e.target.value })}
                className="w-full rounded-xl px-3 py-2"
                style={field}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex-1 min-w-[120px]">
                <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Voice</label>
                <select
                  value={gm.voi || 'Plain & friendly'}
                  onChange={(e) => patchGenerateMeta(item.id, { voi: e.target.value })}
                  className="w-full rounded-xl px-3 py-2"
                  style={field}
                >
                  {['Plain & friendly', 'Neutral / academic', 'Encouraging', 'Socratic'].map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[100px]">
                <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Length</label>
                <select
                  value={gm.len || 'Standard'}
                  onChange={(e) => patchGenerateMeta(item.id, { len: e.target.value })}
                  className="w-full rounded-xl px-3 py-2"
                  style={field}
                >
                  {['Tight', 'Standard', 'Expanded'].map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}

        {item.objectType === 'assignment' && (
          <div className="flex flex-wrap gap-2">
            <div className="flex-1 min-w-[120px]">
              <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Task type</label>
              <select
                value={gm.tt || 'Short essay'}
                onChange={(e) => patchGenerateMeta(item.id, { tt: e.target.value })}
                className="w-full rounded-xl px-3 py-2"
                style={field}
              >
                {['Short essay', 'Analysis', 'Problem set', 'Project', 'Critique'].map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[120px]">
              <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Deliverable</label>
              <select
                value={gm.del || 'Written text'}
                onChange={(e) => patchGenerateMeta(item.id, { del: e.target.value })}
                className="w-full rounded-xl px-3 py-2"
                style={field}
              >
                {['Written text', 'File upload', 'Structured form'].map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[110px]">
              <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Length</label>
              <select
                value={gm.el || '~300 words'}
                onChange={(e) => patchGenerateMeta(item.id, { el: e.target.value })}
                className="w-full rounded-xl px-3 py-2"
                style={field}
              >
                {['~150 words', '~300 words', '~500 words', '~800 words'].map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 mt-5" style={{ fontSize: 12.5, color: '#374151' }}>
              <input
                type="checkbox"
                checked={gm.cite !== false}
                onChange={(e) => patchGenerateMeta(item.id, { cite: e.target.checked })}
              />
              Require citations
            </label>
          </div>
        )}

        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Extra instructions</label>
          <textarea
            value={gm.instructions || ''}
            onChange={(e) => patchGenerateMeta(item.id, { instructions: e.target.value })}
            rows={2}
            placeholder="Constraints, tone, what to include or avoid"
            className="w-full rounded-xl px-3 py-2"
            style={field}
          />
        </div>
      </div>
    );
  };

  const groupDivider = (
    <div className="my-4" style={{ height: 1, background: 'rgba(0,0,0,0.06)' }} />
  );

  return (
    <div
      className="rounded-2xl border mb-3 flex flex-col"
      style={{
        background: 'rgba(255,255,255,0.95)',
        borderColor: 'rgba(0,0,0,0.1)',
        maxHeight: 'min(92vh, 920px)',
      }}
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0B1220' }}>
          {initial ? 'Edit template' : 'Create template'}
        </p>
        <button type="button" onClick={onCancel} className="p-1 rounded-lg" aria-label="Close">
          <X size={15} style={{ color: '#6B7280' }} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-3">
        {/* ── Identity ─────────────────────────────────────────── */}
        <div className="mb-1">
          <EditorGroupHeader
            icon={<FileText size={14} />}
            title="Identity"
            subtitle="Name and short description"
          />
          <div className="mt-3 space-y-3">
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Drill then explain"
                className="w-full rounded-xl px-3 py-2"
                style={field}
              />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="One line on how each section should teach"
                className="w-full rounded-xl px-3 py-2 resize-none"
                style={field}
              />
            </div>
          </div>
        </div>

        {groupDivider}

        {/* ── Locks (collapsed by default) ─────────────────────── */}
        <div
          className="rounded-xl border px-3 py-2.5"
          style={{ borderColor: 'rgba(0,0,0,0.08)', background: 'rgba(249,250,251,0.95)' }}
        >
          <EditorGroupHeader
            icon={lockedCount > 0 ? <Lock size={14} /> : <Unlock size={14} />}
            title={`Locks · ${lockedCount} locked`}
            subtitle={isFreeformBuiltin
              ? 'Freeform stays fully unlocked — authors always choose structure.'
              : 'Opt-in. Locked knobs use this template’s defaults; unlocked knobs stay editable in Define.'}
            onClick={() => setLocksOpen((v) => !v)}
            expanded={locksOpen}
          />
          {locksOpen && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {KNOB_LOCK_OPTIONS.map((o) => {
                const locked = isFreeformBuiltin ? false : !!knobLocks[o.key];
                return (
                  <button
                    key={o.key}
                    type="button"
                    disabled={isFreeformBuiltin}
                    title={o.hint}
                    onClick={() => toggleLock(o.key as LockKey)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full border disabled:opacity-50"
                    style={pill(locked)}
                  >
                    {locked ? <Lock size={11} /> : <Unlock size={11} />}
                    {o.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {groupDivider}

        {/* ── Recipe ───────────────────────────────────────────── */}
        <div className="mb-1">
          <EditorGroupHeader
            icon={<LayoutList size={14} />}
            title="Recipe"
            subtitle="Default recipe + optional section types"
          />

          <div className="mt-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF' }}>
                Recipe to edit
              </p>
              <button
                type="button"
                onClick={addArchetype}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full border"
                style={chipStyle}
              >
                <Plus size={11} /> Add section type
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              <button
                type="button"
                onClick={() => setEditTarget('default')}
                className="px-3 py-1.5 rounded-full border"
                style={pill(editTarget === 'default')}
              >
                Default recipe
              </button>
              {archetypes.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setEditTarget(a.id)}
                  className="px-3 py-1.5 rounded-full border"
                  style={pill(editTarget === a.id)}
                >
                  {a.name || a.id}
                </button>
              ))}
            </div>
            {editingArch && (
              <div className="mb-2 p-2.5 rounded-xl border space-y-2" style={{ borderColor: 'rgba(0,0,0,0.08)', background: '#fff' }}>
                <div className="flex gap-2">
                  <input
                    value={editingArch.name}
                    onChange={(e) => patchArchetypeMeta(editingArch.id, { name: e.target.value })}
                    placeholder="Section type name"
                    className="flex-1 rounded-lg px-2.5 py-1.5"
                    style={field}
                  />
                  <button
                    type="button"
                    onClick={() => removeArchetype(editingArch.id)}
                    className="p-1.5 rounded-lg"
                    title="Remove section type"
                  >
                    <Trash2 size={13} style={{ color: '#EF4444' }} />
                  </button>
                </div>
                <input
                  value={editingArch.description || ''}
                  onChange={(e) => patchArchetypeMeta(editingArch.id, { description: e.target.value })}
                  placeholder="When to use this type (shown in Plan)"
                  className="w-full rounded-lg px-2.5 py-1.5"
                  style={field}
                />
              </div>
            )}
            <p style={{ fontSize: 12.5, color: '#9AA3AF' }}>
              {editTarget === 'default'
                ? 'Default applies to every Plan section that leaves “Section type” blank.'
                : 'Assigned per section in the Plan step. Leaves simple tutorials on the default recipe.'}
            </p>
          </div>

          <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 4 }}>
            Per-section recipe (order = teaching order)
          </p>
          <p style={{ fontSize: 12.5, color: '#9AA3AF', marginBottom: 8 }}>
            Atomic blocks are written inline; embedded content nests whole content items in the section.
          </p>

          {validationWarnings.map((w) => (
            <p
              key={w}
              className="mb-2 px-3 py-2 rounded-xl"
              style={{ fontSize: 12.5, color: '#92400E', background: '#FFFBEB', border: '1px solid rgba(217,119,6,0.25)' }}
            >
              {w}
            </p>
          ))}

          <div className="space-y-1.5 mb-3">
            {activeRecipe.map((item, i) => {
              const isOpen = expandedIds.has(item.id);
              const optionsOpen = optionsOpenIds.has(item.id);

              if (item.kind === 'atomic') {
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border overflow-hidden transition-colors"
                    style={{
                      background: 'rgba(249,250,251,0.95)',
                      borderColor: isOpen ? 'rgba(0,0,0,0.14)' : 'rgba(0,0,0,0.08)',
                    }}
                  >
                    <div
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                      style={{ borderLeft: '3px solid #94A3B8' }}
                      onClick={() => toggleExpanded(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleExpanded(item.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isOpen}
                    >
                      <span style={{ fontSize: 11, color: '#9AA3AF', fontFamily: 'monospace', width: 18 }}>{i + 1}</span>
                      <BookOpen size={13} style={{ color: '#94A3B8', flexShrink: 0 }} />
                      <span
                        className="px-1.5 py-0.5 rounded"
                        style={{ fontSize: 10, fontWeight: 650, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#6B7280', background: 'rgba(0,0,0,0.04)' }}
                      >
                        Block
                      </span>
                      <div className="flex-1 min-w-0">
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0B1220' }}>
                          {atomicLabel(item.blockType)}
                        </span>
                        <span style={{ fontSize: 11.5, color: '#9AA3AF', marginLeft: 8 }}>
                          {atomicRowSummary(item)}
                        </span>
                      </div>
                      <ChevronRight
                        size={14}
                        style={{
                          color: '#9AA3AF',
                          transform: isOpen ? 'rotate(90deg)' : 'none',
                          transition: 'transform 0.15s ease',
                          flexShrink: 0,
                        }}
                      />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); move(i, -1); }}
                        disabled={i === 0}
                        className="p-1 disabled:opacity-30"
                        aria-label="Move up"
                      >
                        <ChevronUp size={14} style={{ color: '#6B7280' }} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); move(i, 1); }}
                        disabled={i === activeRecipe.length - 1}
                        className="p-1 disabled:opacity-30"
                        aria-label="Move down"
                      >
                        <ChevronDown size={14} style={{ color: '#6B7280' }} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeAt(i); }}
                        className="p-1"
                        aria-label="Delete"
                      >
                        <Trash2 size={13} style={{ color: '#EF4444' }} />
                      </button>
                    </div>

                    {isOpen && (
                      <div className="px-3 pb-3 space-y-2.5" style={{ paddingLeft: 14, borderLeft: '3px solid #94A3B8' }}>
                        {item.blockType === 'section-heading' && (
                          <div className="space-y-3">
                            <p style={{ fontSize: 12, color: '#6B7280' }}>
                              How sections connect, assess, and size for this template.
                            </p>
                            <div>
                              <p style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', marginBottom: 4 }}>Section connection</p>
                              <div className="flex flex-wrap gap-1.5">
                                {CONNECTION_OPTIONS.map((o) => (
                                  <button
                                    key={o.id}
                                    type="button"
                                    onClick={() => setSectionConnection(o.id)}
                                    className="px-2.5 py-1 rounded-full border"
                                    style={pill(sectionConnection === o.id)}
                                  >
                                    {o.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', marginBottom: 4 }}>Assessment</p>
                              <div className="flex flex-wrap gap-1.5">
                                {ASSESSMENT_OPTIONS.map((o) => (
                                  <button
                                    key={o.id}
                                    type="button"
                                    onClick={() => setAssessmentPlacement(o.id)}
                                    className="px-2.5 py-1 rounded-full border"
                                    style={pill(assessmentPlacement === o.id)}
                                  >
                                    {o.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-3">
                              <div>
                                <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>
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
                                <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>
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
                                <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>
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
                                <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>
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
                          </div>
                        )}

                        {item.blockType !== 'section-heading' && (
                          <div>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', marginBottom: 4 }}>Slot</p>
                            <div className="flex flex-wrap gap-1.5">
                              {([true, false] as const).map((req) => (
                                <button
                                  key={String(req)}
                                  type="button"
                                  onClick={() => patchAtomic(item.id, { required: req })}
                                  className="px-2.5 py-1 rounded-full border"
                                  style={pill((item.required !== false) === req)}
                                >
                                  {req ? 'Required' : 'Optional'}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => toggleOptions(item.id)}
                          className="flex items-center gap-1 px-0 py-0.5"
                          style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', background: 'transparent', border: 'none' }}
                        >
                          <ChevronRight
                            size={13}
                            style={{
                              transform: optionsOpen ? 'rotate(90deg)' : 'none',
                              transition: 'transform 0.15s ease',
                            }}
                          />
                          Options
                        </button>
                        {optionsOpen && (
                          <div className="space-y-2.5 pl-1">
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>
                                Authoring note
                              </label>
                              <input
                                value={item.authoringNote || ''}
                                onChange={(e) => patchAtomic(item.id, { authoringNote: e.target.value })}
                                placeholder={`e.g. emphasize ${atomicLabel(item.blockType).toLowerCase()} for this section`}
                                className="w-full rounded-xl px-3 py-2"
                                style={field}
                              />
                            </div>
                            {renderConditionControls(item.id, item.condition, (c) => patchAtomic(item.id, { condition: c }))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              }

              const showLibrarySlot = needsLibraryPin(item);
              const rowErr = rowErrors[item.id];
              const gm = item.generateMeta || {};
              const genOpen = genSettingsOpenIds.has(item.id);

              return (
                <div
                  key={item.id}
                  className="rounded-xl border overflow-hidden transition-colors"
                  style={{
                    background: 'rgba(249,250,251,0.95)',
                    borderColor: isOpen ? 'rgba(5,150,105,0.28)' : 'rgba(0,0,0,0.08)',
                  }}
                >
                  <div
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                    style={{ borderLeft: '3px solid #059669' }}
                    onClick={() => toggleExpanded(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleExpanded(item.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                  >
                    <span style={{ fontSize: 11, color: '#9AA3AF', fontFamily: 'monospace', width: 18 }}>{i + 1}</span>
                    <Puzzle size={13} style={{ color: '#059669', flexShrink: 0 }} />
                    <span
                      className="px-1.5 py-0.5 rounded"
                      style={{ fontSize: 10, fontWeight: 650, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#047857', background: 'rgba(5,150,105,0.08)' }}
                    >
                      Embedded content
                    </span>
                    <div className="flex-1 min-w-0">
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0B1220' }}>
                        {embeddedLabel(item.objectType)}
                      </span>
                      <span
                        className="block truncate"
                        style={{ fontSize: 11.5, color: '#9AA3AF', marginTop: 1 }}
                      >
                        {embeddedRowSummary(item, chks)}
                      </span>
                    </div>
                    <ChevronRight
                      size={14}
                      style={{
                        color: '#9AA3AF',
                        transform: isOpen ? 'rotate(90deg)' : 'none',
                        transition: 'transform 0.15s ease',
                        flexShrink: 0,
                      }}
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); move(i, -1); }}
                      disabled={i === 0}
                      className="p-1 disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ChevronUp size={14} style={{ color: '#6B7280' }} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); move(i, 1); }}
                      disabled={i === activeRecipe.length - 1}
                      className="p-1 disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ChevronDown size={14} style={{ color: '#6B7280' }} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeAt(i); }}
                      className="p-1"
                      aria-label="Delete"
                    >
                      <Trash2 size={13} style={{ color: '#EF4444' }} />
                    </button>
                  </div>

                  {isOpen && (
                    <div className="px-3 pb-3 space-y-2.5" style={{ paddingLeft: 14, borderLeft: '3px solid #059669' }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>
                          Content type
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

                      {showLibrarySlot && (
                        <div className="space-y-2">
                          <div
                            className="rounded-xl px-3 py-2"
                            style={{ background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.2)' }}
                          >
                            <p style={{ fontSize: 12, fontWeight: 600, color: '#047857' }}>
                              Library slot — course developer chooses the content when authoring
                            </p>
                            <p style={{ fontSize: 11.5, color: '#6B7280', marginTop: 2 }}>
                              Save type, required, and a display label here. No concrete content is pinned in the template.
                            </p>
                          </div>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>
                              Slot label (shown in Plan)
                            </label>
                            <input
                              value={item.libraryTitle || ''}
                              onChange={(e) => patchEmbedded(item.id, { libraryTitle: e.target.value })}
                              placeholder={`e.g. ${embeddedLabel(item.objectType)} for this section`}
                              className="w-full rounded-xl px-3 py-2"
                              style={field}
                            />
                          </div>
                        </div>
                      )}

                      {item.sourceMode === 'generate' && (
                        <div className="space-y-2">
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Title</label>
                            <input
                              value={gm.title || ''}
                              onChange={(e) => patchGenerateMeta(item.id, { title: e.target.value })}
                              className="w-full rounded-xl px-3 py-2"
                              style={field}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Objective / intent</label>
                            <textarea
                              value={gm.objective || ''}
                              onChange={(e) => patchGenerateMeta(item.id, { objective: e.target.value })}
                              rows={2}
                              className="w-full rounded-xl px-3 py-2"
                              style={field}
                            />
                          </div>
                          <p style={{ fontSize: 12, color: '#6B7280' }}>
                            Generation settings:{' '}
                            <span style={{ fontWeight: 600, color: '#374151' }}>
                              {generationSettingsSummary(item, chks)}
                            </span>
                          </p>
                          <button
                            type="button"
                            onClick={() => toggleGenSettings(item.id)}
                            className="flex items-center gap-1"
                            style={{ fontSize: 12, fontWeight: 600, color: '#047857', background: 'transparent', border: 'none', padding: 0 }}
                          >
                            <ChevronRight
                              size={13}
                              style={{
                                transform: genOpen ? 'rotate(90deg)' : 'none',
                                transition: 'transform 0.15s ease',
                              }}
                            />
                            Edit generation settings
                          </button>
                          {genOpen && renderGenerateControls(item)}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleOptions(item.id)}
                        className="flex items-center gap-1 px-0 py-0.5"
                        style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', background: 'transparent', border: 'none' }}
                      >
                        <ChevronRight
                          size={13}
                          style={{
                            transform: optionsOpen ? 'rotate(90deg)' : 'none',
                            transition: 'transform 0.15s ease',
                          }}
                        />
                        Options
                      </button>
                      {optionsOpen && (
                        <div className="space-y-2.5 pl-1">
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
                          {renderConditionControls(item.id, item.condition, (c) => patchEmbedded(item.id, { condition: c }))}
                        </div>
                      )}

                      {rowErr && (
                        <p style={{ fontSize: 12, color: '#B91C1C' }}>{rowErr}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {activeRecipe.length === 0 && (
              <div
                className="rounded-xl border border-dashed px-4 py-6 text-center"
                style={{ borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(249,250,251,0.6)' }}
              >
                <Sparkles size={18} style={{ color: '#9AA3AF', margin: '0 auto 8px' }} />
                <p style={{ fontSize: 13, fontWeight: 600, color: '#6B7280' }}>
                  No blocks yet — add one below
                </p>
                <p style={{ fontSize: 12, color: '#9AA3AF', marginTop: 4 }}>
                  Build the teaching order with atomic blocks and embedded content.
                </p>
              </div>
            )}
          </div>

          <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 6 }}>Add block</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {ATOMIC_BLOCK_OPTIONS.map((o) => (
              <button
                key={o.type}
                type="button"
                onClick={() => addAtomic(o.type)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full border hover:bg-white"
                style={chipStyle}
              >
                <Plus size={11} />{o.label}
              </button>
            ))}
          </div>

          <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 6 }}>Add embedded content</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {EMBEDDED_OBJECT_OPTIONS.map((o) => (
              <button
                key={o.type}
                type="button"
                onClick={() => addEmbedded(o.type)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full border hover:bg-white"
                style={chipStyle}
              >
                <Plus size={11} />{o.label}
              </button>
            ))}
          </div>
        </div>

        {groupDivider}

        {/* ── Preview (collapsed by default) ───────────────────── */}
        <div
          className="rounded-xl border px-3 py-2.5 mb-2"
          style={{ borderColor: 'rgba(0,0,0,0.08)', background: 'rgba(249,250,251,0.98)' }}
        >
          <EditorGroupHeader
            icon={<Eye size={14} />}
            title="Preview"
            subtitle={`Sample section · ${recipeSummary(activeRecipe).slice(0, 72)}${recipeSummary(activeRecipe).length > 72 ? '…' : ''}`}
            onClick={() => setPreviewOpen((v) => !v)}
            expanded={previewOpen}
          />
          {previewOpen && (
            <div className="mt-3">
              <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
                Shape of one section from the recipe you’re editing now ({dpth} depth default).
              </p>
              <ol className="space-y-1" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {activeRecipe.map((item, i) => {
                  const optional = item.kind === 'atomic'
                    ? item.required === false
                    : !item.required;
                  const cond = item.condition && item.condition.kind !== 'always'
                    ? item.condition.kind === 'if_source_kinds'
                      ? `if source has ${(item.condition.kinds || []).join('/')}`
                      : `if source mentions “${item.condition.kind === 'if_source_hint' ? item.condition.hint : ''}”`
                    : null;
                  const label = item.kind === 'atomic'
                    ? atomicLabel(item.blockType)
                    : `Embedded ${embeddedLabel(item.objectType)}`;
                  return (
                    <li
                      key={item.id}
                      className="flex items-start gap-2 rounded-lg px-2.5 py-1.5"
                      style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)' }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#9AA3AF', width: 18 }}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p style={{ fontSize: 12.5, fontWeight: 600, color: '#0B1220' }}>
                          {label}
                          {optional ? <span style={{ fontWeight: 500, color: '#9AA3AF' }}> · optional</span> : null}
                        </p>
                        {(item.authoringNote || cond) && (
                          <p style={{ fontSize: 11.5, color: '#6B7280', marginTop: 1 }}>
                            {[item.authoringNote, cond].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {archetypes.length > 0 && editTarget === 'default' && (
                <p style={{ fontSize: 11.5, color: '#9AA3AF', marginTop: 8 }}>
                  Other section types: {archetypes.map((a) => `${a.name} (${recipeSummary(a.recipe).slice(0, 40)}…)`).join(' · ')}
                </p>
              )}
            </div>
          )}
        </div>

        {error && (
          <p style={{ fontSize: 12.5, color: '#B91C1C', marginBottom: 10 }}>{error}</p>
        )}
        {warning && !validationWarnings.length && (
          <p style={{ fontSize: 12.5, color: '#92400E', marginBottom: 10 }}>{warning}</p>
        )}
      </div>

      {/* Sticky footer — always reachable */}
      <div
        className="shrink-0 flex items-center gap-2 px-4 py-3 border-t"
        style={{
          borderColor: 'rgba(0,0,0,0.08)',
          background: 'rgba(255,255,255,0.98)',
          position: 'sticky',
          bottom: 0,
        }}
      >
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
    </div>
  );
}