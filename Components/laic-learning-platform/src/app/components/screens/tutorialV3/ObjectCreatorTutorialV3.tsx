/**
 * Tutorial V3 object creator — Approach 2 section-by-section authoring.
 * Mounted only when creatorObjectType === "tutorial-v3".
 * Flow: Plan → Structure → Sources → Navigator ⇄ Section workspace → Review.
 * (Create flow: folder modal → path modal → then Plan.)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Plus, Trash2, Loader2, Send, Save,
  Check, ChevronRight, ListOrdered, LayoutList, Database, PenLine, Eye,
} from 'lucide-react';
import { composePublisher } from '../../../../lib/clubComposeBridge';
import { useApp, type AddObjectOptions } from '../../../App';
import { pastelFromHex } from '../../../../lib/pastel';
import { parsePdf, docFromText, type ParsedDoc } from '../../../../lib/pdf';
import {
  errorMessage, ingestYoutube, ingestWeb, pasteYoutubeTranscript,
} from '../../../../lib/api';
import { supabaseEnabled, uploadImage } from '../../../../lib/supabase';
import { getDefaultTemplateId } from '../../../../lib/templateDefaults';
import {
  BLANK_CANVAS_TUTORIAL_TEMPLATE_ID,
  DEFAULT_TUTORIAL_TEMPLATE_ID,
  WRITE_YOURSELF_TUTORIAL_TEMPLATE_ID,
  getTutorialTemplate,
  isBlankCanvasTutorial,
  isWriteYourselfTutorial,
  writeYourselfTutorialTemplate,
} from '../../../../lib/tutorialV3/tutorialTemplates';
import {
  clearTutorialV3LaunchTemplate,
  resolveTutorialV3LaunchTemplate,
} from '../../../../lib/tutorialV3/launchTemplate';
import {
  allRequiredDone,
  applySectionPatchToSlot,
  assembleAllParts,
  draftFromLearningObject,
  emptyTutorialV3Draft,
  partsToBlocks,
  pipelineDraftFromV3,
  sectionHasContent,
  slotSatisfied,
  structureFromTemplate,
  movePartToPage,
  partPageNumbers,
  syncAssembledPartsIntoDraft,
  topLevelSlotAsSection,
  touchDraft,
  updateSection,
  updateTopLevelSlot,
} from '../../../../lib/tutorialV3/draftModel';
import { TutorialV3AssembleEditor } from './TutorialV3AssembleEditor';
import { AssistantPanel } from '../AssistantPanel';
import {
  applyEditActionsToParts,
  buildAssistantContext,
  flattenActions,
  type TutorialEditorPart,
} from '../../../../lib/assistant';
import type { AssistantMessage, EditAction, ObjectSelection } from '../../../../lib/types';
import {
  analyzeTemplateRecipe,
  applySectionOutline,
  seedTopLevelSlots,
  structureIsReady,
  type StructureSectionTitle,
} from '../../../../lib/tutorialV3/recipeStructure';
import type { TutorialV3Draft, TutorialV3Phase, V3SourceRef } from '../../../../lib/tutorialV3/types';
import { TutorialV3StructurePanel } from './TutorialV3StructurePanel';
import { TutorialV3Navigator } from './TutorialV3Navigator';
import { TutorialV3BatchGenerate } from './TutorialV3BatchGenerate';
import { TutorialV3SourceFirstStructure } from './TutorialV3SourceFirstStructure';
import { TutorialV3SourceFirstAuthor } from './TutorialV3SourceFirstAuthor';
import { applyProposal, isSourceFirstDraft, SOURCE_FIRST_PATH } from '../../../../lib/tutorialV3/sourceFirst';
import { embedTypeLabel } from '../../../../lib/tutorialV3/recipeStructure';
import { TutorialV3SectionWorkspace } from './TutorialV3SectionWorkspace';
import {
  TutorialV3SourcePanel,
  newSrcId,
  parseYtId,
  type PdfSrc,
  type TextSrc,
  type WebSrc,
  type YtSrc,
} from './TutorialV3SourcePanel';
import type { PickedLibrarySource } from '../CDSources';
import { useConfirm } from '../../ConfirmDialog';
import { V3_FONT, V3_NAVY, V3_PAPER, V3_SAGE, V3_SAGE_BORDER, V3_SAGE_TINT } from '../../../../lib/tutorialV3/authorTheme';
import {
  getCollectionPath,
  objectCollectionIds,
} from '../../../../lib/objectCollectionsStore';

type MaterialSourceKind = 'pdf' | 'text' | 'web' | 'youtube';

function buildPoolFromSources(args: {
  pdfSources: PdfSrc[];
  textSources: TextSrc[];
  ytSources: YtSrc[];
  webSources: WebSrc[];
  libraryDoc: ParsedDoc | null;
  librarySource: PickedLibrarySource | null;
}): V3SourceRef[] {
  const pool: V3SourceRef[] = [];
  for (const p of args.pdfSources) {
    if (!p.doc?.sentences?.length) continue;
    pool.push({
      id: p.id,
      label: p.doc.fileName || p.file?.name || 'PDF',
      kind: 'pdf',
      sentences: p.doc.sentences,
    });
  }
  for (const t of args.textSources) {
    pool.push({
      id: t.id,
      label: t.doc.fileName || 'Pasted notes',
      kind: 'text',
      sentences: t.doc.sentences || [],
    });
  }
  for (const y of args.ytSources) {
    pool.push({
      id: y.id,
      label: y.doc.fileName || y.videoTitle || 'YouTube transcript',
      kind: 'youtube',
      sentences: y.doc.sentences || [],
    });
  }
  for (const w of args.webSources) {
    pool.push({
      id: w.id,
      label: w.doc.fileName || w.url || 'Website',
      kind: 'web',
      sentences: w.doc.sentences || [],
      html: w.doc.html,
      sourceUrl: w.doc.sourceUrl || w.url,
      images: w.images?.length ? w.images : undefined,
    });
  }
  if (args.libraryDoc && args.librarySource) {
    pool.push({
      id: `library-${args.librarySource.id}`,
      label: args.librarySource.title,
      kind: 'library',
      sentences: args.libraryDoc.sentences || [],
    });
  }
  return pool;
}

export function ObjectCreatorTutorialV3() {
  const {
    navigate, editingObjectId, clearEditingObject, createdObjects: createdObjectsRaw,
    pendingTemplateId, setPendingTemplateId, pendingAuthoringPath, setPendingAuthoringPath,
    addObject, createCollectionIds,
    objectCollections: objectCollectionsRaw, setActiveObjectCollectionId,
    listObjectVersions, objectVersionsTick,
  } = useApp();
  const createdObjects = createdObjectsRaw || [];
  const objectCollections = objectCollectionsRaw || [];
  const confirm = useConfirm();

  const defaultTplId = getDefaultTemplateId('tutorial-v3') || DEFAULT_TUTORIAL_TEMPLATE_ID;
  const [draft, setDraft] = useState<TutorialV3Draft>(() => {
    const launchId = resolveTutorialV3LaunchTemplate(pendingTemplateId);
    const authoringPath = pendingAuthoringPath;

    if (authoringPath === SOURCE_FIRST_PATH) {
      /*
        No template, because the structure is not known yet — it comes out of
        the sources on the Structure step. Blank canvas is the right skeleton to
        start from: free section count and nothing prescribed.
      */
      const tpl = getTutorialTemplate(BLANK_CANVAS_TUTORIAL_TEMPLATE_ID);
      return emptyTutorialV3Draft({
        templateId: tpl.id,
        structure: structureFromTemplate(tpl),
        title: '',
        phase: 'start',
        metadata: { authoringPath: SOURCE_FIRST_PATH, pathMode: 'manual' },
      });
    }

    if (authoringPath === 'write-yourself') {
      const tpl = writeYourselfTutorialTemplate();
      return emptyTutorialV3Draft({
        templateId: WRITE_YOURSELF_TUTORIAL_TEMPLATE_ID,
        structure: structureFromTemplate(tpl),
        title: '',
        phase: 'start',
        metadata: { authoringPath: 'write-yourself', pathMode: 'manual' },
      });
    }

    const tpl = getTutorialTemplate(launchId || defaultTplId);
    return emptyTutorialV3Draft({
      templateId: tpl.id,
      structure: structureFromTemplate(tpl),
      title: '',
      phase: 'start',
      metadata: (launchId || authoringPath === 'template')
        ? { authoringPath: 'template' }
        : {},
    });
  });
  const [phase, setPhase] = useState<TutorialV3Phase>('start');
  const [sectionTitles, setSectionTitles] = useState<StructureSectionTitle[]>(() => (
    pendingAuthoringPath === 'write-yourself'
      ? [
          { title: 'Section 1', intent: '', learnerPage: 1 },
          { title: 'Section 2', intent: '', learnerPage: 2 },
          { title: 'Section 3', intent: '', learnerPage: 3 },
        ]
      : []
  ));
  const restored = useRef(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const structureSeeded = useRef(false);
  const pendingApplied = useRef(false);

  /* ── V1-identical Sources state ───────────────────────────── */
  const [pathMode, setPathModeState] = useState<'material' | 'prompt' | 'manual'>('material');
  const [enabledTypes, setEnabledTypes] = useState<Set<MaterialSourceKind>>(() => new Set(['pdf']));
  const [pdfSources, setPdfSources] = useState<PdfSrc[]>([]);
  const [textSources, setTextSources] = useState<TextSrc[]>([]);
  const [ytSources, setYtSources] = useState<YtSrc[]>([]);
  const [webSources, setWebSources] = useState<WebSrc[]>([]);
  const [libraryDoc, setLibraryDoc] = useState<ParsedDoc | null>(null);
  const [librarySource, setLibrarySource] = useState<PickedLibrarySource | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [ytUrl, setYtUrl] = useState('');
  const [ytLoading, setYtLoading] = useState(false);
  /** Fallback when YouTube refuses our server the captions (see the panel). */
  const [ytPasteOpen, setYtPasteOpen] = useState(false);
  const [ytPasteText, setYtPasteText] = useState('');
  const [ytError, setYtError] = useState<string | null>(null);
  const [webUrl, setWebUrl] = useState('');
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);
  const [promptText, setPromptText] = useState('');
  const [expandPromptError, setExpandPromptError] = useState<string | null>(null);
  const [media, setMedia] = useState<any[]>([]);
  const [sourcesBusy, setSourcesBusy] = useState(false);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [hootOpen, setHootOpen] = useState(false);

  const setPathMode = (m: 'material' | 'prompt' | 'manual') => {
    setPathModeState(m);
    if (m === 'material' && enabledTypes.size === 0) setEnabledTypes(new Set(['pdf']));
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
  /** Use a transcript the author copied from YouTube, when the fetch is refused. */
  const handleUseYoutubePaste = async () => {
    if (!ytPasteText.trim()) return;
    setYtError(null);
    setYtLoading(true);
    const url = ytUrl.trim();
    try {
      const out = await pasteYoutubeTranscript({ text: ytPasteText, url: url || undefined });
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
      setYtPasteText('');
      setYtPasteOpen(false);
    } catch (e) {
      setYtError(errorMessage(e, 'Could not read that transcript.'));
    } finally {
      setYtLoading(false);
    }
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
        images: out.images?.length ? out.images : undefined,
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
    || pathMode === 'manual'
  );

  const persist = useCallback((
    next: TutorialV3Draft,
    blocksOverride?: ReturnType<typeof partsToBlocks>,
    saveOpts?: AddObjectOptions,
  ) => {
    const fv = {
      passOn: true,
      pass: next.structure.pass || '70%',
      hintsOn: next.structure.hintsOn,
      hintN: next.structure.hintN,
    };
    const blocks = blocksOverride
      || partsToBlocks(assembleAllParts(next), fv);
    const existing = createdObjects.find((o) => o.id === next.id);
    const fromExisting = existing ? objectCollectionIds(existing) : [];
    // Prefer folders already on the object (after Content Library moves).
    // Only fall back to Create-flow picks on the first save of a new draft.
    const collectionIds = fromExisting.length
      ? fromExisting
      : (createCollectionIds?.length ? createCollectionIds : undefined);
    addObject({
      id: next.id,
      type: 'tutorial-v3',
      title: next.title || 'Untitled Tutorial V3',
      status: next.status === 'submitted' ? 'in-review' : next.status === 'ready' ? 'approved' : 'draft',
      description: String(next.metadata.objective || ''),
      blocks,
      // Prefer the draft's phase (commit already stamped it) over React state,
      // which can lag a tick behind and corrupt reopen.
      tutorialV3Draft: { ...next, phase: next.phase || phase },
      collectionIds,
      // Draft saves keep content safe but leave history alone. Left on 'auto'
      // they committed a version of their own whenever the amend window had
      // expired, which is where the surprise extra versions came from.
    } as any, saveOpts ?? { version: 'skip' });
    return collectionIds || [];
  }, [addObject, createCollectionIds, phase, createdObjects]);

  /** Versions the author may overwrite instead of adding another. */
  const submitVersions = useMemo(
    () => listObjectVersions(draft.id).filter((v) => !!v.snapshot),
    [listObjectVersions, draft.id, objectVersionsTick],
  );

  const draftCollectionLabel = useCallback((collectionIds?: string[]) => {
    const existing = createdObjects.find((o) => o.id === draft.id);
    const fromExisting = existing ? objectCollectionIds(existing) : [];
    const useIds = fromExisting.length
      ? fromExisting
      : ((collectionIds && collectionIds.length) ? collectionIds : (createCollectionIds || []));
    const names = useIds.map((id) => {
      const path = getCollectionPath(objectCollections || [], id);
      const self = (objectCollections || []).find((c) => c.id === id);
      if (!self) return null;
      if (!path.length) return self.name;
      return [...path.map((p) => p.name), self.name].join(' / ');
    }).filter(Boolean) as string[];
    const label = names.length
      ? names.map((n) => `“${n}”`).join(', ')
      : '“My content”';
    return { ids: useIds, label };
  }, [createdObjects, createCollectionIds, draft.id, objectCollections]);

  /**
   * After a draft save: popup with exact collection folder path.
   * Returns true if the author left for Content Library; false if they stay editing.
   */
  const notifyDraftSaved = useCallback(async (collectionIds?: string[]) => {
    const { ids, label } = draftCollectionLabel(collectionIds);
    if (ids[0]) setActiveObjectCollectionId?.(ids[0]);
    // Primary (right, autofocus) = keep editing; secondary = leave to library.
    // The club compose flow owns the ending: publish and hand the author back to the
    // app, rather than the folder dialog and a trip to the Content Library — which is
    // the right ending in the Studio and a dead end on a phone.
    const compose = composePublisher();
    if (compose) {
      compose(draft.id);
      return;
    }
    const continueEditing = await confirm({
      title: 'Saved',
      description: `Saved in folder ${label}. Open Content Library and go to that folder to find and continue this content.`,
      confirmLabel: 'Continue editing',
      cancelLabel: 'Go to Content Library',
      destructive: false,
      dismissValue: true,
    });
    if (continueEditing) return false;
    clearEditingObject?.();
    navigate('cd-library', { libraryFolderId: ids[0] || null });
    return true;
  }, [confirm, draftCollectionLabel, setActiveObjectCollectionId, clearEditingObject, navigate]);

  const commit = useCallback((next: TutorialV3Draft, nextPhase?: TutorialV3Phase) => {
    const withPhase = touchDraft(next, nextPhase ? { phase: nextPhase } : {});
    setDraft(withPhase);
    if (nextPhase) setPhase(nextPhase);
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => persist(withPhase), 250);
  }, [persist]);

  const continueFromSources = async () => {
    setSourcesBusy(true);
    setSourcesError(null);
    try {
      const pending = pdfSources.filter((e) => e.file && !e.doc);
      let nextPdf = pdfSources;
      if (pending.length) {
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
      const pool = buildPoolFromSources({
        pdfSources: nextPdf,
        textSources,
        ytSources,
        webSources,
        libraryDoc,
        librarySource,
      });
      const resolvedPath = pool.length || pathMode === 'prompt'
        ? pathMode
        : 'manual';
      // On the source-first path Sources hands off to Structure, where the
      // model proposes the shape; every other path has already been there.
      const afterSources = isSourceFirstDraft(draft) ? 'structure' : 'navigator';
      commit(touchDraft(draft, {
        sourcePool: pool,
        phase: afterSources,
        metadata: {
          ...draft.metadata,
          pathMode: resolvedPath,
          promptText: pathMode === 'prompt' ? promptText : undefined,
          media,
        },
      }), afterSources);
    } finally {
      setSourcesBusy(false);
    }
  };

  // Re-open (pen icon) must reload the draft for the new id.
  useEffect(() => {
    restored.current = false;
  }, [editingObjectId]);

  useEffect(() => {
    if (restored.current || !editingObjectId) return;
    const obj = createdObjects.find((o) => o.id === editingObjectId);
    if (!obj || obj.type !== 'tutorial-v3') return;
    restored.current = true;
    const existing = draftFromLearningObject(obj);
    if (existing) {
      setDraft(existing);
      if (existing.sections.length) {
        setSectionTitles(existing.sections.map((s, i) => ({
          id: s.id,
          title: s.title,
          intent: s.intent || '',
          learnerPage: s.learnerPage ?? (i + 1),
        })));
      }
      const pRaw = existing.phase || (existing.sections.length || (existing.topLevelSlots || []).length ? 'navigator' : existing.title ? 'structure' : 'start');
      const p = pRaw === 'path' ? 'start' : pRaw;
      if (p === 'section' && existing.activeSectionId) setPhase('section');
      else if (p === 'slot' && existing.activeSlotId) setPhase('slot');
      else if (p === 'section' || p === 'slot') setPhase('navigator');
      else setPhase(p);
      if (existing.sourcePool?.length) {
        setTextSources(existing.sourcePool.filter((s) => s.kind === 'text').map((s) => ({
          id: s.id,
          doc: { fileName: s.label, pageCount: 1, sentences: s.sentences || [] },
        })));
        setPdfSources(existing.sourcePool.filter((s) => s.kind === 'pdf').map((s) => ({
          id: s.id, file: null, doc: { fileName: s.label, pageCount: 1, sentences: s.sentences || [] },
        })));
        setYtSources(existing.sourcePool.filter((s) => s.kind === 'youtube').map((s) => ({
          id: s.id, url: '', videoId: '', videoTitle: s.label, segments: [],
          doc: { fileName: s.label, pageCount: 1, sentences: s.sentences || [] },
        })));
        setWebSources(existing.sourcePool.filter((s) => s.kind === 'web').map((s) => ({
          id: s.id, url: s.sourceUrl || '',
          doc: { fileName: s.label, pageCount: 1, sentences: s.sentences || [], html: s.html, sourceUrl: s.sourceUrl },
          images: s.images?.length ? s.images : undefined,
        })));
      }
    } else {
      setDraft((d) => touchDraft(d, { id: obj.id, title: obj.title }));
      setPhase('start');
    }
  }, [editingObjectId, createdObjects]);

  useEffect(() => {
    if (!pendingAuthoringPath) return;
    setPendingAuthoringPath(null);
  }, [pendingAuthoringPath, setPendingAuthoringPath]);

  useEffect(() => {
    if (editingObjectId) return;
    const launchId = resolveTutorialV3LaunchTemplate(pendingTemplateId);
    if (!launchId) return;
    if (pendingApplied.current && draft.templateId === launchId) {
      clearTutorialV3LaunchTemplate();
      if (pendingTemplateId) setPendingTemplateId(null);
      return;
    }
    pendingApplied.current = true;
    const tpl = getTutorialTemplate(launchId);
    const analysis = analyzeTemplateRecipe(tpl);
    setDraft((d) => touchDraft(d, {
      templateId: tpl.id,
      structure: structureFromTemplate(tpl),
      metadata: {
        ...d.metadata,
        ...tpl.knobDefaults,
        authoringPath: 'template',
        pathMode: undefined,
      },
      topLevelSlots: seedTopLevelSlots(analysis, d.topLevelSlots),
      phase: 'start',
    }));
    setPhase('start');
    // Keep session key briefly so Strict Mode remount can re-apply the same id.
    const t = window.setTimeout(() => {
      clearTutorialV3LaunchTemplate();
      setPendingTemplateId(null);
    }, 800);
    return () => window.clearTimeout(t);
  }, [pendingTemplateId, editingObjectId, setPendingTemplateId, draft.templateId]);

  /** Explicit Save — available on every phase; popup names the exact collection folder. */
  const saveDraft = async () => {
    if (persistTimer.current) {
      clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
    let next = touchDraft(draft, { phase });

    if (phase === 'structure') {
      const tpl = getTutorialTemplate(draft.templateId);
      const analysis = analyzeTemplateRecipe(tpl);
      const wy = isWriteYourselfTutorial(draft.templateId)
        || draft.metadata.authoringPath === 'write-yourself';
      const synced = syncAssembledPartsIntoDraft(draft);
      const titles = sectionTitles.length
        ? sectionTitles
        : synced.sections.map((s) => ({ id: s.id, title: s.title, intent: s.intent || '' }));
      const sections = applySectionOutline(synced.sections, titles, analysis, {
        writeYourself: wy,
        freeSections: isBlankCanvasTutorial(draft.templateId),
      });
      next = touchDraft(synced, {
        phase: 'structure',
        sections,
        topLevelSlots: wy ? [] : seedTopLevelSlots(analysis, synced.topLevelSlots),
        structure: structureFromTemplate(tpl),
      });
    } else if (phase === 'sources') {
      const pool = buildPoolFromSources({
        pdfSources,
        textSources,
        ytSources,
        webSources,
        libraryDoc,
        librarySource,
      });
      next = touchDraft(draft, {
        phase: 'sources',
        sourcePool: pool,
        metadata: {
          ...draft.metadata,
          pathMode,
          promptText: pathMode === 'prompt' ? promptText : undefined,
          media,
        },
      });
    }

    setDraft(next);
    const ids = persist(next);
    await notifyDraftSaved(ids);
  };

  const goBack = async () => {
    // Flush any pending autosave, then tell the author exactly where the draft lives.
    if (persistTimer.current) {
      clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
    if (draft.title.trim() || draft.sections.length || (draft.topLevelSlots || []).length) {
      const ids = persist(draft);
      // Continue editing → stay here. Go to Content Library → already navigated inside notify.
      await notifyDraftSaved(ids);
      return;
    }
    clearEditingObject?.();
    navigate(editingObjectId ? 'cd-library' : 'cd-create');
  };

  const writeYourself = isWriteYourselfTutorial(draft.templateId)
    || draft.metadata.authoringPath === 'write-yourself';
  /** Sources first, and the model proposes the shape. See lib/tutorialV3/sourceFirst. */
  const sourceFirst = isSourceFirstDraft(draft);
  /** Blank canvas: free section count + author-added slots, but Sources and AI stay on. */
  const freeform = isBlankCanvasTutorial(draft.templateId);

  const pipelineNeedsSources = useMemo(() => {
    if (writeYourself) return false;
    // Source-first has nothing to work from without them, whatever the
    // skeleton template happens to say.
    if (sourceFirst) return true;
    const tpl = getTutorialTemplate(draft.templateId);
    return analyzeTemplateRecipe(tpl).needsSources;
  }, [draft.templateId, writeYourself, sourceFirst]);

  /** Jump back (or forward) along the top-level Plan → Structure → Sources → Author rail. */
  const goToPipelinePhase = useCallback((next: TutorialV3Phase) => {
    // Keep Review edits when revisiting earlier steps / Author.
    const synced = syncAssembledPartsIntoDraft(draft);

    if (next === 'start') {
      commit(touchDraft(synced, {
        phase: 'start',
        activeSectionId: null,
        activeSlotId: null,
      }), 'start');
      return;
    }
    if (next === 'structure') {
      // Refresh Structure title rows from current sections (ids preserved).
      if (synced.sections.length) {
        setSectionTitles(synced.sections.map((s, i) => ({
          id: s.id,
          title: s.title,
          intent: s.intent || '',
          learnerPage: s.learnerPage ?? (i + 1),
        })));
      }
      commit(touchDraft(synced, {
        phase: 'structure',
        activeSectionId: null,
        activeSlotId: null,
      }), 'structure');
      return;
    }
    if (next === 'sources') {
      commit(touchDraft(synced, {
        phase: 'sources',
        activeSectionId: null,
        activeSlotId: null,
      }), 'sources');
      return;
    }
    if (next === 'navigator') {
      commit(touchDraft(synced, {
        phase: 'navigator',
        activeSectionId: null,
        activeSlotId: null,
        // Author reads section.parts; drop stale assemble override after sync.
        assembledParts: undefined,
      }), 'navigator');
      return;
    }
    if (next === 'review') {
      // Mark contentful sections/slots done so Review stays reachable after reload.
      const sections = (synced.sections || []).map((s) => (
        (!s.done && sectionHasContent(s)) ? { ...s, done: true } : s
      ));
      const topLevelSlots = (synced.topLevelSlots || []).map((s) => (
        (!s.done && slotSatisfied(s)) ? { ...s, done: true } : s
      ));
      const base = { ...synced, sections, topLevelSlots };
      // Assemble + stamp Structure learner-page breaks for student preview.
      const parts = assembleAllParts(base);
      const blocks = partsToBlocks(parts, {
        passOn: true,
        pass: draft.structure.pass || '70%',
      });
      const nextDraft = touchDraft(base, {
        phase: 'review',
        assembledParts: parts,
        activeSectionId: null,
        activeSlotId: null,
      });
      // Advance UI first — persist must not block entering Review.
      setDraft(nextDraft);
      setPhase('review');
      try {
        persist(nextDraft, blocks);
      } catch (err: any) {
        console.warn('[tutorial-v3] persist on review failed:', err?.message || err);
      }
    }
  }, [draft, commit, persist]);

  const activeSection = draft.sections.find((s) => s.id === draft.activeSectionId) || null;
  const activeSlot = (draft.topLevelSlots || []).find((s) => s.id === draft.activeSlotId && s.kind === 'generate') || null;
  /**
   * A shared markup run, held in React rather than in the draft: it is a choice
   * about one action, and abandoning it should leave nothing behind.
   */
  const [batchSelection, setBatchSelection] = useState<{ kind: 'section' | 'slot'; id: string }[] | null>(null);
  /**
   * Deliberately asking for a new proposal. Without this, revisiting Structure
   * on the source-first path always reopened the proposal screen and there was
   * no way to edit the structure you already had — only to replace it.
   */
  const [reproposeStructure, setReproposeStructure] = useState(false);

  // Write-yourself never uses the Sources step.
  useEffect(() => {
    if (phase === 'sources' && writeYourself) {
      commit(touchDraft(draft, { phase: 'navigator', activeSectionId: null, activeSlotId: null }), 'navigator');
    }
  }, [phase, writeYourself]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seed Structure checklist when entering the structure phase.
  useEffect(() => {
    if (phase !== 'structure') {
      structureSeeded.current = false;
      return;
    }
    if (structureSeeded.current) return;
    structureSeeded.current = true;
    const tpl = getTutorialTemplate(draft.templateId);
    const analysis = analyzeTemplateRecipe(tpl);
    const seeded = seedTopLevelSlots(analysis, draft.topLevelSlots);
    setDraft((d) => touchDraft(d, { topLevelSlots: seeded }));
    if (!sectionTitles.length) {
      if (draft.sections.length) {
        setSectionTitles(draft.sections.map((s, i) => ({
          id: s.id,
          title: s.title,
          intent: s.intent || '',
          learnerPage: s.learnerPage ?? (i + 1),
        })));
      } else if (analysis.hasSections) {
        setSectionTitles(Array.from({ length: analysis.sectionCount }, (_, i) => ({
          title: `Section ${i + 1}`,
          intent: '',
          learnerPage: i + 1,
        })));
      }
    }
  }, [phase, draft.templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Editing an existing object (or any draft past Plan) can always revisit Plan/Structure.
  const canRevisitEarlySteps = !!(
    editingObjectId
    || draft.sections.length
    || (draft.topLevelSlots || []).length
    || draft.assembledParts?.length
    || phase === 'navigator' || phase === 'section' || phase === 'slot' || phase === 'review' || phase === 'sources'
  );

  const pipelineRail = (
    <PipelineRail
      phase={phase}
      needsSources={pipelineNeedsSources}
      onGo={goToPipelinePhase}
      canReview={allRequiredDone(draft.sections, draft.topLevelSlots)
        || phase === 'review'
        || !!(draft.assembledParts && draft.assembledParts.length)
        // Anything authored is enough to look at Review; requiring everything
        // meant an author could not check their first section against it.
        || draft.sections.some((sec) => (sec.parts || []).length > 0)
        || (draft.topLevelSlots || []).some((sl) => (sl.parts || []).length > 0 || !!sl.part)}
      canRevisitEarlySteps={canRevisitEarlySteps}
      sourceFirst={sourceFirst}
    />
  );

  const hootPhaseLabel =
    phase === 'start' ? 'Plan'
      : phase === 'structure' ? 'Structure'
        : phase === 'sources' ? 'Sources'
          : phase === 'navigator' ? 'Author'
            : phase === 'section' ? 'Section'
              : phase === 'slot' ? 'Content'
                : phase === 'review' ? 'Review'
                  : 'Tutorial';

  const hootSelection: ObjectSelection = draft.activeSectionId
    ? { kind: 'block', blockId: draft.activeSectionId }
    : { kind: 'none' };

  const hootParts = useMemo((): TutorialEditorPart[] => {
    if (phase === 'section' && activeSection) return activeSection.parts as TutorialEditorPart[];
    if (phase === 'review') {
      // Label parts with their student page so Hoot can move blocks across pages.
      const assembled = assembleAllParts(draft);
      const pages = partPageNumbers(assembled);
      return assembled.map((p, i) => ({
        ...p,
        label: `${p.label || p.type || 'Part'} · page ${pages[i]}`,
      })) as TutorialEditorPart[];
    }
    if (phase === 'navigator' || phase === 'structure') {
      return (draft.sections || []).map((s) => ({
        id: s.id,
        type: 'rich-text',
        label: s.title,
        heading: s.title,
        body: s.intent || (s.parts || []).map((p) => p.body || p.plain || '').filter(Boolean).join('\n\n'),
      }));
    }
    return assembleAllParts(draft) as TutorialEditorPart[];
  }, [phase, draft, activeSection]);

  const hootContext = useMemo(() => buildAssistantContext({
    objectId: draft.id,
    objectType: 'tutorial-v3',
    title: draft.title || 'Untitled tutorial',
    status: draft.status === 'submitted' ? 'in-review' : 'draft',
    scope: 'bridge',
    objective: String(draft.metadata.objective || ''),
    fv: {
      obj: draft.metadata.objective,
      aud: draft.metadata.audience,
      lvl: draft.metadata.level,
      templateId: draft.templateId,
      authoringPath: draft.metadata.authoringPath,
      phase,
    },
    parts: hootParts,
    pipelineDraft: pipelineDraftFromV3(draft),
    selection: hootSelection,
  }), [draft, hootParts, hootSelection, phase]);

  const applyHootActions = useCallback((actions: EditAction[], _label: string) => {
    const flat = flattenActions(actions);
    const looksLikeSection = (a: EditAction) => {
      if (a.type !== 'add_block') return false;
      const label = String(a.label || '');
      const bt = String(a.blockType || '');
      return /section/i.test(label) || /section/i.test(bt) || bt === 'section-heading';
    };

    // Plan / Structure / Author hub: “add another empty section”
    if (phase === 'start' || phase === 'structure' || phase === 'navigator') {
      const sectionAdds = flat.filter(looksLikeSection) as Extract<EditAction, { type: 'add_block' }>[];
      if (sectionAdds.length) {
        const tpl = getTutorialTemplate(draft.templateId);
        const analysis = analyzeTemplateRecipe(tpl);
        let nextTitles = sectionTitles.length
          ? [...sectionTitles]
          : draft.sections.map((s) => ({ id: s.id, title: s.title, intent: s.intent || '' }));
        for (const a of sectionAdds) {
          const title = String(a.label || a.content?.heading || `Section ${nextTitles.length + 1}`).trim()
            || `Section ${nextTitles.length + 1}`;
          nextTitles.push({ title, intent: String(a.content?.text || a.content?.body || '') });
        }
        setSectionTitles(nextTitles);
        const merged = applySectionOutline(draft.sections, nextTitles, analysis, { writeYourself });
        commit(touchDraft(draft, { sections: merged, assembledParts: undefined }));
        return;
      }
    }

    if (phase === 'section' && activeSection) {
      const result = applyEditActionsToParts(activeSection.parts as TutorialEditorPart[], actions, {
        title: draft.title,
        objective: String(draft.metadata.objective || ''),
      });
      commit(updateSection(draft, activeSection.id, {
        parts: result.parts as any,
        authorMode: activeSection.authorMode === 'empty' ? 'written' : activeSection.authorMode,
      }));
      if (result.meta?.title) commit(touchDraft(draft, { title: result.meta.title }));
      return;
    }

    // Review / default: apply to assembled reading-order parts
    const parts = assembleAllParts(draft);
    // Hoot page moves: update_block { patch: { page: N } } relocates a block
    // onto another student page (Review). Strip them out of the normal apply.
    const flatForPages = flattenActions(actions);
    const pageMoves: { blockId: string; page: number }[] = [];
    const cleaned = flatForPages.map((a: any) => {
      if (a?.type === 'update_block' && a.patch && a.patch.page != null) {
        pageMoves.push({ blockId: String(a.blockId), page: Number(a.patch.page) || 1 });
        const { page: _page, ...rest } = a.patch;
        if (!Object.keys(rest).length) return null;
        return { ...a, patch: rest };
      }
      return a;
    }).filter(Boolean) as EditAction[];
    const result = applyEditActionsToParts(parts as TutorialEditorPart[], cleaned, {
      title: draft.title,
      objective: String(draft.metadata.objective || ''),
    });
    let nextParts = result.parts as any[];
    for (const mv of pageMoves) nextParts = movePartToPage(nextParts as any, mv.blockId, mv.page) as any;
    const patch: Partial<typeof draft> = {
      assembledParts: nextParts as any,
      phase: phase === 'review' ? 'review' : draft.phase,
      ...(pageMoves.length ? { manualPageBreaks: true } : {}),
    };
    if (result.meta?.title) patch.title = result.meta.title;
    if (result.meta?.objective) {
      patch.metadata = { ...draft.metadata, objective: result.meta.objective };
    }
    commit(touchDraft(draft, patch));
  }, [phase, draft, sectionTitles, writeYourself, activeSection, commit]);

  const globalHoot = (
    <AssistantPanel
      open={hootOpen}
      onOpenChange={setHootOpen}
      context={hootContext}
      selection={hootSelection}
      parts={hootParts}
      onAcceptActions={applyHootActions}
      messages={draft.assistantMessages || []}
      onMessagesChange={(messages: AssistantMessage[]) => {
        setDraft((d) => touchDraft(d, { assistantMessages: messages }));
      }}
      phaseLabel={hootPhaseLabel}
    />
  );

  /* ── A. Start / Plan ──────────────────────────────────────── */
  if (phase === 'start') {
    const tpl = getTutorialTemplate(draft.templateId);

    return (
      <Shell
        onBack={goBack}
        onSave={saveDraft}
        title="Plan"
        subtitle="Name the tutorial"
        rail={pipelineRail}
      >
        <div className="max-w-lg mx-auto space-y-4">
          {writeYourself ? (
            <div
              className="rounded-xl px-3.5 py-2.5"
              style={{ background: 'rgba(77,124,90,0.08)', border: '1px solid rgba(77,124,90,0.22)' }}
            >
              <p style={{ fontSize: 11, fontWeight: 650, color: '#4d7c5a', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Write it yourself
              </p>
              <p style={{ fontSize: 13.5, color: '#2f4e39', marginTop: 2 }}>
                No template — you’ll add sections by hand.
              </p>
            </div>
          ) : (
            <div
              className="rounded-xl px-3.5 py-2.5"
              style={{ background: 'rgba(77,124,90,0.06)', border: '1px solid rgba(77,124,90,0.18)' }}
            >
              <p style={{ fontSize: 11, fontWeight: 650, color: '#4d7c5a', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Template
              </p>
              <p style={{ fontSize: 14, fontWeight: 650, color: '#3d6349', marginTop: 2 }}>{tpl.name}</p>
            </div>
          )}

          <Field label="Title">
            <input
              className="w-full"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="e.g. Declarer play basics"
              style={inputStyle}
            />
          </Field>
          <Field label="Learning objective (optional)">
            <textarea
              className="w-full resize-y"
              rows={3}
              value={String(draft.metadata.objective || '')}
              onChange={(e) => setDraft((d) => ({
                ...d,
                metadata: { ...d.metadata, objective: e.target.value },
              }))}
              placeholder="After this tutorial, the learner can…"
              style={inputStyle}
            />
          </Field>
          <Field label="Audience (optional)">
            <input
              className="w-full"
              value={String(draft.metadata.audience || '')}
              onChange={(e) => setDraft((d) => ({
                ...d,
                metadata: { ...d.metadata, audience: e.target.value },
              }))}
              placeholder="e.g. Intermediate bridge students"
              style={inputStyle}
            />
          </Field>
          <button
            type="button"
            disabled={!draft.title.trim()}
            onClick={() => {
              const synced = syncAssembledPartsIntoDraft(draft);
              if (synced.sections.length && !sectionTitles.length) {
                setSectionTitles(synced.sections.map((s, i) => ({
                  id: s.id,
                  title: s.title,
                  intent: s.intent || '',
                  learnerPage: s.learnerPage ?? (i + 1),
                })));
              }
              // Source-first reads before it designs, so Plan hands off to
              // Sources and Structure comes after.
              const nextPhase = sourceFirst ? 'sources' : 'structure';
              const next = touchDraft(synced, {
                title: draft.title.trim(),
                metadata: draft.metadata,
                phase: nextPhase,
              });
              commit(next, nextPhase);
            }}
            className="w-full py-3.5 rounded-full text-white disabled:opacity-40"
            style={{ fontSize: 15, fontWeight: 700, background: V3_SAGE }}
          >
            {sourceFirst ? 'Save and continue to sources' : 'Save and continue to structure'}
          </button>
        </div>
      </Shell>
    );
  }

  /* ── B0. Structure, source-first: the model proposes it ───── */
  if (phase === 'structure' && sourceFirst && (reproposeStructure || !draft.sections.length)) {
    const pickedIds = (draft.sourcePool || []).map((sp) => sp.id);
    return (
      <Shell
        onBack={() => goToPipelinePhase('sources')}
        onSave={saveDraft}
        title="Structure"
        subtitle="Proposed from your sources — review it before it becomes the tutorial"
        rail={pipelineRail}
        assistant={globalHoot}
      >
        <TutorialV3SourceFirstStructure
          draft={draft}
          pickedSourceIds={pickedIds}
          onBackToSources={() => goToPipelinePhase('sources')}
          onApply={(proposal) => {
            setReproposeStructure(false);
            const { sections, topLevelSlots } = applyProposal(draft, proposal, pickedIds);
            setSectionTitles(sections.map((sec, i) => ({
              id: sec.id,
              title: sec.title,
              intent: sec.intent || '',
              learnerPage: sec.learnerPage ?? (i + 1),
            })));
            commit(touchDraft(draft, {
              phase: 'navigator',
              sections,
              topLevelSlots,
              // The model's own title and objective only fill gaps — an author
              // who wrote them on Plan meant them.
              title: draft.title.trim() || proposal.title || draft.title,
              metadata: {
                ...draft.metadata,
                objective: String(draft.metadata.objective || '').trim() || proposal.objective || '',
              },
            }), 'navigator');
          }}
        />
      </Shell>
    );
  }

  /* ── B. Structure (recipe checklist — no template picker / objective) ─── */
  if (phase === 'structure') {
    const tpl = getTutorialTemplate(draft.templateId);
    const analysis = analyzeTemplateRecipe(tpl);
    const slots = writeYourself ? [] : (draft.topLevelSlots || []);
    const ready = structureIsReady(analysis, slots, sectionTitles, { writeYourself, freeform });
    const continueLabel = writeYourself
      ? 'Save and continue to author'
      : analysis.needsSources
        ? 'Save and continue to sources'
        : 'Save and continue';

    return (
      <Shell
        onBack={() => goToPipelinePhase('start')}
        onSave={saveDraft}
        title="Structure"
        subtitle={writeYourself
          ? 'Name your sections — no template recipe'
          : freeform
            ? 'Blank canvas — add any sections and content you want'
            : 'Slots and sections from your template recipe'}
        rail={pipelineRail}
      >
        <div className={`${freeform ? 'max-w-4xl' : 'max-w-2xl'} mx-auto pb-8`}>
          {sourceFirst && (
            <div
              className="flex items-center justify-between gap-3 flex-wrap rounded-2xl px-4 py-3 mb-4"
              style={{ background: V3_SAGE_TINT, border: `1px solid ${V3_SAGE_BORDER}` }}
            >
              <p style={{ fontSize: 12.5, color: '#44403c', lineHeight: 1.5 }}>
                This shape came from your sources. Rename, reorder and delete it like any other —
                or ask for a different proposal.
              </p>
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    // Replacing the sections throws away whatever was generated
                    // into them, so it is asked rather than assumed.
                    const ok = await confirm({
                      title: 'Propose a new structure?',
                      description: 'The current sections are replaced, and anything generated into them is lost.',
                      confirmLabel: 'Propose a new one',
                      destructive: true,
                    });
                    if (ok) setReproposeStructure(true);
                  })();
                }}
                className="px-3.5 py-2 rounded-full border shrink-0"
                style={{ fontSize: 12.5, fontWeight: 650, color: '#2f4e39', borderColor: V3_SAGE_BORDER, background: '#fff' }}
              >
                Propose a new structure
              </button>
            </div>
          )}
          <TutorialV3StructurePanel
            template={tpl}
            slots={slots}
            onChangeSlots={(next) => setDraft((d) => touchDraft(d, { topLevelSlots: next }))}
            sectionTitles={sectionTitles}
            onChangeSectionTitles={setSectionTitles}
            createdObjects={createdObjects || []}
            writeYourself={writeYourself}
            freeform={freeform}
          />

          <div className="flex flex-wrap gap-2 px-1 mt-5">
            <button
              type="button"
              disabled={!ready}
            onClick={() => {
                // Merge outline edits into existing sections — never wipe authored parts.
                const synced = syncAssembledPartsIntoDraft(draft);
                if (writeYourself) {
                  const sections = applySectionOutline(
                    synced.sections,
                    sectionTitles,
                    analysis,
                    { writeYourself: true },
                  );
                  const next = touchDraft(synced, {
                    sections,
                    topLevelSlots: [],
                    structure: structureFromTemplate(tpl),
                    phase: 'navigator',
                    assembledParts: undefined,
                    metadata: { ...synced.metadata, authoringPath: 'write-yourself', pathMode: 'manual' },
                  });
                  commit(next, 'navigator');
                  return;
                }
                const sections = applySectionOutline(
                  synced.sections,
                  sectionTitles,
                  analysis,
                  { writeYourself: false, freeSections: freeform },
                );
                const nextSlots = seedTopLevelSlots(analysis, synced.topLevelSlots?.length ? synced.topLevelSlots : slots);
                const nextPhase: TutorialV3Phase = analysis.needsSources ? 'sources' : 'navigator';
                const next = touchDraft(synced, {
                  sections,
                  topLevelSlots: nextSlots,
                  structure: structureFromTemplate(tpl),
                  phase: nextPhase,
                  assembledParts: undefined,
                  metadata: { ...synced.metadata, authoringPath: 'template' },
                });
                commit(next, nextPhase);
              }}
              className="w-full py-3.5 rounded-full text-white disabled:opacity-40"
              style={{ fontSize: 15, fontWeight: 700, background: V3_SAGE }}
            >
              {continueLabel}
            </button>
            {!ready && (
              <p style={{ fontSize: 12.5, color: '#B45309', width: '100%' }}>
                {writeYourself
                  ? 'Name at least one section to continue.'
                  : freeform
                    ? 'Add at least one section or content item (and pin any required library picks) to continue.'
                    : analysis.hasSections
                      ? 'Name every section and pick required library content to continue.'
                      : 'Pick required library content to continue.'}
              </p>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  /* ── C. Sources (template path only) ───────── */
  if (phase === 'sources') {
    return (
      <>
      <div className="min-h-full shrink-0 flex flex-col" style={{ background: V3_PAPER, fontFamily: V3_FONT }}>
        <div className="px-5 pt-5 pb-2 shrink-0">
          <div className="flex items-center justify-between gap-3 mb-3">
            <button
              type="button"
              onClick={() => goToPipelinePhase('structure')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-white/70"
              style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}
            >
              <ArrowLeft size={14} /> Back to Structure
            </button>
            <button
              type="button"
              onClick={() => void saveDraft()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-white shrink-0"
              style={{ fontSize: 13.5, fontWeight: 700, background: V3_SAGE }}
            >
              <Save size={15} /> {composePublisher() ? 'Publish' : 'Save'}
            </button>
          </div>
          {pipelineRail}
          <h1 style={{ fontSize: 22, fontWeight: 750, color: '#0B1220', letterSpacing: '-0.3px', marginTop: 12 }}>Sources</h1>
          <p style={{ fontSize: 13.5, color: '#6B7280', marginTop: 4 }}>
            Material for sections and generated content — you can skip and author by hand if you prefer
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              onClick={() => goToPipelinePhase('start')}
              className="px-3 py-1.5 rounded-full border"
              style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
            >
              ← Plan
            </button>
            <button
              type="button"
              onClick={() => goToPipelinePhase('structure')}
              className="px-3 py-1.5 rounded-full border"
              style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
            >
              ← Structure
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <TutorialV3SourcePanel
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
            ytPasteOpen={ytPasteOpen}
            setYtPasteOpen={setYtPasteOpen}
            ytPasteText={ytPasteText}
            setYtPasteText={setYtPasteText}
            onUseYoutubePaste={handleUseYoutubePaste}
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
            showMedia
            imagesOnly={false}
            showManualWrite
            objectNoun="tutorial"
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
              ? 'Sources attach to the shared pool — each section or generate content item sub-selects later'
              : 'Add at least one source, or continue and author by hand'}
          </p>
          <button
            type="button"
            disabled={sourcesBusy}
            onClick={() => void continueFromSources()}
            className="w-full py-3.5 rounded-full text-white disabled:opacity-50"
            style={{ fontSize: 15, fontWeight: 700, background: V3_SAGE }}
          >
            {sourceFirst
              ? 'Save and propose a structure'
              : hasAnySource ? 'Save and continue to author' : 'Skip sources and continue'}
          </button>
        </div>
      </div>
      {globalHoot}
      </>
    );
  }

  /* ── E. Section workspace ─────────────────────────────────── */
  if (phase === 'section' && activeSection) {
    return (
      <Shell
        onBack={() => commit(touchDraft(draft, { phase: 'navigator', activeSectionId: null }), 'navigator')}
        onSave={saveDraft}
        title={activeSection.title}
        subtitle="Author this section"
        rail={pipelineRail}
        assistant={globalHoot}
      >
        <TutorialV3SectionWorkspace
          draft={draft}
          section={activeSection}
          allowAiGenerate={!writeYourself}
          onBack={() => commit(touchDraft(draft, { phase: 'navigator', activeSectionId: null }), 'navigator')}
          onChangeSection={(patch) => {
            commit(updateSection(draft, activeSection.id, patch));
          }}
          onMarkDone={(done) => {
            commit(updateSection(draft, activeSection.id, { done }));
          }}
        />
      </Shell>
    );
  }

  /* ── E2. Top-level generate slot workspace ─────────────────── */
  if (phase === 'slot' && activeSlot) {
    const slotAsSection = topLevelSlotAsSection(activeSlot);
    return (
      <Shell
        onBack={() => commit(touchDraft(draft, { phase: 'navigator', activeSlotId: null }), 'navigator')}
        onSave={saveDraft}
        title={slotAsSection.title}
        subtitle="Full content pipeline — then edit and return to the tutorial"
        rail={pipelineRail}
        assistant={globalHoot}
      >
        <TutorialV3SectionWorkspace
          draft={draft}
          section={slotAsSection}
          workspaceKind="slot"
          slot={activeSlot}
          allowAiGenerate={!writeYourself}
          onChangeSlot={(patch) => {
            commit(updateTopLevelSlot(draft, activeSlot.id, patch));
          }}
          onBack={() => commit(touchDraft(draft, { phase: 'navigator', activeSlotId: null }), 'navigator')}
          onChangeSection={(patch) => {
            commit(updateTopLevelSlot(draft, activeSlot.id, applySectionPatchToSlot(activeSlot, patch)));
          }}
          onMarkDone={(done) => {
            commit(updateTopLevelSlot(draft, activeSlot.id, { done }));
          }}
        />
      </Shell>
    );
  }

  /* ── F. Review — Edit + Student preview (V1 parity) ───────── */
  if (phase === 'review') {
    const parts = assembleAllParts(draft);
    const canSubmit = allRequiredDone(draft.sections, draft.topLevelSlots);
    return (
      <>
      <div className="min-h-full shrink-0 flex flex-col" style={{ background: V3_PAPER, fontFamily: V3_FONT }}>
        <TutorialV3AssembleEditor
          draft={draft}
          parts={parts}
          onChangeParts={(nextParts) => {
            commit(touchDraft(draft, { assembledParts: nextParts, phase: 'review' }));
          }}
          onChangeTitle={(title) => {
            commit(touchDraft(draft, { title, phase: 'review' }));
          }}
          onChangeDraft={(patch) => {
            commit(touchDraft(draft, { ...patch, phase: 'review' }));
          }}
          onBack={() => commit(touchDraft(draft, { phase: 'navigator', activeSectionId: null, activeSlotId: null }), 'navigator')}
          onSave={() => void saveDraft()}
          onSubmit={(target) => {
            const blocks = partsToBlocks(parts, {
              passOn: true,
              pass: draft.structure.pass || '70%',
            });
            const next = touchDraft(draft, { status: 'submitted', phase: 'review', assembledParts: parts });
            // The save itself performs the one versioning act the author picked,
            // so it runs against the content being saved rather than the stale
            // copy a follow-up call would see.
            persist(next, blocks, {
              version: target?.versionId ? { overwriteId: target.versionId } : 'new',
              onVersionError: (msg) => window.alert(msg),
            });
            setDraft(next);
            clearEditingObject?.();
            navigate('cd-library');
          }}
          canSubmit={canSubmit}
          submitVersions={submitVersions}
          rail={pipelineRail}
          onBackToPlan={() => goToPipelinePhase('start')}
          onBackToStructure={() => goToPipelinePhase('structure')}
        />
      </div>
      {globalHoot}
      </>
    );
  }

  /* ── D0. Author, source-first: one button, everything ─────── */
  if (phase === 'navigator' && sourceFirst && !batchSelection) {
    return (
      <Shell
        onBack={() => goToPipelinePhase('structure')}
        onSave={saveDraft}
        title={draft.title || 'Tutorial V3'}
        subtitle="Written from your sources"
        rail={pipelineRail}
        assistant={globalHoot}
      >
        <TutorialV3SourceFirstAuthor
          draft={draft}
          onReview={() => goToPipelinePhase('review')}
          onSectionDone={(sectionId, patch) => {
            setDraft((d) => {
              const next = updateSection(d, sectionId, patch);
              persist(next);
              return next;
            });
          }}
          onSlotDone={(slotId, patch) => {
            setDraft((d) => {
              const next = updateTopLevelSlot(d, slotId, patch);
              persist(next);
              return next;
            });
          }}
        />
      </Shell>
    );
  }

  /* ── C2. Shared markup run ────────────────────────────────── */
  if (batchSelection && batchSelection.length) {
    return (
      <Shell
        onBack={() => setBatchSelection(null)}
        onSave={saveDraft}
        title={draft.title || 'Tutorial V3'}
        subtitle="Mark up once, generate several"
        rail={pipelineRail}
        assistant={globalHoot}
      >
        <TutorialV3BatchGenerate
          draft={draft}
          selection={batchSelection}
          onBack={() => setBatchSelection(null)}
          onSectionDone={(sectionId, patch) => {
            // Commit each target as it lands, so a stopped run keeps whatever
            // already finished rather than throwing the batch away.
            setDraft((d) => {
              const next = updateSection(d, sectionId, patch);
              persist(next);
              return next;
            });
          }}
          onSlotDone={(slotId, patch) => {
            setDraft((d) => {
              const next = updateTopLevelSlot(d, slotId, patch);
              persist(next);
              return next;
            });
          }}
        />
      </Shell>
    );
  }

  /* ── D. Navigator (default) ───────────────────────────────── */
  return (
    <Shell
      onBack={goBack}
      onSave={saveDraft}
      title={draft.title || 'Tutorial V3'}
      subtitle="Section-by-section authoring"
      rail={pipelineRail}
    >
      <TutorialV3Navigator
        draft={draft}
        showSources={pipelineNeedsSources}
        writeYourself={writeYourself}
        onOpenSection={(sectionId) => {
          commit(touchDraft(draft, { phase: 'section', activeSectionId: sectionId, activeSlotId: null }), 'section');
        }}
        onOpenSlot={(slotId) => {
          commit(touchDraft(draft, { phase: 'slot', activeSlotId: slotId, activeSectionId: null }), 'slot');
        }}
        onBatchGenerate={writeYourself ? undefined : (sel) => setBatchSelection(sel)}
        onReorderSections={(orderedIds) => {
          // Reordering the outline reorders the learner's pages too, so the page
          // stamps are renumbered to match rather than left pointing at the old
          // positions.
          const byId = new Map(draft.sections.map((sec) => [sec.id, sec]));
          const sections = orderedIds
            .map((id, i) => {
              const sec = byId.get(id);
              return sec ? { ...sec, learnerPage: i + 1 } : null;
            })
            .filter(Boolean) as typeof draft.sections;
          if (sections.length !== draft.sections.length) return;
          setSectionTitles(sections.map((sec, i) => ({
            id: sec.id,
            title: sec.title,
            intent: sec.intent || '',
            learnerPage: sec.learnerPage ?? (i + 1),
          })));
          commit(touchDraft(draft, { sections, assembledParts: undefined }));
        }}
        onDeleteSlot={(slotId) => {
          void (async () => {
            const slot = (draft.topLevelSlots || []).find((sl) => sl.id === slotId);
            const label = slot ? embedTypeLabel(String(slot.objectType)) : 'this content';
            const ok = await confirm({
              title: `Remove ${label}?`,
              description: 'Anything generated into it is removed with it.',
              confirmLabel: 'Remove',
              destructive: true,
            });
            if (!ok) return;
            commit(touchDraft(draft, {
              topLevelSlots: (draft.topLevelSlots || []).filter((sl) => sl.id !== slotId),
              assembledParts: undefined,
            }));
          })();
        }}
        onDeleteSection={(sectionId) => {
          void (async () => {
            const sec = draft.sections.find((s) => s.id === sectionId);
            const label = sec?.title?.trim() || 'this section';
            const ok = await confirm({
              title: 'Delete section?',
              description: `Delete “${label}” and its content from this tutorial?`,
              confirmLabel: 'Delete',
              destructive: true,
            });
            if (!ok) return;
            commit(touchDraft(draft, {
              sections: draft.sections.filter((s) => s.id !== sectionId),
              assembledParts: undefined,
              activeSectionId: draft.activeSectionId === sectionId ? null : draft.activeSectionId,
            }), 'navigator');
          })();
        }}
        onReview={() => goToPipelinePhase('review')}
        onBackToSources={() => goToPipelinePhase('sources')}
        onBackToStructure={() => goToPipelinePhase('structure')}
        onBackToPlan={() => goToPipelinePhase('start')}
      />
    </Shell>
  );
}

/* ── chrome helpers ──────────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  fontSize: 14,
  border: '1px solid rgba(0,0,0,0.1)',
  borderRadius: 12,
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.95)',
  outline: 'none',
};

/** Always pinned bottom-left — pastel green draft save. */

function Shell({
  onBack, onSave, title, subtitle, children, rail, assistant,
}: {
  onBack: () => void;
  onSave?: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  rail?: React.ReactNode;
  assistant?: React.ReactNode;
}) {
  return (
    <>
      <div
        /*
          shrink-0 matters: <main> is a flex column, so a child with only
          min-h-full is free to be squeezed back to the viewport while its
          content overflows — which left the page warm for one screen and the
          app's own blue-grey below it.
        */
        className="min-h-full shrink-0"
        style={{
          background: V3_PAPER,
          fontFamily: V3_FONT,
          paddingBottom: 96,
        }}
      >
        {/* Back and the step rail ride together in a white bar across the top,
            so the pipeline stays put while the column below scrolls. */}
        <div
          className="sticky top-0 z-30 px-4"
          style={{ background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.06)' }}
        >
          <div className="max-w-4xl mx-auto flex items-center gap-3" style={{ minHeight: 58 }}>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 shrink-0"
              style={{ fontSize: 14, fontWeight: 650, color: '#44403c' }}
            >
              <ArrowLeft size={15} /> Back
            </button>
            <div className="min-w-0 flex-1 overflow-x-auto">{rail}</div>
            {/*
              Save lives in the bar rather than floating over the page. As a
              fixed button bottom-left it sat on top of the content column at
              narrow widths and competed with Hoot for the same corner; here it
              is beside the step it applies to and covers nothing.
            */}
            {onSave && (
              <button
                type="button"
                onClick={() => void onSave()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-white shrink-0"
                style={{ fontSize: 13.5, fontWeight: 700, background: V3_SAGE }}
              >
                <Save size={15} /> {composePublisher() ? 'Publish' : 'Save'}
              </button>
            )}
          </div>
        </div>

        <div className="px-4 py-6">
          <div className="max-w-4xl mx-auto mb-5">
            <h1 style={{ fontSize: 30, fontWeight: 700, color: '#1c1917', letterSpacing: '-0.5px' }}>{title}</h1>
            {subtitle ? <p style={{ fontSize: 15, color: '#78716c', marginTop: 6 }}>{subtitle}</p> : null}
          </div>
          {children}
        </div>
      </div>
      {assistant}
    </>
  );
}

type PipelineStepId = 'start' | 'structure' | 'sources' | 'navigator' | 'review';

function PipelineRail({
  phase,
  needsSources,
  onGo,
  canReview,
  canRevisitEarlySteps,
  sourceFirst = false,
}: {
  phase: TutorialV3Phase;
  needsSources: boolean;
  onGo: (p: TutorialV3Phase) => void;
  canReview: boolean;
  /** When true, Plan/Structure stay clickable even if the rail thinks you're still early. */
  canRevisitEarlySteps?: boolean;
  /**
   * Source-first runs Sources BEFORE Structure, because on that path the
   * sources are what the structure is derived from — proposing a shape before
   * there is anything to read would be the wrong way round.
   */
  sourceFirst?: boolean;
}) {
  const steps: { id: PipelineStepId; label: string; icon: React.ReactNode }[] = sourceFirst
    ? [
      { id: 'start', label: 'Plan', icon: <ListOrdered size={12} /> },
      { id: 'sources', label: 'Sources', icon: <Database size={12} /> },
      { id: 'structure', label: 'Structure', icon: <LayoutList size={12} /> },
      { id: 'navigator', label: 'Author', icon: <PenLine size={12} /> },
      { id: 'review', label: 'Review', icon: <Eye size={12} /> },
    ]
    : [
      { id: 'start', label: 'Plan', icon: <ListOrdered size={12} /> },
      { id: 'structure', label: 'Structure', icon: <LayoutList size={12} /> },
      ...(needsSources
        ? [{ id: 'sources' as const, label: 'Sources', icon: <Database size={12} /> }]
        : []),
      { id: 'navigator', label: 'Author', icon: <PenLine size={12} /> },
      { id: 'review', label: 'Review', icon: <Eye size={12} /> },
    ];

  const activeId: PipelineStepId = (phase === 'section' || phase === 'slot')
    ? 'navigator'
    : (phase as PipelineStepId);

  const activeIndex = Math.max(0, steps.findIndex((s) => s.id === activeId));

  return (
    <div className="flex items-center gap-0 overflow-x-auto py-1">
      {steps.map((s, i) => {
        const isActive = s.id === activeId;
        const isPast = i < activeIndex || (!!canRevisitEarlySteps && (s.id === 'start' || s.id === 'structure') && !isActive);
        /*
          Once a draft has substance, every step is reachable. The old rule was a
          per-step tangle that left an author looking at a step they could see but
          not click, with no way to tell why — and going back never lost anything,
          so there was nothing being protected. Review still needs something to
          review; before that it would be an empty page with a submit button.
          */
        const canClick = isActive
          || (canRevisitEarlySteps
            ? (s.id !== 'review' || canReview)
            : i <= activeIndex);

        return (
          <React.Fragment key={s.id}>
            <button
              type="button"
              disabled={!canClick}
              onClick={() => canClick && onGo(s.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all shrink-0"
              style={{
                background: isActive ? V3_NAVY : isPast ? V3_SAGE : '#fff',
                color: isActive || isPast ? '#fff' : '#a8a29e',
                border: `1.5px solid ${isActive ? V3_NAVY : isPast ? V3_SAGE : 'rgba(0,0,0,0.12)'}`,
                cursor: canClick ? 'pointer' : 'default',
                opacity: canClick ? 1 : 0.55,
              }}
              title={canClick ? `Go to ${s.label}` : undefined}
            >
              {isPast && !isActive ? <Check size={12} /> : s.icon}
              <span style={{ fontSize: 12.5, fontWeight: isActive ? 650 : 500 }}>{s.label}</span>
            </button>
            {i < steps.length - 1 && (
              <ChevronRight size={13} style={{ color: '#C4CBD4', margin: '0 3px', flexShrink: 0 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span style={{ fontSize: 12, fontWeight: 650, color: '#6B7280', display: 'block', marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  );
}
