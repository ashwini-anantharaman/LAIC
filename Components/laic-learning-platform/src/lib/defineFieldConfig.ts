/**
 * Shared Define-step field groups — same knobs as standalone ObjectCreator.
 * Keep this in sync with the Define UI (chip picks, multi-select, toggles, steppers).
 */

export type DefineFieldType = 'area' | 'text' | 'pick' | 'multi' | 'sel' | 'bool' | 'num';

export interface DefineFieldDef {
  id: string;
  label: string;
  type: DefineFieldType;
  options?: string[];
  default?: any;
  hint?: string;
  min?: number;
  max?: number;
}

export interface DefineGroupDef {
  title?: string;
  note?: string;
  fields: DefineFieldDef[];
}

export const DEFINE_VOICES = ['Plain & friendly', 'Neutral / academic', 'Encouraging', 'Socratic'];

const VOI = DEFINE_VOICES;

/** Per-type Define groups — source of truth for standalone + Tutorial V2 generate. */
export const DEFINE_CFG: Record<string, DefineGroupDef[]> = {
  lesson: [
    { title: 'Intent', note: 'What are you actually trying to teach?', fields: [
      { id: 'obj', label: 'Learning objective', type: 'area', hint: 'After this lesson, the learner can…' },
      { id: 'concepts', label: 'Concept(s) to focus on', type: 'text' },
      { id: 'voi', label: 'Voice', type: 'pick', options: VOI, default: 'Plain & friendly' },
    ]},
    { title: 'Teaching approach', fields: [
      { id: 'how', label: 'How it should teach', type: 'pick', options: ['Explain → check', 'Story / case-based', 'Inquiry (question-first)', 'Worked example'], default: 'Explain → check' },
      { id: 'open', label: 'Open with', type: 'pick', options: ['Surprising fact', 'Real-world question', 'Short story', 'Direct framing'], default: 'Surprising fact' },
      { id: 'depth', label: 'Depth', type: 'pick', options: ['Quick (~5 min)', 'Standard (~10)', 'Deep (~20)'], default: 'Standard (~10)' },
      { id: 'misc', label: 'Address a common misconception', type: 'bool', default: true },
    ]},
    { title: 'What to include', fields: [
      { id: 'expls', label: 'Explanation sections', type: 'num', min: 1, max: 5, default: 2 },
      { id: 'exmps', label: 'Worked examples', type: 'num', min: 0, max: 3, default: 1 },
      { id: 'excpts', label: 'Source excerpts', type: 'num', min: 0, max: 3, default: 1 },
      { id: 'chks', label: 'Knowledge checks', type: 'num', min: 0, max: 5, default: 2 },
      { id: 'refs', label: 'Reflection prompts', type: 'num', min: 0, max: 2, default: 1 },
      { id: 'summ', label: 'End with a summary', type: 'bool', default: true },
    ]},
  ],
  tutorial: [
    { title: 'Structure', fields: [
      { id: 'secs', label: 'Sections / sub-lessons', type: 'num', min: 2, max: 20, default: 3 },
      { id: 'prog', label: 'Progression', type: 'pick', options: ['Linear build-up', 'Prerequisite chain', 'Themed clusters'], default: 'Linear build-up' },
      { id: 'dpth', label: 'Depth per section', type: 'pick', options: ['Overview', 'Standard', 'In-depth'], default: 'Standard' },
      { id: 'end', label: 'End with', type: 'pick', options: ['End quiz', 'End assignment', 'Recap only', 'None'], default: 'Recap only' },
    ]},
    { title: 'Per section', fields: [
      { id: 'chks', label: 'Checks per section', type: 'num', min: 0, max: 3, default: 1 },
      { id: 'excpts', label: 'Source excerpts (total)', type: 'num', min: 0, max: 3, default: 1 },
      { id: 'wex', label: 'Include a worked example', type: 'bool', default: true },
    ]},
    { title: 'Checks & scoring', note: 'When a pass mark is on, it is scored across every multiple-choice check in the tutorial combined — not per question.', fields: [
      { id: 'passOn', label: 'Require a pass mark on MCQs', type: 'bool', default: true },
      { id: 'pass', label: 'Pass mark (all checks combined)', type: 'sel', options: ['50%', '60%', '70%', '80%', '90%'], default: '70%' },
      { id: 'hintsOn', label: 'Offer progressive hints after wrong answers', type: 'bool', default: true },
      { id: 'hintN', label: 'Hints per question', type: 'num', min: 1, max: 4, default: 4 },
    ]},
  ],
  quiz: [
    { title: 'Intent', note: 'What should this quiz verify, and for whom?', fields: [
      { id: 'verify', label: 'Intent — what it should verify', type: 'area' },
      { id: 'purpose', label: 'Purpose', type: 'pick', options: ['Formative check', 'Readiness gate', 'Diagnostic'], default: 'Formative check' },
      { id: 'concepts', label: 'Concepts to assess', type: 'text' },
    ]},
    { title: 'Question design', fields: [
      { id: 'qtypes', label: 'Question types', type: 'multi', options: ['Multiple choice', 'True/false', 'Multi-select', 'Short answer', 'Scenario'], default: ['Multiple choice', 'True/false'] },
      { id: 'cog', label: 'Cognitive levels', type: 'multi', options: ['Recall', 'Understand', 'Apply', 'Analyze'], default: ['Recall', 'Understand'] },
      { id: 'diff', label: 'Difficulty mix', type: 'pick', options: ['Mostly easy', 'Balanced', 'Mostly hard', 'Ramped easy→hard'], default: 'Balanced' },
      { id: 'wrong', label: 'Wrong answers', type: 'pick', options: ['Plausible common errors', 'Straightforward'], default: 'Plausible common errors' },
    ]},
    { title: 'Adaptivity', note: 'Should later questions get harder or easier based on how the learner answers?', fields: [
      { id: 'adaptive', label: 'Should the quiz questions be adaptive?', type: 'pick', options: ['Yes', 'No'], default: 'No' },
    ]},
    { title: 'Scoring & feedback', fields: [
      { id: 'nq', label: 'Number of questions', type: 'num', min: 3, max: 20, default: 8 },
      { id: 'passOn', label: 'Require a pass mark', type: 'bool', default: true },
      { id: 'pass', label: 'Pass mark', type: 'sel', options: ['50%', '60%', '70%', '80%', '90%'], default: '70%' },
      { id: 'show', label: 'Show explanations', type: 'sel', options: ['Immediately', 'After attempt', 'After completion', 'Never'], default: 'After attempt' },
      { id: 'perq', label: 'Write per-question explanations', type: 'bool', default: true },
    ]},
  ],
  'flashcard-set': [
    { title: 'Intent', fields: [
      { id: 'mem', label: 'What to memorise', type: 'text' },
    ]},
    { title: 'Card design', fields: [
      { id: 'cc', label: 'Card content', type: 'multi', options: ['Key terms → definitions', 'Concept → example', 'Question → answer', 'Image → label'], default: ['Key terms → definitions'] },
      { id: 'pull', label: 'Pull cards from', type: 'multi', options: ['Glossary / key terms in source', 'Concepts I focus on', 'Examples & worked cases', 'Misconceptions to correct', 'Questions in the source'], default: ['Glossary / key terms in source'] },
      { id: 'dir', label: 'Review direction', type: 'pick', options: ['Front→back', 'Back→front', 'Both'], default: 'Front→back' },
      { id: 'hooks', label: 'Add memory hooks', type: 'bool', default: false },
    ]},
    { title: 'Set', fields: [
      { id: 'nc', label: 'Number of cards', type: 'num', min: 5, max: 30, default: 12 },
    ]},
  ],
  'concept-card': [
    { title: 'Intent', note: 'The concept is resolved against your source — not a generic dictionary sense.', fields: [
      { id: 'concept', label: 'Intent — the concept', type: 'text', hint: 'Type a concept, or pick a suggestion from your markup' },
      { id: 'voi', label: 'Voice', type: 'pick', options: VOI, default: 'Plain & friendly' },
    ]},
    { title: 'Sheet categories', note: 'Toggle which panels appear on the concept card, rename them, or add your own. Generation fills only the ones you keep on.', fields: [
      { id: 'len', label: 'Length per section', type: 'pick', options: ['Tight', 'Standard', 'Expanded'], default: 'Standard' },
    ]},
  ],
  summary: [
    { title: 'Intent', fields: [
      { id: 'what', label: 'What to summarise', type: 'text' },
    ]},
    { title: 'Format', fields: [
      { id: 'shape', label: 'Shape', type: 'pick', options: ['TL;DR paragraph', 'Key points', 'Exam-cram sheet', 'Abstract'], default: 'Key points' },
      { id: 'len', label: 'Length', type: 'pick', options: ['Short', 'Medium', 'Long'], default: 'Medium' },
      { id: 'nkp', label: 'Number of key points', type: 'num', min: 3, max: 10, default: 5 },
    ]},
  ],
  reflection: [
    { title: 'Intent', fields: [
      { id: 'goal', label: 'Reflection goal', type: 'pick', options: ['Connect to experience', 'Self-assess understanding', 'Apply to real life', 'Plan next steps'], default: 'Apply to real life' },
      { id: 'voi', label: 'Voice', type: 'pick', options: VOI, default: 'Encouraging' },
    ]},
    { title: 'Prompt design', fields: [
      { id: 'style', label: 'Style', type: 'pick', options: ['Open-ended', 'Guided with sentence starters', 'Before / after structured'], default: 'Open-ended' },
      { id: 'who', label: 'Who sees answers', type: 'pick', options: ['Private to learner', 'Instructor-visible'], default: 'Private to learner' },
      { id: 'np', label: 'Number of prompts', type: 'num', min: 1, max: 5, default: 2 },
      { id: 'starters', label: 'Include sentence starters', type: 'bool', default: false },
    ]},
  ],
  scenario: [
    { title: 'Intent', fields: [
      { id: 'exercises', label: 'What it exercises', type: 'area', hint: 'The skill, bias, or concept the learner practises' },
      { id: 'skill', label: 'Skill / concept', type: 'text', hint: 'e.g. spotting confirmation bias' },
    ]},
    { title: 'The situation', fields: [
      { id: 'setting', label: 'Setting / situation', type: 'area', hint: 'Sketch the scenario the learner steps into' },
      { id: 'struct', label: 'Structure', type: 'pick', options: ['Linear', 'Branching decisions'], default: 'Branching decisions' },
      { id: 'frame', label: 'Framing', type: 'pick', options: ['Realistic case', 'Roleplay', 'Abstract'], default: 'Realistic case' },
      { id: 'debrief', label: 'Debrief', type: 'pick', options: ['Model reasoning', 'Feedback per choice', 'Both'], default: 'Both' },
      { id: 'dp', label: 'Decision points', type: 'num', min: 1, max: 6, default: 3 },
    ]},
  ],
  assignment: [
    { title: 'Intent', note: 'What are you actually asking the learner to demonstrate?', fields: [
      { id: 'obj', label: 'Learning objective', type: 'area', hint: 'What the learner demonstrates by doing this' },
    ]},
    { title: 'The task', fields: [
      { id: 'tt', label: 'Task type', type: 'pick', options: ['Short essay', 'Analysis', 'Problem set', 'Project', 'Critique'], default: 'Short essay' },
      { id: 'del', label: 'Deliverable', type: 'pick', options: ['Written text', 'File upload', 'Structured form'], default: 'Written text' },
      { id: 'el', label: 'Expected length', type: 'sel', options: ['~150 words', '~300 words', '~500 words', '~800 words'], default: '~300 words' },
      { id: 'cite', label: 'Require source citations', type: 'bool', default: true },
    ]},
    { title: 'Requirements & rubric', note: 'Requirements are checkable; rubric criteria map back to the objective and those requirements.', fields: [
      { id: 'req', label: 'Requirements', type: 'num', min: 2, max: 6, default: 3 },
      { id: 'rubric', label: 'Rubric criteria', type: 'num', min: 2, max: 6, default: 3 },
    ]},
  ],
  drill: [
    { title: 'Intent', fields: [
      { id: 'skill', label: 'Skill to drill', type: 'text', hint: 'The one narrow skill this reinforces' },
    ]},
    { title: 'Practice design', fields: [
      { id: 'fmt', label: 'Item format', type: 'pick', options: ['Recognition', 'Recall', 'Application'], default: 'Recall' },
      { id: 'diff', label: 'Difficulty', type: 'pick', options: ['Flat', 'Easy → hard'], default: 'Easy → hard' },
      { id: 'fb', label: 'Feedback', type: 'pick', options: ['Immediate', 'End only'], default: 'Immediate' },
      { id: 'timed', label: 'Timed', type: 'bool', default: false },
      { id: 'rep', label: 'Repeat until mastery', type: 'bool', default: false },
      { id: 'ni', label: 'Number of items', type: 'num', min: 5, max: 30, default: 15 },
    ]},
  ],
  'video-script': [
    { title: 'Intent', note: 'Paste a YouTube video in Sources. Define how the interactive lesson should behave.', fields: [
      { id: 'obj', label: 'Learning objective', type: 'area', hint: 'After watching with checkpoints, the learner can…' },
    ]},
    { title: 'Checkpoints', note: 'The video pauses at each checkpoint until the learner answers.', fields: [
      { id: 'ncp', label: 'Number of checkpoints', type: 'num', min: 1, max: 12, default: 4 },
    ]},
    { title: 'Learner tools', note: 'Shown beside the video in student preview.', fields: [
      { id: 'showTranscript', label: 'Transcript available (jump to any point)', type: 'bool', default: true },
      { id: 'enableChat', label: 'AI chatbot available (answers about the video)', type: 'bool', default: true },
    ]},
  ],
};

/** Seed field values from CFG defaults (plus any seed overrides). */
export function seedDefineValues(
  typeId: string,
  seed: Record<string, any> = {},
): Record<string, any> {
  const out: Record<string, any> = { ...seed };
  for (const g of DEFINE_CFG[typeId] || []) {
    for (const f of g.fields) {
      if (out[f.id] === undefined && f.default !== undefined) {
        out[f.id] = Array.isArray(f.default) ? [...f.default] : f.default;
      }
    }
  }
  return out;
}
