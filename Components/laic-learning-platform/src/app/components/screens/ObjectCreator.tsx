import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, ChevronRight, Database, Highlighter, Layers, Settings2, ListOrdered,
  Plus, X, Check, Sparkles, FileText, ChevronDown, Minus,
  ToggleLeft, ToggleRight, Trash2, Save, Send, BookOpen,
  Upload, Loader2, AlertTriangle, RefreshCw,
  Youtube, ClipboardPaste, MessageSquare, Image as ImageIcon, PenLine, Eye, Pencil, Link2, Play
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../App';
import { OBJECTS } from '../../../lib/data';
import { SourceLibrary, PullFromLibraryButton, type PickedLibrarySource } from './CDSources';
import { MarkupWorkspace, type MarkupSource } from './MarkupWorkspace';
import { parsePdf, docFromText, mergeDocs, type ParsedDoc } from '../../../lib/pdf';
import {
  suggestTutorialHighlights, suggestTutorialMarkupFlags, expandTutorialPrompt, generateTutorial, generateFlashcards, generateQuiz, generateConceptCard, suggestConceptIntents,
  generateStructuredObject, generateVideoScript, ingestYoutube, ingestWeb, editTutorialBlock, errorMessage,
  type GeneratedPart, type TutorialGenEvent, type GeneratedCard, type FlashcardGenEvent,
  type GeneratedQuizQuestion, type QuizGenEvent, type GeneratedConceptCard, type ConceptCardGenEvent,
  type StructuredObjectKind, type StructuredGenEvent, type VideoScriptGenEvent, type YtTranscriptSegment,
} from '../../../lib/api';
import { supabaseEnabled, uploadImage } from '../../../lib/supabase';
import type {
  Block, CreatorPipelineDraft, ObjectStatus, ClusteredKnowledgeBase, ConceptCluster, ContentUnit,
  TutorialSectionPlan, TutorialTemplate, ObjectSelection, EditAction, MarkupFlag,
  SummaryContent, ReflectionContent, AssignmentContent, DrillContent, VideoScriptContent,
  LearningObject, AssistantMessage, TutorialDefinition, DefinedSection,
} from '../../../lib/types';
import { UNASSIGNED_SECTION_ID } from '../../../lib/types';
import {
  emptyTutorialDefinition,
  planIsReady,
  deriveTutorialDefinition,
  newSectionId,
  seedSectionsFromTemplate,
  countEmptySections,
  listEmbedsForDefinition,
  listGenerateEmbedsForDefinition,
  listLibraryEmbedsForDefinition,
  listUnresolvedRequiredEmbeds,
  listTemplateRecipeEmbeds,
  setSectionEmbedAttached,
  isEmbedAttachedToSection,
  filterRecipeEmbedsForSection,
  patchEmbedPlan,
  embedTypeLabel,
  type ListedEmbed,
} from '../../../lib/tutorialDefinition';
import {
  getTutorialTemplate,
  DEFAULT_TUTORIAL_TEMPLATE_ID,
  templateUsesCompositeRecipe,
  listEmbeddableLibraryObjects,
  isTutorialStructureLocked,
  applyKnobLocks,
  resolveSectionRecipe,
  filterRecipeByCondition,
  toFlatSectionBlockRecipe,
  type LibraryObjectChoice,
} from '../../../lib/tutorialTemplates';
import { orderTutorialParts } from '../../../lib/tutorialOrder.js';
import { getDefaultTemplateId } from '../../../lib/templateDefaults';
import {
  ensureFourHints, ensureHints, attachHintsToQuestionParts,
  parsePassMark, resolveHintSettings, resolvePassSettings,
} from '../../../lib/questionHints.js';
import { attachSourcesToQuestionParts } from '../../../lib/mcqSources.js';
import {
  findLibraryLearningObject,
  injectEmbedsIntoParts,
  injectPinnedEmbedsIntoParts,
  libraryEmbedPartToBlock,
  makeLibraryEmbedPart,
  type SectionEmbedSlot,
} from '../../../lib/libraryEmbed';
import { generateEmbedPart } from '../../../lib/tutorialEmbedGenerate';
import { objectCollectionIds } from '../../../lib/objectCollectionsStore';
import { LibraryPickerModal } from '../LibraryPickerModal';
import { RichTextEditor } from '../RichTextEditor';
import { useConfirm } from '../ConfirmDialog';
import {
  applyEditActionsToParts,
  authorInstructionsFromMessages,
  buildAssistantContext,
  snapshotParts,
  type PartSnapshot,
  type TutorialEditorPart,
} from '../../../lib/assistant';
import { buildGlossary } from '../../../lib/glossary';
import {
  DEFAULT_CONCEPT_CATEGORIES,
  resolveConceptCategories,
  slugCategoryId,
  type ConceptCategoryDef,
} from '../../../lib/conceptCard';
import { FlashcardEditor } from './FlashcardStudy';
import { QuizEditor } from './QuizEditor';
import { ConceptCardEditor } from './ConceptCardEditor';
import { SummaryEditor, ReflectionEditor, AssignmentEditor, DrillEditor } from './StructuredObjectEditors';
import { VideoScriptEditor } from './VideoScriptEditor';
import { TutorialExtractPanel } from './TutorialExtractPanel';
import { LearningBlocksPreview } from './LearnerReader';
import { AssistantPanel, AssistantOpenButton } from './AssistantPanel';
import { assignmentDefineSummary } from '../../../lib/assignmentRuntime';
import {
  getObjectTemplate,
  type TemplateObjectType,
} from '../../../lib/objectTemplates';

/* ─── helpers ─────────────────────────────────────────────────── */

function fmtType(id: string) {
  return id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Pull the 11-char video id out of any common YouTube URL form (or a bare id). */
function parseYtId(url: string): string {
  const raw = (url || '').trim();
  if (!raw) return '';
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const v = u.searchParams.get('v');
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
  } catch { /* fall through to regex */ }
  const m = raw.match(/(?:youtu\.be\/|youtube\.com\/(?:embed|shorts|live|v)\/|watch\?.*?v=)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
}

/** "1:30" | "1:02:03" | "90" → seconds. Empty/invalid → undefined. */
function parseTimestamp(str: string): number | undefined {
  const s = (str || '').trim();
  if (!s) return undefined;
  if (/^\d+$/.test(s)) return Number(s);
  const parts = s.split(':').map(p => Number(p));
  if (parts.some(n => Number.isNaN(n))) return undefined;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function fmtTimestamp(sec?: number): string {
  if (sec == null || !Number.isFinite(sec)) return '';
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}


type PdfSrc = { id: string; file: File | null; doc: ParsedDoc | null };
type TextSrc = { id: string; doc: ParsedDoc };
type WebSrc = { id: string; url: string; doc: ParsedDoc };
type YtSrc = {
  id: string;
  url: string;
  doc: ParsedDoc;
  segments: YtTranscriptSegment[];
  videoId: string;
  videoTitle: string;
};

function newSrcId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Convert editor parts into library blocks (mirror of ObjEditor.buildBlocks). */
function partsToBlocks(parts: any[], fv: Record<string, any> = {}): Block[] {
  const hintSettings = resolveHintSettings(fv || {});
  const passSettings = resolvePassSettings(fv || {});
  const quizScoreMeta = {
    passRequired: passSettings.passRequired,
    ...(passSettings.passRequired ? { passMark: passSettings.passMark } : {}),
  };
  return (parts || []).map((p: any, i: number) => {
    const id = String(p.id || `blk-${i}`);
    if (p.type === 'concept-card')
      return { id, type: 'concept-card', content: { term: p.concept || p.label || '', definition: p.plain || '', example: p.misc || '' } };
    if (p.type === 'question')
      return {
        id,
        type: 'quiz',
        content: {
          ...quizScoreMeta,
          questions: [{
            question: p.prompt || '',
            type: 'multiple-choice',
            options: p.options || [],
            correct: p.correct ?? 0,
            explanation: p.exp || '',
            label: p.label || undefined,
            sources: Array.isArray(p.sources) ? p.sources : undefined,
            hints: ensureHints(p.hints, {
              explanation: p.exp,
              singleHint: p.hint,
              enabled: hintSettings.enabled,
              count: hintSettings.count,
            }),
          }],
        },
      };
    if (p.type === 'section-quiz') {
      const qs = Array.isArray(p.questions) ? p.questions : [];
      return {
        id,
        type: 'quiz',
        content: {
          ...quizScoreMeta,
          embeddedQuiz: true,
          sourceMode: p.sourceMode || 'generate',
          authoringNote: p.authoringNote,
          required: p.required !== false,
          label: p.label || 'Section quiz',
          questions: qs.map((q: any) => ({
            question: q.question || q.prompt || '',
            type: 'multiple-choice',
            options: q.options || [],
            correct: q.correct ?? 0,
            explanation: q.explanation || q.exp || '',
            label: q.label || undefined,
            sources: Array.isArray(q.sources) ? q.sources : undefined,
            hints: ensureHints(q.hints, {
              explanation: q.explanation || q.exp,
              enabled: hintSettings.enabled,
              count: hintSettings.count,
            }),
          })),
        },
      };
    }
    if (p.type === 'image')
      return { id, type: 'image', content: { url: p.url || '', caption: p.caption || '', alt: p.caption || '' } };
    if (p.type === 'video')
      return { id, type: 'video-embed', content: { provider: 'youtube', url: p.url || '', videoId: p.videoId || parseYtId(p.url || ''), start: parseTimestamp(p.startText || ''), end: parseTimestamp(p.endText || ''), caption: p.caption || '' } };
    if (p.type === 'library-embed')
      return libraryEmbedPartToBlock({ ...p, id });
    return {
      id,
      type: 'rich-text',
      content: {
        text: p.body || p.plain || p.label || '',
        heading: p.heading || undefined,
        subheads: Array.isArray(p.subheads) && p.subheads.length ? p.subheads : undefined,
      },
    };
  }) as Block[];
}

/** Convert saved library blocks back into editor parts. */
function blocksToParts(blocks: Block[]): any[] {
  return (blocks || []).map((b, i) => {
    const id = b.id || `edit-${i}`;
    if (b.type === 'library-embed') {
      const c = (b.content || {}) as any;
      return {
        id,
        type: 'library-embed',
        label: c.label || `Embedded · ${c.libraryTitle || 'content'}`,
        libraryTitle: c.libraryTitle || '',
        objectType: c.objectType,
        versionPin: c.versionPin,
        snapshotBlocks: Array.isArray(c.snapshotBlocks) ? c.snapshotBlocks : [],
        authoringNote: c.authoringNote,
        required: c.required !== false,
        generated: !!c.generated,
      };
    }
    if (b.type === 'concept-card') {
      const c = b.content as { term?: string; definition?: string; example?: string };
      return { id, type: 'concept-card', label: c.term || 'Concept', concept: c.term || '', plain: c.definition || '', misc: c.example || '' };
    }
    if (b.type === 'quiz' || b.type === 'question') {
      if (b.type === 'quiz') {
        const c = (b.content || {}) as any;
        const qs = Array.isArray(c.questions) ? c.questions : [];
        // Multi-question quiz block → section-quiz part (composite embed shape).
        if (qs.length > 1 || c.embeddedQuiz || c.authoringNote) {
          return {
            id,
            type: 'section-quiz',
            label: c.label || 'Section quiz',
            sourceMode: c.sourceMode || 'generate',
            authoringNote: c.authoringNote,
            required: c.required !== false,
            questions: qs.map((q: any) => ({
              question: q.question || '',
              options: q.options || ['', '', '', ''],
              correct: q.correct ?? 0,
              explanation: q.explanation || '',
              hints: Array.isArray(q.hints) ? q.hints : undefined,
              label: q.label,
              sources: Array.isArray(q.sources) ? q.sources : undefined,
            })),
          };
        }
        const q = qs[0];
        return {
          id, type: 'question', label: q?.label || 'Knowledge check',
          prompt: q?.question || '', options: q?.options || ['', '', '', ''],
          correct: q?.correct ?? 0, exp: q?.explanation || '',
          hints: Array.isArray(q?.hints) ? q.hints : undefined,
          sources: Array.isArray(q?.sources) ? q.sources : undefined,
        };
      }
      const q = b.content as any;
      return {
        id, type: 'question', label: q?.label || 'Knowledge check',
        prompt: q?.question || '', options: q?.options || ['', '', '', ''],
        correct: q?.correct ?? 0, exp: q?.explanation || '',
        hints: Array.isArray(q?.hints) ? q.hints : undefined,
        sources: Array.isArray(q?.sources) ? q.sources : undefined,
      };
    }
    if (b.type === 'image') {
      const c = b.content as { url?: string; caption?: string };
      return { id, type: 'image', label: 'Image', url: c.url || '', caption: c.caption || '' };
    }
    if (b.type === 'video-embed') {
      const c = b.content as { url?: string; videoId?: string; start?: number; end?: number; caption?: string };
      return {
        id, type: 'video', label: 'YouTube video',
        url: c.url || '', videoId: c.videoId || parseYtId(c.url || ''),
        startText: fmtTimestamp(c.start), endText: fmtTimestamp(c.end), caption: c.caption || '',
      };
    }
    const c = b.content as { text?: string; heading?: string; subheads?: string[] };
    return {
      id, type: 'rich-text',
      label: c.heading || 'Section',
      body: c.text || '',
      heading: c.heading,
      subheads: c.subheads,
    };
  });
}

/** Sequential Question 1…N for tutorial checks (inline + section-quiz). */
function renumberQuestionParts(parts: any[]): any[] {
  let n = 0;
  return parts.map((p) => {
    if (p.type === 'section-quiz' && Array.isArray(p.questions)) {
      return {
        ...p,
        questions: p.questions.map((q: any) => {
          n += 1;
          return { ...q, label: `Question ${n}` };
        }),
      };
    }
    if (p.type !== 'question') return p;
    n += 1;
    return { ...p, label: `Question ${n}` };
  });
}

/** One cluster → one section plan using the template recipe. */
function buildTutorialSectionPlans(
  template: TutorialTemplate,
  kb: ClusteredKnowledgeBase,
  secs: number,
  _mediaItems: { id: string; kind: string }[],
): TutorialSectionPlan[] {
  const secsN = Math.max(1, secs);
  const useComposite = templateUsesCompositeRecipe(template);

  const unitById = new Map(kb.units.map((u) => [u.id, u]));
  const sourceKey = (cluster: ConceptCluster): string => {
    const counts = new Map<string, number>();
    for (const id of cluster.unitIds) {
      const u = unitById.get(id);
      if (!u) continue;
      const from = String(u.from || '');
      const cut = from.indexOf(' · ');
      const key = cut >= 0 ? from.slice(0, cut) : (from || 'unknown');
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let best = 'unknown';
    let n = -1;
    for (const [k, v] of counts) {
      if (v > n) { best = k; n = v; }
    }
    return best;
  };

  /** Prefer covering every source before filling remaining slots by cluster size. */
  const pickClusters = (): ConceptCluster[] => {
    const pools = new Map<string, ConceptCluster[]>();
    for (const c of kb.clusters) {
      const key = sourceKey(c);
      if (!pools.has(key)) pools.set(key, []);
      pools.get(key)!.push(c);
    }
    for (const list of pools.values()) {
      list.sort((a, b) => b.unitIds.length - a.unitIds.length);
    }
    const keys = [...pools.keys()];
    const selected: ConceptCluster[] = [];
    const used = new Set<string>();
    // Round-robin: one cluster per source first
    let progressed = true;
    while (selected.length < secsN && progressed) {
      progressed = false;
      for (const key of keys) {
        if (selected.length >= secsN) break;
        const list = pools.get(key) || [];
        const next = list.find((c) => !used.has(c.id));
        if (!next) continue;
        used.add(next.id);
        selected.push(next);
        progressed = true;
      }
    }
    // Fill remaining by size across leftovers
    if (selected.length < secsN) {
      const rest = kb.clusters
        .filter((c) => !used.has(c.id))
        .sort((a, b) => b.unitIds.length - a.unitIds.length);
      for (const c of rest) {
        if (selected.length >= secsN) break;
        selected.push(c);
      }
    }
    return selected.length ? selected : kb.clusters.slice(0, secsN);
  };

  const clusters = pickClusters();

  return clusters.map((cluster, index) => ({
    index,
    title: cluster.name || `Section ${index + 1}`,
    clusterId: cluster.id,
    sectionRecipe: useComposite ? template.recipe : undefined,
    // Flat shadow always kept for legacy consumers / fallback.
    recipe: template.sectionBlockRecipe,
    mediaPlacements: [],
  }));
}

/** Define-first: one DefinedSection → one section plan (tagged embeds only). */
function buildTutorialSectionPlansFromDefinition(
  template: TutorialTemplate,
  def: TutorialDefinition,
  kb: ClusteredKnowledgeBase,
  _mediaItems: { id: string; kind: string }[],
): TutorialSectionPlan[] {
  const useComposite = templateUsesCompositeRecipe(template);
  const unitsById = new Map((kb.units || []).map((u) => [u.id, u]));
  const sections = (def.sections || []).filter((s) => String(s.title || '').trim());
  return sections.map((sec, index) => {
    const cluster = (kb.clusters || []).find((c) => c.id === sec.id || c.sectionId === sec.id)
      || { id: sec.id, name: sec.title, unitIds: [], sectionId: sec.id };
    const sectionUnits = (cluster.unitIds || [])
      .map((id) => unitsById.get(id))
      .filter(Boolean) as ContentUnit[];
    const resolved = resolveSectionRecipe(template, undefined);
    const recipeForSection = filterRecipeEmbedsForSection(
      filterRecipeByCondition(resolved, sectionUnits),
      sec,
    );
    return {
      index,
      title: sec.title.trim(),
      intent: String(sec.intent || '').trim() || undefined,
      clusterId: cluster.id,
      sectionRecipe: useComposite ? recipeForSection : undefined,
      recipe: toFlatSectionBlockRecipe(recipeForSection.length ? recipeForSection : template.recipe),
      mediaPlacements: [],
    };
  });
}

function TutorialPlanPanel({
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
          <div key={e.key} className="rounded-lg px-2.5 py-2" style={{ background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.2)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#065F46' }}>
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
              style={{ fontSize: 11.5, fontWeight: 600, background: '#fff', borderColor: 'rgba(0,0,0,0.1)', color: '#047857' }}
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
          <p style={{ fontSize: 12, color: '#5B21B6', marginTop: 8 }}>
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
                            background: on ? '#0B0F1A' : '#fff',
                            color: on ? '#fff' : '#374151',
                            borderColor: on ? '#0B0F1A' : 'rgba(0,0,0,0.1)',
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

const RECIPE_PART_LABELS: Record<string, string> = {
  'section-heading': 'Section',
  explanation: 'Explanation',
  'worked-example': 'Worked example',
  'source-excerpt': 'Source excerpt',
  instruction: 'Instruction',
  'try-it': 'Try it',
  principle: 'Principle',
  misconception: 'Misconception',
  correction: 'Correction',
  'scenario-advance': 'Scenario',
  'knowledge-check': 'Knowledge check',
  media: 'Media',
};

/** Empty editable skeleton from a pedagogical template (no-source / write-myself path). */
function scaffoldTutorialFromTemplate(
  template: TutorialTemplate,
  secs: number,
  end?: string,
  libraryObjects: LearningObject[] = [],
): any[] {
  const parts: any[] = [];
  let n = 0;
  const rid = () => `manual-${Date.now()}-${++n}`;
  const sectionCount = Math.max(1, secs || template.knobDefaults.secs || 3);
  const endWith = end || template.knobDefaults.end || 'Recap only';
  const checksPerSection = Math.max(1, Number(template.knobDefaults.chks) || 1);
  const useComposite = templateUsesCompositeRecipe(template);

  parts.push({
    id: rid(),
    type: 'rich-text',
    label: 'Introduction',
    heading: 'Introduction',
    body: '',
  });

  for (let s = 0; s < sectionCount; s += 1) {
    const sectionTitle = `Section ${s + 1}`;
    let headingEmitted = false;

    if (useComposite) {
      for (const item of template.recipe) {
        if (item.kind === 'atomic') {
          if (item.blockType === 'media') continue;
          if (item.blockType === 'section-heading') {
            parts.push({
              id: rid(),
              type: 'rich-text',
              label: sectionTitle,
              heading: sectionTitle,
              body: '',
            });
            headingEmitted = true;
            continue;
          }
          if (item.blockType === 'try-it') {
            parts.push({
              id: rid(),
              type: 'question',
              label: 'Question',
              prompt: '',
              options: ['', '', '', ''],
              correct: 0,
              exp: '',
              hints: ensureFourHints([], { sectionTitle }),
            });
            continue;
          }
          const label = RECIPE_PART_LABELS[item.blockType] || item.blockType;
          const part: any = { id: rid(), type: 'rich-text', label, body: '' };
          if (!headingEmitted) {
            part.heading = sectionTitle;
            headingEmitted = true;
          }
          parts.push(part);
          continue;
        }

        if (item.objectType === 'quiz' && item.sourceMode !== 'pick_from_library') {
          const questions = Array.from({ length: checksPerSection }, (_, qi) => ({
            question: '',
            options: ['', '', '', ''],
            correct: 0,
            explanation: '',
            hints: ensureFourHints([], { sectionTitle }),
            label: `Question ${qi + 1}`,
          }));
          parts.push({
            id: rid(),
            type: 'section-quiz',
            label: `Section quiz · ${sectionTitle}`,
            sourceMode: item.sourceMode,
            authoringNote: item.authoringNote || "test only this section's concept",
            required: item.required,
            questions,
          });
          continue;
        }

        if (item.sourceMode === 'pick_from_library' && item.versionPin?.objectId) {
          const obj = findLibraryLearningObject(item.versionPin.objectId, libraryObjects);
          if (obj) {
            parts.push(makeLibraryEmbedPart({
              id: rid(),
              object: obj,
              versionId: item.versionPin.versionId || `${obj.id}__v1`,
              authoringNote: item.authoringNote,
              required: item.required,
            }));
            continue;
          }
        }

        if (item.sourceMode === 'pick_from_library') {
          parts.push({
            id: rid(),
            type: 'library-embed',
            label: `Embedded · ${item.libraryTitle || item.objectType}`,
            libraryTitle: item.libraryTitle || '',
            objectType: item.objectType === 'reused-from-library' ? 'concept-card' : item.objectType,
            versionPin: item.versionPin || { objectId: '', versionId: '' },
            snapshotBlocks: [],
            authoringNote: item.authoringNote || 'Pick a library content for this slot.',
            required: item.required,
          });
          continue;
        }

        parts.push({
          id: rid(),
          type: 'rich-text',
          label: `Embedded ${item.objectType}`,
          body: item.authoringNote
            ? `[Authoring note] ${item.authoringNote}`
            : `Embedded ${item.objectType} — generate or pick from library when editing.`,
          heading: headingEmitted ? undefined : sectionTitle,
        });
        if (!headingEmitted) headingEmitted = true;
      }
    } else {
      // Legacy flat path — unchanged.
      for (const item of template.sectionBlockRecipe) {
        if (item.type === 'media') continue;
        if (item.type === 'section-heading') {
          parts.push({
            id: rid(),
            type: 'rich-text',
            label: sectionTitle,
            heading: sectionTitle,
            body: '',
          });
          headingEmitted = true;
          continue;
        }
        if (item.type === 'knowledge-check' || item.type === 'try-it') {
          parts.push({
            id: rid(),
            type: 'question',
            label: 'Question',
            prompt: '',
            options: ['', '', '', ''],
            correct: 0,
            exp: '',
            hints: ensureFourHints([], { sectionTitle }),
          });
          continue;
        }
        const label = RECIPE_PART_LABELS[item.type] || item.type;
        const part: any = { id: rid(), type: 'rich-text', label, body: '' };
        if (!headingEmitted) {
          part.heading = sectionTitle;
          headingEmitted = true;
        }
        parts.push(part);
      }
    }
  }

  if (endWith === 'Recap only') {
    parts.push({ id: rid(), type: 'rich-text', label: 'Recap', heading: 'Recap', body: '' });
  } else if (endWith === 'End quiz') {
    for (let i = 0; i < 2; i += 1) {
      parts.push({
        id: rid(),
        type: 'question',
        label: 'Question',
        prompt: '',
        options: ['', '', '', ''],
        correct: 0,
        exp: '',
        hints: ensureFourHints([]),
      });
    }
  } else if (endWith === 'End assignment') {
    parts.push({ id: rid(), type: 'rich-text', label: 'Assignment', heading: 'Assignment', body: '' });
  }

  return renumberQuestionParts(parts);
}

const NOUNS: Record<string, string> = {
  lesson: 'lesson', tutorial: 'tutorial', quiz: 'quiz',
  'flashcard-set': 'flashcard set', 'concept-card': 'concept card',
  summary: 'summary', reflection: 'reflection', scenario: 'scenario',
  assignment: 'assignment', drill: 'drill', 'video-script': 'video script',
};

/* ─── field system ────────────────────────────────────────────── */

type FT = 'area' | 'text' | 'pick' | 'multi' | 'sel' | 'bool' | 'num';
interface FDef { id: string; label: string; type: FT; options?: string[]; default?: any; hint?: string; min?: number; max?: number; }
interface GDef { title?: string; note?: string; fields: FDef[]; }

const VOI = ['Plain & friendly', 'Neutral / academic', 'Encouraging', 'Socratic'];

const CFG: Record<string, GDef[]> = {
  lesson: [
    { title: 'Intent', note: 'What are you actually trying to teach?', fields: [
      { id: 'obj', label: 'Learning objective', type: 'area', hint: 'After this lesson, the learner can…' },
      { id: 'concepts', label: 'Concept(s) to focus on', type: 'text' },
      { id: 'voi', label: 'Voice', type: 'pick', options: VOI, default: 'Plain & friendly' },
    ]},
    { title: 'Teaching approach', fields: [
      { id: 'how', label: 'How it should teach', type: 'pick', options: ['Explain → check', 'Story / case-based', 'Inquiry (question-first)', 'Worked example'], default: 'Explain → check' },
      { id: 'open', label: 'Open with', type: 'pick', options: ['Surprising fact', 'Real-world question', 'Short story', 'Direct framing'], default: 'Surprising fact' },
      { id: 'depth', label: 'Depth', type: 'pick', options: ['Quick (~5 min)', 'Standard (~10)', 'Deep (~20)'], default: 'Standard (~10)' },
      { id: 'misc', label: 'Address a common misconception', type: 'bool', default: true },
    ]},
    { title: 'What to include', fields: [
      { id: 'expls', label: 'Explanation sections', type: 'num', min: 1, max: 5, default: 2 },
      { id: 'exmps', label: 'Worked examples', type: 'num', min: 0, max: 3, default: 1 },
      { id: 'excpts', label: 'Source excerpts', type: 'num', min: 0, max: 3, default: 1 },
      { id: 'chks', label: 'Knowledge checks', type: 'num', min: 0, max: 5, default: 2 },
      { id: 'refs', label: 'Reflection prompts', type: 'num', min: 0, max: 2, default: 1 },
      { id: 'summ', label: 'End with a summary', type: 'bool', default: true },
    ]},
  ],
  tutorial: [
    // Intent + aiExtra live in Plan / are force-Off — Define shows a slim confirm.
    { title: 'Structure', fields: [
      { id: 'secs', label: 'Sections / sub-lessons', type: 'num', min: 2, max: 20, default: 3 },
      { id: 'prog', label: 'Progression', type: 'pick', options: ['Linear build-up', 'Prerequisite chain', 'Themed clusters'], default: 'Linear build-up' },
      { id: 'dpth', label: 'Depth per section', type: 'pick', options: ['Overview', 'Standard', 'In-depth'], default: 'Standard' },
      { id: 'end', label: 'End with', type: 'pick', options: ['End quiz', 'End assignment', 'Recap only', 'None'], default: 'Recap only' },
    ]},
    { title: 'Per section', fields: [
      { id: 'chks', label: 'Checks per section', type: 'num', min: 0, max: 3, default: 1 },
      { id: 'excpts', label: 'Source excerpts (total)', type: 'num', min: 0, max: 3, default: 1 },
      { id: 'wex', label: 'Include a worked example', type: 'bool', default: true },
    ]},
    { title: 'Checks & scoring', note: 'When a pass mark is on, it is scored across every multiple-choice check in the tutorial combined — not per question.', fields: [
      { id: 'passOn', label: 'Require a pass mark on MCQs', type: 'bool', default: true },
      { id: 'pass', label: 'Pass mark (all checks combined)', type: 'sel', options: ['50%', '60%', '70%', '80%', '90%'], default: '70%' },
      { id: 'hintsOn', label: 'Offer progressive hints after wrong answers', type: 'bool', default: true },
      { id: 'hintN', label: 'Hints per question', type: 'num', min: 1, max: 4, default: 4 },
    ]},
  ],
  quiz: [
    { title: 'Intent', note: 'What should this quiz verify, and for whom?', fields: [
      { id: 'verify', label: 'Intent — what it should verify', type: 'area' },
      { id: 'purpose', label: 'Purpose', type: 'pick', options: ['Formative check', 'Readiness gate', 'Diagnostic'], default: 'Formative check' },
      { id: 'concepts', label: 'Concepts to assess', type: 'text' },
    ]},
    { title: 'Question design', fields: [
      { id: 'qtypes', label: 'Question types', type: 'multi', options: ['Multiple choice', 'True/false', 'Multi-select', 'Short answer', 'Scenario'], default: ['Multiple choice', 'True/false'] },
      { id: 'cog', label: 'Cognitive levels', type: 'multi', options: ['Recall', 'Understand', 'Apply', 'Analyze'], default: ['Recall', 'Understand'] },
      { id: 'diff', label: 'Difficulty mix', type: 'pick', options: ['Mostly easy', 'Balanced', 'Mostly hard', 'Ramped easy→hard'], default: 'Balanced' },
      { id: 'wrong', label: 'Wrong answers', type: 'pick', options: ['Plausible common errors', 'Straightforward'], default: 'Plausible common errors' },
    ]},
    { title: 'Adaptivity', note: 'Should later questions get harder or easier based on how the learner answers?', fields: [
      { id: 'adaptive', label: 'Should the quiz questions be adaptive?', type: 'pick', options: ['Yes', 'No'], default: 'No' },
    ]},
    { title: 'Scoring & feedback', fields: [
      { id: 'nq', label: 'Number of questions', type: 'num', min: 3, max: 20, default: 8 },
      { id: 'passOn', label: 'Require a pass mark', type: 'bool', default: true },
      { id: 'pass', label: 'Pass mark', type: 'sel', options: ['50%', '60%', '70%', '80%', '90%'], default: '70%' },
      { id: 'show', label: 'Show explanations', type: 'sel', options: ['Immediately', 'After attempt', 'After completion', 'Never'], default: 'After attempt' },
      { id: 'perq', label: 'Write per-question explanations', type: 'bool', default: true },
    ]},
  ],
  'flashcard-set': [
    { title: 'Intent', fields: [
      { id: 'mem', label: 'What to memorise', type: 'text' },
    ]},
    { title: 'Card design', fields: [
      { id: 'cc', label: 'Card content', type: 'multi', options: ['Key terms → definitions', 'Concept → example', 'Question → answer', 'Image → label'], default: ['Key terms → definitions'] },
      { id: 'pull', label: 'Pull cards from', type: 'multi', options: ['Glossary / key terms in source', 'Concepts I focus on', 'Examples & worked cases', 'Misconceptions to correct', 'Questions in the source'], default: ['Glossary / key terms in source'] },
      { id: 'dir', label: 'Review direction', type: 'pick', options: ['Front→back', 'Back→front', 'Both'], default: 'Front→back' },
      { id: 'hooks', label: 'Add memory hooks', type: 'bool', default: false },
    ]},
    { title: 'Set', fields: [
      { id: 'nc', label: 'Number of cards', type: 'num', min: 5, max: 30, default: 12 },
    ]},
  ],
  'concept-card': [
    { title: 'Intent', note: 'The concept is resolved against your source — not a generic dictionary sense.', fields: [
      { id: 'concept', label: 'Intent — the concept', type: 'text', hint: 'Type a concept, or pick a suggestion from your markup' },
      { id: 'voi', label: 'Voice', type: 'pick', options: VOI, default: 'Plain & friendly' },
    ]},
    { title: 'Sheet categories', note: 'Toggle which panels appear on the concept card, rename them, or add your own. Generation fills only the ones you keep on.', fields: [
      { id: 'len', label: 'Length per section', type: 'pick', options: ['Tight', 'Standard', 'Expanded'], default: 'Standard' },
    ]},
  ],
  summary: [
    { title: 'Intent', fields: [
      { id: 'what', label: 'What to summarise', type: 'text' },
    ]},
    { title: 'Format', fields: [
      { id: 'shape', label: 'Shape', type: 'pick', options: ['TL;DR paragraph', 'Key points', 'Exam-cram sheet', 'Abstract'], default: 'Key points' },
      { id: 'len', label: 'Length', type: 'pick', options: ['Short', 'Medium', 'Long'], default: 'Medium' },
      { id: 'nkp', label: 'Number of key points', type: 'num', min: 3, max: 10, default: 5 },
    ]},
  ],
  reflection: [
    { title: 'Intent', fields: [
      { id: 'goal', label: 'Reflection goal', type: 'pick', options: ['Connect to experience', 'Self-assess understanding', 'Apply to real life', 'Plan next steps'], default: 'Apply to real life' },
      { id: 'voi', label: 'Voice', type: 'pick', options: VOI, default: 'Encouraging' },
    ]},
    { title: 'Prompt design', fields: [
      { id: 'style', label: 'Style', type: 'pick', options: ['Open-ended', 'Guided with sentence starters', 'Before / after structured'], default: 'Open-ended' },
      { id: 'who', label: 'Who sees answers', type: 'pick', options: ['Private to learner', 'Instructor-visible'], default: 'Private to learner' },
      { id: 'np', label: 'Number of prompts', type: 'num', min: 1, max: 5, default: 2 },
      { id: 'starters', label: 'Include sentence starters', type: 'bool', default: false },
    ]},
  ],
  scenario: [
    { title: 'Intent', fields: [
      { id: 'exercises', label: 'What it exercises', type: 'area', hint: 'The skill, bias, or concept the learner practises' },
      { id: 'skill', label: 'Skill / concept', type: 'text', hint: 'e.g. spotting confirmation bias' },
    ]},
    { title: 'The situation', fields: [
      { id: 'setting', label: 'Setting / situation', type: 'area', hint: 'Sketch the scenario the learner steps into' },
      { id: 'struct', label: 'Structure', type: 'pick', options: ['Linear', 'Branching decisions'], default: 'Branching decisions' },
      { id: 'frame', label: 'Framing', type: 'pick', options: ['Realistic case', 'Roleplay', 'Abstract'], default: 'Realistic case' },
      { id: 'debrief', label: 'Debrief', type: 'pick', options: ['Model reasoning', 'Feedback per choice', 'Both'], default: 'Both' },
      { id: 'dp', label: 'Decision points', type: 'num', min: 1, max: 6, default: 3 },
    ]},
  ],
  assignment: [
    { title: 'Intent', note: 'What are you actually asking the learner to demonstrate?', fields: [
      { id: 'obj', label: 'Learning objective', type: 'area', hint: 'What the learner demonstrates by doing this' },
    ]},
    { title: 'The task', fields: [
      { id: 'tt', label: 'Task type', type: 'pick', options: ['Short essay', 'Analysis', 'Problem set', 'Project', 'Critique'], default: 'Short essay' },
      { id: 'del', label: 'Deliverable', type: 'pick', options: ['Written text', 'File upload', 'Structured form'], default: 'Written text' },
      { id: 'el', label: 'Expected length', type: 'sel', options: ['~150 words', '~300 words', '~500 words', '~800 words'], default: '~300 words' },
      { id: 'cite', label: 'Require source citations', type: 'bool', default: true },
    ]},
    { title: 'Requirements & rubric', note: 'Requirements are checkable; rubric criteria map back to the objective and those requirements.', fields: [
      { id: 'req', label: 'Requirements', type: 'num', min: 2, max: 6, default: 3 },
      { id: 'rubric', label: 'Rubric criteria', type: 'num', min: 2, max: 6, default: 3 },
    ]},
  ],
  drill: [
    { title: 'Intent', fields: [
      { id: 'skill', label: 'Skill to drill', type: 'text', hint: 'The one narrow skill this reinforces' },
    ]},
    { title: 'Practice design', fields: [
      { id: 'fmt', label: 'Item format', type: 'pick', options: ['Recognition', 'Recall', 'Application'], default: 'Recall' },
      { id: 'diff', label: 'Difficulty', type: 'pick', options: ['Flat', 'Easy → hard'], default: 'Easy → hard' },
      { id: 'fb', label: 'Feedback', type: 'pick', options: ['Immediate', 'End only'], default: 'Immediate' },
      { id: 'timed', label: 'Timed', type: 'bool', default: false },
      { id: 'rep', label: 'Repeat until mastery', type: 'bool', default: false },
      { id: 'ni', label: 'Number of items', type: 'num', min: 5, max: 30, default: 15 },
    ]},
  ],
  'video-script': [
    { title: 'Intent', note: 'Paste a YouTube video in Sources. Define how the interactive lesson should behave.', fields: [
      { id: 'obj', label: 'Learning objective', type: 'area', hint: 'After watching with checkpoints, the learner can…' },
    ]},
    { title: 'Checkpoints', note: 'The video pauses at each checkpoint until the learner answers.', fields: [
      { id: 'ncp', label: 'Number of checkpoints', type: 'num', min: 1, max: 12, default: 4 },
    ]},
    { title: 'Learner tools', note: 'Shown beside the video in student preview.', fields: [
      { id: 'showTranscript', label: 'Transcript available (jump to any point)', type: 'bool', default: true },
      { id: 'enableChat', label: 'AI chatbot available (answers about the video)', type: 'bool', default: true },
    ]},
  ],
};

/** Non-tutorial pipelines keep the classic 4-step rail (untouched). */
const STEP_META = [
  { label: 'Sources', sub: 'Pick what this content draws on', icon: <Database size={14} /> },
  { label: 'Mark up', sub: 'Comment on what matters', icon: <Highlighter size={14} />, skip: true, optionalLabel: true },
  { label: 'Extract', sub: 'Pull the content into shape', icon: <Layers size={14} />, skip: true, optionalLabel: true },
  { label: 'Define', sub: 'Objective and approach', icon: <Settings2 size={14} /> },
];

/** Tutorial-only define-first rail: Plan gates Sources. */
const STEP_META_TUTORIAL = [
  { label: 'Plan', sub: 'Objective and section outline', icon: <ListOrdered size={14} /> },
  { label: 'Sources', sub: 'Pick what this content draws on', icon: <Database size={14} /> },
  { label: 'Mark up', sub: 'Comment on what matters', icon: <Highlighter size={14} />, skip: true, optionalLabel: true },
  { label: 'Extract', sub: 'Sort units into your sections', icon: <Layers size={14} />, skip: true, optionalLabel: true },
  { label: 'Define', sub: 'Confirm and generate', icon: <Settings2 size={14} /> },
];

const TAG: Record<string, { bg: string; text: string; border: string }> = {
  Use:     { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' },
  Support: { bg: '#E0F2FE', text: '#0C4A6E', border: '#0EA5E9' },
  Ignore:  { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444' },
  Note:    { bg: '#F3E8FF', text: '#6B21A8', border: '#A855F7' },
};

const SCOPES = [
  { id: 'private', label: 'Private', sub: 'Only me' },
  { id: 'team', label: 'Team', sub: 'My team' },
  { id: 'program', label: 'Program', sub: 'Everyone in this program' },
  { id: 'organization', label: 'Organization', sub: 'All programs in the org' },
];

const KINDS = ['Definition', 'Key point', 'Example', 'Quote', 'Fact', 'Procedure'];

const DOC_PARAS = [
  'Bridge is a trick-taking card game played by four players in two partnerships sitting opposite each other.',
  'The deck has 52 cards divided into four suits: spades (♠), hearts (♥), diamonds (♦), and clubs (♣).',
  'Each suit contains 13 cards ranked from Ace (highest) down to 2 (lowest).',
  'Before play begins, one player deals all 52 cards so that each player holds 13 cards.',
  'The auction, or bidding phase, determines the contract and which side will play it.',
  'A bid specifies a number of tricks (from one to seven) and a suit or no-trump.',
  'The side that wins the auction becomes the declaring side; the other side defends.',
  'High-card points (HCP) help evaluate hand strength: Ace = 4, King = 3, Queen = 2, Jack = 1.',
  'A deck has 40 HCP in total; a typical opening hand has at least 12–13 HCP.',
  'The player who first named the winning suit becomes declarer.',
  "Declarer plays both their own hand and their partner's hand (the dummy), laid face-up after the opening lead.",
  'A trick consists of one card played by each of the four players in clockwise order.',
  'The suit led to a trick must be followed if possible; if not, any card may be played.',
  'The highest card of the suit led wins the trick, unless a trump is played.',
  'Play continues until all 13 tricks are played; then score is calculated based on the contract.',
];

/* ─── field renderer ──────────────────────────────────────────── */

function Field({ f, val, set }: { f: FDef; val: any; set: (v: any) => void }) {
  const v = val ?? f.default;
  if (f.type === 'area') return (
    <textarea value={v || ''} onChange={e => set(e.target.value)} placeholder={f.hint || ''} rows={3}
      className="w-full rounded-xl px-3 py-2 resize-none"
      style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', outline: 'none' }} />
  );
  if (f.type === 'text') return (
    <input type="text" value={v || ''} onChange={e => set(e.target.value)} placeholder={f.hint || ''}
      className="w-full rounded-xl px-3 py-2"
      style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', outline: 'none' }} />
  );
  if (f.type === 'pick') return (
    <div className="flex flex-wrap gap-1.5">
      {f.options!.map(o => (
        <button key={o} onClick={() => set(o)} className="px-3 py-1 rounded-full border transition-all"
          style={{ fontSize: 12, fontWeight: v === o ? 650 : 400, background: v === o ? '#0B0F1A' : 'rgba(255,255,255,0.8)', color: v === o ? '#fff' : '#374151', borderColor: v === o ? '#0B0F1A' : 'rgba(0,0,0,0.1)' }}>
          {o}
        </button>
      ))}
    </div>
  );
  if (f.type === 'multi') {
    const arr: string[] = Array.isArray(v)
      ? v
      : (typeof v === 'string' && v ? [v] : (f.default || []));
    return (
      <div className="flex flex-wrap gap-1.5">
        {f.options!.map(o => {
          const on = arr.includes(o);
          return (
            <button key={o} onClick={() => set(on ? arr.filter((x: string) => x !== o) : [...arr, o])}
              className="flex items-center gap-1 px-3 py-1 rounded-full border transition-all"
              style={{ fontSize: 12, fontWeight: on ? 650 : 400, background: on ? '#0B0F1A' : 'rgba(255,255,255,0.8)', color: on ? '#fff' : '#374151', borderColor: on ? '#0B0F1A' : 'rgba(0,0,0,0.1)' }}>
              {on && <Check size={11} />}{o}
            </button>
          );
        })}
      </div>
    );
  }
  if (f.type === 'sel') return (
    <div className="relative inline-block">
      <select value={v || f.default} onChange={e => set(e.target.value)}
        className="appearance-none rounded-xl px-3 py-2 pr-7"
        style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', outline: 'none' }}>
        {f.options!.map(o => <option key={o}>{o}</option>)}
      </select>
      <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
    </div>
  );
  if (f.type === 'bool') {
    const on = v ?? f.default;
    return (
      <button onClick={() => set(!on)} className="flex items-center gap-1.5">
        {on ? <ToggleRight size={22} style={{ color: '#059669' }} /> : <ToggleLeft size={22} style={{ color: '#9AA3AF' }} />}
        <span style={{ fontSize: 12, color: on ? '#059669' : '#9AA3AF' }}>{on ? 'On' : 'Off'}</span>
      </button>
    );
  }
  if (f.type === 'num') {
    const n = typeof v === 'number' ? v : (f.default ?? 0);
    const hasMax = typeof f.max === 'number';
    // Free / large ranges (e.g. target word count): editable number, no hard cap when max omitted.
                if (!hasMax || Number(f.max) > 99) {
      return (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="number"
            min={f.min ?? 0}
            max={hasMax ? f.max : undefined}
            value={n}
            onChange={(e) => {
              const raw = e.target.value === '' ? (f.min ?? 0) : Number(e.target.value);
              if (!Number.isFinite(raw)) return;
              let next = Math.max(f.min ?? 0, Math.round(raw));
              if (hasMax) next = Math.min(Number(f.max), next);
              set(next);
            }}
            className="w-28 rounded-xl px-3 py-2"
            style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', outline: 'none' }}
          />
          <span style={{ fontSize: 11.5, color: '#9AA3AF' }}>
            {f.hint || (hasMax ? `${f.min}–${f.max}` : f.min != null ? `${f.min}+ · no upper limit` : 'no upper limit')}
          </span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <button onClick={() => set(Math.max(f.min ?? 0, n - 1))}
          className="w-7 h-7 rounded-full border flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.8)', borderColor: 'rgba(0,0,0,0.1)' }}>
          <Minus size={12} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, minWidth: 20, textAlign: 'center' }}>{n}</span>
        <button onClick={() => set(Math.min(f.max ?? 99, n + 1))}
          className="w-7 h-7 rounded-full border flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.8)', borderColor: 'rgba(0,0,0,0.1)' }}>
          <Plus size={12} />
        </button>
        <span style={{ fontSize: 11, color: '#9AA3AF' }}>{f.min}–{f.max}</span>
      </div>
    );
  }
  return null;
}

/* ─── step content ────────────────────────────────────────────── */

/** Material source types — more than one can be attached at once. */
const MATERIAL_SOURCE_MODES = [
  { id: 'pdf', label: 'Upload PDF', icon: <Upload size={15} /> },
  { id: 'text', label: 'Paste text', icon: <ClipboardPaste size={15} /> },
  { id: 'web', label: 'Website link', icon: <Link2 size={15} /> },
  { id: 'youtube', label: 'YouTube link', icon: <Youtube size={15} /> },
] as const;

const PATH_SOURCE_MODES = [
  { id: 'prompt', label: 'No source — AI prompt', icon: <MessageSquare size={15} /> },
  { id: 'manual', label: 'Write myself', icon: <PenLine size={15} /> },
] as const;

type MaterialSourceKind = (typeof MATERIAL_SOURCE_MODES)[number]['id'];

/* Shared "source is ready" summary card (pdf file pending parse / parsed doc). */
function SourceReadyCard({
  doc,
  file,
  onReplace,
}: {
  doc?: ParsedDoc | null;
  file?: File | null;
  onReplace: () => void;
}) {
  const name = doc?.fileName || file?.name || 'Source';
  const sub = doc
    ? `${doc.sentences.length} sentence${doc.sentences.length !== 1 ? 's' : ''} ready to mark up`
    : file
      ? `${(file.size / 1024).toFixed(0)} KB · text extracted in Mark up`
      : '';
  return (
    <div className="rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.85)', borderColor: 'rgba(0,0,0,0.08)' }}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: '#7C3AED' }}>
          <FileText size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 13.5, fontWeight: 650, color: '#0B1220' }} className="truncate">{name}</p>
          <p style={{ fontSize: 12, color: '#6B7280', fontFamily: 'monospace' }}>{sub}</p>
        </div>
        <button type="button" onClick={onReplace}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border shrink-0"
          style={{ fontSize: 12, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
          <X size={12} />Remove
        </button>
      </div>
      {doc && doc.sentences.length === 0 && (
        <div className="flex items-start gap-2 mt-3 rounded-xl p-2.5" style={{ background: '#FEF3C7', border: '1px solid #FCD34D' }}>
          <AlertTriangle size={14} style={{ color: '#92400E', marginTop: 1 }} />
          <p style={{ fontSize: 12, color: '#92400E' }}>No usable text was found. Try another source so you can highlight sentences.</p>
        </div>
      )}
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 mt-3 rounded-2xl p-3" style={{ background: '#FEE2E2', border: '1px solid #FCA5A5' }}>
      <AlertTriangle size={15} style={{ color: '#B91C1C', marginTop: 1 }} />
      <p style={{ fontSize: 12.5, color: '#991B1B' }}>{text}</p>
    </div>
  );
}

/* Tutorial Step 1 — teaching sources (tabs) + optional media (right column). */
type SourceTab = MaterialSourceKind | 'prompt' | 'manual' | 'library';

function SourcesModal({
  title,
  onClose,
  onSave,
  saveLabel = 'Save',
  saveDisabled,
  children,
}: {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Portal to body — parent Sources step uses overflow-hidden + motion transform,
  // which traps position:fixed and lets the Cancel/Next bar cover Save.
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(11,15,26,0.45)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-2xl border bg-white shadow-xl"
        style={{ borderColor: 'rgba(0,0,0,0.08)', maxHeight: 'min(86vh, 640px)', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#0B1220' }}>{title}</p>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ color: '#6B7280', background: 'rgba(0,0,0,0.04)' }}>
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto min-h-0 flex-1">{children}</div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t shrink-0" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-full border" style={{ fontSize: 13, color: '#374151', borderColor: 'rgba(0,0,0,0.1)' }}>
            Cancel
          </button>
          <button
            type="button"
            disabled={saveDisabled}
            onClick={onSave}
            className="px-5 py-2 rounded-full text-white"
            style={{ fontSize: 13, fontWeight: 600, background: saveDisabled ? '#E5E7EB' : '#7C3AED', color: saveDisabled ? '#9AA3AF' : '#fff' }}
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TutorialSource(props: any) {
  const {
    pathMode, setPathMode,
    enabledTypes, toggleMaterialType,
    pdfSources, onRemovePdf, onFile,
    textSources, pasteText, setPasteText, onLoadText, onRemoveText,
    ytSources, ytUrl, setYtUrl, ytLoading, ytError, onFetchYoutube, onRemoveYoutube,
    webSources, webUrl, setWebUrl, webLoading, webError, onFetchWeb, onRemoveWeb,
    promptText, setPromptText, expandPromptError, setExpandPromptError, showMedia, imagesOnly,
    media, addImagesFromFiles, addVideo, updateMedia, removeMedia,
    showManualWrite,
    objectNoun = 'content',
    librarySource,
    onPickLibrarySource,
  } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const bulkImageRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [imgDragOver, setImgDragOver] = useState(false);
  const [imagesOpen, setImagesOpen] = useState(false);
  const [clipsOpen, setClipsOpen] = useState(false);
  const [captionModal, setCaptionModal] = useState<{ id: string; caption: string } | null>(null);
  const [videoModal, setVideoModal] = useState<null | {
    id: string | null;
    url: string;
    startText: string;
    endText: string;
    caption: string;
    fullVideo: boolean;
  }>(null);

  const initialTab = ((): SourceTab => {
    if (pathMode === 'prompt' || pathMode === 'manual') return pathMode;
    if (librarySource) return 'library';
    if (enabledTypes?.has?.('pdf')) return 'pdf';
    if (enabledTypes?.has?.('text')) return 'text';
    if (enabledTypes?.has?.('web')) return 'web';
    if (enabledTypes?.has?.('youtube')) return 'youtube';
    return 'pdf';
  })();
  const [activeTab, setActiveTab] = useState<SourceTab>(initialTab);

  const pick = (files: FileList | null) => {
    if (!files?.length || !onFile) return;
    Array.from(files).forEach((f) => onFile(f));
  };
  const takeImageFiles = (list: FileList | File[] | null) => {
    if (!list || !addImagesFromFiles) return;
    const files = Array.from(list).filter(
      (f) => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|heic|heif)$/i.test(f.name),
    );
    if (files.length) {
      addImagesFromFiles(files);
      setImagesOpen(true);
    }
  };

  const imageMedia = (media || []).filter((m: any) => m.kind === 'image');
  const videoMedia = (media || []).filter((m: any) => m.kind === 'video');

  const selectTab = (tab: SourceTab) => {
    setActiveTab(tab);
    if (tab === 'prompt' || tab === 'manual') {
      setPathMode(tab);
      return;
    }
    setPathMode('material');
    if (tab !== 'library' && !enabledTypes.has(tab)) toggleMaterialType(tab);
  };

  const addedSources: { key: string; icon: React.ReactNode; name: string; onRemove: () => void }[] = [];
  for (const p of pdfSources || []) {
    addedSources.push({
      key: p.id,
      icon: <Upload size={13} />,
      name: p.doc?.fileName || p.file?.name || 'PDF',
      onRemove: () => onRemovePdf(p.id),
    });
  }
  for (const t of textSources || []) {
    addedSources.push({
      key: t.id,
      icon: <ClipboardPaste size={13} />,
      name: t.doc.fileName || 'Pasted notes',
      onRemove: () => onRemoveText(t.id),
    });
  }
  for (const w of webSources || []) {
    addedSources.push({
      key: w.id,
      icon: <Link2 size={13} />,
      name: w.doc.fileName || w.url || 'Website',
      onRemove: () => onRemoveWeb(w.id),
    });
  }
  for (const y of ytSources || []) {
    addedSources.push({
      key: y.id,
      icon: <Youtube size={13} />,
      name: y.doc.fileName || y.videoTitle || 'YouTube transcript',
      onRemove: () => onRemoveYoutube(y.id),
    });
  }
  if (librarySource) {
    addedSources.push({
      key: 'library',
      icon: <FileText size={13} />,
      name: librarySource.title,
      onRemove: () => onPickLibrarySource?.(null),
    });
  }

  const field: React.CSSProperties = {
    fontSize: 13,
    border: '1px solid rgba(0,0,0,0.1)',
    background: 'rgba(255,255,255,0.9)',
    outline: 'none',
  };

  const openVideoCreate = () => {
    setVideoModal({ id: null, url: '', startText: '', endText: '', caption: '', fullVideo: true });
    setClipsOpen(true);
  };
  const openVideoEdit = (m: any) => {
    const hasClip = !!(m.startText || m.endText);
    setVideoModal({
      id: m.id,
      url: m.url || '',
      startText: m.startText || '',
      endText: m.endText || '',
      caption: m.caption || '',
      fullVideo: m.fullVideo === true || !hasClip,
    });
    setClipsOpen(true);
  };
  const saveVideoModal = () => {
    if (!videoModal) return;
    const url = videoModal.url.trim();
    const videoId = parseYtId(url);
    if (!videoId) return;
    if (!videoModal.fullVideo) {
      const start = parseTimestamp(videoModal.startText);
      const end = parseTimestamp(videoModal.endText);
      if (start != null && end != null && end <= start) return;
    }
    const patch = {
      url,
      videoId,
      startText: videoModal.fullVideo ? '' : videoModal.startText.trim(),
      endText: videoModal.fullVideo ? '' : videoModal.endText.trim(),
      caption: videoModal.caption.trim(),
      fullVideo: !!videoModal.fullVideo,
    };
    if (videoModal.id) updateMedia(videoModal.id, patch);
    else addVideo(patch);
    setVideoModal(null);
  };
  const videoModalValid = (() => {
    if (!videoModal) return false;
    const id = parseYtId(videoModal.url.trim());
    if (!id) return false;
    if (videoModal.fullVideo) return true;
    const start = parseTimestamp(videoModal.startText);
    const end = parseTimestamp(videoModal.endText);
    if (start != null && end != null && end <= start) return false;
    return true;
  })();

  const tabs: { id: SourceTab; label: string; icon: React.ReactNode; hide?: boolean }[] = [
    ...MATERIAL_SOURCE_MODES.map((m) => ({ id: m.id as SourceTab, label: m.label, icon: m.icon })),
    ...PATH_SOURCE_MODES.map((m) => ({ id: m.id as SourceTab, label: m.label, icon: m.icon, hide: m.id === 'manual' && !showManualWrite })),
    { id: 'library', label: 'From Source Library', icon: <FileText size={15} />, hide: !onPickLibrarySource },
  ];

  const mediaCard = showMedia && pathMode === 'material' && (
    <div
      className="rounded-2xl border flex flex-col min-h-0 h-full overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.92)', borderColor: 'rgba(0,0,0,0.08)', boxShadow: '0 8px 28px -18px rgba(15,23,42,0.28)' }}
    >
      <div className="px-4 pt-4 pb-3 shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#0B1220' }}>Media to include · optional</p>
        <p style={{ fontSize: 12, color: '#6B7280', marginTop: 3, lineHeight: 1.45 }}>
          Optional images and clips placed into the generated tutorial — not learning sources
        </p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Images row */}
        <div style={{ borderBottom: !imagesOnly || imagesOpen ? '1px solid rgba(0,0,0,0.07)' : undefined }}>
          <button
            type="button"
            onClick={() => setImagesOpen((v) => !v)}
            className="w-full flex items-center gap-2.5 px-4 py-3.5"
          >
            <ChevronRight
              size={15}
              style={{
                color: '#9AA3AF', flexShrink: 0,
                transform: imagesOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s',
              }}
            />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: '#0B1220', flex: 1, textAlign: 'left' }}>Images</span>
            <span style={{ fontSize: 13.5, fontWeight: 500, color: '#9AA3AF' }}>{imageMedia.length}</span>
          </button>
          {imagesOpen && (
            <div className="px-4 pb-4">
              <input
                ref={bulkImageRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => { takeImageFiles(e.target.files); e.target.value = ''; }}
              />
              {imageMedia.length === 0 ? (
                <button
                  type="button"
                  onClick={() => bulkImageRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setImgDragOver(true); }}
                  onDragLeave={() => setImgDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setImgDragOver(false); takeImageFiles(e.dataTransfer.files); }}
                  className="w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 py-5"
                  style={{
                    borderColor: imgDragOver ? '#7C3AED' : 'rgba(0,0,0,0.12)',
                    background: imgDragOver ? 'rgba(124,58,237,0.05)' : 'rgba(247,249,251,0.9)',
                  }}
                >
                  <ImageIcon size={16} style={{ color: '#9AA3AF' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Upload images</span>
                  <span style={{ fontSize: 11, color: '#9AA3AF' }}>Click a thumbnail to add a caption</span>
                </button>
              ) : (
                <div
                  className="flex flex-wrap gap-2"
                  onDragOver={(e) => { e.preventDefault(); setImgDragOver(true); }}
                  onDragLeave={() => setImgDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setImgDragOver(false); takeImageFiles(e.dataTransfer.files); }}
                >
                  {imageMedia.map((m: any) => (
                    <div key={m.id} className="relative" style={{ width: 72, height: 72 }}>
                      <button
                        type="button"
                        onClick={() => setCaptionModal({ id: m.id, caption: m.caption || '' })}
                        className="relative rounded-xl overflow-hidden w-full h-full"
                        style={{
                          background: '#F3F4F6',
                          border: m.caption ? '2px solid #7C3AED' : '1.5px solid rgba(0,0,0,0.1)',
                        }}
                        title={m.caption ? `Caption: ${m.caption}` : 'Add caption'}
                      >
                        {m.uploading ? (
                          <div className="w-full h-full flex items-center justify-center" style={{ color: '#7C3AED' }}>
                            <Loader2 size={16} className="animate-spin" />
                          </div>
                        ) : m.url ? (
                          <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center" style={{ fontSize: 10, fontWeight: 600, color: '#9AA3AF' }}>No image</div>
                        )}
                        {m.caption ? (
                          <span className="absolute bottom-0 inset-x-0 px-1 py-0.5 truncate" style={{ fontSize: 9, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.55)' }}>
                            {m.caption}
                          </span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeMedia(m.id); }}
                        title="Remove image"
                        aria-label="Remove image"
                        className="absolute flex items-center justify-center rounded-full"
                        style={{
                          top: -6, right: -6, width: 20, height: 20, zIndex: 2,
                          background: '#0B1220', color: '#fff',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                        }}
                      >
                        <X size={11} strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => bulkImageRef.current?.click()}
                    className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-0.5"
                    style={{ width: 72, height: 72, borderColor: 'rgba(0,0,0,0.14)', color: '#6B7280' }}
                  >
                    <Upload size={14} />
                    <span style={{ fontSize: 10, fontWeight: 600 }}>Add more</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* YouTube clips row */}
        {!imagesOnly && (
          <div>
            <button
              type="button"
              onClick={() => setClipsOpen((v) => !v)}
              className="w-full flex items-center gap-2.5 px-4 py-3.5"
              style={{ borderBottom: clipsOpen ? '1px solid rgba(0,0,0,0.07)' : undefined }}
            >
              <ChevronRight
                size={15}
                style={{
                  color: '#9AA3AF', flexShrink: 0,
                  transform: clipsOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s',
                }}
              />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: '#0B1220', flex: 1, textAlign: 'left' }}>YouTube clips</span>
              <span style={{ fontSize: 13.5, fontWeight: 500, color: '#9AA3AF' }}>{videoMedia.length}</span>
            </button>
            {clipsOpen && (
              <div className="px-4 pb-4 space-y-2">
                <button
                  type="button"
                  onClick={openVideoCreate}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border"
                  style={{ fontSize: 12, fontWeight: 600, color: '#0B1220', borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.9)' }}
                >
                  <Youtube size={13} style={{ color: '#EF4444' }} />Add YouTube video
                </button>
                {videoMedia.map((m: any) => (
                  <div
                    key={m.id}
                    className="relative rounded-xl border px-3 py-2.5 pr-9"
                    style={{ borderColor: 'rgba(0,0,0,0.08)', background: 'rgba(247,249,251,0.9)' }}
                  >
                    <button type="button" onClick={() => openVideoEdit(m)} className="w-full min-w-0 text-left">
                      <p style={{ fontSize: 12.5, fontWeight: 650, color: '#0B1220' }} className="truncate">
                        {m.caption || m.videoId || 'YouTube clip'}
                      </p>
                      <p style={{ fontSize: 11, color: '#6B7280' }} className="truncate">
                        {m.fullVideo || (!m.startText && !m.endText)
                          ? 'Full video'
                          : [m.startText && `Start ${m.startText}`, m.endText && `End ${m.endText}`].filter(Boolean).join(' · ') || m.url || 'No link yet'}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMedia(m.id)}
                      title="Remove clip"
                      aria-label="Remove clip"
                      className="absolute flex items-center justify-center rounded-full"
                      style={{
                        top: 6, right: 6, width: 22, height: 22,
                        background: '#0B1220', color: '#fff',
                      }}
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col px-5 pt-4 pb-3">
      <div
        className={`flex-1 min-h-0 grid gap-4 items-stretch ${
          showMedia && pathMode === 'material'
            ? 'grid-cols-1 md:grid-cols-[minmax(0,1.55fr)_minmax(260px,340px)]'
            : 'grid-cols-1'
        }`}
      >
        {/* LEFT — Teaching sources */}
        <div className="min-h-0 flex flex-col overflow-hidden">
          <div className="shrink-0 mb-3">
            <p style={{ fontSize: 16, fontWeight: 750, color: '#0B1220' }}>Teaching sources</p>
            <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 2 }}>
              The material Mark up extracts from — add at least one
            </p>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-2 shrink-0 mb-3">
            {tabs.filter((t) => !t.hide).map((t) => {
              const on = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTab(t.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all shrink-0"
                  style={{
                    fontSize: 12.5,
                    fontWeight: on ? 650 : 500,
                    background: on ? '#7C3AED' : 'rgba(255,255,255,0.85)',
                    color: on ? '#fff' : '#374151',
                    borderColor: on ? '#7C3AED' : 'rgba(0,0,0,0.1)',
                  }}
                >
                  {t.icon}{t.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.88)', borderColor: 'rgba(0,0,0,0.07)' }}>
            {activeTab === 'pdf' && (
              <div className="space-y-3">
                <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
                {(pdfSources || []).map((p: PdfSrc) => (
                  <SourceReadyCard key={p.id} doc={p.doc} file={p.file} onReplace={() => onRemovePdf(p.id)} />
                ))}
                <button type="button" onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files); }}
                  className="w-full flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed"
                  style={{ padding: (pdfSources || []).length ? '22px 20px' : '36px 20px', borderColor: dragOver ? '#7C3AED' : 'rgba(0,0,0,0.14)', background: dragOver ? 'rgba(124,58,237,0.05)' : 'rgba(247,249,251,0.9)' }}>
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white" style={{ background: '#7C3AED' }}><Upload size={20} /></div>
                  <p style={{ fontSize: 14, fontWeight: 650, color: '#0B1220' }}>{(pdfSources || []).length ? 'Add another PDF' : 'Drop a PDF here or click to attach'}</p>
                  <p style={{ fontSize: 12, color: '#9AA3AF' }}>PDF only · parsed in Mark up · you can add several</p>
                </button>
              </div>
            )}

            {activeTab === 'text' && (
              <div className="space-y-3">
                {(textSources || []).map((t: TextSrc) => (
                  <SourceReadyCard key={t.id} doc={t.doc} onReplace={() => onRemoveText(t.id)} />
                ))}
                <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={8}
                  placeholder={(textSources || []).length ? 'Paste another source…' : 'Paste your source text here…'}
                  className="w-full rounded-2xl px-3 py-2.5 resize-y" style={{ ...field, lineHeight: 1.6 }} />
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 11.5, color: '#9AA3AF' }}>{pasteText.trim() ? `${pasteText.trim().split(/\s+/).length} words` : 'Notes, an article, a transcript…'}</span>
                  <button type="button" onClick={onLoadText} disabled={!pasteText.trim()}
                    className="px-4 py-2 rounded-full"
                    style={{ fontSize: 12.5, fontWeight: 600, background: pasteText.trim() ? '#0B0F1A' : '#E5E7EB', color: pasteText.trim() ? '#fff' : '#9AA3AF' }}>
                    {(textSources || []).length ? 'Add this text →' : 'Use this text →'}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'web' && (
              <div className="space-y-3">
                <p style={{ fontSize: 12.5, fontWeight: 650, color: '#374151' }}>Paste a public website link</p>
                {(webSources || []).map((w: WebSrc) => (
                  <SourceReadyCard key={w.id} doc={w.doc} onReplace={() => onRemoveWeb(w.id)} />
                ))}
                <div className="flex gap-2">
                  <input value={webUrl || ''} onChange={(e) => setWebUrl(e.target.value)} placeholder="https://example.com/article…"
                    className="flex-1 rounded-xl px-3 py-2.5" style={field}
                    onKeyDown={(e) => { if (e.key === 'Enter' && webUrl?.trim() && !webLoading) onFetchWeb(); }} />
                  <button type="button" onClick={onFetchWeb} disabled={!webUrl?.trim() || webLoading}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white shrink-0"
                    style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 600, opacity: (!webUrl?.trim() || webLoading) ? 0.7 : 1 }}>
                    {webLoading ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={14} />}{webLoading ? 'Fetching…' : ((webSources || []).length ? 'Add site' : 'Fetch')}
                  </button>
                </div>
                <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>Public pages only · you can add more than one site</p>
                {webError && <ErrorNote text={webError} />}
              </div>
            )}

            {activeTab === 'youtube' && (
              <div className="space-y-3">
                {(ytSources || []).map((y: YtSrc) => (
                  <SourceReadyCard key={y.id} doc={y.doc} onReplace={() => onRemoveYoutube(y.id)} />
                ))}
                <div className="flex gap-2">
                  <input value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…"
                    className="flex-1 rounded-xl px-3 py-2.5" style={field}
                    onKeyDown={(e) => { if (e.key === 'Enter' && ytUrl.trim() && !ytLoading) onFetchYoutube(); }} />
                  <button type="button" onClick={onFetchYoutube} disabled={!ytUrl.trim() || ytLoading}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white shrink-0"
                    style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 600, opacity: (!ytUrl.trim() || ytLoading) ? 0.7 : 1 }}>
                    {ytLoading ? <Loader2 size={13} className="animate-spin" /> : <Youtube size={14} />}{ytLoading ? 'Fetching…' : ((ytSources || []).length ? 'Add transcript' : 'Fetch transcript')}
                  </button>
                </div>
                <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>Pulls the transcript for Mark up · add multiple videos if needed</p>
                {ytError && <ErrorNote text={ytError} />}
              </div>
            )}

            {activeTab === 'prompt' && (
              <div>
                <p style={{ fontSize: 13, color: '#4C1D95', lineHeight: 1.55, marginBottom: 10 }}>
                  Describe what the content should teach. We generate markable source text from your prompt.
                </p>
                <textarea
                  value={promptText}
                  onChange={(e) => {
                    setPromptText(e.target.value);
                    if (expandPromptError) setExpandPromptError?.(null);
                  }}
                  rows={8}
                  placeholder={`e.g. 'A beginner ${objectNoun} on how contract bridge bidding works…'`}
                  className="w-full rounded-2xl px-3 py-2.5 resize-y"
                  style={{ ...field, lineHeight: 1.6 }}
                />
                {expandPromptError && (
                  <div className="flex items-start gap-2 mt-3 rounded-2xl p-3" style={{ background: '#FEE2E2', border: '1px solid #FCA5A5' }}>
                    <AlertTriangle size={14} style={{ color: '#B91C1C', marginTop: 1 }} />
                    <p style={{ fontSize: 12.5, color: '#991B1B' }}>{expandPromptError}</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'manual' && (
              <div className="rounded-2xl p-4 border" style={{ background: 'rgba(124,58,237,0.05)', borderColor: 'rgba(124,58,237,0.2)' }}>
                <p style={{ fontSize: 13.5, fontWeight: 650, color: '#0B1220', marginBottom: 6 }}>Hand-write from a template</p>
                <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.55 }}>
                  Next we open a blank {objectNoun} shaped like the Template Library default — nothing is generated. Change the default in Template Library anytime.
                </p>
              </div>
            )}

            {activeTab === 'library' && onPickLibrarySource && (
              <div>
                {librarySource ? (
                  <div className="rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.9)', borderColor: 'rgba(124,58,237,0.25)' }}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: '#7C3AED' }}>
                        <FileText size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p style={{ fontSize: 13.5, fontWeight: 650, color: '#0B1220' }} className="truncate">{librarySource.title}</p>
                        <p style={{ fontSize: 12, color: '#6B7280' }}>From Source Library · {librarySource.kind}</p>
                      </div>
                      <button type="button" onClick={() => onPickLibrarySource(null)} className="px-3 py-1.5 rounded-full border text-xs" style={{ color: '#374151', borderColor: 'rgba(0,0,0,0.1)' }}>
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-start gap-3">
                    <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>
                      Pull an existing source from your library into this {objectNoun}.
                    </p>
                    <PullFromLibraryButton onPick={(src) => onPickLibrarySource(src)} />
                  </div>
                )}
              </div>
            )}

            {/* Added sources */}
            {addedSources.length > 0 && (
              <div className="mt-5 pt-4" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: 12.5, fontWeight: 650, color: '#374151', marginBottom: 8 }}>Added sources</p>
                <div className="space-y-1.5">
                  {addedSources.map((s) => (
                    <div
                      key={s.key}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl border"
                      style={{ background: 'rgba(247,249,251,0.95)', borderColor: 'rgba(0,0,0,0.07)' }}
                    >
                      <span style={{ color: '#6B7280' }}>{s.icon}</span>
                      <span className="flex-1 min-w-0 truncate" style={{ fontSize: 12.5, fontWeight: 600, color: '#0B1220' }}>{s.name}</span>
                      <span className="px-2 py-0.5 rounded-full shrink-0" style={{ fontSize: 10.5, fontWeight: 650, color: '#059669', background: 'rgba(5,150,105,0.1)' }}>✓ ready</span>
                      <button type="button" onClick={s.onRemove} className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center" style={{ color: '#9AA3AF' }} title="Remove">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Media (side panel beside Teaching sources) */}
        {mediaCard && (
          <div className="min-h-0 md:h-full flex flex-col">
            {mediaCard}
          </div>
        )}
      </div>

      {/* Caption modal */}
      {captionModal && (() => {
        const img = imageMedia.find((m: any) => m.id === captionModal.id);
        if (!img) return null;
        return (
          <SourcesModal
            title="Image caption"
            onClose={() => setCaptionModal(null)}
            onSave={() => {
              updateMedia(captionModal.id, { caption: captionModal.caption.trim() });
              setCaptionModal(null);
            }}
          >
            {img.url ? (
              <div className="rounded-xl overflow-hidden mb-3 border" style={{ borderColor: 'rgba(0,0,0,0.08)', background: '#F3F4F6' }}>
                <img src={img.url} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', display: 'block' }} />
              </div>
            ) : null}
            <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }} className="truncate">
              {img.fileName || 'Selected image'}
            </p>
            <label style={{ fontSize: 11.5, fontWeight: 650, color: '#6B7280', display: 'block', marginBottom: 4 }}>Caption</label>
            <input
              autoFocus
              value={captionModal.caption}
              onChange={(e) => setCaptionModal({ ...captionModal, caption: e.target.value })}
              placeholder={imagesOnly
                ? 'Optional caption hint for vision'
                : 'Caption shown under this image in the tutorial'}
              className="w-full rounded-xl px-3 py-2.5"
              style={field}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  updateMedia(captionModal.id, { caption: captionModal.caption.trim() });
                  setCaptionModal(null);
                }
              }}
            />
            <button
              type="button"
              onClick={() => { removeMedia(captionModal.id); setCaptionModal(null); }}
              className="mt-3 text-xs font-semibold"
              style={{ color: '#B91C1C' }}
            >
              Remove image
            </button>
          </SourcesModal>
        );
      })()}

      {/* YouTube clip modal */}
      {videoModal && (
        <SourcesModal
          title={videoModal.id ? 'Edit YouTube video' : 'Add YouTube video'}
          onClose={() => setVideoModal(null)}
          onSave={saveVideoModal}
          saveDisabled={!videoModalValid}
        >
          <label style={{ fontSize: 11.5, fontWeight: 650, color: '#6B7280', display: 'block', marginBottom: 4 }}>YouTube link</label>
          <input
            autoFocus
            value={videoModal.url}
            onChange={(e) => setVideoModal({ ...videoModal, url: e.target.value })}
            placeholder="Paste a YouTube link"
            className="w-full rounded-xl px-3 py-2.5 mb-1"
            style={field}
          />
          {videoModal.url.trim() && !parseYtId(videoModal.url.trim()) && (
            <p style={{ fontSize: 12, color: '#DC2626', marginBottom: 8 }}>Paste a full YouTube link (or 11-character video id) to enable Save.</p>
          )}
          {!videoModal.url.trim() && (
            <p style={{ fontSize: 12, color: '#9AA3AF', marginBottom: 8 }}>Save unlocks once a valid YouTube link is pasted.</p>
          )}
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setVideoModal({ ...videoModal, fullVideo: true, startText: '', endText: '' })}
              className="flex-1 px-3 py-2 rounded-xl border"
              style={{
                fontSize: 12.5, fontWeight: 650,
                background: videoModal.fullVideo ? '#7C3AED' : 'rgba(255,255,255,0.9)',
                color: videoModal.fullVideo ? '#fff' : '#374151',
                borderColor: videoModal.fullVideo ? '#7C3AED' : 'rgba(0,0,0,0.1)',
              }}
            >
              Full video
            </button>
            <button
              type="button"
              onClick={() => setVideoModal({ ...videoModal, fullVideo: false })}
              className="flex-1 px-3 py-2 rounded-xl border"
              style={{
                fontSize: 12.5, fontWeight: 650,
                background: !videoModal.fullVideo ? '#7C3AED' : 'rgba(255,255,255,0.9)',
                color: !videoModal.fullVideo ? '#fff' : '#374151',
                borderColor: !videoModal.fullVideo ? '#7C3AED' : 'rgba(0,0,0,0.1)',
              }}
            >
              Clip
            </button>
          </div>
          {!videoModal.fullVideo && (
            <>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 650, color: '#6B7280', display: 'block', marginBottom: 4 }}>Start (m:ss)</label>
                  <input
                    value={videoModal.startText}
                    onChange={(e) => setVideoModal({ ...videoModal, startText: e.target.value, fullVideo: false })}
                    placeholder="0:00"
                    className="w-full rounded-xl px-3 py-2.5"
                    style={field}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 650, color: '#6B7280', display: 'block', marginBottom: 4 }}>End (m:ss)</label>
                  <input
                    value={videoModal.endText}
                    onChange={(e) => setVideoModal({ ...videoModal, endText: e.target.value, fullVideo: false })}
                    placeholder="e.g. 2:30"
                    className="w-full rounded-xl px-3 py-2.5"
                    style={field}
                  />
                </div>
              </div>
              {(() => {
                const start = parseTimestamp(videoModal.startText);
                const end = parseTimestamp(videoModal.endText);
                if (start != null && end != null && end <= start) {
                  return <p style={{ fontSize: 12, color: '#DC2626', marginBottom: 8 }}>End time must be after the start time.</p>;
                }
                return null;
              })()}
            </>
          )}
          {videoModal.fullVideo && (
            <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>The whole video will be embedded — no start/end trim.</p>
          )}
          <label style={{ fontSize: 11.5, fontWeight: 650, color: '#6B7280', display: 'block', marginBottom: 4 }}>Caption</label>
          <input
            value={videoModal.caption}
            onChange={(e) => setVideoModal({ ...videoModal, caption: e.target.value })}
            placeholder="Caption for this video in the tutorial"
            className="w-full rounded-xl px-3 py-2.5"
            style={field}
          />
        </SourcesModal>
      )}

    </div>
  );
}


function S1({ selected, setSelected }: { selected: string[]; setSelected: React.Dispatch<React.SetStateAction<string[]>> }) {
  return (
    <div className="p-5 max-w-2xl">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <PullFromLibraryButton
          onPick={(src) => {
            setSelected((p) => (p.includes(src.id) ? p : [...p, src.id]));
          }}
        />
        <span style={{ fontSize: 12.5, color: '#9AA3AF' }}>
          Or pick from your library — same Sources tab collections.
        </span>
      </div>
      <div className="h-[min(60vh,560px)] rounded-2xl overflow-hidden border" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
        <SourceLibrary
          heading="Choose your source(s)"
          subheading="Select sources for this content, or pull one in with From Source Library above."
          selectedIds={selected}
          onToggleSelect={(id) => setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))}
        />
      </div>
    </div>
  );
}

function S2(props: any) {
  return <MarkupWorkspace {...props} />;
}

function S3({ extracts, setExtracts, markHighlights, docTitle, typeNoun }: any) {
  const pullable: any[] = (markHighlights || []).filter((h: any) => h.tag === 'Use' || h.tag === 'Support');
  const hlCount = pullable.length;

  const KIND_FOR: Record<string, string> = { Use: 'Key point', Support: 'Fact' };

  const pull = () => {
    const existing = new Set(extracts.filter((e: any) => e.fromHl).map((e: any) => e.text));
    const newItems = pullable
      .filter((h: any) => !existing.has(h.text))
      .map((h: any, i: number) => ({
        id: Date.now() + i,
        kind: KIND_FOR[h.tag] || 'Key point',
        from: h.page ? `${docTitle} · p. ${h.page}` : docTitle,
        fromHl: true,
        text: h.text,
        authorNote: String(h.comment || '').trim() || undefined,
      }));
    setExtracts((p: any[]) => [...p, ...newItems]);
  };

  return (
    <div className="p-5 max-w-2xl">
      <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.08)' }}>
        <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
          <strong>Extraction distills your marked-up sources into the exact content units this content is built from.</strong>{' '}
          You turn what you highlighted into a short list of discrete, editable pieces. Nothing is guessed from the raw pile; it comes from your markup.
        </p>
      </div>
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.7)', borderColor: 'rgba(0,0,0,0.08)' }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220' }}>{hlCount} highlight{hlCount !== 1 ? 's' : ''} carried from Mark up</p>
            <p style={{ fontSize: 12, color: '#6B7280' }}>{hlCount > 0 ? 'Converts your Use/Support marks 1:1 into content units' : 'Go back to Mark up and tag sentences as Use or Support to pull them here'}</p>
          </div>
          <button onClick={pull} disabled={hlCount === 0} className="px-4 py-2 rounded-full transition-all" style={{ background: hlCount === 0 ? '#E5E7EB' : '#0B0F1A', color: hlCount === 0 ? '#9AA3AF' : '#fff', fontSize: 12.5, fontWeight: 600 }}>→ Pull into content units</button>
        </div>
        <div className="p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.7)', borderColor: 'rgba(0,0,0,0.08)' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220', marginBottom: 8 }}>Shape with AI</p>
          <div className="flex gap-2">
            <input placeholder="e.g. one definition + one example, short" className="flex-1 rounded-xl px-3 py-2"
              style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' }} />
            <button className="px-4 py-2 rounded-xl text-white" style={{ background: '#0B0F1A', fontSize: 13 }}>Extract</button>
          </div>
        </div>
        <button onClick={() => setExtracts((p: any[]) => [...p, { id: Date.now(), kind: 'Key point', from: '', fromHl: false, text: '' }])}
          className="flex items-center gap-2 w-full px-4 py-3 rounded-2xl border border-dashed"
          style={{ fontSize: 13, color: '#6B7280', borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.5)' }}>
          <Plus size={14} />Write one yourself → + Add manually
        </button>
      </div>

      {extracts.length === 0
        ? <p style={{ fontSize: 13, color: '#9AA3AF' }}>No content units yet. <strong>Pull from your highlights</strong> above (the usual path), shape some with AI, or add one by hand.</p>
        : (
          <div>
            <p style={{ fontSize: 11.5, fontWeight: 700, color: '#6B7280', letterSpacing: '.06em', marginBottom: 8 }}>EXTRACTED CONTENT UNITS</p>
            {extracts.map((e: any, i: number) => (
              <div key={e.id} className="mb-3 p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.85)', borderColor: 'rgba(0,0,0,0.08)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span style={{ fontSize: 11, color: '#9AA3AF', fontFamily: 'monospace' }}>#{i + 1}</span>
                  <select value={e.kind} onChange={ev => setExtracts((p: any[]) => p.map((x: any) => x.id === e.id ? { ...x, kind: ev.target.value } : x))}
                    className="rounded-lg px-2 py-1" style={{ fontSize: 12, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' }}>
                    {KINDS.map(k => <option key={k}>{k}</option>)}
                  </select>
                  {e.fromHl && <span className="px-2 py-0.5 rounded text-xs" style={{ background: '#FEF3C7', color: '#92400E' }}>✎ from highlight</span>}
                  <button onClick={() => setExtracts((p: any[]) => p.filter((x: any) => x.id !== e.id))} className="ml-auto">
                    <Trash2 size={13} style={{ color: '#EF4444' }} />
                  </button>
                </div>
                <input value={e.from} onChange={ev => setExtracts((p: any[]) => p.map((x: any) => x.id === e.id ? { ...x, from: ev.target.value } : x))}
                  placeholder="from which source…" className="w-full rounded-lg px-2 py-1 mb-2"
                  style={{ fontSize: 12, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' }} />
                <textarea value={e.text} onChange={ev => setExtracts((p: any[]) => p.map((x: any) => x.id === e.id ? { ...x, text: ev.target.value } : x))}
                  rows={2} placeholder="Passage…" className="w-full rounded-lg px-2 py-1 resize-none"
                  style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' }} />
                <textarea
                  value={e.authorNote || ''}
                  onChange={ev => setExtracts((p: any[]) => p.map((x: any) => x.id === e.id ? { ...x, authorNote: ev.target.value } : x))}
                  rows={2}
                  placeholder="Author directive for generation (followed word-for-word)…"
                  className="w-full rounded-lg px-2 py-1 resize-none mt-2"
                  style={{
                    fontSize: 12,
                    border: e.authorNote ? '1px solid rgba(124,58,237,0.35)' : '1px solid rgba(0,0,0,0.08)',
                    background: e.authorNote ? 'rgba(243,232,255,0.45)' : 'rgba(255,255,255,0.8)',
                    outline: 'none',
                    color: '#4C1D95',
                  }}
                />
              </div>
            ))}
            <p style={{ fontSize: 12, color: '#6B7280' }}>These {extracts.length} units become the raw material the {typeNoun} is generated from. Author directives are followed word-for-word for their passages.</p>
          </div>
        )}
    </div>
  );
}

function ConceptCategoryEditor({
  categories,
  onChange,
}: {
  categories: ConceptCategoryDef[];
  onChange: (next: ConceptCategoryDef[]) => void;
}) {
  const [newLabel, setNewLabel] = useState('');
  const cats = categories.length ? categories : DEFAULT_CONCEPT_CATEGORIES.map((c) => ({ ...c }));
  const enabledCount = cats.filter((c) => c.enabled).length;

  const update = (id: string, patch: Partial<ConceptCategoryDef>) => {
    onChange(cats.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const remove = (id: string) => {
    const target = cats.find((c) => c.id === id);
    if (!target) return;
    if (target.builtin) {
      update(id, { enabled: false });
      return;
    }
    onChange(cats.filter((c) => c.id !== id));
  };
  const addCustom = () => {
    const label = newLabel.trim();
    if (!label) return;
    onChange([
      ...cats,
      {
        id: slugCategoryId(label),
        label,
        enabled: true,
        builtin: false,
        tone: 'blue',
      },
    ]);
    setNewLabel('');
  };

  return (
    <div className="mt-2">
      <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 10, lineHeight: 1.45 }}>
        {enabledCount} categor{enabledCount === 1 ? 'y' : 'ies'} on · click to toggle · edit the name · add your own below
      </p>
      <div className="space-y-2">
        {cats.map((cat) => (
          <div
            key={cat.id}
            className="flex items-center gap-2 rounded-xl border px-2.5 py-2"
            style={{
              borderColor: cat.enabled ? 'rgba(11,15,26,0.18)' : 'rgba(0,0,0,0.08)',
              background: cat.enabled ? 'rgba(255,255,255,0.95)' : 'rgba(249,250,251,0.8)',
              opacity: cat.enabled ? 1 : 0.72,
            }}
          >
            <button
              type="button"
              onClick={() => update(cat.id, { enabled: !cat.enabled })}
              className="w-5 h-5 rounded border flex items-center justify-center shrink-0"
              style={{
                borderColor: cat.enabled ? '#0B0F1A' : '#D1D5DB',
                background: cat.enabled ? '#0B0F1A' : '#fff',
              }}
              title={cat.enabled ? 'On the sheet' : 'Off the sheet'}
            >
              {cat.enabled && <Check size={11} color="#fff" strokeWidth={3} />}
            </button>
            <input
              value={cat.label}
              onChange={(e) => update(cat.id, { label: e.target.value })}
              className="flex-1 min-w-0 rounded-lg px-2 py-1 outline-none"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#0B1220',
                border: '1px solid transparent',
                background: 'transparent',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'; e.currentTarget.style.background = '#fff'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
            />
            {!cat.builtin && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0" style={{ background: '#EFF6FF', color: '#2563EB' }}>
                custom
              </span>
            )}
            <button
              type="button"
              onClick={() => remove(cat.id)}
              className="p-1 shrink-0"
              title={cat.builtin ? 'Turn off' : 'Remove'}
            >
              <Trash2 size={13} style={{ color: '#EF4444' }} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addCustom(); }}
          placeholder="Add a category… e.g. Real-world tip"
          className="flex-1 rounded-xl px-3 py-2 outline-none"
          style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.9)' }}
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!newLabel.trim()}
          className="flex items-center gap-1 px-3 py-2 rounded-xl text-white shrink-0"
          style={{ fontSize: 12.5, fontWeight: 600, background: '#0B0F1A', opacity: newLabel.trim() ? 1 : 0.5 }}
        >
          <Plus size={13} />Add
        </button>
      </div>
    </div>
  );
}

function formatLockedKnob(f: FDef, val: any): string {
  const v = val ?? f.default;
  if (f.type === 'bool') return v ? 'On' : 'Off';
  if (f.type === 'num') return String(v ?? 0);
  return String(v ?? '—');
}

function S4({
  typeId, title, setTitle, scope, setScope, fv, setF, srcCount, extCount, hlCount,
  intentSuggestions, suggestingIntents, suggestIntentError, onSuggestIntents,
  clusterCount, writeMyself,
  tutorialDefinition, emptySectionCount, unassignedUnitCount, onEditPlan,
}: any) {
  const groups = CFG[typeId] || [];
  const tutorialTemplate = typeId === 'tutorial'
    ? getTutorialTemplate(fv.templateId || getDefaultTemplateId('tutorial'))
    : null;
  const objectTemplate = typeId !== 'tutorial'
    ? getObjectTemplate(fv.templateId || getDefaultTemplateId(typeId as TemplateObjectType), typeId as TemplateObjectType)
    : null;
  const activeTemplateName = tutorialTemplate?.name || objectTemplate?.name || null;
  const structureLocked = tutorialTemplate ? isTutorialStructureLocked(tutorialTemplate) : false;
  const blueprint = (() => {
    const chips: string[] = [];
    groups.forEach((g: GDef) => g.fields.forEach((f: FDef) => {
      if (f.type === 'num') {
        const v = fv[f.id] ?? f.default;
        if (v > 0) chips.push(`${v} ${f.label.toLowerCase()}`);
      }
    }));
    const tpl = typeId === 'tutorial' && fv.templateId ? getTutorialTemplate(fv.templateId).name : null;
    if (writeMyself) {
      return `${tpl || 'Template'} · blank skeleton with your section count and recipe blocks. You write every part — nothing is AI-generated.`;
    }
    if (typeId === 'concept-card') {
      const cats = resolveConceptCategories(fv.categories).filter((c) => c.enabled);
      const names = cats.slice(0, 4).map((c) => c.label).join(', ');
      const more = cats.length > 4 ? ` +${cats.length - 4} more` : '';
      return `Concept card sheet with ${cats.length} categor${cats.length === 1 ? 'y' : 'ies'}${names ? `: ${names}${more}` : ''}. Drawing on ${srcCount} source${srcCount !== 1 ? 's' : ''}${extCount > 0 ? ` · ${extCount} extract${extCount !== 1 ? 's' : ''}` : ''}.`;
    }
    if (typeId === 'assignment') {
      return assignmentDefineSummary(
        {
          obj: fv.obj,
          aud: fv.aud ?? 'High school',
          lvl: fv.lvl ?? 'Intermediate',
          tt: fv.tt ?? 'Short essay',
          del: fv.del ?? 'Written text',
          el: fv.el ?? '~300 words',
          cite: fv.cite !== false,
          req: typeof fv.req === 'number' ? fv.req : 3,
          rubric: typeof fv.rubric === 'number' ? fv.rubric : 3,
        },
        { srcCount, extCount, title },
      );
    }
    if (typeId === 'tutorial' && tutorialDefinition) {
      const secs = (tutorialDefinition.sections || []).filter((s: any) => String(s.title || '').trim());
      const depthBit = fv.dpth ? ` · ${fv.dpth} depth` : '';
      const emptyBit = emptySectionCount > 0
        ? ` · ${emptySectionCount} section${emptySectionCount === 1 ? '' : 's'} have no source units yet`
        : '';
      const unBit = unassignedUnitCount > 0
        ? ` · ${unassignedUnitCount} unit${unassignedUnitCount === 1 ? '' : 's'} still Unassigned`
        : '';
      return `${tpl ? `${tpl} · ` : ''}${secs.length} planned section${secs.length === 1 ? '' : 's'} · ${srcCount} source${srcCount !== 1 ? 's' : ''}${extCount > 0 ? ` · ${extCount} unit${extCount !== 1 ? 's' : ''}` : ''}${depthBit}${emptyBit}${unBit}. Length follows your units + depth — no word target. AI extras Off. Everything editable after generating.`;
    }
    const clusterBit = clusterCount > 0 ? ` · ${clusterCount} cluster${clusterCount !== 1 ? 's' : ''}` : '';
    return `${tpl ? `${tpl} · ` : ''}Drawing on ${srcCount} source${srcCount !== 1 ? 's' : ''}${extCount > 0 ? ` · ${extCount} extract${extCount !== 1 ? 's' : ''}` : ''}${clusterBit}${chips.length > 0 ? ' · ' + chips.slice(0, 3).join(' · ') : ''}. Everything editable after generating. Long drafts paginate in student preview.`;
  })();

  const renderConceptIntent = (f: FDef) => {
    const val = fv[f.id] || '';
    const chips: string[] = Array.isArray(intentSuggestions) ? intentSuggestions : [];
    return (
      <div>
        <input type="text" value={val} onChange={e => setF(f.id, e.target.value)} placeholder={f.hint || 'Type a concept, or pick a suggestion below'}
          className="w-full rounded-xl px-3 py-2"
          style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', outline: 'none' }} />
        <div className="flex items-center gap-2 mt-2 mb-1.5">
          <button type="button" onClick={() => onSuggestIntents?.()} disabled={suggestingIntents || !onSuggestIntents}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all"
            style={{
              fontSize: 12, fontWeight: 600,
              background: suggestingIntents ? 'rgba(254,243,199,0.7)' : 'rgba(254,243,199,0.45)',
              color: '#92400E', borderColor: 'rgba(245,158,11,0.35)',
              opacity: !onSuggestIntents ? 0.5 : 1,
            }}>
            {suggestingIntents ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {suggestingIntents ? 'Reading your markup…' : chips.length ? 'Refresh from markup' : 'Suggest from markup'}
          </button>
          <span style={{ fontSize: 11.5, color: '#9AA3AF' }}>or type your own</span>
        </div>
        {suggestIntentError && (
          <p className="flex items-start gap-1.5 mb-1.5" style={{ fontSize: 12, color: '#B91C1C' }}>
            <AlertTriangle size={12} style={{ marginTop: 2 }} />{suggestIntentError}
          </p>
        )}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {chips.map((c) => {
              const on = val === c;
              return (
                <button key={c} type="button" onClick={() => setF(f.id, c)}
                  className="px-3 py-1.5 rounded-full border transition-all text-left"
                  style={{
                    fontSize: 12.5, fontWeight: on ? 650 : 500,
                    background: on ? '#0B0F1A' : 'rgba(255,255,255,0.9)',
                    color: on ? '#fff' : '#374151',
                    borderColor: on ? '#0B0F1A' : 'rgba(0,0,0,0.1)',
                  }}>
                  {c}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-5 max-w-2xl">
      <div className="mb-4">
        <p style={{ fontSize: 11.5, fontWeight: 700, color: '#6B7280', letterSpacing: '.06em', marginBottom: 5 }}>TITLE</p>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={`e.g. ${fmtType(typeId)} on bidding basics`}
          className="w-full rounded-2xl px-4 py-3"
          style={{ fontSize: 15, fontWeight: 600, color: '#0B1220', border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.85)', outline: 'none' }} />
      </div>
      <div className="mb-4">
        <p style={{ fontSize: 11.5, fontWeight: 700, color: '#6B7280', letterSpacing: '.06em', marginBottom: 5 }}>VISIBILITY WHEN CREATED</p>
        <div className="flex flex-wrap gap-2">
          {SCOPES.map(s => (
            <button key={s.id} onClick={() => setScope(s.id)}
              className="px-3 py-1.5 rounded-full border transition-all"
              style={{ fontSize: 12, fontWeight: scope === s.id ? 650 : 400, background: scope === s.id ? '#0B0F1A' : 'rgba(255,255,255,0.8)', color: scope === s.id ? '#fff' : '#374151', borderColor: scope === s.id ? '#0B0F1A' : 'rgba(0,0,0,0.1)' }}>
              {s.label} <span style={{ opacity: 0.7, fontSize: 10.5 }}>— {s.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {typeId === 'tutorial' && tutorialDefinition ? (
        <>
          <div className="mb-4 p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.7)', borderColor: 'rgba(0,0,0,0.08)' }}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#0B1220' }}>Plan (set earlier)</p>
                <p style={{ fontSize: 12, color: '#9AA3AF', marginTop: 2 }}>Objective and sections drive Mark up, Extract, and Generate.</p>
              </div>
              {onEditPlan && (
                <button type="button" onClick={onEditPlan} className="flex items-center gap-1 px-3 py-1.5 rounded-full border shrink-0"
                  style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}>
                  <Pencil size={12} /> Edit Plan
                </button>
              )}
            </div>
            {activeTemplateName && (
              <div className="mb-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.18)' }}>
                <p style={{ fontSize: 12, fontWeight: 650, color: '#5B21B6' }}>Template · {activeTemplateName}</p>
                <p style={{ fontSize: 11.5, color: '#6B7280', marginTop: 2 }}>Per-section block shape from Template Library. Outline titles come from Plan.</p>
              </div>
            )}
            <p style={{ fontSize: 12.5, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Learning objective</p>
            <p className="rounded-xl px-3 py-2 mb-3" style={{ fontSize: 13, color: '#0B1220', background: 'rgba(249,250,251,0.95)', border: '1px solid rgba(0,0,0,0.06)', whiteSpace: 'pre-wrap' }}>
              {String(tutorialDefinition.objective || '').trim() || '—'}
            </p>
            <p style={{ fontSize: 12.5, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Sections</p>
            <ol className="space-y-1.5" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {(tutorialDefinition.sections || []).filter((s: any) => String(s.title || '').trim()).map((s: any, i: number) => {
                const pool = tutorialTemplate ? listTemplateRecipeEmbeds(tutorialTemplate) : [];
                const tagged = pool.filter((emb) => isEmbedAttachedToSection(s, emb.id));
                const tagSummary = tagged.length
                  ? tagged.map((emb) => embedTypeLabel(emb.objectType)).join(', ')
                  : (pool.length ? 'no content tagged' : null);
                return (
                  <li key={s.id} className="rounded-lg px-3 py-2" style={{ background: 'rgba(249,250,251,0.95)', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220' }}>{i + 1}. {s.title}</p>
                    {s.intent ? <p style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{s.intent}</p> : null}
                    {tagSummary && (
                      <p style={{ fontSize: 11.5, color: '#9AA3AF', marginTop: 2 }}>
                        Content · {tagSummary}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="mb-4 p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.7)', borderColor: 'rgba(0,0,0,0.08)' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0B1220', marginBottom: 4 }}>Template knobs</p>
            <p style={{ fontSize: 12.5, color: '#6B7280', lineHeight: 1.5 }}>
              {[
                formatLockedKnob({ id: 'secs', type: 'num', label: 'Sections' } as FDef, fv.secs),
                String(fv.dpth || 'Standard') + ' depth',
                `${fv.chks ?? 1} check(s)/section`,
                fv.passOn === false ? 'no pass mark' : `pass ${fv.pass || '70%'}`,
                fv.hintsOn === false ? 'hints Off' : `${fv.hintN ?? 4} hints`,
                'length from units + depth',
                'AI extras Off',
              ].join(' · ')}
            </p>
            <p style={{ fontSize: 11.5, color: '#9AA3AF', marginTop: 6 }}>
              Change structure knobs in Template Library
              {structureLocked ? ' (some knobs locked by template)' : ' — locks are opt-in per knob'}.
            </p>
          </div>
        </>
      ) : (
        groups.map((g: GDef, gi: number) => (
          <div key={gi} className="mb-4 p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.7)', borderColor: 'rgba(0,0,0,0.08)' }}>
            {g.title && <p style={{ fontSize: 13, fontWeight: 700, color: '#0B1220', marginBottom: g.note ? 2 : 10 }}>{g.title}</p>}
            {g.note && <p style={{ fontSize: 12, color: '#9AA3AF', marginBottom: 10 }}>{g.note}</p>}
            {gi === 0 && activeTemplateName && (
              <div
                className="mb-3 rounded-xl px-3 py-2.5"
                style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.18)' }}
              >
                <p style={{ fontSize: 12, fontWeight: 650, color: '#5B21B6' }}>
                  Template · {activeTemplateName}
                </p>
                <p style={{ fontSize: 11.5, color: '#6B7280', marginTop: 2, lineHeight: 1.4 }}>
                  Set in Template Library (default or “Use template”). Not changed here in Define.
                </p>
              </div>
            )}
            {g.fields.map((f: FDef) => {
              // Hide dependent knobs when their parent toggle is off.
              if (f.id === 'pass' && fv.passOn === false) return null;
              if (f.id === 'hintN' && fv.hintsOn === false) return null;
              return (
                <div key={f.id} className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <p style={{ fontSize: 12.5, fontWeight: 500, color: '#374151' }}>{f.label}</p>
                    {f.type === 'bool' && <Field f={f} val={fv[f.id]} set={v => setF(f.id, v)} />}
                  </div>
                  {f.type !== 'bool' ? (
                    typeId === 'concept-card' && f.id === 'concept'
                      ? renderConceptIntent(f)
                      : <Field f={f} val={fv[f.id]} set={v => setF(f.id, v)} />
                  ) : null}
                </div>
              );
            })}
            {typeId === 'concept-card' && g.title === 'Sheet categories' && (
              <ConceptCategoryEditor
                categories={resolveConceptCategories(fv.categories)}
                onChange={(next) => setF('categories', next)}
              />
            )}
          </div>
        ))
      )}

      {(emptySectionCount > 0 || unassignedUnitCount > 0) && typeId === 'tutorial' && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl p-3" style={{ background: '#FEF3C7', border: '1px solid #FCD34D' }}>
          <AlertTriangle size={14} style={{ color: '#B45309', marginTop: 2 }} />
          <div style={{ fontSize: 12.5, color: '#92400E' }}>
            {emptySectionCount > 0 && (
              <p style={{ fontWeight: 650 }}>
                {emptySectionCount} section{emptySectionCount === 1 ? '' : 's'} have no source units yet — generation will note missing markup, not invent content.
              </p>
            )}
            {unassignedUnitCount > 0 && (
              <p style={{ fontWeight: emptySectionCount > 0 ? 500 : 650, marginTop: emptySectionCount > 0 ? 4 : 0 }}>
                {unassignedUnitCount} unit{unassignedUnitCount === 1 ? '' : 's'} still in Unassigned — Move them in Extract before generating.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="p-4 rounded-2xl space-y-3" style={{ background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.2)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#059669', marginBottom: 0 }}>
          {writeMyself ? 'What you will write' : 'What will be generated'}
        </p>
        <p style={{ fontSize: 12.5, color: '#065F46' }}>{blueprint}</p>
        {typeId === 'tutorial' && tutorialDefinition && tutorialTemplate && (() => {
          const genList = listGenerateEmbedsForDefinition(tutorialDefinition, tutorialTemplate);
          const libList = listLibraryEmbedsForDefinition(tutorialDefinition, tutorialTemplate);
          const unresolved = listUnresolvedRequiredEmbeds(tutorialDefinition, tutorialTemplate);
          return (
            <div className="space-y-2.5 pt-1" style={{ borderTop: '1px solid rgba(5,150,105,0.2)' }}>
              <div>
                <p style={{ fontSize: 11.5, fontWeight: 700, color: '#047857', marginBottom: 4 }}>Tutorial prose sections</p>
                <p style={{ fontSize: 12, color: '#065F46' }}>
                  {(tutorialDefinition.sections || []).filter((s: any) => String(s.title || '').trim()).length} planned section
                  {(tutorialDefinition.sections || []).filter((s: any) => String(s.title || '').trim()).length === 1 ? '' : 's'}
                  {' '}from your Plan (teaching parts grounded in assigned units).
                </p>
              </div>
              {genList.length > 0 && (
                <div>
                  <p style={{ fontSize: 11.5, fontWeight: 700, color: '#047857', marginBottom: 4 }}>Embedded contents to generate</p>
                  <ul className="space-y-1" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {genList.map((e) => {
                      const label = embedTypeLabel(e.item.objectType);
                      const obj = e.override?.objective || e.effectiveMeta?.objective || e.sectionIntent || '—';
                      const quizInline = e.item.objectType === 'quiz';
                      return (
                        <li key={e.key} style={{ fontSize: 12, color: '#065F46' }}>
                          {quizInline
                            ? `${label} · “${e.sectionTitle}” · generated inline with the tutorial`
                            : e.item.objectType === 'scenario'
                              ? `${label} · “${e.sectionTitle}” · deferred (placeholder)`
                              : `${label} · “${e.sectionTitle}” · ${obj}`}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {libList.length > 0 && (
                <div>
                  <p style={{ fontSize: 11.5, fontWeight: 700, color: '#047857', marginBottom: 4 }}>From your library (embedded as-is)</p>
                  <ul className="space-y-1" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {libList.map((e) => (
                      <li key={e.key} style={{ fontSize: 12, color: '#065F46' }}>
                        ✓ {embedTypeLabel(e.item.objectType)}: {e.item.libraryTitle || e.item.versionPin?.objectId}
                        {e.item.versionPin?.versionId ? ` · ${e.item.versionPin.versionId}` : ''}
                        {` · “${e.sectionTitle}”`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {unresolved.length > 0 && (
                <p style={{ fontSize: 12, fontWeight: 650, color: '#B45309' }}>
                  Resolve {unresolved.length} required embed{unresolved.length === 1 ? '' : 's'} in Plan before generating.
                </p>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/* ─── Object Editor ───────────────────────────────────────────── */

const DRAFT_PARTS = [
  { id: 'p1', type: 'rich-text', label: 'Introduction', body: 'Bridge is a trick-taking card game played by four players in two partnerships. Each player holds 13 cards, and the goal is to win tricks — rounds of play where each player contributes one card.' },
  { id: 'p2', type: 'concept-card', label: 'Concept', concept: 'High-Card Points (HCP)', plain: 'A way to measure how strong your hand is: Ace = 4, King = 3, Queen = 2, Jack = 1.', misc: 'HCP only counts the top four honors — nines and tens add nothing.' },
  { id: 'p3', type: 'question', label: 'Knowledge check', prompt: 'How many HCP does a King count as?', options: ['1', '2', '3', '4'], correct: 2, exp: 'A King counts as 3 HCP.' },
  { id: 'p4', type: 'rich-text', label: 'Summary', body: 'In this lesson you learned that Bridge uses HCP to evaluate hand strength. The four honors — Ace, King, Queen, Jack — account for all 40 HCP in the deck.' },
];

function ImagePartEditor({ part, onChange, onPickImage, captionHint, hideCaption, hidePreview }: any) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isUploaded = typeof part.url === 'string' && part.url.startsWith('data:');
  return (
    <div>
      {!hidePreview && (
        part.uploading ? (
          <div className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 mb-3" style={{ borderColor: 'rgba(124,58,237,0.3)', color: '#7C3AED' }}>
            <Loader2 size={22} className="animate-spin" />
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Uploading{part.fileName ? ` ${part.fileName}` : ''}…</span>
          </div>
        ) : part.url ? (
          <div className="mb-3 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
            <img src={part.url} alt={part.caption || ''} style={{ width: '100%', display: 'block' }} />
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} className="w-full flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-8 mb-3 transition-colors hover:bg-white/60"
            style={{ borderColor: 'rgba(0,0,0,0.15)', color: '#6B7280' }}>
            <ImageIcon size={22} />
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Click to upload an image</span>
            <span style={{ fontSize: 11, color: '#9AA3AF' }}>PNG, JPG, GIF — or paste a URL below</span>
          </button>
        )
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => onPickImage(e.target.files?.[0])} />
      <div className={`flex items-center gap-2 ${hideCaption ? '' : 'mb-2'}`}>
        <input value={isUploaded ? '' : part.url} onChange={e => onChange({ url: e.target.value, fileName: undefined })}
          placeholder={isUploaded ? `Uploaded: ${part.fileName || 'image'}` : '…or paste an image URL'}
          disabled={isUploaded}
          className="flex-1 rounded-xl px-3 py-2" style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' }} />
        {part.url
          ? <button onClick={() => onChange({ url: '', fileName: undefined })} className="px-2.5 py-2 rounded-xl border text-xs shrink-0" style={{ color: '#6B7280', borderColor: 'rgba(0,0,0,0.1)' }}>Clear</button>
          : <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-white text-xs shrink-0" style={{ background: '#0B0F1A' }}><Upload size={12} />Upload</button>}
      </div>
      {!hideCaption && (
        <input value={part.caption} onChange={e => onChange({ caption: e.target.value })}
          placeholder={captionHint || 'Caption (shown under the image on the tutorial)'}
          className="w-full rounded-xl px-3 py-2" style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' }} />
      )}
    </div>
  );
}

function VideoPartEditor({ part, onChange }: any) {
  const id = part.videoId || parseYtId(part.url || '');
  const start = parseTimestamp(part.startText || '');
  const end = parseTimestamp(part.endText || '');
  const badRange = start != null && end != null && end <= start;
  const params = new URLSearchParams();
  if (start) params.set('start', String(start));
  if (end && !badRange) params.set('end', String(end));
  // Only load the iframe after an explicit play click — mounting it right after
  // Generate can inherit that user gesture and YouTube will start playing on its own.
  const [activated, setActivated] = useState(false);
  useEffect(() => { setActivated(false); }, [id, start, end]);
  const embedSrc = id
    ? `https://www.youtube.com/embed/${id}?${new URLSearchParams({
        ...Object.fromEntries(params),
        autoplay: '1',
        rel: '0',
        modestbranding: '1',
        playsinline: '1',
      }).toString()}`
    : '';
  const thumb = id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
  const field: React.CSSProperties = { fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' };
  const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 3, display: 'block' };
  return (
    <div>
      <input value={part.url} onChange={e => { const v = e.target.value; onChange({ url: v, videoId: parseYtId(v) }); }}
        placeholder="Paste a YouTube link (youtube.com/watch?v=… or youtu.be/…)"
        className="w-full rounded-xl px-3 py-2 mb-2" style={field} />
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1">
          <label style={lbl}>Start (m:ss)</label>
          <input value={part.startText} onChange={e => onChange({ startText: e.target.value })} placeholder="0:00"
            className="w-full rounded-xl px-3 py-2" style={field} />
        </div>
        <div className="flex-1">
          <label style={lbl}>End (m:ss)</label>
          <input value={part.endText} onChange={e => onChange({ endText: e.target.value })} placeholder="e.g. 2:30"
            className="w-full rounded-xl px-3 py-2" style={field} />
        </div>
      </div>
      {badRange && <p style={{ color: '#DC2626', fontSize: 11.5, marginBottom: 6 }}>End time must be after the start time.</p>}
      <input value={part.caption} onChange={e => onChange({ caption: e.target.value })} placeholder="Caption (optional)"
        className="w-full rounded-xl px-3 py-2" style={field} />
      {embedSrc ? (
        <div className="mt-3" style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 14, overflow: 'hidden', background: '#000' }}>
          {activated ? (
            <iframe
              src={embedSrc}
              title="preview"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setActivated(true)}
              aria-label="Play video"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, padding: 0, cursor: 'pointer', background: '#000' }}
            >
              {thumb && (
                <img
                  src={thumb}
                  alt=""
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }}
                />
              )}
              <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 58, height: 58, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Play size={24} fill="#fff" color="#fff" />
              </span>
            </button>
          )}
        </div>
      ) : part.url ? (
        <p style={{ fontSize: 11.5, color: '#DC2626', marginTop: 6 }}>Couldn't read a YouTube video id from that link.</p>
      ) : null}
    </div>
  );
}

function AskAiPanel({ part, onApply, onClose }: any) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const chips: string[] = part.type === 'question'
    ? ['Make it harder', 'Simplify the wording', 'Improve the explanation', 'Rewrite the wrong answers']
    : part.type === 'concept-card'
      ? ['Make it simpler', 'Add a clearer example', 'Tighten the definition', 'Sharpen the misconception']
      : ['Make it simpler', 'Tighten', 'More vivid', 'Match the reading level'];

  const run = async (instruction: string) => {
    const ins = instruction.trim();
    if (!ins || busy) return;
    setBusy(true); setErr(null);
    try {
      const edited = await editTutorialBlock(part, ins);
      const { id: _id, type: _type, ...fields } = edited;
      onApply(fields);
      setText('');
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const field: React.CSSProperties = { fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' };
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {chips.map(q => (
          <button key={q} disabled={busy} onClick={() => run(q)} className="px-2.5 py-1 rounded-full border text-xs transition-all"
            style={{ background: '#FEF3C7', borderColor: '#FCD34D', color: '#92400E', opacity: busy ? 0.55 : 1 }}>{q}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)} disabled={busy}
          onKeyDown={e => { if (e.key === 'Enter') run(text); }}
          placeholder="Tell the AI how to change this block…" className="flex-1 rounded-xl px-3 py-2" style={field} />
        <button onClick={() => run(text)} disabled={busy || !text.trim()} className="px-3 py-2 rounded-xl text-white flex items-center"
          style={{ background: '#0B0F1A', opacity: busy || !text.trim() ? 0.6 : 1 }}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        </button>
      </div>
      {busy && <p style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 6 }}>Rewriting this block with AI…</p>}
      {err && <p style={{ fontSize: 11.5, color: '#DC2626', marginTop: 6 }}>{err}</p>}
    </div>
  );
}

function EditPanel({ part, onChange, onClose }: any) {
  const field: React.CSSProperties = { fontSize: 13, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.85)', outline: 'none' };
  const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 3, display: 'block' };
  const setOption = (i: number, val: string) =>
    onChange({ options: (part.options || ['', '', '', '']).map((o: string, idx: number) => (idx === i ? val : o)) });
  return (
    <div className="space-y-2.5">
      <div>
        <label style={lbl}>Label</label>
        <input value={part.label || ''} onChange={e => onChange({ label: e.target.value })}
          className="w-full rounded-xl px-3 py-2" style={field} />
      </div>

      {part.type === 'rich-text' && (
        <>
          <div>
            <label style={lbl}>Heading</label>
            <input value={part.heading || ''} onChange={e => onChange({ heading: e.target.value })}
              placeholder="Section title…" className="w-full rounded-xl px-3 py-2" style={field} />
          </div>
          <div>
            <label style={lbl}>Subheads (comma-separated)</label>
            <input
              value={Array.isArray(part.subheads) ? part.subheads.join(', ') : ''}
              onChange={e => onChange({
                subheads: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean),
              })}
              placeholder="optional subheads…"
              className="w-full rounded-xl px-3 py-2" style={field} />
          </div>
          <div>
            <label style={lbl}>Body</label>
            <RichTextEditor
              value={part.body || ''}
              onChange={(body) => onChange({ body })}
              placeholder="Write this section…"
              minHeight={140}
            />
          </div>
        </>
      )}

      {part.type === 'concept-card' && (
        <>
          <div>
            <label style={lbl}>Concept</label>
            <input value={part.concept || ''} onChange={e => onChange({ concept: e.target.value })}
              className="w-full rounded-xl px-3 py-2" style={field} />
          </div>
          <div>
            <label style={lbl}>Plain-language explanation</label>
            <textarea value={part.plain || ''} onChange={e => onChange({ plain: e.target.value })} rows={3}
              className="w-full rounded-xl px-3 py-2 resize-y" style={field} />
          </div>
          <div>
            <label style={lbl}>Common misconception</label>
            <input value={part.misc || ''} onChange={e => onChange({ misc: e.target.value })}
              className="w-full rounded-xl px-3 py-2" style={field} />
          </div>
        </>
      )}

      {part.type === 'question' && (
        <>
          <div>
            <label style={lbl}>Question</label>
            <textarea value={part.prompt || ''} onChange={e => onChange({ prompt: e.target.value })} rows={2}
              className="w-full rounded-xl px-3 py-2 resize-y" style={field} />
          </div>
          <div>
            <label style={lbl}>Options · click the circle to mark the correct one</label>
            <div className="space-y-1.5">
              {(part.options || ['', '', '', '']).map((o: string, oi: number) => {
                const isCorrect = oi === (part.correct ?? 0);
                return (
                  <div key={oi} className="flex items-center gap-2">
                    <button type="button" onClick={() => onChange({ correct: oi })}
                      className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                      style={{ borderColor: isCorrect ? '#059669' : '#D1D5DB', background: isCorrect ? 'rgba(5,150,105,0.1)' : 'transparent' }}>
                      {isCorrect && <Check size={11} style={{ color: '#059669' }} />}
                    </button>
                    <input value={o} onChange={e => setOption(oi, e.target.value)} placeholder={`Option ${oi + 1}`}
                      className="flex-1 rounded-xl px-3 py-1.5" style={field} />
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <label style={lbl}>Explanation</label>
            <textarea value={part.exp || ''} onChange={e => onChange({ exp: e.target.value })} rows={2}
              className="w-full rounded-xl px-3 py-2 resize-y" style={field} />
          </div>
          {Array.isArray(part.hints) && part.hints.length > 0 && (
            <div>
              <label style={lbl}>Progressive hints (shown after wrong answers)</label>
              <div className="space-y-1.5">
                {part.hints.map((h: string, hi: number) => (
                  <input
                    key={hi}
                    value={h}
                    onChange={(e) => {
                      const next = [...part.hints];
                      next[hi] = e.target.value;
                      onChange({ hints: next });
                    }}
                    placeholder={`Hint ${hi + 1}`}
                    className="w-full rounded-xl px-3 py-1.5"
                    style={field}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {part.type === 'section-quiz' && (
        <>
          <p style={{ fontSize: 12, color: '#6B7280' }}>
            Embedded section quiz · sourceMode={part.sourceMode || 'generate'}
            {part.required === false ? ' · optional' : ' · required'}
          </p>
          <div>
            <label style={lbl}>Authoring note</label>
            <input
              value={part.authoringNote || ''}
              onChange={(e) => onChange({ authoringNote: e.target.value })}
              className="w-full rounded-xl px-3 py-2"
              style={field}
            />
          </div>
          {(part.questions || []).map((q: any, qi: number) => (
            <div key={qi} className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#9AA3AF' }}>Question {qi + 1}</p>
              <textarea
                value={q.question || ''}
                onChange={(e) => {
                  const questions = (part.questions || []).map((qq: any, i: number) =>
                    (i === qi ? { ...qq, question: e.target.value } : qq));
                  onChange({ questions });
                }}
                rows={2}
                className="w-full rounded-xl px-3 py-2 resize-y"
                style={field}
              />
              <div className="space-y-1.5">
                {(q.options || ['', '', '', '']).map((o: string, oi: number) => {
                  const isCorrect = oi === (q.correct ?? 0);
                  return (
                    <div key={oi} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const questions = (part.questions || []).map((qq: any, i: number) =>
                            (i === qi ? { ...qq, correct: oi } : qq));
                          onChange({ questions });
                        }}
                        className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                        style={{ borderColor: isCorrect ? '#059669' : '#D1D5DB', background: isCorrect ? 'rgba(5,150,105,0.1)' : 'transparent' }}
                      >
                        {isCorrect && <Check size={11} style={{ color: '#059669' }} />}
                      </button>
                      <input
                        value={o}
                        onChange={(e) => {
                          const options = (q.options || ['', '', '', '']).map((oo: string, i: number) =>
                            (i === oi ? e.target.value : oo));
                          const questions = (part.questions || []).map((qq: any, i: number) =>
                            (i === qi ? { ...qq, options } : qq));
                          onChange({ questions });
                        }}
                        className="flex-1 rounded-xl px-3 py-1.5"
                        style={field}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      <button onClick={onClose} className="px-3 py-1.5 rounded-full text-white text-xs font-semibold" style={{ background: '#059669' }}>✓ Done</button>
    </div>
  );
}

function ObjEditor({
  typeId, title, scope, fv, generatedParts, srcCount, extCount, hlCount, initialId, initialStatus, pipelineDraft, onBack, onDone,
  assistantMessages, onAssistantMessagesChange, assistantOpen: assistantOpenProp, onAssistantOpenChange,
}: any) {
  const { addObject, createdObjects } = useApp();
  const [parts, setParts] = useState(
    Array.isArray(generatedParts) && generatedParts.length ? generatedParts : DRAFT_PARTS,
  );
  const [embedPickerOpen, setEmbedPickerOpen] = useState(false);
  const [embedReplaceId, setEmbedReplaceId] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryObjectChoice[]>([]);
  const [libraryStatus, setLibraryStatus] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [editId, setEditId] = useState<string | null>(null);
  const [aiId, setAiId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const displayTitle = title || `${fmtType(typeId)} on Bidding Basics`;
  const briefObjective = (fv?.obj as string)?.trim() || 'After this tutorial, the learner can apply the key ideas from the source.';
  const briefChips: string[] = typeId === 'tutorial'
    ? [fv?.aud || 'High school', fv?.lvl || 'Basic', fv?.prog || 'Linear build-up', fv?.dpth || 'Standard'].filter(Boolean)
    : ['High school', 'Basic', 'Plain & friendly', 'Explain → check'];

  const [docTitle, setDocTitle] = useState<string>(displayTitle);
  const [objective, setObjective] = useState<string>(briefObjective);
  const [savedNote, setSavedNote] = useState(false);
  const [objectStatus, setObjectStatus] = useState<ObjectStatus>(initialStatus || 'draft');
  const savedId = useRef<string | null>(initialId || null);
  const [selection, setSelection] = useState<ObjectSelection>({ kind: 'none' });
  const [localAssistantOpen, setLocalAssistantOpen] = useState(false);
  const assistantOpenControlled = typeof onAssistantOpenChange === 'function';
  const assistantOpen = assistantOpenControlled ? !!assistantOpenProp : localAssistantOpen;
  const setAssistantOpen = (open: boolean) => {
    if (assistantOpenControlled) onAssistantOpenChange(open);
    else setLocalAssistantOpen(open);
  };
  const [undoStack, setUndoStack] = useState<PartSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<PartSnapshot[]>([]);
  const partsRef = useRef(parts);
  const titleRef = useRef(docTitle);
  const objectiveRef = useRef(objective);
  /** Parent passes a new assembleParts() array every render — seed once so Accept/edits stick. */
  const seededFromGen = useRef(false);
  partsRef.current = parts;
  titleRef.current = docTitle;
  objectiveRef.current = objective;

  useEffect(() => {
    if (seededFromGen.current) return;
    if (Array.isArray(generatedParts) && generatedParts.length) {
      setParts(generatedParts);
      seededFromGen.current = true;
    }
  }, [generatedParts]);
  useEffect(() => { if (title) setDocTitle(title); }, [title]);
  useEffect(() => { if (initialId) savedId.current = initialId; }, [initialId]);
  useEffect(() => { if (initialStatus) setObjectStatus(initialStatus); }, [initialStatus]);

  const pushUndo = () => {
    setUndoStack((s) => [...s.slice(-39), snapshotParts(partsRef.current as TutorialEditorPart[], titleRef.current, objectiveRef.current)]);
    setRedoStack([]);
  };

  const selectBlock = (blockId: string) => setSelection({ kind: 'block', blockId });

  const focusPartInEditor = (partId: string) => {
    setMode('edit');
    setEditId(partId);
    selectBlock(partId);
    requestAnimationFrame(() => {
      document.querySelector(`[data-part-id="${CSS.escape(partId)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  /** Field typing — no undo step per keystroke. */
  const updatePart = (id: string, patch: Record<string, any>) => {
    setParts((prev: any[]) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    selectBlock(id);
  };

  /** Assistant Accept + structural manual ops share this path (with undo). */
  const applyEditActions = (actions: EditAction[], _label: string) => {
    pushUndo();
    const result = applyEditActionsToParts(partsRef.current as TutorialEditorPart[], actions, {
      title: titleRef.current,
      objective: objectiveRef.current,
      fv,
    });
    setParts(result.parts);
    if (result.meta?.title != null) setDocTitle(result.meta.title);
    if (result.meta?.objective != null) setObjective(result.meta.objective);
    const focusId = result.affectedIds[result.affectedIds.length - 1];
    if (focusId) {
      // Defer so the new/updated part is in the DOM before scroll.
      setTimeout(() => focusPartInEditor(focusId), 40);
    } else {
      setMode('edit');
    }
  };

  const undo = () => {
    setUndoStack((stack) => {
      if (!stack.length) return stack;
      const prev = stack[stack.length - 1];
      setRedoStack((r) => [...r, snapshotParts(partsRef.current as TutorialEditorPart[], titleRef.current, objectiveRef.current)]);
      setParts(prev.parts);
      setDocTitle(prev.title);
      setObjective(prev.objective);
      return stack.slice(0, -1);
    });
  };

  const redo = () => {
    setRedoStack((stack) => {
      if (!stack.length) return stack;
      const next = stack[stack.length - 1];
      setUndoStack((u) => [...u, snapshotParts(partsRef.current as TutorialEditorPart[], titleRef.current, objectiveRef.current)]);
      setParts(next.parts);
      setDocTitle(next.title);
      setObjective(next.objective);
      return stack.slice(0, -1);
    });
  };

  const addBlock = (type: 'rich-text' | 'concept-card' | 'question') => {
    pushUndo();
    const id = `new-${Date.now()}`;
    const base =
      type === 'rich-text' ? { id, type, label: 'New section', body: '' }
        : type === 'concept-card' ? { id, type, label: 'Concept', concept: '', plain: '', misc: '' }
          : { id, type, label: 'Knowledge check', prompt: '', options: ['', '', '', ''], correct: 0, exp: '' };
    setParts((prev: any[]) => [...prev, base]);
    setAiId(null);
    setEditId(id);
    setMode('edit');
    selectBlock(id);
  };

  const openEmbedPicker = (replaceId?: string | null) => {
    setEmbedReplaceId(replaceId || null);
    setEmbedPickerOpen(true);
  };

  useEffect(() => {
    if (!embedPickerOpen) return;
    let cancelled = false;
    setLibraryStatus('loading');
    void listEmbeddableLibraryObjects({ extraObjects: createdObjects || [] })
      .then((rows) => {
        if (cancelled) return;
        setLibrary(rows);
        setLibraryStatus(rows.length ? 'idle' : 'empty');
      })
      .catch(() => {
        if (cancelled) return;
        setLibrary([]);
        setLibraryStatus('error');
      });
    return () => { cancelled = true; };
  }, [embedPickerOpen, createdObjects]);

  const confirmEmbedFromLibrary = (objectId: string, versionId: string, _title: string) => {
    const obj = findLibraryLearningObject(objectId, createdObjects || []);
    if (!obj) return;
    pushUndo();
    const part = makeLibraryEmbedPart({ object: obj, versionId });
    if (embedReplaceId) {
      setParts((prev: any[]) => prev.map((p) => (p.id === embedReplaceId ? { ...part, id: embedReplaceId } : p)));
      setEditId(embedReplaceId);
      selectBlock(embedReplaceId);
    } else {
      setParts((prev: any[]) => [...prev, part]);
      setEditId(part.id);
      selectBlock(part.id);
    }
    setEmbedPickerOpen(false);
    setEmbedReplaceId(null);
    setMode('edit');
  };

  const assistantContext = buildAssistantContext({
    objectId: savedId.current || `draft-${typeId}`,
    objectType: typeId,
    title: docTitle || displayTitle,
    status: objectStatus,
    scope,
    objective,
    fv,
    parts: parts as TutorialEditorPart[],
    pipelineDraft: pipelineDraft || null,
    selection,
  });

  const hintSettings = resolveHintSettings(fv || {});
  const passSettings = resolvePassSettings(fv || {});
  const tutorialPassMark = passSettings.passMark ?? 70;
  const quizScoreMeta = {
    passRequired: passSettings.passRequired,
    ...(passSettings.passRequired ? { passMark: passSettings.passMark } : {}),
  };

  const buildBlocks = (): Block[] =>
    parts.map((p: any, i: number) => {
      const id = String(p.id || `blk-${i}`);
      if (p.type === 'concept-card')
        return { id, type: 'concept-card', content: { term: p.concept || p.label || '', definition: p.plain || '', example: p.misc || '' } };
      if (p.type === 'question')
        return {
          id,
          type: 'quiz',
          content: {
            ...quizScoreMeta,
            questions: [{
              question: p.prompt || '',
              type: 'multiple-choice',
              options: p.options || [],
              correct: p.correct ?? 0,
              explanation: p.exp || '',
              label: p.label || undefined,
              sources: Array.isArray(p.sources) ? p.sources : undefined,
              hints: ensureHints(p.hints, {
                explanation: p.exp,
                singleHint: p.hint,
                enabled: hintSettings.enabled,
                count: hintSettings.count,
              }),
            }],
          },
        };
      if (p.type === 'section-quiz') {
        const qs = Array.isArray(p.questions) ? p.questions : [];
        return {
          id,
          type: 'quiz',
          content: {
            ...quizScoreMeta,
            embeddedQuiz: true,
            sourceMode: p.sourceMode || 'generate',
            authoringNote: p.authoringNote,
            required: p.required !== false,
            label: p.label || 'Section quiz',
            questions: qs.map((q: any) => ({
              question: q.question || q.prompt || '',
              type: 'multiple-choice',
              options: q.options || [],
              correct: q.correct ?? 0,
              explanation: q.explanation || q.exp || '',
              label: q.label || undefined,
              sources: Array.isArray(q.sources) ? q.sources : undefined,
              hints: ensureHints(q.hints, {
                explanation: q.explanation || q.exp,
                enabled: hintSettings.enabled,
                count: hintSettings.count,
              }),
            })),
          },
        };
      }
      if (p.type === 'image')
        return { id, type: 'image', content: { url: p.url || '', caption: p.caption || '', alt: p.caption || '' } };
      if (p.type === 'video')
        return { id, type: 'video-embed', content: { provider: 'youtube', url: p.url || '', videoId: p.videoId || parseYtId(p.url || ''), start: parseTimestamp(p.startText || ''), end: parseTimestamp(p.endText || ''), caption: p.caption || '' } };
      if (p.type === 'library-embed')
        return libraryEmbedPartToBlock({ ...p, id });
      return {
        id,
        type: 'rich-text',
        content: {
          text: p.body || p.plain || p.label || '',
          heading: p.heading || undefined,
          subheads: Array.isArray(p.subheads) && p.subheads.length ? p.subheads : undefined,
        },
      };
    });

  const onPickImage = async (id: string, file?: File) => {
    if (!file) return;
    if (supabaseEnabled) {
      updatePart(id, { uploading: true, fileName: file.name });
      try {
        const url = await uploadImage(file);
        updatePart(id, { url, uploading: false });
        return;
      } catch (e) {
        console.warn('[supabase] image upload failed, using inline copy:', errorMessage(e));
      }
    }
    const reader = new FileReader();
    reader.onload = () => updatePart(id, { url: String(reader.result), fileName: file.name, uploading: false });
    reader.readAsDataURL(file);
  };

  const save = (status: ObjectStatus) => {
    const keepStatus = objectStatus === 'in-review' && status === 'draft' ? 'in-review' : status;
    const id = addObject({
      id: savedId.current || undefined,
      type: typeId,
      title: (docTitle || displayTitle).trim(),
      status: keepStatus,
      description: objective.trim(),
      estimatedTime: `${Math.max(5, parts.length * 3)} min`,
      blocks: buildBlocks() as any,
      tags: briefChips,
      sourceIds: [],
      pipelineDraft: pipelineDraft || undefined,
    });
    savedId.current = id;
    setObjectStatus(keepStatus);
    return id;
  };

  const handleSaveDraft = () => {
    save('draft');
    setSavedNote(true);
    setTimeout(() => onDone(), 650);
  };

  if (submitted) return (
    <div className="flex flex-col items-center justify-center p-10 text-center min-h-[50vh]">
      <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: '#FEF3C7' }}>
        <Check size={24} style={{ color: '#D97706' }} />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0B1220', marginBottom: 6 }}>Submitted for review</h2>
      <p style={{ fontSize: 13.5, color: '#6B7280', maxWidth: 380, marginBottom: 14 }}>
        "{displayTitle}" has been submitted. A reviewer will provide feedback before it can be published.
      </p>
      <div className="flex gap-2 mb-8">
        <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: '#FEF3C7', color: '#92400E' }}>in review</span>
        <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: '#F3F4F6', color: '#374151' }}>Bridge</span>
      </div>
      <button onClick={onDone} className="px-6 py-2.5 rounded-full text-white" style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600 }}>
        ✓ Done — go to library
      </button>
    </div>
  );

  const previewBlocks = buildBlocks();
  const selectedBlockId = selection.kind === 'block' || selection.kind === 'block_range' ? selection.blockId : null;
  const glossaryEntries = buildGlossary({
    knowledgeBase: pipelineDraft?.knowledgeBase,
    parts: parts as TutorialEditorPart[],
    blocks: previewBlocks,
    highlights: pipelineDraft?.highlights || [],
  });

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      <div className="sticky top-0 z-20 flex flex-col gap-2 px-3 sm:px-5 py-3 border-b border-white/40" style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => {
            save('draft');
            onBack?.(parts);
          }} className="flex items-center gap-1 text-sm font-medium shrink-0" style={{ color: '#6B7280' }}>
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">Back to pipeline</span>
            <span className="sm:hidden">Back</span>
          </button>
          <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto">
            {[fmtType(typeId), scope].map((chip, i) => (
              <span key={i} className="px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0" style={{ background: '#F3F4F6', color: '#374151' }}>{chip}</span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AssistantOpenButton onClick={() => setAssistantOpen(true)} />
          <div className="flex rounded-full border p-0.5" style={{ borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
            <button
              type="button"
              onClick={() => setMode('edit')}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-full"
              style={{ fontSize: 12, fontWeight: 600, background: mode === 'edit' ? '#0B0F1A' : 'transparent', color: mode === 'edit' ? '#fff' : '#6B7280' }}
            >
              <Pencil size={12} />Edit
            </button>
            <button
              type="button"
              onClick={() => { setMode('preview'); setEditId(null); setAiId(null); }}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-full"
              style={{ fontSize: 12, fontWeight: 600, background: mode === 'preview' ? '#0B0F1A' : 'transparent', color: mode === 'preview' ? '#fff' : '#6B7280' }}
            >
              <Eye size={12} />
              <span className="hidden sm:inline">Student preview</span>
              <span className="sm:hidden">Preview</span>
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 max-w-2xl w-full mx-auto">
        {mode === 'preview' ? (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0B1220', marginBottom: 10 }}>{docTitle || displayTitle}</h1>
            <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 22, lineHeight: 1.5 }}>
              Student preview · how learners will see this tutorial · {parts.length} part{parts.length !== 1 ? 's' : ''}
              {glossaryEntries.length > 0 ? ' · open Glossary from the right edge' : ''}
            </p>
            <LearningBlocksPreview
              blocks={previewBlocks}
              objectId={savedId.current || 'tutorial-preview'}
              cumulativePassMark={tutorialPassMark}
              passRequired={passSettings.passRequired}
              maxHints={hintSettings.count}
              hintsEnabled={hintSettings.enabled}
              glossary={glossaryEntries}
              sourceUnits={pipelineDraft?.knowledgeBase?.units}
            />
          </>
        ) : (
          <>
            <input value={docTitle} onChange={e => setDocTitle(e.target.value)} className="w-full mb-4 bg-transparent border-b border-transparent focus:border-gray-200 outline-none transition-all"
              style={{ fontSize: 22, fontWeight: 700, color: '#0B1220' }} />
            <div className="mb-4 p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.7)', borderColor: 'rgba(0,0,0,0.08)' }}>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: '#6B7280', marginBottom: 6 }}>what this was generated to do</p>
              <textarea value={objective} onChange={e => setObjective(e.target.value)}
                rows={2} className="w-full rounded-xl px-3 py-2 resize-none mb-3"
                style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' }} />
              <div className="flex flex-wrap gap-1.5 mb-2">
                {briefChips.map(c => (
                  <span key={c} className="px-2 py-0.5 rounded text-xs" style={{ background: '#F3F4F6', color: '#374151' }}>{c}</span>
                ))}
              </div>
              <p style={{ fontSize: 11, color: '#9AA3AF' }}>Built from {srcCount} source{srcCount !== 1 ? 's' : ''} · {hlCount} marked up · {extCount} extract{extCount !== 1 ? 's' : ''}</p>
            </div>
            <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 10 }}>
              {parts.length} parts. Click a block to focus the assistant. Edits from the assistant require Accept. Use <strong>Student preview</strong> anytime.
            </p>

            {parts.map((p, i) => (
              <div
                key={p.id}
                data-part-id={p.id}
                className="mb-3 rounded-2xl border overflow-hidden"
                onClick={() => selectBlock(p.id)}
                style={{
                  background: 'rgba(255,255,255,0.88)',
                  borderColor: selectedBlockId === p.id ? '#0B0F1A' : 'rgba(0,0,0,0.08)',
                  boxShadow: selectedBlockId === p.id ? '0 0 0 1px #0B0F1A' : undefined,
                }}
              >
                <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.5)' }}>
                  <div className="flex items-center gap-2">
                    {p.type === 'image' ? <ImageIcon size={13} style={{ color: '#6B7280' }} /> : p.type === 'video' ? <Youtube size={13} style={{ color: '#EF4444' }} /> : p.type === 'library-embed' ? <Link2 size={13} style={{ color: '#059669' }} /> : <BookOpen size={13} style={{ color: '#6B7280' }} />}
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium"
                      style={p.type === 'library-embed'
                        ? { background: 'rgba(5,150,105,0.12)', color: '#047857' }
                        : { background: '#F3F4F6', color: '#374151' }}
                    >
                      {p.type === 'library-embed' ? 'EMBEDDED OBJECT' : p.type}
                    </span>
                    {p.type === 'library-embed'
                      ? <span style={{ fontSize: 13, fontWeight: 650, color: '#0B1220' }}>{p.libraryTitle || p.label}</span>
                      : p.type === 'image' || p.type === 'video'
                        ? <span className="px-2 py-0.5 rounded text-xs" style={{ background: '#EFF6FF', color: '#2563EB' }}>added by you</span>
                        : <span className="px-2 py-0.5 rounded text-xs" style={{ background: '#FEF3C7', color: '#92400E' }}>✦ AI-drafted</span>}
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {p.type !== 'image' && p.type !== 'video' && (
                      <>
                        <button onClick={() => { selectBlock(p.id); setAssistantOpen(true); setAiId(null); }} className="flex items-center gap-1 px-2 py-1 rounded text-xs" style={{ color: '#D97706', background: 'transparent' }}><Sparkles size={11} />Ask AI</button>
                        <button onClick={() => { selectBlock(p.id); setEditId(editId === p.id ? null : p.id); }} className="flex items-center gap-1 px-2 py-1 rounded text-xs" style={{ color: '#2563EB', background: editId === p.id ? '#EFF6FF' : 'transparent' }}>✎ Edit</button>
                      </>
                    )}
                    <button onClick={() => { if (i > 0) { pushUndo(); const c = [...parts]; [c[i-1], c[i]] = [c[i], c[i-1]]; setParts(c); } }} disabled={i === 0} className="px-1 text-sm" style={{ color: i === 0 ? '#E5E7EB' : '#6B7280' }}>↑</button>
                    <button onClick={() => { if (i < parts.length-1) { pushUndo(); const c = [...parts]; [c[i], c[i+1]] = [c[i+1], c[i]]; setParts(c); } }} disabled={i === parts.length-1} className="px-1 text-sm" style={{ color: i === parts.length-1 ? '#E5E7EB' : '#6B7280' }}>↓</button>
                    <button onClick={() => { pushUndo(); setParts(prev => prev.filter(x => x.id !== p.id)); }}><Trash2 size={12} style={{ color: '#EF4444' }} /></button>
                  </div>
                </div>
                <div className="p-4">
                  {p.type === 'image' ? (
                    <ImagePartEditor part={p} onChange={patch => updatePart(p.id, patch)} onPickImage={file => onPickImage(p.id, file)} />
                  ) : p.type === 'video' ? (
                    <VideoPartEditor part={p} onChange={patch => updatePart(p.id, patch)} />
                  ) : p.type === 'library-embed' ? (
                    <div style={{ borderLeft: '3px solid #059669', paddingLeft: 12 }}>
                      <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 4 }}>Library content + version pin</p>
                      <div
                        className="rounded-xl px-3.5 py-3 mb-2"
                        style={{ border: '1px solid rgba(0,0,0,0.1)', background: '#fff' }}
                      >
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#0B1220' }}>
                          {p.libraryTitle || p.label || 'Untitled content'}
                        </p>
                        <p style={{ fontSize: 12, color: '#9AA3AF', marginTop: 2 }}>
                          {p.objectType || 'content'}
                          {p.versionPin?.versionId
                            ? ` · pinned ${String(p.versionPin.versionId).includes('__v') ? String(p.versionPin.versionId).split('__').pop() : p.versionPin.versionId}`
                            : ' · no version pinned'}
                          {` · ${(p.snapshotBlocks || []).length} block${(p.snapshotBlocks || []).length !== 1 ? 's' : ''}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openEmbedPicker(p.id); }}
                        className="px-3 py-1.5 rounded-full border mb-2"
                        style={{ fontSize: 12, fontWeight: 600, color: '#059669', borderColor: 'rgba(5,150,105,0.4)', background: 'rgba(5,150,105,0.06)' }}
                      >
                        {p.versionPin?.objectId ? 'Change library content…' : 'Browse Content Library…'}
                      </button>
                      <div>
                        <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 4 }}>Authoring note</p>
                        <input
                          value={p.authoringNote || ''}
                          onChange={(e) => updatePart(p.id, { authoringNote: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Optional note for this embed…"
                          className="w-full rounded-xl px-3 py-2"
                          style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.9)', outline: 'none' }}
                        />
                      </div>
                    </div>
                  ) : editId === p.id ? (
                    <EditPanel part={p} onChange={patch => updatePart(p.id, patch)} onClose={() => setEditId(null)} />
                  ) : (
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220', marginBottom: 4 }}>{p.label}</p>
                      {p.type === 'rich-text' && (
                        <div>
                          {p.heading && (
                            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0B1220', marginBottom: 6, letterSpacing: '-0.3px' }}>{p.heading}</h3>
                          )}
                          {Array.isArray(p.subheads) && p.subheads.length > 0 && (
                            <ul style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 12.5, color: '#6B7280' }}>
                              {p.subheads.map((s: string) => <li key={s}>{s}</li>)}
                            </ul>
                          )}
                          <p style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.65, fontFamily: 'Georgia, serif' }}>{'body' in p ? p.body : ''}</p>
                        </div>
                      )}
                      {p.type === 'concept-card' && (
                        <div>
                          <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0B1220', marginBottom: 3 }}>{'concept' in p ? p.concept : ''}</p>
                          <p style={{ fontSize: 13, color: '#374151', marginBottom: 3 }}>{'plain' in p ? p.plain : ''}</p>
                          <p style={{ fontSize: 12, color: '#DC2626' }}>Misconception: {'misc' in p ? p.misc : ''}</p>
                        </div>
                      )}
                      {p.type === 'question' && (
                        <div>
                          <p style={{ fontSize: 13.5, color: '#0B1220', marginBottom: 6 }}>{'prompt' in p ? p.prompt : ''}</p>
                          {'options' in p && p.options.map((o: string, oi: number) => {
                            const isCorrect = oi === ('correct' in p ? p.correct : -1);
                            return (
                              <p key={oi} className="mb-1 flex items-center gap-2" style={{ fontSize: 13 }}>
                                <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                                  style={{ borderColor: isCorrect ? '#059669' : '#D1D5DB', background: isCorrect ? 'rgba(5,150,105,0.1)' : 'transparent' }}>
                                  {isCorrect && <Check size={11} style={{ color: '#059669' }} />}
                                </span>
                                <span style={{ color: isCorrect ? '#059669' : '#374151' }}>{o}</span>
                              </p>
                            );
                          })}
                        </div>
                      )}
                      {p.type === 'section-quiz' && (
                        <div>
                          <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7C3AED', marginBottom: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                            Section quiz · {p.sourceMode || 'generate'}
                          </p>
                          {p.authoringNote && (
                            <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8, fontStyle: 'italic' }}>{p.authoringNote}</p>
                          )}
                          {(p.questions || []).map((q: any, qi: number) => (
                            <div key={qi} className="mb-3 last:mb-0">
                              <p style={{ fontSize: 13.5, color: '#0B1220', marginBottom: 4 }}>
                                {q.label ? `${q.label}: ` : ''}{q.question || '(empty question)'}
                              </p>
                              {(q.options || []).map((o: string, oi: number) => {
                                const isCorrect = oi === (q.correct ?? -1);
                                return (
                                  <p key={oi} className="mb-1 flex items-center gap-2" style={{ fontSize: 12.5 }}>
                                    <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                                      style={{ borderColor: isCorrect ? '#059669' : '#D1D5DB', background: isCorrect ? 'rgba(5,150,105,0.1)' : 'transparent' }}>
                                      {isCorrect && <Check size={10} style={{ color: '#059669' }} />}
                                    </span>
                                    <span style={{ color: isCorrect ? '#059669' : '#374151' }}>{o}</span>
                                  </p>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div className="rounded-2xl border-2 border-dashed p-3 flex items-center gap-2 flex-wrap" style={{ borderColor: 'rgba(0,0,0,0.12)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>Add block:</span>
              <button onClick={() => addBlock('rich-text')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all hover:bg-white"
                style={{ fontSize: 12, fontWeight: 600, color: '#0B1220', borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.8)' }}>
                <Plus size={12} />Text
              </button>
              <button onClick={() => addBlock('concept-card')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all hover:bg-white"
                style={{ fontSize: 12, fontWeight: 600, color: '#0B1220', borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.8)' }}>
                <Plus size={12} />Concept card
              </button>
              <button onClick={() => addBlock('question')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all hover:bg-white"
                style={{ fontSize: 12, fontWeight: 600, color: '#0B1220', borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.8)' }}>
                <Plus size={12} />Question
              </button>
              {typeId === 'tutorial' && (
                <button
                  type="button"
                  onClick={() => openEmbedPicker(null)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all hover:bg-white"
                  style={{ fontSize: 12, fontWeight: 600, color: '#059669', borderColor: 'rgba(5,150,105,0.35)', background: 'rgba(5,150,105,0.06)' }}
                >
                  <Link2 size={12} />Embed from library
                </button>
              )}
            </div>
          </>
        )}
      </div>
      <div className="sticky bottom-0 flex items-center justify-between px-5 py-3 border-t border-white/40" style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)' }}>
        <button
          type="button"
          onClick={() => {
            if (mode === 'edit') { setMode('preview'); setEditId(null); setAiId(null); }
            else setMode('edit');
          }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full border"
          style={{ fontSize: 12.5, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}
        >
          {mode === 'edit' ? <><Eye size={13} />Student preview</> : <><Pencil size={13} />Back to edit</>}
        </button>
        <span style={{ fontSize: 11.5, color: savedNote ? '#059669' : '#9AA3AF' }}>
          {savedNote ? '✓ Saved to Content Library' : `${parts.length} parts · save to add it to Content Library`}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={handleSaveDraft} className="flex items-center gap-1.5 px-4 py-2 rounded-full border" style={{ fontSize: 12.5, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
            <Save size={13} />✎ Save draft
          </button>
          <button onClick={() => { save('in-review'); setSubmitted(true); }} className="flex items-center gap-1.5 px-5 py-2 rounded-full text-white" style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 600 }}>
            <Send size={13} />➤ Submit for review
          </button>
        </div>
      </div>

      <AssistantPanel
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
        context={assistantContext}
        selection={selection}
        parts={parts as TutorialEditorPart[]}
        onFocusBlock={(blockId) => {
          focusPartInEditor(blockId);
        }}
        onAcceptActions={applyEditActions}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={undo}
        onRedo={redo}
        messages={assistantMessages}
        onMessagesChange={onAssistantMessagesChange}
        phaseLabel="Editor"
      />

      <LibraryPickerModal
        open={embedPickerOpen}
        onClose={() => { setEmbedPickerOpen(false); setEmbedReplaceId(null); }}
        library={library}
        libraryStatus={libraryStatus}
        libraryEmptyCopy="No Content Library items yet. Create a concept card, quiz, or other content in the library first."
        slotObjectType="reused-from-library"
        initialObjectId={
          embedReplaceId
            ? parts.find((x: any) => x.id === embedReplaceId)?.versionPin?.objectId
            : undefined
        }
        initialVersionId={
          embedReplaceId
            ? parts.find((x: any) => x.id === embedReplaceId)?.versionPin?.versionId
            : undefined
        }
        onConfirm={(objectId, versionId, title) => confirmEmbedFromLibrary(objectId, versionId, title)}
      />
    </div>
  );
}

/* ─── generating view (streamed LLM parts) ───────────────────────── */

function GeneratingView({ progress, parts, onCancel, noun = 'tutorial' }: { progress: string; parts: { id: string; type: string; label: string }[]; onCancel: () => void; noun?: string }) {
  const unit = noun === 'flashcards' ? 'CARD' : noun === 'quiz' ? 'QUESTION' : noun === 'concept card' ? 'CARD' : 'PART';
  return (
    <div className="flex flex-col items-center justify-center p-10 text-center min-h-[60vh]">
      <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(124,58,237,0.1)' }}>
        <Loader2 size={26} className="animate-spin" style={{ color: '#7C3AED' }} />
      </div>
      <h2 style={{ fontSize: 19, fontWeight: 700, color: '#0B1220', marginBottom: 4 }}>Generating your {noun}…</h2>
      <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>{progress || 'Working…'}</p>

      {parts.length > 0 && (
        <div className="w-full max-w-md text-left">
          <p style={{ fontSize: 11.5, fontWeight: 700, color: '#6B7280', letterSpacing: '.06em', marginBottom: 8 }}>
            {parts.length} {unit}{parts.length !== 1 ? 'S' : ''} SO FAR
          </p>
          <div className="space-y-1.5 max-h-[38vh] overflow-y-auto">
            {parts.map((p) => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border" style={{ background: 'rgba(255,255,255,0.8)', borderColor: 'rgba(0,0,0,0.08)' }}>
                <Check size={13} style={{ color: '#059669' }} />
                <span className="px-1.5 py-0.5 rounded text-xs shrink-0" style={{ background: '#F3F4F6', color: '#374151' }}>{p.type}</span>
                <span style={{ fontSize: 12.5, color: '#0B1220' }} className="truncate">{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={onCancel} className="mt-6 px-4 py-2 rounded-full border" style={{ fontSize: 12.5, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
        Cancel
      </button>
    </div>
  );
}

/* ─── main component ──────────────────────────────────────────── */

export function ObjectCreator() {
  const {
    navigate, creatorObjectType, editingObjectId, clearEditingObject, createdObjects,
    pendingTemplateId, setPendingTemplateId, addObject,
    objectCollections, createCollectionIds, setActiveObjectCollectionId,
  } = useApp();
  // confirm imported below after other hooks would be ideal; keep near top with useApp
  const confirmDelete = useConfirm();
  const typeId = creatorObjectType || 'lesson';
  const isTutorial = typeId === 'tutorial';
  const isFlashcard = typeId === 'flashcard-set';
  const isQuiz = typeId === 'quiz';
  const isConceptCard = typeId === 'concept-card';
  const isSummary = typeId === 'summary';
  const isReflection = typeId === 'reflection';
  const isAssignment = typeId === 'assignment';
  const isDrill = typeId === 'drill';
  const isVideoScript = typeId === 'video-script';
  const isStructured = isSummary || isReflection || isAssignment || isDrill;
  const typeNoun = NOUNS[typeId] || typeId;
  // All authorable content use the real Sources → Mark up → Extract → Define pipeline
  // (same PDF / web / YouTube ingest + clustered Extract as tutorials).
  const usesPipeline = [
    'tutorial', 'flashcard-set', 'quiz', 'concept-card',
    'summary', 'reflection', 'assignment', 'drill',
    'lesson', 'scenario', 'video-script',
  ].includes(typeId);
  const clusterOutcome =
    isTutorial ? 'Clusters are your Plan sections (+ Unassigned). Move stranded units before generating.'
      : isQuiz ? 'Each cluster becomes a topic for quiz questions.'
        : isFlashcard ? 'Each cluster becomes a group of related cards.'
          : isConceptCard ? 'Clusters focus the card on one core idea and its related facets.'
            : isSummary ? 'Clusters become the key takeaways to condense.'
              : isReflection ? 'Clusters become themes for reflection prompts.'
                : isAssignment ? 'Clusters become topics the assignment should cover.'
                  : isDrill ? 'Clusters become skills or items to drill.'
                    : isVideoScript ? 'Clusters become topics for video checkpoint questions.'
                      : `Each cluster groups related material for this ${typeNoun}.`;

  /** Tutorial-only 5-step rail; all other types keep 4-step STEP_META. */
  const stepMeta = isTutorial ? STEP_META_TUTORIAL : STEP_META;
  const totalSteps = stepMeta.length;
  const planStep = isTutorial ? 1 : 0;
  const sourcesStep = isTutorial ? 2 : 1;
  const markupStep = isTutorial ? 3 : 2;
  const extractStep = isTutorial ? 4 : 3;
  const defineStep = isTutorial ? 5 : 4;

  const [step, setStep] = useState(1);
  const [reached, setReached] = useState(1);
  const [showEditor, setShowEditor] = useState(false);
  const [editObjectId, setEditObjectId] = useState<string | null>(null);
  const [editObjectStatus, setEditObjectStatus] = useState<ObjectStatus | undefined>(undefined);
  /** Hoot chat (editor-only UI). Messages + pipeline draft stay so Hoot sees authoring context. */
  const [hootMessages, setHootMessages] = useState<AssistantMessage[]>([]);
  const [hootOpen, setHootOpen] = useState(false);

  const [sel, setSel] = useState<string[]>([]);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [urlRefs, setUrlRefs] = useState<string[]>([]);
  const [highlights, setHighlights] = useState<any[]>([]);
  const [activeTag, setActiveTag] = useState('Use');
  const [aiSuggestions, setAiSuggestions] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [extracts, setExtracts] = useState<any[]>([]);
  const [knowledgeBase, setKnowledgeBase] = useState<ClusteredKnowledgeBase | null>(null);
  const [shapeIntent, setShapeIntent] = useState('');
  const [tutorialDefinition, setTutorialDefinition] = useState<TutorialDefinition>(() => {
    if (typeId !== 'tutorial') return { objective: '', sections: [] };
    return emptyTutorialDefinition(getTutorialTemplate(getDefaultTemplateId('tutorial')));
  });
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState('program');
  const [fv, setFvState] = useState<Record<string, any>>(() => {
    if (typeId === 'tutorial') {
      const id = getDefaultTemplateId('tutorial');
      return { templateId: id, ...getTutorialTemplate(id).knobDefaults };
    }
    if (typeId === 'concept-card') {
      const id = getDefaultTemplateId('concept-card');
      const t = getObjectTemplate(id, 'concept-card');
      return {
        categories: DEFAULT_CONCEPT_CATEGORIES.map((c) => ({ ...c })),
        len: 'Standard',
        templateId: id,
        ...(t?.knobDefaults || {}),
      };
    }
    if (typeId === 'video-script') {
      const id = getDefaultTemplateId('video-script');
      const t = getObjectTemplate(id, 'video-script');
      return {
        ncp: 4, showTranscript: true, enableChat: true,
        templateId: id,
        ...(t?.knobDefaults || {}),
      };
    }
    const id = getDefaultTemplateId(typeId as TemplateObjectType);
    const t = getObjectTemplate(id, typeId as TemplateObjectType);
    return t ? { templateId: t.id, ...t.knobDefaults } : {};
  });
  const setF = (id: string, v: any) => setFvState(p => ({ ...p, [id]: v }));

  const pickTutorialTemplate = (t: TutorialTemplate) => {
    setFvState((p) => ({
      ...p,
      templateId: t.id,
      ...t.knobDefaults,
    }));
    // Reseed outline count from template secs only when Plan is still empty placeholders.
    setTutorialDefinition((prev) => {
      if (planIsReady(prev)) return prev;
      return {
        objective: prev.objective || '',
        sections: seedSectionsFromTemplate(t),
      };
    });
  };

  const pickObjectTemplate = (t: { id: string; knobDefaults: Record<string, any> }) => {
    setFvState((p) => ({
      ...p,
      templateId: t.id,
      ...t.knobDefaults,
    }));
  };

  // Apply template chosen from Template Library once when opening the creator.
  const pendingApplied = useRef(false);
  useEffect(() => {
    if (!pendingTemplateId || pendingApplied.current || editingObjectId) return;
    pendingApplied.current = true;
    if (typeId === 'tutorial') {
      pickTutorialTemplate(getTutorialTemplate(pendingTemplateId));
    } else {
      const t = getObjectTemplate(pendingTemplateId, typeId as TemplateObjectType);
      if (t) pickObjectTemplate(t);
    }
    setPendingTemplateId(null);
  }, [pendingTemplateId, typeId, editingObjectId, setPendingTemplateId]);

  const syncExtractsFromUnits = (units: ContentUnit[]) => {
    setExtracts(units.map((u) => ({
      id: u.id,
      kind: u.kind,
      from: u.from || '',
      fromHl: !!u.fromHl,
      text: u.text,
      authorNote: u.authorNote || undefined,
      clusterId: u.clusterId,
    })));
  };

  /** Extracts for generation — keep author notes as structured directives (not baked into text). */
  const extractsForGeneration = () =>
    extracts.map((e: any) => ({
      kind: e.kind,
      text: e.text,
      from: e.from,
      authorNote: e.authorNote || e.comment || undefined,
    }));

  /** Markup notes paired to highlighted passages — generation must follow these word-for-word. */
  const highlightsForGeneration = () =>
    (highlights || [])
      .filter((h: any) => h.tag !== 'Ignore' && String(h.text || '').trim())
      .map((h: any) => ({
        text: h.text,
        tag: h.tag,
        comment: String(h.comment || '').trim() || undefined,
        page: h.page,
        idx: h.idx,
        sourceLabel: h.sourceLabel,
      }));

  // Tutorial Step 1 — one or more material source types (PDF + paste + web + YouTube),
  // or an exclusive prompt / write-myself path.
  // PDF: attach File in Sources; parse into `pdfDoc` only when entering Mark up.
  // Video scripts default to YouTube so the interactive player has a video URL.
  const [pathMode, setPathModeState] = useState<'material' | 'prompt' | 'manual'>(
    typeId === 'video-script' ? 'material' : 'material',
  );
  const [enabledTypes, setEnabledTypes] = useState<Set<MaterialSourceKind>>(
    () => new Set(typeId === 'video-script' ? (['youtube'] as MaterialSourceKind[]) : (['pdf'] as MaterialSourceKind[])),
  );
  /** Compat alias for drafts / generate paths that still key off a single srcMode. */
  const srcMode: 'pdf' | 'text' | 'youtube' | 'web' | 'prompt' | 'manual' =
    pathMode === 'prompt' || pathMode === 'manual'
      ? pathMode
      : enabledTypes.has('pdf')
        ? 'pdf'
        : enabledTypes.has('text')
          ? 'text'
          : enabledTypes.has('web')
            ? 'web'
            : enabledTypes.has('youtube')
              ? 'youtube'
              : 'pdf';

  const setSrcMode = (m: 'pdf' | 'text' | 'youtube' | 'web' | 'prompt' | 'manual') => {
    if (m === 'prompt' || m === 'manual') {
      setPathModeState(m);
      return;
    }
    setPathModeState('material');
    setEnabledTypes(new Set([m]));
  };

  const setPathMode = (m: 'material' | 'prompt' | 'manual') => {
    setPathModeState(m);
    if (m === 'material' && enabledTypes.size === 0) {
      setEnabledTypes(new Set(['pdf']));
    }
  };

  const toggleMaterialType = (kind: MaterialSourceKind) => {
    setPathModeState('material');
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        if (next.size > 1) next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  };

  const [pdfSources, setPdfSources] = useState<PdfSrc[]>([]);
  const [textSources, setTextSources] = useState<TextSrc[]>([]);
  const [ytSources, setYtSources] = useState<YtSrc[]>([]);
  const [webSources, setWebSources] = useState<WebSrc[]>([]);
  const [libraryDoc, setLibraryDoc] = useState<ParsedDoc | null>(null);
  const doc = useMemo(
    () => mergeDocs([
      ...pdfSources.map((p) => p.doc).filter(Boolean),
      ...textSources.map((t) => t.doc),
      ...ytSources.map((y) => y.doc),
      ...webSources.map((w) => w.doc),
      libraryDoc,
    ].filter(Boolean) as ParsedDoc[]),
    [pdfSources, textSources, ytSources, webSources, libraryDoc],
  );
  const [ytSegments, setYtSegments] = useState<YtTranscriptSegment[]>([]);
  const [ytVideoId, setYtVideoId] = useState('');
  const [ytVideoTitle, setYtVideoTitle] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseProgress, setParseProgress] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [ytUrl, setYtUrl] = useState('');
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [webUrl, setWebUrl] = useState('');
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);
  const [promptText, setPromptText] = useState('');
  const [expandingPrompt, setExpandingPrompt] = useState(false);
  const [expandPromptError, setExpandPromptError] = useState<string | null>(null);
  const expandPromptAbort = useRef<AbortController | null>(null);
  const [librarySource, setLibrarySource] = useState<PickedLibrarySource | null>(null);

  // Media attachments added in the Sources step — images + cropped YouTube clips.
  // These are showcased (with captions) in the generated tutorial.
  const [media, setMedia] = useState<any[]>([]);
  const addImageAsset = () => setMedia(p => [...p, { id: `m-img-${Date.now()}`, kind: 'image', url: '', caption: '', fileName: '' }]);
  const addVideoAsset = (init?: {
    url?: string; videoId?: string; startText?: string; endText?: string; caption?: string; fullVideo?: boolean;
  }) => {
    const id = `m-vid-${Date.now()}`;
    const fullVideo = init?.fullVideo === true || (!init?.startText && !init?.endText);
    setMedia((p) => [...p, {
      id,
      kind: 'video',
      url: init?.url || '',
      videoId: init?.videoId || '',
      startText: fullVideo ? '' : (init?.startText || ''),
      endText: fullVideo ? '' : (init?.endText || ''),
      caption: init?.caption || '',
      fullVideo,
    }]);
    return id;
  };
  const updateMedia = (id: string, patch: Record<string, any>) => setMedia(p => p.map(m => (m.id === id ? { ...m, ...patch } : m)));
  const removeMedia = (id: string) => setMedia(p => p.filter(m => m.id !== id));
  const pickImageAsset = async (id: string, file?: File) => {
    if (!file) return;
    if (supabaseEnabled) {
      updateMedia(id, { uploading: true, fileName: file.name });
      try {
        const url = await uploadImage(file);
        updateMedia(id, { url, uploading: false });
        return;
      } catch (e) {
        console.warn('[supabase] image upload failed, using inline copy:', errorMessage(e));
      }
    }
    const reader = new FileReader();
    reader.onload = () => updateMedia(id, { url: String(reader.result), fileName: file.name, uploading: false });
    reader.readAsDataURL(file);
  };
  /** Bulk-add image files from the Sources multi-select / drop zone. */
  const addImagesFromFiles = (files: File[]) => {
    if (!files.length) return;
    const stamp = Date.now();
    const entries = files.map((file, i) => ({
      id: `m-img-${stamp}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      kind: 'image' as const,
      url: '',
      caption: '',
      fileName: file.name,
      uploading: true,
    }));
    setMedia((p) => [...p, ...entries]);
    entries.forEach((entry, i) => {
      void pickImageAsset(entry.id, files[i]);
    });
  };
  const mediaToPart = (m: any) =>
    m.kind === 'image'
      ? { id: m.id, type: 'image', label: 'Image', url: m.url, caption: m.caption }
      : { id: m.id, type: 'video', label: 'YouTube video', url: m.url, videoId: m.videoId, startText: m.startText, endText: m.endText, caption: m.caption, fullVideo: !!m.fullVideo };

  /**
   * Merge generated parts with author media: the model emits {type:'media',ref}
   * placeholders where each asset best fits — swap those for the real media,
   * then append any the model didn't place (fallback) at the end.
   */
  const assembleParts = () => {
    const used = new Set<string>();
    const out: any[] = [];
    for (const p of genParts as any[]) {
      if (p.type === 'media') {
        const m = media.find((x: any) => x.id === p.ref);
        if (m && !used.has(m.id)) { out.push(mediaToPart(m)); used.add(m.id); }
        continue;
      }
      out.push(p);
    }
    for (const m of media) if (!used.has(m.id)) out.push(mediaToPart(m));
    const template = getTutorialTemplate(fv.templateId || DEFAULT_TUTORIAL_TEMPLATE_ID);
    const ordered = orderTutorialParts(out, {
      assessmentPlacement: template?.assessmentPlacement || 'after_each_section',
      checksPerSection: typeof fv.chks === 'number' ? fv.chks : 1,
    });
    const hintOpts = resolveHintSettings(fv);
    return renumberQuestionParts(attachHintsToQuestionParts(ordered, hintOpts));
  };

  // Switching path / clearing a type no longer wipes every other attached source.
  const syncPrimaryYoutube = (list: YtSrc[]) => {
    const first = list[0];
    setYtSegments(first?.segments || []);
    setYtVideoId(first?.videoId || '');
    setYtVideoTitle(first?.videoTitle || '');
  };
  const removePdf = (id: string) => {
    setPdfSources((p) => p.filter((x) => x.id !== id));
    setParseError(null); setParseProgress(null);
    clearMarkupDerived();
  };
  const removeText = (id: string) => {
    setTextSources((p) => p.filter((x) => x.id !== id));
    clearMarkupDerived();
  };
  const removeYoutube = (id: string) => {
    setYtSources((p) => {
      const next = p.filter((x) => x.id !== id);
      syncPrimaryYoutube(next);
      return next;
    });
    setYtError(null);
    clearMarkupDerived();
  };
  const removeWeb = (id: string) => {
    setWebSources((p) => p.filter((x) => x.id !== id));
    setWebError(null);
    clearMarkupDerived();
  };
  const replaceSource = () => {
    setLibrarySource(null); setLibraryDoc(null);
    setPdfSources([]); setTextSources([]); setYtSources([]); setWebSources([]);
    setParseError(null); setYtError(null); setWebError(null); setParseProgress(null);
    setYtSegments([]); setYtVideoId(''); setYtVideoTitle('');
    clearMarkupDerived();
  };
  const pickLibrarySource = (src: PickedLibrarySource | null) => {
    if (!src) {
      setLibrarySource(null);
      setLibraryDoc(null);
      clearMarkupDerived();
      return;
    }
    setPathModeState('material');
    setLibrarySource(src);
    setLibraryDoc(docFromText(src.note || src.title, src.title));
    clearMarkupDerived();
  };

  // Tutorial: real LLM — suggest highlights + streamed generation.
  const [markupFlags, setMarkupFlags] = useState<MarkupFlag[]>([]);
  const [flagSummary, setFlagSummary] = useState('');
  const [scanningFlags, setScanningFlags] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);
  const flagScanAbort = useRef<AbortController | null>(null);
  const autoFlagScannedFor = useRef<string | null>(null);
  const clearMarkupDerived = () => {
    setHighlights([]); setAiSuggestions([]); setExtracts([]);
    setMarkupFlags([]); setFlagSummary(''); setFlagError(null);
    autoFlagScannedFor.current = null;
    setKnowledgeBase(null); setShapeIntent('');
  };
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [intentSuggestions, setIntentSuggestions] = useState<string[]>([]);
  const [suggestingIntents, setSuggestingIntents] = useState(false);
  const [suggestIntentError, setSuggestIntentError] = useState<string | null>(null);
  const intentSuggestAbort = useRef<AbortController | null>(null);
  const intentAutoTried = useRef(false);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState('');
  const [genParts, setGenParts] = useState<GeneratedPart[]>([]);
  const [genCards, setGenCards] = useState<GeneratedCard[]>([]);
  const [genQuestions, setGenQuestions] = useState<GeneratedQuizQuestion[]>([]);
  const [genConceptCard, setGenConceptCard] = useState<GeneratedConceptCard | null>(null);
  const [genStructured, setGenStructured] = useState<SummaryContent | ReflectionContent | AssignmentContent | DrillContent | null>(null);
  const [genVideoScript, setGenVideoScript] = useState<VideoScriptContent | null>(null);
  const [quizMeta, setQuizMeta] = useState<{ passMark?: number; showExplanations?: string; adaptive?: boolean }>({});
  const [genError, setGenError] = useState<string | null>(null);
  const genAbort = useRef<AbortController | null>(null);

  /** Step 1: attach only — do not parse yet. */
  const handleFile = (file: File) => {
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setParseError('That file is not a PDF. Please upload a PDF.');
      return;
    }
    setPathModeState('material');
    setEnabledTypes((prev) => new Set(prev).add('pdf'));
    setPdfSources((p) => [...p, { id: newSrcId('pdf'), file, doc: null }]);
    setParseError(null);
    setParseProgress(null);
    clearMarkupDerived();
    if (!title) setTitle(file.name.replace(/\.pdf$/i, ''));
  };

  /** Step 2 (Mark up): extract sentences from attached PDFs that are not yet parsed. */
  const parseAttachedPdfs = async (entries: PdfSrc[]) => {
    const pending = entries.filter((e) => e.file && !e.doc);
    if (!pending.length) return;
    setParsing(true);
    setParseError(null);
    try {
      for (let i = 0; i < pending.length; i += 1) {
        const entry = pending[i];
        const file = entry.file!;
        setParseProgress(pending.length > 1
          ? `PDF ${i + 1} of ${pending.length}: ${file.name}`
          : `Opening ${file.name}…`);
        try {
          const parsed = await parsePdf(file, ({ page, total }) => {
            setParseProgress(pending.length > 1
              ? `PDF ${i + 1}/${pending.length} · page ${page}/${total}`
              : `Page ${page} of ${total}…`);
          });
          if (!parsed.sentences.length) {
            setParseError(`No readable text found in "${file.name}" (it may be scanned images only).`);
            // Mark attempted so Mark up does not re-parse forever.
            setPdfSources((prev) => prev.map((p) => (p.id === entry.id
              ? { ...p, doc: { fileName: file.name, pageCount: 0, sentences: [] } }
              : p)));
            continue;
          }
          setPdfSources((prev) => prev.map((p) => (p.id === entry.id ? { ...p, doc: parsed } : p)));
        } catch (e) {
          setParseError(e instanceof Error ? `Could not read "${file.name}": ${e.message}` : `Could not read "${file.name}".`);
          setPdfSources((prev) => prev.map((p) => (p.id === entry.id
            ? { ...p, doc: { fileName: file.name, pageCount: 0, sentences: [] } }
            : p)));
        }
      }
    } finally {
      setParsing(false);
      setParseProgress(null);
    }
  };

  // Parse PDFs when the author reaches Mark up (not in Sources).
  useEffect(() => {
    if (step !== 2 || !usesPipeline) return;
    if (pathMode !== 'material') return;
    if (parsing) return;
    const pending = pdfSources.filter((p) => p.file && !p.doc);
    if (!pending.length) return;
    void parseAttachedPdfs(pdfSources);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, pathMode, pdfSources]);

  const handleLoadText = () => {
    if (!pasteText.trim()) return;
    setPathModeState('material');
    setEnabledTypes((prev) => new Set(prev).add('text'));
    clearMarkupDerived();
    const label = textSources.length ? `Pasted source ${textSources.length + 1}` : 'Pasted source';
    if (!title) setTitle(label);
    setTextSources((p) => [...p, { id: newSrcId('text'), doc: docFromText(pasteText, label) }]);
    setPasteText('');
  };

  const handleFetchYoutube = async () => {
    if (!ytUrl.trim()) return;
    setYtError(null);
    setYtLoading(true);
    const url = ytUrl.trim();
    try {
      const out = await ingestYoutube(url);
      setPathModeState('material');
      setEnabledTypes((prev) => new Set(prev).add('youtube'));
      clearMarkupDerived();
      if (!title && out.title) setTitle(out.title);
      const entry: YtSrc = {
        id: newSrcId('yt'),
        url,
        videoId: out.videoId || parseYtId(url),
        videoTitle: out.title || '',
        segments: out.segments || [],
        doc: {
          fileName: out.title || 'YouTube transcript',
          pageCount: 1,
          sentences: (out.sentences || []).map((t) => ({ text: t, page: 1 })),
        },
      };
      setYtSources((p) => {
        const next = [...p, entry];
        syncPrimaryYoutube(next);
        return next;
      });
      setYtUrl('');
    } catch (e) {
      setYtError(errorMessage(e, 'Could not fetch that transcript.'));
    } finally {
      setYtLoading(false);
    }
  };

  const handleFetchWeb = async () => {
    if (!webUrl.trim()) return;
    setWebError(null);
    setWebLoading(true);
    const url = webUrl.trim();
    try {
      const out = await ingestWeb(url);
      setPathModeState('material');
      setEnabledTypes((prev) => new Set(prev).add('web'));
      clearMarkupDerived();
      if (!title && out.title) setTitle(out.title);
      setWebSources((p) => [...p, {
        id: newSrcId('web'),
        url: out.url || url,
        doc: {
          fileName: out.title || 'Web page',
          pageCount: 1,
          sentences: (out.sentences || []).map((t) => ({ text: t, page: 1 })),
          html: out.html || undefined,
          sourceUrl: out.url || url,
        },
      }]);
      setWebUrl('');
    } catch (e) {
      setWebError(errorMessage(e, 'Could not fetch that website.'));
    } finally {
      setWebLoading(false);
    }
  };

  // Document the Mark up / Extract steps operate on.
  const markupSources: MarkupSource[] = useMemo(() => {
    const list: MarkupSource[] = [];
    let offset = 0;
    const push = (
      id: string,
      label: string,
      kind: MarkupSource['kind'],
      d: ParsedDoc | null | undefined,
    ) => {
      if (!d?.sentences?.length) return;
      list.push({
        id,
        label: d.fileName || label,
        kind,
        sentences: d.sentences,
        offset,
        html: d.html,
        sourceUrl: d.sourceUrl,
      });
      offset += d.sentences.length;
    };
    // Order must match mergeDocs([...]) so global highlight/scan indices stay stable.
    for (const p of pdfSources) push(p.id, p.file?.name || 'PDF', 'pdf', p.doc);
    for (const t of textSources) push(t.id, 'Pasted notes', 'text', t.doc);
    for (const y of ytSources) push(y.id, 'YouTube transcript', 'youtube', y.doc);
    for (const w of webSources) push(w.id, 'Website', 'web', w.doc);
    push('library', librarySource?.title || 'Library source', 'library', libraryDoc);
    return list;
  }, [pdfSources, textSources, ytSources, webSources, libraryDoc, librarySource?.title]);

  const docParas: string[] = usesPipeline ? (doc ? doc.sentences.map(s => s.text) : []) : DOC_PARAS;
  const docPages: number[] | undefined = usesPipeline && doc ? doc.sentences.map(s => s.page) : undefined;
  const docTitle = usesPipeline
    ? (doc?.fileName ?? pdfSources[0]?.file?.name ?? (pathMode === 'manual' ? 'Written by hand' : pathMode === 'prompt' ? 'Prompt only' : 'Your sources'))
    : 'How to Play Bridge';

  const goTo = (n: number) => { if (n >= 1 && n <= totalSteps && n <= reached) setStep(n); };

  // Open a library content for editing (works for draft and in-review).
  // Restores the full Sources → Mark up → Extract → Define pipeline when
  // a pipelineDraft was saved; always unlocks the step rail so the author
  // can revise the process, not only the generated draft.
  useEffect(() => {
    if (!editingObjectId) return;
    const obj = createdObjects.find(o => o.id === editingObjectId) || OBJECTS.find(o => o.id === editingObjectId);
    if (!obj) return;
    setTitle(obj.title);
    setEditObjectId(obj.id);
    setEditObjectStatus(obj.status);

    const d = obj.pipelineDraft;
    if (d) {
      if (d.srcMode) setSrcMode(d.srcMode);
      if (d.promptText != null) setPromptText(d.promptText);
      if (d.pasteText != null) setPasteText(d.pasteText);
      if (d.ytUrl != null) setYtUrl(d.ytUrl);
      if (d.webUrl != null) setWebUrl(d.webUrl);
      if (d.doc) {
        const restored = d.doc as ParsedDoc;
        // Place restored merged/single doc into the slot matching saved srcMode.
        if (d.srcMode === 'youtube') {
          setYtSources([{
            id: newSrcId('yt'),
            url: d.ytUrl || '',
            videoId: parseYtId(d.ytUrl || ''),
            videoTitle: restored.fileName || '',
            segments: [],
            doc: restored,
          }]);
        } else if (d.srcMode === 'web') {
          setWebSources([{
            id: newSrcId('web'),
            url: d.webUrl || restored.sourceUrl || '',
            doc: restored,
          }]);
        } else if (d.srcMode === 'pdf') {
          setPdfSources([{ id: newSrcId('pdf'), file: null, doc: restored }]);
        } else {
          setTextSources([{ id: newSrcId('text'), doc: restored }]);
          setPathModeState('material');
        }
      }
      if (d.highlights) setHighlights(d.highlights);
      if (Array.isArray(d.markupFlags)) {
        setMarkupFlags(d.markupFlags as MarkupFlag[]);
        autoFlagScannedFor.current = d.doc?.fileName || 'restored';
      }
      if (d.extracts) setExtracts(d.extracts);
      if (d.knowledgeBase) setKnowledgeBase(d.knowledgeBase);
      if (d.shapeIntent != null) setShapeIntent(d.shapeIntent);
      if (d.fv) {
        setFvState({
          ...d.fv,
          templateId: d.fv.templateId || d.templateId || DEFAULT_TUTORIAL_TEMPLATE_ID,
        });
      } else if (d.templateId) {
        setFvState((p) => ({ ...p, templateId: d.templateId }));
      }
      if (obj.type === 'tutorial') {
        const tplId = d.tutorialDefinition
          ? (d.fv?.templateId || d.templateId || DEFAULT_TUTORIAL_TEMPLATE_ID)
          : (d.fv?.templateId || d.templateId || DEFAULT_TUTORIAL_TEMPLATE_ID);
        const tpl = getTutorialTemplate(tplId);
        if (d.tutorialDefinition && Array.isArray(d.tutorialDefinition.sections)) {
          setTutorialDefinition(d.tutorialDefinition);
        } else {
          // Derive-don't-rewrite: keep working state only; persist on edit/save.
          setTutorialDefinition(deriveTutorialDefinition({
            template: tpl,
            fv: d.fv,
            clusters: d.knowledgeBase?.clusters,
            description: obj.description,
          }));
        }
      }
      if (d.scope) setScope(d.scope);
      if (d.media) setMedia(d.media);
      if (d.sel) setSel(d.sel);
      if (d.roles) setRoles(d.roles);
      if (d.urlRefs) setUrlRefs(d.urlRefs);
      if (Array.isArray(d.assistantMessages)) setHootMessages(d.assistantMessages);
    } else if (obj.description) {
      setFvState((p) => ({ ...p, obj: obj.description }));
      if (obj.type === 'tutorial') {
        setTutorialDefinition((prev) => ({
          ...prev,
          objective: prev.objective || obj.description || '',
        }));
      }
    }

    const hasGenerated = (obj.blocks || []).length > 0;
    const maxStep = obj.type === 'tutorial' ? 5 : 4;
    if (typeof d?.step === 'number' && typeof d?.reached === 'number') {
      const r = Math.max(1, Math.min(maxStep, d.reached));
      const s = Math.max(1, Math.min(r, d.step));
      setReached(r);
      setStep(s);
    } else if (hasGenerated) {
      setReached(maxStep);
      setStep(maxStep);
    } else {
      setReached(1);
      setStep(1);
    }

    // Only jump into the draft editor when there is generated content.
    // In-progress Plan/Sources drafts reopen on the wizard step they left.
    if (hasGenerated) {
      if (obj.type === 'tutorial') {
        setGenParts(blocksToParts(obj.blocks) as any);
        setShowEditor(true);
      } else if (obj.type === 'flashcard-set') {
        const cards = (obj.blocks || [])
          .filter(b => b.type === 'flashcard-set')
          .flatMap(b => ((b.content as any)?.cards || []).map((c: any, i: number) => ({
            id: `c-${i}`, front: c.front, back: c.back, hook: c.hook, hint: c.hint, imageUrl: c.imageUrl,
          })));
        setGenCards(cards);
        setShowEditor(true);
      } else if (obj.type === 'quiz') {
        const quizBlock = (obj.blocks || []).find(b => b.type === 'quiz');
        const c = (quizBlock?.content || {}) as any;
        const qs = (c.questions || []).map((q: any, i: number) => ({
          id: `q-${i}`,
          question: q.question,
          type: q.type || 'multiple-choice',
          options: q.options || [],
          correct: q.correct,
          correctIndices: q.correctIndices,
          sampleAnswer: q.sampleAnswer,
          explanation: q.explanation || '',
          hint: q.hint || '',
          cognitiveLevel: q.cognitiveLevel,
          difficulty: q.difficulty,
        }));
        setGenQuestions(qs);
        setQuizMeta({ passMark: c.passMark, showExplanations: c.showExplanations, adaptive: !!c.adaptive });
        setShowEditor(true);
      } else if (obj.type === 'concept-card') {
        const ccBlock = (obj.blocks || []).find(b => b.type === 'concept-card');
        const c = (ccBlock?.content || {}) as any;
        if (c.term || c.definition || c.oneSentenceMeaning) {
          setGenConceptCard({
            id: ccBlock?.id || 'cc-edit',
            ...c,
            term: c.term || '',
            definition: c.oneSentenceMeaning || c.definition || '',
          });
        }
        setShowEditor(true);
      } else if (obj.type === 'summary' || obj.type === 'reflection' || obj.type === 'assignment' || obj.type === 'drill') {
        const blk = (obj.blocks || []).find(b => b.type === obj.type);
        if (blk?.content) setGenStructured(blk.content as any);
        setShowEditor(true);
      } else if (obj.type === 'video-script') {
        const blk = (obj.blocks || []).find(b => b.type === 'video-script');
        if (blk?.content) {
          const c = blk.content as VideoScriptContent;
          setGenVideoScript(c);
          if (c.videoUrl) setYtUrl(c.videoUrl);
          if (c.videoId) setYtVideoId(c.videoId);
          if (c.transcript?.length) setYtSegments(c.transcript as YtTranscriptSegment[]);
          setFvState((p) => ({
            ...p,
            showTranscript: c.showTranscript !== false,
            enableChat: c.enableChat !== false,
            ncp: c.checkpoints?.length || p.ncp || 4,
          }));
        }
        setShowEditor(true);
      } else {
        setGenParts(blocksToParts(obj.blocks) as any);
        setShowEditor(true);
      }
    }
    clearEditingObject();
  }, [editingObjectId]);

  const snapshotPipeline = (): CreatorPipelineDraft => ({
    srcMode,
    promptText,
    pasteText,
    ytUrl,
    webUrl,
    doc: doc
      ? {
          fileName: doc.fileName,
          pageCount: doc.pageCount,
          sentences: doc.sentences,
          html: (doc as ParsedDoc).html || webSources[0]?.doc.html,
          sourceUrl: (doc as ParsedDoc).sourceUrl || webSources[0]?.doc.sourceUrl,
        }
      : null,
    highlights,
    markupFlags: markupFlags.length ? markupFlags : undefined,
    extracts,
    knowledgeBase: knowledgeBase || undefined,
    templateId: fv.templateId,
    shapeIntent: shapeIntent || undefined,
    tutorialDefinition: isTutorial ? tutorialDefinition : undefined,
    fv: isTutorial
      ? { ...fv, obj: tutorialDefinition.objective, topic: fv.topic || tutorialDefinition.objective, aiExtra: false }
      : fv,
    scope,
    media,
    sel,
    roles,
    urlRefs,
    reached,
    step,
    assistantMessages: hootMessages.length ? hootMessages : undefined,
  });

  const hootAuthorInstructions = () => authorInstructionsFromMessages(hootMessages);

  /**
   * Persist wizard state into Object Library as a draft.
   * Created on open; debounced on every meaningful change so leaving mid-Plan is safe.
   */
  const persistPipelineDraft = (opts?: { blocks?: Block[]; description?: string }) => {
    const keepStatus: ObjectStatus = editObjectStatus === 'in-review' ? 'in-review' : 'draft';
    const existing = editObjectId
      ? createdObjects.find((o) => o.id === editObjectId)
      : undefined;
    const draftTitle = (title || `Untitled ${fmtType(typeId)}`).trim() || `Untitled ${fmtType(typeId)}`;
    const description = opts?.description != null
      ? opts.description
      : (isTutorial
        ? String(tutorialDefinition.objective || '').trim()
        : String(fv.obj || fv.verify || fv.mem || fv.what || fv.skill || fv.goal || existing?.description || '').trim());
    const blocks = opts?.blocks != null
      ? opts.blocks
      : (existing?.blocks?.length ? existing.blocks : []);
    const id = addObject({
      id: editObjectId || undefined,
      type: typeId as any,
      title: draftTitle,
      status: keepStatus,
      description,
      estimatedTime: existing?.estimatedTime || '10 min',
      blocks: blocks as any,
      tags: existing?.tags || [],
      sourceIds: existing?.sourceIds || [],
      pipelineDraft: snapshotPipeline(),
      scope: scope as any,
    });
    setEditObjectId(id);
    setEditObjectStatus(keepStatus);
    return id;
  };

  /** Persist generated/edited content as a library draft so Back→pipeline and Library can reopen it. */
  const saveGeneratedDraft = (blocks: Block[], description?: string) => {
    return persistPipelineDraft({ blocks, description: description || '' });
  };

  // Seed a library draft as soon as the creator opens (fresh create only).
  const draftSeededRef = useRef(false);
  useEffect(() => {
    if (!usesPipeline) return;
    if (editingObjectId) {
      draftSeededRef.current = true;
      return;
    }
    if (draftSeededRef.current || editObjectId) return;
    draftSeededRef.current = true;
    persistPipelineDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingObjectId, usesPipeline, typeId]);

  // Keep the library draft in sync while authoring (incl. Plan step 1).
  useEffect(() => {
    if (!usesPipeline || !draftSeededRef.current || !editObjectId) return;
    if (editingObjectId) return; // wait until library restore finishes
    const t = window.setTimeout(() => { persistPipelineDraft(); }, 450);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    usesPipeline, editObjectId, editingObjectId,
    title, scope, step, reached, fv, tutorialDefinition,
    pathMode, promptText, pasteText, ytUrl, webUrl,
    pdfSources, textSources, ytSources, webSources, librarySource,
    highlights, markupFlags, extracts, knowledgeBase, shapeIntent, media,
    sel, roles, urlRefs, hootMessages,
  ]);

  const draftCollectionLabel = (): { ids: string[]; label: string } => {
    const existing = editObjectId
      ? createdObjects.find((o) => o.id === editObjectId)
      : undefined;
    const fromExisting = existing ? objectCollectionIds(existing) : [];
    const useIds = fromExisting.length ? fromExisting : createCollectionIds;
    const names = useIds
      .map((id) => objectCollections.find((c) => c.id === id)?.name)
      .filter(Boolean) as string[];
    const label = names.length
      ? names.map((n) => `“${n}”`).join(', ')
      : '“My content”';
    return { ids: useIds.length ? useIds : [], label };
  };

  /** Save draft, tell the author which collection it landed in, then leave (or stay). */
  const leaveCreator = async () => {
    if (!usesPipeline) {
      navigate('cd-create');
      return;
    }
    persistPipelineDraft();
    const { ids, label } = draftCollectionLabel();
    if (ids[0]) setActiveObjectCollectionId(ids[0]);
    const go = await confirmDelete({
      title: 'Saved to drafts',
      description: `Your progress is saved under ${label}. Open that collection in Content Library to find and continue this ${fmtType(typeId).toLowerCase()}.`,
      confirmLabel: 'Go to Content Library',
      cancelLabel: 'Stay here',
      destructive: false,
    });
    if (go) navigate('cd-library', { libraryFolderId: ids[0] || null });
  };

  /** Leave the draft editor and reopen the full create pipeline (same object). */
  const backToPipeline = (synced?: {
    parts?: any[];
    cards?: GeneratedCard[];
    questions?: GeneratedQuizQuestion[];
    conceptCard?: GeneratedConceptCard | null;
    structured?: SummaryContent | ReflectionContent | AssignmentContent | DrillContent | null;
    videoScript?: VideoScriptContent | null;
  }) => {
    if (synced?.parts) setGenParts(synced.parts);
    if (synced?.cards) setGenCards(synced.cards);
    if (synced?.questions) setGenQuestions(synced.questions);
    if (synced && 'conceptCard' in synced) setGenConceptCard(synced.conceptCard || null);
    if (synced && 'structured' in synced) setGenStructured(synced.structured || null);
    if (synced && 'videoScript' in synced) setGenVideoScript(synced.videoScript || null);
    setShowEditor(false);
    const openDefine = isTutorial ? defineStep : 4;
    setReached(openDefine);
    setStep(openDefine);
  };

  // Tutorial "AI suggest": ask the backend LLM which sentences to USE.
  const handleSuggest = async (instruction: string) => {
    setSuggestError(null);
    setSuggesting(true);
    try {
      const indices = await suggestTutorialHighlights(docParas, instruction || undefined);
      const fresh = indices.filter((i) => !highlights.find((h: any) => h.idx === i));
      setAiSuggestions(fresh);
      if (fresh.length === 0) setSuggestError('The model did not suggest any new passages.');
    } catch (e) {
      setSuggestError(errorMessage(e, 'AI suggest failed.'));
    } finally {
      setSuggesting(false);
    }
  };

  /** Document-level markup flags: one scan → compact Accept/Reject/Adjust list. */
  const handleScanFlags = async (instruction?: string) => {
    if (!doc?.sentences?.length) {
      setFlagError('Parse or load a source first.');
      return;
    }
    const focus = String(instruction || '').trim();
    const sections = isTutorial
      ? (tutorialDefinition.sections || [])
          .filter((s) => String(s.title || '').trim())
          .map((s) => ({ id: s.id, title: s.title.trim(), intent: s.intent || '' }))
      : [];
    if (!sections.length && !focus) {
      setFlagError(isTutorial
        ? 'Add named sections in Plan before scanning.'
        : 'Enter a scan focus so results are grouped for what you care about.');
      return;
    }
    flagScanAbort.current?.abort();
    const ctrl = new AbortController();
    flagScanAbort.current = ctrl;
    setFlagError(null);
    setScanningFlags(true);
    try {
      const result = await suggestTutorialMarkupFlags(
        doc.sentences.map((s) => ({ text: s.text, page: s.page })),
        {
          instruction: focus || undefined,
          objective: (isTutorial
            ? String(tutorialDefinition.objective || '').trim()
            : String(fv.obj || '').trim()) || undefined,
          title: doc.fileName || title || undefined,
          sections: sections.length ? sections : undefined,
        },
        ctrl.signal,
      );
      setMarkupFlags(result.flags);
      setFlagSummary(result.summary);
      autoFlagScannedFor.current = doc.fileName || 'doc';
      if (!result.flags.length) {
        setFlagError(sections.length
          ? 'No review items found for your Plan sections — try refining section intents, or mark up manually.'
          : 'No review items found — try a clearer scan focus, or mark up manually.');
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setFlagError(errorMessage(e, 'Document scan failed.'));
    } finally {
      setScanningFlags(false);
      flagScanAbort.current = null;
    }
  };

  // Document-level scan is USER-TRIGGERED only (toolbar button) — never auto-fires on Mark up entry.

  /** Marked-up units for concept cards: extracts first, else Use/Support highlights. */
  const conceptMarkupUnits = () => {
    if (extracts.length) {
      return extracts
        .filter((e: any) => String(e.text || '').trim())
        .map((e: any) => ({
          kind: e.kind || 'Extract',
          text: e.text,
          from: e.from,
          authorNote: e.authorNote || e.comment || undefined,
        }));
    }
    return (highlights || [])
      .filter((h: any) => (h.tag === 'Use' || h.tag === 'Support' || h.tag === 'Note') && String(h.text || '').trim())
      .map((h: any) => ({
        kind: h.tag === 'Use' ? 'Key point' : h.tag === 'Support' ? 'Fact' : 'Key point',
        text: h.text,
        authorNote: String(h.comment || '').trim() || undefined,
        from: h.page ? `p.${h.page}` : undefined,
        page: h.page,
      }));
  };

  /** Concept-card Define: Intent chips from marked-up units only (validated server-side). */
  const handleSuggestIntents = async () => {
    if (!isConceptCard) return;
    intentSuggestAbort.current?.abort();
    const ctrl = new AbortController();
    intentSuggestAbort.current = ctrl;
    setSuggestIntentError(null);
    setSuggestingIntents(true);
    try {
      const markup = conceptMarkupUnits();
      if (markup.length === 0) {
        throw new Error('Mark up Use/Support sentences and pull them into Extract — Intent suggestions come from your markup.');
      }
      const suggestions = await suggestConceptIntents({
        title,
        extracts: extractsForGeneration(),
        markupUnits: markup,
        limit: 8,
      }, ctrl.signal);
      setIntentSuggestions(suggestions);
      // Only auto-fill if the author hasn't typed/picked an Intent yet.
      if (suggestions.length && !String(fv.concept || '').trim()) {
        setF('concept', suggestions[0]);
      }
      if (suggestions.length === 0) setSuggestIntentError('No concepts found in your marked-up units.');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setSuggestIntentError(errorMessage(e, 'Could not suggest intents.'));
    } finally {
      if (intentSuggestAbort.current === ctrl) intentSuggestAbort.current = null;
      setSuggestingIntents(false);
    }
  };

  // Reset Intent suggestions when markup changes.
  useEffect(() => {
    if (!isConceptCard) return;
    intentAutoTried.current = false;
    setIntentSuggestions([]);
    setSuggestIntentError(null);
  }, [isConceptCard, extracts.length, highlights.length]);

  // Auto-load Intent suggestions when the author reaches Define for a concept card.
  useEffect(() => {
    if (!isConceptCard || step !== defineStep) return;
    if (intentAutoTried.current || suggestingIntents) return;
    if (conceptMarkupUnits().length === 0) return;
    intentAutoTried.current = true;
    void handleSuggestIntents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConceptCard, step, extracts.length, highlights.length]);

  /** Expand the AI-prompt brief into markable source text, then enter Markup. */
  const expandPromptAndEnterMarkup = async () => {
    const brief = promptText.trim();
    if (!brief) {
      setExpandPromptError('Describe what this content should teach first.');
      return;
    }
    expandPromptAbort.current?.abort();
    const ctrl = new AbortController();
    expandPromptAbort.current = ctrl;
    setExpandPromptError(null);
    setExpandingPrompt(true);
    try {
      const out = await expandTutorialPrompt(
        brief,
        {
          title: title || undefined,
          objective: String(fv.obj || '').trim() || undefined,
        },
        ctrl.signal,
      );
      clearMarkupDerived();
      const generated = docFromText(out.text, out.title || 'AI-generated source');
      setTextSources([{ id: newSrcId('text'), doc: generated }]);
      if (!title.trim() && out.title) setTitle(out.title);
      setStep(markupStep);
      if (markupStep > reached) setReached(markupStep);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setExpandPromptError(errorMessage(e, 'Could not generate source from your prompt.'));
    } finally {
      setExpandingPrompt(false);
      expandPromptAbort.current = null;
    }
  };

  /** Source-backed objects should Pull & cluster before Generate (prompt/manual can proceed without). */
  const ensureExtractReady = (): boolean => {
    if (srcMode === 'prompt' || srcMode === 'manual') return true;
    const hasUnits = (knowledgeBase?.units?.length || 0) > 0 || extracts.some((e: any) => String(e.text || '').trim());
    if (hasUnits) return true;
    setGenError('Build clusters in Extract first (Pull & cluster), then continue in Define.');
    return false;
  };

  // Tutorial generation: stream prose + section-quiz, then fill generate-new embeds via per-type generators.
  const runGenerate = async () => {
    const templateId = fv.templateId || DEFAULT_TUTORIAL_TEMPLATE_ID;
    const template = getTutorialTemplate(templateId);
    const needsClusters = srcMode !== 'prompt' && srcMode !== 'manual';
    if (needsClusters && (!knowledgeBase || knowledgeBase.clusters.length === 0)) {
      setGenError('Build clusters in Extract first (Pull & cluster). The Template Library default is used for structure.');
      return;
    }
    const unresolvedRequired = listUnresolvedRequiredEmbeds(tutorialDefinition, template);
    if (unresolvedRequired.length) {
      setGenError(
        `Resolve ${unresolvedRequired.length} required embed${unresolvedRequired.length === 1 ? '' : 's'} in Plan (Generate new or Pick from library) before generating.`,
      );
      return;
    }

    const ctrl = new AbortController();
    genAbort.current = ctrl;
    setGenError(null);
    setGenParts([]);
    setGenProgress('Starting…');
    setGenerating(true);
    const embedWarnings: string[] = [];
    try {
      // Apply only locked knobs from the template; unlocked knobs keep author values.
      const knobs = applyKnobLocks(template, fv as Record<string, unknown>) as typeof fv;
      const secs = typeof knobs.secs === 'number' ? knobs.secs : (template.knobDefaults.secs ?? 3);
      const hintOpts = resolveHintSettings(knobs);
      const objective = String(tutorialDefinition.objective || knobs.obj || '').trim();
      const config = {
        obj: objective,
        topic: knobs.topic || objective || title,
        aud: knobs.aud, lvl: knobs.lvl,
        secs: Math.max(secs, tutorialDefinition.sections.filter((s) => String(s.title || '').trim()).length || secs),
        prog: knobs.prog, dpth: knobs.dpth, end: knobs.end,
        // words retired — length follows curated units + depth (ignore legacy fv.words)
        words: 0,
        chks: knobs.chks, excpts: knobs.excpts, wex: knobs.wex,
        passOn: knobs.passOn !== false,
        pass: knobs.pass || '70%',
        hintsOn: hintOpts.enabled,
        hintN: hintOpts.count,
        // Boss rule: AI extras unreachable for tutorials (server also force-Off).
        aiExtra: false,
        templateId: template.id,
      };
      const mediaPayload = media.map((m: any) => ({ ref: m.id, kind: m.kind as 'image' | 'video', caption: m.caption }));
      const mediaItems = media.map((m: any) => ({ id: m.id as string, kind: m.kind as string }));
      const defReady = planIsReady(tutorialDefinition);
      const sectionPlans = defReady && knowledgeBase
        ? buildTutorialSectionPlansFromDefinition(template, tutorialDefinition, knowledgeBase, mediaItems)
        : knowledgeBase?.clusters?.length
          ? buildTutorialSectionPlans(template, knowledgeBase, secs, mediaItems)
          : [];
      const payload = {
        title,
        config,
        extracts: extractsForGeneration(),
        highlights: highlightsForGeneration(),
        prompt: srcMode === 'prompt' ? promptText : undefined,
        media: mediaPayload,
        template: sectionPlans.length ? template : null,
        knowledgeBase: sectionPlans.length ? knowledgeBase : null,
        sectionPlans: sectionPlans.length ? sectionPlans : undefined,
        shapeIntent: undefined,
        tutorialDefinition: defReady
          ? {
              objective,
              sections: tutorialDefinition.sections
                .filter((s) => String(s.title || '').trim())
                .map((s) => ({
                  id: s.id,
                  title: s.title.trim(),
                  intent: s.intent || '',
                  attachedEmbedIds: s.attachedEmbedIds,
                })),
            }
          : undefined,
        authorInstructions: hootAuthorInstructions(),
      };
      const collected: GeneratedPart[] = [];
      for await (const ev of generateTutorial(payload, ctrl.signal) as AsyncGenerator<TutorialGenEvent>) {
        if (ev.type === 'progress') setGenProgress(ev.message);
        else if (ev.type === 'part') { collected.push(ev.part); setGenParts(renumberQuestionParts([...collected])); }
        else if (ev.type === 'error') throw new Error(ev.message);
        else if (ev.type === 'done') break;
      }
      if (collected.length === 0) throw new Error('No parts were generated.');
      const ordered = orderTutorialParts(collected, {
        assessmentPlacement: template.assessmentPlacement || 'after_each_section',
        checksPerSection: typeof config.chks === 'number' ? config.chks : 1,
      });
      const withHints = attachSourcesToQuestionParts(
        attachHintsToQuestionParts(ordered, {
          enabled: config.hintsOn,
          count: config.hintN,
        }),
        knowledgeBase,
      );

      // Build per-section embed slots from resolved sectionRecipe + embedPlans (not template.recipe alone).
      const unitsById = new Map((knowledgeBase?.units || []).map((u) => [u.id, u]));
      const listed = templateUsesCompositeRecipe(template)
        ? listEmbedsForDefinition(tutorialDefinition, template, {
          unitsBySectionId: Object.fromEntries(
            (tutorialDefinition.sections || []).map((sec) => {
              const cluster = (knowledgeBase?.clusters || []).find((c) => c.id === sec.id || c.sectionId === sec.id);
              const units = (cluster?.unitIds || []).map((id) => unitsById.get(id)).filter(Boolean) as ContentUnit[];
              return [sec.id, units];
            }),
          ),
        })
        : [];

      const sectionSlots: SectionEmbedSlot[] = [];
      for (const emb of listed) {
        // Optional unresolved prompt_on_author → skip entirely.
        if (emb.item.sourceMode === 'prompt_on_author' && emb.effectiveMode == null) {
          if (emb.item.required) {
            embedWarnings.push(`Required embed ${emb.key} still unresolved — skipped.`);
          }
          continue;
        }
        const mode = emb.effectiveMode;
        if (mode === 'pick_from_library') {
          if (!emb.item.versionPin?.objectId) continue;
          sectionSlots.push({
            slotKey: emb.key,
            sectionIndex: emb.sectionIndex,
            sectionTitle: emb.sectionTitle,
            recipeIndex: emb.recipeIndex,
            objectType: emb.item.objectType,
            mode: 'pick_from_library',
            versionPin: emb.item.versionPin,
            libraryTitle: emb.item.libraryTitle,
            authoringNote: emb.authoringNote,
            required: emb.item.required,
          });
          continue;
        }
        if (mode !== 'generate') continue;
        // Quiz generate stays as section-quiz from the tutorial stream — do not client-call generateQuiz.
        if (emb.item.objectType === 'quiz') continue;

        const cluster = (knowledgeBase?.clusters || []).find(
          (c) => c.id === emb.sectionId || c.sectionId === emb.sectionId,
        );
        const sectionUnits = (cluster?.unitIds || [])
          .map((id) => unitsById.get(id))
          .filter(Boolean) as ContentUnit[];

        setGenProgress(`Generating embedded ${embedTypeLabel(emb.item.objectType)} for “${emb.sectionTitle}”…`);
        const { part, warning } = await generateEmbedPart({
          embed: emb,
          sectionUnits,
          signal: ctrl.signal,
        });
        if (warning) embedWarnings.push(warning);
        sectionSlots.push({
          slotKey: emb.key,
          sectionIndex: emb.sectionIndex,
          sectionTitle: emb.sectionTitle,
          recipeIndex: emb.recipeIndex,
          objectType: emb.item.objectType,
          mode: 'generate',
          authoringNote: emb.authoringNote,
          required: emb.item.required,
          part,
        });
      }

      let withEmbeds = withHints;
      if (sectionSlots.length) {
        withEmbeds = injectEmbedsIntoParts(withHints, sectionSlots, createdObjects || []);
      } else if (!templateUsesCompositeRecipe(template)) {
        // Legacy flat templates: pin from template.recipe into every section.
        withEmbeds = injectPinnedEmbedsIntoParts(
          withHints,
          (template.recipe || []).filter((r: any) => r?.kind === 'embedded') as any[],
          createdObjects || [],
        );
      }

      const finalParts = renumberQuestionParts(withEmbeds);
      setGenParts(finalParts);
      saveGeneratedDraft(partsToBlocks(finalParts, { ...fv, ...config }), config.obj || title);
      if (embedWarnings.length) {
        setGenError(`Tutorial generated with embed warnings: ${embedWarnings.join(' · ')}`);
      }
      setGenerating(false);
      setShowEditor(true);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') { setGenerating(false); return; }
      setGenError(errorMessage(e, 'Generation failed.'));
      setGenerating(false);
    } finally {
      genAbort.current = null;
    }
  };

  const cancelGenerate = () => { genAbort.current?.abort(); setGenerating(false); };

  // Flashcards: stream a generated set from the backend LLM.
  /** Resolve imageRef → author upload URL. Vision already wrote the description side. */
  const attachUploadedImages = (cards: GeneratedCard[]): GeneratedCard[] => {
    const byId = new Map<string, string>(
      media.filter((m: any) => m.kind === 'image' && m.url).map((m: any) => [m.id, m.url as string]),
    );
    const used = new Set<string>();
    const out: GeneratedCard[] = [];

    for (const card of cards) {
      const next: GeneratedCard = { ...card };
      const ref = next.imageRef;
      delete next.imageRef;
      delete (next as { imageUrl?: string }).imageUrl;

      if (ref) {
        const url = byId.get(ref);
        if (!url || used.has(ref)) continue;
        next.imageUrl = url;
        used.add(ref);
        out.push(next);
        continue;
      }

      if (!/^what is shown\??$/i.test(next.front.trim())) out.push(next);
    }
    return out;
  };

  const runGenerateFlashcards = async () => {
    if (!ensureExtractReady()) return;
    const ctrl = new AbortController();
    genAbort.current = ctrl;
    setGenError(null);
    setGenCards([]);
    setGenProgress('Starting…');
    setGenerating(true);
    try {
      const cc = Array.isArray(fv.cc) ? fv.cc : (fv.cc ? [fv.cc] : ['Key terms → definitions']);
      const wantsImages = cc.some((s: string) => /image\s*[→\-]\s*label/i.test(String(s)));
      const textStyles = cc.filter((s: string) => !/image\s*[→\-]\s*label/i.test(String(s)));
      const uploadedImages = media
        .filter((m: any) => m.kind === 'image' && m.url)
        .map((m: any) => ({
          id: m.id as string,
          caption: (m.caption as string) || undefined,
          url: m.url as string,
        }));

      if (wantsImages && uploadedImages.length === 0 && textStyles.length === 0) {
        throw new Error('Image → label needs images you upload in Sources. Add at least one image, or pick another Card content style.');
      }

      const config = {
        mem: fv.mem || title,
        aud: fv.aud ?? 'High school',
        lvl: fv.lvl ?? 'Basic',
        cc,
        pull: Array.isArray(fv.pull) ? fv.pull : (fv.pull ? [fv.pull] : ['Glossary / key terms in source']),
        dir: fv.dir ?? 'Front→back',
        hooks: fv.hooks ?? false,
        nc: typeof fv.nc === 'number' ? fv.nc : 12,
      };
      const payload = {
        title,
        config,
        extracts: extractsForGeneration(),
        highlights: highlightsForGeneration(),
        prompt: srcMode === 'prompt' ? promptText : undefined,
        images: uploadedImages,
        knowledgeBase: knowledgeBase || undefined,
        shapeIntent: shapeIntent || undefined,
        authorInstructions: hootAuthorInstructions(),
      };
      const collected: GeneratedCard[] = [];
      for await (const ev of generateFlashcards(payload, ctrl.signal) as AsyncGenerator<FlashcardGenEvent>) {
        if (ev.type === 'progress') setGenProgress(ev.message);
        else if (ev.type === 'card') {
          collected.push({ ...ev.card });
          setGenCards(attachUploadedImages(collected));
        }
        else if (ev.type === 'error') throw new Error(ev.message);
        else if (ev.type === 'done') break;
      }
      const finalCards = attachUploadedImages(collected);
      if (finalCards.length === 0) throw new Error('No cards were generated.');
      setGenCards(finalCards);
      saveGeneratedDraft([{
        id: `blk-${Date.now()}`,
        type: 'flashcard-set',
        content: {
          cards: finalCards.map((c) => ({
            front: c.front,
            back: c.back,
            ...(c.hook ? { hook: c.hook } : {}),
            ...(c.hint ? { hint: c.hint } : {}),
            ...(c.imageUrl ? { imageUrl: c.imageUrl } : {}),
          })),
          direction: 'front-to-back',
        },
      } as Block], fv?.mem || title);
      setGenerating(false);
      setShowEditor(true);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') { setGenerating(false); return; }
      setGenError(errorMessage(e, 'Generation failed.'));
      setGenerating(false);
    } finally {
      genAbort.current = null;
    }
  };

  const runGenerateQuiz = async () => {
    if (!ensureExtractReady()) return;
    const ctrl = new AbortController();
    genAbort.current = ctrl;
    setGenError(null);
    setGenQuestions([]);
    setQuizMeta({});
    setGenProgress('Starting…');
    setGenerating(true);
    try {
      const config = {
        verify: fv.verify || title,
        purpose: fv.purpose ?? 'Formative check',
        concepts: fv.concepts || '',
        lvl: fv.lvl ?? 'Basic',
        qtypes: Array.isArray(fv.qtypes) ? fv.qtypes : (fv.qtypes ? [fv.qtypes] : ['Multiple choice', 'True/false']),
        cog: Array.isArray(fv.cog) ? fv.cog : (fv.cog ? [fv.cog] : ['Recall', 'Understand']),
        diff: fv.diff ?? 'Balanced',
        wrong: fv.wrong ?? 'Plausible common errors',
        adaptive: fv.adaptive ?? 'No',
        nq: typeof fv.nq === 'number' ? fv.nq : 8,
        passOn: fv.passOn !== false,
        pass: fv.pass ?? '70%',
        show: fv.show ?? 'After attempt',
        perq: fv.perq !== false,
      };
      const passSettings = resolvePassSettings(config);
      const payload = {
        title,
        config,
        extracts: extractsForGeneration(),
        highlights: highlightsForGeneration(),
        prompt: srcMode === 'prompt' ? promptText : undefined,
        knowledgeBase: knowledgeBase || undefined,
        shapeIntent: shapeIntent || undefined,
        authorInstructions: hootAuthorInstructions(),
      };
      const collected: GeneratedQuizQuestion[] = [];
      let doneMeta: { passMark?: number; passRequired?: boolean; showExplanations?: boolean; adaptive?: boolean } = {};
      for await (const ev of generateQuiz(payload, ctrl.signal) as AsyncGenerator<QuizGenEvent>) {
        if (ev.type === 'progress') setGenProgress(ev.message);
        else if (ev.type === 'question') {
          collected.push(ev.question);
          setGenQuestions([...collected]);
        }
        else if (ev.type === 'error') throw new Error(ev.message);
        else if (ev.type === 'done') {
          doneMeta = {
            passRequired: passSettings.passRequired,
            passMark: passSettings.passRequired
              ? (typeof ev.passMark === 'number' ? ev.passMark : passSettings.passMark)
              : undefined,
            showExplanations: ev.showExplanations,
            adaptive: !!ev.adaptive,
          };
          setQuizMeta(doneMeta);
          break;
        }
      }
      if (collected.length === 0) throw new Error('No questions were generated.');
      setGenQuestions(collected);
      saveGeneratedDraft([{
        id: `blk-${Date.now()}`,
        type: 'quiz',
        content: {
          questions: collected.map((q) => ({
            question: q.question,
            type: q.type || 'multiple-choice',
            options: q.options || [],
            correct: q.correct ?? 0,
            explanation: q.explanation || '',
            ...(Array.isArray((q as any).hints) ? { hints: (q as any).hints } : {}),
          })),
          passRequired: doneMeta.passRequired !== false,
          ...(doneMeta.passRequired !== false && doneMeta.passMark != null
            ? { passMark: doneMeta.passMark }
            : {}),
          showExplanations: doneMeta.showExplanations,
          adaptive: doneMeta.adaptive,
        },
      } as Block], fv?.verify || title);
      setGenerating(false);
      setShowEditor(true);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') { setGenerating(false); return; }
      setGenError(errorMessage(e, 'Generation failed.'));
      setGenerating(false);
    } finally {
      genAbort.current = null;
    }
  };

  const runGenerateConceptCard = async () => {
    if (!ensureExtractReady()) return;
    const ctrl = new AbortController();
    genAbort.current = ctrl;
    setGenError(null);
    setGenConceptCard(null);
    setGenProgress('Starting…');
    setGenerating(true);
    try {
      const markup = conceptMarkupUnits();
      if (markup.length === 0) {
        throw new Error('Mark up Use/Support sentences and pull them into Extract before generating.');
      }
      const intent = String(fv.concept || '').trim();
      if (!intent) {
        throw new Error('Add an Intent — type a concept or pick one of the markup suggestions.');
      }
      const config = {
        concept: intent,
        aud: fv.aud ?? 'High school',
        lvl: fv.lvl ?? 'Basic',
        voi: fv.voi ?? 'Plain & friendly',
        len: fv.len ?? 'Standard',
        categories: resolveConceptCategories(fv.categories),
      };
      const payload = {
        title,
        config,
        extracts: extractsForGeneration(),
        highlights: highlightsForGeneration(),
        markupUnits: markup,
        prompt: srcMode === 'prompt' ? promptText : undefined,
        knowledgeBase: knowledgeBase || undefined,
        shapeIntent: shapeIntent || undefined,
        authorInstructions: hootAuthorInstructions(),
      };
      let card: GeneratedConceptCard | null = null;
      for await (const ev of generateConceptCard(payload, ctrl.signal) as AsyncGenerator<ConceptCardGenEvent>) {
        if (ev.type === 'progress') setGenProgress(ev.message);
        else if (ev.type === 'card') {
          card = ev.card;
          setGenConceptCard(ev.card);
        }
        else if (ev.type === 'error') throw new Error(ev.message);
        else if (ev.type === 'done') break;
      }
      if (!card?.term || !(card.oneSentenceMeaning || card.definition || card.coreIdea)) {
        throw new Error('No concept card was generated.');
      }
      setGenConceptCard(card);
      saveGeneratedDraft([{
        id: `blk-${Date.now()}`,
        type: 'concept-card',
        content: card,
      } as Block], fv?.concept || card.term || title);
      setGenerating(false);
      setShowEditor(true);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') { setGenerating(false); return; }
      setGenError(errorMessage(e, 'Generation failed.'));
      setGenerating(false);
    } finally {
      genAbort.current = null;
    }
  };

  const structuredConfig = (): Record<string, unknown> => {
    if (isSummary) {
      return {
        what: fv.what || title, aud: fv.aud ?? 'High school',
        shape: fv.shape ?? 'Key points', len: fv.len ?? 'Medium',
        nkp: typeof fv.nkp === 'number' ? fv.nkp : 5,
      };
    }
    if (isReflection) {
      return {
        goal: fv.goal ?? 'Apply to real life', aud: fv.aud ?? 'High school',
        voi: fv.voi ?? 'Encouraging', style: fv.style ?? 'Open-ended',
        who: fv.who ?? 'Private to learner',
        np: typeof fv.np === 'number' ? fv.np : 2,
        starters: fv.starters === true,
      };
    }
    if (isAssignment) {
      return {
        obj: fv.obj || title, aud: fv.aud ?? 'High school', lvl: fv.lvl ?? 'Intermediate',
        tt: fv.tt ?? 'Short essay', del: fv.del ?? 'Written text', el: fv.el ?? '~300 words',
        cite: fv.cite !== false,
        req: typeof fv.req === 'number' ? fv.req : 3,
        rubric: typeof fv.rubric === 'number' ? fv.rubric : 3,
      };
    }
    // drill
    return {
      skill: fv.skill || title, lvl: fv.lvl ?? 'Basic',
      fmt: fv.fmt ?? 'Recall', diff: fv.diff ?? 'Easy → hard',
      fb: fv.fb ?? 'Immediate', timed: !!fv.timed, rep: !!fv.rep,
      ni: typeof fv.ni === 'number' ? fv.ni : 15,
    };
  };

  const runGenerateStructured = async () => {
    if (!ensureExtractReady()) return;
    const kind = typeId as StructuredObjectKind;
    const ctrl = new AbortController();
    genAbort.current = ctrl;
    setGenError(null);
    setGenStructured(null);
    setGenProgress('Starting…');
    setGenerating(true);
    try {
      const payload = {
        title,
        config: structuredConfig(),
        extracts: extractsForGeneration(),
        highlights: highlightsForGeneration(),
        prompt: srcMode === 'prompt' ? promptText : undefined,
        knowledgeBase: knowledgeBase || undefined,
        shapeIntent: shapeIntent || undefined,
        authorInstructions: hootAuthorInstructions(),
      };
      let content: any = null;
      for await (const ev of generateStructuredObject(kind, payload, ctrl.signal) as AsyncGenerator<StructuredGenEvent<any>>) {
        if (ev.type === 'progress') setGenProgress(ev.message);
        else if (ev.type === 'result') { content = ev.content; setGenStructured(ev.content); }
        else if (ev.type === 'error') throw new Error(ev.message);
        else if (ev.type === 'done') break;
      }
      if (!content) throw new Error(`No ${kind} was generated.`);
      setGenStructured(content);
      saveGeneratedDraft([{
        id: `blk-${Date.now()}`,
        type: typeId as any,
        content,
      } as Block], (content as any).tldr || (content as any).topic || (content as any).skill || (content as any).objective || (content as any).goal || title);
      setGenerating(false);
      setShowEditor(true);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') { setGenerating(false); return; }
      setGenError(errorMessage(e, 'Generation failed.'));
      setGenerating(false);
    } finally {
      genAbort.current = null;
    }
  };

  const openManualTutorialEditor = () => {
    const template = getTutorialTemplate(fv.templateId || DEFAULT_TUTORIAL_TEMPLATE_ID);
    const secs = typeof fv.secs === 'number' ? fv.secs : (template.knobDefaults.secs ?? 3);
    setGenError(null);
    const scaffold = scaffoldTutorialFromTemplate(template, secs, fv.end, createdObjects || []);
    setGenParts(scaffold);
    saveGeneratedDraft(partsToBlocks(scaffold, fv), fv.obj || title);
    setShowEditor(true);
  };

  const runGenerateVideoScript = async () => {
    const videoUrl = ytUrl.trim();
    if (!videoUrl && srcMode !== 'prompt') {
      setGenError('Add a YouTube video in Sources first.');
      return;
    }
    if (srcMode !== 'prompt' && !ensureExtractReady()) return;
    const ctrl = new AbortController();
    genAbort.current = ctrl;
    setGenError(null);
    setGenVideoScript(null);
    setGenProgress('Starting…');
    setGenerating(true);
    try {
      const config = {
        obj: fv.obj || title,
        aud: fv.aud ?? 'High school',
        lvl: fv.lvl ?? 'Basic',
        ncp: typeof fv.ncp === 'number' ? fv.ncp : 4,
        showTranscript: fv.showTranscript !== false,
        enableChat: fv.enableChat !== false,
        requireAnswer: true,
      };
      const payload = {
        title,
        config,
        extracts: extractsForGeneration(),
        highlights: highlightsForGeneration(),
        prompt: srcMode === 'prompt' ? promptText : undefined,
        videoUrl: videoUrl || undefined,
        videoId: ytVideoId || parseYtId(videoUrl) || undefined,
        videoTitle: ytVideoTitle || undefined,
        transcriptSegments: ytSegments.length ? ytSegments : undefined,
        knowledgeBase: knowledgeBase || undefined,
        shapeIntent: shapeIntent || undefined,
        authorInstructions: hootAuthorInstructions(),
      };
      let content: VideoScriptContent | null = null;
      for await (const ev of generateVideoScript(payload, ctrl.signal) as AsyncGenerator<VideoScriptGenEvent>) {
        if (ev.type === 'progress') setGenProgress(ev.message);
        else if (ev.type === 'result') { content = ev.content; setGenVideoScript(ev.content); }
        else if (ev.type === 'error') throw new Error(ev.message);
        else if (ev.type === 'done') break;
      }
      if (!content?.videoId || !content.checkpoints?.length) {
        throw new Error('No video script was generated.');
      }
      // Apply Define toggles in case the server omitted them.
      content = {
        ...content,
        showTranscript: config.showTranscript,
        enableChat: config.enableChat,
        requireAnswer: true,
      };
      setGenVideoScript(content);
      saveGeneratedDraft([{
        id: `blk-${Date.now()}`,
        type: 'video-script',
        content,
      } as Block], fv?.obj || title);
      setGenerating(false);
      setShowEditor(true);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') { setGenerating(false); return; }
      setGenError(errorMessage(e, 'Generation failed.'));
      setGenerating(false);
    } finally {
      genAbort.current = null;
    }
  };

  const hasDraftContent = () =>
    genParts.length > 0 || genCards.length > 0 || genQuestions.length > 0
    || !!genConceptCard || !!genStructured || !!genVideoScript;

  const advance = async () => {
    if (step >= defineStep) {
      if (hasDraftContent()) {
        const noun = NOUNS[typeId] || typeId;
        const ok = await confirmDelete({
          title: 'Are you sure you want to regenerate?',
          description: `Regenerate this ${noun}? The current draft will be replaced.`,
          confirmLabel: 'Regenerate',
          destructive: true,
        });
        if (!ok) return;
      }
      if (isTutorial && srcMode === 'manual') { openManualTutorialEditor(); return; }
      if (isTutorial) { runGenerate(); return; }
      if (isFlashcard) { runGenerateFlashcards(); return; }
      if (isQuiz) { runGenerateQuiz(); return; }
      if (isConceptCard) { runGenerateConceptCard(); return; }
      if (isStructured) { runGenerateStructured(); return; }
      if (isVideoScript) { runGenerateVideoScript(); return; }
      setShowEditor(true);
      return;
    }
    // Leaving Plan: sync objective into fv for any legacy readers.
    if (isTutorial && step === planStep) {
      setFvState((p) => ({ ...p, obj: tutorialDefinition.objective, topic: p.topic || tutorialDefinition.objective, aiExtra: false }));
    }
    // Manual still has nothing to mark up → jump to Define.
    if (usesPipeline && srcMode === 'manual' && step === sourcesStep) {
      setStep(defineStep);
      if (defineStep > reached) setReached(defineStep);
      return;
    }
    // AI prompt: generate markable source content, then open Markup.
    if (usesPipeline && srcMode === 'prompt' && step === sourcesStep) {
      void expandPromptAndEnterMarkup();
      return;
    }
    const next = step + 1;
    setStep(next);
    if (next > reached) setReached(next);
  };

  const pipelineHootContext = () => buildAssistantContext({
    objectId: editObjectId || `draft-${typeId}`,
    objectType: typeId as any,
    title: title || `New ${fmtType(typeId)}`,
    status: editObjectStatus || 'draft',
    scope,
    objective: String(fv.obj || fv.verify || fv.mem || fv.what || fv.skill || fv.goal || '').trim() || undefined,
    fv,
    parts: (genParts || []) as TutorialEditorPart[],
    pipelineDraft: snapshotPipeline(),
    selection: { kind: 'none' },
  });

  const pipelineHootPanel = (phaseLabel: string) => (
    <AssistantPanel
      open={hootOpen}
      onOpenChange={setHootOpen}
      context={pipelineHootContext()}
      selection={{ kind: 'none' }}
      onAcceptActions={() => {
        /* Edits apply in the draft editor after Generate. */
      }}
      messages={hootMessages}
      onMessagesChange={setHootMessages}
      phaseLabel={phaseLabel}
    />
  );

  if (showEditor) {
    const draft = snapshotPipeline();
    if (isFlashcard) return (
      <>
        <FlashcardEditor typeId={typeId} title={title} scope={scope} fv={fv} cards={genCards}
          initialId={editObjectId || undefined}
          initialStatus={editObjectStatus}
          pipelineDraft={draft}
          onBack={(cards?: GeneratedCard[]) => {
            if (Array.isArray(cards)) setGenCards(cards);
            backToPipeline(cards ? { cards } : undefined);
          }} onDone={() => navigate('cd-library')} />
        {pipelineHootPanel('Editor')}
      </>
    );
    if (isQuiz) return (
      <>
        <QuizEditor typeId={typeId} title={title} scope={scope} fv={fv} questions={genQuestions}
          passMark={quizMeta.passMark}
          showExplanations={quizMeta.showExplanations}
          adaptive={quizMeta.adaptive}
          initialId={editObjectId || undefined}
          initialStatus={editObjectStatus}
          pipelineDraft={draft}
          onBack={(questions?: GeneratedQuizQuestion[]) => {
            if (Array.isArray(questions)) setGenQuestions(questions);
            backToPipeline(questions ? { questions } : undefined);
          }} onDone={() => navigate('cd-library')} />
        {pipelineHootPanel('Editor')}
      </>
    );
    if (isConceptCard) return (
      <>
        <ConceptCardEditor typeId={typeId} title={title} scope={scope} fv={fv} card={genConceptCard}
          initialId={editObjectId || undefined}
          initialStatus={editObjectStatus}
          pipelineDraft={draft}
          onBack={(card?: GeneratedConceptCard | null) => {
            if (card) setGenConceptCard(card);
            backToPipeline({ conceptCard: card || null });
          }} onDone={() => navigate('cd-library')} />
        {pipelineHootPanel('Editor')}
      </>
    );
    if (isSummary) return (
      <>
        <SummaryEditor typeId={typeId} title={title} scope={scope} fv={fv} content={genStructured as SummaryContent | null}
          initialId={editObjectId || undefined} initialStatus={editObjectStatus} pipelineDraft={draft}
          onBack={(content?: SummaryContent | null) => backToPipeline({ structured: content || null })} onDone={() => navigate('cd-library')} />
        {pipelineHootPanel('Editor')}
      </>
    );
    if (isReflection) return (
      <>
        <ReflectionEditor typeId={typeId} title={title} scope={scope} fv={fv} content={genStructured as ReflectionContent | null}
          initialId={editObjectId || undefined} initialStatus={editObjectStatus} pipelineDraft={draft}
          onBack={(content?: ReflectionContent | null) => backToPipeline({ structured: content || null })} onDone={() => navigate('cd-library')} />
        {pipelineHootPanel('Editor')}
      </>
    );
    if (isAssignment) return (
      <>
        <AssignmentEditor typeId={typeId} title={title} scope={scope} fv={fv} content={genStructured as AssignmentContent | null}
          initialId={editObjectId || undefined} initialStatus={editObjectStatus} pipelineDraft={draft}
          onBack={(content?: AssignmentContent | null) => backToPipeline({ structured: content || null })} onDone={() => navigate('cd-library')} />
        {pipelineHootPanel('Editor')}
      </>
    );
    if (isDrill) return (
      <>
        <DrillEditor typeId={typeId} title={title} scope={scope} fv={fv} content={genStructured as DrillContent | null}
          initialId={editObjectId || undefined} initialStatus={editObjectStatus} pipelineDraft={draft}
          onBack={(content?: DrillContent | null) => backToPipeline({ structured: content || null })} onDone={() => navigate('cd-library')} />
        {pipelineHootPanel('Editor')}
      </>
    );
    if (isVideoScript) return (
      <>
        <VideoScriptEditor typeId={typeId} title={title} scope={scope} fv={fv} content={genVideoScript}
          initialId={editObjectId || undefined} initialStatus={editObjectStatus} pipelineDraft={draft}
          onBack={(content?: VideoScriptContent | null) => {
            if (content) setGenVideoScript(content);
            backToPipeline({ videoScript: content || null });
          }} onDone={() => navigate('cd-library')} />
        {pipelineHootPanel('Editor')}
      </>
    );
    return (
      <ObjEditor typeId={typeId} title={title} scope={scope} fv={fv}
        generatedParts={isTutorial ? assembleParts() : ((editObjectId || genParts.length) ? genParts : undefined)}
        initialId={editObjectId || undefined}
        initialStatus={editObjectStatus}
        pipelineDraft={draft}
        srcCount={usesPipeline ? pdfSources.length + textSources.length + ytSources.length + webSources.length + (librarySource ? 1 : 0) : sel.length} extCount={extracts.length} hlCount={highlights.length}
        assistantMessages={hootMessages}
        onAssistantMessagesChange={setHootMessages}
        assistantOpen={hootOpen}
        onAssistantOpenChange={setHootOpen}
        onBack={(parts?: any[]) => {
          if (Array.isArray(parts) && parts.length) {
            setGenParts(parts);
            saveGeneratedDraft(partsToBlocks(parts, fv), fv.obj || title);
          }
          backToPipeline(parts ? { parts } : undefined);
        }} onDone={() => navigate('cd-library')} />
    );
  }

  const structuredNoun = isSummary ? 'summary' : isReflection ? 'reflection' : isAssignment ? 'assignment' : isDrill ? 'drill' : 'tutorial';
  const hasDraft = genParts.length > 0 || genCards.length > 0 || genQuestions.length > 0 || !!genConceptCard || !!genStructured || !!genVideoScript;

  if (usesPipeline && generating) return (
    <GeneratingView
      progress={genProgress}
      noun={isFlashcard ? 'flashcards' : isQuiz ? 'quiz' : isConceptCard ? 'concept card' : isVideoScript ? 'video script' : isStructured ? structuredNoun : 'tutorial'}
      parts={isFlashcard
        ? genCards.map(c => ({ id: c.id, type: 'card', label: c.front }))
        : isQuiz
          ? genQuestions.map(q => ({ id: q.id, type: 'question', label: q.question }))
          : isVideoScript && genVideoScript
            ? genVideoScript.checkpoints.map((c) => ({ id: c.id, type: 'checkpoint', label: c.question.question }))
          : isConceptCard && genConceptCard
            ? [{ id: genConceptCard.id, type: 'concept-card', label: genConceptCard.term || 'Concept card' }]
            : isStructured && genStructured
              ? [{ id: 'structured', type: typeId, label: (genStructured as any).topic || (genStructured as any).skill || (genStructured as any).objective || (genStructured as any).goal || fmtType(typeId) }]
              : genParts}
      onCancel={cancelGenerate} />
  );

  const sourceReady = pathMode === 'manual'
    ? true
    : pathMode === 'prompt'
      ? promptText.trim().length > 0
      : !!(librarySource || pdfSources.length || textSources.length || ytSources.length || webSources.length);
  const emptySectionCount = isTutorial && knowledgeBase
    ? countEmptySections(tutorialDefinition, knowledgeBase.units || [])
    : (isTutorial ? countEmptySections(tutorialDefinition, []) : 0);
  const unassignedUnitCount = knowledgeBase?.clusters?.find(
    (c) => c.id === UNASSIGNED_SECTION_ID || c.sectionId === UNASSIGNED_SECTION_ID,
  )?.unitIds.length || 0;
  const unresolvedRequiredEmbeds = isTutorial
    ? listUnresolvedRequiredEmbeds(
      tutorialDefinition,
      getTutorialTemplate(fv.templateId || DEFAULT_TUTORIAL_TEMPLATE_ID),
    )
    : [];
  const canNext = isTutorial && step === planStep
    ? planIsReady(tutorialDefinition)
    : step === sourcesStep
      ? (usesPipeline ? sourceReady : sel.length > 0)
      : step === markupStep
        ? (usesPipeline ? (!parsing && !!doc && doc.sentences.length > 0) : true)
        : isTutorial && step === defineStep
          ? unresolvedRequiredEmbeds.length === 0
          : true;

  return (
    <>
    <div className="flex flex-col h-full min-h-0 flex-1">
      {/* Header */}
      <div className="sticky top-0 z-20 flex items-center gap-3 px-5 py-3 border-b border-white/40" style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(12px)' }}>
        <button onClick={() => { void leaveCreator(); }} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: '#6B7280' }}>
          <ArrowLeft size={14} />{editObjectId || hasDraft || usesPipeline ? 'Back to Content Library' : 'Back to Create'}
        </button>
        <ChevronRight size={13} style={{ color: '#C4CBD4' }} />
        <span className="px-3 py-1 rounded-full text-sm font-semibold text-white" style={{ background: '#0B0F1A' }}>
          {editObjectId || hasDraft ? `Edit ${fmtType(typeId)}` : `New ${fmtType(typeId)}`}
        </span>
        <span style={{ fontSize: 12, color: '#9AA3AF', marginLeft: 2 }}>
          {hasDraft ? 'revise sources, markup, extracts, or define — then regenerate' : 'every content item starts from its sources'}
        </span>
        {hasDraft && (
          <button
            onClick={() => setShowEditor(true)}
            className="ml-auto px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: 'rgba(5,150,105,0.12)', color: '#059669' }}
          >
            Open draft editor →
          </button>
        )}
      </div>

      {/* Step rail — tutorial uses STEP_META_TUTORIAL (5 steps); others keep STEP_META (4). */}
      <div className="sticky top-[49px] z-10 flex items-center gap-0 px-5 py-2.5 border-b border-white/30 overflow-x-auto" style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(8px)' }}>
        {stepMeta.map((s, i) => {
          const n = i + 1; const isActive = n === step; const isDone = n < step; const canClick = n <= reached;
          return (
            <React.Fragment key={n}>
              <button onClick={() => goTo(n)} disabled={!canClick}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-all shrink-0"
                style={{ background: isActive ? '#0B0F1A' : isDone ? 'rgba(5,150,105,0.1)' : 'rgba(255,255,255,0.5)', color: isActive ? '#fff' : isDone ? '#059669' : '#9AA3AF', border: `1.5px solid ${isActive ? '#0B0F1A' : isDone ? '#059669' : 'rgba(0,0,0,0.08)'}`, cursor: canClick ? 'pointer' : 'default' }}>
                {isDone ? <Check size={12} /> : s.icon}
                <span style={{ fontSize: 12.5, fontWeight: isActive ? 650 : 500 }}>
                  {s.label}{(s as any).optionalLabel ? '  optional' : ''}
                </span>
              </button>
              {i < totalSteps - 1 && <ChevronRight size={13} style={{ color: '#C4CBD4', margin: '0 3px', flexShrink: 0 }} />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Active template — always visible while building so authors know the recipe in play */}
      {(isTutorial || (!!fv.templateId && usesPipeline)) && (
        <div
          className="sticky z-10 flex items-center gap-2 px-5 py-2 border-b"
          style={{
            top: 97,
            background: 'rgba(243,232,255,0.72)',
            backdropFilter: 'blur(8px)',
            borderColor: 'rgba(124,58,237,0.18)',
          }}
        >
          <span
            className="px-2 py-0.5 rounded-md shrink-0"
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: '#5B21B6', background: 'rgba(124,58,237,0.12)' }}
          >
            TEMPLATE
          </span>
          <p style={{ fontSize: 13, fontWeight: 650, color: '#4C1D95' }} className="truncate">
            {isTutorial
              ? getTutorialTemplate(fv.templateId || DEFAULT_TUTORIAL_TEMPLATE_ID).name
              : (getObjectTemplate(fv.templateId || getDefaultTemplateId(typeId as TemplateObjectType), typeId as TemplateObjectType)?.name || fv.templateId)}
          </p>
          {isTutorial && (
            <span style={{ fontSize: 12, color: '#6B7280' }} className="truncate hidden sm:inline">
              · {getTutorialTemplate(fv.templateId || DEFAULT_TUTORIAL_TEMPLATE_ID).knobDefaults?.dpth || 'Standard'} depth
              · change in Template Library
            </span>
          )}
        </div>
      )}

      {/* Content — Sources is a fixed-height workspace; other steps page-scroll */}
      <div className={`flex-1 min-h-0 ${step === sourcesStep && usesPipeline ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className={step === sourcesStep && usesPipeline ? 'flex-1 min-h-0 flex flex-col' : undefined}
          >
            {isTutorial && step === planStep && (
              <TutorialPlanPanel
                def={tutorialDefinition}
                setDef={setTutorialDefinition}
                template={getTutorialTemplate(fv.templateId || DEFAULT_TUTORIAL_TEMPLATE_ID)}
                templateName={getTutorialTemplate(fv.templateId || DEFAULT_TUTORIAL_TEMPLATE_ID).name}
                createdObjects={createdObjects || []}
              />
            )}
            {step === sourcesStep && (usesPipeline
              ? <TutorialSource
                  pathMode={pathMode} setPathMode={setPathMode}
                  enabledTypes={enabledTypes} toggleMaterialType={toggleMaterialType}
                  pdfSources={pdfSources} onRemovePdf={removePdf} onFile={handleFile}
                  textSources={textSources} pasteText={pasteText} setPasteText={setPasteText} onLoadText={handleLoadText} onRemoveText={removeText}
                  ytSources={ytSources} ytUrl={ytUrl} setYtUrl={setYtUrl} ytLoading={ytLoading} ytError={ytError} onFetchYoutube={handleFetchYoutube} onRemoveYoutube={removeYoutube}
                  webSources={webSources} webUrl={webUrl} setWebUrl={setWebUrl} webLoading={webLoading} webError={webError} onFetchWeb={handleFetchWeb} onRemoveWeb={removeWeb}
                  promptText={promptText} setPromptText={setPromptText}
                  expandPromptError={expandPromptError} setExpandPromptError={setExpandPromptError}
                  showMedia={!isVideoScript} imagesOnly={isFlashcard}
                  showManualWrite={isTutorial}
                  objectNoun={typeNoun}
                  librarySource={librarySource}
                  onPickLibrarySource={pickLibrarySource}
                  media={media} addImage={addImageAsset} addImagesFromFiles={addImagesFromFiles}
                  addVideo={addVideoAsset} updateMedia={updateMedia} removeMedia={removeMedia} pickImageAsset={pickImageAsset} />
              : <S1 selected={sel} setSelected={setSel} />)}
            {step === markupStep && (
              <S2
                sources={markupSources}
                highlights={highlights} setHighlights={setHighlights}
                activeTag={activeTag} setActiveTag={setActiveTag}
                aiSuggestions={aiSuggestions} setAiSuggestions={setAiSuggestions}
                docParas={docParas}
                pages={docPages} pageCount={doc?.pageCount}
                query={query} setQuery={setQuery}
                onSuggest={usesPipeline ? handleSuggest : undefined}
                suggesting={suggesting} suggestError={suggestError}
                parsing={parsing} parseProgress={parseProgress} parseError={parseError}
                markupFlags={markupFlags} setMarkupFlags={setMarkupFlags}
                flagSummary={flagSummary}
                onScanFlags={usesPipeline ? handleScanFlags : undefined}
                scanningFlags={scanningFlags} flagError={flagError}
                definedSections={isTutorial ? tutorialDefinition.sections.filter((s) => String(s.title || '').trim()) : undefined}
              />
            )}
            {step === extractStep && (usesPipeline
              ? (
                <TutorialExtractPanel
                  markHighlights={highlights}
                  docTitle={docTitle}
                  knowledgeBase={knowledgeBase}
                  setKnowledgeBase={setKnowledgeBase}
                  shapeIntent={shapeIntent}
                  setShapeIntent={setShapeIntent}
                  objective={isTutorial ? tutorialDefinition.objective : (fv.obj || fv.verify || fv.mem || fv.what || fv.skill || fv.goal)}
                  topic={isTutorial ? undefined : (fv.topic || fv.concept || title)}
                  syncExtracts={syncExtractsFromUnits}
                  typeNoun={typeNoun}
                  clusterOutcome={clusterOutcome}
                  markupSources={markupSources}
                  tutorialDefinition={isTutorial ? tutorialDefinition : null}
                />
              )
              : <S3 extracts={extracts} setExtracts={setExtracts} markHighlights={highlights} docTitle={docTitle} typeNoun={typeNoun} />)}
            {step === defineStep && (
              <S4 typeId={typeId} title={title} setTitle={setTitle} scope={scope} setScope={setScope} fv={fv} setF={setF}
                srcCount={usesPipeline ? pdfSources.length + textSources.length + ytSources.length + webSources.length + (librarySource ? 1 : 0) : sel.length} extCount={extracts.length} hlCount={highlights.length}
                clusterCount={knowledgeBase?.clusters?.filter((c) => c.id !== UNASSIGNED_SECTION_ID).length || 0}
                writeMyself={isTutorial && srcMode === 'manual'}
                intentSuggestions={isConceptCard ? intentSuggestions : undefined}
                suggestingIntents={isConceptCard ? suggestingIntents : undefined}
                suggestIntentError={isConceptCard ? suggestIntentError : undefined}
                onSuggestIntents={isConceptCard ? handleSuggestIntents : undefined}
                tutorialDefinition={isTutorial ? tutorialDefinition : undefined}
                emptySectionCount={emptySectionCount}
                unassignedUnitCount={unassignedUnitCount}
                onEditPlan={isTutorial ? (() => goTo(planStep)) : undefined}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Generation error */}
      {usesPipeline && step === defineStep && genError && (
        <div className="flex items-start gap-2 mx-5 mb-2 rounded-2xl p-3" style={{ background: '#FEE2E2', border: '1px solid #FCA5A5' }}>
          <AlertTriangle size={15} style={{ color: '#B91C1C', marginTop: 1 }} />
          <p style={{ fontSize: 12.5, color: '#991B1B', flex: 1 }}>{genError}</p>
          <button onClick={() => setGenError(null)} className="shrink-0"><X size={14} style={{ color: '#B91C1C' }} /></button>
        </div>
      )}

      {/* Bottom bar */}
      <div className="sticky bottom-0 flex items-center justify-between px-5 py-3 border-t border-white/40" style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)' }}>
        <button onClick={() => {
          if (step > 1) { setStep(step - 1); return; }
          void leaveCreator();
        }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full border"
          style={{ fontSize: 13, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
          <ArrowLeft size={13} />{step === 1 ? 'Cancel' : 'Back'}
        </button>
        <span style={{ fontSize: 12, color: '#9AA3AF' }}>
          Step {step} of {totalSteps} · {stepMeta[step - 1]?.label}
          {(stepMeta[step - 1] as any)?.skip && ' · you can skip'}
          {isTutorial && step === planStep && !canNext && ' · add objective and at least one named section'}
          {step === sourcesStep && usesPipeline && !canNext && (pathMode === 'prompt' ? ' · describe what to generate to continue' : ' · add at least one source to continue')}
          {step === sourcesStep && usesPipeline && expandingPrompt && ' · generating source from your prompt…'}
          {step === markupStep && usesPipeline && parsing && ' · extracting text…'}
          {isTutorial && step === defineStep && unresolvedRequiredEmbeds.length > 0
            && ` · resolve ${unresolvedRequiredEmbeds.length} required embed(s) in Plan`}
        </span>
        <div className="flex items-center gap-2">
          {(stepMeta[step - 1] as any)?.skip && (
            <button onClick={advance} className="px-3 py-2 rounded-full border"
              style={{ fontSize: 12.5, color: '#6B7280', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
              Skip
            </button>
          )}
          {hasDraft && (
            <button onClick={() => setShowEditor(true)} className="px-3 py-2 rounded-full border"
              style={{ fontSize: 12.5, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
              Keep current draft →
            </button>
          )}
          <button onClick={advance} disabled={!canNext || expandingPrompt}
            className="flex items-center gap-1.5 px-5 py-2 rounded-full transition-all"
            style={{ fontSize: 13, fontWeight: 600, background: canNext && !expandingPrompt ? (step === defineStep ? '#059669' : '#0B0F1A') : '#E5E7EB', color: canNext && !expandingPrompt ? '#fff' : '#9AA3AF' }}>
            {expandingPrompt
              ? <><Loader2 size={13} className="animate-spin" />Generating source…</>
              : step === defineStep
              ? (isTutorial && srcMode === 'manual'
                ? <><PenLine size={13} />{hasDraft ? 'Rebuild blank from template' : 'Start writing'} →</>
                : <><Sparkles size={13} />✦ {hasDraft ? 'Regenerate' : 'Generate'} {NOUNS[typeId] || typeId}</>)
              : pathMode === 'prompt' && step === sourcesStep
                ? 'Generate source →'
                : 'Next →'}
          </button>
        </div>
      </div>

    </div>
      {pipelineHootPanel(stepMeta[step - 1]?.label || `Step ${step}`)}
    </>
  );
}
