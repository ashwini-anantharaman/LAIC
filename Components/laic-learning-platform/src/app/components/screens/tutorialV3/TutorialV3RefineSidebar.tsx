/**
 * Collapsible “Refine with AI” sidebar for Tutorial V3 Review (edit mode).
 * Shared by write-yourself and template pipelines.
 * Hoot (same chat + image attach as V1) + sources/markup + library / generate embeds.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Database, FileText, FolderOpen, Loader2,
  Plus, Sparkles, Type, Image as ImageIcon, Youtube, X, Wand2, LayoutGrid, ListChecks,
} from 'lucide-react';
import { AssistantPanel } from '../AssistantPanel';
import { MarkupWorkspace } from '../MarkupWorkspace';
import { LibraryPickerModal } from '../../LibraryPickerModal';
import {
  applyEditActionsToParts,
  buildAssistantContext,
  flattenActions,
  snapshotParts,
  type TutorialEditorPart,
} from '../../../../lib/assistant';
import {
  movePartToPage,
  partPageNumbers,
  pipelineDraftFromV3,
  sourcePoolToMarkupSources,
} from '../../../../lib/tutorialV3/draftModel';
import { findLibraryLearningObject, makeLibraryEmbedPart } from '../../../../lib/libraryEmbed';
import {
  listEmbeddableLibraryObjects,
  type LibraryObjectChoice,
} from '../../../../lib/tutorialV3/tutorialTemplates';
import { parsePdf, docFromText } from '../../../../lib/pdf';
import { makeBridgeEmbedPart, type BridgeEmbedKind } from '../../../../lib/tutorialV3/bridgeEmbed';
import { errorMessage, fetchWebImage, ingestYoutube } from '../../../../lib/api';
import { IMAGE_DRAG_MIME } from '../../../../lib/tutorialV3/imageDrag';
import { useApp } from '../../../App';
import type { TutorialV3Draft, TutorialV3Part, V3SourceRef, V3TopLevelSlot } from '../../../../lib/tutorialV3/types';
import type { AssistantMessage, EditAction, LearningObject, ObjectSelection, ObjectType } from '../../../../lib/types';
import { parseYtId } from './TutorialV3SourcePanel';
import { TutorialV3ObjectGeneratePane } from './TutorialV3ObjectGeneratePane';

type Tab = 'hoot' | 'sources' | 'add';

/**
 * Everything the Refine sidebar can generate into an existing tutorial.
 * Typed as string rather than ObjectType because the last six are block types,
 * not library objects — nothing puts a `matching` in the Object Library.
 */
const GEN_TYPES: { type: string; label: string }[] = [
  { type: 'flashcard-set', label: 'Flashcards' },
  { type: 'quiz', label: 'Quiz' },
  { type: 'concept-card', label: 'Concept card' },
  { type: 'summary', label: 'Summary' },
  { type: 'reflection', label: 'Reflection' },
  { type: 'assignment', label: 'Assignment' },
  { type: 'drill', label: 'Drill' },
  { type: 'lesson-overview', label: 'Lesson overview' },
  { type: 'lesson-complete', label: 'Lesson complete' },
  { type: 'reference-table', label: 'Reference table' },
  { type: 'quick-decisions', label: 'Quick decisions' },
  { type: 'matching', label: 'Matching' },
  { type: 'opening-question', label: 'Opening question' },
];

export function TutorialV3RefineSidebar({
  open,
  onOpenChange,
  draft,
  parts,
  onChangeParts,
  onChangeDraft,
  selectedPartId,
  onSelectPart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: TutorialV3Draft;
  parts: TutorialV3Part[];
  onChangeParts: (parts: TutorialV3Part[]) => void;
  onChangeDraft: (patch: Partial<TutorialV3Draft>) => void;
  selectedPartId: string | null;
  onSelectPart: (id: string | null) => void;
}) {
  const { createdObjects } = useApp();
  const [tab, setTab] = useState<Tab>('hoot');
  const [undoStack, setUndoStack] = useState<ReturnType<typeof snapshotParts>[]>([]);
  const [redoStack, setRedoStack] = useState<ReturnType<typeof snapshotParts>[]>([]);
  const partsRef = useRef(parts);
  partsRef.current = parts;

  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState<LibraryObjectChoice[]>([]);
  const [libraryStatus, setLibraryStatus] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle');
  const [genType, setGenType] = useState<string | null>(null);
  const [genSlot, setGenSlot] = useState<V3TopLevelSlot | null>(null);
  const [sourcePanel, setSourcePanel] = useState<'pdf' | 'text' | 'youtube' | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [ytUrl, setYtUrl] = useState('');
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [markupOpen, setMarkupOpen] = useState(false);
  const [activeTag, setActiveTag] = useState('Use');
  const [aiSuggestions, setAiSuggestions] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [markupFlags, setMarkupFlags] = useState<any[]>([]);
  const pdfRef = useRef<HTMLInputElement | null>(null);

  const selection: ObjectSelection = selectedPartId
    ? { kind: 'block', blockId: selectedPartId }
    : { kind: 'none' };

  const pipelineDraft = useMemo(
    () => pipelineDraftFromV3(draft),
    [draft],
  );

  // Label each part with its student page so Hoot can move blocks across pages.
  const partsForContext = useMemo(() => {
    const pages = partPageNumbers(parts);
    return parts.map((p, i) => ({
      ...p,
      label: `${p.label || p.type || 'Part'} · page ${pages[i]}`,
    }));
  }, [parts]);

  const assistantContext = useMemo(() => buildAssistantContext({
    objectId: draft.id,
    objectType: 'tutorial-v3',
    title: draft.title || 'Untitled tutorial',
    status: draft.status === 'submitted' ? 'in-review' : 'draft',
    scope: 'bridge',
    objective: String(draft.metadata.objective || ''),
    fv: pipelineDraft.fv,
    parts: partsForContext as TutorialEditorPart[],
    pipelineDraft,
    selection,
  }), [draft, partsForContext, pipelineDraft, selection]);

  const pushUndo = () => {
    setUndoStack((s) => [
      ...s.slice(-39),
      snapshotParts(
        partsRef.current as TutorialEditorPart[],
        draft.title,
        String(draft.metadata.objective || ''),
      ),
    ]);
    setRedoStack([]);
  };

  const applyEditActions = (actions: EditAction[], _label: string) => {
    pushUndo();
    // Hoot can move a block to another student page: update_block { patch: { page: N } }.
    const flat = flattenActions(actions);
    const pageMoves: { blockId: string; page: number }[] = [];
    const cleaned = flat.map((a: any) => {
      if (a?.type === 'update_block' && a.patch && a.patch.page != null) {
        pageMoves.push({ blockId: String(a.blockId), page: Number(a.patch.page) || 1 });
        const { page: _page, ...rest } = a.patch;
        if (!Object.keys(rest).length) return null;
        return { ...a, patch: rest };
      }
      return a;
    }).filter(Boolean) as EditAction[];
    const result = applyEditActionsToParts(partsRef.current as TutorialEditorPart[], cleaned, {
      title: draft.title,
      objective: String(draft.metadata.objective || ''),
      fv: pipelineDraft.fv,
    });
    let nextParts = result.parts as TutorialV3Part[];
    for (const mv of pageMoves) nextParts = movePartToPage(nextParts, mv.blockId, mv.page);
    result.parts = nextParts as any;
    if (pageMoves.length) {
      // Atomic: parts + manual-pages flag in one patch (stale-draft safety).
      onChangeDraft({ assembledParts: nextParts, manualPageBreaks: true });
    } else {
      onChangeParts(nextParts);
    }
    if (result.meta?.title != null) onChangeDraft({ title: result.meta.title });
    if (result.meta?.objective != null) {
      onChangeDraft({ metadata: { ...draft.metadata, objective: result.meta.objective } });
    }
    const focusId = result.affectedIds[result.affectedIds.length - 1];
    if (focusId) onSelectPart(focusId);
  };

  const undo = () => {
    setUndoStack((stack) => {
      if (!stack.length) return stack;
      const prev = stack[stack.length - 1];
      setRedoStack((r) => [
        ...r,
        snapshotParts(partsRef.current as TutorialEditorPart[], draft.title, String(draft.metadata.objective || '')),
      ]);
      onChangeParts(prev.parts as TutorialV3Part[]);
      if (prev.title !== draft.title) onChangeDraft({ title: prev.title });
      return stack.slice(0, -1);
    });
  };

  const redo = () => {
    setRedoStack((stack) => {
      if (!stack.length) return stack;
      const next = stack[stack.length - 1];
      setUndoStack((u) => [
        ...u,
        snapshotParts(partsRef.current as TutorialEditorPart[], draft.title, String(draft.metadata.objective || '')),
      ]);
      onChangeParts(next.parts as TutorialV3Part[]);
      if (next.title !== draft.title) onChangeDraft({ title: next.title });
      return stack.slice(0, -1);
    });
  };

  useEffect(() => {
    if (!libraryOpen) return;
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
  }, [libraryOpen, createdObjects]);

  const addSource = (src: V3SourceRef) => {
    onChangeDraft({ sourcePool: [...(draft.sourcePool || []), src] });
  };

  const removeSource = (id: string) => {
    onChangeDraft({ sourcePool: (draft.sourcePool || []).filter((s) => s.id !== id) });
  };

  const handlePdfs = async (files: FileList | File[] | null) => {
    if (!files?.length) return;
    const list = Array.from(files).filter((f) => (
      !f.type || f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    ));
    if (!list.length) {
      setSourceError('Choose PDF files.');
      return;
    }
    setSourceError(null);
    setSourceBusy(true);
    const added: V3SourceRef[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const parsed = await parsePdf(file, () => {});
        added.push({
          id: `src-pdf-${Date.now().toString(36)}-${i}`,
          label: file.name,
          kind: 'pdf',
          sentences: parsed.sentences || [],
          html: (parsed as any).html,
          meta: { fileName: file.name },
        });
      }
      if (added.length) {
        onChangeDraft({ sourcePool: [...(draft.sourcePool || []), ...added] });
      }
      setSourcePanel(null);
    } catch (e: any) {
      if (added.length) {
        onChangeDraft({ sourcePool: [...(draft.sourcePool || []), ...added] });
      }
      setSourceError(e?.message || 'Could not parse one of the PDFs.');
    } finally {
      setSourceBusy(false);
    }
  };

  const handlePasteText = () => {
    const text = pasteText.trim();
    if (!text) return;
    const textCount = (draft.sourcePool || []).filter((s) => s.kind === 'text').length;
    const label = textCount ? `Pasted source ${textCount + 1}` : 'Pasted source';
    const doc = docFromText(text, label);
    addSource({
      id: `src-text-${Date.now().toString(36)}`,
      label,
      kind: 'text',
      sentences: doc.sentences || [],
      html: (doc as any).html,
    });
    setPasteText('');
  };

  const handleFetchYoutube = async () => {
    if (!ytUrl.trim()) return;
    setSourceError(null);
    setSourceBusy(true);
    const url = ytUrl.trim();
    try {
      const out = await ingestYoutube(url);
      addSource({
        id: `src-yt-${Date.now().toString(36)}`,
        label: out.title || 'YouTube transcript',
        kind: 'youtube',
        sentences: (out.sentences || []).map((t) => ({ text: t, page: 1 })),
        sourceUrl: url,
        meta: {
          url,
          videoId: out.videoId || parseYtId(url),
          videoTitle: out.title || '',
          segments: out.segments || [],
        },
      });
      setYtUrl('');
    } catch (e) {
      setSourceError(errorMessage(e, 'Could not fetch that transcript.'));
    } finally {
      setSourceBusy(false);
    }
  };

  /** A Bridge Platform component, dormant until a reader opens it. The kind is
   *  the block's MODE — an author picks the one they mean from the Blocks row
   *  rather than adding a table and then converting it in Configure. */
  const addBridgeEmbed = (kind: BridgeEmbedKind = 'table') => {
    pushUndo();
    const id = `p-refine-${Date.now().toString(36)}`;
    onChangeParts([...parts, makeBridgeEmbedPart(kind, id)]);
    onSelectPart(id);
  };

  const addManualPart = (kind: 'rich-text' | 'image' | 'video') => {
    pushUndo();
    const id = `p-refine-${Date.now().toString(36)}`;
    const part: TutorialV3Part = kind === 'rich-text'
      ? { id, type: 'rich-text', label: 'Text', heading: '', body: '' }
      : kind === 'image'
        ? { id, type: 'image', label: 'Media · image', url: '', caption: '', mediaKind: 'image' }
        : { id, type: 'video', label: 'Media · YouTube', url: '', videoId: '', caption: '', mediaKind: 'video' };
    onChangeParts([...parts, part]);
    onSelectPart(id);
  };

  const addImagePart = (url: string, caption: string) => {
    pushUndo();
    const id = `p-refine-${Date.now().toString(36)}`;
    onChangeParts([...parts, { id, type: 'image', label: 'Media · image', url, caption, mediaKind: 'image' }]);
    onSelectPart(id);
  };

  /** Images harvested from website sources (deduped across sources). */
  const sourceImages = useMemo(() => {
    const out: { src: string; alt?: string; caption?: string; sourceLabel: string }[] = [];
    const seen = new Set<string>();
    for (const s of draft.sourcePool || []) {
      for (const img of s.images || []) {
        if (!img?.src || seen.has(img.src)) continue;
        seen.add(img.src);
        out.push({ ...img, sourceLabel: s.label });
      }
    }
    return out;
  }, [draft.sourcePool]);

  const [placingImageSrc, setPlacingImageSrc] = useState<string | null>(null);
  const imageUploadRef = useRef<HTMLInputElement | null>(null);

  /** Place a website image: inline it via the server (durable) or fall back to hotlinking. */
  const addImageFromSource = async (img: { src: string; alt?: string; caption?: string }) => {
    if (placingImageSrc) return;
    setPlacingImageSrc(img.src);
    let url = img.src;
    if (!url.startsWith('data:')) {
      try {
        const out = await fetchWebImage(url);
        if (out.dataUri) url = out.dataUri;
      } catch { /* hotlink fallback — image still renders from the original site */ }
    }
    addImagePart(url, img.caption || img.alt || '');
    setPlacingImageSrc(null);
  };

  const addImagesFromUpload = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    const urls = await Promise.all(imgs.map((file) => new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    })));
    const valid = urls.filter(Boolean);
    if (!valid.length) return;
    pushUndo();
    const stamp = Date.now().toString(36);
    const added: TutorialV3Part[] = valid.map((url, i) => (
      { id: `p-refine-${stamp}-${i}`, type: 'image', label: 'Media · image', url, caption: '', mediaKind: 'image' }
    ));
    onChangeParts([...parts, ...added]);
    onSelectPart(added[added.length - 1].id);
  };

  const startGenerate = (type: string) => {
    setGenType(type);
    setGenSlot({
      id: `gen-refine-${Date.now().toString(36)}`,
      kind: 'generate',
      objectType: type,
      required: false,
      recipeIndex: -1,
      done: false,
      pickedSourceIds: (draft.sourcePool || []).map((s) => s.id),
      highlights: draft.refineHighlights || [],
    });
  };

  const markupBundle = useMemo(
    () => sourcePoolToMarkupSources(draft.sourcePool || []),
    [draft.sourcePool],
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="shrink-0 flex flex-col items-center gap-2 py-4 px-1.5 border-l"
        style={{
          width: 44,
          background: 'linear-gradient(180deg, #F8FAFC 0%, #EEF2F7 100%)',
          borderColor: 'rgba(0,0,0,0.08)',
          color: '#374151',
        }}
        title="Refine with AI"
      >
        <Sparkles size={16} style={{ color: '#4d7c5a' }} />
        <span
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontSize: 11.5,
            fontWeight: 650,
            letterSpacing: '0.04em',
          }}
        >
          Refine with AI
        </span>
        <ChevronLeft size={14} style={{ color: '#9AA3AF' }} />
      </button>
    );
  }

  return (
    <aside
      /*
        Stacked under the editor on a phone, this panel is as tall as its
        content and leaves the editor a sliver. Capping it keeps both usable;
        side by side on a wide screen it takes the full column height as before.
      */
      className="shrink-0 flex flex-col border-t md:border-t-0 md:border-l min-h-0 max-h-[60vh] md:max-h-none"
      style={{
        width: 'min(400px, 100%)',
        background: '#fff',
        borderColor: 'rgba(0,0,0,0.08)',
        boxShadow: '-8px 0 24px -16px rgba(30,50,80,0.18)',
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2.5 shrink-0"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'rgba(77,124,90,0.04)' }}
      >
        <Sparkles size={15} style={{ color: '#4d7c5a' }} />
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0B1220' }}>Refine with AI</p>
          <p style={{ fontSize: 11, color: '#6B7280' }}>Optional — keep writing by hand anytime</p>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5"
          title="Collapse"
        >
          <ChevronRight size={16} style={{ color: '#6B7280' }} />
        </button>
      </div>

      <div className="flex gap-1 px-2 py-2 shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        {([
          { id: 'hoot' as const, label: 'Hoot', icon: <Sparkles size={12} /> },
          { id: 'sources' as const, label: 'Sources', icon: <Database size={12} /> },
          { id: 'add' as const, label: 'Add', icon: <Plus size={12} /> },
        ]).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-full"
            style={{
              fontSize: 11.5,
              fontWeight: 650,
              background: tab === t.id ? '#1e2b3d' : 'transparent',
              color: tab === t.id ? '#fff' : '#6B7280',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {tab === 'hoot' && (
          <div className="flex-1 min-h-0">
            <AssistantPanel
              variant="docked"
              open
              onOpenChange={() => {}}
              context={assistantContext}
              selection={selection}
              parts={parts as TutorialEditorPart[]}
              onFocusBlock={(id) => onSelectPart(id)}
              onAcceptActions={applyEditActions}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              onUndo={undo}
              onRedo={redo}
              messages={draft.assistantMessages || []}
              onMessagesChange={(messages: AssistantMessage[]) => onChangeDraft({ assistantMessages: messages })}
              phaseLabel="Review · refine"
            />
          </div>
        )}

        {tab === 'sources' && (
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            <p style={{ fontSize: 12.5, color: '#6B7280', lineHeight: 1.45 }}>
              Add as many PDFs, YouTube transcripts, and pasted texts as you need. Mark them up, then refine with Hoot or generate embeds.
            </p>
            {sourceError && (
              <p style={{ fontSize: 12, color: '#B91C1C' }}>{sourceError}</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={sourceBusy}
                onClick={() => { setSourcePanel('pdf'); pdfRef.current?.click(); }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border"
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: '#374151',
                  borderColor: sourcePanel === 'pdf' ? 'rgba(77,124,90,0.35)' : 'rgba(0,0,0,0.1)',
                  background: sourcePanel === 'pdf' ? 'rgba(77,124,90,0.06)' : '#fff',
                }}
              >
                {sourceBusy && sourcePanel === 'pdf' ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                Add PDFs
              </button>
              <input
                ref={pdfRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files;
                  e.target.value = '';
                  void handlePdfs(files);
                }}
              />
              <button
                type="button"
                onClick={() => setSourcePanel((p) => (p === 'youtube' ? null : 'youtube'))}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border"
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: '#374151',
                  borderColor: sourcePanel === 'youtube' ? 'rgba(77,124,90,0.35)' : 'rgba(0,0,0,0.1)',
                  background: sourcePanel === 'youtube' ? 'rgba(77,124,90,0.06)' : '#fff',
                }}
              >
                <Youtube size={12} /> Video transcript
              </button>
              <button
                type="button"
                onClick={() => setSourcePanel((p) => (p === 'text' ? null : 'text'))}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border"
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: '#374151',
                  borderColor: sourcePanel === 'text' ? 'rgba(77,124,90,0.35)' : 'rgba(0,0,0,0.1)',
                  background: sourcePanel === 'text' ? 'rgba(77,124,90,0.06)' : '#fff',
                }}
              >
                <Type size={12} /> Paste text
              </button>
              <button
                type="button"
                disabled={!(draft.sourcePool || []).length}
                onClick={() => setMarkupOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-white disabled:opacity-40"
                style={{ fontSize: 11.5, fontWeight: 600, background: '#4d7c5a' }}
              >
                <Wand2 size={12} /> Mark up
              </button>
            </div>

            {sourcePanel === 'youtube' && (
              <div className="space-y-2 rounded-xl p-3" style={{ background: '#F7F9FB', border: '1px solid rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: 12, fontWeight: 650, color: '#0B1220' }}>YouTube transcript</p>
                <p style={{ fontSize: 11.5, color: '#6B7280' }}>
                  Fetches the transcript for markup · add multiple videos one after another
                </p>
                <div className="flex gap-1.5">
                  <input
                    value={ytUrl}
                    onChange={(e) => setYtUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=…"
                    className="flex-1 min-w-0 rounded-xl px-3 py-2"
                    style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.1)' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && ytUrl.trim() && !sourceBusy) void handleFetchYoutube();
                    }}
                  />
                  <button
                    type="button"
                    disabled={!ytUrl.trim() || sourceBusy}
                    onClick={() => void handleFetchYoutube()}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-white disabled:opacity-40 shrink-0"
                    style={{ fontSize: 12, fontWeight: 600, background: '#1e2b3d' }}
                  >
                    {sourceBusy ? <Loader2 size={12} className="animate-spin" /> : <Youtube size={13} />}
                    {sourceBusy ? 'Fetching…' : 'Add'}
                  </button>
                </div>
              </div>
            )}

            {sourcePanel === 'text' && (
              <div className="space-y-2 rounded-xl p-3" style={{ background: '#F7F9FB', border: '1px solid rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: 12, fontWeight: 650, color: '#0B1220' }}>Paste text</p>
                <p style={{ fontSize: 11.5, color: '#6B7280' }}>
                  Notes, an article, a transcript… add as many pasted sources as you want
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={4}
                  placeholder="Paste source text…"
                  className="w-full rounded-xl px-3 py-2"
                  style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)' }}
                />
                <div className="flex items-center justify-between gap-2">
                  <span style={{ fontSize: 11.5, color: '#9AA3AF' }}>
                    {pasteText.trim() ? `${pasteText.trim().split(/\s+/).length} words` : 'Ready for another paste after each add'}
                  </span>
                  <button
                    type="button"
                    disabled={!pasteText.trim()}
                    onClick={handlePasteText}
                    className="px-3 py-1.5 rounded-full text-white disabled:opacity-40"
                    style={{ fontSize: 12, fontWeight: 600, background: '#1e2b3d' }}
                  >
                    Add text source
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <p style={{ fontSize: 11.5, fontWeight: 650, color: '#9AA3AF', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Sources ({(draft.sourcePool || []).length})
              </p>
              {(draft.sourcePool || []).length === 0 ? (
                <p style={{ fontSize: 12.5, color: '#9AA3AF' }}>No sources yet — add PDFs, videos, or text above.</p>
              ) : (draft.sourcePool || []).map((s) => {
                const Icon = s.kind === 'youtube' ? Youtube : s.kind === 'text' ? Type : FileText;
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-xl"
                    style={{ background: '#F7F9FB', border: '1px solid rgba(0,0,0,0.06)' }}
                  >
                    <Icon size={13} style={{ color: '#6B7280', flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <p className="truncate" style={{ fontSize: 12.5, fontWeight: 600, color: '#0B1220' }}>{s.label}</p>
                      <p style={{ fontSize: 11, color: '#9AA3AF' }}>
                        {s.kind === 'youtube' ? 'video transcript' : s.kind}
                        {' · '}
                        {(s.sentences || []).length} passage{(s.sentences || []).length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <button type="button" onClick={() => removeSource(s.id)} className="p-1" title="Remove">
                      <X size={13} style={{ color: '#9AA3AF' }} />
                    </button>
                  </div>
                );
              })}
            </div>
            {(draft.refineHighlights || []).length > 0 && (
              <p style={{ fontSize: 11.5, color: '#4d7c5a' }}>
                {(draft.refineHighlights || []).length} marked passage{(draft.refineHighlights || []).length === 1 ? '' : 's'} for grounding
              </p>
            )}
          </div>
        )}

        {tab === 'add' && (
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
            <div>
              <p style={{ fontSize: 11.5, fontWeight: 650, color: '#9AA3AF', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
                Blocks
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => addManualPart('rich-text')} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border" style={{ fontSize: 11.5, fontWeight: 600, borderColor: 'rgba(0,0,0,0.1)' }}>
                  <Type size={12} /> Text
                </button>
                <button type="button" onClick={() => addManualPart('image')} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border" style={{ fontSize: 11.5, fontWeight: 600, borderColor: 'rgba(0,0,0,0.1)' }}>
                  <ImageIcon size={12} /> Image
                </button>
                <button type="button" onClick={() => addManualPart('video')} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border" style={{ fontSize: 11.5, fontWeight: 600, borderColor: 'rgba(0,0,0,0.1)' }}>
                  <Youtube size={12} /> Video
                </button>
                <button type="button" onClick={() => addBridgeEmbed('table')} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border" style={{ fontSize: 11.5, fontWeight: 600, borderColor: 'rgba(0,0,0,0.1)' }}>
                  <LayoutGrid size={12} /> Bridge table
                </button>
                <button type="button" onClick={() => addBridgeEmbed('bidding')} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border" style={{ fontSize: 11.5, fontWeight: 600, borderColor: 'rgba(0,0,0,0.1)' }}>
                  <ListChecks size={12} /> Bidding drill
                </button>
              </div>
            </div>

            <div>
              <p style={{ fontSize: 11.5, fontWeight: 650, color: '#9AA3AF', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
                Images
              </p>
              <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8, lineHeight: 1.4 }}>
                {sourceImages.length
                  ? 'Pulled from your website sources — drag one between blocks to drop it exactly where you want, or click to add it at the end.'
                  : 'Upload your own images, or add a website source and its images will appear here automatically.'}
              </p>
              <input
                ref={imageUploadRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  addImagesFromUpload(Array.from(e.target.files || []));
                  e.target.value = '';
                }}
              />
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => imageUploadRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed"
                  style={{ aspectRatio: '1', borderColor: 'rgba(0,0,0,0.18)', color: '#6B7280', fontSize: 11, fontWeight: 600, background: '#FAFAFA' }}
                  title="Upload images from your computer"
                >
                  <ImageIcon size={16} />
                  Upload
                </button>
                {sourceImages.map((img) => (
                  <button
                    key={img.src}
                    type="button"
                    disabled={placingImageSrc !== null}
                    // Drag to place it between blocks; click still appends.
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'copy';
                      e.dataTransfer.setData(
                        IMAGE_DRAG_MIME,
                        JSON.stringify({ src: img.src, caption: img.caption || img.alt || '' }),
                      );
                    }}
                    onClick={() => addImageFromSource(img)}
                    className="relative rounded-lg overflow-hidden border"
                    style={{ aspectRatio: '1', borderColor: 'rgba(0,0,0,0.1)', background: '#F3F4F6', cursor: placingImageSrc ? 'wait' : 'pointer' }}
                    title={`${img.caption || img.alt || 'Image'} — ${img.sourceLabel}`}
                  >
                    <img
                      src={img.src}
                      alt={img.alt || ''}
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      onError={(e) => {
                        const tile = (e.target as HTMLElement).closest('button');
                        if (tile) tile.style.display = 'none'; // hotlink-blocked → hide tile
                      }}
                    />
                    {placingImageSrc === img.src && (
                      <span className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.7)' }}>
                        <Loader2 size={16} className="animate-spin" style={{ color: '#4d7c5a' }} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p style={{ fontSize: 11.5, fontWeight: 650, color: '#9AA3AF', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
                From library
              </p>
              <button
                type="button"
                onClick={() => setLibraryOpen(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full border"
                style={{ fontSize: 12.5, fontWeight: 600, borderColor: 'rgba(0,0,0,0.1)', color: '#0B1220' }}
              >
                <FolderOpen size={14} /> Embed from Content Library
              </button>
            </div>

            <div>
              <p style={{ fontSize: 11.5, fontWeight: 650, color: '#9AA3AF', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
                Generate from scratch
              </p>
              <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8, lineHeight: 1.4 }}>
                Uses your sources + markup (Sources tab), then the same generate pipeline as the AI authoring path.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {GEN_TYPES.map((g) => (
                  <button
                    key={g.type}
                    type="button"
                    onClick={() => startGenerate(g.type)}
                    className="px-2.5 py-1.5 rounded-full border"
                    style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      borderColor: genType === g.type ? 'rgba(77,124,90,0.4)' : 'rgba(0,0,0,0.1)',
                      background: genType === g.type ? 'rgba(77,124,90,0.08)' : '#fff',
                      color: '#374151',
                    }}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {genSlot && genType && (
              <div
                className="rounded-2xl overflow-hidden"
                style={{ border: '1px solid rgba(77,124,90,0.2)', background: 'rgba(77,124,90,0.03)' }}
              >
                <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  <p style={{ fontSize: 12.5, fontWeight: 650, color: '#3d6349' }}>
                    Generate {GEN_TYPES.find((g) => g.type === genType)?.label}
                  </p>
                  <button type="button" onClick={() => { setGenSlot(null); setGenType(null); }} className="p-1">
                    <X size={14} style={{ color: '#6B7280' }} />
                  </button>
                </div>
                <div className="max-h-[420px] overflow-y-auto p-2">
                  <TutorialV3ObjectGeneratePane
                    slot={genSlot}
                    pool={draft.sourcePool || []}
                    tutorialTitle={draft.title}
                    tutorialObjective={String(draft.metadata.objective || '')}
                    onChangeSlot={(patch) => setGenSlot((s) => (s ? { ...s, ...patch } : s))}
                    onGenerated={(part) => {
                      pushUndo();
                      onChangeParts([...partsRef.current, part]);
                      onSelectPart(part.id);
                      if (genSlot.highlights?.length) {
                        onChangeDraft({ refineHighlights: genSlot.highlights });
                      }
                      setGenSlot(null);
                      setGenType(null);
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <LibraryPickerModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        library={library}
        libraryStatus={libraryStatus}
        libraryEmptyCopy="No Content Library items yet. Create content first, then embed it here."
        slotObjectType="reused-from-library"
        onConfirm={(objectId, versionId, _title) => {
          const obj = findLibraryLearningObject(objectId, (createdObjects || []) as LearningObject[]);
          if (!obj) return;
          pushUndo();
          const part = makeLibraryEmbedPart({ object: obj, versionId }) as TutorialV3Part;
          onChangeParts([...partsRef.current, part]);
          onSelectPart(part.id);
          setLibraryOpen(false);
        }}
      />

      {markupOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6"
          style={{ background: 'rgba(11,18,32,0.45)', backdropFilter: 'blur(4px)' }}
          role="presentation"
          onClick={() => setMarkupOpen(false)}
        >
          <div
            className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl bg-white"
            style={{ boxShadow: '0 28px 80px -24px rgba(15,23,42,0.45)' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Mark up sources"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#0B1220' }}>Mark up sources</p>
                <p style={{ fontSize: 12, color: '#6B7280' }}>Highlight passages for Hoot and generate</p>
              </div>
              <button
                type="button"
                onClick={() => setMarkupOpen(false)}
                className="px-3 py-1.5 rounded-full text-white"
                style={{ fontSize: 12.5, fontWeight: 600, background: '#1e2b3d' }}
              >
                Done
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              {(draft.sourcePool || []).length ? (
                <MarkupWorkspace
                  sources={markupBundle.sources as any}
                  docParas={markupBundle.docParas}
                  pages={markupBundle.pages}
                  highlights={draft.refineHighlights || []}
                  setHighlights={(h) => {
                    const next = typeof h === 'function' ? h(draft.refineHighlights || []) : h;
                    onChangeDraft({ refineHighlights: next });
                  }}
                  activeTag={activeTag}
                  setActiveTag={setActiveTag}
                  aiSuggestions={aiSuggestions}
                  setAiSuggestions={setAiSuggestions}
                  query={query}
                  setQuery={setQuery}
                  markupFlags={markupFlags}
                  setMarkupFlags={setMarkupFlags}
                />
              ) : (
                <p style={{ fontSize: 13, color: '#9AA3AF', padding: 24 }}>Add a source first.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
