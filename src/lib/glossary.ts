import type { ClusteredKnowledgeBase, ContentUnit } from './types';

export interface GlossaryEntry {
  id: string;
  term: string;
  definition: string;
  /** Mark-up sentence indices for jump-to-passage in the source. */
  sourceHighlightIds?: number[];
  /** Tutorial part / block id to scroll to when reading the object. */
  blockId?: string;
  /** Short passage snippet for context. */
  excerpt?: string;
  page?: number;
}

const LEADING_STOP = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'its', 'their', 'our',
  'his', 'her', 'my', 'your', 'some', 'any', 'each', 'every', 'no',
]);

const TRAILING_STOP = new Set([
  'of', 'the', 'a', 'an', 'to', 'for', 'in', 'on', 'at', 'by', 'with', 'from',
  'and', 'or', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
]);

const WEAK_SINGLE = new Set([
  'joins', 'join', 'uses', 'use', 'makes', 'make', 'takes', 'take', 'gives',
  'simple', 'simplest', 'basic', 'important', 'common', 'general', 'specific',
  'example', 'note', 'see', 'also', 'figure', 'page', 'section', 'chapter',
]);

/** Title-case runs often continue into verbs when PDF sentences lack punctuation. */
const TITLE_RUN_STOP = new Set([
  'joins', 'join', 'makes', 'make', 'takes', 'take', 'uses', 'use', 'gives', 'give',
  'shows', 'show', 'helps', 'help', 'allows', 'allow', 'forms', 'form', 'creates',
  'create', 'holds', 'hold', 'ties', 'tie', 'works', 'work', 'loosens', 'loosen',
  'pulls', 'pull', 'keeps', 'keep', 'lets', 'let', 'provides', 'provide', 'means',
  'refers', 'called', 'known', 'used', 'defined', 'describes', 'describe',
]);

function cleanSpaces(s: string): string {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function stripQuotes(s: string): string {
  return s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
}

/** True when a candidate looks like a real vocab headword, not a sentence stub. */
export function isValidVocabTerm(term: string): boolean {
  const t = stripQuotes(cleanSpaces(term));
  if (!t) return false;
  const words = t.split(/\s+/);
  if (words.length < 1 || words.length > 5) return false;
  if (t.length < 2 || t.length > 48) return false;
  // Reject sentence fragments / stubs
  if (/[.!?]$/.test(t)) return false;
  if (/^(the|a|an)\s/i.test(t) && words.length <= 3) return false;
  const first = words[0].toLowerCase().replace(/[^a-z0-9-]/g, '');
  const last = words[words.length - 1].toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (LEADING_STOP.has(first) && words.length <= 2) return false;
  if (TRAILING_STOP.has(last)) return false;
  if (words.length === 1 && WEAK_SINGLE.has(first)) return false;
  // Must contain a letter
  if (!/[A-Za-z]/.test(t)) return false;
  // Reject mostly-lowercase prose openings like "the simplest of"
  const caps = words.filter((w) => /^[A-Z]/.test(w)).length;
  if (words.length >= 3 && caps === 0) return false;
  return true;
}

/** Normalize to a singular-ish display form (light heuristic, not full NLP). */
export function singularizeTerm(term: string): string {
  const t = stripQuotes(cleanSpaces(term));
  const words = t.split(/\s+/);
  const last = words[words.length - 1];
  // Keep short acronyms / all-caps
  if (/^[A-Z]{2,}$/.test(last)) return t;
  // Common -ies → -y, -es, -s (conservative)
  let stem = last;
  if (/ies$/i.test(stem) && stem.length > 4) stem = stem.slice(0, -3) + (stem.endsWith('IES') ? 'Y' : 'y');
  else if (/(ches|shes|xes|zes|sses)$/i.test(stem) && stem.length > 4) stem = stem.slice(0, -2);
  else if (/s$/i.test(stem) && !/ss$/i.test(stem) && stem.length > 3) stem = stem.slice(0, -1);
  words[words.length - 1] = stem;
  return words.join(' ');
}

/**
 * Pull Title-Case / hyphenated concept names from passage text.
 * e.g. "…the Single-Strand Stopper Knots Joins…" → "Single-Strand Stopper Knot"
 */
export function extractTitleCaseTerms(text: string): string[] {
  const t = cleanSpaces(text);
  if (!t) return [];
  const found: string[] = [];
  // Tokenize preserving hyphenated Caps words
  const tokens = t.match(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g) || [];
  let i = 0;
  while (i < tokens.length) {
    if (!/^[A-Z]/.test(tokens[i])) {
      i += 1;
      continue;
    }
    const run: string[] = [];
    while (i < tokens.length && /^[A-Z]/.test(tokens[i])) {
      const low = tokens[i].toLowerCase();
      if (TITLE_RUN_STOP.has(low) || LEADING_STOP.has(low)) break;
      run.push(tokens[i]);
      i += 1;
      if (run.length >= 5) break;
    }
    // Skip the stopped token so we don't restart on "Joins"
    if (i < tokens.length && /^[A-Z]/.test(tokens[i])) {
      const low = tokens[i].toLowerCase();
      if (TITLE_RUN_STOP.has(low) || LEADING_STOP.has(low)) i += 1;
    }
    if (!run.length) continue;
    let raw = run.join(' ').replace(/^(The|A|An)\s+/i, '');
    const cand = singularizeTerm(raw);
    if (isValidVocabTerm(cand)) found.push(cand);
  }
  found.sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length || b.length - a.length);
  return found;
}

/** Pull a term + definition out of a free-text Definition unit. */
export function splitDefinitionText(text: string): { term: string; definition: string } {
  const t = cleanSpaces(text);
  if (!t) return { term: '', definition: '' };

  const patterns: RegExp[] = [
    /^["“](.+?)["”]\s*(?:—|–|:|\(|is\b)\s*(.+)$/i,
    /^([A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*){0,4})\s*(?:—|–|:)\s+(.+)$/,
    /^([A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*){0,4})\s+(?:is defined as|means|refers to|is called|is known as)\s+(.+)$/i,
    /^([A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*){0,4})\s+(?:is|are)\s+(.+)$/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (!m) continue;
    const term = singularizeTerm(m[1]);
    const definition = cleanSpaces(m[2]);
    if (isValidVocabTerm(term) && definition.length >= 6) {
      return { term, definition };
    }
  }

  // Passage blob: take the best Title-Case concept name, keep full text as definition
  const titled = extractTitleCaseTerms(t);
  if (titled[0]) {
    return { term: titled[0], definition: t };
  }

  return { term: '', definition: '' };
}

function findBlockIdForTerm(
  term: string,
  parts: { id: string; type?: string; body?: string; concept?: string; plain?: string; prompt?: string; heading?: string }[],
): string | undefined {
  const needle = term.toLowerCase();
  if (!needle) return undefined;
  for (const p of parts) {
    if (p.type === 'concept-card' && String(p.concept || '').toLowerCase() === needle) return p.id;
  }
  // Prefer exact-ish concept match, then first passage containing the term
  for (const p of parts) {
    const hay = [p.heading, p.body, p.plain, p.concept, p.prompt].filter(Boolean).join(' ').toLowerCase();
    if (hay.includes(needle)) return p.id;
  }
  // Soft match last word (e.g. "knot")
  const last = needle.split(/\s+/).pop() || '';
  if (last.length >= 4) {
    for (const p of parts) {
      const hay = [p.heading, p.body, p.plain, p.concept].filter(Boolean).join(' ').toLowerCase();
      if (hay.includes(last)) return p.id;
    }
  }
  return undefined;
}

function findBlockIdInBlocks(
  term: string,
  blocks: { id: string; type: string; content: any }[],
): string | undefined {
  const needle = term.toLowerCase();
  if (!needle) return undefined;
  for (const b of blocks) {
    if (b.type === 'concept-card') {
      const c = b.content || {};
      if (String(c.term || '').toLowerCase() === needle) return b.id;
    }
  }
  for (const b of blocks) {
    const c = b.content || {};
    const hay = [
      c.text, c.heading, c.term, c.definition, c.question,
      ...(Array.isArray(c.questions) ? c.questions.map((q: any) => q.question) : []),
    ].filter(Boolean).join(' ').toLowerCase();
    if (hay.includes(needle)) return b.id;
  }
  return undefined;
}

function resolveBlockId(
  term: string,
  opts: {
    parts?: { id: string; type?: string; body?: string; concept?: string; plain?: string; prompt?: string; heading?: string }[];
    blocks?: { id: string; type: string; content: any }[];
  },
): string | undefined {
  if (opts.parts) return findBlockIdForTerm(term, opts.parts);
  if (opts.blocks) return findBlockIdInBlocks(term, opts.blocks);
  return undefined;
}

/**
 * Build a glossary of singular vocabulary headwords from extracts + concept cards.
 * Each entry ties back to a source excerpt and/or a tutorial part.
 */
export function buildGlossary(opts: {
  knowledgeBase?: ClusteredKnowledgeBase | null;
  parts?: { id: string; type?: string; body?: string; concept?: string; plain?: string; prompt?: string; heading?: string; label?: string }[];
  blocks?: { id: string; type: string; content: any }[];
  highlights?: { idx?: number; text?: string; page?: number }[];
}): GlossaryEntry[] {
  const out: GlossaryEntry[] = [];
  const seen = new Set<string>();

  const push = (entry: GlossaryEntry) => {
    const term = singularizeTerm(entry.term);
    if (!isValidVocabTerm(term)) return;
    const key = term.toLowerCase();
    if (seen.has(key)) return;
    // Drop shorter terms that are substrings of an already-kept longer term only if identical key —
    // allow both "knot" and "stopper knot" when distinct.
    seen.add(key);
    out.push({ ...entry, term });
  };

  const units = opts.knowledgeBase?.units || [];
  for (const u of units) {
    if (u.kind !== 'Definition' && u.kind !== 'Key point') continue;
    if (u.kind === 'Key point' && !/\b(is|means|refers|defined|:|—|–)\b/i.test(u.text)
      && extractTitleCaseTerms(u.text).length === 0) {
      continue;
    }

    const hlIdx = u.sourceHighlightIds?.[0];
    const hl = typeof hlIdx === 'number'
      ? opts.highlights?.find((h) => h.idx === hlIdx)
      : undefined;
    const excerpt = cleanSpaces(hl?.text || u.text).slice(0, 220);
    const page = hl?.page || (typeof u.from === 'string' && /p\.?\s*(\d+)/i.test(u.from)
      ? Number(u.from.match(/p\.?\s*(\d+)/i)?.[1])
      : undefined);

    const { term, definition } = splitDefinitionText(u.text);
    if (term) {
      push({
        id: u.id,
        term,
        definition: definition || u.text,
        sourceHighlightIds: u.sourceHighlightIds,
        blockId: resolveBlockId(term, opts),
        excerpt,
        page,
      });
      continue;
    }

    // Fallback: harvest every solid Title-Case term in the unit / highlight
    const pool = extractTitleCaseTerms(`${u.text} ${hl?.text || ''}`);
    for (let i = 0; i < Math.min(3, pool.length); i++) {
      const t = pool[i];
      push({
        id: `${u.id}-${i}`,
        term: t,
        definition: cleanSpaces(u.text),
        sourceHighlightIds: u.sourceHighlightIds,
        blockId: resolveBlockId(t, opts),
        excerpt,
        page,
      });
    }
  }

  // Also scan marked-up source sentences for named concepts (vocab in the passage)
  for (const h of opts.highlights || []) {
    const terms = extractTitleCaseTerms(h.text || '');
    for (let i = 0; i < Math.min(2, terms.length); i++) {
      const t = terms[i];
      push({
        id: `hl-${h.idx ?? 'x'}-${i}`,
        term: t,
        definition: cleanSpaces(h.text || ''),
        sourceHighlightIds: typeof h.idx === 'number' ? [h.idx] : undefined,
        blockId: resolveBlockId(t, opts),
        excerpt: cleanSpaces(h.text || '').slice(0, 220),
        page: h.page,
      });
    }
  }

  for (const p of opts.parts || []) {
    if (p.type !== 'concept-card') continue;
    const term = singularizeTerm(String(p.concept || p.label || ''));
    const definition = cleanSpaces(String(p.plain || ''));
    if (!term || !definition) continue;
    push({
      id: `cc-${p.id}`,
      term,
      definition,
      blockId: p.id,
      excerpt: definition.slice(0, 220),
    });
  }
  for (const b of opts.blocks || []) {
    if (b.type !== 'concept-card') continue;
    const c = b.content || {};
    const term = singularizeTerm(String(c.term || ''));
    const definition = cleanSpaces(String(c.definition || ''));
    if (!term || !definition) continue;
    push({
      id: `cc-${b.id}`,
      term,
      definition,
      blockId: b.id,
      excerpt: definition.slice(0, 220),
    });
  }

  out.sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: 'base' }));
  return out;
}

/** Highlight units that are glossary-worthy (for extract UI counts). */
export function glossaryUnits(kb: ClusteredKnowledgeBase | null | undefined): ContentUnit[] {
  if (!kb?.units) return [];
  return kb.units.filter((u) => u.kind === 'Definition');
}
