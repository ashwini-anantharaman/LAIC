import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Check, ChevronDown, ChevronUp, Eye, ImagePlus, Loader2,
  Send, Undo2, Redo2, X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  resolveQuickActionMessage,
  blockIdsFromActions,
  type TutorialEditorPart,
} from '../../../lib/assistant';
import { streamAssistantTurn, errorMessage, type AssistantTurnEvent } from '../../../lib/api';
import { uploadImage } from '../../../lib/supabase';
import type {
  AssistantAttachedImage,
  AssistantChangeLogEntry,
  AssistantContext,
  AssistantMessage,
  AssistantQuickActionId,
  EditAction,
  EditDiff,
  ObjectSelection,
  ProposedEdit,
} from '../../../lib/types';

const QUICK_CHIPS: { id: AssistantQuickActionId; label: string }[] = [
  { id: 'improve_block', label: 'Improve this block' },
  { id: 'make_simpler', label: 'Make it simpler' },
  { id: 'shorten', label: 'Shorten' },
  { id: 'add_example', label: 'Add an example' },
  { id: 'write_check', label: 'Write a check' },
  { id: 'fix_grounding', label: 'Fix grounding' },
  { id: 'coverage_check', label: 'Coverage' },
  { id: 'summarize', label: 'Summarize' },
];

const MAX_HOOT_IMAGES = 6;
const MAX_HOOT_IMAGE_BYTES = 4 * 1024 * 1024;

/** Ensure add_block image actions use real attached URLs (not model placeholders). */
function remapImageActions(
  actions: EditAction[],
  images: AssistantAttachedImage[],
): EditAction[] {
  if (!images.length) return actions;
  const byId = new Map(images.map((img) => [img.id, img]));
  const resolveContent = (content: Record<string, unknown> | undefined): Record<string, unknown> => {
    const c = { ...(content || {}) };
    const ref = String(c.imageRef || c.ref || c.attachedId || '').trim();
    if (ref && byId.has(ref)) {
      const img = byId.get(ref)!;
      return {
        ...c,
        url: img.url,
        caption: String(c.caption || img.caption || img.name || '').trim(),
        imageRef: undefined,
        ref: undefined,
        attachedId: undefined,
      };
    }
    const url = String(c.url || '');
    const m = url.match(/__ATTACHED_IMAGE_(\d+)__/i)
      || url.match(/^ATTACHED:(\d+)$/i)
      || url.match(/^ATTACHED:(.+)$/i);
    if (m) {
      const key = m[1];
      const img = /^\d+$/.test(key) ? images[Number(key)] : byId.get(key);
      if (img) {
        return {
          ...c,
          url: img.url,
          caption: String(c.caption || img.caption || img.name || '').trim(),
        };
      }
    }
    if (!url && images.length === 1) {
      return { ...c, url: images[0].url, caption: String(c.caption || images[0].caption || images[0].name || '').trim() };
    }
    return c;
  };
  const walk = (action: EditAction): EditAction => {
    if (action.type === 'batch') {
      return { ...action, actions: action.actions.map(walk) };
    }
    if (action.type === 'add_block' && /image/i.test(action.blockType || '')) {
      return { ...action, content: resolveContent(action.content) };
    }
    if (action.type === 'update_block' && action.patch) {
      const p = action.patch;
      if (p.url != null || p.imageRef != null || p.ref != null) {
        return { ...action, patch: resolveContent(p as Record<string, unknown>) };
      }
    }
    return action;
  };
  return actions.map(walk);
}

function remapProposalImages(proposal: ProposedEdit, images: AssistantAttachedImage[]): ProposedEdit {
  if (!images.length) return proposal;
  return {
    ...proposal,
    diffs: proposal.diffs.map((d) => {
      const action = remapImageActions([d.action], images)[0];
      const url = action.type === 'add_block' ? String(action.content?.url || '') : '';
      const caption = action.type === 'add_block' ? String(action.content?.caption || '') : '';
      const isImage = action.type === 'add_block' && /image/i.test(action.blockType || '');
      return {
        ...d,
        action,
        afterText: isImage
          ? (caption ? `Image: ${caption}` : 'Image block')
          : d.afterText,
        beforeText: isImage ? '(none)' : d.beforeText,
        summary: isImage && url && !/image/i.test(d.summary)
          ? `${d.summary} (image)`
          : d.summary,
      };
    }),
  };
}

function HootAvatar({ size, thinking }: { size: number; thinking?: boolean }) {
  return (
    <motion.div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      animate={thinking
        ? { y: [0, -3, 0, -2, 0], rotate: [0, -6, 6, -4, 0], scale: [1, 1.06, 1, 1.04, 1] }
        : { y: 0, rotate: 0, scale: 1 }}
      transition={thinking
        ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' }
        : { duration: 0.2 }}
    >
      <img
        src="/owl-logo.png"
        alt="Hoot"
        className="rounded-full"
        style={{ width: size, height: size, objectFit: 'cover', background: '#E8F0F6', display: 'block' }}
      />
      <span
        className="absolute"
        style={{
          right: 0, bottom: 0,
          width: Math.max(8, size * 0.28), height: Math.max(8, size * 0.28),
          borderRadius: '50%',
          background: thinking ? '#F59E0B' : '#22C55E',
          border: '2px solid #0B0F1A',
        }}
      />
    </motion.div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ChatMarkdown({ text }: { text: string }) {
  const html = escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\n/g, '<br/>');
  return <div style={{ fontSize: 13, lineHeight: 1.55, color: '#374151' }} dangerouslySetInnerHTML={{ __html: html }} />;
}

function DiffView({ diff }: { diff: EditDiff }) {
  const imageUrl = diff.action?.type === 'add_block' && /image/i.test(diff.action.blockType || '')
    ? String(diff.action.content?.url || '')
    : '';
  if (imageUrl) {
    const caption = String(diff.action.type === 'add_block' ? (diff.action.content?.caption || '') : '');
    return (
      <div className="mt-2 rounded-xl overflow-hidden border" style={{ borderColor: 'rgba(5,150,105,0.25)', background: 'rgba(5,150,105,0.06)' }}>
        <img src={imageUrl} alt={caption || 'Proposed image'} style={{ width: '100%', maxHeight: 160, objectFit: 'contain', background: '#fff', display: 'block' }} />
        {caption && (
          <p style={{ fontSize: 12, color: '#065F46', padding: '6px 10px' }}>{caption}</p>
        )}
      </div>
    );
  }
  if (diff.beforeText != null || diff.afterText != null) {
    return (
      <div className="grid gap-2 mt-2">
        {diff.beforeText != null && (
          <div className="rounded-xl px-3 py-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p style={{ fontSize: 10.5, fontWeight: 700, color: '#B91C1C', marginBottom: 4 }}>BEFORE</p>
            <p style={{ fontSize: 12.5, color: '#374151', whiteSpace: 'pre-wrap' }}>{diff.beforeText || '(empty)'}</p>
          </div>
        )}
        {diff.afterText != null && (
          <div className="rounded-xl px-3 py-2" style={{ background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.25)' }}>
            <p style={{ fontSize: 10.5, fontWeight: 700, color: '#059669', marginBottom: 4 }}>AFTER</p>
            <p style={{ fontSize: 12.5, color: '#374151', whiteSpace: 'pre-wrap' }}>{diff.afterText || '(empty)'}</p>
          </div>
        )}
      </div>
    );
  }
  return (
    <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 6, whiteSpace: 'pre-wrap' }}>
      {diff.summary}
      {diff.action?.type ? ` · action: ${diff.action.type}` : ''}
    </p>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: AssistantContext;
  selection: ObjectSelection;
  onFocusBlock?: (blockId: string) => void;
  onAcceptActions: (actions: EditAction[], label: string) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  /** Optional: show which part label is selected */
  parts?: TutorialEditorPart[];
  /**
   * Controlled chat history — lift to the create pipeline so prior instructions
   * survive Sources → Markup → Extract → Define → Editor.
   */
  messages?: AssistantMessage[];
  onMessagesChange?: (messages: AssistantMessage[]) => void;
  /** Optional subtitle under “Hoot” (e.g. current pipeline step). */
  phaseLabel?: string;
  /**
   * floating = bottom-right popup (default, V1 editor).
   * docked = fill parent (Tutorial V2 Refine sidebar) — no floating launcher.
   */
  variant?: 'floating' | 'docked';
}

export function AssistantPanel({
  open,
  onOpenChange,
  context,
  selection,
  onFocusBlock,
  onAcceptActions,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  parts,
  messages: controlledMessages,
  onMessagesChange,
  phaseLabel,
  variant = 'floating',
}: Props) {
  const controlled = typeof onMessagesChange === 'function';
  const [localMessages, setLocalMessages] = useState<AssistantMessage[]>([]);
  const messages = controlled ? (controlledMessages || []) : localMessages;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const setMessages = (updater: AssistantMessage[] | ((prev: AssistantMessage[]) => AssistantMessage[])) => {
    const prev = messagesRef.current;
    const next = typeof updater === 'function' ? updater(prev) : updater;
    messagesRef.current = next;
    if (controlled) onMessagesChange!(next);
    else setLocalMessages(next);
  };
  const [proposals, setProposals] = useState<ProposedEdit[]>([]);
  const [changeLog, setChangeLog] = useState<AssistantChangeLogEntry[]>([]);
  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState<AssistantAttachedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [streamBuf, setStreamBuf] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const objectId = context.objectId;
  const lastObjectId = useRef(objectId);

  // Reset only when switching objects (keep history across pipeline steps).
  useEffect(() => {
    if (lastObjectId.current === objectId) return;
    lastObjectId.current = objectId;
    if (!controlled) setLocalMessages([]);
    setProposals([]);
    setChangeLog([]);
    setError(null);
    setStreamBuf('');
  }, [objectId, controlled]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamBuf, proposals, busy]);

  const selectedLabel = (() => {
    if (selection.kind !== 'block' && selection.kind !== 'block_range') return 'Whole content';
    const id = selection.blockId;
    const p = parts?.find((x) => x.id === id);
    return p?.heading || p?.label || id;
  })();

  const attachFiles = async (list: FileList | File[] | null) => {
    if (!list) return;
    const files = Array.from(list).filter((f) => f.type.startsWith('image/'));
    if (!files.length) {
      setError('Choose image files (PNG, JPG, WebP, GIF).');
      return;
    }
    const room = MAX_HOOT_IMAGES - pendingImages.length;
    if (room <= 0) {
      setError(`You can attach up to ${MAX_HOOT_IMAGES} images per message.`);
      return;
    }
    setError(null);
    try {
      const next: AssistantAttachedImage[] = [];
      for (const file of files.slice(0, room)) {
        if (file.size > MAX_HOOT_IMAGE_BYTES) {
          setError(`“${file.name}” is larger than 4 MB. Use a smaller image.`);
          continue;
        }
        const url = await uploadImage(file);
        next.push({
          id: `hoot-img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          url,
          name: file.name,
          caption: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || undefined,
        });
      }
      if (next.length) setPendingImages((prev) => [...prev, ...next].slice(0, MAX_HOOT_IMAGES));
    } catch (e) {
      setError(errorMessage(e, 'Could not attach image.'));
    }
  };

  const runTurn = async (message: string, quickAction?: AssistantQuickActionId) => {
    // Prefer newly picked images; otherwise reuse attachments from recent user turns
    // so "place the images I attached" still works on a follow-up message.
    const fromHistory: AssistantAttachedImage[] = [];
    const seen = new Set<string>();
    for (const m of [...messages].reverse()) {
      if (m.role !== 'user' || !m.attachments?.length) continue;
      for (const img of m.attachments) {
        if (!img?.id || !img?.url || seen.has(img.id)) continue;
        seen.add(img.id);
        fromHistory.push(img);
        if (fromHistory.length >= MAX_HOOT_IMAGES) break;
      }
      if (fromHistory.length >= MAX_HOOT_IMAGES) break;
    }
    const attached = pendingImages.length ? pendingImages : fromHistory;
    const baseText = message.trim()
      || (attached.length ? 'Add these images where you recommend in this content.' : '');
    if (!baseText || busy) return;
    // Put an explicit inventory in the message so the model cannot miss attachments
    // even if multimodal image blocks fail to load.
    const inventory = attached.length
      ? `\n\n[Attached images (${attached.length}) — place these as image blocks where they fit best:\n${attached.map((img, i) => `  ${i + 1}. id=${img.id} name=${img.name || 'image'}${img.caption ? ` caption="${img.caption}"` : ''}`).join('\n')}\n]`
      : '';
    const text = `${baseText}${inventory}`;
    setError(null);
    setBusy(true);
    setStatus(attached.length ? 'Looking at your images…' : 'Starting…');
    setStreamBuf('');
    const userMsg: AssistantMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: baseText,
      at: Date.now(),
      attachments: attached.length ? attached : undefined,
    };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setPendingImages([]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const history = [...messages, userMsg]
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-40)
        .map((m) => {
          const n = m.attachments?.length || 0;
          const content = n
            ? `${m.content}\n\n[${n} image(s) were attached on this turn — ids: ${m.attachments!.map((a) => a.id).join(', ')}]`
            : m.content;
          return { role: m.role as 'user' | 'assistant', content };
        });

      let finalMessage: AssistantMessage | null = null;
      for await (const ev of streamAssistantTurn({
        context: { ...context, selection },
        selection,
        message: text,
        history,
        quickAction,
        attachedImages: attached.length ? attached : undefined,
      }, ctrl.signal) as AsyncGenerator<AssistantTurnEvent>) {
        if (ev.type === 'status') setStatus(ev.message);
        else if (ev.type === 'token') setStreamBuf((b) => b + ev.text);
        else if (ev.type === 'message') {
          finalMessage = ev.message;
          setStreamBuf('');
          setMessages((m) => [...m, ev.message]);
        } else if (ev.type === 'proposal') {
          const proposal = remapProposalImages(ev.proposal, attached);
          setProposals((p) => [...p, proposal]);
          if (finalMessage) {
            setMessages((m) => m.map((msg) => (
              msg.id === proposal.messageId
                ? { ...msg, proposalIds: [...(msg.proposalIds || []), proposal.id] }
                : msg
            )));
          }
        } else if (ev.type === 'error') {
          throw new Error(ev.message);
        } else if (ev.type === 'done') break;
      }
      if (!finalMessage && streamBuf) {
        setMessages((m) => [...m, {
          id: `a-${Date.now()}`, role: 'assistant', content: streamBuf, at: Date.now(),
        }]);
        setStreamBuf('');
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(errorMessage(e, 'Assistant request failed.'));
    } finally {
      setBusy(false);
      setStatus(null);
      abortRef.current = null;
    }
  };

  const acceptDiff = (proposalId: string, diff: EditDiff) => {
    onAcceptActions([diff.action], diff.summary);
    setProposals((prev) => prev.map((p) => {
      if (p.id !== proposalId) return p;
      const diffs = p.diffs.map((d) => (d.id === diff.id ? { ...d, /* mark via parent status */ } : d));
      const remaining = diffs.filter((d) => d.id !== diff.id);
      // Track accepted by removing accepted diffs from pending proposal
      const nextDiffs = p.diffs.filter((d) => d.id !== diff.id);
      return {
        ...p,
        diffs: nextDiffs,
        status: nextDiffs.length === 0 ? 'accepted' : p.status,
      };
    }));
    setChangeLog((log) => [{
      id: `cl-${Date.now()}`,
      at: Date.now(),
      summary: diff.summary,
      blockIds: blockIdsFromActions([diff.action]),
      proposalId,
    }, ...log]);
  };

  const rejectDiff = (proposalId: string, diffId: string) => {
    setProposals((prev) => prev.map((p) => {
      if (p.id !== proposalId) return p;
      const nextDiffs = p.diffs.filter((d) => d.id !== diffId);
      return { ...p, diffs: nextDiffs, status: nextDiffs.length === 0 ? 'rejected' : p.status };
    }));
  };

  const acceptAll = (proposal: ProposedEdit) => {
    const actions = proposal.diffs.map((d) => d.action);
    onAcceptActions(actions.length === 1 ? actions : [{ type: 'batch', actions, reason: proposal.title }], proposal.title);
    setProposals((prev) => prev.map((p) => (p.id === proposal.id ? { ...p, diffs: [], status: 'accepted' } : p)));
    setChangeLog((log) => [{
      id: `cl-${Date.now()}`,
      at: Date.now(),
      summary: `Accepted all: ${proposal.title}`,
      blockIds: blockIdsFromActions(actions),
      proposalId: proposal.id,
    }, ...log]);
  };

  const rejectAll = (proposalId: string) => {
    setProposals((prev) => prev.map((p) => (p.id === proposalId ? { ...p, diffs: [], status: 'rejected' } : p)));
  };

  const pendingProposals = proposals.filter((p) => p.status === 'pending' && p.diffs.length > 0);
  const docked = variant === 'docked';

  const panelInner = (
            <>
            <div className="flex items-center gap-2.5 px-4 py-3 shrink-0" style={{ background: '#0B0F1A' }}>
              <HootAvatar size={36} thinking={busy} />
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Hoot</p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }} className="truncate">
                  {phaseLabel
                    ? `Co-author · ${phaseLabel}`
                    : `Co-author · ${context.title || 'Untitled'}`}
                </p>
              </div>
              <button type="button" onClick={() => onUndo?.()} disabled={!canUndo}
                className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30 hover:bg-white/10"
                style={{ color: 'rgba(255,255,255,0.7)' }} title="Undo">
                <Undo2 size={14} />
              </button>
              <button type="button" onClick={() => onRedo?.()} disabled={!canRedo}
                className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30 hover:bg-white/10"
                style={{ color: 'rgba(255,255,255,0.7)' }} title="Redo">
                <Redo2 size={14} />
              </button>
              {!docked && (
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10"
                  style={{ color: 'rgba(255,255,255,0.7)' }}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="px-3 py-1.5 flex items-center gap-2 shrink-0" style={{ background: '#F7F9FB', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
              <Eye size={12} style={{ color: '#6B7280' }} />
              <p style={{ fontSize: 11.5, color: '#6B7280' }}>
                Focus: <span style={{ fontWeight: 600, color: '#0B1220' }}>{selectedLabel}</span>
              </p>
            </div>

            {changeLog.length > 0 && (
              <div className="shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <button type="button" onClick={() => setLogOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-1.5"
                  style={{ fontSize: 11.5, fontWeight: 600, color: '#6B7280' }}>
                  Session changes ({changeLog.length})
                  {logOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                {logOpen && (
                  <div className="px-3 pb-2 space-y-1 max-h-24 overflow-y-auto">
                    {changeLog.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => e.blockIds[0] && onFocusBlock?.(e.blockIds[0])}
                        className="block w-full text-left px-2 py-1 rounded-lg"
                        style={{ fontSize: 11.5, color: '#374151', background: 'rgba(0,0,0,0.03)' }}
                      >
                        {e.summary}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3 min-h-0" style={{ background: '#F7F9FB' }}>
              {messages.length === 0 && !busy && (
                <div className="flex gap-2">
                  <HootAvatar size={26} />
                  <div className="rounded-2xl px-3.5 py-2.5" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                      Hi — I’m Hoot. Tell me how you want this content shaped. I already see your sources, markup, extracts, and define choices from authoring. Attach images and ask me to place them where they fit — I’ll propose image blocks; nothing applies until you Accept.
                    </p>
                  </div>
                </div>
              )}
              {messages.some((m) => m.role === 'user') && (
                <p style={{ fontSize: 11, color: '#6B7280', paddingLeft: 2 }}>
                  {messages.filter((m) => m.role === 'user').length} prior instruction
                  {messages.filter((m) => m.role === 'user').length === 1 ? '' : 's'} remembered for this content
                </p>
              )}

              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
                  {m.role === 'assistant' && <div className="mt-1"><HootAvatar size={26} /></div>}
                  <div
                    className="rounded-2xl px-3.5 py-2.5 max-w-[82%]"
                    style={{
                      background: m.role === 'user' ? '#0B0F1A' : '#fff',
                      color: m.role === 'user' ? '#fff' : '#374151',
                      border: m.role === 'user' ? 'none' : '1px solid rgba(0,0,0,0.06)',
                    }}
                  >
                    {m.role === 'user' ? (
                      <>
                        {m.attachments && m.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {m.attachments.map((img) => (
                              <img
                                key={img.id}
                                src={img.url}
                                alt={img.name || 'Attached'}
                                style={{
                                  width: 56, height: 56, objectFit: 'cover', borderRadius: 8,
                                  border: '1px solid rgba(255,255,255,0.25)',
                                }}
                              />
                            ))}
                          </div>
                        )}
                        <p style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{m.content}</p>
                      </>
                    ) : (
                      <>
                        <ChatMarkdown text={m.content} />
                        {m.citations && m.citations.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {m.citations.map((c, i) => (
                              <button
                                key={`${c.id}-${i}`}
                                type="button"
                                onClick={() => c.kind === 'block' && onFocusBlock?.(c.id)}
                                className="px-2 py-0.5 rounded-full"
                                style={{ fontSize: 10.5, fontWeight: 600, background: 'rgba(0,0,0,0.06)', color: '#374151' }}
                              >
                                {c.kind}:{c.label || c.id.slice(0, 10)}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}

              {busy && streamBuf && (
                <div className="flex gap-2">
                  <HootAvatar size={26} thinking />
                  <div className="rounded-2xl px-3.5 py-2.5" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <ChatMarkdown text={streamBuf} />
                  </div>
                </div>
              )}
              {busy && !streamBuf && (
                <div className="flex items-center gap-2 px-1" style={{ fontSize: 12.5, color: '#6B7280' }}>
                  <HootAvatar size={26} thinking />
                  {status || 'Thinking…'}
                </div>
              )}

              {pendingProposals.map((prop) => (
                <div key={prop.id} className="rounded-2xl border p-3" style={{ borderColor: 'rgba(5,150,105,0.3)', background: 'rgba(5,150,105,0.06)' }}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#065F46' }}>{prop.title}</p>
                    <div className="flex gap-1 shrink-0">
                      <button type="button" onClick={() => acceptAll(prop)}
                        className="px-2 py-1 rounded-full text-white" style={{ fontSize: 11, fontWeight: 600, background: '#059669' }}>
                        Accept all
                      </button>
                      <button type="button" onClick={() => rejectAll(prop.id)}
                        className="px-2 py-1 rounded-full border" style={{ fontSize: 11, color: '#6B7280', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}>
                        Reject all
                      </button>
                    </div>
                  </div>
                  {prop.diffs.map((diff) => (
                    <div key={diff.id} className="mb-3 last:mb-0 rounded-xl border p-2.5" style={{ background: '#fff', borderColor: 'rgba(0,0,0,0.08)' }}>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: '#0B1220' }}>{diff.summary}</p>
                      {diff.blockId && (
                        <button type="button" onClick={() => onFocusBlock?.(diff.blockId!)}
                          style={{ fontSize: 11, color: '#2563EB', marginTop: 2 }}>
                          Jump to block
                        </button>
                      )}
                      <DiffView diff={diff} />
                      <div className="flex gap-1.5 mt-2">
                        <button type="button" onClick={() => acceptDiff(prop.id, diff)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-white"
                          style={{ fontSize: 11.5, fontWeight: 600, background: '#059669' }}>
                          <Check size={12} />Accept
                        </button>
                        <button type="button" onClick={() => rejectDiff(prop.id, diff.id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full border"
                          style={{ fontSize: 11.5, color: '#6B7280', borderColor: 'rgba(0,0,0,0.1)' }}>
                          <X size={12} />Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              {error && (
                <div className="flex items-start gap-2 rounded-xl p-2.5" style={{ background: '#FEE2E2', border: '1px solid #FCA5A5' }}>
                  <AlertTriangle size={14} style={{ color: '#B91C1C', marginTop: 2 }} />
                  <p style={{ fontSize: 12.5, color: '#991B1B', flex: 1 }}>{error}</p>
                  <button type="button" onClick={() => setError(null)}><X size={13} style={{ color: '#B91C1C' }} /></button>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="px-3 pt-2 pb-1 border-t shrink-0" style={{ borderColor: 'rgba(0,0,0,0.06)', background: '#fff' }}>
              <div className="flex flex-wrap gap-1 mb-2 max-h-[52px] overflow-y-auto">
                {pendingImages.length > 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runTurn('Add these images where you recommend in this content.')}
                    className="px-2 py-1 rounded-full border disabled:opacity-50"
                    style={{ fontSize: 11, fontWeight: 600, color: '#065F46', borderColor: 'rgba(5,150,105,0.35)', background: 'rgba(5,150,105,0.08)' }}
                  >
                    Place attached images
                  </button>
                )}
                {QUICK_CHIPS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={busy}
                    onClick={() => runTurn(resolveQuickActionMessage(c.id, selection), c.id)}
                    className="px-2 py-1 rounded-full border disabled:opacity-50"
                    style={{ fontSize: 11, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.9)' }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {pendingImages.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {pendingImages.map((img) => (
                    <div key={img.id} className="relative" style={{ width: 52, height: 52 }}>
                      <img
                        src={img.url}
                        alt={img.name || 'Attachment'}
                        style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)' }}
                      />
                      <button
                        type="button"
                        onClick={() => setPendingImages((prev) => prev.filter((x) => x.id !== img.id))}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white"
                        style={{ background: '#0B0F1A', fontSize: 10 }}
                        title="Remove"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pb-3 items-end">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void attachFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={busy || pendingImages.length >= MAX_HOOT_IMAGES}
                  onClick={() => fileRef.current?.click()}
                  className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center border disabled:opacity-40"
                  style={{ borderColor: 'rgba(0,0,0,0.12)', background: '#F7F9FB', color: '#0B1220' }}
                  title="Attach images for Hoot to place"
                >
                  <ImagePlus size={16} />
                </button>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void runTurn(input);
                    }
                  }}
                  rows={2}
                  disabled={busy}
                  placeholder={pendingImages.length ? 'e.g. Add these images where you recommend…' : 'Ask or request an edit…'}
                  className="flex-1 rounded-xl px-3 py-2 resize-none"
                  style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', background: '#F7F9FB', outline: 'none' }}
                />
                <button
                  type="button"
                  disabled={busy || (!input.trim() && !pendingImages.length)}
                  onClick={() => void runTurn(input)}
                  className="self-end w-10 h-10 rounded-full flex items-center justify-center text-white disabled:opacity-40"
                  style={{ background: '#0B0F1A' }}
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                </button>
              </div>
            </div>
            </>
  );

  if (docked) {
    if (!open) return null;
    return (
      <div className="flex flex-col overflow-hidden h-full min-h-0 w-full" style={{ background: '#fff' }}>
        {panelInner}
      </div>
    );
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="fixed z-50 flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full shadow-lg"
          style={{
            right: 20,
            bottom: 88,
            background: '#0B0F1A',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 12px 32px -10px rgba(30,50,80,0.45)',
          }}
          title="Open Hoot — content assistant"
        >
          <img
            src="/owl-logo.png"
            alt=""
            className="rounded-full"
            style={{ width: 32, height: 32, objectFit: 'cover', background: '#E8F0F6' }}
          />
          Ask Hoot
        </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ duration: 0.22 }}
            className="fixed z-50 flex flex-col overflow-hidden"
            style={{
              right: 20,
              bottom: 20,
              width: 'min(380px, calc(100vw - 32px))',
              height: 'min(560px, calc(100vh - 96px))',
              background: '#fff',
              borderRadius: 22,
              boxShadow: '0 24px 60px -18px rgba(30,50,80,0.45)',
              border: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            {panelInner}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Header chip to open the floating Hoot popup. */
export function AssistantOpenButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border"
      style={{ fontSize: 12, fontWeight: 600, color: '#0B1220', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.9)' }}
    >
      <img src="/owl-logo.png" alt="" className="rounded-full" style={{ width: 18, height: 18, objectFit: 'cover' }} />
      Hoot
    </button>
  );
}
