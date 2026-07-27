/**
 * Drill runtime helpers — normalize interactive payloads, evaluate commits, build tiers.
 * Session re-queue lives in sessionMasteryQueue.ts (shared with FlashcardStudy).
 */

import type {
  DrillBlueprint,
  DrillContent,
  DrillInteractivePayload,
  DrillItem,
  DrillItemDifficulty,
  DrillItemResult,
  DrillTier,
} from './types';
import { buildSessionQueue, resolveSessionQueueItem } from './sessionMasteryQueue';

export function normalizeDrillAnswer(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/g, '');
}

export function answersMatch(committed: string, correct: string): boolean {
  const a = normalizeDrillAnswer(committed);
  const b = normalizeDrillAnswer(correct);
  if (!a || !b) return false;
  if (a === b) return true;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && a === String(na) && b === String(nb)) {
    return na === nb;
  }
  return false;
}

function numericMatch(committed: string, expected: string, tolerance?: number): boolean {
  if (tolerance == null) return answersMatch(committed, expected);
  const a = Number(String(committed).trim());
  const b = Number(String(expected).trim());
  if (Number.isNaN(a) || Number.isNaN(b)) return answersMatch(committed, expected);
  return Math.abs(a - b) <= tolerance;
}

/** Map legacy flat prompt/answer/choices → interactive (never Reveal). */
export function ensureInteractive(item: DrillItem): DrillInteractivePayload {
  if (item.interactive) return item.interactive;

  const choices = (item.choices || []).map((t) => String(t || '').trim()).filter(Boolean);
  if (choices.length >= 2) {
    return {
      kind: 'choice',
      prompt: item.prompt || 'Choose the correct answer',
      choices: choices.map((text, i) => ({
        id: `c${i + 1}`,
        text,
        correct: answersMatch(text, item.answer),
        correction: item.corrections?.[text],
      })),
    };
  }

  return {
    kind: 'compute',
    prompt: item.prompt || 'Enter your answer',
    expected: item.answer || '',
  };
}

/**
 * If label_place lacks a usable image + regions, fall back to categorize (same terms).
 * Visible log — not silent.
 */
export function resolveInteractiveForPlay(item: DrillItem): {
  interactive: DrillInteractivePayload;
  fallbackNote?: string;
} {
  const raw = ensureInteractive(item);
  if (raw.kind !== 'label_place') return { interactive: raw };

  const hasImage = !!(raw.imageUrl || '').trim();
  const hasRegions = Array.isArray(raw.regions) && raw.regions.length > 0;
  const hasTerms = Array.isArray(raw.terms) && raw.terms.length > 0;
  const hasMapping = raw.mapping && Object.keys(raw.mapping).length > 0;

  if (hasImage && hasRegions && hasTerms && hasMapping) {
    return { interactive: raw };
  }

  const terms = hasTerms ? raw.terms : Object.keys(raw.mapping || {}).map((id) => ({ id, text: id }));
  const regionLabels = new Map(
    (raw.regions || []).map((r) => [r.id, r.label || r.id]),
  );
  const buckets = [...new Set(Object.values(raw.mapping || {}))].map((rid) => ({
    id: rid,
    label: regionLabels.get(rid) || rid,
  }));
  const assignments: Record<string, string> = { ...(raw.mapping || {}) };

  const note =
    `[drill] label_place item "${item.id}" missing image/regions — falling back to categorize (still interactive).`;
  // eslint-disable-next-line no-console
  console.warn(note);

  return {
    interactive: {
      kind: 'categorize',
      buckets: buckets.length
        ? buckets
        : terms.map((t) => ({ id: t.id, label: t.text })),
      items: terms,
      assignments,
    },
    fallbackNote: 'No diagram available — sort each term into its correct label.',
  };
}

export function normalizeDrillItem(item: DrillItem, index: number): DrillItem {
  const id = item.id || `di${index + 1}`;
  const interactive = ensureInteractive({ ...item, id });
  return {
    ...item,
    id,
    prompt: item.prompt || stemFromInteractive(interactive),
    answer: item.answer || answerFromInteractive(interactive),
    interactive,
    difficulty: item.difficulty || 'medium',
  };
}

function stemFromInteractive(ix: DrillInteractivePayload): string {
  if (ix.kind === 'compute' || ix.kind === 'choice') return ix.prompt;
  if (ix.kind === 'order') return 'Put the steps in the correct order.';
  if (ix.kind === 'categorize') return 'Sort each item into the correct category.';
  if (ix.kind === 'match') return 'Match each item to its pair.';
  if (ix.kind === 'label_place') return 'Place each label on the correct region.';
  if (ix.kind === 'multi_step') return 'Complete each step in order.';
  return 'Practice item';
}

function answerFromInteractive(ix: DrillInteractivePayload): string {
  if (ix.kind === 'compute') return ix.expected;
  if (ix.kind === 'choice') {
    const c = ix.choices.find((x) => x.correct);
    return c?.text || '';
  }
  return '';
}

export function buildTiers(
  items: DrillItem[],
  difficultyMode: string,
): DrillTier[] {
  const ramp = /easy\s*→\s*hard|easy\s*->\s*hard|ramped/i.test(difficultyMode || '');
  if (!ramp) {
    return [{
      id: 'tier-1',
      label: 'Level 1',
      difficulty: 'mixed',
      itemIds: items.map((it) => it.id),
    }];
  }

  const bands: { d: DrillItemDifficulty; label: string }[] = [
    { d: 'easy', label: 'Level 1' },
    { d: 'medium', label: 'Level 2' },
    { d: 'hard', label: 'Level 3' },
  ];
  const tiers: DrillTier[] = [];
  bands.forEach((b, i) => {
    const ids = items.filter((it) => (it.difficulty || 'medium') === b.d).map((it) => it.id);
    if (ids.length) {
      tiers.push({
        id: `tier-${i + 1}`,
        label: b.label,
        difficulty: b.d,
        itemIds: ids,
      });
    }
  });
  if (!tiers.length) {
    return [{
      id: 'tier-1',
      label: 'Level 1',
      difficulty: 'mixed',
      itemIds: items.map((it) => it.id),
    }];
  }
  // Renumber labels sequentially
  return tiers.map((t, i) => ({ ...t, id: `tier-${i + 1}`, label: `Level ${i + 1}` }));
}

export function contentToBlueprint(content: DrillContent): DrillBlueprint {
  if (content.blueprint?.items?.length) {
    const items = content.blueprint.items.map(normalizeDrillItem);
    const tiers = content.blueprint.tiers?.length
      ? content.blueprint.tiers
      : buildTiers(items, content.blueprint.difficultyMode || content.difficultyCurve);
    return {
      ...content.blueprint,
      items,
      tiers,
      itemCount: items.length,
      runtime: {
        feedbackTiming: /end\s*only/i.test(String(content.blueprint.runtime?.feedbackTiming || content.feedback))
          ? 'End only'
          : 'Immediate',
        timed: content.blueprint.runtime?.timed ?? !!content.timed,
        secondsPerItem: content.blueprint.runtime?.secondsPerItem ?? content.secondsPerItem,
        repeatUntilMastery: content.blueprint.runtime?.repeatUntilMastery ?? !!content.repeatUntilMastery,
        requeueOffset: content.blueprint.runtime?.requeueOffset ?? content.requeueOffset ?? 3,
      },
    };
  }

  const items = (content.items || []).map(normalizeDrillItem);
  const tiers = content.tiers?.length
    ? content.tiers
    : buildTiers(items, content.difficultyCurve);
  return {
    skill: content.skill || 'Practice skill',
    level: content.level || 'Basic',
    cognitiveFormat: content.format || 'Application',
    difficultyMode: content.difficultyCurve || 'Easy → hard',
    itemCount: items.length,
    items,
    tiers,
    runtime: {
      feedbackTiming: /end\s*only/i.test(content.feedback || '') ? 'End only' : 'Immediate',
      timed: !!content.timed,
      secondsPerItem: content.secondsPerItem || 20,
      repeatUntilMastery: !!content.repeatUntilMastery,
      requeueOffset: content.requeueOffset || 3,
    },
  };
}

export function initialQueueForTier(blueprint: DrillBlueprint, tierIndex: number): string[] {
  const tier = blueprint.tiers[tierIndex];
  if (!tier) return [];
  return buildSessionQueue(tier.itemIds);
}

export function evaluateInteractive(
  item: DrillItem,
  interactive: DrillInteractivePayload,
  committed: unknown,
): DrillItemResult {
  const why = (item.whyCorrect || '').trim() || undefined;

  if (interactive.kind === 'compute') {
    const raw = String(committed ?? '');
    const correct = numericMatch(raw, interactive.expected, interactive.tolerance);
    if (correct) return { correct: true, committed: raw, why };
    const correction = lookupCorrection(item, raw)
      || (raw
        ? `You answered “${raw.trim()}”. The correct answer is ${interactive.expected}${interactive.unit ? ` ${interactive.unit}` : ''}.`
        : `The correct answer is ${interactive.expected}.`);
    return { correct: false, committed: raw, why, correction, wrongParts: ['answer'] };
  }

  if (interactive.kind === 'choice') {
    const pickedId = String(committed ?? '');
    const picked = interactive.choices.find((c) => c.id === pickedId || answersMatch(c.text, pickedId));
    const correctChoice = interactive.choices.find((c) => c.correct);
    const correct = !!(picked && picked.correct);
    if (correct) return { correct: true, committed: pickedId, why };
    const correction = picked?.correction
      || lookupCorrection(item, picked?.text || pickedId)
      || `The correct answer is ${correctChoice?.text || item.answer}.`;
    return {
      correct: false,
      committed: pickedId,
      why,
      correction,
      wrongParts: picked ? [picked.id] : ['choice'],
    };
  }

  if (interactive.kind === 'order') {
    const order = Array.isArray(committed) ? (committed as string[]) : [];
    const wrongParts: string[] = [];
    interactive.correctOrder.forEach((id, i) => {
      if (order[i] !== id) wrongParts.push(id);
    });
    const correct = wrongParts.length === 0 && order.length === interactive.correctOrder.length;
    return {
      correct,
      committed: order,
      why,
      correction: correct ? undefined : 'Some steps are out of place — try again.',
      wrongParts: correct ? undefined : wrongParts,
    };
  }

  if (interactive.kind === 'categorize') {
    const assign = (committed && typeof committed === 'object') ? committed as Record<string, string> : {};
    const wrongParts: string[] = [];
    Object.entries(interactive.assignments).forEach(([itemId, bucketId]) => {
      if (assign[itemId] !== bucketId) wrongParts.push(itemId);
    });
    const correct = wrongParts.length === 0
      && Object.keys(interactive.assignments).every((k) => k in assign);
    return {
      correct,
      committed: assign,
      why,
      correction: correct ? undefined : 'One or more items are in the wrong category.',
      wrongParts: correct ? undefined : wrongParts,
    };
  }

  if (interactive.kind === 'match') {
    const pairs = (committed && typeof committed === 'object') ? committed as Record<string, string> : {};
    const wrongParts: string[] = [];
    Object.entries(interactive.pairs).forEach(([leftId, rightId]) => {
      if (pairs[leftId] !== rightId) wrongParts.push(leftId);
    });
    const correct = wrongParts.length === 0
      && Object.keys(interactive.pairs).every((k) => k in pairs);
    return {
      correct,
      committed: pairs,
      why,
      correction: correct ? undefined : 'One or more pairs do not match.',
      wrongParts: correct ? undefined : wrongParts,
    };
  }

  if (interactive.kind === 'label_place') {
    const place = (committed && typeof committed === 'object') ? committed as Record<string, string> : {};
    const wrongParts: string[] = [];
    Object.entries(interactive.mapping).forEach(([termId, regionId]) => {
      if (place[termId] !== regionId) wrongParts.push(termId);
    });
    const correct = wrongParts.length === 0
      && Object.keys(interactive.mapping).every((k) => k in place);
    return {
      correct,
      committed: place,
      why,
      correction: correct ? undefined : 'One or more labels are on the wrong region.',
      wrongParts: correct ? undefined : wrongParts,
    };
  }

  if (interactive.kind === 'multi_step') {
    // Multi-step is graded step-by-step by the renderer; full commit is boolean.
    const correct = committed === true;
    return { correct, committed, why };
  }

  return { correct: false, committed, why, correction: 'Unsupported item format.' };
}

function lookupCorrection(item: DrillItem, committed: string): string | undefined {
  const key = Object.keys(item.corrections || {}).find((k) => answersMatch(k, committed));
  return key ? item.corrections![key] : undefined;
}

/** Drill miss re-insert (offset slots later). Uses shared session queue. */
export function requeueAfterMiss(queue: string[], itemId: string, offset = 3): string[] {
  return resolveSessionQueueItem(queue, itemId, 'requeue', { requeueMode: 'offset', offset });
}
