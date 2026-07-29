/**
 * Attach grounded “FROM YOUR SOURCES” quotes to MCQ questions from the knowledge base.
 */

/**
 * @param {unknown} raw
 * @returns {{ quote: string, cite: string }[] | undefined}
 */
export function normalizeMcqSources(raw) {
  if (!Array.isArray(raw)) return undefined;
  const sources = raw
    .map((s) => {
      if (!s || typeof s !== 'object') return null;
      const quote = String(s.quote || s.text || '').trim();
      const cite = String(s.cite || s.from || s.source || '').trim();
      if (!quote && !cite) return null;
      return { quote, cite };
    })
    .filter(Boolean);
  return sources.length ? sources : undefined;
}

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

function clipQuote(text, max = 180) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > 80 ? cut.slice(0, sp) : cut).trim()}…`;
}

function citeForUnit(u) {
  const from = String(u?.from || '').trim();
  if (from) return from;
  const label = String(u?.sourceLabel || '').trim();
  return label || 'Source';
}

/**
 * Pick 1–3 units that best support a question (overlap with prompt / explanation / correct option).
 * @param {{ question?: string, prompt?: string, explanation?: string, exp?: string, options?: string[], correct?: number }} q
 * @param {Array<{ id?: string, text?: string, from?: string, sourceLabel?: string, kind?: string }>} units
 * @param {{ limit?: number }} [opts]
 * @returns {{ quote: string, cite: string }[]}
 */
export function pickSourcesForQuestion(q, units, opts = {}) {
  const limit = Math.max(1, Math.min(3, Number(opts.limit ?? 3)));
  const list = Array.isArray(units) ? units.filter((u) => String(u?.text || '').trim()) : [];
  if (!list.length) return [];

  const correctOpt =
    Array.isArray(q?.options) && typeof q.correct === 'number' ? q.options[q.correct] : '';
  const hay = [
    q?.question || q?.prompt || '',
    q?.explanation || q?.exp || '',
    correctOpt || '',
  ].join(' ');
  const qTokens = new Set(tokens(hay));
  if (!qTokens.size) {
    return list.slice(0, limit).map((u) => ({
      quote: clipQuote(u.text),
      cite: citeForUnit(u),
    }));
  }

  const scored = list.map((u) => {
    const ut = tokens(u.text);
    let score = 0;
    for (const w of ut) {
      if (qTokens.has(w)) score += 1;
    }
    // Prefer definition / principle / key-fact style units slightly
    const kind = String(u.kind || '').toLowerCase();
    if (/defin|principle|fact|rule|concept/.test(kind)) score += 0.5;
    return { u, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const picked = scored.filter((x) => x.score > 0).slice(0, limit);
  const fallback = picked.length ? picked : scored.slice(0, limit);

  const out = [];
  const seen = new Set();
  for (const { u } of fallback) {
    const quote = clipQuote(u.text);
    const cite = citeForUnit(u);
    const key = `${quote}::${cite}`.toLowerCase();
    if (!quote || seen.has(key)) continue;
    seen.add(key);
    out.push({ quote, cite });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Ensure a single question object has sources (mutate-safe: returns new object fields).
 * @param {object} q
 * @param {Array<object>} units
 */
export function ensureQuestionSources(q, units) {
  if (!q || typeof q !== 'object') return q;
  const existing = normalizeMcqSources(q.sources);
  if (existing?.length) return { ...q, sources: existing };
  const picked = pickSourcesForQuestion(q, units);
  if (!picked.length) return q;
  return { ...q, sources: picked };
}

/**
 * After tutorial generate: attach sources to every question / section-quiz item missing them.
 * @param {any[]} parts
 * @param {{ units?: any[] } | null | undefined} knowledgeBase
 */
export function attachSourcesToQuestionParts(parts, knowledgeBase) {
  const units = knowledgeBase?.units || [];
  if (!Array.isArray(parts) || !units.length) return parts || [];

  return parts.map((p) => {
    if (!p || typeof p !== 'object') return p;
    if (p.type === 'section-quiz' && Array.isArray(p.questions)) {
      return {
        ...p,
        questions: p.questions.map((q) => ensureQuestionSources(q, units)),
      };
    }
    if (p.type === 'question') {
      return ensureQuestionSources(p, units);
    }
    return p;
  });
}

/**
 * Enrich quiz question arrays used in learner preview blocks.
 * @param {any[]} questions
 * @param {Array<object>} units
 */
export function enrichQuizQuestionsWithSources(questions, units) {
  if (!Array.isArray(questions) || !units?.length) return questions || [];
  return questions.map((q) => ensureQuestionSources(q, units));
}
