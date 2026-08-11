/**
 * Post-generation assemble editor — Edit + Student preview (V1 tutorial parity).
 * Learning-object parts open their dedicated editors; Back returns here.
 * Edit mode includes a collapsible Refine with AI sidebar (Hoot + sources + embeds).
 */
import React, { useState } from 'react';
import {
  ArrowLeft, Eye, Pencil, Send, Sparkles, ChevronUp, ChevronDown, Trash2,
  ExternalLink, Save,
} from 'lucide-react';
import { pastelFromHex } from '../../../../lib/pastel';
import { movePartToPage, partPageNumbers, partsToBlocks } from '../../../../lib/tutorialV2/draftModel';
import {
  isNestedEditablePart,
  nestedEditorKindForPart,
} from '../../../../lib/tutorialV2/embedEditorBridge';
import type { TutorialV2Draft, TutorialV2Part } from '../../../../lib/tutorialV2/types';
import { LearningBlocksPreview } from '../LearnerReader';
import { TutorialV2NestedEditor } from './TutorialV2NestedEditor';
import { parseYtId } from './TutorialV2SourcePanel';
import { TutorialV2RefineSidebar } from './TutorialV2RefineSidebar';
import { BridgeEmbedBlock } from './BridgeEmbedBlock';
import { isBridgeEmbedPart } from '../../../../lib/tutorialV2/bridgeEmbed';
import { RichTextEditor } from '../../RichTextEditor';

export function TutorialV2AssembleEditor({
  draft,
  parts,
  onChangeParts,
  onChangeTitle,
  onChangeDraft,
  onBack,
  onSave,
  onSubmit,
  canSubmit,
  rail,
  onBackToPlan,
  onBackToStructure,
}: {
  draft: TutorialV2Draft;
  parts: TutorialV2Part[];
  onChangeParts: (parts: TutorialV2Part[]) => void;
  onChangeTitle: (title: string) => void;
  onChangeDraft: (patch: Partial<TutorialV2Draft>) => void;
  onBack: () => void;
  onSave: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  rail?: React.ReactNode;
  onBackToPlan?: () => void;
  onBackToStructure?: () => void;
}) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [editingPartId, setEditingPartId] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  // Collapsed by default so write-yourself stays manual-first; open anytime (or via Ask Hoot).
  const [refineOpen, setRefineOpen] = useState(false);

  const editingPart = editingPartId
    ? parts.find((p) => p.id === editingPartId) || null
    : null;

  if (editingPart) {
    return (
      <div className="min-h-full flex flex-col" style={{ background: 'linear-gradient(180deg, #F4F6FB 0%, #EEF1F8 100%)' }}>
        <TutorialV2NestedEditor
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

  const updatePart = (id: string, patch: Partial<TutorialV2Part>) => {
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

  const openRefineForPart = (partId: string) => {
    setSelectedPartId(partId);
    setRefineOpen(true);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        className="sticky top-0 z-20 flex flex-col gap-2 px-3 sm:px-5 py-3 border-b"
        style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', borderColor: 'rgba(0,0,0,0.06)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-sm font-medium"
            style={{ color: '#6B7280' }}
          >
            <ArrowLeft size={14} /> Back to outline
          </button>
          <button
            type="button"
            disabled={!parts.length}
            onClick={onSubmit}
            title={!canSubmit ? 'Some required items are still incomplete — you can still submit a draft for review.' : undefined}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-white disabled:opacity-40"
            style={{ fontSize: 12.5, fontWeight: 650, background: '#0B0F1A' }}
          >
            <Send size={13} /> Submit
          </button>
        </div>
        {rail}
        {(onBackToPlan || onBackToStructure) && (
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
                background: mode === 'edit' ? '#0B0F1A' : 'transparent',
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
                background: mode === 'preview' ? '#0B0F1A' : 'transparent',
                color: mode === 'preview' ? '#fff' : '#6B7280',
              }}
            >
              <Eye size={12} /> Student preview
            </button>
          </div>
          <span style={{ fontSize: 12, color: '#9AA3AF' }}>
            {parts.length} part{parts.length === 1 ? '' : 's'}
          </span>
          {mode === 'edit' && (
            <button
              type="button"
              onClick={() => setRefineOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border ml-auto"
              style={{
                fontSize: 12,
                fontWeight: 650,
                color: refineOpen ? '#4C1D95' : '#374151',
                borderColor: refineOpen ? 'rgba(109,40,217,0.35)' : 'rgba(0,0,0,0.1)',
                background: refineOpen ? 'rgba(109,40,217,0.08)' : '#fff',
              }}
            >
              <Sparkles size={13} />
              {refineOpen ? 'Hide AI refine' : 'Refine with AI'}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 overflow-y-auto p-3 sm:p-5">
          <div className="max-w-2xl w-full mx-auto">
            {mode === 'preview' ? (
              <>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0B1220', marginBottom: 10 }}>
                  {draft.title || 'Untitled tutorial'}
                </h1>
                <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 22, lineHeight: 1.5 }}>
                  Student preview · how learners will see this tutorial · {parts.length} part{parts.length !== 1 ? 's' : ''}
                </p>
                {!parts.length ? (
                  <p style={{ fontSize: 13.5, color: '#B45309' }}>
                    Nothing to preview yet — generate or write the recipe content first.
                  </p>
                ) : (
                  <LearningBlocksPreview
                    blocks={blocks as any}
                    objectId={draft.id}
                    paginate
                  />
                )}
              </>
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
                      {pageStartsHere && (
                        <div className="flex items-center gap-2 pt-1" aria-label={`Student page ${partPages[i]}`}>
                          <span
                            className="px-2.5 py-0.5 rounded-full shrink-0"
                            style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', background: '#EEF2FF', color: '#4338CA' }}
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
                          border: selected ? '1.5px solid rgba(109,40,217,0.45)' : '1px solid rgba(0,0,0,0.06)',
                          boxShadow: selected ? '0 0 0 3px rgba(109,40,217,0.08)' : undefined,
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
                              style={{ fontSize: 11, fontWeight: 650, color: '#4338CA', border: '1px solid rgba(67,56,202,0.25)', background: '#F5F3FF', outline: 'none' }}
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
                          <BridgeEmbedBlock
                            kind={p.embedKind}
                            seed={p.embedSeed ?? 7}
                            skin={p.embedSkin}
                            caption={p.caption}
                            onChangeCaption={(caption) => updatePart(p.id, { caption })}
                          />
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
                              style={{ fontSize: 12.5, fontWeight: 650, background: '#0B0F1A' }}
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
                                        style={{ fontSize: 12, color: '#6D28D9', borderColor: 'rgba(109,40,217,0.25)', background: '#fff' }}
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
                </div>
              </>
            )}
          </div>
        </div>

        {mode === 'edit' && (
          <TutorialV2RefineSidebar
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
          color: '#065F46',
          background: pastelFromHex('#059669', 0.82),
          border: '1px solid rgba(5,150,105,0.3)',
          boxShadow: '0 10px 28px -12px rgba(5,150,105,0.55)',
        }}
      >
        <Save size={15} /> Save
      </button>
    </div>
  );
}
