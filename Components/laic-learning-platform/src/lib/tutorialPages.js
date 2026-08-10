/**
 * Split tutorial blocks into learner pages.
 * Prefer author hard breaks (Structure page grouping); otherwise word-budget auto-split.
 */

function wordsInText(s) {
  const t = String(s || '').trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

/** Rough word weight for a block (teaching text counts; quizzes count lightly). */
export function blockWordWeight(block) {
  if (!block || typeof block !== 'object') return 0;
  const c = block.content || {};
  switch (block.type) {
    case 'rich-text':
      return wordsInText(c.text)
        + wordsInText(c.heading)
        + wordsInText(Array.isArray(c.subheads) ? c.subheads.join(' ') : '');
    case 'concept-card':
      return wordsInText(c.term) + wordsInText(c.definition) + wordsInText(c.example);
    case 'quiz': {
      const qs = Array.isArray(c.questions) ? c.questions : [];
      return qs.reduce((n, q) => n + wordsInText(q.question) + wordsInText((q.options || []).join(' ')), 0);
    }
    case 'question':
      return wordsInText(c.question || c.prompt) + wordsInText((c.options || []).join(' '));
    case 'summary':
      return wordsInText(c.overview) + wordsInText((c.keyPoints || []).join(' '));
    default:
      return 40; // media / other — small fixed weight
  }
}

export function countBlocksWords(blocks) {
  return (blocks || []).reduce((n, b) => n + blockWordWeight(b), 0);
}

function isSectionStart(block) {
  if (!block || block.type !== 'rich-text') return false;
  const h = String(block.content?.heading || '').trim();
  return !!h;
}

function hasHardBreak(block) {
  return !!(block?.pageBreakBefore || block?.content?.pageBreakBefore);
}

/**
 * @param {any[]} blocks
 * @param {{ wordsPerPage?: number }} [opts]
 * @returns {any[][]}
 */
export function paginateTutorialBlocks(blocks, opts = {}) {
  const list = Array.isArray(blocks) ? blocks : [];
  if (!list.length) return [];

  const wordsPerPage = Math.max(200, Number(opts.wordsPerPage) || 520);
  const authorPaged = list.some(hasHardBreak);
  const total = countBlocksWords(list);

  // Short tutorials with no author page map: single page
  if (!authorPaged && (total <= wordsPerPage * 1.15 || list.length <= 4)) {
    return [list];
  }

  const pages = [];
  let current = [];
  let currentWords = 0;

  const flush = () => {
    if (!current.length) return;
    pages.push(current);
    current = [];
    currentWords = 0;
  };

  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const w = blockWordWeight(b);
    const hardBreak = current.length > 0 && hasHardBreak(b);

    if (hardBreak) {
      flush();
    } else if (!authorPaged) {
      // Legacy soft packing only when Structure did not assign pages.
      const atBreak = current.length > 0 && isSectionStart(b) && currentWords >= wordsPerPage * 0.55;
      const wouldOverflow = current.length > 0 && currentWords + w > wordsPerPage && currentWords >= wordsPerPage * 0.4;
      if (atBreak || wouldOverflow) flush();
    }

    current.push(b);
    currentWords += w;
  }
  flush();

  // Avoid tiny trailing page when using auto word-budget only.
  if (!authorPaged && pages.length >= 2) {
    const last = pages[pages.length - 1];
    const lastW = countBlocksWords(last);
    if (lastW < wordsPerPage * 0.28 && last.length <= 2) {
      pages[pages.length - 2] = [...pages[pages.length - 2], ...last];
      pages.pop();
    }
  }

  return pages.length ? pages : [list];
}

/** Default words-per-page for learner UI. */
export const TUTORIAL_WORDS_PER_PAGE = 520;

/**
 * @deprecated Word targets retired. Kept only as a soft token-budget hint from
 * depth × sections (never a HARD length requirement for the model).
 * @param {{ dpth?: string, secs?: number, words?: number }} fv
 */
export function resolveTutorialWordTarget(fv = {}) {
  // Explicit words knobs are ignored — length follows curated units + depth.
  const secs = Math.max(1, Number(fv.secs) || 3);
  const dpth = String(fv.dpth || 'Standard');
  const per =
    /in-?depth/i.test(dpth) ? 480
      : /overview/i.test(dpth) ? 160
        : 280;
  return secs * per;
}
