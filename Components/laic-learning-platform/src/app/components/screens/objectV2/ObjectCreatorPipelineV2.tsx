/**
 * V2 object pipeline — standalone creator for quiz / flashcard-set /
 * concept-card / video-script. Same arc as the Tutorial V2 embedded-object
 * pipeline: Sources → Mark up → Extract → Define → Generate → per-type editor.
 * The Define tab keeps each type's own template-seeded knobs (Template
 * Library defaults) so generations stay unique to the template.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Check, ChevronRight, Database, Highlighter,
  Layers, Loader2, Save, Settings2, Sparkles,
} from 'lucide-react';
import { useApp } from '../../../App';
import { pastelFromHex } from '../../../../lib/pastel';
import { parsePdf, docFromText, type ParsedDoc } from '../../../../lib/pdf';
import {
  errorMessage,
  generateConceptCard,
  generateFlashcards,
  generateQuiz,
  generateVideoScript,
  ingestWeb,
  ingestYoutube,
  suggestConceptIntents,
  suggestTutorialMarkupFlags,
  type ConceptCardGenEvent,
  type FlashcardGenEvent,
  type GeneratedCard,
  type GeneratedConceptCard,
  type GeneratedQuizQuestion,
  type QuizGenEvent,
  type TutorialExtract,
  type VideoScriptGenEvent,
} from '../../../../lib/api';
import { supabaseEnabled, uploadImage } from '../../../../lib/supabase';
import { getDefaultTemplateId } from '../../../../lib/templateDefaults';
import { getObjectTemplate, type TemplateObjectType } from '../../../../lib/objectTemplates';
import { resolvePassSettings } from '../../../../lib/questionHints.js';
import {
  DEFAULT_CONCEPT_CATEGORIES,
  resolveConceptCategories,
} from '../../../../lib/conceptCard';
import { OBJECTS } from '../../../../lib/data';
import { sourcePoolToMarkupSources } from '../../../../lib/tutorialV2/draftModel';
import type { V2SourceRef } from '../../../../lib/tutorialV2/types';
import type {
  Block, ClusteredKnowledgeBase, ContentUnit, CreatorPipelineDraft,
  ObjectStatus, VideoScriptContent,
} from '../../../../lib/types';
import { MarkupWorkspace, type MarkupSource } from '../MarkupWorkspace';
import { TutorialExtractPanel } from '../TutorialExtractPanel';
import { DefineStepForm } from '../DefineStepForm';
import { ConceptCategoryEditor } from '../ObjectCreator';
import { QuizEditor } from '../QuizEditor';
import { FlashcardEditor } from '../FlashcardStudy';
import { ConceptCardEditor } from '../ConceptCardEditor';
import { VideoScriptEditor } from '../VideoScriptEditor';
import {
  TutorialV2SourcePanel,
  newSrcId,
  parseYtId,
  type PdfSrc,
  type TextSrc,
  type WebSrc,
  type YtSrc,
} from '../tutorialV2/TutorialV2SourcePanel';
import type { PickedLibrarySource } from '../CDSources';
import { useConfirm } from '../../ConfirmDialog';
import {
  getCollectionPath,
  objectCollectionIds,
} from '../../../../lib/objectCollectionsStore';

type MaterialSourceKind = 'pdf' | 'text' | 'web' | 'youtube';
type PipelinePhase = 'sources' | 'markup' | 'extract' | 'define' | 'run';

const PHASES: { id: PipelinePhase; label: string; icon: React.ReactNode }[] = [
  { id: 'sources', label: 'Sources', icon: <Database size={12} /> },
  { id: 'markup', label: 'Mark up', icon: <Highlighter size={12} /> },
  { id: 'extract', label: 'Extract', icon: <Layers size={12} /> },
  { id: 'define', label: 'Define', icon: <Settings2 size={12} /> },
  { id: 'run', label: 'Generate', icon: <Sparkles size={12} /> },
];

/** Numeric step for CreatorPipelineDraft compat (old creator used 1–4). */
const PHASE_STEP: Record<PipelinePhase, number> = {
  sources: 1, markup: 2, extract: 3, define: 4, run: 4,
};
const STEP_PHASE: Record<number, PipelinePhase> = {
  1: 'sources', 2: 'markup', 3: 'extract', 4: 'define',
};

const NOUNS: Record<string, string> = {
  quiz: 'quiz',
  'flashcard-set': 'flashcard set',
  'concept-card': 'concept card',
  'video-script': 'video script',
};

const CLUSTER_OUTCOMES: Record<string, string> = {
  quiz: 'Each cluster becomes a topic for quiz questions.',
  'flashcard-set': 'Each cluster becomes a group of related cards.',
  'concept-card': 'Clusters focus the card on one core idea and its related facets.',
  'video-script': 'Clusters become topics for video checkpoint questions.',
};

function fmtType(id: string) {
  return id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function seedFv(typeId: string): Record<string, any> {
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
}

export function ObjectCreatorPipelineV2() {
  const {
    navigate, creatorObjectType, editingObjectId, clearEditingObject, createdObjects: createdObjectsRaw,
    pendingTemplateId, setPendingTemplateId, addObject,
    objectCollections: objectCollectionsRaw, createCollectionIds, setActiveObjectCollectionId,
  } = useApp();
  const createdObjects = createdObjectsRaw || [];
  const objectCollections = objectCollectionsRaw || [];
  const confirm = useConfirm();

  const typeId = creatorObjectType || 'quiz';
  const isQuiz = typeId === 'quiz';
  const isFlashcard = typeId === 'flashcard-set';
  const isConceptCard = typeId === 'concept-card';
  const isVideoScript = typeId === 'video-script';
  const noun = NOUNS[typeId] || typeId;

  /* ── pipeline position ─────────────────────────────────────── */
  const [phase, setPhase] = useState<PipelinePhase>('sources');
  const [reachedStep, setReachedStep] = useState(1);
  const [showEditor, setShowEditor] = useState(false);

  /* ── object identity / define state ────────────────────────── */
  const [title, setTitle] = useState('');
  const [scope] = useState('program');
  const [fv, setFvState] = useState<Record<string, any>>(() => seedFv(typeId));
  const setF = (id: string, v: any) => setFvState((p) => ({ ...p, [id]: v }));
  const [editObjectId, setEditObjectId] = useState<string | null>(null);
  const [editObjectStatus, setEditObjectStatus] = useState<ObjectStatus | undefined>(undefined);

  /* ── Sources state (same shape as Tutorial V2 Sources) ─────── */
  const [pathMode, setPathModeState] = useState<'material' | 'prompt' | 'manual'>('material');
  const [enabledTypes, setEnabledTypes] = useState<Set<MaterialSourceKind>>(
    () => new Set(isVideoScript ? (['youtube'] as MaterialSourceKind[]) : (['pdf'] as MaterialSourceKind[])),
  );
  const [pdfSources, setPdfSources] = useState<PdfSrc[]>([]);
  const [textSources, setTextSources] = useState<TextSrc[]>([]);
  const [ytSources, setYtSources] = useState<YtSrc[]>([]);
  const [webSources, setWebSources] = useState<WebSrc[]>([]);
  const [libraryDoc, setLibraryDoc] = useState<ParsedDoc | null>(null);
  const [librarySource, setLibrarySource] = useState<PickedLibrarySource | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [ytUrl, setYtUrl] = useState('');
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [webUrl, setWebUrl] = useState('');
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);
  const [promptText, setPromptText] = useState('');
  const [expandPromptError, setExpandPromptError] = useState<string | null>(null);
  const [media, setMedia] = useState<any[]>([]);
  const [sourcesBusy, setSourcesBusy] = useState(false);
  const [sourcesError, setSourcesError] = useState<string | null>(null);

  /* ── Mark up / Extract state ───────────────────────────────── */
  const [highlights, setHighlights] = useState<any[]>([]);
  const [activeTag, setActiveTag] = useState('Use');
  const [aiSuggestions, setAiSuggestions] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [markupFlags, setMarkupFlags] = useState<any[]>([]);
  const [scanningFlags, setScanningFlags] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [extracts, setExtracts] = useState<TutorialExtract[]>([]);
  const [knowledgeBase, setKnowledgeBase] = useState<ClusteredKnowledgeBase | null>(null);
  const [shapeIntent, setShapeIntent] = useState('');

  /* ── Generation state ──────────────────────────────────────── */
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState('');
  const [genError, setGenError] = useState<string | null>(null);
  const [genCards, setGenCards] = useState<GeneratedCard[]>([]);
  const [genQuestions, setGenQuestions] = useState<GeneratedQuizQuestion[]>([]);
  const [quizMeta, setQuizMeta] = useState<{ passMark?: number; showExplanations?: string; adaptive?: boolean }>({});
  const [genConceptCard, setGenConceptCard] = useState<GeneratedConceptCard | null>(null);
  const [genVideoScript, setGenVideoScript] = useState<VideoScriptContent | null>(null);

  /* ── Concept-card intent suggestions (Define) ──────────────── */
  const [intentSuggestions, setIntentSuggestions] = useState<string[]>([]);
  const [suggestingIntents, setSuggestingIntents] = useState(false);
  const [suggestIntentError, setSuggestIntentError] = useState<string | null>(null);
  const intentAutoTried = useRef(false);
  const intentSuggestAbort = useRef<AbortController | null>(null);

  const genAbort = useRef<AbortController | null>(null);
  const scanAbort = useRef<AbortController | null>(null);

  const setPathMode = (m: 'material' | 'prompt' | 'manual') => {
    setPathModeState(m);
    if (m === 'material' && enabledTypes.size === 0) setEnabledTypes(new Set(['pdf'] as MaterialSourceKind[]));
  };
  const toggleMaterialType = (kind: MaterialSourceKind) => {
    setPathModeState('material');
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        if (next.size > 1) next.delete(kind);
      } else next.add(kind);
      return next;
    });
  };

  /** Compat srcMode for drafts + generation payloads. */
  const srcMode: 'pdf' | 'text' | 'youtube' | 'web' | 'prompt' | 'manual' =
    pathMode === 'prompt' || pathMode === 'manual'
      ? pathMode
      : enabledTypes.has('pdf') ? 'pdf'
        : enabledTypes.has('text') ? 'text'
          : enabledTypes.has('web') ? 'web'
            : enabledTypes.has('youtube') ? 'youtube'
              : 'pdf';

  /* ── Sources handlers (V2-identical) ───────────────────────── */
  const handleFile = (file: File) => {
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setSourcesError('That file is not a PDF. Please upload a PDF.');
      return;
    }
    setPathModeState('material');
    setEnabledTypes((prev) => new Set(prev).add('pdf'));
    setPdfSources((p) => [...p, { id: newSrcId('pdf'), file, doc: null }]);
    setSourcesError(null);
  };
  const handleLoadText = () => {
    if (!pasteText.trim()) return;
    setPathModeState('material');
    setEnabledTypes((prev) => new Set(prev).add('text'));
    const label = textSources.length ? `Pasted source ${textSources.length + 1}` : 'Pasted source';
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
      setYtSources((p) => [...p, {
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
      }]);
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
  const pickLibrarySource = (src: PickedLibrarySource | null) => {
    setLibrarySource(src);
    if (!src) {
      setLibraryDoc(null);
      return;
    }
    setPathModeState('material');
    const anySrc = src as any;
    if (Array.isArray(anySrc.sentences) && anySrc.sentences.length) {
      setLibraryDoc({
        fileName: src.title,
        pageCount: 1,
        sentences: anySrc.sentences.map((t: any) => (
          typeof t === 'string' ? { text: t, page: 1 } : { text: t.text || '', page: t.page || 1 }
        )),
      });
    } else if (anySrc.text) {
      setLibraryDoc(docFromText(String(anySrc.text), src.title));
    } else {
      setLibraryDoc({ fileName: src.title, pageCount: 0, sentences: [] });
    }
  };
  const addImagesFromFiles = (files: File[]) => {
    files.forEach((file) => {
      const id = newSrcId('img');
      const localUrl = URL.createObjectURL(file);
      setMedia((p) => [...p, { id, kind: 'image', url: localUrl, fileName: file.name, caption: '', uploading: !!supabaseEnabled() }]);
      if (supabaseEnabled()) {
        uploadImage(file).then((url) => {
          setMedia((p) => p.map((m) => (m.id === id ? { ...m, url, uploading: false } : m)));
        }).catch(() => {
          setMedia((p) => p.map((m) => (m.id === id ? { ...m, uploading: false } : m)));
        });
      }
    });
  };
  const addVideoAsset = (patch: any) => {
    setMedia((p) => [...p, { id: newSrcId('vid'), kind: 'video', ...patch }]);
  };
  const updateMedia = (id: string, patch: any) => {
    setMedia((p) => p.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };
  const removeMedia = (id: string) => setMedia((p) => p.filter((m) => m.id !== id));

  const hasAnySource = !!(
    pdfSources.length || textSources.length || ytSources.length || webSources.length || librarySource
    || (pathMode === 'prompt' && promptText.trim())
  );

  /* ── source pool → markup bundle ───────────────────────────── */
  const pool: V2SourceRef[] = useMemo(() => {
    const out: V2SourceRef[] = [];
    for (const p of pdfSources) {
      if (!p.doc?.sentences?.length) continue;
      out.push({ id: p.id, label: p.doc.fileName || p.file?.name || 'PDF', kind: 'pdf', sentences: p.doc.sentences });
    }
    for (const t of textSources) {
      out.push({ id: t.id, label: t.doc.fileName || 'Pasted notes', kind: 'text', sentences: t.doc.sentences || [] });
    }
    for (const y of ytSources) {
      out.push({ id: y.id, label: y.doc.fileName || y.videoTitle || 'YouTube transcript', kind: 'youtube', sentences: y.doc.sentences || [] });
    }
    for (const w of webSources) {
      out.push({
        id: w.id, label: w.doc.fileName || w.url || 'Website', kind: 'web',
        sentences: w.doc.sentences || [], html: w.doc.html, sourceUrl: w.doc.sourceUrl || w.url,
      });
    }
    if (libraryDoc && librarySource) {
      out.push({ id: `library-${librarySource.id}`, label: librarySource.title, kind: 'library', sentences: libraryDoc.sentences || [] });
    }
    return out;
  }, [pdfSources, textSources, ytSources, webSources, libraryDoc, librarySource]);

  const markupBundle = useMemo(() => sourcePoolToMarkupSources(pool), [pool]);

  const mergedDoc = useMemo(() => (
    markupBundle.docParas.length
      ? {
        fileName: pool[0]?.label || 'Sources',
        pageCount: Math.max(1, ...markupBundle.pages),
        sentences: markupBundle.docParas.map((text, i) => ({ text, page: markupBundle.pages[i] || 1 })),
        html: pool[0]?.html,
        sourceUrl: pool[0]?.sourceUrl,
      }
      : null
  ), [markupBundle, pool]);

  /* ── Mark up: AI document scan ─────────────────────────────── */
  const handleScanFlags = async (instruction?: string) => {
    if (!markupBundle.docParas.length) {
      setFlagError('Parse or load a source first.');
      return;
    }
    const focus = String(instruction || '').trim();
    if (!focus) {
      setFlagError(`Enter a scan focus for this ${noun} (e.g. what learners must master).`);
      return;
    }
    scanAbort.current?.abort();
    const ctrl = new AbortController();
    scanAbort.current = ctrl;
    setFlagError(null);
    setScanningFlags(true);
    try {
      const result = await suggestTutorialMarkupFlags(
        markupBundle.docParas.map((text, i) => ({ text, page: markupBundle.pages[i] || 1 })),
        {
          instruction: focus,
          objective: String(fv.obj || fv.verify || fv.mem || fv.concept || '').trim() || focus,
          title: title || undefined,
        },
        ctrl.signal,
      );
      setMarkupFlags(result.flags || []);
      if (!(result.flags || []).length) {
        setFlagError('No review items found — try a clearer scan focus, or mark up manually.');
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setFlagError(errorMessage(e, 'Document scan failed — is the API running?'));
    } finally {
      setScanningFlags(false);
      scanAbort.current = null;
    }
  };

  /* ── Extract helpers ───────────────────────────────────────── */
  const syncExtractsFromUnits = (units: ContentUnit[]) => {
    setExtracts(units.map((u) => ({
      kind: u.kind,
      text: u.text,
      from: u.from,
      authorNote: u.authorNote || undefined,
    })));
  };

  const extractsForGeneration = () =>
    extracts.map((e: any) => ({
      kind: e.kind,
      text: e.text,
      from: e.from,
      authorNote: e.authorNote || e.comment || undefined,
    }));

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

  /** Marked-up units for concept cards: extracts first, else Use/Support highlights. */
  const conceptMarkupUnits = () => {
    if (extracts.length) {
      return extracts
        .filter((e: any) => String(e.text || '').trim())
        .map((e: any) => ({
          kind: e.kind || 'Extract',
          text: e.text,
          from: e.from,
          authorNote: e.authorNote || undefined,
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

  useEffect(() => {
    if (!isConceptCard) return;
    intentAutoTried.current = false;
    setIntentSuggestions([]);
    setSuggestIntentError(null);
  }, [isConceptCard, extracts.length, highlights.length]);

  useEffect(() => {
    if (!isConceptCard || phase !== 'define') return;
    if (intentAutoTried.current || suggestingIntents) return;
    if (conceptMarkupUnits().length === 0) return;
    intentAutoTried.current = true;
    void handleSuggestIntents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConceptCard, phase, extracts.length, highlights.length]);

  /* ── Template application ──────────────────────────────────── */
  const pendingApplied = useRef(false);
  useEffect(() => {
    if (!pendingTemplateId || pendingApplied.current || editingObjectId) return;
    pendingApplied.current = true;
    const t = getObjectTemplate(pendingTemplateId, typeId as TemplateObjectType);
    if (t) setFvState((p) => ({ ...p, templateId: t.id, ...t.knobDefaults }));
    setPendingTemplateId(null);
  }, [pendingTemplateId, typeId, editingObjectId, setPendingTemplateId]);

  /* ── Persistence (CreatorPipelineDraft-compatible) ─────────── */
  const snapshotPipeline = (): CreatorPipelineDraft => ({
    srcMode,
    promptText,
    pasteText,
    ytUrl: ytSources[0]?.url || ytUrl || undefined,
    webUrl: webSources[0]?.url || webUrl || undefined,
    doc: mergedDoc,
    highlights,
    markupFlags: markupFlags.length ? markupFlags : undefined,
    extracts,
    knowledgeBase: knowledgeBase || undefined,
    templateId: fv.templateId,
    shapeIntent: shapeIntent || undefined,
    fv,
    scope,
    media,
    reached: reachedStep,
    step: PHASE_STEP[phase],
  });

  const persistPipelineDraft = (opts?: { blocks?: Block[]; description?: string }) => {
    const keepStatus: ObjectStatus = editObjectStatus === 'in-review' ? 'in-review' : 'draft';
    const existing = editObjectId
      ? createdObjects.find((o) => o.id === editObjectId)
      : undefined;
    const draftTitle = (title || `Untitled ${fmtType(typeId)}`).trim() || `Untitled ${fmtType(typeId)}`;
    const description = opts?.description != null
      ? opts.description
      : String(fv.obj || fv.verify || fv.mem || fv.concept || existing?.description || '').trim();
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

  const saveGeneratedDraft = (blocks: Block[], description?: string) => (
    persistPipelineDraft({ blocks, description: description || '' })
  );

  // Seed a library draft as soon as the creator opens (fresh create only).
  const draftSeededRef = useRef(false);
  useEffect(() => {
    if (editingObjectId) {
      draftSeededRef.current = true;
      return;
    }
    if (draftSeededRef.current || editObjectId) return;
    draftSeededRef.current = true;
    persistPipelineDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingObjectId, typeId]);

  // Keep the library draft in sync while authoring.
  useEffect(() => {
    if (!draftSeededRef.current || !editObjectId) return;
    if (editingObjectId) return; // wait until library restore finishes
    const t = window.setTimeout(() => { persistPipelineDraft(); }, 450);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    editObjectId, editingObjectId,
    title, phase, reachedStep, fv,
    pathMode, promptText, pasteText, ytUrl, webUrl,
    pdfSources, textSources, ytSources, webSources, librarySource,
    highlights, markupFlags, extracts, knowledgeBase, shapeIntent, media,
  ]);

  /* ── Reopen from Content Library ───────────────────────────── */
  const restored = useRef(false);
  useEffect(() => {
    restored.current = false;
  }, [editingObjectId]);

  useEffect(() => {
    if (restored.current || !editingObjectId) return;
    const obj = createdObjects.find((o) => o.id === editingObjectId) || OBJECTS.find((o) => o.id === editingObjectId);
    if (!obj || obj.type !== typeId) return;
    restored.current = true;
    setTitle(obj.title);
    setEditObjectId(obj.id);
    setEditObjectStatus(obj.status);

    const d = obj.pipelineDraft;
    if (d) {
      if (d.srcMode === 'prompt' || d.srcMode === 'manual') setPathModeState(d.srcMode);
      if (d.promptText != null) setPromptText(d.promptText);
      if (d.pasteText != null) setPasteText(d.pasteText);
      if (d.ytUrl != null) setYtUrl(d.ytUrl);
      if (d.webUrl != null) setWebUrl(d.webUrl);
      if (d.doc) {
        const restoredDoc = d.doc as ParsedDoc;
        if (d.srcMode === 'youtube') {
          setYtSources([{
            id: newSrcId('yt'),
            url: d.ytUrl || '',
            videoId: parseYtId(d.ytUrl || ''),
            videoTitle: restoredDoc.fileName || '',
            segments: [],
            doc: restoredDoc,
          }]);
          setEnabledTypes(new Set(['youtube'] as MaterialSourceKind[]));
        } else if (d.srcMode === 'web') {
          setWebSources([{ id: newSrcId('web'), url: d.webUrl || restoredDoc.sourceUrl || '', doc: restoredDoc }]);
          setEnabledTypes(new Set(['web'] as MaterialSourceKind[]));
        } else if (d.srcMode === 'pdf') {
          setPdfSources([{ id: newSrcId('pdf'), file: null, doc: restoredDoc }]);
          setEnabledTypes(new Set(['pdf'] as MaterialSourceKind[]));
        } else {
          setTextSources([{ id: newSrcId('text'), doc: restoredDoc }]);
          setPathModeState('material');
          setEnabledTypes(new Set(['text'] as MaterialSourceKind[]));
        }
      }
      if (d.highlights) setHighlights(d.highlights);
      if (Array.isArray(d.markupFlags)) setMarkupFlags(d.markupFlags);
      if (d.extracts) setExtracts(d.extracts);
      if (d.knowledgeBase) setKnowledgeBase(d.knowledgeBase);
      if (d.shapeIntent != null) setShapeIntent(d.shapeIntent);
      if (d.fv) {
        setFvState({ ...d.fv, templateId: d.fv.templateId || d.templateId || getDefaultTemplateId(typeId as TemplateObjectType) });
      } else if (d.templateId) {
        setFvState((p) => ({ ...p, templateId: d.templateId }));
      }
      if (d.media) setMedia(d.media);
    } else if (obj.description) {
      const intentField = isQuiz ? 'verify' : isFlashcard ? 'mem' : isConceptCard ? 'concept' : 'obj';
      setFvState((p) => ({ ...p, [intentField]: obj.description }));
    }

    const hasGenerated = (obj.blocks || []).length > 0;
    if (typeof d?.step === 'number' && typeof d?.reached === 'number') {
      const r = Math.max(1, Math.min(4, d.reached));
      const s = Math.max(1, Math.min(r, d.step));
      setReachedStep(r);
      setPhase(STEP_PHASE[s] || 'sources');
    } else if (hasGenerated) {
      setReachedStep(4);
      setPhase('define');
    } else {
      setReachedStep(1);
      setPhase('sources');
    }

    if (hasGenerated) {
      if (isFlashcard) {
        const cards = (obj.blocks || [])
          .filter((b) => b.type === 'flashcard-set')
          .flatMap((b) => (((b.content as any)?.cards) || []).map((c: any, i: number) => ({
            id: `c-${i}`, front: c.front, back: c.back, hook: c.hook, hint: c.hint, imageUrl: c.imageUrl,
          })));
        setGenCards(cards);
      } else if (isQuiz) {
        const quizBlock = (obj.blocks || []).find((b) => b.type === 'quiz');
        const c = (quizBlock?.content || {}) as any;
        setGenQuestions((c.questions || []).map((q: any, i: number) => ({
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
        })));
        setQuizMeta({ passMark: c.passMark, showExplanations: c.showExplanations, adaptive: !!c.adaptive });
      } else if (isConceptCard) {
        const ccBlock = (obj.blocks || []).find((b) => b.type === 'concept-card');
        const c = (ccBlock?.content || {}) as any;
        if (c.term || c.definition || c.oneSentenceMeaning) {
          setGenConceptCard({
            id: ccBlock?.id || 'cc-edit',
            ...c,
            term: c.term || '',
            definition: c.oneSentenceMeaning || c.definition || '',
          });
        }
      } else if (isVideoScript) {
        const blk = (obj.blocks || []).find((b) => b.type === 'video-script');
        if (blk?.content) {
          const c = blk.content as VideoScriptContent;
          setGenVideoScript(c);
          if (c.videoUrl) setYtUrl(c.videoUrl);
          setFvState((p) => ({
            ...p,
            showTranscript: c.showTranscript !== false,
            enableChat: c.enableChat !== false,
            ncp: c.checkpoints?.length || p.ncp || 4,
          }));
        }
      }
      setShowEditor(true);
    }
    clearEditingObject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingObjectId, createdObjects]);

  /* ── Save-draft confirm (folder path) ──────────────────────── */
  const draftCollectionLabel = (): { ids: string[]; label: string } => {
    const existing = editObjectId
      ? createdObjects.find((o) => o.id === editObjectId)
      : undefined;
    const fromExisting = existing ? objectCollectionIds(existing) : [];
    const useIds = fromExisting.length ? fromExisting : (createCollectionIds || []);
    const names = useIds.map((id) => {
      const path = getCollectionPath(objectCollections, id);
      const self = objectCollections.find((c) => c.id === id);
      if (!self) return null;
      if (!path.length) return self.name;
      return [...path.map((p) => p.name), self.name].join(' / ');
    }).filter(Boolean) as string[];
    const label = names.length
      ? names.map((n) => `“${n}”`).join(', ')
      : '“My content”';
    return { ids: useIds, label };
  };

  const saveDraft = async () => {
    persistPipelineDraft();
    const { ids, label } = draftCollectionLabel();
    if (ids[0]) setActiveObjectCollectionId?.(ids[0]);
    const continueEditing = await confirm({
      title: 'Saved',
      description: `Saved in folder ${label}. Open Content Library and go to that folder to find and continue this content.`,
      confirmLabel: 'Continue editing',
      cancelLabel: 'Go to Content Library',
      destructive: false,
      dismissValue: true,
    });
    if (continueEditing) return;
    clearEditingObject?.();
    navigate('cd-library', { libraryFolderId: ids[0] || null });
  };

  /* ── Phase navigation ──────────────────────────────────────── */
  const reach = (p: PipelinePhase) => {
    setPhase(p);
    setReachedStep((r) => Math.max(r, PHASE_STEP[p]));
  };

  const continueFromSources = async () => {
    setSourcesBusy(true);
    setSourcesError(null);
    try {
      const pending = pdfSources.filter((e) => e.file && !e.doc);
      if (pending.length) {
        let nextPdf = pdfSources;
        for (const entry of pending) {
          const file = entry.file!;
          try {
            const parsed = await parsePdf(file, () => {});
            nextPdf = nextPdf.map((p) => (p.id === entry.id ? { ...p, doc: parsed } : p));
          } catch (e) {
            nextPdf = nextPdf.map((p) => (p.id === entry.id
              ? { ...p, doc: { fileName: file.name, pageCount: 0, sentences: [] } }
              : p));
            setSourcesError(e instanceof Error ? e.message : 'Could not read a PDF.');
          }
        }
        setPdfSources(nextPdf);
      }
      if (pathMode === 'prompt') {
        reach('define');
      } else {
        reach('markup');
      }
    } finally {
      setSourcesBusy(false);
    }
  };

  const goToPhase = (p: PipelinePhase) => {
    if (p === 'run') return; // Generate is entered via the Define button only
    if ((p === 'markup' || p === 'extract') && pathMode === 'prompt') return;
    if (PHASE_STEP[p] <= reachedStep) setPhase(p);
  };

  /* ── Generation ────────────────────────────────────────────── */
  const ensureExtractReady = (): boolean => {
    if (srcMode === 'prompt' || srcMode === 'manual') return true;
    const hasUnits = (knowledgeBase?.units?.length || 0) > 0 || extracts.some((e: any) => String(e.text || '').trim());
    if (hasUnits) return true;
    setGenError('Build clusters in Extract first (Pull & cluster), then continue in Define.');
    return false;
  };

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
      const collected: GeneratedCard[] = [];
      for await (const ev of generateFlashcards({
        title,
        config,
        extracts: extractsForGeneration(),
        highlights: highlightsForGeneration(),
        prompt: srcMode === 'prompt' ? promptText : undefined,
        images: uploadedImages,
        knowledgeBase: knowledgeBase || undefined,
        shapeIntent: shapeIntent || undefined,
      }, ctrl.signal) as AsyncGenerator<FlashcardGenEvent>) {
        if (ev.type === 'progress') setGenProgress(ev.message);
        else if (ev.type === 'card') {
          collected.push({ ...ev.card });
          setGenCards(attachUploadedImages(collected));
        } else if (ev.type === 'error') throw new Error(ev.message);
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
      const collected: GeneratedQuizQuestion[] = [];
      let doneMeta: { passMark?: number; passRequired?: boolean; showExplanations?: string; adaptive?: boolean } = {};
      for await (const ev of generateQuiz({
        title,
        config,
        extracts: extractsForGeneration(),
        highlights: highlightsForGeneration(),
        prompt: srcMode === 'prompt' ? promptText : undefined,
        knowledgeBase: knowledgeBase || undefined,
        shapeIntent: shapeIntent || undefined,
      }, ctrl.signal) as AsyncGenerator<QuizGenEvent>) {
        if (ev.type === 'progress') setGenProgress(ev.message);
        else if (ev.type === 'question') {
          collected.push(ev.question);
          setGenQuestions([...collected]);
        } else if (ev.type === 'error') throw new Error(ev.message);
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
      let card: GeneratedConceptCard | null = null;
      for await (const ev of generateConceptCard({
        title,
        config,
        extracts: extractsForGeneration(),
        highlights: highlightsForGeneration(),
        markupUnits: markup,
        prompt: srcMode === 'prompt' ? promptText : undefined,
        knowledgeBase: knowledgeBase || undefined,
        shapeIntent: shapeIntent || undefined,
      }, ctrl.signal) as AsyncGenerator<ConceptCardGenEvent>) {
        if (ev.type === 'progress') setGenProgress(ev.message);
        else if (ev.type === 'card') {
          card = ev.card;
          setGenConceptCard(ev.card);
        } else if (ev.type === 'error') throw new Error(ev.message);
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

  const runGenerateVideoScript = async () => {
    const yt = ytSources[0];
    const videoUrl = (yt?.url || ytUrl).trim();
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
      let content: VideoScriptContent | null = null;
      for await (const ev of generateVideoScript({
        title,
        config,
        extracts: extractsForGeneration(),
        highlights: highlightsForGeneration(),
        prompt: srcMode === 'prompt' ? promptText : undefined,
        videoUrl: videoUrl || undefined,
        videoId: yt?.videoId || parseYtId(videoUrl) || undefined,
        videoTitle: yt?.videoTitle || undefined,
        transcriptSegments: yt?.segments?.length ? yt.segments : undefined,
        knowledgeBase: knowledgeBase || undefined,
        shapeIntent: shapeIntent || undefined,
      }, ctrl.signal) as AsyncGenerator<VideoScriptGenEvent>) {
        if (ev.type === 'progress') setGenProgress(ev.message);
        else if (ev.type === 'result') { content = ev.content; setGenVideoScript(ev.content); }
        else if (ev.type === 'error') throw new Error(ev.message);
        else if (ev.type === 'done') break;
      }
      if (!content?.videoId || !content.checkpoints?.length) {
        throw new Error('No video script was generated.');
      }
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
    genCards.length > 0 || genQuestions.length > 0 || !!genConceptCard || !!genVideoScript;

  const startGenerate = async () => {
    if (hasDraftContent()) {
      const ok = await confirm({
        title: 'Are you sure you want to regenerate?',
        description: `Regenerate this ${noun}? The current draft will be replaced.`,
        confirmLabel: 'Regenerate',
        destructive: true,
      });
      if (!ok) return;
    }
    reach('run');
    if (isFlashcard) return void runGenerateFlashcards();
    if (isQuiz) return void runGenerateQuiz();
    if (isConceptCard) return void runGenerateConceptCard();
    if (isVideoScript) return void runGenerateVideoScript();
  };

  const cancelGenerate = () => {
    genAbort.current?.abort();
    setGenerating(false);
    setPhase('define');
  };

  const backToPipeline = (synced?: {
    cards?: GeneratedCard[];
    questions?: GeneratedQuizQuestion[];
    conceptCard?: GeneratedConceptCard | null;
    videoScript?: VideoScriptContent | null;
  }) => {
    if (synced?.cards) setGenCards(synced.cards);
    if (synced?.questions) setGenQuestions(synced.questions);
    if (synced && 'conceptCard' in synced) setGenConceptCard(synced.conceptCard || null);
    if (synced && 'videoScript' in synced) setGenVideoScript(synced.videoScript || null);
    setShowEditor(false);
    setReachedStep(4);
    setPhase('define');
  };

  /* ── Editors (post-generate) ───────────────────────────────── */
  if (showEditor) {
    const draft = snapshotPipeline();
    if (isFlashcard) {
      return (
        <FlashcardEditor typeId={typeId} title={title} scope={scope} fv={fv} cards={genCards}
          initialId={editObjectId || undefined}
          initialStatus={editObjectStatus}
          pipelineDraft={draft}
          onBack={(cards?: GeneratedCard[]) => backToPipeline(cards ? { cards } : undefined)}
          onDone={() => navigate('cd-library')} />
      );
    }
    if (isQuiz) {
      return (
        <QuizEditor typeId={typeId} title={title} scope={scope} fv={fv} questions={genQuestions}
          passMark={quizMeta.passMark}
          showExplanations={quizMeta.showExplanations}
          adaptive={quizMeta.adaptive}
          initialId={editObjectId || undefined}
          initialStatus={editObjectStatus}
          pipelineDraft={draft}
          onBack={(questions?: GeneratedQuizQuestion[]) => backToPipeline(questions ? { questions } : undefined)}
          onDone={() => navigate('cd-library')} />
      );
    }
    if (isConceptCard) {
      return (
        <ConceptCardEditor typeId={typeId} title={title} scope={scope} fv={fv} card={genConceptCard}
          initialId={editObjectId || undefined}
          initialStatus={editObjectStatus}
          pipelineDraft={draft}
          onBack={(card?: any) => backToPipeline({ conceptCard: card || null })}
          onDone={() => navigate('cd-library')} />
      );
    }
    return (
      <VideoScriptEditor typeId={typeId} title={title} scope={scope} fv={fv} content={genVideoScript}
        initialId={editObjectId || undefined}
        initialStatus={editObjectStatus}
        pipelineDraft={draft}
        onBack={() => backToPipeline()}
        onDone={() => navigate('cd-library')} />
    );
  }

  /* ── Shared chrome ─────────────────────────────────────────── */
  const rail = (
    <div className="flex items-center gap-0 overflow-x-auto py-1">
      {PHASES.map((s, i) => {
        const stepNo = PHASE_STEP[s.id];
        const isActive = s.id === phase;
        const promptSkipped = (s.id === 'markup' || s.id === 'extract') && pathMode === 'prompt';
        const isPast = !isActive && stepNo < PHASE_STEP[phase] && !promptSkipped;
        const canClick = !promptSkipped && s.id !== 'run' && stepNo <= reachedStep && !isActive;
        return (
          <React.Fragment key={s.id}>
            <button
              type="button"
              disabled={!canClick && !isActive}
              onClick={() => canClick && goToPhase(s.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all shrink-0"
              style={{
                background: isActive ? '#0B0F1A' : isPast ? 'rgba(5,150,105,0.1)' : 'rgba(255,255,255,0.7)',
                color: isActive ? '#fff' : isPast ? '#059669' : '#9AA3AF',
                border: `1.5px solid ${isActive ? '#0B0F1A' : isPast ? '#059669' : 'rgba(0,0,0,0.08)'}`,
                cursor: canClick ? 'pointer' : 'default',
                opacity: canClick || isActive || isPast ? 1 : 0.55,
              }}
              title={canClick ? `Go to ${s.label}` : undefined}
            >
              {isPast ? <Check size={12} /> : s.icon}
              <span style={{ fontSize: 12.5, fontWeight: isActive ? 650 : 500 }}>{s.label}</span>
            </button>
            {i < PHASES.length - 1 && (
              <ChevronRight size={13} style={{ color: '#C4CBD4', margin: '0 3px', flexShrink: 0 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );

  const saveButton = (
    <button
      type="button"
      onClick={() => void saveDraft()}
      className="fixed bottom-5 left-5 z-40 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full"
      style={{
        fontSize: 13.5,
        fontWeight: 650,
        color: '#065F46',
        background: pastelFromHex('#059669', 0.82),
        border: '1px solid rgba(5,150,105,0.3)',
        boxShadow: '0 10px 28px -12px rgba(5,150,105,0.55)',
      }}
    >
      <Save size={15} /> Save
    </button>
  );

  const template = getObjectTemplate(
    fv.templateId || getDefaultTemplateId(typeId as TemplateObjectType),
    typeId as TemplateObjectType,
  );

  const continueButton = (label: string, onClick: () => void, disabled = false) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="mt-4 px-4 py-2 rounded-full text-white disabled:opacity-40"
      style={{ fontSize: 13, fontWeight: 600, background: '#0B0F1A' }}
    >
      {label}
    </button>
  );

  const header = (h: { title: string; subtitle: string; backLabel: string; onBack: () => void }) => (
    <div className="max-w-4xl mx-auto mb-4">
      <div className="flex items-center gap-3 mb-3">
        <button
          type="button"
          onClick={h.onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-white/70"
          style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}
        >
          <ArrowLeft size={14} /> {h.backLabel}
        </button>
      </div>
      {rail}
      <h1 style={{ fontSize: 22, fontWeight: 750, color: '#0B1220', letterSpacing: '-0.3px', marginTop: 12 }}>{h.title}</h1>
      <p style={{ fontSize: 13.5, color: '#6B7280', marginTop: 4 }}>{h.subtitle}</p>
      {template ? (
        <p className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full" style={{ fontSize: 11.5, fontWeight: 650, background: '#F5F3FF', color: '#6D28D9', border: '1px solid rgba(124,58,237,0.25)' }}>
          Template · {template.name}
        </p>
      ) : null}
    </div>
  );

  const bg = { background: 'linear-gradient(180deg, #F4F6FB 0%, #EEF1F8 100%)' };

  /* ── A. Sources ────────────────────────────────────────────── */
  if (phase === 'sources') {
    return (
      <>
        <div className="min-h-full flex flex-col" style={bg}>
          <div className="px-5 pt-5 pb-2 shrink-0">
            {header({
              title: 'Sources',
              subtitle: `Material this ${noun} draws on — PDF, paste, website, YouTube, library, or an AI prompt`,
              backLabel: 'Back to Create',
              onBack: () => { clearEditingObject?.(); navigate('cd-create'); },
            })}
          </div>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <TutorialV2SourcePanel
              pathMode={pathMode}
              setPathMode={setPathMode}
              enabledTypes={enabledTypes}
              toggleMaterialType={toggleMaterialType}
              pdfSources={pdfSources}
              onRemovePdf={(id: string) => setPdfSources((p) => p.filter((x) => x.id !== id))}
              onFile={handleFile}
              textSources={textSources}
              pasteText={pasteText}
              setPasteText={setPasteText}
              onLoadText={handleLoadText}
              onRemoveText={(id: string) => setTextSources((p) => p.filter((x) => x.id !== id))}
              ytSources={ytSources}
              ytUrl={ytUrl}
              setYtUrl={setYtUrl}
              ytLoading={ytLoading}
              ytError={ytError}
              onFetchYoutube={handleFetchYoutube}
              onRemoveYoutube={(id: string) => setYtSources((p) => p.filter((x) => x.id !== id))}
              webSources={webSources}
              webUrl={webUrl}
              setWebUrl={setWebUrl}
              webLoading={webLoading}
              webError={webError}
              onFetchWeb={handleFetchWeb}
              onRemoveWeb={(id: string) => setWebSources((p) => p.filter((x) => x.id !== id))}
              promptText={promptText}
              setPromptText={setPromptText}
              expandPromptError={expandPromptError}
              setExpandPromptError={setExpandPromptError}
              showMedia={!isVideoScript}
              imagesOnly={isFlashcard}
              showManualWrite={false}
              objectNoun={noun}
              librarySource={librarySource}
              onPickLibrarySource={pickLibrarySource}
              media={media}
              addImagesFromFiles={addImagesFromFiles}
              addVideo={addVideoAsset}
              updateMedia={updateMedia}
              removeMedia={removeMedia}
            />
          </div>
          {(sourcesError || sourcesBusy) && (
            <div className="px-5 py-2 shrink-0" style={{ fontSize: 13, color: sourcesError ? '#B91C1C' : '#6B7280' }}>
              {sourcesBusy ? (
                <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Preparing sources…</span>
              ) : sourcesError}
            </div>
          )}
          <div
            className="shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-t"
            style={{ background: 'rgba(255,255,255,0.92)', borderColor: 'rgba(0,0,0,0.06)' }}
          >
            <p style={{ fontSize: 12.5, color: '#6B7280' }}>
              {hasAnySource
                ? (pathMode === 'prompt'
                  ? 'Prompt-only path — skips Mark up and Extract, straight to Define'
                  : 'Continue to mark up what matters in these sources')
                : `Add at least one source${isVideoScript ? ' (YouTube recommended for the video player)' : ''}, or switch to an AI prompt`}
            </p>
            <button
              type="button"
              disabled={sourcesBusy || !hasAnySource}
              onClick={() => void continueFromSources()}
              className="px-5 py-2.5 rounded-full text-white disabled:opacity-50"
              style={{ fontSize: 13, fontWeight: 650, background: '#0B0F1A' }}
            >
              Continue →
            </button>
          </div>
        </div>
        {saveButton}
      </>
    );
  }

  /* ── B. Mark up ────────────────────────────────────────────── */
  if (phase === 'markup') {
    return (
      <>
        <div className="min-h-full px-4 py-5" style={{ ...bg, paddingBottom: 88 }}>
          {header({
            title: 'Mark up',
            subtitle: 'Highlight and comment on what matters — generation follows your markup',
            backLabel: 'Back to Sources',
            onBack: () => goToPhase('sources'),
          })}
          <div className="max-w-6xl mx-auto">
            {!markupBundle.docParas.length ? (
              <p style={{ fontSize: 13.5, color: '#B45309' }}>Add sources with text first.</p>
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
                onScanFlags={handleScanFlags}
                scanningFlags={scanningFlags}
                flagError={flagError}
                definedSections={[]}
              />
            )}
            {continueButton('Continue to extract →', () => reach('extract'))}
          </div>
        </div>
        {saveButton}
      </>
    );
  }

  /* ── C. Extract ────────────────────────────────────────────── */
  if (phase === 'extract') {
    return (
      <>
        <div className="min-h-full px-4 py-5" style={{ ...bg, paddingBottom: 88 }}>
          {header({
            title: 'Extract',
            subtitle: 'Pull your marked-up content into clustered units the generator draws on',
            backLabel: 'Back to Mark up',
            onBack: () => goToPhase('markup'),
          })}
          <div className="max-w-6xl mx-auto">
            <TutorialExtractPanel
              markHighlights={highlights}
              docTitle={mergedDoc?.fileName || 'Source'}
              knowledgeBase={knowledgeBase}
              setKnowledgeBase={setKnowledgeBase}
              shapeIntent={shapeIntent}
              setShapeIntent={setShapeIntent}
              objective={String(fv.obj || fv.verify || fv.mem || fv.concept || '').trim() || undefined}
              topic={title}
              syncExtracts={syncExtractsFromUnits}
              typeNoun={noun}
              clusterOutcome={CLUSTER_OUTCOMES[typeId] || `Each cluster groups material for this ${noun}.`}
              markupSources={markupBundle.sources}
            />
            {continueButton('Continue to define →', () => reach('define'))}
          </div>
        </div>
        {saveButton}
      </>
    );
  }

  /* ── D. Define (template-seeded, per type) ─────────────────── */
  if (phase === 'define') {
    return (
      <>
        <div className="min-h-full px-4 py-5" style={{ ...bg, paddingBottom: 88 }}>
          {header({
            title: 'Define',
            subtitle: `Objective and approach — pre-filled by the “${template?.name || 'default'}” template, everything editable`,
            backLabel: pathMode === 'prompt' ? 'Back to Sources' : 'Back to Extract',
            onBack: () => goToPhase(pathMode === 'prompt' ? 'sources' : 'extract'),
          })}
          <div className="max-w-4xl mx-auto">
            {genError && (
              <div className="mb-3 flex items-start gap-2 px-3 py-2.5 rounded-xl max-w-2xl" style={{ background: '#FEF2F2', color: '#991B1B', fontSize: 13 }}>
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{genError}</span>
              </div>
            )}
            {isConceptCard && (intentSuggestions.length > 0 || suggestingIntents || suggestIntentError) && (
              <div className="mb-4 p-3 rounded-2xl border max-w-2xl" style={{ background: 'rgba(255,255,255,0.7)', borderColor: 'rgba(0,0,0,0.08)' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', marginBottom: 8 }}>
                  {suggestingIntents ? 'Suggesting intents from your markup…' : 'Intent suggestions from your markup'}
                </p>
                {suggestIntentError && <p style={{ fontSize: 12, color: '#B45309' }}>{suggestIntentError}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {intentSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setF('concept', s)}
                      className="px-3 py-1 rounded-full border transition-all"
                      style={{
                        fontSize: 12,
                        fontWeight: fv.concept === s ? 650 : 400,
                        background: fv.concept === s ? '#0B0F1A' : 'rgba(255,255,255,0.8)',
                        color: fv.concept === s ? '#fff' : '#374151',
                        borderColor: fv.concept === s ? '#0B0F1A' : 'rgba(0,0,0,0.1)',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <DefineStepForm
              typeId={typeId}
              title={title}
              setTitle={setTitle}
              fv={fv}
              setF={setF}
              srcCount={pool.length || (pathMode === 'prompt' && promptText.trim() ? 1 : 0)}
              extCount={extracts.length || (knowledgeBase?.units?.length ?? 0)}
              clusterCount={knowledgeBase?.clusters?.length || 0}
              templateName={template?.name || null}
              afterGroups={isConceptCard ? (
                <ConceptCategoryEditor
                  categories={resolveConceptCategories(fv.categories)}
                  onChange={(next) => setF('categories', next)}
                />
              ) : undefined}
              footer={(
                <button
                  type="button"
                  disabled={generating}
                  onClick={() => void startGenerate()}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-white disabled:opacity-40"
                  style={{ fontSize: 13, fontWeight: 650, background: '#059669' }}
                >
                  {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {hasDraftContent() ? `Regenerate ${noun}` : `Generate ${noun}`}
                </button>
              )}
            />
          </div>
        </div>
        {saveButton}
      </>
    );
  }

  /* ── E. Generate (streaming) ───────────────────────────────── */
  const streamed = isFlashcard
    ? genCards.map((c, i) => ({ id: c.id || `c-${i}`, label: c.front }))
    : isQuiz
      ? genQuestions.map((q, i) => ({ id: q.id || `q-${i}`, label: q.question }))
      : isVideoScript && genVideoScript
        ? genVideoScript.checkpoints.map((c) => ({ id: c.id, label: c.question.question }))
        : genConceptCard
          ? [{ id: genConceptCard.id || 'cc', label: genConceptCard.term || 'Concept card' }]
          : [];

  return (
    <>
      <div className="min-h-full px-4 py-5" style={{ ...bg, paddingBottom: 88 }}>
        {header({
          title: `Generating ${noun}`,
          subtitle: 'Grounded in your sources, markup, and Define settings',
          backLabel: 'Back to Define',
          onBack: () => { if (!generating) setPhase('define'); },
        })}
        <div className="max-w-2xl mx-auto py-8 text-center">
          {generating ? (
            <>
              <Loader2 size={28} className="animate-spin mx-auto mb-3" style={{ color: '#0B0F1A' }} />
              <p style={{ fontSize: 14, fontWeight: 650 }}>Generating {noun}…</p>
              <p style={{ fontSize: 13, color: '#6B7280', marginTop: 6 }}>{genProgress}</p>
              {streamed.length > 0 && (
                <div className="mt-5 space-y-1.5 text-left">
                  {streamed.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border" style={{ background: 'rgba(255,255,255,0.8)', borderColor: 'rgba(0,0,0,0.06)' }}>
                      <Check size={12} style={{ color: '#059669', flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, color: '#0B1220' }} className="truncate">{p.label}</span>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={cancelGenerate}
                className="mt-6 px-4 py-2 rounded-full border"
                style={{ fontSize: 12.5, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}
              >
                Cancel
              </button>
            </>
          ) : genError ? (
            <>
              <p style={{ fontSize: 14, color: '#B91C1C', marginBottom: 12 }}>{genError}</p>
              <button
                type="button"
                onClick={() => setPhase('define')}
                className="px-4 py-2 rounded-full text-white"
                style={{ fontSize: 13, fontWeight: 600, background: '#0B0F1A' }}
              >
                Back to define
              </button>
            </>
          ) : (
            <p style={{ fontSize: 13.5, color: '#065F46' }}>
              Generated — opening the {noun} editor so you can refine it.
            </p>
          )}
        </div>
      </div>
      {saveButton}
    </>
  );
}
