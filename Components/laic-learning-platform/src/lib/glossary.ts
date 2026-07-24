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
  'in', 'on', 'at', 'to', 'for', 'of', 'by', 'with', 'from', 'as', 'into',
  'over', 'under', 'about', 'after', 'before', 'between', 'through', 'during',
  'and', 'or', 'but', 'if', 'when', 'while', 'where', 'whereas', 'although',
  'though', 'because', 'since', 'until', 'unless', 'whether', 'than', 'then',
  'so', 'thus', 'hence', 'here', 'there', 'now', 'also', 'only', 'even',
  'just', 'still', 'yet', 'already', 'always', 'never', 'often', 'sometimes',
  'however', 'therefore', 'moreover', 'furthermore', 'meanwhile', 'instead',
  'indeed', 'rather', 'quite', 'very', 'more', 'most', 'less', 'many', 'much',
  'such', 'other', 'another', 'both', 'all', 'few', 'several', 'own',
  'it', 'its', 'they', 'them', 'we', 'us', 'he', 'she', 'you', 'i', 'one',
  'what', 'which', 'who', 'whom', 'whose', 'how', 'why',
]);

const TRAILING_STOP = new Set([
  'of', 'the', 'a', 'an', 'to', 'for', 'in', 'on', 'at', 'by', 'with', 'from',
  'and', 'or', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
]);

/** Single tokens that are almost never glossary headwords. */
const WEAK_SINGLE = new Set([
  'joins', 'join', 'uses', 'use', 'makes', 'make', 'takes', 'take', 'gives',
  'simple', 'simplest', 'basic', 'important', 'common', 'general', 'specific',
  'example', 'note', 'see', 'also', 'figure', 'page', 'section', 'chapter',
  'journal', 'proceedings', 'volume', 'issue', 'doi', 'http', 'https', 'www',
  'increasing', 'decreasing', 'using', 'making', 'taking', 'giving', 'showing',
  'helping', 'allowing', 'creating', 'providing', 'including', 'following',
  'according', 'regarding', 'concerning', 'involving', 'resulting', 'leading',
  'interestingly', 'importantly', 'similarly', 'conversely', 'finally',
  'first', 'second', 'third', 'next', 'last', 'later', 'earlier', 'recently',
  'typically', 'usually', 'generally', 'specifically', 'particularly',
  'essentially', 'basically', 'clearly', 'notably', 'surprisingly',
  'although', 'however', 'therefore', 'moreover', 'furthermore', 'nevertheless',
  'language', 'research', 'studies', 'study', 'paper', 'article', 'authors',
  'results', 'methods', 'discussion', 'introduction', 'conclusion', 'abstract',
  'figure', 'table', 'appendix', 'references', 'reference', 'et', 'al',
  'human', 'humans', 'people', 'babies', 'children', 'adults',
  'just', 'it', 'its', 'they', 'we', 'one', 'this', 'that',
]);

/** Title-case runs often continue into verbs when PDF sentences lack punctuation. */
const TITLE_RUN_STOP = new Set([
  'joins', 'join', 'makes', 'make', 'takes', 'take', 'uses', 'use', 'gives', 'give',
  'shows', 'show', 'helps', 'help', 'allows', 'allow', 'forms', 'form', 'creates',
  'create', 'holds', 'hold', 'ties', 'tie', 'works', 'work', 'loosens', 'loosen',
  'pulls', 'pull', 'keeps', 'keep', 'lets', 'let', 'provides', 'provide', 'means',
  'refers', 'called', 'known', 'used', 'defined', 'describes', 'describe',
  'increasing', 'decreasing', 'using', 'involving', 'including', 'following',
]);

function cleanSpaces(s: string): string {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function stripQuotes(s: string): string {
  return s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
}

function isAcronym(word: string): boolean {
  return /^[A-Z]{2,6}$/.test(word) || /^[A-Z]{2,6}s$/.test(word);
}

function isDiscourseAdverb(word: string): boolean {
  const w = word.toLowerCase().replace(/[^a-z-]/g, '');
  if (WEAK_SINGLE.has(w) || LEADING_STOP.has(w)) return true;
  // Sentence-adverb style: Interestingly, Importantly, …
  if (w.length >= 6 && w.endsWith('ly')) return true;
  return false;
}

/**
 * Term is just the opening of the same sentence (not a real headword + definition).
 * Allow when the remainder looks definitional (—, :, is/are/means…).
 */
export function isSentenceOpenerTerm(term: string, definition: string): boolean {
  const t = stripQuotes(cleanSpaces(term));
  const def = cleanSpaces(definition);
  if (!t || !def) return false;
  if (!def.toLowerCase().startsWith(t.toLowerCase())) return false;
  const rest = def.slice(t.length).trim();
  // "Term — definition" / "Term: definition" / "Term is …"
  if (/^(—|–|:|\(|is\b|are\b|means\b|refers\b|denotes\b|describes\b)/i.test(rest)) return false;
  // Comma / prose continuation → sentence opener, not vocab
  if (/^[,;]/.test(rest) || /^(the|a|an|of|to|for|in|on|at|by|with|as|that|which|who)\b/i.test(rest)) {
    return true;
  }
  // "Term word word…" with no definitional cue
  if (rest.length > 0 && !/^(—|–|:)/.test(rest)) return true;
  return false;
}

/** True when a candidate looks like a real vocab headword, not a sentence stub. */
export function isValidVocabTerm(term: string): boolean {
  const t = stripQuotes(cleanSpaces(term));
  if (!t) return false;
  const words = t.split(/\s+/);
  if (words.length < 1 || words.length > 5) return false;
  if (t.length < 2 || t.length > 48) return false;
  if (/[.!?]$/.test(t)) return false;
  if (/^(the|a|an)\s/i.test(t)) return false;

  const firstRaw = words[0].replace(/[^A-Za-z0-9-]/g, '');
  const lastRaw = words[words.length - 1].replace(/[^A-Za-z0-9-]/g, '');
  const first = firstRaw.toLowerCase();
  const last = lastRaw.toLowerCase();

  if (!first || !last) return false;
  if (LEADING_STOP.has(first)) return false;
  if (TRAILING_STOP.has(last)) return false;
  if (isDiscourseAdverb(firstRaw) && words.length === 1) return false;
  if (words.length === 1 && WEAK_SINGLE.has(first)) return false;
  if (!/[A-Za-z]/.test(t)) return false;

  // Single common English-looking tokens need to look technical:
  // acronym (LTP, GABA) or hyphenated compound (long-term) or mixed technical form.
  if (words.length === 1) {
    if (isAcronym(firstRaw)) return true;
    if (firstRaw.includes('-') && firstRaw.length >= 5) return true;
    // Reject bare sentence-capitalized words (Increasing, Journal, Language, Just)
    if (/^[A-Z][a-z]+$/.test(firstRaw) && firstRaw.length <= 14) {
      // Allow longer scientific-looking singles (Inhibition, Plasticity, Synapse…)
      // only when not in weak list and length suggests a content noun (≥ 8) without -ing/-ly
      if (first.endsWith('ing') || first.endsWith('ly')) return false;
      if (firstRaw.length < 8) return false;
    }
  }

  // Multi-word: reject "In LTP", "The Journal", etc. (leading stop already covers)
  // Reject citation-ish phrases
  if (/\b(journal|proceedings|volume|doi)\b/i.test(t)) return false;

  const caps = words.filter((w) => /^[A-Z]/.test(w)).length;
  if (words.length >= 3 && caps === 0) return false;
  return true;
}

/** Normalize to a singular-ish display form (light heuristic, not full NLP). */
export function singularizeTerm(term: string): string {
  const t = stripQuotes(cleanSpaces(term));
  const words = t.split(/\s+/);
  const last = words[words.length - 1];
  if (/^[A-Z]{2,}$/.test(last)) return t;
  let stem = last;
  if (/ies$/i.test(stem) && stem.length > 4) stem = stem.slice(0, -3) + (stem.endsWith('IES') ? 'Y' : 'y');
  else if (/(ches|shes|xes|zes|sses)$/i.test(stem) && stem.length > 4) stem = stem.slice(0, -2);
  else if (/s$/i.test(stem) && !/ss$/i.test(stem) && stem.length > 3) stem = stem.slice(0, -1);
  words[words.length - 1] = stem;
  return words.join(' ');
}

/**
 * Pull Title-Case / hyphenated concept names from passage text.
 * Prefers multi-word technical phrases and acronyms; skips sentence openers.
 */
export function extractTitleCaseTerms(text: string, opts?: { allowSingles?: boolean }): string[] {
  const allowSingles = opts?.allowSingles ?? false;
  const t = cleanSpaces(text);
  if (!t) return [];
  const found: string[] = [];
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
      if (TITLE_RUN_STOP.has(low) || LEADING_STOP.has(low) || isDiscourseAdverb(tokens[i])) break;
      run.push(tokens[i]);
      i += 1;
      if (run.length >= 5) break;
    }
    if (i < tokens.length && /^[A-Z]/.test(tokens[i])) {
      const low = tokens[i].toLowerCase();
      if (TITLE_RUN_STOP.has(low) || LEADING_STOP.has(low) || isDiscourseAdverb(tokens[i])) i += 1;
    }
    if (!run.length) continue;
    // From free prose, prefer multi-word terms or acronyms — not "Interestingly"
    if (run.length === 1 && !allowSingles && !isAcronym(run[0])) continue;

    const raw = run.join(' ').replace(/^(The|A|An)\s+/i, '');
    const cand = singularizeTerm(raw);
    if (isValidVocabTerm(cand)) found.push(cand);
  }
  found.sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length || b.length - a.length);
  return found;
}

function hasDefinitionalCue(text: string): boolean {
  return /\b(is defined as|is known as|is called|refers to|means|denotes|is an?|are)\b|[—–:]/.test(text);
}

/** Pull a term + definition out of a free-text Definition unit. */
export function splitDefinitionText(text: string): { term: string; definition: string } {
  const t = cleanSpaces(text);
  if (!t) return { term: '', definition: '' };

  const patterns: RegExp[] = [
    /^["“](.+?)["”]\s*(?:—|–|:|\(|is\b)\s*(.+)$/i,
    /^([A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*){0,4})\s*(?:—|–|:)\s+(.+)$/,
    /^([A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*){0,4})\s+(?:is defined as|means|refers to|is called|is known as|denotes)\s+(.+)$/i,
    // Only allow "X is …" when X does not look like a discourse opener
    /^([A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*){0,4})\s+(?:is|are)\s+(.+)$/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (!m) continue;
    const term = singularizeTerm(m[1]);
    const definition = cleanSpaces(m[2]);
    if (!isValidVocabTerm(term) || definition.length < 6) continue;
    if (isSentenceOpenerTerm(term, t)) continue;
    if (LEADING_STOP.has(term.split(/\s+/)[0].toLowerCase())) continue;
    return { term, definition };
  }

  // Passage blob: only multi-word / acronym title-case concepts when definitional
  if (hasDefinitionalCue(t)) {
    const titled = extractTitleCaseTerms(t, { allowSingles: true });
    for (const cand of titled) {
      if (isSentenceOpenerTerm(cand, t)) continue;
      return { term: cand, definition: t };
    }
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
  for (const p of parts) {
    const hay = [p.heading, p.body, p.plain, p.concept, p.prompt].filter(Boolean).join(' ').toLowerCase();
    if (hay.includes(needle)) return p.id;
  }
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
    if (isSentenceOpenerTerm(term, entry.definition || entry.excerpt || '')) return;
    const key = term.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...entry, term });
  };

  const units = opts.knowledgeBase?.units || [];
  for (const u of units) {
    // Only Definition units are glossary sources by default.
    // Key points only if they clearly define a term.
    if (u.kind !== 'Definition' && u.kind !== 'Key point') continue;
    if (u.kind === 'Key point' && !hasDefinitionalCue(u.text)) continue;

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
    }
    // No fallback harvest of every capitalized word from the unit —
    // that was filling the glossary with sentence openers.
  }

  // Highlights: only multi-word technical phrases or acronyms in definitional sentences
  for (const h of opts.highlights || []) {
    const text = h.text || '';
    if (!hasDefinitionalCue(text)) continue;
    const terms = extractTitleCaseTerms(text, { allowSingles: true }).filter((t) => {
      const words = t.split(/\s+/);
      return words.length >= 2 || isAcronym(words[0]);
    });
    for (let i = 0; i < Math.min(2, terms.length); i++) {
      const t = terms[i];
      push({
        id: `hl-${h.idx ?? 'x'}-${i}`,
        term: t,
        definition: cleanSpaces(text),
        sourceHighlightIds: typeof h.idx === 'number' ? [h.idx] : undefined,
        blockId: resolveBlockId(t, opts),
        excerpt: cleanSpaces(text).slice(0, 220),
        page: h.page,
      });
    }
  }

  for (const p of opts.parts || []) {
    if (p.type !== 'concept-card') continue;
    const term = singularizeTerm(String(p.concept || p.label || '').trim());
    const definition = cleanSpaces(String(p.plain || '').trim());
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
    const definition = cleanSpaces(String(c.oneSentenceMeaning || c.definition || ''));
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
