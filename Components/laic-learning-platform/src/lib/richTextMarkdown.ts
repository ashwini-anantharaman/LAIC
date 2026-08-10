/**
 * Allowlisted rich-text dialect for Content Studio block bodies.
 * Stored in existing `body` / `RichTextContent.text` string fields — no schema change.
 *
 * Inline:  **bold**  *italic*  __underline__  `code`  [label](url)
 *          {{font:serif}}…{{/font}}  (allowlisted font families only)
 *          {{hl:yellow}}…{{/hl}}     (allowlisted highlight colors only)
 * Block:   # H1  ## H2  ### H3  - bullets  1. numbers  > quote  (2-space nest)
 *
 * Plain text (no markers) round-trips unchanged.
 */

const ALLOWED_TAGS = new Set([
  'STRONG', 'B', 'EM', 'I', 'U', 'CODE', 'A', 'FONT',
  'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'P', 'BR', 'DIV',
]);

export type RichTextFont = { value: string; label: string; stack: string };

/** Allowlisted font families for the rich-text toolbar dropdown. */
export const RICH_TEXT_FONTS: RichTextFont[] = [
  { value: 'sans', label: 'Default', stack: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { value: 'serif', label: 'Serif', stack: "Georgia, 'Times New Roman', serif" },
  { value: 'mono', label: 'Mono', stack: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  { value: 'hand', label: 'Handwritten', stack: "'Comic Sans MS', 'Bradley Hand', 'Segoe Print', cursive" },
];

const FONT_BY_VALUE = new Map(RICH_TEXT_FONTS.map((f) => [f.value, f]));

function firstFamily(cssValue: string): string {
  return String(cssValue || '')
    .split(',')[0]
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .toLowerCase();
}

/** Map a CSS font-family value (or <font face>) back to an allowlisted slug; unknown → 'sans'. */
export function fontSlugForCss(cssValue: string): string {
  const first = firstFamily(cssValue);
  if (!first) return 'sans';
  for (const f of RICH_TEXT_FONTS) {
    if (first === f.value || first === firstFamily(f.stack)) return f.value;
  }
  return 'sans';
}

export type RichTextHighlight = { value: string; label: string; color: string };

/** Allowlisted highlight colors for the rich-text toolbar. */
export const RICH_TEXT_HIGHLIGHTS: RichTextHighlight[] = [
  { value: 'yellow', label: 'Yellow', color: '#FDE68A' },
  { value: 'green', label: 'Green', color: '#BBF7D0' },
  { value: 'pink', label: 'Pink', color: '#FBCFE8' },
  { value: 'blue', label: 'Blue', color: '#BFDBFE' },
  { value: 'orange', label: 'Orange', color: '#FED7AA' },
];

const HIGHLIGHT_BY_VALUE = new Map(RICH_TEXT_HIGHLIGHTS.map((h) => [h.value, h]));

/** Normalize a CSS color (hex or rgb/rgba) to "r,g,b" for comparison. */
function normColor(css: string): string | null {
  const s = String(css || '').trim().toLowerCase();
  const hex = /^#([0-9a-f]{6})$/.exec(s);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
  if (rgb) return `${+rgb[1]},${+rgb[2]},${+rgb[3]}`;
  return null;
}

/** Map a CSS background-color back to an allowlisted highlight slug; unknown → null. */
export function highlightSlugForCss(cssValue: string): string | null {
  const key = normColor(cssValue);
  if (!key) return null;
  for (const h of RICH_TEXT_HIGHLIGHTS) {
    if (normColor(h.color) === key) return h.value;
  }
  return null;
}

export function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unescapeHtml(s: string): string {
  return String(s || '')
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

/** Normalize / validate link href — http(s) only. */
export function normalizeSafeUrl(raw: string): string | null {
  const t = String(raw || '').trim();
  if (!t) return null;
  try {
    const withProto = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t) ? t : `https://${t}`;
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

function inlineMarkdownToHtml(escapedLine: string): string {
  let s = escapedLine;
  // Code first so markers inside code are left alone (already escaped).
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\{\{font:([a-z-]+)\}\}([\s\S]+?)\{\{\/font\}\}/g, (_m, slug, inner) => {
    const f = FONT_BY_VALUE.get(slug);
    if (!f || slug === 'sans') return inner;
    return `<span style="font-family:${escapeHtml(f.stack)}">${inner}</span>`;
  });
  s = s.replace(/\{\{hl:([a-z-]+)\}\}([\s\S]+?)\{\{\/hl\}\}/g, (_m, slug, inner) => {
    const h = HIGHLIGHT_BY_VALUE.get(slug);
    if (!h) return inner;
    return `<span style="background-color:${h.color}">${inner}</span>`;
  });
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_m, label, href) => {
    const safe = normalizeSafeUrl(unescapeHtml(href));
    if (!safe) return label;
    return `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.+?)__/g, '<u>$1</u>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  return s;
}

type MdBlock =
  | { kind: 'h'; level: 1 | 2 | 3; text: string }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'ul'; items: { depth: number; text: string }[] }
  | { kind: 'ol'; items: { depth: number; text: string }[] }
  | { kind: 'p'; text: string }
  | { kind: 'empty' };

function parseBlocks(src: string): MdBlock[] {
  const lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
  const out: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      out.push({ kind: 'empty' });
      i += 1;
      continue;
    }
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      out.push({ kind: 'h', level: h[1].length as 1 | 2 | 3, text: h[2] });
      i += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        q.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      out.push({ kind: 'quote', lines: q });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: { depth: number; text: string }[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const m = /^(\s*)[-*]\s+(.*)$/.exec(lines[i])!;
        const depth = Math.min(3, Math.floor(m[1].length / 2));
        items.push({ depth, text: m[2] });
        i += 1;
      }
      out.push({ kind: 'ul', items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: { depth: number; text: string }[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const m = /^(\s*)\d+\.\s+(.*)$/.exec(lines[i])!;
        const depth = Math.min(3, Math.floor(m[1].length / 2));
        items.push({ depth, text: m[2] });
        i += 1;
      }
      out.push({ kind: 'ol', items });
      continue;
    }
    // Paragraph: gather consecutive plain lines
    const para: string[] = [];
    while (
      i < lines.length
      && lines[i].trim()
      && !/^(#{1,3})\s+/.test(lines[i])
      && !/^>\s?/.test(lines[i])
      && !/^\s*[-*]\s+/.test(lines[i])
      && !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    out.push({ kind: 'p', text: para.join('\n') });
  }
  return out;
}

function renderList(tag: 'ul' | 'ol', items: { depth: number; text: string }[]): string {
  // Nested markdown indents → margin on <li> (avoids fragile nested-list HTML).
  const lis = items.map((item) => {
    const pad = Math.max(0, item.depth) * 16;
    return `<li style="margin-left:${pad}px">${inlineMarkdownToHtml(escapeHtml(item.text))}</li>`;
  }).join('');
  return `<${tag}>${lis}</${tag}>`;
}

/**
 * Convert allowlisted markdown (or plain text) to sanitized HTML for learner/editor display.
 */
export function richTextToSafeHtml(src: string): string {
  const blocks = parseBlocks(src);
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.kind === 'empty') continue;
    if (b.kind === 'h') {
      const tag = `h${b.level}`;
      parts.push(`<${tag}>${inlineMarkdownToHtml(escapeHtml(b.text))}</${tag}>`);
      continue;
    }
    if (b.kind === 'quote') {
      const inner = b.lines.map((l) => inlineMarkdownToHtml(escapeHtml(l))).join('<br/>');
      parts.push(`<blockquote>${inner}</blockquote>`);
      continue;
    }
    if (b.kind === 'ul') {
      parts.push(renderList('ul', b.items));
      continue;
    }
    if (b.kind === 'ol') {
      parts.push(renderList('ol', b.items));
      continue;
    }
    if (b.kind === 'p') {
      const html = inlineMarkdownToHtml(escapeHtml(b.text)).replace(/\n/g, '<br/>');
      parts.push(`<p>${html}</p>`);
    }
  }
  return parts.join('') || '<p></p>';
}

/** Strip to plain text (for clear-formatting of whole doc or AI-friendly extract). */
export function richTextToPlain(src: string): string {
  const html = richTextToSafeHtml(src);
  if (typeof document === 'undefined') {
    return String(src || '')
      .replace(/\{\{(?:font|hl):[a-z-]+\}\}|\{\{\/(?:font|hl)\}\}/g, '')
      .replace(/\*\*|__|`/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^#{1,3}\s+/gm, '')
      .replace(/^>\s?/gm, '')
      .replace(/^\s*[-*]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '');
  }
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.innerText || div.textContent || '').replace(/\u00a0/g, ' ').trim();
}

function serializeInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  const tag = el.tagName;
  if (!ALLOWED_TAGS.has(tag) && tag !== 'SPAN') {
    return Array.from(el.childNodes).map(serializeInline).join('');
  }
  const inner = Array.from(el.childNodes).map(serializeInline).join('');
  if (tag === 'STRONG' || tag === 'B') return `**${inner}**`;
  if (tag === 'EM' || tag === 'I') return `*${inner}*`;
  if (tag === 'U') return `__${inner}__`;
  if (tag === 'CODE') return `\`${inner.replace(/`/g, '')}\``;
  if (tag === 'A') {
    const href = normalizeSafeUrl(el.getAttribute('href') || '');
    if (!href) return inner;
    return `[${inner}](${href})`;
  }
  if (tag === 'FONT' || tag === 'SPAN') {
    // execCommand('fontName') yields <font face> in Chrome, styled spans elsewhere;
    // execCommand('hiliteColor') yields spans with background-color.
    if (!inner.trim()) return inner;
    let out = inner;
    const bg = el.style?.backgroundColor || '';
    const hl = bg ? highlightSlugForCss(bg) : null;
    if (hl) out = `{{hl:${hl}}}${out}{{/hl}}`;
    const face = tag === 'FONT' ? (el.getAttribute('face') || '') : (el.style?.fontFamily || '');
    const slug = face ? fontSlugForCss(face) : 'sans';
    if (slug !== 'sans') out = `{{font:${slug}}}${out}{{/font}}`;
    return out;
  }
  if (tag === 'BR') return '\n';
  return inner;
}

function listItemsToMd(list: HTMLElement, ordered: boolean, depth: number): string {
  const pad = '  '.repeat(depth);
  const lines: string[] = [];
  Array.from(list.children).forEach((child, idx) => {
    if ((child as HTMLElement).tagName !== 'LI') return;
    const li = child as HTMLElement;
    const nested: string[] = [];
    let textBits = '';
    Array.from(li.childNodes).forEach((n) => {
      if (n.nodeType === Node.ELEMENT_NODE) {
        const t = (n as HTMLElement).tagName;
        if (t === 'UL' || t === 'OL') {
          nested.push(listItemsToMd(n as HTMLElement, t === 'OL', depth + 1));
          return;
        }
      }
      textBits += serializeInline(n);
    });
    const marker = ordered ? `${idx + 1}. ` : '- ';
    lines.push(`${pad}${marker}${textBits.trim()}`);
    nested.forEach((n) => lines.push(n));
  });
  return lines.join('\n');
}

/**
 * Serialize editor HTML (from contentEditable) back to allowlisted markdown.
 */
export function htmlToRichTextMarkdown(root: HTMLElement): string {
  const chunks: string[] = [];
  const walkBlocks = (parent: HTMLElement) => {
    Array.from(parent.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = (node.textContent || '').trim();
        if (t) chunks.push(t);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      const tag = el.tagName;
      if (tag === 'H1') chunks.push(`# ${serializeInline(el).trim()}`);
      else if (tag === 'H2') chunks.push(`## ${serializeInline(el).trim()}`);
      else if (tag === 'H3') chunks.push(`### ${serializeInline(el).trim()}`);
      else if (tag === 'BLOCKQUOTE') {
        const text = (el.innerText || '').split(/\n/).map((l) => `> ${l}`).join('\n');
        chunks.push(text);
      } else if (tag === 'UL') chunks.push(listItemsToMd(el, false, 0));
      else if (tag === 'OL') chunks.push(listItemsToMd(el, true, 0));
      else if (tag === 'P' || tag === 'DIV') {
        const t = serializeInline(el).replace(/\n+/g, '\n').trim();
        if (t) chunks.push(t);
      } else if (tag === 'BR') {
        // ignore lone br between blocks
      } else {
        const t = serializeInline(el).trim();
        if (t) chunks.push(t);
      }
    });
  };
  walkBlocks(root);
  return chunks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** True when value already contains our markdown markers (not just plain prose). */
export function looksLikeRichMarkdown(src: string): boolean {
  const s = String(src || '');
  return /(\*\*|__|`|\{\{(?:font|hl):|\[.+\]\(https?:|^\s*#{1,3}\s|^\s*[-*]\s|^\s*\d+\.\s|^>\s)/m.test(s);
}
