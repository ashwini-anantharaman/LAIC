/**
 * Hand-authored mock drill blueprint — exercises every interactive format,
 * Easy→hard tiers, mastery re-queue, and the no-image label_place → categorize fallback.
 * Generation from sources is a follow-up task (see docs/drill-runtime-gap-report.md).
 */

import type { DrillBlueprint, DrillContent, DrillItem } from './types';

const items: DrillItem[] = [
  // ── Level 1 (easy) ──────────────────────────────────────────────
  {
    id: 'mock-compute-1',
    prompt: 'Contract is 3♥. How many tricks do you need to make?',
    answer: '9',
    difficulty: 'easy',
    skillTag: 'level → tricks',
    whyCorrect: 'Book is 6 tricks; level 3 means 6 + 3 = 9.',
    corrections: {
      '3': 'That’s the bid level, not total tricks. Add the six-trick book: 6 + 3 = 9.',
      '6': 'That’s only the book. Add the bid level: 6 + 3 = 9.',
      '7': 'That’s tricks above book for a 1-level bid. For 3♥ it’s 6 + 3 = 9.',
    },
    interactive: {
      kind: 'compute',
      prompt: 'Contract is 3♥. How many tricks do you need to make?',
      expected: '9',
    },
  },
  {
    id: 'mock-choice-1',
    prompt: 'Which bid asks for more tricks than 2♠?',
    answer: '3♣',
    difficulty: 'easy',
    skillTag: 'level → tricks',
    whyCorrect: '3♣ needs 9 tricks; 2♠ needs only 8.',
    interactive: {
      kind: 'choice',
      prompt: 'Which bid asks for more tricks than 2♠?',
      choices: [
        { id: 'a', text: '1NT', correct: false, correction: '1NT is only 7 tricks — fewer than 2♠ (8).' },
        { id: 'b', text: '2♥', correct: false, correction: 'Same level as 2♠ — also 8 tricks.' },
        { id: 'c', text: '3♣', correct: true },
        { id: 'd', text: 'Pass', correct: false, correction: 'Pass isn’t a bid for tricks.' },
      ],
    },
  },
  {
    id: 'mock-order-1',
    prompt: 'Order the steps to figure tricks needed from a contract.',
    answer: '',
    difficulty: 'easy',
    skillTag: 'level → tricks',
    whyCorrect: 'Read the level, add the book of six, then compare to tricks taken.',
    interactive: {
      kind: 'order',
      steps: [
        { id: 's1', text: 'Read the contract level (e.g. 4 in 4♠)' },
        { id: 's2', text: 'Add the six-trick book' },
        { id: 's3', text: 'Compare to tricks taken' },
      ],
      correctOrder: ['s1', 's2', 's3'],
    },
  },

  // ── Level 2 (medium) ────────────────────────────────────────────
  {
    id: 'mock-match-1',
    prompt: 'Match each contract to tricks needed.',
    answer: '',
    difficulty: 'medium',
    skillTag: 'level → tricks',
    whyCorrect: 'Tricks needed = 6 + level.',
    interactive: {
      kind: 'match',
      left: [
        { id: 'l1', text: '1NT' },
        { id: 'l2', text: '3♥' },
        { id: 'l3', text: '6♠' },
      ],
      right: [
        { id: 'r1', text: '7 tricks' },
        { id: 'r2', text: '9 tricks' },
        { id: 'r3', text: '12 tricks' },
      ],
      pairs: { l1: 'r1', l2: 'r2', l3: 'r3' },
    },
  },
  {
    id: 'mock-categorize-1',
    prompt: 'Sort each bid by tricks needed.',
    answer: '',
    difficulty: 'medium',
    skillTag: 'level → tricks',
    whyCorrect: 'Group by total tricks: 7, 9, or 11.',
    interactive: {
      kind: 'categorize',
      buckets: [
        { id: 'b7', label: '7 tricks' },
        { id: 'b9', label: '9 tricks' },
        { id: 'b11', label: '11 tricks' },
      ],
      items: [
        { id: 'i1', text: '1♠' },
        { id: 'i2', text: '3♦' },
        { id: 'i3', text: '5♣' },
        { id: 'i4', text: '1NT' },
      ],
      assignments: { i1: 'b7', i2: 'b9', i3: 'b11', i4: 'b7' },
    },
  },
  {
    id: 'mock-label-ok',
    prompt: 'Place each label on the diagram region.',
    answer: '',
    difficulty: 'medium',
    skillTag: 'level → tricks',
    whyCorrect: 'Book is the first six; level adds above book; total is what you need.',
    interactive: {
      kind: 'label_place',
      // Simple SVG data URL so label_place has a real image without external assets.
      imageUrl:
        'data:image/svg+xml,' +
        encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240" viewBox="0 0 480 240">
          <rect width="480" height="240" fill="#F8FAFC"/>
          <rect x="24" y="40" width="130" height="160" rx="12" fill="#DBEAFE" stroke="#93C5FD"/>
          <text x="89" y="125" text-anchor="middle" font-size="14" fill="#1E3A8A">Book</text>
          <rect x="175" y="40" width="130" height="160" rx="12" fill="#FEF3C7" stroke="#FCD34D"/>
          <text x="240" y="125" text-anchor="middle" font-size="14" fill="#92400E">Level</text>
          <rect x="326" y="40" width="130" height="160" rx="12" fill="#D1FAE5" stroke="#6EE7B7"/>
          <text x="391" y="125" text-anchor="middle" font-size="14" fill="#065F46">Total</text>
        </svg>`),
      imageAlt: 'Three boxes: Book, Level, Total',
      regions: [
        { id: 'reg-book', label: 'Book', x: 0.05, y: 0.16, w: 0.27, h: 0.67 },
        { id: 'reg-level', label: 'Level', x: 0.365, y: 0.16, w: 0.27, h: 0.67 },
        { id: 'reg-total', label: 'Total', x: 0.68, y: 0.16, w: 0.27, h: 0.67 },
      ],
      terms: [
        { id: 't-six', text: 'Always 6' },
        { id: 't-bid', text: 'Bid number' },
        { id: 't-need', text: '6 + level' },
      ],
      mapping: { 't-six': 'reg-book', 't-bid': 'reg-level', 't-need': 'reg-total' },
    },
  },

  // ── Level 3 (hard) ──────────────────────────────────────────────
  {
    id: 'mock-multistep-1',
    prompt: 'You’re in 4♠ and took 9 tricks. Did you make?',
    answer: 'failed',
    difficulty: 'hard',
    skillTag: 'level → tricks',
    whyCorrect: '4♠ needs 10 tricks; 9 is one short — failed.',
    interactive: {
      kind: 'multi_step',
      steps: [
        {
          id: 'ms1',
          prompt: 'How many tricks does 4♠ need?',
          whyCorrect: '6 + 4 = 10.',
          corrections: { '4': 'That’s the level. Add the book: 6 + 4 = 10.' },
          interaction: { kind: 'compute', prompt: 'Tricks needed for 4♠?', expected: '10' },
        },
        {
          id: 'ms2',
          prompt: 'You took 9. Did you make the contract?',
          whyCorrect: '9 < 10, so you failed.',
          interaction: {
            kind: 'choice',
            prompt: 'Result?',
            choices: [
              { id: 'made', text: 'Made', correct: false, correction: 'You needed 10; 9 is short.' },
              { id: 'failed', text: 'Failed', correct: true },
            ],
          },
        },
      ],
    },
  },
  {
    id: 'mock-label-no-image',
    prompt: 'Label the parts of tricks-needed (no diagram — should fall back).',
    answer: '',
    difficulty: 'hard',
    skillTag: 'level → tricks',
    whyCorrect: 'Book = 6, level = bid number, total = 6 + level.',
    interactive: {
      kind: 'label_place',
      imageUrl: '', // intentionally empty → runtime categorize fallback
      regions: [
        { id: 'six', label: 'Always 6', x: 0, y: 0, w: 0, h: 0 },
        { id: 'bid-number', label: 'Bid number', x: 0, y: 0, w: 0, h: 0 },
        { id: 'six-plus-level', label: '6 + level', x: 0, y: 0, w: 0, h: 0 },
      ],
      terms: [
        { id: 'fb1', text: 'Book' },
        { id: 'fb2', text: 'Level' },
        { id: 'fb3', text: 'Total needed' },
      ],
      mapping: {
        fb1: 'six',
        fb2: 'bid-number',
        fb3: 'six-plus-level',
      },
    },
  },
];

export const MOCK_DRILL_BLUEPRINT: DrillBlueprint = {
  skill: 'Compute tricks needed from contract level',
  level: 'Basic',
  cognitiveFormat: 'Application',
  difficultyMode: 'Easy → hard',
  itemCount: items.length,
  items,
  tiers: [
    { id: 'tier-1', label: 'Level 1', difficulty: 'easy', itemIds: ['mock-compute-1', 'mock-choice-1', 'mock-order-1'] },
    { id: 'tier-2', label: 'Level 2', difficulty: 'medium', itemIds: ['mock-match-1', 'mock-categorize-1', 'mock-label-ok'] },
    { id: 'tier-3', label: 'Level 3', difficulty: 'hard', itemIds: ['mock-multistep-1', 'mock-label-no-image'] },
  ],
  runtime: {
    feedbackTiming: 'Immediate',
    timed: false,
    secondsPerItem: 20,
    repeatUntilMastery: true,
    requeueOffset: 2,
  },
};

export function mockDrillContent(overrides?: Partial<DrillContent>): DrillContent {
  return {
    skill: MOCK_DRILL_BLUEPRINT.skill,
    format: String(MOCK_DRILL_BLUEPRINT.cognitiveFormat),
    difficultyCurve: String(MOCK_DRILL_BLUEPRINT.difficultyMode),
    feedback: MOCK_DRILL_BLUEPRINT.runtime.feedbackTiming,
    timed: MOCK_DRILL_BLUEPRINT.runtime.timed,
    secondsPerItem: MOCK_DRILL_BLUEPRINT.runtime.secondsPerItem,
    repeatUntilMastery: MOCK_DRILL_BLUEPRINT.runtime.repeatUntilMastery,
    requeueOffset: MOCK_DRILL_BLUEPRINT.runtime.requeueOffset,
    level: MOCK_DRILL_BLUEPRINT.level,
    items: MOCK_DRILL_BLUEPRINT.items,
    blueprint: MOCK_DRILL_BLUEPRINT,
    tiers: MOCK_DRILL_BLUEPRINT.tiers,
    ...overrides,
  };
}
