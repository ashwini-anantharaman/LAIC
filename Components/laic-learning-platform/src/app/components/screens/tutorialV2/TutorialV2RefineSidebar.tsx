/**
 * Collapsible “Refine with AI” sidebar for Tutorial V2 Review (edit mode).
 * Shared by write-yourself and template pipelines.
 * Hoot (same chat + image attach as V1) + sources/markup + library / generate embeds.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Database, FileText, FolderOpen, Loader2,
  Plus, Sparkles, Type, Image as ImageIcon, Youtube, X, Wand2, LayoutGrid,
} from 'lucide-react';
import { AssistantPanel } from '../AssistantPanel';
import { MarkupWorkspace } from '../MarkupWorkspace';
import { LibraryPickerModal } from '../../LibraryPickerModal';
import {
  applyEditActionsToParts,
  buildAssistantContext,
  snapshotParts,
  type TutorialEditorPart,
} from '../../../../lib/assistant';
import {
  pipelineDraftFromV2,
  sourcePoolToMarkupSources,
} from '../../../../lib/tutorialV2/draftModel';
import { findLibraryLearningObject, makeLibraryEmbedPart } from '../../../../lib/libraryEmbed';
import {
  listEmbeddableLibraryObjects,
  type LibraryObjectChoice,
} from '../../../../lib/tutorialV2/tutorialTemplates';
import { parsePdf, docFromText } from '../../../../lib/pdf';
import { makeBridgeEmbedPart } from '../../../../lib/tutorialV2/bridgeEmbed';
import { errorMessage, ingestYoutube } from '../../../../lib/api';
import { useApp } from '../../../App';
import type { TutorialV2Draft, TutorialV2Part, V2SourceRef, V2TopLevelSlot } from '../../../../lib/tutorialV2/types';
import type { AssistantMessage, EditAction, LearningObject, ObjectSelection, ObjectType } from '../../../../lib/types';
import { parseYtId } from './TutorialV2SourcePanel';
import { TutorialV2ObjectGeneratePane } from './TutorialV2ObjectGeneratePane';

type Tab = 'hoot' | 'sources' | 'add';

const GEN_TYPES: { type: ObjectType; label: string }[] = [
  { type: 'flashcard-set', label: 'Flashcards' },
  { type: 'quiz', label: 'Quiz' },
  { type: 'concept-card', label: 'Concept card' },
  { type: 'summary', label: 'Summary' },
  { type: 'reflection', label: 'Reflection' },
  { type: 'assignment', label: 'Assignment' },
  { type: 'drill', label: 'Drill' },
];

export function TutorialV2RefineSidebar({
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
  draft: TutorialV2Draft;
  parts: TutorialV2Part[];
  onChangeParts: (parts: TutorialV2Part[]) => void;
  onChangeDraft: (patch: Partial<TutorialV2Draft>) => void;
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
  const [genType, setGenType] = useState<ObjectType | null>(null);
  const [genSlot, setGenSlot] = useState<V2TopLevelSlot | null>(null);
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
    () => pipelineDraftFromV2(draft),
    [draft],
  );

  const assistantContext = useMemo(() => buildAssistantContext({
    objectId: draft.id,
    objectType: 'tutorial-v2',
    title: draft.title || 'Untitled tutorial',
    status: draft.status === 'submitted' ? 'in-review' : 'draft',
    scope: 'bridge',
    objective: String(draft.metadata.objective || ''),
    fv: pipelineDraft.fv,
    parts: parts as TutorialEditorPart[],
    pipelineDraft,
    selection,
  }), [draft, parts, pipelineDraft, selection]);

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
    const result = applyEditActionsToParts(partsRef.current as TutorialEditorPart[], actions, {
      title: draft.title,
      objective: String(draft.metadata.objective || ''),
      fv: pipelineDraft.fv,
    });
    onChangeParts(result.parts as TutorialV2Part[]);
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
      onChangeParts(prev.parts as TutorialV2Part[]);
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
      onChangeParts(next.parts as TutorialV2Part[]);
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

  const addSource = (src: V2SourceRef) => {
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
    const added: V2SourceRef[] = [];
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

  /** A Bridge Platform component, dormant until a reader opens it. */
  const addBridgeEmbed = () => {
    pushUndo();
    const id = `p-refine-${Date.now().toString(36)}`;
    onChangeParts([...parts, makeBridgeEmbedPart('table', id)]);
    onSelectPart(id);
  };

  const addManualPart = (kind: 'rich-text' | 'image' | 'video') => {
    pushUndo();
    const id = `p-refine-${Date.now().toString(36)}`;
    const part: TutorialV2Part = kind === 'rich-text'
      ? { id, type: 'rich-text', label: 'Text', heading: '', body: '' }
      : kind === 'image'
        ? { id, type: 'image', label: 'Media · image', url: '', caption: '', mediaKind: 'image' }
        : { id, type: 'video', label: 'Media · YouTube', url: '', videoId: '', caption: '', mediaKind: 'video' };
    onChangeParts([...parts, part]);
    onSelectPart(id);
  };

  const startGenerate = (type: ObjectType) => {
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
        <Sparkles size={16} style={{ color: '#6D28D9' }} />
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
      className="shrink-0 flex flex-col border-l min-h-0"
      style={{
        width: 'min(400px, 42vw)',
        background: '#fff',
        borderColor: 'rgba(0,0,0,0.08)',
        boxShadow: '-8px 0 24px -16px rgba(30,50,80,0.18)',
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2.5 shrink-0"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'rgba(109,40,217,0.04)' }}
      >
        <Sparkles size={15} style={{ color: '#6D28D9' }} />
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
              background: tab === t.id ? '#0B0F1A' : 'transparent',
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
                  borderColor: sourcePanel === 'pdf' ? 'rgba(109,40,217,0.35)' : 'rgba(0,0,0,0.1)',
                  background: sourcePanel === 'pdf' ? 'rgba(109,40,217,0.06)' : '#fff',
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
                  borderColor: sourcePanel === 'youtube' ? 'rgba(109,40,217,0.35)' : 'rgba(0,0,0,0.1)',
                  background: sourcePanel === 'youtube' ? 'rgba(109,40,217,0.06)' : '#fff',
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
                  borderColor: sourcePanel === 'text' ? 'rgba(109,40,217,0.35)' : 'rgba(0,0,0,0.1)',
                  background: sourcePanel === 'text' ? 'rgba(109,40,217,0.06)' : '#fff',
                }}
              >
                <Type size={12} /> Paste text
              </button>
              <button
                type="button"
                disabled={!(draft.sourcePool || []).length}
                onClick={() => setMarkupOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-white disabled:opacity-40"
                style={{ fontSize: 11.5, fontWeight: 600, background: '#6D28D9' }}
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
                    style={{ fontSize: 12, fontWeight: 600, background: '#0B0F1A' }}
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
                    style={{ fontSize: 12, fontWeight: 600, background: '#0B0F1A' }}
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
              <p style={{ fontSize: 11.5, color: '#059669' }}>
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
                <button type="button" onClick={addBridgeEmbed} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border" style={{ fontSize: 11.5, fontWeight: 600, borderColor: 'rgba(0,0,0,0.1)' }}>
                  <LayoutGrid size={12} /> Bridge table
                </button>
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
                      borderColor: genType === g.type ? 'rgba(109,40,217,0.4)' : 'rgba(0,0,0,0.1)',
                      background: genType === g.type ? 'rgba(109,40,217,0.08)' : '#fff',
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
                style={{ border: '1px solid rgba(109,40,217,0.2)', background: 'rgba(109,40,217,0.03)' }}
              >
                <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  <p style={{ fontSize: 12.5, fontWeight: 650, color: '#4C1D95' }}>
                    Generate {GEN_TYPES.find((g) => g.type === genType)?.label}
                  </p>
                  <button type="button" onClick={() => { setGenSlot(null); setGenType(null); }} className="p-1">
                    <X size={14} style={{ color: '#6B7280' }} />
                  </button>
                </div>
                <div className="max-h-[420px] overflow-y-auto p-2">
                  <TutorialV2ObjectGeneratePane
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
          const part = makeLibraryEmbedPart({ object: obj, versionId }) as TutorialV2Part;
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
                style={{ fontSize: 12.5, fontWeight: 600, background: '#0B0F1A' }}
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
