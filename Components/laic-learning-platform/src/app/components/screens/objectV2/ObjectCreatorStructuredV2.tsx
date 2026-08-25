/**
 * Structured V2 creator — quiz / flashcard-set / concept-card / video-script.
 * Same arc as Tutorial V2: Plan → Structure → Sources → Author (per unit,
 * write yourself or generate with AI) → Review (edit + student preview with
 * Refine-with-AI and Hoot).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Check, ChevronRight, Database, Eye, LayoutList, ListOrdered,
  Loader2, PenLine, Save,
} from 'lucide-react';
import { composePublisher } from '../../../../lib/clubComposeBridge';
import { useApp, type AddObjectOptions } from '../../../App';
import { pastelFromHex } from '../../../../lib/pastel';
import { parsePdf, docFromText, type ParsedDoc } from '../../../../lib/pdf';
import { errorMessage, ingestWeb, ingestYoutube } from '../../../../lib/api';
import { supabaseEnabled, uploadImage } from '../../../../lib/supabase';
import { getDefaultTemplateId } from '../../../../lib/templateDefaults';
import { getObjectTemplate, type TemplateObjectType } from '../../../../lib/objectTemplates';
import { DEFAULT_CONCEPT_CATEGORIES } from '../../../../lib/conceptCard';
import { OBJECTS } from '../../../../lib/data';
import {
  X_NOUNS,
  allUnitsReady,
  applyAssistantActionsToDraft,
  blocksToUnits,
  draftFromLearningObjectX,
  emptyStructuredDraft,
  isStructuredV2Type,
  partsForAssistant,
  seedUnitsFromTemplate,
  touchXDraft,
  unitsToBlocks,
  updateUnit,
  type StructuredObjectType,
  type StructuredV2Draft,
  type XV2Phase,
} from '../../../../lib/objectV2/structuredDraft';
import { XV2StructurePanel } from './XV2StructurePanel';
import { XV2Navigator } from './XV2Navigator';
import { XV2UnitWorkspace } from './XV2UnitWorkspace';
import { XV2ReviewEditor } from './XV2ReviewEditor';
import { XV2BatchGeneratePane } from './XV2BatchGeneratePane';
import { AssistantPanel } from '../AssistantPanel';
import {
  buildAssistantContext,
  flattenActions,
  type TutorialEditorPart,
} from '../../../../lib/assistant';
import type { AssistantMessage, EditAction, ObjectSelection, ObjectStatus } from '../../../../lib/types';
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
import {
  contentSourceLabel,
  sentencesFromPickedContent,
  type PickedContentSource,
} from '../../../../lib/contentAsSource';
import { ContentLibrarySourcePicker } from './ContentLibrarySourcePicker';
import type { V2SourceRef } from '../../../../lib/tutorialV2/types';
import { useConfirm } from '../../ConfirmDialog';
import { getCollectionPath, objectCollectionIds } from '../../../../lib/objectCollectionsStore';

type MaterialSourceKind = 'pdf' | 'text' | 'web' | 'youtube';

function seedFv(typeId: StructuredObjectType): Record<string, any> {
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
    return { ncp: 4, showTranscript: true, enableChat: true, templateId: id, ...(t?.knobDefaults || {}) };
  }
  const id = getDefaultTemplateId(typeId as TemplateObjectType);
  const t = getObjectTemplate(id, typeId as TemplateObjectType);
  return t ? { templateId: t.id, ...t.knobDefaults } : {};
}

export function ObjectCreatorStructuredV2() {
  const {
    navigate, creatorObjectType, editingObjectId, clearEditingObject, createdObjects: createdObjectsRaw,
    pendingTemplateId, setPendingTemplateId, pendingAuthoringPath, setPendingAuthoringPath,
    addObject, createCollectionIds,
    objectCollections: objectCollectionsRaw, setActiveObjectCollectionId,
    listObjectVersions, objectVersionsTick,
    pipelineEditMode,
  driveCreateMode,
} = useApp();
  const createdObjects = createdObjectsRaw || [];
  const objectCollections = objectCollectionsRaw || [];
  const confirm = useConfirm();

  const typeId: StructuredObjectType = isStructuredV2Type(creatorObjectType) ? creatorObjectType : 'quiz';
  const noun = X_NOUNS[typeId];
  const isVideoScript = typeId === 'video-script';

  const [draft, setDraft] = useState<StructuredV2Draft>(() => {
    const fv = seedFv(typeId);
    return emptyStructuredDraft(typeId, {
      fv,
      templateId: fv.templateId,
      metadata: pendingAuthoringPath === 'write-yourself'
        ? { authoringPath: 'write-yourself' }
        : { authoringPath: 'template' },
      units: seedUnitsFromTemplate(typeId, fv),
    });
  });
  const [phase, setPhase] = useState<XV2Phase>('start');
  const [hootOpen, setHootOpen] = useState(false);
  const [batchUnitIds, setBatchUnitIds] = useState<string[] | null>(null);
  const restored = useRef(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingApplied = useRef(false);

  const writeYourself = draft.metadata.authoringPath === 'write-yourself';

  /* ── Sources state (V2-identical) ─────────────────────────── */
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
  /**
   * A published tutorial used as source material.
   *
   * Kept beside the other sources rather than replacing them: a quiz is often
   * "this tutorial, plus the errata sheet", and making the two exclusive would
   * force a choice nobody asked for.
   */
  const [contentSource, setContentSource] = useState<PickedContentSource | null>(null);
  const [contentPickerOpen, setContentPickerOpen] = useState(false);
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

  const setPathMode = (m: 'material' | 'prompt' | 'manual') => {
    setPathModeState(m);
    if (m === 'material' && enabledTypes.size === 0) setEnabledTypes(new Set(['pdf'] as MaterialSourceKind[]));
  };
  const toggleMaterialType = (kind: MaterialSourceKind) => {
    setPathModeState('material');
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) { if (next.size > 1) next.delete(kind); } else next.add(kind);
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
    if (!src) { setLibraryDoc(null); return; }
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
  const addVideoAsset = (patch: any) => setMedia((p) => [...p, { id: newSrcId('vid'), kind: 'video', ...patch }]);
  const updateMedia = (id: string, patch: any) => setMedia((p) => p.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const removeMedia = (id: string) => setMedia((p) => p.filter((m) => m.id !== id));

  const hasAnySource = !!(pdfSources.length || textSources.length || ytSources.length || webSources.length || librarySource || contentSource);

  /* ── persistence ──────────────────────────────────────────── */
  /** Versions the author may overwrite instead of adding another. */
  const submitVersions = useMemo(
    () => listObjectVersions(draft.id).filter((v) => !!v.snapshot),
    [listObjectVersions, draft.id, objectVersionsTick],
  );

  const persist = useCallback((next: StructuredV2Draft, saveOpts?: AddObjectOptions) => {
    const blocks = unitsToBlocks(next);
    const existing = createdObjects.find((o) => o.id === next.id);
    const fromExisting = existing ? objectCollectionIds(existing) : [];
    const collectionIds = fromExisting.length
      ? fromExisting
      : (createCollectionIds?.length ? createCollectionIds : undefined);
    addObject({
      id: next.id,
      type: next.type as any,
      title: next.title || `Untitled ${noun}`,
      status: next.status === 'submitted' ? 'in-review' : next.status === 'ready' ? 'approved' : 'draft',
      description: String(next.metadata.objective || ''),
      blocks: blocks as any,
      structuredV2Draft: { ...next, phase: next.phase || phase },
      collectionIds,
      // Draft saves keep content safe but leave history alone — see the same
      // note in the Tutorial V2 creator.
    } as any, saveOpts ?? { version: 'skip' });
    return collectionIds || [];
  }, [addObject, createCollectionIds, phase, createdObjects, noun]);

  const commit = useCallback((next: StructuredV2Draft, nextPhase?: XV2Phase) => {
    const withPhase = touchXDraft(next, nextPhase ? { phase: nextPhase } : {});
    setDraft(withPhase);
    if (nextPhase) setPhase(nextPhase);
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => persist(withPhase), 250);
  }, [persist]);

  const draftCollectionLabel = useCallback(() => {
    const existing = createdObjects.find((o) => o.id === draft.id);
    const fromExisting = existing ? objectCollectionIds(existing) : [];
    const useIds = fromExisting.length ? fromExisting : (createCollectionIds || []);
    const names = useIds.map((id) => {
      const path = getCollectionPath(objectCollections, id);
      const self = objectCollections.find((c) => c.id === id);
      if (!self) return null;
      if (!path.length) return self.name;
      return [...path.map((p) => p.name), self.name].join(' / ');
    }).filter(Boolean) as string[];
    return { ids: useIds, label: names.length ? names.map((n) => `“${n}”`).join(', ') : '“My content”' };
  }, [createdObjects, createCollectionIds, draft.id, objectCollections]);

  const saveDraft = async () => {
    persist(draft);
    const { ids, label } = draftCollectionLabel();
    if (ids[0]) setActiveObjectCollectionId?.(ids[0]);
    // The club compose flow owns the ending: publish and hand the author back to the
    // app, rather than the folder dialog and a trip to the Content Library — which is
    // the right ending in the Studio and a dead end on a phone.
    const compose = composePublisher();
    if (compose) {
      compose(draft.id);
      return;
    }
    /**
     * A PIPELINE EMBED HAS NO FOLDER DIALOG TO SHOW. Same reason as the tutorial
     * creators: this answers a Studio question, names a Studio-local folder rather
     * than the program folder the content lives in, and offers a trip the embed
     * cannot take. The embed reports the save itself, with the version.
     */
    // A drive session has no folder dialog either: the Drafts folder was decided
    // before authoring began, and the trip it offers leads to the Studio's library.
    if (pipelineEditMode || driveCreateMode) return false;
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

  /* ── template application (Use template / authoring path) ─── */
  useEffect(() => {
    if (!pendingAuthoringPath) return;
    setPendingAuthoringPath(null);
  }, [pendingAuthoringPath, setPendingAuthoringPath]);

  useEffect(() => {
    if (!pendingTemplateId || pendingApplied.current || editingObjectId) return;
    pendingApplied.current = true;
    const t = getObjectTemplate(pendingTemplateId, typeId as TemplateObjectType);
    if (t) {
      const fv = { ...draft.fv, templateId: t.id, ...t.knobDefaults };
      commit(touchXDraft(draft, {
        fv,
        templateId: t.id,
        units: seedUnitsFromTemplate(typeId, fv),
      }));
    }
    setPendingTemplateId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTemplateId, typeId, editingObjectId, setPendingTemplateId]);

  /* ── reopen from Content Library ──────────────────────────── */
  useEffect(() => { restored.current = false; }, [editingObjectId]);

  useEffect(() => {
    if (restored.current || !editingObjectId) return;
    const obj = createdObjects.find((o) => o.id === editingObjectId) || OBJECTS.find((o) => o.id === editingObjectId);
    if (!obj || obj.type !== typeId) return;
    restored.current = true;
    const existing = draftFromLearningObjectX(obj as any);
    if (existing) {
      setDraft(existing);
      const p = existing.phase || (existing.units.some((u) => u.slots.some((s) => s.done)) ? 'navigator' : existing.title ? 'structure' : 'start');
      setPhase(p === 'unit' && !existing.activeUnitId ? 'navigator' : p);
    } else {
      const fv = seedFv(typeId);
      const { units, video } = blocksToUnits(typeId, obj.blocks || [], fv);
      const next = emptyStructuredDraft(typeId, {
        id: obj.id,
        title: obj.title,
        metadata: { objective: obj.description || '', authoringPath: 'template' },
        fv,
        templateId: fv.templateId,
        units,
        ...(video ? { video } : {}),
        phase: (obj.blocks || []).length ? 'review' : 'start',
      });
      setDraft(next);
      setPhase((obj.blocks || []).length ? 'review' : 'start');
    }
    // Rehydrate sources panel from the saved pool.
    const pool = existing?.sourcePool || [];
    if (pool.length) {
      setTextSources(pool.filter((s) => s.kind === 'text').map((s) => ({
        id: s.id, doc: { fileName: s.label, pageCount: 1, sentences: s.sentences || [] },
      })));
      setPdfSources(pool.filter((s) => s.kind === 'pdf').map((s) => ({
        id: s.id, file: null, doc: { fileName: s.label, pageCount: 1, sentences: s.sentences || [] },
      })));
      setYtSources(pool.filter((s) => s.kind === 'youtube').map((s) => ({
        id: s.id, url: s.sourceUrl || '', videoId: '', videoTitle: s.label, segments: [],
        doc: { fileName: s.label, pageCount: 1, sentences: s.sentences || [] },
      })));
      setWebSources(pool.filter((s) => s.kind === 'web').map((s) => ({
        id: s.id, url: s.sourceUrl || '',
        doc: { fileName: s.label, pageCount: 1, sentences: s.sentences || [], html: s.html, sourceUrl: s.sourceUrl },
      })));
      /*
        Content read back from the pool keeps its label and its sentences but not
        the tutorial's outline — that came from the live object, which may have
        changed since. Reopening the picker re-reads it; until then the Sources
        step shows what was used rather than pretending to know the outline.
      */
      const contentRef = pool.find((s) => s.kind === 'content');
      if (contentRef) {
        const meta = (contentRef.meta || {}) as Record<string, unknown>;
        const sectionIds = Array.isArray(meta.sectionIds) ? (meta.sectionIds as string[]) : [];
        setContentSource({
          objectId: String(meta.objectId || ''),
          title: contentRef.label,
          type: String(meta.objectType || 'tutorial'),
          versionId: meta.versionId ? String(meta.versionId) : undefined,
          sections: [],
          pickedSectionIds: sectionIds,
        });
      }
    }
    if (existing?.media?.length) setMedia(existing.media);
  }, [editingObjectId, createdObjects, typeId]);

  /* ── sources → pool ───────────────────────────────────────── */
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
      const pool: V2SourceRef[] = [];
      for (const p of nextPdf) {
        if (!p.doc?.sentences?.length) continue;
        pool.push({ id: p.id, label: p.doc.fileName || p.file?.name || 'PDF', kind: 'pdf', sentences: p.doc.sentences });
      }
      for (const t of textSources) pool.push({ id: t.id, label: t.doc.fileName || 'Pasted notes', kind: 'text', sentences: t.doc.sentences || [] });
      for (const y of ytSources) pool.push({ id: y.id, label: y.doc.fileName || y.videoTitle || 'YouTube transcript', kind: 'youtube', sentences: y.doc.sentences || [], sourceUrl: y.url });
      for (const w of webSources) pool.push({ id: w.id, label: w.doc.fileName || w.url || 'Website', kind: 'web', sentences: w.doc.sentences || [], html: w.doc.html, sourceUrl: w.doc.sourceUrl || w.url });
      if (libraryDoc && librarySource) pool.push({ id: `library-${librarySource.id}`, label: librarySource.title, kind: 'library', sentences: libraryDoc.sentences || [] });
      if (contentSource) {
        const sentences = sentencesFromPickedContent(contentSource);
        if (sentences.length) {
          pool.push({
            id: `content-${contentSource.objectId}`,
            label: contentSourceLabel(contentSource),
            kind: 'content',
            sentences,
            // What it was read from, so a later version of the tutorial can be
            // recognised as a different thing rather than silently assumed.
            meta: {
              objectId: contentSource.objectId,
              objectType: contentSource.type,
              versionId: contentSource.versionId,
              sectionIds: contentSource.pickedSectionIds,
              sectionCount: contentSource.sections.length,
            },
          });
        }
      }

      const yt = ytSources[0];
      commit(touchXDraft(draft, {
        sourcePool: pool,
        media,
        ...(isVideoScript && yt
          ? { video: { url: yt.url, videoId: yt.videoId || parseYtId(yt.url), title: yt.videoTitle || undefined, transcript: yt.segments } }
          : {}),
      }), 'navigator');
    } finally {
      setSourcesBusy(false);
    }
  };

  /* ── phase navigation ─────────────────────────────────────── */
  const canReview = allUnitsReady(draft.units) || phase === 'review';
  const goToPhase = (p: XV2Phase) => {
    if (p === 'review' && !canReview) return;
    commit(touchXDraft(draft, { activeUnitId: p === 'unit' ? draft.activeUnitId : null }), p);
  };

  const activeUnit = draft.units.find((u) => u.id === draft.activeUnitId) || null;

  /* ── global Hoot ──────────────────────────────────────────── */
  const hootParts = useMemo(() => partsForAssistant(draft), [draft]);
  const hootSelection: ObjectSelection = { kind: 'none' };
  const hootContext = useMemo(() => buildAssistantContext({
    objectId: draft.id,
    objectType: draft.type,
    title: draft.title,
    status: draft.status,
    objective: String(draft.metadata.objective || ''),
    fv: { ...draft.fv, phase },
    parts: hootParts as TutorialEditorPart[],
    selection: hootSelection,
  }), [draft, hootParts, phase]);

  const applyHootActions = (actions: EditAction[]) => {
    const flat = flattenActions(actions);
    const result = applyAssistantActionsToDraft(draft, flat as any[]);
    commit(result.draft);
  };

  const globalHoot = (
    <AssistantPanel
      open={hootOpen}
      onOpenChange={setHootOpen}
      context={hootContext}
      selection={hootSelection}
      parts={hootParts as TutorialEditorPart[]}
      onAcceptActions={(actions) => applyHootActions(actions)}
      messages={draft.assistantMessages || []}
      onMessagesChange={(m: AssistantMessage[]) => commit(touchXDraft(draft, { assistantMessages: m }))}
      phaseLabel={phase === 'start' ? 'Plan' : phase === 'structure' ? 'Structure' : phase === 'sources' ? 'Sources' : phase === 'review' ? 'Review' : 'Author'}
    />
  );

  /* ── chrome ───────────────────────────────────────────────── */
  const template = getObjectTemplate(
    draft.fv.templateId || getDefaultTemplateId(typeId as TemplateObjectType),
    typeId as TemplateObjectType,
  );

  const railSteps: { id: XV2Phase; label: string; icon: React.ReactNode }[] = [
    { id: 'start', label: 'Plan', icon: <ListOrdered size={12} /> },
    { id: 'structure', label: 'Structure', icon: <LayoutList size={12} /> },
    ...(writeYourself ? [] : [{ id: 'sources' as const, label: 'Sources', icon: <Database size={12} /> }]),
    { id: 'navigator', label: 'Author', icon: <PenLine size={12} /> },
    { id: 'review', label: 'Review', icon: <Eye size={12} /> },
  ];
  const activeRailId: XV2Phase = phase === 'unit' ? 'navigator' : phase;
  const activeIndex = Math.max(0, railSteps.findIndex((s) => s.id === activeRailId));

  const rail = (
    <div className="flex items-center gap-0 overflow-x-auto py-1">
      {railSteps.map((s, i) => {
        const isActive = s.id === activeRailId;
        const isPast = i < activeIndex;
        const canClick = s.id === 'review' ? (canReview || isPast) : (i <= activeIndex || isPast || true) && !isActive;
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
              }}
            >
              {isPast && !isActive ? <Check size={12} /> : s.icon}
              <span style={{ fontSize: 12.5, fontWeight: isActive ? 650 : 500 }}>{s.label}</span>
            </button>
            {i < railSteps.length - 1 && (
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
        fontSize: 13.5, fontWeight: 650, color: '#065F46',
        background: pastelFromHex('#059669', 0.82),
        border: '1px solid rgba(5,150,105,0.3)',
        boxShadow: '0 10px 28px -12px rgba(5,150,105,0.55)',
      }}
    >
      {/* In a club compose session this button publishes — the tail is redirected in
          saveDraft — so it must not still say "Save". */}
      <Save size={15} /> {composePublisher() ? 'Publish' : 'Save'}
    </button>
  );

  const bg = { background: 'linear-gradient(180deg, #F4F6FB 0%, #EEF1F8 100%)' };

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
      {template && !writeYourself ? (
        <p className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full" style={{ fontSize: 11.5, fontWeight: 650, background: '#F5F3FF', color: '#6D28D9', border: '1px solid rgba(124,58,237,0.25)' }}>
          Template · {template.name}
        </p>
      ) : null}
    </div>
  );

  const inputStyle: React.CSSProperties = {
    fontSize: 14,
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: 12,
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.95)',
    outline: 'none',
  };

  /* ── A. Plan ──────────────────────────────────────────────── */
  if (phase === 'start') {
    return (
      <>
        <div className="min-h-full px-4 py-5" style={{ ...bg, paddingBottom: 88 }}>
          {header({
            title: 'Plan',
            subtitle: `Name this ${noun} and say what it should achieve`,
            backLabel: 'Back to Create',
            onBack: () => { clearEditingObject?.(); navigate('cd-create'); },
          })}
          <div className="max-w-xl mx-auto space-y-4">
            <label className="block">
              <span style={{ fontSize: 12, fontWeight: 650, color: '#6B7280', display: 'block', marginBottom: 6 }}>Title</span>
              <input
                value={draft.title}
                onChange={(e) => commit(touchXDraft(draft, { title: e.target.value }))}
                placeholder={`e.g. ${noun[0].toUpperCase()}${noun.slice(1)} on bidding basics`}
                className="w-full"
                style={inputStyle}
              />
            </label>
            <label className="block">
              <span style={{ fontSize: 12, fontWeight: 650, color: '#6B7280', display: 'block', marginBottom: 6 }}>Objective</span>
              <textarea
                value={String(draft.metadata.objective || '')}
                onChange={(e) => commit(touchXDraft(draft, { metadata: { ...draft.metadata, objective: e.target.value } }))}
                placeholder={`What should learners get from this ${noun}?`}
                rows={3}
                className="w-full resize-none"
                style={inputStyle}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span style={{ fontSize: 12, fontWeight: 650, color: '#6B7280', display: 'block', marginBottom: 6 }}>Audience</span>
                <input
                  value={String(draft.metadata.audience || '')}
                  onChange={(e) => commit(touchXDraft(draft, { metadata: { ...draft.metadata, audience: e.target.value } }))}
                  placeholder="e.g. High school"
                  className="w-full"
                  style={inputStyle}
                />
              </label>
              <label className="block">
                <span style={{ fontSize: 12, fontWeight: 650, color: '#6B7280', display: 'block', marginBottom: 6 }}>Level</span>
                <input
                  value={String(draft.metadata.level || '')}
                  onChange={(e) => commit(touchXDraft(draft, { metadata: { ...draft.metadata, level: e.target.value } }))}
                  placeholder="e.g. Basic"
                  className="w-full"
                  style={inputStyle}
                />
              </label>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => goToPhase('structure')}
                className="px-5 py-2.5 rounded-full text-white"
                style={{ fontSize: 13, fontWeight: 650, background: '#0B0F1A' }}
              >
                Continue to Structure →
              </button>
            </div>
          </div>
        </div>
        {saveButton}
        {globalHoot}
      </>
    );
  }

  /* ── B. Structure ─────────────────────────────────────────── */
  if (phase === 'structure') {
    return (
      <>
        <div className="min-h-full px-4 py-5" style={{ ...bg, paddingBottom: 88 }}>
          {header({
            title: 'Structure',
            subtitle: `The parts of this ${noun}, extracted from your template — edit before authoring`,
            backLabel: 'Back to Plan',
            onBack: () => goToPhase('start'),
          })}
          <div className="max-w-3xl mx-auto">
            <XV2StructurePanel
              type={typeId}
              units={draft.units}
              onChangeUnits={(units) => commit(touchXDraft(draft, { units }))}
              templateName={writeYourself ? null : template?.name}
            />
            <div className="mt-5">
              <button
                type="button"
                onClick={() => goToPhase(writeYourself ? 'navigator' : 'sources')}
                className="px-5 py-2.5 rounded-full text-white"
                style={{ fontSize: 13, fontWeight: 650, background: '#0B0F1A' }}
              >
                Continue to {writeYourself ? 'Author' : 'Sources'} →
              </button>
            </div>
          </div>
        </div>
        {saveButton}
        {globalHoot}
      </>
    );
  }

  /* ── C. Sources ───────────────────────────────────────────── */
  if (phase === 'sources') {
    return (
      <>
        <div className="min-h-full flex flex-col" style={bg}>
          <div className="px-5 pt-5 pb-2 shrink-0">
            {header({
              title: 'Sources',
              subtitle: isVideoScript
                ? 'Add the YouTube video (required for the player) and any supporting material'
                : `Material the AI draws on — each part sub-selects from this pool later`,
              backLabel: 'Back to Structure',
              onBack: () => goToPhase('structure'),
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
              imagesOnly={typeId === 'flashcard-set'}
              showManualWrite={false}
              objectNoun={noun}
              librarySource={librarySource}
              onPickLibrarySource={pickLibrarySource}
              contentSource={contentSource}
              onPickContentSource={setContentSource}
              onOpenContentPicker={() => setContentPickerOpen(true)}
              media={media}
              addImagesFromFiles={addImagesFromFiles}
              addVideo={addVideoAsset}
              updateMedia={updateMedia}
              removeMedia={removeMedia}
            />
          </div>
          {(sourcesError || sourcesBusy) && (
            <div className="px-5 py-2 shrink-0" style={{ fontSize: 13, color: sourcesError ? '#B91C1C' : '#6B7280' }}>
              {sourcesBusy
                ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Preparing sources…</span>
                : sourcesError}
            </div>
          )}
          <div
            className="shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-t"
            style={{ background: 'rgba(255,255,255,0.92)', borderColor: 'rgba(0,0,0,0.06)' }}
          >
            <p style={{ fontSize: 12.5, color: '#6B7280' }}>
              {hasAnySource
                ? 'Sources attach to the shared pool — each part sub-selects later'
                : 'Add at least one source, or continue and author by hand'}
            </p>
            <button
              type="button"
              disabled={sourcesBusy}
              onClick={() => void continueFromSources()}
              className="px-5 py-2.5 rounded-full text-white disabled:opacity-50"
              style={{ fontSize: 13, fontWeight: 650, background: '#0B0F1A' }}
            >
              {hasAnySource ? 'Continue →' : 'Skip sources →'}
            </button>
          </div>
        </div>
        <ContentLibrarySourcePicker
          open={contentPickerOpen}
          onClose={() => setContentPickerOpen(false)}
          onConfirm={(src) => { setContentSource(src); setPathModeState('material'); }}
          createdObjects={createdObjects || []}
          initialObjectId={contentSource?.objectId}
          initialSectionIds={contentSource?.pickedSectionIds}
          noun={noun}
        />
        {saveButton}
        {globalHoot}
      </>
    );
  }

  /* ── E. Unit workspace ────────────────────────────────────── */
  if (phase === 'unit' && activeUnit) {
    return (
      <>
        <div className="min-h-full px-4 py-5" style={{ ...bg, paddingBottom: 88 }}>
          {header({
            title: activeUnit.title,
            subtitle: 'Write each item yourself — or generate this part from your sources',
            backLabel: 'Back to outline',
            onBack: () => commit(touchXDraft(draft, { activeUnitId: null }), 'navigator'),
          })}
          <XV2UnitWorkspace
            draft={draft}
            unit={activeUnit}
            allowAiGenerate={!writeYourself}
            onChangeUnit={(patch) => commit(updateUnit(draft, activeUnit.id, patch))}
            onMarkDone={(done) => commit(updateUnit(draft, activeUnit.id, { done }))}
          />
        </div>
        {saveButton}
        {globalHoot}
      </>
    );
  }

  /* ── F. Review ────────────────────────────────────────────── */
  if (phase === 'review') {
    return (
      <>
        <XV2ReviewEditor
          draft={draft}
          onChangeDraft={(next) => commit(next)}
          onBack={() => commit(touchXDraft(draft, { activeUnitId: null }), 'navigator')}
          onSave={() => void saveDraft()}
          onSubmit={(target) => {
            const next = touchXDraft(draft, { status: 'submitted', phase: 'review' });
            // The save itself performs the one versioning act the author picked,
            // so it runs against the content being saved rather than the stale
            // copy a follow-up call would see.
            persist(next, {
              version: target?.versionId ? { overwriteId: target.versionId } : 'new',
              onVersionError: (msg) => window.alert(msg),
            });
            setDraft(next);
            clearEditingObject?.();
            navigate('cd-library');
          }}
          canSubmit={allUnitsReady(draft.units)}
          submitVersions={submitVersions}
          rail={rail}
        />
        {globalHoot}
      </>
    );
  }

  /* ── D. Navigator (default) ───────────────────────────────── */
  if (batchUnitIds?.length) {
    return (
      <>
        <div className="min-h-full px-4 py-5" style={{ ...bg, paddingBottom: 88 }}>
          {header({
            title: 'Generate categories with AI',
            subtitle: 'One pick-sources → mark-up → generate run fills every selected category',
            backLabel: 'Back to outline',
            onBack: () => setBatchUnitIds(null),
          })}
          <XV2BatchGeneratePane
            draft={draft}
            unitIds={batchUnitIds}
            onChangeDraft={(next) => commit(next)}
            onDone={() => setBatchUnitIds(null)}
          />
        </div>
        {saveButton}
        {globalHoot}
      </>
    );
  }

  return (
    <>
      <div className="min-h-full px-4 py-5" style={{ ...bg, paddingBottom: 88 }}>
        {header({
          title: draft.title || `Untitled ${noun}`,
          subtitle: 'Author each part — write it yourself or generate it from your sources',
          backLabel: writeYourself ? 'Back to Structure' : 'Back to Sources',
          onBack: () => goToPhase(writeYourself ? 'structure' : 'sources'),
        })}
        <XV2Navigator
          draft={draft}
          onOpenUnit={(unitId) => commit(touchXDraft(draft, { activeUnitId: unitId }), 'unit')}
          onReview={() => goToPhase('review')}
          onBatchGenerate={typeId === 'concept-card' && !writeYourself
            ? (ids) => setBatchUnitIds(ids)
            : undefined}
        />
      </div>
      {saveButton}
      {globalHoot}
    </>
  );
}
