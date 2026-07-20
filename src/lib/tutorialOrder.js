/**
 * Reorder tutorial parts so knowledge-checks sit with the section they test.
 * Used by the generate API and the course-dev assembler.
 */

function headingOf(p) {
  return String(p?.heading || '').trim();
}

function isIntroHeading(h) {
  const s = h.toLowerCase();
  return s === 'introduction' || s.startsWith('intro');
}

function isClosingHeading(h) {
  const s = h.toLowerCase();
  return /^(recap|summary|closing|conclusion|assignment|end quiz)/i.test(s);
}

function startsSection(p) {
  if (!p || p.type !== 'rich-text') return false;
  const h = headingOf(p);
  if (!h) return false;
  return !isIntroHeading(h) && !isClosingHeading(h);
}

/**
 * @param {any[]} parts
 * @param {{ assessmentPlacement?: string, checksPerSection?: number }} [opts]
 * @returns {any[]}
 */
export function orderTutorialParts(parts, opts = {}) {
  if (!Array.isArray(parts) || parts.length === 0) return parts || [];

  const assessmentPlacement = opts.assessmentPlacement || 'after_each_section';
  const checksPerSection = Math.max(1, Number(opts.checksPerSection) || 1);

  if (assessmentPlacement === 'none') {
    return parts.filter((p) => p?.type !== 'question');
  }

  const intro = [];
  const sections = [];
  const closing = [];
  let mode = 'intro';
  let cur = null;

  const flush = () => {
    if (cur) {
      sections.push(cur);
      cur = null;
    }
  };

  for (const p of parts) {
    if (!p) continue;

    if (p.type === 'rich-text' && isIntroHeading(headingOf(p)) && sections.length === 0 && !cur) {
      mode = 'intro';
      intro.push(p);
      continue;
    }

    if (p.type === 'rich-text' && isClosingHeading(headingOf(p))) {
      flush();
      mode = 'closing';
      closing.push(p);
      continue;
    }

    if (startsSection(p)) {
      flush();
      cur = { teaching: [p], questions: [] };
      mode = 'section';
      continue;
    }

    if (p.type === 'question') {
      if (mode === 'closing' || assessmentPlacement === 'end_only') {
        closing.push(p);
      } else if (cur) {
        cur.questions.push(p);
      } else {
        intro.push(p);
      }
      continue;
    }

    if (mode === 'closing') closing.push(p);
    else if (cur) cur.teaching.push(p);
    else intro.push(p);
  }
  flush();

  if (assessmentPlacement === 'end_only') {
    const fromSections = [];
    for (const s of sections) {
      fromSections.push(...s.questions);
      s.questions = [];
    }
    const closingQs = closing.filter((p) => p.type === 'question');
    const closingOther = closing.filter((p) => p.type !== 'question');
    return [
      ...intro.filter((p) => p.type !== 'question'),
      ...sections.flatMap((s) => s.teaching),
      ...closingOther,
      ...fromSections,
      ...closingQs,
      ...intro.filter((p) => p.type === 'question'),
    ];
  }

  // after_each_section / checkpoints: if the model dumped every check onto the last section, spread them
  if (sections.length > 1) {
    const earlierEmpty = sections.slice(0, -1).every((s) => s.questions.length === 0);
    const last = sections[sections.length - 1];
    if (earlierEmpty && last && last.questions.length > 0) {
      const pool = [...last.questions];
      last.questions = [];
      for (const s of sections) {
        if (!pool.length) break;
        s.questions = pool.splice(0, checksPerSection);
      }
      if (pool.length) last.questions.push(...pool);
    }
  }

  const introQs = intro.filter((p) => p.type === 'question');
  const introOther = intro.filter((p) => p.type !== 'question');
  if (introQs.length && sections[0]) {
    sections[0].questions = [...introQs, ...sections[0].questions];
  }

  return [
    ...introOther,
    ...sections.flatMap((s) => [...s.teaching, ...s.questions]),
    ...closing,
  ];
}

/** Stamp Question 1…N across tutorial quiz/question blocks for learner display. */
export function renumberBlockQuestionLabels(blocks) {
  if (!Array.isArray(blocks)) return blocks || [];
  let n = 0;
  return blocks.map((block) => {
    if (!block) return block;
    if (block.type === 'quiz') {
      const content = block.content || {};
      const questions = Array.isArray(content.questions) ? content.questions : [];
      return {
        ...block,
        content: {
          ...content,
          questions: questions.map((q) => {
            n += 1;
            return { ...q, label: `Question ${n}` };
          }),
        },
      };
    }
    if (block.type === 'question') {
      n += 1;
      return {
        ...block,
        content: { ...(block.content || {}), label: `Question ${n}` },
      };
    }
    return block;
  });
}
