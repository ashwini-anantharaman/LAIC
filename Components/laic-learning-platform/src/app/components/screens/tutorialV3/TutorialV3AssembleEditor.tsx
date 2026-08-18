/**
 * Post-generation assemble editor — Edit + Student preview (V1 tutorial parity).
 * Learning-object parts open their dedicated editors; Back returns here.
 * Edit mode includes a collapsible Refine with AI sidebar (Hoot + sources + embeds).
 */
import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Eye, Pencil, Send, Sparkles, ChevronUp, ChevronDown, Trash2,
  ExternalLink, Save, Maximize2, Minimize2, Move,
} from 'lucide-react';
import { pastelFromHex } from '../../../../lib/pastel';
import { movePartToPage, partPageNumbers, partsToBlocks } from '../../../../lib/tutorialV3/draftModel';
import {
  applyV3BlockContent,
  emptyV3BlockContent,
  extractV3BlockContent,
  isNestedEditablePart,
  nestedEditorKindForPart,
  v3BlockTypeOf,
} from '../../../../lib/tutorialV3/embedEditorBridge';
import { TutorialV3BlockEditor, hasV3BlockEditor } from './TutorialV3BlockEditors';
import type { TutorialV3Draft, TutorialV3Part } from '../../../../lib/tutorialV3/types';
import { LearningBlocksPreview } from '../LearnerReader';
import { TutorialV3Reader } from './learner/TutorialV3Reader';
import { TutorialV3NestedEditor } from './TutorialV3NestedEditor';
import { parseYtId } from './TutorialV3SourcePanel';
import { TutorialV3RefineSidebar } from './TutorialV3RefineSidebar';
import { BridgeEmbedBlock } from './BridgeEmbedBlock';
import {
  configToPartFields,
  isBridgeEmbedPart,
  readBridgeConfig,
} from '../../../../lib/tutorialV3/bridgeEmbed';
import { RichTextEditor } from '../../RichTextEditor';
import { SubmitVersionMenu, type SubmitTarget } from '../SubmitVersionMenu';
import { readDraggedImage } from '../../../../lib/tutorialV3/imageDrag';
import { fetchWebImage } from '../../../../lib/api';
import type { Version } from '../../../../lib/types';

/**
 * The gap between two blocks, as a drop target.
 *
 * Collapsed to a thin strip until an image is dragged over it — a permanently
 * visible gap between every block would be noise for the far more common case
 * of just reading the outline.
 */
function ImageDropZone({
  index,
  activeIndex,
  onOver,
  onDrop,
}: {
  index: number;
  activeIndex: number | null;
  onOver: (index: number | null) => void;
  onDrop: (index: number, img: { src: string; caption?: string }) => void;
}) {
  const active = activeIndex === index;
  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('application/x-laic-image')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        onOver(index);
      }}
      onDragLeave={() => onOver(null)}
      onDrop={(e) => {
        const img = readDraggedImage(e.dataTransfer);
        onOver(null);
        if (!img) return;
        e.preventDefault();
        void onDrop(index, img);
      }}
      className="flex items-center justify-center transition-all"
      style={{
        height: active ? 44 : 10,
        margin: active ? '2px 0' : '-4px 0',
        borderRadius: 12,
        border: active ? '2px dashed rgba(77,124,90,0.55)' : '2px dashed transparent',
        background: active ? 'rgba(77,124,90,0.06)' : 'transparent',
      }}
      aria-hidden={!active}
    >
      {active && (
        <span style={{ fontSize: 11.5, fontWeight: 650, color: '#4d7c5a' }}>
          Drop image here
        </span>
      )}
    </div>
  );
}

export function TutorialV3AssembleEditor({
  draft,
  parts,
  onChangeParts,
  onChangeTitle,
  onChangeDraft,
  onBack,
  onSave,
  onSubmit,
  canSubmit,
  submitVersions = [],
  rail,
  onBackToPlan,
  onBackToStructure,
}: {
  draft: TutorialV3Draft;
  parts: TutorialV3Part[];
  onChangeParts: (parts: TutorialV3Part[]) => void;
  onChangeTitle: (title: string) => void;
  onChangeDraft: (patch: Partial<TutorialV3Draft>) => void;
  onBack: () => void;
  onSave: () => void;
  onSubmit: (target: SubmitTarget) => void;
  canSubmit: boolean;
  /** Existing versions of this object, so the author can overwrite one. */
  submitVersions?: Version[];
  rail?: React.ReactNode;
  onBackToPlan?: () => void;
  onBackToStructure?: () => void;
}) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [editingPartId, setEditingPartId] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  // Collapsed by default so write-yourself stays manual-first; open anytime (or via Ask Hoot).
  const [refineOpen, setRefineOpen] = useState(false);
  /** Gap the dragged image would land in, or null when nothing is over us. */
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const editingPart = editingPartId
    ? parts.find((p) => p.id === editingPartId) || null
    : null;

  if (editingPart) {
    return (
      <div className="min-h-full flex flex-col" style={{ background: 'linear-gradient(180deg, #F4F6FB 0%, #EEF1F8 100%)' }}>
        <TutorialV3NestedEditor
          part={editingPart}
          initialMode="preview"
          onBack={() => setEditingPartId(null)}
          onDone={() => {
            setEditingPartId(null);
            onBack();
          }}
          onApply={(patch) => {
            onChangeParts(parts.map((p) => (p.id === editingPart.id ? { ...p, ...patch } : p)));
          }}
        />
      </div>
    );
  }

  const fv = {
    passOn: true,
    pass: draft.structure.pass || '70%',
    hintsOn: draft.structure.hintsOn,
    hintN: draft.structure.hintN,
  };
  const blocks = partsToBlocks(parts, fv);
  const partPages = partPageNumbers(parts);
  const pageCount = partPages.length ? partPages[partPages.length - 1] : 1;
  const setPartPage = (partId: string, page: number) => {
    // One atomic draft patch — parts AND the manual-pages flag together, so
    // the structure-level re-stamp can never clobber the new break flags.
    onChangeDraft({
      assembledParts: movePartToPage(parts, partId, page),
      manualPageBreaks: true,
    });
  };

  const updatePart = (id: string, patch: Partial<TutorialV3Part>) => {
    onChangeParts(parts.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const movePart = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= parts.length) return;
    const next = [...parts];
    [next[index], next[j]] = [next[j], next[index]];
    onChangeParts(next);
  };

  const removePart = (id: string) => {
    onChangeParts(parts.filter((p) => p.id !== id));
    if (selectedPartId === id) setSelectedPartId(null);
  };

  /**
   * Drop an image from the Refine sidebar between two blocks.
   *
   * Placement is the whole point: clicking appends, dragging says exactly
   * where. The image is inlined server-side first (same as the click path) so
   * the tutorial keeps working if the source site removes it later; a failed
   * fetch falls back to the remote URL rather than losing the drop.
   */
  const dropImageAt = async (index: number, img: { src: string; caption?: string }) => {
    let url = img.src;
    if (!url.startsWith('data:')) {
      try {
        const out = await fetchWebImage(url);
        if (out.dataUri) url = out.dataUri;
      } catch { /* hotlink fallback */ }
    }
    const id = `p-drop-${Date.now().toString(36)}`;
    const part: TutorialV3Part = {
      id, type: 'image', label: 'Media · image', url, caption: img.caption || '', mediaKind: 'image',
    };
    const next = [...parts];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, part);
    onChangeParts(next);
    setSelectedPartId(id);
  };

  /**
   * Full screen hands the whole viewport to whichever mode is open. Editing a
   * long tutorial or reading it as a student both want the height, and the
   * authoring chrome above is not what you are looking at while you do either.
   */
  const [fullscreen, setFullscreen] = useState(false);
  const [arranging, setArranging] = useState(false);

  /*
    Blocks are what a learner sees; parts are what the draft stores, and one
    part can expand into several blocks (`partId__0`, `partId__1`). Dragging a
    block therefore moves the whole part it came from — moving half an embedded
    quiz somewhere else is not a thing an author can mean.
  */
  const reorderFromBlockIds = (orderedBlockIds: string[]) => {
    const partIdOf = (blockId: string) => blockId.split('__')[0];
    const seen = new Set<string>();
    const order: string[] = [];
    for (const id of orderedBlockIds) {
      const pid = partIdOf(id);
      if (!seen.has(pid)) { seen.add(pid); order.push(pid); }
    }
    const byId = new Map(parts.map((p) => [p.id, p]));
    const next = order.map((id) => byId.get(id)).filter(Boolean) as typeof parts;
    // Parts with no block of their own (the covers) keep their place at the end.
    for (const p of parts) if (!seen.has(p.id)) next.push(p);
    if (next.length !== parts.length) return;
    onChangeParts(next);
  };

  // Escape is what people try first, so it should work.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const openRefineForPart = (partId: string) => {
    setSelectedPartId(partId);
    setRefineOpen(true);
  };

  return (
    <div
      className={fullscreen ? 'fixed inset-0 z-[70] flex flex-col min-h-0' : 'flex flex-col h-full min-h-0'}
      style={fullscreen ? { background: '#fff' } : undefined}
    >
      <div
        className="sticky top-0 z-20 flex flex-col gap-2 px-3 sm:px-5 py-3 border-b"
        style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', borderColor: 'rgba(0,0,0,0.06)' }}
      >
        <div className="flex items-center justify-between gap-2">
          {fullscreen ? (
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border"
              style={{ fontSize: 13, fontWeight: 650, color: '#44403c', borderColor: 'rgba(0,0,0,0.12)', background: '#fff' }}
            >
              <Minimize2 size={14} /> Exit full screen
            </button>
          ) : (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 text-sm font-medium"
              style={{ color: '#6B7280' }}
            >
              <ArrowLeft size={14} /> Back to outline
            </button>
          )}
          <SubmitVersionMenu
            versions={submitVersions}
            canSubmit={parts.length > 0}
            onSubmit={onSubmit}
            disabledTitle={!canSubmit ? 'Some required items are still incomplete — you can still submit a draft for review.' : undefined}
          />
        </div>
        {!fullscreen && rail}
        {!fullscreen && (onBackToPlan || onBackToStructure) && (
          <div className="flex flex-wrap gap-2">
            {onBackToPlan && (
              <button
                type="button"
                onClick={onBackToPlan}
                className="px-3 py-1.5 rounded-full border"
                style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
              >
                ← Plan
              </button>
            )}
            {onBackToStructure && (
              <button
                type="button"
                onClick={onBackToStructure}
                className="px-3 py-1.5 rounded-full border"
                style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
              >
                ← Structure
              </button>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border p-0.5" style={{ borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
            <button
              type="button"
              onClick={() => setMode('edit')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full"
              style={{
                fontSize: 12,
                fontWeight: 600,
                background: mode === 'edit' ? '#1e2b3d' : 'transparent',
                color: mode === 'edit' ? '#fff' : '#6B7280',
              }}
            >
              <Pencil size={12} /> Edit
            </button>
            <button
              type="button"
              onClick={() => setMode('preview')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full"
              style={{
                fontSize: 12,
                fontWeight: 600,
                background: mode === 'preview' ? '#1e2b3d' : 'transparent',
                color: mode === 'preview' ? '#fff' : '#6B7280',
              }}
            >
              <Eye size={12} /> Student preview
            </button>
          </div>
          <span style={{ fontSize: 12, color: '#9AA3AF' }}>
            {parts.length} part{parts.length === 1 ? '' : 's'}
          </span>
          {!fullscreen && (
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              title={mode === 'preview' ? 'Full screen student preview' : 'Full screen editing'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border"
              style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
            >
              <Maximize2 size={12} /> Full screen
            </button>
          )}
          {mode === 'preview' && (
            <button
              type="button"
              onClick={() => setArranging((v) => !v)}
              title="Drag blocks to reorder them in the view a student sees"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border"
              style={{
                fontSize: 12,
                fontWeight: 650,
                color: arranging ? '#3d6349' : '#374151',
                borderColor: arranging ? 'rgba(77,124,90,0.35)' : 'rgba(0,0,0,0.1)',
                background: arranging ? 'rgba(77,124,90,0.08)' : '#fff',
              }}
            >
              <Move size={12} />
              {arranging ? 'Done arranging' : 'Arrange blocks'}
            </button>
          )}
          {(
            <button
              type="button"
              onClick={() => setRefineOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border ml-auto"
              style={{
                fontSize: 12,
                fontWeight: 650,
                color: refineOpen ? '#3d6349' : '#374151',
                borderColor: refineOpen ? 'rgba(77,124,90,0.35)' : 'rgba(0,0,0,0.1)',
                background: refineOpen ? 'rgba(77,124,90,0.08)' : '#fff',
              }}
            >
              <Sparkles size={13} />
              {refineOpen ? 'Hide AI refine' : 'Refine with AI'}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* The student preview is the post-generation view: the V3 reader, with
            its section sidebar, rather than a bare column of blocks. It runs
            full-bleed because the sidebar is part of the layout, not content. */}
        {mode === 'preview' && parts.length > 0 ? (
          // overflow-hidden, not auto: the reader scrolls its own reading
          // column, and a second scrollbar around it moved the rail too.
          <div className="flex-1 min-w-0 overflow-hidden" style={{ background: '#fff' }}>
            <TutorialV3Reader
              arrange={arranging ? { onReorder: reorderFromBlockIds } : undefined}
              draft={draft}
              blocks={blocks as any}
              objectId={draft.id}
              cumulativePassMark={parseInt(String(fv.pass).replace('%', ''), 10) || 70}
              passRequired
              hintsEnabled={draft.structure.hintsOn !== false}
              maxHints={typeof draft.structure.hintN === 'number' ? draft.structure.hintN : 4}
            />
          </div>
        ) : (
        <div className="flex-1 min-w-0 overflow-y-auto p-3 sm:p-5">
          <div className="max-w-2xl w-full mx-auto">
            {mode === 'preview' ? (
              <p style={{ fontSize: 13.5, color: '#B45309' }}>
                Nothing to preview yet — generate or write the recipe content first.
              </p>
            ) : (
              <>
                <input
                  value={draft.title}
                  onChange={(e) => onChangeTitle(e.target.value)}
                  className="w-full mb-4 bg-transparent border-b border-transparent focus:border-gray-200 outline-none"
                  style={{ fontSize: 22, fontWeight: 700, color: '#0B1220' }}
                  placeholder="Tutorial title"
                />
                {draft.metadata.objective ? (
                  <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 14, lineHeight: 1.45 }}>
                    {String(draft.metadata.objective)}
                  </p>
                ) : null}
                <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 12 }}>
                  {parts.length} parts. Select a block and use <strong>Refine with AI</strong> when you want Hoot, sources, or embeds — or keep editing by hand.
                </p>
                {!parts.length && (
                  <p style={{ fontSize: 13.5, color: '#B45309' }}>
                    No parts yet — go back and write each section, or add content from the Refine sidebar.
                  </p>
                )}
                <div className="space-y-3">
                  {parts.map((p, i) => {
                    const selected = selectedPartId === p.id;
                    const pageStartsHere = i === 0 || partPages[i] !== partPages[i - 1];
                    return (
                      <React.Fragment key={p.id}>
                      <ImageDropZone index={i} activeIndex={dropIndex} onOver={setDropIndex} onDrop={dropImageAt} />
                      {pageStartsHere && (
                        <div className="flex items-center gap-2 pt-1" aria-label={`Student page ${partPages[i]}`}>
                          <span
                            className="px-2.5 py-0.5 rounded-full shrink-0"
                            style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', background: '#e9f0ea', color: '#3d6349' }}
                          >
                            STUDENT PAGE {partPages[i]}
                          </span>
                          <div className="flex-1" style={{ height: 1, background: 'rgba(67,56,202,0.18)' }} />
                        </div>
                      )}
                      <div
                        className="rounded-2xl p-4"
                        style={{
                          background: 'white',
                          border: selected ? '1.5px solid rgba(77,124,90,0.45)' : '1px solid rgba(0,0,0,0.06)',
                          boxShadow: selected ? '0 0 0 3px rgba(77,124,90,0.08)' : undefined,
                        }}
                        onClick={() => setSelectedPartId(p.id)}
                        role="presentation"
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span style={{ fontSize: 12, fontWeight: 650, color: '#6B7280', textTransform: 'capitalize' }}>
                            {p.label || p.type || `Part ${i + 1}`}
                          </span>
                          <div className="flex items-center gap-1">
                            <select
                              value={partPages[i]}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => { e.stopPropagation(); setPartPage(p.id, Number(e.target.value)); }}
                              className="rounded-lg px-1.5 py-0.5 mr-1"
                              style={{ fontSize: 11, fontWeight: 650, color: '#3d6349', border: '1px solid rgba(67,56,202,0.25)', background: '#F5F3FF', outline: 'none' }}
                              title="Student page this block appears on"
                            >
                              {Array.from({ length: pageCount }, (_, k) => (
                                <option key={k + 1} value={k + 1}>Page {k + 1}</option>
                              ))}
                              <option value={pageCount + 1}>New page {pageCount + 1}</option>
                            </select>
                            <button type="button" onClick={(e) => { e.stopPropagation(); movePart(i, -1); }} disabled={i === 0} className="p-1 rounded" style={{ color: i === 0 ? '#E5E7EB' : '#6B7280' }}>
                              <ChevronUp size={14} />
                            </button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); movePart(i, 1); }} disabled={i === parts.length - 1} className="p-1 rounded" style={{ color: i === parts.length - 1 ? '#E5E7EB' : '#6B7280' }}>
                              <ChevronDown size={14} />
                            </button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); removePart(p.id); }} className="p-1 rounded ml-0.5" style={{ color: '#9CA3AF' }} title="Remove">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {isBridgeEmbedPart(p) ? (
                          <div onClick={(e) => e.stopPropagation()} role="presentation">
                            <BridgeEmbedBlock
                              config={readBridgeConfig(p)}
                              caption={p.caption}
                              onChangeCaption={(caption) => updatePart(p.id, { caption })}
                              onChangeConfig={(next) => updatePart(p.id, configToPartFields(next))}
                            />
                          </div>
                        ) : hasV3BlockEditor(v3BlockTypeOf(p)) ? (
                          /*
                            These blocks have a shape, so they get a real editor
                            rather than the body textarea every other part falls
                            back to — which for a table or a question showed
                            nothing worth editing.
                          */
                          <div onClick={(e) => e.stopPropagation()} role="presentation">
                            <TutorialV3BlockEditor
                              type={v3BlockTypeOf(p)!}
                              content={extractV3BlockContent(p) || emptyV3BlockContent(v3BlockTypeOf(p)!, p.libraryTitle)}
                              onChange={(next) => updatePart(p.id, applyV3BlockContent(p, next))}
                            />
                          </div>
                        ) : isNestedEditablePart(p) ? (
                          <div>
                            <p style={{ fontSize: 13.5, color: '#374151', marginBottom: 8 }}>
                              {p.type === 'library-embed'
                                ? (p.libraryTitle || p.label || p.objectType)
                                : (p.label || nestedEditorKindForPart(p) || p.type)}
                              {p.type === 'library-embed' && p.objectType ? (
                                <span style={{ color: '#9AA3AF' }}> · {p.objectType}</span>
                              ) : null}
                              {Array.isArray(p.snapshotBlocks) && p.snapshotBlocks.length > 0 ? (
                                <span style={{ color: '#9AA3AF' }}>
                                  {' '}· {p.snapshotBlocks.length} block{p.snapshotBlocks.length === 1 ? '' : 's'}
                                </span>
                              ) : null}
                              {p.type === 'section-quiz' && Array.isArray(p.questions) ? (
                                <span style={{ color: '#9AA3AF' }}> · {p.questions.length} question(s)</span>
                              ) : null}
                            </p>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setEditingPartId(p.id); }}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-white"
                              style={{ fontSize: 12.5, fontWeight: 650, background: '#1e2b3d' }}
                            >
                              <ExternalLink size={13} />
                              Open {nestedEditorKindForPart(p)?.replace(/-/g, ' ') || 'content'} editor
                            </button>
                          </div>
                        ) : (
                          <>
                            {p.heading !== undefined && (
                              <input
                                className="w-full mb-2"
                                value={p.heading || ''}
                                placeholder="Heading"
                                onChange={(e) => updatePart(p.id, { heading: e.target.value })}
                                onClick={(e) => e.stopPropagation()}
                                style={{ fontSize: 14, fontWeight: 650, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 10px' }}
                              />
                            )}
                            {(p.type === 'image' || p.mediaKind === 'image') ? (
                              <div className="space-y-2" onClick={(e) => e.stopPropagation()} role="presentation">
                                {p.url ? (
                                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
                                    <img src={p.url} alt={p.caption || ''} style={{ width: '100%', display: 'block' }} />
                                  </div>
                                ) : null}
                                <input
                                  className="w-full"
                                  value={typeof p.url === 'string' && p.url.startsWith('data:') ? '' : (p.url || '')}
                                  placeholder={typeof p.url === 'string' && p.url.startsWith('data:') ? 'Uploaded image' : 'Image URL'}
                                  disabled={typeof p.url === 'string' && p.url.startsWith('data:')}
                                  onChange={(e) => updatePart(p.id, { url: e.target.value })}
                                  style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 10px' }}
                                />
                                <input
                                  className="w-full"
                                  value={p.caption || ''}
                                  placeholder="Caption"
                                  onChange={(e) => updatePart(p.id, { caption: e.target.value })}
                                  style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 10px' }}
                                />
                              </div>
                            ) : (p.type === 'video' || p.mediaKind === 'video') ? (
                              <div className="space-y-2" onClick={(e) => e.stopPropagation()} role="presentation">
                                {parseYtId(p.url || '') ? (
                                  <div
                                    className="rounded-xl overflow-hidden"
                                    style={{ position: 'relative', width: '100%', paddingTop: '56.25%', background: '#000' }}
                                  >
                                    <img
                                      src={`https://i.ytimg.com/vi/${parseYtId(p.url || '')}/hqdefault.jpg`}
                                      alt=""
                                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9 }}
                                    />
                                  </div>
                                ) : null}
                                <input
                                  className="w-full"
                                  value={p.url || ''}
                                  placeholder="YouTube URL"
                                  onChange={(e) => updatePart(p.id, { url: e.target.value })}
                                  style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 10px' }}
                                />
                                <input
                                  className="w-full"
                                  value={p.caption || ''}
                                  placeholder="Caption"
                                  onChange={(e) => updatePart(p.id, { caption: e.target.value })}
                                  style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 10px' }}
                                />
                              </div>
                            ) : (
                              <div onClick={(e) => e.stopPropagation()} role="presentation">
                                {(p.type === 'rich-text' || !p.type || p.type === 'explanation') ? (
                                  <RichTextEditor
                                    value={p.body || p.plain || ''}
                                    onChange={(next) => updatePart(p.id, { body: next, plain: next })}
                                    placeholder="Edit this block…"
                                    minHeight={140}
                                    trailingActions={
                                      <button
                                        type="button"
                                        onClick={() => openRefineForPart(p.id)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border"
                                        style={{ fontSize: 12, color: '#4d7c5a', borderColor: 'rgba(77,124,90,0.25)', background: '#fff' }}
                                      >
                                        <Sparkles size={11} /> Ask AI
                                      </button>
                                    }
                                  />
                                ) : (
                                  <textarea
                                    className="w-full resize-y"
                                    rows={5}
                                    value={p.body || p.plain || ''}
                                    placeholder="Edit this block…"
                                    onChange={(e) => updatePart(p.id, { body: e.target.value, plain: e.target.value })}
                                    style={{ fontSize: 13.5, lineHeight: 1.55, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: 10 }}
                                  />
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      </React.Fragment>
                    );
                  })}
                  {/* Trailing zone so an image can be dropped after the last block. */}
                  <ImageDropZone index={parts.length} activeIndex={dropIndex} onOver={setDropIndex} onDrop={dropImageAt} />
                </div>
              </>
            )}
          </div>
        </div>
        )}

        {/*
          Reading as a student is when an author notices the thing they want to
          ask Hoot about. Gating the panel on edit mode meant the button was
          there in preview and pressing it did nothing visible.
        */}
        {(
          <TutorialV3RefineSidebar
            open={refineOpen}
            onOpenChange={setRefineOpen}
            draft={draft}
            parts={parts}
            onChangeParts={onChangeParts}
            onChangeDraft={onChangeDraft}
            selectedPartId={selectedPartId}
            onSelectPart={setSelectedPartId}
          />
        )}
      </div>
      <button
        type="button"
        onClick={onSave}
        className="fixed bottom-5 left-5 z-40 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full"
        style={{
          fontSize: 13.5,
          fontWeight: 650,
          color: '#2f4e39',
          background: pastelFromHex('#4d7c5a', 0.82),
          border: '1px solid rgba(77,124,90,0.3)',
          boxShadow: '0 10px 28px -12px rgba(77,124,90,0.55)',
        }}
      >
        <Save size={15} /> Save
      </button>
    </div>
  );
}
