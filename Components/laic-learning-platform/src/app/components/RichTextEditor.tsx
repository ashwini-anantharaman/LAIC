/**
 * Compact allowlisted rich-text editor for Content Studio block bodies.
 * Stores markdown in the existing body/text string — see richTextMarkdown.ts.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Bold, Italic, Underline, Code2, Link2, RemoveFormatting,
  Heading1, Heading2, Heading3, List, ListOrdered,
  IndentIncrease, IndentDecrease, Quote, Pilcrow, Highlighter,
} from 'lucide-react';
import {
  RICH_TEXT_FONTS,
  RICH_TEXT_HIGHLIGHTS,
  fontSlugForCss,
  htmlToRichTextMarkdown,
  normalizeSafeUrl,
  richTextToSafeHtml,
} from '../../lib/richTextMarkdown';

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** Optional slot rendered to the right of the toolbar (e.g. Ask AI). */
  trailingActions?: React.ReactNode;
};

function ToolbarBtn({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active || false}
      onMouseDown={(e) => {
        // Keep selection in the editor.
        e.preventDefault();
        onClick();
      }}
      className="w-7 h-7 rounded-md inline-flex items-center justify-center transition-colors"
      style={{
        color: active ? '#0B1220' : '#6B7280',
        background: active ? 'rgba(11,18,32,0.08)' : 'transparent',
      }}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="w-px h-4 mx-0.5 shrink-0" style={{ background: 'rgba(0,0,0,0.1)' }} />;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write this block…',
  minHeight = 120,
  trailingActions,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);
  const savedRange = useRef<Range | null>(null);
  const [focused, setFocused] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [font, setFont] = useState('sans');
  const [hlOpen, setHlOpen] = useState(false);

  // Hydrate editor when external value changes (and we're not mid-edit).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (focused) return;
    if (value === lastEmitted.current) return;
    el.innerHTML = richTextToSafeHtml(value || '');
    lastEmitted.current = value;
  }, [value, focused]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.innerHTML || el.innerHTML === '<br>') {
      el.innerHTML = richTextToSafeHtml(value || '');
      lastEmitted.current = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const md = htmlToRichTextMarkdown(el);
    lastEmitted.current = md;
    onChange(md);
  };

  const run = (cmd: string, arg?: string) => {
    ref.current?.focus();
    try {
      document.execCommand(cmd, false, arg);
    } catch {
      /* ignore unsupported */
    }
    emit();
  };

  const setBlock = (tag: 'p' | 'h1' | 'h2' | 'h3' | 'blockquote') => {
    // Chrome expects angle-bracket form for formatBlock.
    run('formatBlock', `<${tag}>`);
  };

  const saveSelection = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !ref.current) return;
    const range = sel.getRangeAt(0);
    if (ref.current.contains(range.commonAncestorContainer)) {
      savedRange.current = range.cloneRange();
    }
  };

  const applyFont = (slug: string) => {
    setFont(slug);
    const opt = RICH_TEXT_FONTS.find((f) => f.value === slug);
    if (!opt) return;
    ref.current?.focus();
    // Restore the selection lost when the <select> took focus.
    const range = savedRange.current;
    if (range) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    try {
      document.execCommand('fontName', false, opt.stack);
    } catch {
      /* ignore unsupported */
    }
    emit();
  };

  const applyHighlight = (color: string | null) => {
    ref.current?.focus();
    try {
      // Force span+style output, then restore default so bold/italic keep emitting tags.
      document.execCommand('styleWithCSS', false, 'true');
      document.execCommand('hiliteColor', false, color ?? 'transparent');
    } catch {
      /* ignore unsupported */
    } finally {
      try {
        document.execCommand('styleWithCSS', false, 'false');
      } catch { /* ignore */ }
    }
    emit();
  };

  // Reflect the font at the caret/selection in the dropdown.
  useEffect(() => {
    if (!focused) return;
    const handler = () => {
      try {
        setFont(fontSlugForCss(document.queryCommandValue('fontName')));
      } catch {
        /* ignore */
      }
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [focused]);

  const applyLink = () => {
    const safe = normalizeSafeUrl(linkUrl);
    if (!safe) return;
    run('createLink', safe);
    // Ensure safe attrs on the new anchor.
    const sel = window.getSelection();
    const node = sel?.anchorNode?.parentElement?.closest('a');
    if (node) {
      node.setAttribute('href', safe);
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
    setLinkOpen(false);
    setLinkUrl('');
    emit();
  };

  const clearInline = () => {
    run('removeFormat');
    // Also unwrap code / underline leftovers.
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !ref.current) {
      emit();
      return;
    }
    try {
      document.execCommand('unlink');
    } catch { /* ignore */ }
    emit();
  };

  const empty = !(value || '').trim() && !focused;

  return (
    <div
      className="rounded-[12px] overflow-hidden"
      style={{ border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.95)' }}
    >
      <div
        className="flex flex-wrap items-center gap-0.5 px-1.5 py-1.5"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'rgba(248,250,252,0.95)' }}
      >
        <select
          title="Font"
          aria-label="Font"
          value={font}
          onMouseDown={saveSelection}
          onChange={(e) => applyFont(e.target.value)}
          className="h-7 rounded-md px-1 shrink-0"
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: '#6B7280',
            background: 'transparent',
            border: '1px solid rgba(0,0,0,0.1)',
            outline: 'none',
            maxWidth: 104,
          }}
        >
          {RICH_TEXT_FONTS.map((f) => (
            <option key={f.value} value={f.value} style={{ fontFamily: f.stack }}>
              {f.label}
            </option>
          ))}
        </select>
        <Sep />
        <ToolbarBtn title="Normal text" onClick={() => setBlock('p')}>
          <Pilcrow size={14} />
        </ToolbarBtn>
        <ToolbarBtn title="Heading 1" onClick={() => setBlock('h1')}>
          <Heading1 size={14} />
        </ToolbarBtn>
        <ToolbarBtn title="Heading 2" onClick={() => setBlock('h2')}>
          <Heading2 size={14} />
        </ToolbarBtn>
        <ToolbarBtn title="Heading 3" onClick={() => setBlock('h3')}>
          <Heading3 size={14} />
        </ToolbarBtn>
        <Sep />
        <ToolbarBtn title="Bold" onClick={() => run('bold')}>
          <Bold size={14} />
        </ToolbarBtn>
        <ToolbarBtn title="Italic" onClick={() => run('italic')}>
          <Italic size={14} />
        </ToolbarBtn>
        <ToolbarBtn title="Underline" onClick={() => run('underline')}>
          <Underline size={14} />
        </ToolbarBtn>
        <ToolbarBtn
          title="Inline code"
          onClick={() => {
            const raw = window.getSelection()?.toString() || 'code';
            const safe = raw
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
            run('insertHTML', `<code>${safe}</code>`);
          }}
        >
          <Code2 size={14} />
        </ToolbarBtn>
        <ToolbarBtn
          title="Link"
          onClick={() => {
            setLinkOpen((v) => !v);
            const sel = window.getSelection()?.toString();
            if (sel && !linkUrl) setLinkUrl('https://');
          }}
        >
          <Link2 size={14} />
        </ToolbarBtn>
        <ToolbarBtn title="Highlight" active={hlOpen} onClick={() => setHlOpen((v) => !v)}>
          <Highlighter size={14} />
        </ToolbarBtn>
        <ToolbarBtn title="Clear formatting" onClick={clearInline}>
          <RemoveFormatting size={14} />
        </ToolbarBtn>
        <Sep />
        <ToolbarBtn title="Bulleted list" onClick={() => run('insertUnorderedList')}>
          <List size={14} />
        </ToolbarBtn>
        <ToolbarBtn title="Numbered list" onClick={() => run('insertOrderedList')}>
          <ListOrdered size={14} />
        </ToolbarBtn>
        <ToolbarBtn title="Indent" onClick={() => run('indent')}>
          <IndentIncrease size={14} />
        </ToolbarBtn>
        <ToolbarBtn title="Outdent" onClick={() => run('outdent')}>
          <IndentDecrease size={14} />
        </ToolbarBtn>
        <ToolbarBtn title="Blockquote" onClick={() => setBlock('blockquote')}>
          <Quote size={14} />
        </ToolbarBtn>
        {trailingActions ? (
          <>
            <Sep />
            <div className="ml-auto flex items-center gap-1 pl-1">{trailingActions}</div>
          </>
        ) : null}
      </div>

      {hlOpen && (
        <div
          className="flex items-center gap-2 px-2.5 py-2"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#fff' }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>Highlight</span>
          {RICH_TEXT_HIGHLIGHTS.map((h) => (
            <button
              key={h.value}
              type="button"
              title={h.label}
              aria-label={`Highlight ${h.label.toLowerCase()}`}
              onMouseDown={(e) => {
                // Keep selection in the editor.
                e.preventDefault();
                applyHighlight(h.color);
                setHlOpen(false);
              }}
              className="w-5 h-5 rounded-full shrink-0 transition-transform hover:scale-110"
              style={{ background: h.color, border: '1px solid rgba(0,0,0,0.12)' }}
            />
          ))}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              applyHighlight(null);
              setHlOpen(false);
            }}
            className="px-2.5 py-1.5 rounded-full"
            style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', background: 'rgba(0,0,0,0.05)' }}
          >
            Remove
          </button>
        </div>
      )}

      {linkOpen && (
        <div
          className="flex items-center gap-2 px-2.5 py-2"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#fff' }}
        >
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://…"
            className="flex-1 rounded-lg px-2.5 py-1.5"
            style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              }
              if (e.key === 'Escape') setLinkOpen(false);
            }}
          />
          <button
            type="button"
            onClick={applyLink}
            disabled={!normalizeSafeUrl(linkUrl)}
            className="px-2.5 py-1.5 rounded-full text-white disabled:opacity-40"
            style={{ fontSize: 12, fontWeight: 650, background: '#0B0F1A' }}
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => { run('unlink'); setLinkOpen(false); }}
            className="px-2.5 py-1.5 rounded-full"
            style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', background: 'rgba(0,0,0,0.05)' }}
          >
            Remove
          </button>
        </div>
      )}

      <div className="relative">
        {empty && (
          <div
            className="pointer-events-none absolute left-3 top-2.5"
            style={{ fontSize: 13.5, color: '#9AA3AF' }}
          >
            {placeholder}
          </div>
        )}
        <div
          ref={ref}
          contentEditable
          role="textbox"
          aria-multiline="true"
          spellCheck
          className="rich-text-editor outline-none px-3 py-2.5"
          style={{
            minHeight,
            fontSize: 13.5,
            lineHeight: 1.6,
            color: '#374151',
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            emit();
          }}
          onInput={emit}
          onKeyUp={emit}
        />
      </div>

      <style>{`
        .rich-text-editor h1 { font-size: 1.35rem; font-weight: 750; color: #0B1220; margin: 0.4em 0 0.35em; letter-spacing: -0.02em; }
        .rich-text-editor h2 { font-size: 1.15rem; font-weight: 700; color: #0B1220; margin: 0.4em 0 0.3em; letter-spacing: -0.02em; }
        .rich-text-editor h3 { font-size: 1.02rem; font-weight: 700; color: #0B1220; margin: 0.35em 0 0.25em; }
        .rich-text-editor p { margin: 0 0 0.55em; }
        .rich-text-editor ul { margin: 0.35em 0 0.55em; padding-left: 1.25rem; list-style: disc; }
        .rich-text-editor ol { margin: 0.35em 0 0.55em; padding-left: 1.25rem; list-style: decimal; }
        .rich-text-editor li { margin: 0.15em 0; }
        .rich-text-editor blockquote {
          margin: 0.45em 0; padding: 0.35em 0.75em;
          border-left: 3px solid rgba(109,40,217,0.35);
          color: #4B5563; background: rgba(109,40,217,0.04); border-radius: 0 8px 8px 0;
        }
        .rich-text-editor code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.9em; background: rgba(15,23,42,0.06); padding: 0.1em 0.35em; border-radius: 4px;
        }
        .rich-text-editor a { color: #2563EB; text-decoration: underline; }
      `}</style>
    </div>
  );
}
