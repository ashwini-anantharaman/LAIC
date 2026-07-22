/**
 * Progressive knowledge-check hints (configurable count), used by generate + learner UI.
 */

/**
 * @param {unknown} raw
 * @param {{ sectionTitle?: string, explanation?: string, singleHint?: string, count?: number, enabled?: boolean }} [ctx]
 * @returns {string[]}
 */
export function ensureHints(raw, ctx = {}) {
  const enabled = ctx.enabled !== false;
  const count = enabled ? Math.max(0, Math.min(6, Number(ctx.count ?? 4))) : 0;
  if (count <= 0) return [];

  const out = [];
  const push = (s) => {
    const t = String(s || '').trim();
    if (!t) return;
    if (out.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    if (out.length < count) out.push(t);
  };

  if (Array.isArray(raw)) {
    for (const h of raw) push(h);
  } else if (typeof raw === 'string') {
    push(raw);
  }
  push(ctx.singleHint);

  const section = String(ctx.sectionTitle || '').trim();
  const exp = String(ctx.explanation || '').trim();

  push(
    section
      ? `Re-read “${section}” in the passage above — the answer is stated or strongly implied there.`
      : 'Re-read the teaching passage just above this check before choosing again.',
  );
  push('Eliminate any option that contradicts a fact you just read in that section.');
  push(
    section
      ? `Look for the key definition, rule, or example under “${section}” and match it to the options.`
      : 'Focus on the key definition or worked example in the preceding paragraphs.',
  );
  push(
    exp
      ? `Final nudge: ${exp.length > 140 ? `${exp.slice(0, 137)}…` : exp}`
      : 'Compare each remaining option to the main idea of the section you just studied.',
  );

  while (out.length < count) {
    push(`Hint ${out.length + 1}: revisit the material above and try again.`);
  }
  return out.slice(0, count);
}

/** @deprecated Prefer ensureHints — kept for call-site compatibility. */
export function ensureFourHints(raw, ctx = {}) {
  return ensureHints(raw, { ...ctx, count: ctx.count ?? 4 });
}

/**
 * Walk tutorial parts; attach hints to each question using the nearest section heading.
 * @param {any[]} parts
 * @param {{ enabled?: boolean, count?: number }} [opts]
 * @returns {any[]}
 */
export function attachHintsToQuestionParts(parts, opts = {}) {
  if (!Array.isArray(parts)) return parts || [];
  const enabled = opts.enabled !== false;
  const count = enabled ? Math.max(0, Math.min(6, Number(opts.count ?? 4))) : 0;
  let lastSection = '';
  return parts.map((p) => {
    if (!p) return p;
    if (p.type === 'rich-text' && typeof p.heading === 'string' && p.heading.trim()) {
      const h = p.heading.trim();
      const low = h.toLowerCase();
      if (low !== 'introduction' && !/^(recap|summary|closing|conclusion)/i.test(low)) {
        lastSection = h;
      }
    }
    if (p.type !== 'question') return p;
    if (!enabled || count <= 0) {
      const { hints: _drop, ...rest } = p;
      return { ...rest, hints: [] };
    }
    return {
      ...p,
      hints: ensureHints(p.hints, {
        sectionTitle: lastSection,
        explanation: p.exp || p.explanation,
        singleHint: p.hint,
        count,
        enabled: true,
      }),
    };
  });
}

/** Normalize hints on a saved quiz question for learner display. */
export function hintsForQuestion(q, opts = {}) {
  const sectionTitle = typeof opts === 'string' ? opts : (opts.sectionTitle || '');
  const ctx = typeof opts === 'string' ? { sectionTitle } : opts;
  if (!q) return ensureHints([], ctx);
  return ensureHints(q.hints, {
    ...ctx,
    sectionTitle,
    explanation: q.explanation || q.exp,
    singleHint: q.hint,
  });
}

/** Parse Define pass mark like "70%" → 70. */
export function parsePassMark(v, fallback = 70) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.min(100, v));
  const n = parseInt(String(v || '').replace('%', ''), 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback;
}

/** Resolve hint settings from Define / fv. */
export function resolveHintSettings(fv = {}) {
  const hintsOn = fv.hintsOn !== false && fv.hintsOn !== 'No';
  const hintN = typeof fv.hintN === 'number' ? fv.hintN : 4;
  const count = hintsOn ? Math.max(0, Math.min(6, hintN)) : 0;
  return { hintsOn: count > 0, hintN: count, enabled: count > 0, count };
}
