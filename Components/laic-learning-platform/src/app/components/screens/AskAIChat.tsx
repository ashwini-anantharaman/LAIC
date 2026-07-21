import React, { useEffect, useRef, useState } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { askAboutObject, errorMessage } from '../../../lib/api';
import type { Block, LearningObject } from '../../../lib/types';

type ChatMsg = { id: string; role: 'user' | 'assistant'; content: string; at: number };

/** Flatten a learning object's blocks into plain text for Ask AI grounding. */
export function objectToContext(obj: LearningObject): string {
  const lines: string[] = [
    `Title: ${obj.title}`,
    obj.description ? `Description: ${obj.description}` : '',
    `Type: ${obj.type}`,
    '',
  ];
  (obj.blocks || []).forEach((b, i) => {
    lines.push(`--- Block ${i + 1} (${b.type}) ---`);
    lines.push(blockToText(b));
    lines.push('');
  });
  return lines.filter(Boolean).join('\n');
}

function blockToText(b: Block): string {
  const c: any = b.content || {};
  switch (b.type) {
    case 'rich-text':
    case 'scenario':
      return String(c.text || c.body || c.prompt || '');
    case 'summary':
      return [
        c.topic ? `Topic: ${c.topic}` : '',
        c.tldr ? `TL;DR: ${c.tldr}` : '',
        Array.isArray(c.keyPoints) && c.keyPoints.length ? `Key points:\n- ${c.keyPoints.join('\n- ')}` : '',
        c.body || '',
      ].filter(Boolean).join('\n');
    case 'reflection':
      return [
        `Goal: ${c.goal || ''}`,
        ...(c.prompts || []).map((p: any, i: number) => `Prompt ${i + 1}: ${p.prompt}`),
      ].filter(Boolean).join('\n');
    case 'assignment':
      return [
        `Objective: ${c.objective || ''}`,
        `Task: ${c.prompt || ''}`,
        Array.isArray(c.requirements) ? `Requirements:\n- ${c.requirements.join('\n- ')}` : '',
      ].filter(Boolean).join('\n');
    case 'drill':
      return [
        `Skill: ${c.skill || ''}`,
        ...(c.items || []).slice(0, 8).map((it: any, i: number) => `Item ${i + 1}: ${it.prompt} → ${it.answer}`),
      ].filter(Boolean).join('\n');
    case 'concept-card':
      return [`Term: ${c.term || ''}`, `Definition: ${c.definition || ''}`, c.example ? `Example: ${c.example}` : ''].filter(Boolean).join('\n');
    case 'source-excerpt':
      return `Source: ${c.sourceTitle || ''}\n${c.excerpt || ''}`;
    case 'quiz':
      return (c.questions || []).map((q: any, i: number) =>
        `Q${i + 1}: ${q.question}\nOptions: ${(q.options || []).join(' | ')}\nAnswer: ${(q.options || [])[q.correct] || ''}\nWhy: ${q.explanation || ''}`,
      ).join('\n\n');
    case 'question':
      return `Q: ${c.question}\nOptions: ${(c.options || []).join(' | ')}\nAnswer: ${(c.options || [])[c.correct] || ''}\nWhy: ${c.explanation || ''}`;
    case 'flashcard-set':
      return (c.cards || []).map((card: any, i: number) =>
        `Card ${i + 1}\nFront: ${card.front}\nBack: ${card.back}${card.hook ? `\nHook: ${card.hook}` : ''}`,
      ).join('\n\n');
    case 'image':
      return `Image${c.caption ? `: ${c.caption}` : ''}${c.url ? `\nURL: ${c.url}` : ''}`;
    case 'video-embed':
      return `YouTube clip${c.caption ? `: ${c.caption}` : ''}\nURL: ${c.url || ''}${c.start != null ? `\nStart: ${c.start}s` : ''}${c.end != null ? ` End: ${c.end}s` : ''}`;
    case 'bridge-play':
      return `${c.title || ''}\n${c.description || ''}\nAnswer: ${c.correctAnswer || ''}\n${c.explanation || ''}`;
    case 'bidding-sequence':
      return `${c.title || ''}\nBids: ${(c.bids || []).map((x: any) => `${x.seat} ${x.bid}`).join(', ')}\nContract: ${c.finalContract || ''}`;
    default:
      try { return JSON.stringify(c); } catch { return ''; }
  }
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Light markdown for chat: **bold**, *italic*, bullets, line breaks. */
function ChatMarkdown({ text, dark }: { text: string; dark?: boolean }) {
  const html = (() => {
    let s = escapeHtml(text);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    // Group consecutive bullet lines into a list
    s = s.replace(/(?:^|\n)((?:[-•]\s+.+(?:\n|$))+)/g, (block) => {
      const items = block
        .trim()
        .split('\n')
        .map((line) => line.replace(/^[-•]\s+/, '').trim())
        .filter(Boolean)
        .map((item) => `<li style="margin:0 0 4px">${item}</li>`)
        .join('');
      return `<ul style="margin:8px 0 4px;padding-left:18px;list-style:disc">${items}</ul>`;
    });
    s = s.replace(/\n{2,}/g, '<br/><br/>').replace(/\n/g, '<br/>');
    return s;
  })();

  return (
    <div
      className="hoot-md"
      style={{
        fontSize: 13.5,
        lineHeight: 1.55,
        color: dark ? '#fff' : '#0B1220',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Owl avatar — gently bobs / pulses while Hoot is thinking. */
function HootAvatar({ size, thinking, ring }: { size: number; thinking?: boolean; ring?: boolean }) {
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
      {thinking && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ boxShadow: '0 0 0 0 rgba(5,150,105,0.45)' }}
          animate={{ boxShadow: ['0 0 0 0 rgba(5,150,105,0.4)', '0 0 0 8px rgba(5,150,105,0)', '0 0 0 0 rgba(5,150,105,0)'] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
      )}
      <img
        src="/owl-logo.png"
        alt="Hoot"
        className="rounded-full"
        style={{ width: size, height: size, objectFit: 'cover', background: '#E8F0F6', display: 'block' }}
      />
      {ring && (
        <span
          className="absolute"
          style={{
            right: 0, bottom: 0, width: Math.max(8, size * 0.28), height: Math.max(8, size * 0.28),
            borderRadius: '50%', background: thinking ? '#F59E0B' : '#22C55E',
            border: '2px solid #0B0F1A',
          }}
        />
      )}
    </motion.div>
  );
}

/**
 * Floating Ask AI chat popup — answers are grounded only in this object's content.
 * LAIC UI (frosted whites, #0B0F1A / #059669 accents) + Hoot (owl) avatar.
 */
export function AskAIChat({
  open,
  onClose,
  obj,
}: {
  open: boolean;
  onClose: () => void;
  obj: LearningObject;
}) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>(() => [
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hi — I'm Hoot. Ask me anything about "${obj.title}". I'll only use what's in this learning object.`,
      at: Date.now(),
    },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, busy, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: 'user', content: text, at: Date.now() };
    setMsgs((p) => [...p, userMsg]);
    setInput('');
    setBusy(true);
    try {
      const history = [...msgs, userMsg]
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, content: m.content }));
      const reply = await askAboutObject({
        title: obj.title,
        context: objectToContext(obj),
        message: text,
        history,
      });
      setMsgs((p) => [...p, { id: `a-${Date.now()}`, role: 'assistant', content: reply, at: Date.now() }]);
    } catch (e) {
      setMsgs((p) => [...p, {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: errorMessage(e, 'Sorry — I could not reach the tutor right now. Is the backend running?'),
        at: Date.now(),
      }]);
    } finally {
      setBusy(false);
    }
  };

  return (
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
            width: 'min(360px, calc(100vw - 32px))',
            height: 'min(520px, calc(100vh - 96px))',
            background: '#fff',
            borderRadius: 22,
            boxShadow: '0 24px 60px -18px rgba(30,50,80,0.45)',
            border: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 shrink-0" style={{ background: '#0B0F1A' }}>
            <HootAvatar size={36} thinking={busy} ring />
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Hoot</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }} className="truncate" title={obj.title}>
                {obj.title}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
              style={{ color: 'rgba(255,255,255,0.7)' }}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3" style={{ background: '#F7F9FB' }}>
            {msgs.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
                {m.role === 'assistant' && (
                  <div className="mt-1"><HootAvatar size={26} /></div>
                )}
                <div className={`max-w-[78%] ${m.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                  <div
                    className="px-3.5 py-2.5"
                    style={{
                      borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: m.role === 'user' ? '#0B0F1A' : '#fff',
                      boxShadow: m.role === 'assistant' ? '0 2px 8px -4px rgba(30,50,80,0.18)' : 'none',
                    }}
                  >
                    {m.role === 'assistant'
                      ? <ChatMarkdown text={m.content} />
                      : <span style={{ fontSize: 13.5, lineHeight: 1.5, color: '#fff', whiteSpace: 'pre-wrap' }}>{m.content}</span>}
                  </div>
                  <span style={{ fontSize: 10.5, color: '#9AA3AF', marginTop: 4, paddingLeft: 2, paddingRight: 2 }}>
                    {m.role === 'assistant' ? 'Hoot · ' : ''}{fmtTime(m.at)}
                  </span>
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex justify-start gap-2 items-end">
                <div className="mb-0.5"><HootAvatar size={26} thinking /></div>
                <div className="px-4 py-3 rounded-2xl flex items-center gap-1.5" style={{ background: '#fff', boxShadow: '0 2px 8px -4px rgba(30,50,80,0.18)' }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#9AA3AF', animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#9AA3AF', animationDelay: '120ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#9AA3AF', animationDelay: '240ms' }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <div className="shrink-0 px-3 py-2.5 flex items-center gap-2" style={{ borderTop: '1px solid rgba(0,0,0,0.06)', background: '#fff' }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              disabled={busy}
              placeholder="Write a message"
              className="flex-1 outline-none bg-transparent"
              style={{ fontSize: 13.5, color: '#0B1220' }}
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-opacity"
              style={{ background: '#059669', color: '#fff', opacity: busy || !input.trim() ? 0.45 : 1 }}
              aria-label="Send"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
