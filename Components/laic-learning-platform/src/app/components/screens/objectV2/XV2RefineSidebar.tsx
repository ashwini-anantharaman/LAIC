/**
 * Review-stage "Refine with AI" sidebar — same three tabs as Tutorial V2
 * (Hoot · Sources · Add), adapted to structured objects. Embedding other
 * library objects / Bridge tables is intentionally absent: those don't make
 * sense inside a quiz, flashcard set, concept card, or video script.
 */
import React, { useMemo, useRef, useState } from 'react';
import { ChevronRight, ClipboardPaste, FileUp, Highlighter, Loader2, Plus, Sparkles, X, Youtube } from 'lucide-react';
import { AssistantPanel } from '../AssistantPanel';
import { MarkupWorkspace, type MarkupSource } from '../MarkupWorkspace';
import {
  buildAssistantContext,
  flattenActions,
  type TutorialEditorPart,
} from '../../../../lib/assistant';
import type { AssistantMessage, EditAction, ObjectSelection } from '../../../../lib/types';
import { errorMessage, ingestYoutube } from '../../../../lib/api';
import { docFromText, parsePdf } from '../../../../lib/pdf';
import { sourcePoolToMarkupSources } from '../../../../lib/tutorialV2/draftModel';
import {
  X_SLOT_NOUN,
  applyAssistantActionsToDraft,
  mediaSlot,
  newXId,
  partsForAssistant,
  blankSlot,
  updateUnit,
  type StructuredV2Draft,
} from '../../../../lib/objectV2/structuredDraft';
import type { V2SourceRef } from '../../../../lib/tutorialV2/types';

type Tab = 'hoot' | 'sources' | 'add';

export function XV2RefineSidebar({
  open,
  onOpenChange,
  draft,
  onChangeDraft,
  selectedSlotId,
  onSelectSlot,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: StructuredV2Draft;
  onChangeDraft: (next: StructuredV2Draft) => void;
  selectedSlotId: string | null;
  onSelectSlot: (id: string | null) => void;
}) {
  const [tab, setTab] = useState<Tab>('hoot');
  const [markupOpen, setMarkupOpen] = useState(false);
  const [ytUrl, setYtUrl] = useState('');
  const [ytBusy, setYtBusy] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [srcError, setSrcError] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState('Use');
  const [aiSuggestions, setAiSuggestions] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [markupFlags, setMarkupFlags] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const undoStack = useRef<StructuredV2Draft[]>([]);
  const redoStack = useRef<StructuredV2Draft[]>([]);
  const [, forceRender] = useState(0);
  const pushUndo = () => {
    undoStack.current = [...undoStack.current.slice(-39), draftRef.current];
    redoStack.current = [];
    forceRender((n) => n + 1);
  };
  const undo = () => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(draftRef.current);
    onChangeDraft(prev);
    forceRender((n) => n + 1);
  };
  const redo = () => {
    const nxt = redoStack.current.pop();
    if (!nxt) return;
    undoStack.current.push(draftRef.current);
    onChangeDraft(nxt);
    forceRender((n) => n + 1);
  };

  const parts = useMemo(() => partsForAssistant(draft), [draft]);
  const selection: ObjectSelection = selectedSlotId
    ? { kind: 'block', blockId: selectedSlotId }
    : { kind: 'none' };

  const assistantContext = useMemo(() => buildAssistantContext({
    objectId: draft.id,
    objectType: draft.type,
    title: draft.title,
    status: draft.status,
    objective: String(draft.metadata.objective || ''),
    fv: draft.fv,
    parts: parts as TutorialEditorPart[],
    selection,
  }), [draft, parts, selection]);

  const applyEditActions = (actions: EditAction[]) => {
    pushUndo();
    const flat = flattenActions(actions);
    const result = applyAssistantActionsToDraft(draftRef.current, flat);
    onChangeDraft(result.draft);
    const focusId = result.affectedIds[result.affectedIds.length - 1];
    if (focusId) onSelectSlot(focusId);
  };

  /* ── sources tab helpers ────────────────────────────────── */
  const addSources = (refs: V2SourceRef[]) => {
    onChangeDraft({ ...draftRef.current, sourcePool: [...(draftRef.current.sourcePool || []), ...refs] });
  };
  const removeSource = (id: string) => {
    onChangeDraft({
      ...draftRef.current,
      sourcePool: (draftRef.current.sourcePool || []).filter((s) => s.id !== id),
    });
  };
  const handlePdfs = async (files: File[]) => {
    setSrcError(null);
    for (const file of files) {
      try {
        const doc = await parsePdf(file, () => {});
        addSources([{ id: newXId('src-pdf'), label: doc.fileName || file.name, kind: 'pdf', sentences: doc.sentences }]);
      } catch (e) {
        setSrcError(errorMessage(e, `Could not read ${file.name}.`));
      }
    }
  };
  const handleYt = async () => {
    if (!ytUrl.trim()) return;
    setYtBusy(true);
    setSrcError(null);
    try {
      const out = await ingestYoutube(ytUrl.trim());
      addSources([{
        id: newXId('src-yt'),
        label: out.title || 'YouTube transcript',
        kind: 'youtube',
        sentences: (out.sentences || []).map((t) => ({ text: t, page: 1 })),
        sourceUrl: ytUrl.trim(),
      }]);
      setYtUrl('');
    } catch (e) {
      setSrcError(errorMessage(e, 'Could not fetch that transcript.'));
    } finally {
      setYtBusy(false);
    }
  };
  const handlePaste = () => {
    if (!pasteText.trim()) return;
    const doc = docFromText(pasteText, 'Pasted notes');
    addSources([{ id: newXId('src-text'), label: doc.fileName || 'Pasted notes', kind: 'text', sentences: doc.sentences }]);
    setPasteText('');
  };

  const markupBundle = useMemo(
    () => sourcePoolToMarkupSources(draft.sourcePool || []),
    [draft.sourcePool],
  );

  /* ── add tab helpers ────────────────────────────────────── */
  const slotNoun = X_SLOT_NOUN[draft.type];
  const addItem = () => {
    pushUndo();
    const cur = draftRef.current;
    const target = cur.units.find((u) => u.id === cur.activeUnitId) || cur.units[cur.units.length - 1];
    if (!target) return;
    const slot = blankSlot(cur.type, target.slots.length);
    onChangeDraft(updateUnit(cur, target.id, { slots: [...target.slots, slot] }));
    onSelectSlot(slot.id);
  };
  const addMedia = (kind: 'image' | 'video') => {
    pushUndo();
    const cur = draftRef.current;
    const target = cur.units.find((u) => u.id === cur.activeUnitId) || cur.units[cur.units.length - 1];
    if (!target) return;
    const slot = mediaSlot(kind);
    onChangeDraft(updateUnit(cur, target.id, { slots: [...target.slots, slot] }));
    onSelectSlot(slot.id);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="shrink-0 self-stretch flex flex-col items-center justify-center gap-2 border-l"
        style={{ width: 44, background: 'rgba(255,255,255,0.85)', borderColor: 'rgba(0,0,0,0.06)' }}
        title="Refine with AI"
      >
        <Sparkles size={15} style={{ color: '#7C3AED' }} />
        <span style={{ writingMode: 'vertical-rl', fontSize: 12, fontWeight: 650, color: '#6B7280' }}>
          Refine with AI
        </span>
      </button>
    );
  }

  return (
    <div
      className="shrink-0 self-stretch flex flex-col border-l"
      style={{ width: 'min(400px, 100%)', background: 'rgba(255,255,255,0.95)', borderColor: 'rgba(0,0,0,0.08)' }}
    >
      <div className="flex items-center gap-1 px-2 py-2 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
        {(['hoot', 'sources', 'add'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="px-3 py-1.5 rounded-full"
            style={{
              fontSize: 12.5,
              fontWeight: 650,
              background: tab === t ? '#0B0F1A' : 'transparent',
              color: tab === t ? '#fff' : '#6B7280',
            }}
          >
            {t === 'hoot' ? 'Hoot' : t === 'sources' ? 'Sources' : 'Add'}
          </button>
        ))}
        <div className="flex-1" />
        <button type="button" onClick={() => onOpenChange(false)} className="p-1.5" title="Collapse">
          <ChevronRight size={15} style={{ color: '#9AA3AF' }} />
        </button>
      </div>

      {tab === 'hoot' && (
        <div className="flex-1 min-h-0">
          <AssistantPanel
            variant="docked"
            open
            onOpenChange={() => {}}
            context={assistantContext}
            selection={selection}
            parts={parts as TutorialEditorPart[]}
            onFocusBlock={(id) => onSelectSlot(id)}
            onAcceptActions={(actions) => applyEditActions(actions)}
            canUndo={undoStack.current.length > 0}
            canRedo={redoStack.current.length > 0}
            onUndo={undo}
            onRedo={redo}
            messages={draft.assistantMessages || []}
            onMessagesChange={(m: AssistantMessage[]) => onChangeDraft({ ...draftRef.current, assistantMessages: m })}
            phaseLabel="Review · refine"
          />
        </div>
      )}

      {tab === 'sources' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
          {srcError && <p style={{ fontSize: 12, color: '#B91C1C' }}>{srcError}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border"
              style={{ fontSize: 12.5, fontWeight: 600, borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
            >
              <FileUp size={13} /> Add PDFs
            </button>
            <button
              type="button"
              onClick={() => setMarkupOpen(true)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border"
              style={{ fontSize: 12.5, fontWeight: 600, borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
            >
              <Highlighter size={13} /> Mark up
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length) void handlePdfs(files);
              e.target.value = '';
            }}
          />
          <div>
            <p className="flex items-center gap-1.5 mb-1.5" style={{ fontSize: 12, fontWeight: 700, color: '#6B7280' }}>
              <Youtube size={12} style={{ color: '#DC2626' }} /> Video transcript
            </p>
            <div className="flex gap-2">
              <input
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                className="flex-1 rounded-lg px-2.5 py-1.5"
                style={{ fontSize: 12, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
              />
              <button
                type="button"
                disabled={ytBusy}
                onClick={() => void handleYt()}
                className="px-3 py-1.5 rounded-lg text-white disabled:opacity-40"
                style={{ fontSize: 12, fontWeight: 600, background: '#0B0F1A' }}
              >
                {ytBusy ? <Loader2 size={12} className="animate-spin" /> : 'Fetch'}
              </button>
            </div>
          </div>
          <div>
            <p className="flex items-center gap-1.5 mb-1.5" style={{ fontSize: 12, fontWeight: 700, color: '#6B7280' }}>
              <ClipboardPaste size={12} /> Paste text
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={3}
              placeholder="Notes, an article…"
              className="w-full rounded-lg px-2.5 py-1.5 resize-none"
              style={{ fontSize: 12, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
            />
            <button
              type="button"
              disabled={!pasteText.trim()}
              onClick={handlePaste}
              className="mt-1 px-3 py-1.5 rounded-lg text-white disabled:opacity-40"
              style={{ fontSize: 12, fontWeight: 600, background: '#0B0F1A' }}
            >
              Add
            </button>
          </div>
          <div className="space-y-1.5">
            {(draft.sourcePool || []).map((s) => (
              <div key={s.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
                <span className="flex-1 truncate" style={{ fontSize: 12 }}>{s.label}</span>
                <span style={{ fontSize: 10.5, color: '#9AA3AF' }}>{s.kind}</span>
                <button type="button" onClick={() => removeSource(s.id)} className="p-0.5">
                  <X size={11} style={{ color: '#9AA3AF' }} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'add' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
          <p style={{ fontSize: 11.5, fontWeight: 700, color: '#9AA3AF', letterSpacing: '.05em' }}>ITEMS</p>
          <button
            type="button"
            onClick={addItem}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border"
            style={{ fontSize: 12.5, fontWeight: 600, borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
          >
            <Plus size={13} /> Add {slotNoun}
          </button>
          <p className="pt-1" style={{ fontSize: 11.5, fontWeight: 700, color: '#9AA3AF', letterSpacing: '.05em' }}>MEDIA</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => addMedia('image')}
              className="px-3 py-2.5 rounded-xl border"
              style={{ fontSize: 12.5, fontWeight: 600, borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
            >
              Image
            </button>
            <button
              type="button"
              onClick={() => addMedia('video')}
              className="px-3 py-2.5 rounded-xl border"
              style={{ fontSize: 12.5, fontWeight: 600, borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
            >
              YouTube video
            </button>
          </div>
          <p style={{ fontSize: 11.5, color: '#9AA3AF', lineHeight: 1.5 }}>
            Media can also be attached inside any {slotNoun} in its editor, and Hoot can attach
            images you drop into the chat.
          </p>
        </div>
      )}

      {markupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(11,15,26,0.55)' }}>
          <div className="w-full h-full max-w-6xl rounded-2xl overflow-hidden flex flex-col" style={{ background: '#F8FAFC' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)', background: '#fff' }}>
              <p style={{ fontSize: 14, fontWeight: 700 }}>Mark up sources</p>
              <button type="button" onClick={() => setMarkupOpen(false)} className="p-1.5">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {!markupBundle.docParas.length ? (
                <p style={{ fontSize: 13.5, color: '#B45309' }}>Add sources first.</p>
              ) : (
                <MarkupWorkspace
                  sources={markupBundle.sources as MarkupSource[]}
                  docParas={markupBundle.docParas}
                  pages={markupBundle.pages}
                  highlights={draft.refineHighlights || []}
                  setHighlights={(h: any) => onChangeDraft({
                    ...draftRef.current,
                    refineHighlights: typeof h === 'function' ? h(draftRef.current.refineHighlights || []) : h,
                  })}
                  activeTag={activeTag}
                  setActiveTag={setActiveTag}
                  aiSuggestions={aiSuggestions}
                  setAiSuggestions={setAiSuggestions}
                  query={query}
                  setQuery={setQuery}
                  markupFlags={markupFlags}
                  setMarkupFlags={setMarkupFlags}
                  scanningFlags={false}
                  flagError={null}
                  definedSections={[]}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
