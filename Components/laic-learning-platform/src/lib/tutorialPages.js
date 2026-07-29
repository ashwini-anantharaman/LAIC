/**
 * Split tutorial blocks into learner pages by approximate word budget.
 * Prefers breaks before section headings so teaching + that section’s checks stay together.
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
  if (!h) return false;
  const lower = h.toLowerCase();
  if (lower === 'introduction' || lower === 'intro' || lower === 'recap' || lower === 'summary') return true;
  return true; // any headed rich-text is a natural page-break candidate
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
  const total = countBlocksWords(list);

  // Short tutorials: single page
  if (total <= wordsPerPage * 1.15 || list.length <= 4) {
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
    const atBreak = current.length > 0 && isSectionStart(b) && currentWords >= wordsPerPage * 0.55;
    const wouldOverflow = current.length > 0 && currentWords + w > wordsPerPage && currentWords >= wordsPerPage * 0.4;

    if (atBreak || wouldOverflow) flush();

    current.push(b);
    currentWords += w;
  }
  flush();

  // Avoid tiny trailing page: merge into previous if very short
  if (pages.length >= 2) {
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
 * Resolve author target word count from Define knobs.
 * @param {{ words?: number, dpth?: string, secs?: number }} fv
 */
export function resolveTutorialWordTarget(fv = {}) {
  const raw = Number(fv.words);
  if (Number.isFinite(raw) && raw > 0) return Math.round(raw);

  const secs = Math.max(1, Number(fv.secs) || 3);
  const dpth = String(fv.dpth || 'Standard');
  const per =
    /in-?depth/i.test(dpth) ? 480
      : /overview/i.test(dpth) ? 160
        : 280;
  return secs * per;
}
