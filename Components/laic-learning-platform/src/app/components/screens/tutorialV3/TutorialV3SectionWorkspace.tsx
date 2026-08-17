/**
 * Per-section workspace: write+refine (8a) and section-scoped generate (8b).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BridgeEmbedBlock } from './BridgeEmbedBlock';
import {
  configToPartFields,
  isBridgeEmbedPart,
  readBridgeConfig,
} from '../../../../lib/tutorialV3/bridgeEmbed';
import {
  ArrowLeft, Check, Loader2, PenLine, Sparkles, AlertTriangle,
  Image as ImageIcon, Youtube, Upload, ExternalLink, Plus, Trash2, Type,
} from 'lucide-react';
import { MarkupWorkspace, type MarkupSource } from '../MarkupWorkspace';
import {
  editTutorialBlock,
  errorMessage,
  generateTutorial,
  suggestTutorialMarkupFlags,
  type GeneratedPart,
} from '../../../../lib/api';
import { getTutorialTemplate, templateUsesCompositeRecipe, toFlatSectionBlockRecipe } from '../../../../lib/tutorialV3/tutorialTemplates';
import {
  bumpAuthorMode,
  scaffoldPartsFromRecipe,
  sourcePoolToMarkupSources,
} from '../../../../lib/tutorialV3/draftModel';
import {
  isNestedEditablePart,
  isNestedPartEmpty,
  isV3BlockEmbedPart,
  nestedEditorKindForPart,
  v3BlockEmbedLabel,
} from '../../../../lib/tutorialV3/embedEditorBridge';
import type { TutorialV3Draft, TutorialV3Part, V3Section, V3TopLevelSlot } from '../../../../lib/tutorialV3/types';
import type { ContentUnit, TutorialSectionPlan, TutorialTemplate } from '../../../../lib/types';
import { parseYtId } from './TutorialV3SourcePanel';
import { TutorialV3NestedEditor } from './TutorialV3NestedEditor';
import { RichTextEditor } from '../../RichTextEditor';
import { TutorialV3ObjectGeneratePane } from './TutorialV3ObjectGeneratePane';
import { objectTypeNoun } from '../../../../lib/tutorialV3/objectPipelineDefaults';

type Tab = 'write' | 'generate';

export function TutorialV3SectionWorkspace({
  draft,
  section,
  onChangeSection,
  onBack,
  onMarkDone,
  workspaceKind = 'section',
  slot,
  onChangeSlot,
  allowAiGenerate = true,
}: {
  draft: TutorialV3Draft;
  section: V3Section;
  onChangeSection: (patch: Partial<V3Section>) => void;
  onBack: () => void;
  onMarkDone: (done: boolean) => void;
  /** Top-level recipe generate slot (no Section block in template). */
  workspaceKind?: 'section' | 'slot';
  /** When workspaceKind=slot — full per-type generate pipeline. */
  slot?: V3TopLevelSlot;
  onChangeSlot?: (patch: Partial<V3TopLevelSlot>) => void;
  /** False on write-yourself path — no AI generate tab. */
  allowAiGenerate?: boolean;
}) {
  const isSlot = workspaceKind === 'slot';
  const slotNoun = isSlot ? objectTypeNoun(String(slot?.objectType || section.title)) : '';
  // Manual-first: always open on Write. Generate is optional on the template path.
  const [tab, setTab] = useState<Tab>('write');
  const [genSubstep, setGenSubstep] = useState<'pick' | 'markup' | 'run'>('pick');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refineId, setRefineId] = useState<string | null>(null);
  const [refineInstr, setRefineInstr] = useState('Tighten and clarify');
  const [activeTag, setActiveTag] = useState('Use');
  const [aiSuggestions, setAiSuggestions] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [markupFlags, setMarkupFlags] = useState<any[]>(section.markupFlags || []);
  const [editingPartId, setEditingPartId] = useState<string | null>(null);
  /**
   * The per-type generate pipeline, opened against a part that lives inside a
   * section rather than in a top-level slot. `TutorialV3ObjectGeneratePane`
   * only knows how to drive a `V3TopLevelSlot`, so the part borrows one —
   * exactly what the Refine sidebar does on Review.
   */
  const [generatingPartId, setGeneratingPartId] = useState<string | null>(null);
  const [partGenSlot, setPartGenSlot] = useState<V3TopLevelSlot | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoOpenedRef = useRef(false);

  const template = getTutorialTemplate(draft.templateId);
  const pool = draft.sourcePool || [];

  useEffect(() => {
    if (!allowAiGenerate && tab === 'generate') setTab('write');
  }, [allowAiGenerate, tab]);

  /**
   * Re-opening a generated learning-object slot jumps straight into student
   * preview — but only when there is something generated to look at.
   *
   * A "generate after Sources" slot is created on Structure already holding a
   * scaffolded, empty part. That part is nested-editable, so it used to satisfy
   * this check and send the author into an empty editor, past the very tabs the
   * Structure card told them to use. An empty slot lands on Generate instead,
   * which is what "pick sources → mark up → generate" means.
   */
  useEffect(() => {
    if (!isSlot || autoOpenedRef.current || editingPartId) return;
    const existing = (section.parts || []).find((p) => isNestedEditablePart(p))
      || (slot?.part && isNestedEditablePart(slot.part) ? slot.part : null);

    // Nothing authored at all — the usual state of a slot straight off
    // Structure, whose own card says to pick sources and generate. Land there.
    if (!existing) {
      autoOpenedRef.current = true;
      if (allowAiGenerate) setTab('generate');
      return;
    }

    const kind = nestedEditorKindForPart(existing);
    if (kind && isNestedPartEmpty(existing, kind)) {
      autoOpenedRef.current = true;
      if (allowAiGenerate) setTab('generate');
      return;
    }
    autoOpenedRef.current = true;
    setEditingPartId(existing.id);
  }, [isSlot, section.parts, slot?.part, editingPartId, allowAiGenerate]);

  const ensureWriteParts = () => {
    if (section.parts.length) return;
    onChangeSection({
      parts: scaffoldPartsFromRecipe(section.recipe, section.title),
      authorMode: bumpAuthorMode(section.authorMode, 'written'),
    });
  };

  const picked = section.pickedSourceIds || [];
  const markupBundle = useMemo(
    () => sourcePoolToMarkupSources(pool, picked.length ? picked : undefined),
    [pool, picked],
  );

  const toggleSource = (id: string) => {
    const next = picked.includes(id)
      ? picked.filter((x) => x !== id)
      : [...picked, id];
    onChangeSection({ pickedSourceIds: next });
  };

  const updatePart = (id: string, patch: Partial<TutorialV3Part>) => {
    const parts = (section.parts || []).map((p) => (p.id === id ? { ...p, ...patch } : p));
    onChangeSection({
      parts,
      authorMode: bumpAuthorMode(section.authorMode === 'generated' ? 'generated' : section.authorMode, 'written'),
    });
  };

  const runRefine = async (part: TutorialV3Part) => {
    setError(null);
    setBusy(true);
    try {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const next = await editTutorialBlock(part as GeneratedPart, refineInstr, ctrl.signal);
      if (next) {
        updatePart(part.id, { ...next, id: part.id });
      }
      setRefineId(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const highlightsToUnits = (highlights: any[]): ContentUnit[] => {
    const paras = markupBundle.docParas;
    return (highlights || [])
      .filter((h) => h.tag === 'Use' || h.tag === 'Support' || !h.tag)
      .map((h, i) => {
        const idx = typeof h.idx === 'number' ? h.idx : (typeof h.startIdx === 'number' ? h.startIdx : i);
        const text = String(h.text || paras[idx] || '').trim();
        if (!text) return null;
        return {
          id: `u-${section.id}-${i}`,
          kind: 'Key point',
          text,
          from: h.sourceLabel || 'Source',
          authorNote: h.note || h.authorNote,
          sectionId: section.id,
        } as ContentUnit;
      })
      .filter(Boolean) as ContentUnit[];
  };

  const runGenerateSection = async () => {
    setError(null);
    if (!picked.length && pool.length) {
      setError('Pick at least one source for this section first.');
      setGenSubstep('pick');
      return;
    }
    if (!(section.highlights || []).length) {
      setError('Mark up sources for this section before generating.');
      setGenSubstep('markup');
      return;
    }
    setBusy(true);
    setGenSubstep('run');
    try {
      const units = highlightsToUnits(section.highlights);
      if (!units.length) {
        setError('No usable highlights — tag Use/Support passages first.');
        setBusy(false);
        return;
      }
      const kb = {
        units,
        clusters: [{
          id: section.id,
          name: section.title,
          unitIds: units.map((u) => u.id),
          sectionId: section.id,
        }],
      };
      const useComposite = templateUsesCompositeRecipe(template);
      const sectionPlans: TutorialSectionPlan[] = [{
        index: 0,
        title: section.title,
        intent: section.intent,
        clusterId: section.id,
        sectionRecipe: useComposite ? section.recipe : undefined,
        recipe: toFlatSectionBlockRecipe(section.recipe.length ? section.recipe : template.recipe),
        mediaPlacements: [],
      }];
      const knobs = template.knobDefaults || {};
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const collected: GeneratedPart[] = [];
      for await (const ev of generateTutorial({
        title: `${draft.title} — ${section.title}`,
        config: {
          secs: 1,
          prog: draft.structure.progression,
          dpth: draft.structure.depth,
          end: 'None',
          chks: draft.structure.checksPerSection,
          excpts: 1,
          wex: knobs.wex !== false,
          pass: draft.structure.pass || knobs.pass || '70%',
          hintsOn: draft.structure.hintsOn !== false,
          hintN: draft.structure.hintN ?? 4,
          aiExtra: false,
          obj: String(draft.metadata.objective || section.intent || section.title),
          topic: section.title,
        } as any,
        template,
        knowledgeBase: kb as any,
        sectionPlans,
        tutorialDefinition: {
          objective: String(draft.metadata.objective || ''),
          sections: [{ id: section.id, title: section.title, intent: section.intent }],
        },
        highlights: (section.highlights || []).map((h: any) => ({
          idx: h.idx,
          text: h.text,
          tag: h.tag,
          note: h.note,
          sourceLabel: h.sourceLabel,
        })),
      }, ctrl.signal)) {
        if (ev.type === 'part' && ev.part) collected.push(ev.part);
        if (ev.type === 'error') throw new Error(ev.message || 'Generation failed');
      }
      onChangeSection({
        parts: collected as TutorialV3Part[],
        units,
        authorMode: bumpAuthorMode(section.authorMode, 'generated'),
        markupFlags,
        done: collected.length > 0,
      });
      setTab('write');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const writeParts = section.parts.length ? section.parts : scaffoldPartsFromRecipe(section.recipe, section.title);
  const editingPart = editingPartId
    ? writeParts.find((p) => p.id === editingPartId) || null
    : null;

  const returnToEditingContent = () => {
    setEditingPartId(null);
    onBack();
  };

  /** Open sources → markup → generate for one part inside this section. */
  const startPartGenerate = (part: TutorialV3Part) => {
    const kind = nestedEditorKindForPart(part);
    if (!kind) return;
    setPartGenSlot({
      id: `gen-part-${part.id}`,
      kind: 'generate',
      objectType: kind,
      required: false,
      recipeIndex: -1,
      done: false,
      // The section's own picks are the sensible starting point; the pane still
      // lets the author change them before markup.
      pickedSourceIds: section.pickedSourceIds?.length
        ? section.pickedSourceIds
        : pool.map((s) => s.id),
      highlights: section.highlights || [],
    });
    setGeneratingPartId(part.id);
  };

  const cancelPartGenerate = () => {
    setGeneratingPartId(null);
    setPartGenSlot(null);
  };

  const generatingPart = generatingPartId
    ? writeParts.find((p) => p.id === generatingPartId) || null
    : null;

  if (generatingPart && partGenSlot) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-5">
        <button
          type="button"
          onClick={cancelPartGenerate}
          className="inline-flex items-center gap-1.5 mb-3"
          style={{ fontSize: 13, color: '#6B7280' }}
        >
          ‹ Back to editing content
        </button>
        <TutorialV3ObjectGeneratePane
          slot={partGenSlot}
          pool={pool}
          tutorialTitle={draft.title}
          tutorialObjective={String(draft.metadata.objective || '')}
          onChangeSlot={(patch) => setPartGenSlot((s) => (s ? { ...s, ...patch } : s))}
          onGenerated={(generated) => {
            // The generated object replaces the part's content, not the part:
            // its id is what the section's recipe and the page map refer to.
            const base = section.parts.length ? section.parts : writeParts;
            const nextParts = base.map((p) => (
              p.id === generatingPart.id ? { ...p, ...generated, id: p.id } : p
            ));
            onChangeSection({
              parts: nextParts,
              authorMode: bumpAuthorMode(section.authorMode, 'generated'),
              done: true,
            });
            if (isSlot && onChangeSlot) {
              onChangeSlot({ parts: nextParts, part: nextParts[0], done: true });
            }
            cancelPartGenerate();
            // Straight into the editor on what was just made.
            setEditingPartId(generatingPart.id);
          }}
        />
      </div>
    );
  }

  if (editingPart) {
    return (
      <TutorialV3NestedEditor
        /*
          Keyed on the part so moving between parts remounts the object editor.
          The per-type editors seed their Edit/Preview state with useState at
          mount, so a reused instance would carry the previous part's mode over
          — and open an empty object in a preview that shows nothing.
        */
        key={editingPart.id}
        part={editingPart}
        initialMode="preview"
        onBack={returnToEditingContent}
        onDone={returnToEditingContent}
        onApply={(patch) => {
          const base = section.parts.length ? section.parts : writeParts;
          const nextParts = base.map((p) => (p.id === editingPart.id ? { ...p, ...patch } : p));
          onChangeSection({
            parts: nextParts,
            authorMode: bumpAuthorMode(section.authorMode, 'written'),
          });
          if (isSlot && onChangeSlot) {
            /*
              Done means there is something in it, not that the editor was
              opened. `applyOnSaveDraft` fires this on the way out even when
              nothing was authored, which used to mark a slot Ready while it
              still held an empty scaffold — and Ready is what the outline, the
              re-open shortcut and "required remaining" all read.
            */
            const applied = nextParts.find((p) => p.id === editingPart.id) || nextParts[0];
            const appliedKind = applied ? nestedEditorKindForPart(applied) : null;
            const hasContent = !!applied
              && (!appliedKind || !isNestedPartEmpty(applied, appliedKind));
            onChangeSlot({
              parts: nextParts,
              part: nextParts[0],
              ...(hasContent ? { done: true } : {}),
              libraryTitle: nextParts[0]?.libraryTitle || nextParts[0]?.label,
            });
          }
        }}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 mb-4 px-3 py-1.5 rounded-full hover:bg-white/70"
        style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}
      >
        <ArrowLeft size={14} /> {isSlot ? 'All recipe content' : 'All sections'}
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 750, color: '#0B1220' }}>{section.title}</h2>
          {section.intent ? (
            <p style={{ fontSize: 13.5, color: '#6B7280', marginTop: 4 }}>{section.intent}</p>
          ) : isSlot ? (
            <p style={{ fontSize: 13.5, color: '#6B7280', marginTop: 4 }}>
              {allowAiGenerate
                ? `Write this ${slotNoun} yourself, or switch to Generate with AI if you prefer.`
                : `Write this ${slotNoun} yourself.`}
            </p>
          ) : (
            <p style={{ fontSize: 13.5, color: '#6B7280', marginTop: 4 }}>
              {allowAiGenerate
                ? 'Add text, images, and videos for this section. AI generate is optional.'
                : 'Add text, images, and videos for this section.'}
            </p>
          )}
        </div>
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-full border cursor-pointer" style={{ borderColor: 'rgba(0,0,0,0.1)', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={!!section.done}
            onChange={(e) => onMarkDone(e.target.checked)}
          />
          <Check size={14} /> {isSlot ? 'Mark content done' : 'Mark section done'}
        </label>
      </div>

      {allowAiGenerate ? (
        <div className="flex gap-2 mb-5">
          <TabBtn active={tab === 'write'} onClick={() => { ensureWriteParts(); setTab('write'); }} icon={<PenLine size={13} />} label="Write myself" />
          <TabBtn
            active={tab === 'generate'}
            onClick={() => setTab('generate')}
            icon={<Sparkles size={13} />}
            label="Generate with AI (optional)"
          />
        </div>
      ) : (
        <div className="mb-5" />
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background: '#FEF2F2', color: '#991B1B', fontSize: 13 }}>
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {tab === 'write' && (
        <WritePane
          parts={writeParts}
          onEnsure={ensureWriteParts}
          onChangePart={updatePart}
          onAddPart={(kind) => {
            const id = `p-manual-${Date.now().toString(36)}`;
            const part: TutorialV3Part = kind === 'text'
              ? { id, type: 'rich-text', label: 'Text', heading: '', body: '' }
              : kind === 'image'
                ? { id, type: 'image', label: 'Media · image', url: '', caption: '', mediaKind: 'image' }
                : { id, type: 'video', label: 'Media · YouTube', url: '', videoId: '', caption: '', mediaKind: 'video' };
            const base = section.parts.length ? section.parts : writeParts;
            onChangeSection({
              parts: [...base, part],
              authorMode: bumpAuthorMode(section.authorMode, 'written'),
            });
            if (isSlot && onChangeSlot) {
              const next = [...base, part];
              onChangeSlot({ parts: next, part: next[0], libraryTitle: next[0]?.libraryTitle || next[0]?.label });
            }
          }}
          onRemovePart={(id) => {
            const base = section.parts.length ? section.parts : writeParts;
            const next = base.filter((p) => p.id !== id);
            onChangeSection({
              parts: next,
              authorMode: bumpAuthorMode(section.authorMode, 'written'),
            });
            if (isSlot && onChangeSlot) {
              onChangeSlot({ parts: next, part: next[0] });
            }
          }}
          refineId={refineId}
          setRefineId={setRefineId}
          refineInstr={refineInstr}
          setRefineInstr={setRefineInstr}
          onRefine={runRefine}
          busy={busy}
          onOpenNestedEditor={(id) => setEditingPartId(id)}
          onGeneratePart={allowAiGenerate ? startPartGenerate : undefined}
        />
      )}

      {allowAiGenerate && tab === 'generate' && isSlot && slot && onChangeSlot ? (
        <TutorialV3ObjectGeneratePane
          slot={slot}
          pool={pool}
          tutorialTitle={draft.title}
          tutorialObjective={String(draft.metadata.objective || '')}
          onChangeSlot={onChangeSlot}
          onGenerated={(part) => {
            onChangeSlot({
              part,
              parts: [part],
              done: true,
              libraryTitle: part.libraryTitle || part.label,
            });
            setTab('write');
            autoOpenedRef.current = true;
            // Open student preview first; Done returns to the tutorial outline.
            queueMicrotask(() => setEditingPartId(part.id));
          }}
        />
      ) : null}

      {allowAiGenerate && tab === 'generate' && !isSlot && (
        <GeneratePane
          pool={pool}
          picked={picked}
          toggleSource={toggleSource}
          substep={genSubstep}
          setSubstep={setGenSubstep}
          markupBundle={markupBundle}
          highlights={section.highlights || []}
          setHighlights={(h) => onChangeSection({ highlights: typeof h === 'function' ? h(section.highlights || []) : h })}
          markupFlags={markupFlags}
          setMarkupFlags={(f) => {
            const next = typeof f === 'function' ? f(markupFlags) : f;
            setMarkupFlags(next);
            onChangeSection({ markupFlags: next });
          }}
          activeTag={activeTag}
          setActiveTag={setActiveTag}
          aiSuggestions={aiSuggestions}
          setAiSuggestions={setAiSuggestions}
          query={query}
          setQuery={setQuery}
          definedSections={[{ id: section.id, title: section.title, intent: section.intent || '' }]}
          onGenerate={runGenerateSection}
          busy={busy}
          template={template}
          tutorialTitle={draft.title}
          tutorialObjective={String(draft.metadata.objective || '')}
        />
      )}
    </div>
  );
}

function TabBtn({
  active, onClick, icon, label,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border"
      style={{
        fontSize: 13,
        fontWeight: 600,
        background: active ? '#0B0F1A' : 'white',
        color: active ? 'white' : '#374151',
        borderColor: active ? '#0B0F1A' : 'rgba(0,0,0,0.1)',
      }}
    >
      {icon}{label}
    </button>
  );
}

function WritePane({
  parts, onEnsure, onChangePart, onAddPart, onRemovePart,
  refineId, setRefineId, refineInstr, setRefineInstr, onRefine, busy,
  onOpenNestedEditor,
  onGeneratePart,
}: {
  parts: TutorialV3Part[];
  onEnsure: () => void;
  onChangePart: (id: string, patch: Partial<TutorialV3Part>) => void;
  onAddPart: (kind: 'text' | 'image' | 'video') => void;
  onRemovePart: (id: string) => void;
  refineId: string | null;
  setRefineId: (id: string | null) => void;
  refineInstr: string;
  setRefineInstr: (s: string) => void;
  onRefine: (p: TutorialV3Part) => void;
  busy: boolean;
  onOpenNestedEditor: (partId: string) => void;
  /** Absent on the write-yourself path, where there is no AI generate step. */
  onGeneratePart?: (part: TutorialV3Part) => void;
}) {
  React.useEffect(() => { onEnsure(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p style={{ fontSize: 13, color: '#6B7280' }}>
          Write each block by hand. Add text, images, or YouTube videos anytime.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onAddPart('text')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border"
            style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
          >
            <Type size={12} /> Text
          </button>
          <button
            type="button"
            onClick={() => onAddPart('image')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border"
            style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
          >
            <ImageIcon size={12} /> Image
          </button>
          <button
            type="button"
            onClick={() => onAddPart('video')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border"
            style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
          >
            <Youtube size={12} /> Video
          </button>
        </div>
      </div>
      {parts.map((p) => (
        <div
          key={p.id}
          className="rounded-2xl p-4"
          style={{ background: 'white', border: '1px solid rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span style={{ fontSize: 12, fontWeight: 650, color: '#6B7280', textTransform: 'capitalize' }}>
              {p.label || p.type}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onRemovePart(p.id)}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50"
                title="Remove block"
              >
                <Trash2 size={13} style={{ color: '#EF4444' }} />
              </button>
            </div>
          </div>
          {isBridgeEmbedPart(p) ? (
            <BridgeEmbedBlock
              config={readBridgeConfig(p)}
              caption={p.caption}
              onChangeCaption={(caption) => onChangePart(p.id, { caption })}
              onChangeConfig={(next) => onChangePart(p.id, configToPartFields(next))}
            />
          ) : isNestedEditablePart(p) ? (
            <div>
              <p style={{ fontSize: 13.5, color: '#374151', marginBottom: 8 }}>
                {p.libraryTitle || p.label || nestedEditorKindForPart(p) || p.type}
                {p.objectType ? <span style={{ color: '#9AA3AF' }}> · {p.objectType}</span> : null}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenNestedEditor(p.id)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-white"
                  style={{ fontSize: 12.5, fontWeight: 650, background: '#0B0F1A' }}
                >
                  <ExternalLink size={13} />
                  Open {nestedEditorKindForPart(p)?.replace(/-/g, ' ') || 'content'} editor
                </button>
                {onGeneratePart && (
                  <button
                    type="button"
                    onClick={() => onGeneratePart(p)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border"
                    style={{ fontSize: 12.5, fontWeight: 650, color: '#4C1D95', borderColor: 'rgba(109,40,217,0.35)', background: 'rgba(109,40,217,0.06)' }}
                  >
                    <Sparkles size={13} />
                    Generate with AI
                  </button>
                )}
              </div>
            </div>
          ) : isV3BlockEmbedPart(p) ? (
            <div>
              <p style={{ fontSize: 13.5, color: '#374151', marginBottom: 8 }}>
                {p.libraryTitle || p.label || v3BlockEmbedLabel(p)}
                <span style={{ color: '#9AA3AF' }}> · {v3BlockEmbedLabel(p)}</span>
              </p>
              <p style={{ fontSize: 12.5, color: '#9AA3AF', marginBottom: 10, lineHeight: 1.5 }}>
                Authored by generating it from your sources. There is no separate editor for this
                block — regenerate to change it.
              </p>
              {onGeneratePart && (
                <button
                  type="button"
                  onClick={() => onGeneratePart(p)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border"
                  style={{ fontSize: 12.5, fontWeight: 650, color: '#4C1D95', borderColor: 'rgba(109,40,217,0.35)', background: 'rgba(109,40,217,0.06)' }}
                >
                  <Sparkles size={13} />
                  {p.snapshotBlocks?.length ? 'Regenerate with AI' : 'Generate with AI'}
                </button>
              )}
            </div>
          ) : isMediaPart(p) ? (
            <MediaSlotEditor part={p} onChange={(patch) => onChangePart(p.id, patch)} />
          ) : isTextBodyPart(p) ? (
            <>
              {p.heading !== undefined && (
                <input
                  className="w-full mb-2"
                  value={p.heading || ''}
                  placeholder="Heading"
                  onChange={(e) => onChangePart(p.id, { heading: e.target.value })}
                  style={{ fontSize: 14, fontWeight: 650, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 10px' }}
                />
              )}
              <RichTextEditor
                value={p.body || p.plain || ''}
                onChange={(next) => onChangePart(p.id, { body: next, plain: next })}
                placeholder="Write this block…"
                minHeight={140}
                trailingActions={
                  <button
                    type="button"
                    onClick={() => setRefineId(refineId === p.id ? null : p.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border"
                    style={{ fontSize: 12, color: '#6D28D9', borderColor: 'rgba(109,40,217,0.25)', background: '#fff' }}
                  >
                    <Sparkles size={11} /> Ask AI
                  </button>
                }
              />
            </>
          ) : (
            <textarea
              className="w-full resize-y"
              rows={5}
              value={p.body || p.plain || ''}
              placeholder="Write this block…"
              onChange={(e) => onChangePart(p.id, { body: e.target.value, plain: e.target.value })}
              style={{ fontSize: 13.5, lineHeight: 1.55, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: 10 }}
            />
          )}
          {refineId === p.id && (
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <input
                className="flex-1 min-w-[180px]"
                value={refineInstr}
                onChange={(e) => setRefineInstr(e.target.value)}
                placeholder="e.g. Simplify for beginners"
                style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '8px 10px' }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => onRefine(p)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-white"
                style={{ fontSize: 12.5, fontWeight: 600, background: '#6D28D9' }}
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                Refine
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function isMediaPart(p: TutorialV3Part): boolean {
  return p.type === 'image' || p.type === 'video' || p.type === 'media' || !!p.mediaKind;
}

/** Text blocks that get the allowlisted rich-text toolbar (Tutorial V3 authoring). */
function isTextBodyPart(p: TutorialV3Part): boolean {
  if (isNestedEditablePart(p) || isMediaPart(p)) return false;
  const t = String(p.type || 'rich-text');
  return t === 'rich-text' || t === 'explanation' || !p.type;
}

function MediaSlotEditor({
  part,
  onChange,
}: {
  part: TutorialV3Part;
  onChange: (patch: Partial<TutorialV3Part>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const kind = part.mediaKind
    || (part.type === 'image' ? 'image' : part.type === 'video' ? 'video' : 'either');
  const resolved: 'image' | 'video' | 'either' =
    part.type === 'image' ? 'image'
      : part.type === 'video' ? 'video'
        : kind;

  const pickMode = (mode: 'image' | 'video') => {
    if (mode === 'image') {
      onChange({
        type: 'image',
        label: 'Media · image',
        mediaKind: kind === 'either' ? 'either' : 'image',
        url: '',
        caption: part.caption || '',
        videoId: undefined,
      });
    } else {
      onChange({
        type: 'video',
        label: 'Media · YouTube',
        mediaKind: kind === 'either' ? 'either' : 'video',
        url: '',
        videoId: '',
        caption: part.caption || '',
      });
    }
  };

  const onPickImage = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onChange({
        type: 'image',
        label: 'Media · image',
        url: String(reader.result || ''),
        caption: part.caption || '',
        mediaKind: kind === 'either' ? 'either' : 'image',
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      {part.mediaHint ? (
        <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 10 }}>{part.mediaHint}</p>
      ) : (
        <p style={{ fontSize: 12.5, color: '#9AA3AF', marginBottom: 10 }}>
          Empty media slot — add an image or a YouTube link for this section.
        </p>
      )}

      {resolved === 'either' && (
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            type="button"
            onClick={() => pickMode('image')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border"
            style={{ fontSize: 12.5, fontWeight: 600, borderColor: 'rgba(0,0,0,0.12)' }}
          >
            <ImageIcon size={13} /> Image
          </button>
          <button
            type="button"
            onClick={() => pickMode('video')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border"
            style={{ fontSize: 12.5, fontWeight: 600, borderColor: 'rgba(0,0,0,0.12)' }}
          >
            <Youtube size={13} /> YouTube link
          </button>
        </div>
      )}

      {(resolved === 'image' || part.type === 'image') && (
        <div>
          {part.url ? (
            <div className="mb-3 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
              <img src={part.url} alt={part.caption || ''} style={{ width: '100%', display: 'block' }} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-8 mb-3"
              style={{ borderColor: 'rgba(0,0,0,0.15)', color: '#6B7280' }}
            >
              <ImageIcon size={22} />
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>Click to upload an image</span>
              <span style={{ fontSize: 11, color: '#9AA3AF' }}>PNG, JPG, GIF — or paste a URL below</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPickImage(e.target.files?.[0])}
          />
          <div className="flex items-center gap-2 mb-2">
            <input
              value={typeof part.url === 'string' && part.url.startsWith('data:') ? '' : (part.url || '')}
              onChange={(e) => onChange({ type: 'image', url: e.target.value, label: 'Media · image' })}
              placeholder={typeof part.url === 'string' && part.url.startsWith('data:') ? 'Uploaded image' : '…or paste an image URL'}
              disabled={typeof part.url === 'string' && part.url.startsWith('data:')}
              className="flex-1 rounded-xl px-3 py-2"
              style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)' }}
            />
            {part.url ? (
              <button
                type="button"
                onClick={() => onChange({ url: '' })}
                className="px-2.5 py-2 rounded-xl border text-xs shrink-0"
                style={{ color: '#6B7280', borderColor: 'rgba(0,0,0,0.1)' }}
              >
                Clear
              </button>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-white text-xs shrink-0"
                style={{ background: '#0B0F1A' }}
              >
                <Upload size={12} /> Upload
              </button>
            )}
          </div>
          <input
            value={part.caption || ''}
            onChange={(e) => onChange({ caption: e.target.value })}
            placeholder="Caption (optional)"
            className="w-full rounded-xl px-3 py-2"
            style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)' }}
          />
          {kind === 'either' && (
            <button
              type="button"
              onClick={() => pickMode('video')}
              className="mt-2"
              style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', background: 'transparent', border: 'none', padding: 0 }}
            >
              ← Switch to YouTube instead
            </button>
          )}
        </div>
      )}

      {(resolved === 'video' || part.type === 'video') && (
        <div>
          <input
            value={part.url || ''}
            onChange={(e) => {
              const v = e.target.value;
              onChange({
                type: 'video',
                label: 'Media · YouTube',
                url: v,
                videoId: parseYtId(v),
              });
            }}
            placeholder="Paste a YouTube link (youtube.com/watch?v=… or youtu.be/…)"
            className="w-full rounded-xl px-3 py-2 mb-2"
            style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)' }}
          />
          <input
            value={part.caption || ''}
            onChange={(e) => onChange({ caption: e.target.value })}
            placeholder="Caption (optional)"
            className="w-full rounded-xl px-3 py-2"
            style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)' }}
          />
          {part.url && !parseYtId(part.url) && (
            <p style={{ fontSize: 11.5, color: '#DC2626', marginTop: 6 }}>
              Couldn&apos;t read a YouTube video id from that link.
            </p>
          )}
          {parseYtId(part.url || '') && (
            <div
              className="mt-3 rounded-xl overflow-hidden"
              style={{ position: 'relative', width: '100%', paddingTop: '56.25%', background: '#000' }}
            >
              <img
                src={`https://i.ytimg.com/vi/${parseYtId(part.url || '')}/hqdefault.jpg`}
                alt=""
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9 }}
              />
            </div>
          )}
          {kind === 'either' && (
            <button
              type="button"
              onClick={() => pickMode('image')}
              className="mt-2"
              style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', background: 'transparent', border: 'none', padding: 0 }}
            >
              ← Switch to image instead
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function GeneratePane({
  pool, picked, toggleSource, substep, setSubstep, markupBundle,
  highlights, setHighlights, markupFlags, setMarkupFlags,
  activeTag, setActiveTag, aiSuggestions, setAiSuggestions, query, setQuery,
  definedSections, onGenerate, busy, template,
  tutorialTitle, tutorialObjective,
}: {
  pool: TutorialV3Draft['sourcePool'];
  picked: string[];
  toggleSource: (id: string) => void;
  substep: 'pick' | 'markup' | 'run';
  setSubstep: (s: 'pick' | 'markup' | 'run') => void;
  markupBundle: ReturnType<typeof sourcePoolToMarkupSources>;
  highlights: any[];
  setHighlights: React.Dispatch<React.SetStateAction<any[]>>;
  markupFlags: any[];
  setMarkupFlags: React.Dispatch<React.SetStateAction<any[]>>;
  activeTag: string;
  setActiveTag: (t: string) => void;
  aiSuggestions: number[];
  setAiSuggestions: React.Dispatch<React.SetStateAction<number[]>>;
  query: string;
  setQuery: (q: string) => void;
  definedSections: { id: string; title: string; intent: string }[];
  onGenerate: () => void;
  busy: boolean;
  template: TutorialTemplate;
  tutorialTitle?: string;
  tutorialObjective?: string;
}) {
  const [scanningFlags, setScanningFlags] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);
  const scanAbort = useRef<AbortController | null>(null);

  const handleScanFlags = async (instruction?: string) => {
    // Prefer picked sources; if none picked, scan the whole pool (same as markup view).
    const sentences = markupBundle.docParas.map((text, i) => ({
      text,
      page: markupBundle.pages[i] || 1,
    }));
    if (!sentences.length) {
      setFlagError(pool.length
        ? 'Selected sources have no text yet — pick a source with sentences, or re-attach Sources.'
        : 'No sources in the pool yet — go back to Sources pool and add a document first.');
      return;
    }
    const focus = String(instruction || '').trim();
    const sections = (definedSections || [])
      .filter((s) => String(s.title || '').trim())
      .map((s) => ({ id: s.id, title: s.title.trim(), intent: s.intent || '' }));
    if (!sections.length && !focus) {
      setFlagError('Enter a scan focus so results are grouped for what you care about.');
      return;
    }
    scanAbort.current?.abort();
    const ctrl = new AbortController();
    scanAbort.current = ctrl;
    setFlagError(null);
    setScanningFlags(true);
    try {
      const result = await suggestTutorialMarkupFlags(
        sentences,
        {
          instruction: focus || undefined,
          objective: tutorialObjective || sections[0]?.intent || undefined,
          title: tutorialTitle || sections[0]?.title || undefined,
          sections: sections.length ? sections : undefined,
        },
        ctrl.signal,
      );
      const flags = result.flags || [];
      setMarkupFlags(flags);
      if (!flags.length) {
        setFlagError(focus
          ? 'No review items found — try a clearer scan focus, or mark up manually.'
          : 'No review items found for this section — try a scan focus, or mark up manually.');
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setFlagError(errorMessage(e, 'Document scan failed — is the API running on :8001?'));
    } finally {
      setScanningFlags(false);
      scanAbort.current = null;
    }
  };
  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(['pick', 'markup', 'run'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSubstep(s)}
            className="px-3 py-1.5 rounded-full border"
            style={{
              fontSize: 12,
              fontWeight: 600,
              background: substep === s ? '#EEF2FF' : 'white',
              borderColor: substep === s ? '#C7D2FE' : 'rgba(0,0,0,0.1)',
              color: '#374151',
            }}
          >
            {s === 'pick' ? '1. Pick sources' : s === 'markup' ? '2. Mark up' : '3. Generate'}
          </button>
        ))}
      </div>

      {substep === 'pick' && (
        <div className="space-y-2">
          <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 8 }}>
            Sub-select from the tutorial source pool for this section only.
            Template: {template.name}.
          </p>
          {!pool.length && (
            <p style={{ fontSize: 13.5, color: '#B45309' }}>
              No sources in the pool yet — go back and attach sources, or write this section by hand.
            </p>
          )}
          {pool.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer"
              style={{ borderColor: picked.includes(s.id) ? '#A78BFA' : 'rgba(0,0,0,0.08)', background: picked.includes(s.id) ? '#F5F3FF' : 'white' }}
            >
              <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggleSource(s.id)} />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0B1220' }}>{s.label}</div>
                <div style={{ fontSize: 12, color: '#9AA3AF' }}>{s.kind} · {s.sentences?.length || 0} sentences</div>
              </div>
            </label>
          ))}
          <button
            type="button"
            disabled={!picked.length && !!pool.length}
            onClick={() => setSubstep('markup')}
            className="mt-3 px-4 py-2 rounded-full text-white disabled:opacity-40"
            style={{ fontSize: 13, fontWeight: 600, background: '#0B0F1A' }}
          >
            Continue to mark up →
          </button>
        </div>
      )}

      {substep === 'markup' && (
        <div>
          {!picked.length && pool.length ? (
            <p style={{ fontSize: 13.5, color: '#B45309' }}>Pick sources first.</p>
          ) : !markupBundle.docParas.length ? (
            <p style={{ fontSize: 13.5, color: '#B45309' }}>Selected sources have no text yet.</p>
          ) : (
            <MarkupWorkspace
              sources={markupBundle.sources as MarkupSource[]}
              docParas={markupBundle.docParas}
              pages={markupBundle.pages}
              highlights={highlights}
              setHighlights={setHighlights}
              activeTag={activeTag}
              setActiveTag={setActiveTag}
              aiSuggestions={aiSuggestions}
              setAiSuggestions={setAiSuggestions}
              query={query}
              setQuery={setQuery}
              markupFlags={markupFlags}
              setMarkupFlags={setMarkupFlags}
              definedSections={definedSections}
              onScanFlags={handleScanFlags}
              scanningFlags={scanningFlags}
              flagError={flagError}
            />
          )}
          <button
            type="button"
            onClick={() => setSubstep('run')}
            className="mt-4 px-4 py-2 rounded-full text-white"
            style={{ fontSize: 13, fontWeight: 600, background: '#0B0F1A' }}
          >
            Continue to generate →
          </button>
        </div>
      )}

      {substep === 'run' && (
        <div className="rounded-2xl p-5" style={{ background: 'white', border: '1px solid rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 14, fontWeight: 650, color: '#0B1220', marginBottom: 6 }}>
            Optional — generate this section with AI
          </p>
          <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 14, lineHeight: 1.5 }}>
            Uses this section’s picked sources and markup. Grounded, cited, no whole-tutorial generate.
            Depth: {template.knobDefaults?.dpth || 'Standard'}.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onGenerate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-white disabled:opacity-50"
            style={{ fontSize: 13, fontWeight: 600, background: '#6D28D9' }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {busy ? 'Generating…' : 'Generate section'}
          </button>
        </div>
      )}
    </div>
  );
}
