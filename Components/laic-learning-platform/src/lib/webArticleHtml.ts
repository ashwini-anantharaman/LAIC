/**
 * Annotate sanitized website HTML with data-global-idx spans so Markup can
 * keep website formatting while still supporting sentence-level selection.
 */

function normKey(s: string): string {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Best sentence index whose text equals / contains a heading (prefer shortest). */
function matchSentenceIdx(
  heading: string,
  sentences: { text: string; globalIdx: number }[],
): number | null {
  const h = normKey(heading);
  if (h.length < 2) return null;
  let best: { idx: number; len: number } | null = null;
  for (const s of sentences) {
    const t = normKey(s.text);
    if (!t) continue;
    if (t === h || t.includes(h) || (h.length >= 12 && h.includes(t))) {
      const len = t.length;
      if (!best || len < best.len) best = { idx: s.globalIdx, len };
    }
  }
  return best?.idx ?? null;
}

/**
 * Wrap each sentence occurrence in the article HTML with
 * `<span data-global-idx="N" class="mk-sent …">…</span>`.
 * Spans may be split across tags; each fragment shares the same global idx.
 */
export function annotateWebArticleHtml(
  html: string,
  sentences: { text: string; globalIdx: number }[],
  highlightTagByIdx?: Map<number, string>,
): string {
  if (!html || !sentences.length) return html || '';

  type Part = { type: 'tag' | 'text'; value: string };
  const parts: Part[] = [];
  const re = /(<[^>]+>)|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1]) parts.push({ type: 'tag', value: m[1] });
    else parts.push({ type: 'text', value: m[2] });
  }

  type MapCell = { partIdx: number; offset: number };
  let plain = '';
  const map: MapCell[] = [];
  for (let pi = 0; pi < parts.length; pi += 1) {
    const p = parts[pi];
    if (p.type !== 'text') continue;
    for (let oi = 0; oi < p.value.length; oi += 1) {
      map.push({ partIdx: pi, offset: oi });
      plain += p.value[oi];
    }
  }

  // Build normalized haystack + index map (norm index → plain index)
  const normToPlain: number[] = [];
  let plainNorm = '';
  {
    let pi = 0;
    while (pi < plain.length && /\s/.test(plain[pi])) pi += 1;
    let inSpace = false;
    for (; pi < plain.length; pi += 1) {
      if (/\s/.test(plain[pi])) {
        if (!inSpace) {
          plainNorm += ' ';
          normToPlain.push(pi);
          inSpace = true;
        }
      } else {
        plainNorm += plain[pi];
        normToPlain.push(pi);
        inSpace = false;
      }
    }
    plainNorm = plainNorm.trimEnd();
  }

  type Wrap = { start: number; end: number; globalIdx: number };
  const wraps: Wrap[] = [];
  let searchFrom = 0;
  const hay = plainNorm.toLowerCase();

  for (const s of sentences) {
    const needle = normKey(s.text);
    // Allow short titles/headings (was 8 — dropped most section titles).
    if (needle.length < 2) continue;
    let at = hay.indexOf(needle, searchFrom);
    if (at < 0) at = hay.indexOf(needle);
    if (at < 0) continue;
    const startPlain = normToPlain[at];
    const endNorm = at + needle.length - 1;
    if (startPlain == null || normToPlain[endNorm] == null) continue;
    const endPlain = normToPlain[endNorm] + 1;
    wraps.push({ start: startPlain, end: endPlain, globalIdx: s.globalIdx });
    searchFrom = at + Math.max(1, Math.floor(needle.length * 0.5));
  }

  if (!wraps.length) return html;

  wraps.sort((a, b) => a.start - b.start || b.end - a.end);
  const picked: Wrap[] = [];
  let cursor = 0;
  for (const w of wraps) {
    if (w.start < cursor) continue;
    picked.push(w);
    cursor = w.end;
  }

  // Per text-part: list of { start, end, globalIdx } in local offsets
  const perPart = new Map<number, { start: number; end: number; globalIdx: number }[]>();
  for (const w of picked) {
    for (let pi = w.start; pi < w.end; pi += 1) {
      const cell = map[pi];
      if (!cell) continue;
      const list = perPart.get(cell.partIdx) || [];
      const last = list[list.length - 1];
      if (last && last.globalIdx === w.globalIdx && last.end === cell.offset) {
        last.end = cell.offset + 1;
      } else if (!last || last.globalIdx !== w.globalIdx || cell.offset > last.end) {
        list.push({ start: cell.offset, end: cell.offset + 1, globalIdx: w.globalIdx });
      } else if (last.globalIdx === w.globalIdx) {
        last.end = Math.max(last.end, cell.offset + 1);
      }
      perPart.set(cell.partIdx, list);
    }
  }

  const out: Part[] = [];
  for (let pi = 0; pi < parts.length; pi += 1) {
    const p = parts[pi];
    const ranges = perPart.get(pi);
    if (p.type !== 'text' || !ranges?.length) {
      out.push(p);
      continue;
    }
    ranges.sort((a, b) => a.start - b.start);
    let at = 0;
    for (const r of ranges) {
      if (r.start > at) out.push({ type: 'text', value: p.value.slice(at, r.start) });
      const tag = highlightTagByIdx?.get(r.globalIdx);
      const cls = ['mk-sent', tag ? `mk-tag-${tag.toLowerCase()}` : ''].filter(Boolean).join(' ');
      out.push({ type: 'tag', value: `<span data-global-idx="${r.globalIdx}" class="${cls}">` });
      out.push({ type: 'text', value: p.value.slice(r.start, r.end) });
      out.push({ type: 'tag', value: '</span>' });
      at = r.end;
    }
    if (at < p.value.length) out.push({ type: 'text', value: p.value.slice(at) });
  }

  let annotated = out.map((p) => p.value).join('');

  // Second pass: wrap heading text (h1–h6) that still has no data-global-idx so titles are selectable.
  annotated = annotated.replace(
    /<(h[1-6])(\b[^>]*)?>([\s\S]*?)<\/\1>/gi,
    (full, tag: string, attrs = '', inner: string) => {
      if (/data-global-idx=/i.test(inner)) return full;
      const plain = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const idx = matchSentenceIdx(plain, sentences);
      if (idx == null) return full;
      const tagName = highlightTagByIdx?.get(idx);
      const cls = ['mk-sent', tagName ? `mk-tag-${tagName.toLowerCase()}` : ''].filter(Boolean).join(' ');
      // Wrap only text runs inside the heading; keep nested tags.
      const wrappedInner = inner.replace(/([^<]+)/g, (chunk) => {
        if (!chunk.trim()) return chunk;
        return `<span data-global-idx="${idx}" class="${cls}">${chunk}</span>`;
      });
      return `<${tag}${attrs || ''}>${wrappedInner}</${tag}>`;
    },
  );

  return annotated;
}
