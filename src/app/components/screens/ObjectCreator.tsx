import React, { useRef, useState } from 'react';
import {
  ArrowLeft, ChevronRight, Database, Highlighter, Layers, Settings2,
  Plus, X, Check, Sparkles, FileText, ChevronDown, Minus,
  ToggleLeft, ToggleRight, Trash2, Save, Send, BookOpen,
  Upload, Loader2, AlertTriangle, RefreshCw,
  Youtube, ClipboardPaste, MessageSquare, Image as ImageIcon
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../App';
import { SOURCES } from '../../../lib/data';
import { parsePdf, docFromText, type ParsedDoc } from '../../../lib/pdf';
import {
  suggestTutorialHighlights, generateTutorial, generateFlashcards, ingestYoutube, editTutorialBlock, errorMessage,
  type GeneratedPart, type TutorialGenEvent, type GeneratedCard, type FlashcardGenEvent,
} from '../../../lib/api';
import { supabaseEnabled, uploadImage } from '../../../lib/supabase';
import { FlashcardEditor } from './FlashcardStudy';

/* ─── helpers ─────────────────────────────────────────────────── */

function fmtType(id: string) {
  return id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Pull the 11-char video id out of any common YouTube URL form (or a bare id). */
function parseYtId(url: string): string {
  if (!url) return '';
  const m = url.match(/(?:youtu\.be\/|watch\?v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : /^[A-Za-z0-9_-]{11}$/.test(url.trim()) ? url.trim() : '';
}

/** "1:30" | "1:02:03" | "90" → seconds. Empty/invalid → undefined. */
function parseTimestamp(str: string): number | undefined {
  const s = (str || '').trim();
  if (!s) return undefined;
  if (/^\d+$/.test(s)) return Number(s);
  const parts = s.split(':').map(p => Number(p));
  if (parts.some(n => Number.isNaN(n))) return undefined;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

const NOUNS: Record<string, string> = {
  lesson: 'lesson', tutorial: 'tutorial', quiz: 'quiz',
  'flashcard-set': 'flashcard set', 'concept-card': 'concept card',
  summary: 'summary', reflection: 'reflection', scenario: 'scenario',
  assignment: 'assignment', drill: 'drill',
};

/* ─── field system ────────────────────────────────────────────── */

type FT = 'area' | 'text' | 'pick' | 'multi' | 'sel' | 'bool' | 'num';
interface FDef { id: string; label: string; type: FT; options?: string[]; default?: any; hint?: string; min?: number; max?: number; }
interface GDef { title?: string; note?: string; fields: FDef[]; }

const AUD = ['Middle school', 'High school', 'College', 'Adult', 'Mixed'];
const LVL = ['Intro', 'Basic', 'Intermediate', 'Advanced'];
const VOI = ['Plain & friendly', 'Neutral / academic', 'Encouraging', 'Socratic'];

const CFG: Record<string, GDef[]> = {
  lesson: [
    { title: 'Intent', note: 'What are you actually trying to teach?', fields: [
      { id: 'obj', label: 'Learning objective', type: 'area', hint: 'After this lesson, the learner can…' },
      { id: 'concepts', label: 'Concept(s) to focus on', type: 'text' },
      { id: 'aud', label: 'Audience', type: 'pick', options: AUD, default: 'High school' },
      { id: 'lvl', label: 'Level', type: 'pick', options: LVL, default: 'Basic' },
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
    { title: 'Intent', fields: [
      { id: 'obj', label: 'Learning objective', type: 'area', hint: 'What the learner can do after the whole tutorial' },
      { id: 'topic', label: 'Overall topic', type: 'text' },
      { id: 'aud', label: 'Audience', type: 'pick', options: AUD, default: 'High school' },
      { id: 'lvl', label: 'Level', type: 'pick', options: LVL, default: 'Basic' },
    ]},
    { title: 'Structure', fields: [
      { id: 'secs', label: 'Sections / sub-lessons', type: 'num', min: 2, max: 8, default: 3 },
      { id: 'prog', label: 'Progression', type: 'pick', options: ['Linear build-up', 'Prerequisite chain', 'Themed clusters'], default: 'Linear build-up' },
      { id: 'dpth', label: 'Depth per section', type: 'pick', options: ['Overview', 'Standard', 'In-depth'], default: 'Standard' },
      { id: 'end', label: 'End with', type: 'pick', options: ['End quiz', 'End assignment', 'Recap only', 'None'], default: 'Recap only' },
    ]},
    { title: 'Per section', fields: [
      { id: 'chks', label: 'Checks per section', type: 'num', min: 0, max: 3, default: 1 },
      { id: 'excpts', label: 'Source excerpts (total)', type: 'num', min: 0, max: 3, default: 1 },
      { id: 'wex', label: 'Include a worked example', type: 'bool', default: true },
    ]},
  ],
  quiz: [
    { title: 'Intent', note: 'What should this quiz verify, and for whom?', fields: [
      { id: 'verify', label: 'What it should verify', type: 'area' },
      { id: 'purpose', label: 'Purpose', type: 'pick', options: ['Formative check', 'Readiness gate', 'Diagnostic'], default: 'Formative check' },
      { id: 'concepts', label: 'Concepts to assess', type: 'text' },
      { id: 'lvl', label: 'Level', type: 'pick', options: LVL, default: 'Basic' },
    ]},
    { title: 'Question design', fields: [
      { id: 'qtypes', label: 'Question types', type: 'multi', options: ['Multiple choice', 'True/false', 'Multi-select', 'Short answer', 'Scenario'], default: ['Multiple choice', 'True/false'] },
      { id: 'cog', label: 'Cognitive levels', type: 'multi', options: ['Recall', 'Understand', 'Apply', 'Analyze'], default: ['Recall', 'Understand'] },
      { id: 'diff', label: 'Difficulty mix', type: 'pick', options: ['Mostly easy', 'Balanced', 'Mostly hard', 'Ramped easy→hard'], default: 'Balanced' },
      { id: 'wrong', label: 'Wrong answers', type: 'pick', options: ['Plausible common errors', 'Straightforward'], default: 'Plausible common errors' },
    ]},
    { title: 'Scoring & feedback', fields: [
      { id: 'nq', label: 'Number of questions', type: 'num', min: 3, max: 20, default: 8 },
      { id: 'pass', label: 'Pass mark', type: 'sel', options: ['50%', '60%', '70%', '80%', '90%'], default: '70%' },
      { id: 'show', label: 'Show explanations', type: 'sel', options: ['Immediately', 'After attempt', 'After completion', 'Never'], default: 'After attempt' },
      { id: 'perq', label: 'Write per-question explanations', type: 'bool', default: true },
    ]},
  ],
  'flashcard-set': [
    { title: 'Intent', fields: [
      { id: 'mem', label: 'What to memorise', type: 'text' },
      { id: 'aud', label: 'Audience', type: 'pick', options: AUD, default: 'High school' },
      { id: 'lvl', label: 'Level', type: 'pick', options: LVL, default: 'Basic' },
    ]},
    { title: 'Card design', fields: [
      { id: 'cc', label: 'Card content', type: 'pick', options: ['Key terms → definitions', 'Concept → example', 'Question → answer', 'Image → label'], default: 'Key terms → definitions' },
      { id: 'pull', label: 'Pull cards from', type: 'pick', options: ['Glossary / key terms in source', 'Concepts I focus on', 'Mixed'], default: 'Glossary / key terms in source' },
      { id: 'dir', label: 'Review direction', type: 'pick', options: ['Front→back', 'Back→front', 'Both'], default: 'Front→back' },
      { id: 'hooks', label: 'Add memory hooks', type: 'bool', default: false },
    ]},
    { title: 'Set', fields: [
      { id: 'nc', label: 'Number of cards', type: 'num', min: 5, max: 30, default: 12 },
    ]},
  ],
  'concept-card': [
    { title: 'Intent', fields: [
      { id: 'concept', label: 'The concept', type: 'text' },
      { id: 'aud', label: 'Audience', type: 'pick', options: AUD, default: 'High school' },
      { id: 'lvl', label: 'Level', type: 'pick', options: LVL, default: 'Basic' },
      { id: 'voi', label: 'Voice', type: 'pick', options: VOI, default: 'Plain & friendly' },
    ]},
    { title: 'How to represent it', note: 'A concept lands when learners see it more than one way.', fields: [
      { id: 'incl', label: 'Include', type: 'multi', options: ['Formal definition', 'Everyday analogy', 'Worked example', 'Visual suggestion', 'Common misconception'], default: ['Everyday analogy', 'Common misconception'] },
      { id: 'analogy', label: 'Analogy should relate to…', type: 'text', hint: 'optional — e.g. sports, cooking, everyday life' },
      { id: 'len', label: 'Length per view', type: 'pick', options: ['Tight', 'Standard', 'Expanded'], default: 'Standard' },
    ]},
  ],
  summary: [
    { title: 'Intent', fields: [
      { id: 'what', label: 'What to summarise', type: 'text' },
      { id: 'aud', label: 'Audience', type: 'pick', options: AUD, default: 'High school' },
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
      { id: 'aud', label: 'Audience', type: 'pick', options: AUD, default: 'High school' },
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
      { id: 'lvl', label: 'Level', type: 'pick', options: LVL, default: 'Intermediate' },
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
    { title: 'Intent', fields: [
      { id: 'obj', label: 'Learning objective', type: 'area', hint: 'What the learner demonstrates by doing this' },
      { id: 'aud', label: 'Audience', type: 'pick', options: AUD, default: 'High school' },
      { id: 'lvl', label: 'Level', type: 'pick', options: LVL, default: 'Intermediate' },
    ]},
    { title: 'The task', fields: [
      { id: 'tt', label: 'Task type', type: 'pick', options: ['Short essay', 'Analysis', 'Problem set', 'Project', 'Critique'], default: 'Short essay' },
      { id: 'del', label: 'Deliverable', type: 'pick', options: ['Written text', 'File upload', 'Structured form'], default: 'Written text' },
      { id: 'el', label: 'Expected length', type: 'sel', options: ['~150 words', '~300 words', '~500 words', '~800 words'], default: '~300 words' },
      { id: 'cite', label: 'Require source citations', type: 'bool', default: true },
    ]},
    { title: 'Requirements & rubric', fields: [
      { id: 'req', label: 'Requirements', type: 'num', min: 2, max: 6, default: 3 },
      { id: 'rubric', label: 'Rubric criteria', type: 'num', min: 2, max: 6, default: 3 },
    ]},
  ],
  drill: [
    { title: 'Intent', fields: [
      { id: 'skill', label: 'Skill to drill', type: 'text', hint: 'The one narrow skill this reinforces' },
      { id: 'lvl', label: 'Level', type: 'pick', options: LVL, default: 'Basic' },
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
};

const STEP_META = [
  { label: 'Sources', sub: 'Pick what this object draws on', icon: <Database size={14} /> },
  { label: 'Mark up', sub: 'Comment on what matters', icon: <Highlighter size={14} />, skip: true },
  { label: 'Extract', sub: 'Pull the content into shape', icon: <Layers size={14} />, skip: true },
  { label: 'Define', sub: 'Objective, audience, approach', icon: <Settings2 size={14} /> },
];

const TAG: Record<string, { bg: string; text: string; border: string }> = {
  Use:     { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' },
  Support: { bg: '#E0F2FE', text: '#0C4A6E', border: '#0EA5E9' },
  Ignore:  { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444' },
  Note:    { bg: '#F3E8FF', text: '#6B21A8', border: '#A855F7' },
};

const SCOPES = [
  { id: 'private', label: 'Private', sub: 'Only me' },
  { id: 'team', label: 'Team', sub: 'My team' },
  { id: 'program', label: 'Program', sub: 'Everyone in this program' },
  { id: 'organization', label: 'Organization', sub: 'All programs in the org' },
];

const KINDS = ['Definition', 'Key point', 'Example', 'Quote', 'Fact', 'Procedure'];

const DOC_PARAS = [
  'Bridge is a trick-taking card game played by four players in two partnerships sitting opposite each other.',
  'The deck has 52 cards divided into four suits: spades (♠), hearts (♥), diamonds (♦), and clubs (♣).',
  'Each suit contains 13 cards ranked from Ace (highest) down to 2 (lowest).',
  'Before play begins, one player deals all 52 cards so that each player holds 13 cards.',
  'The auction, or bidding phase, determines the contract and which side will play it.',
  'A bid specifies a number of tricks (from one to seven) and a suit or no-trump.',
  'The side that wins the auction becomes the declaring side; the other side defends.',
  'High-card points (HCP) help evaluate hand strength: Ace = 4, King = 3, Queen = 2, Jack = 1.',
  'A deck has 40 HCP in total; a typical opening hand has at least 12–13 HCP.',
  'The player who first named the winning suit becomes declarer.',
  "Declarer plays both their own hand and their partner's hand (the dummy), laid face-up after the opening lead.",
  'A trick consists of one card played by each of the four players in clockwise order.',
  'The suit led to a trick must be followed if possible; if not, any card may be played.',
  'The highest card of the suit led wins the trick, unless a trump is played.',
  'Play continues until all 13 tricks are played; then score is calculated based on the contract.',
];

/* ─── field renderer ──────────────────────────────────────────── */

function Field({ f, val, set }: { f: FDef; val: any; set: (v: any) => void }) {
  const v = val ?? f.default;
  if (f.type === 'area') return (
    <textarea value={v || ''} onChange={e => set(e.target.value)} placeholder={f.hint || ''} rows={3}
      className="w-full rounded-xl px-3 py-2 resize-none"
      style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', outline: 'none' }} />
  );
  if (f.type === 'text') return (
    <input type="text" value={v || ''} onChange={e => set(e.target.value)} placeholder={f.hint || ''}
      className="w-full rounded-xl px-3 py-2"
      style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', outline: 'none' }} />
  );
  if (f.type === 'pick') return (
    <div className="flex flex-wrap gap-1.5">
      {f.options!.map(o => (
        <button key={o} onClick={() => set(o)} className="px-3 py-1 rounded-full border transition-all"
          style={{ fontSize: 12, fontWeight: v === o ? 650 : 400, background: v === o ? '#0B0F1A' : 'rgba(255,255,255,0.8)', color: v === o ? '#fff' : '#374151', borderColor: v === o ? '#0B0F1A' : 'rgba(0,0,0,0.1)' }}>
          {o}
        </button>
      ))}
    </div>
  );
  if (f.type === 'multi') {
    const arr: string[] = Array.isArray(v) ? v : (f.default || []);
    return (
      <div className="flex flex-wrap gap-1.5">
        {f.options!.map(o => {
          const on = arr.includes(o);
          return (
            <button key={o} onClick={() => set(on ? arr.filter((x: string) => x !== o) : [...arr, o])}
              className="flex items-center gap-1 px-3 py-1 rounded-full border transition-all"
              style={{ fontSize: 12, fontWeight: on ? 650 : 400, background: on ? '#0B0F1A' : 'rgba(255,255,255,0.8)', color: on ? '#fff' : '#374151', borderColor: on ? '#0B0F1A' : 'rgba(0,0,0,0.1)' }}>
              {on && <Check size={11} />}{o}
            </button>
          );
        })}
      </div>
    );
  }
  if (f.type === 'sel') return (
    <div className="relative inline-block">
      <select value={v || f.default} onChange={e => set(e.target.value)}
        className="appearance-none rounded-xl px-3 py-2 pr-7"
        style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', outline: 'none' }}>
        {f.options!.map(o => <option key={o}>{o}</option>)}
      </select>
      <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
    </div>
  );
  if (f.type === 'bool') {
    const on = v ?? f.default;
    return (
      <button onClick={() => set(!on)} className="flex items-center gap-1.5">
        {on ? <ToggleRight size={22} style={{ color: '#059669' }} /> : <ToggleLeft size={22} style={{ color: '#9AA3AF' }} />}
        <span style={{ fontSize: 12, color: on ? '#059669' : '#9AA3AF' }}>{on ? 'On' : 'Off'}</span>
      </button>
    );
  }
  if (f.type === 'num') {
    const n = typeof v === 'number' ? v : (f.default ?? 0);
    return (
      <div className="flex items-center gap-2">
        <button onClick={() => set(Math.max(f.min ?? 0, n - 1))}
          className="w-7 h-7 rounded-full border flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.8)', borderColor: 'rgba(0,0,0,0.1)' }}>
          <Minus size={12} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, minWidth: 20, textAlign: 'center' }}>{n}</span>
        <button onClick={() => set(Math.min(f.max ?? 99, n + 1))}
          className="w-7 h-7 rounded-full border flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.8)', borderColor: 'rgba(0,0,0,0.1)' }}>
          <Plus size={12} />
        </button>
        <span style={{ fontSize: 11, color: '#9AA3AF' }}>{f.min}–{f.max}</span>
      </div>
    );
  }
  return null;
}

/* ─── step content ────────────────────────────────────────────── */

const SOURCE_MODES = [
  { id: 'pdf', label: 'Upload PDF', icon: <Upload size={15} /> },
  { id: 'text', label: 'Paste text', icon: <ClipboardPaste size={15} /> },
  { id: 'youtube', label: 'YouTube link', icon: <Youtube size={15} /> },
  { id: 'prompt', label: 'No source — prompt', icon: <MessageSquare size={15} /> },
];

/* Shared "source is ready" summary card (pdf / text / youtube). */
function SourceReadyCard({ doc, onReplace }: { doc: ParsedDoc; onReplace: () => void }) {
  return (
    <div className="rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.85)', borderColor: 'rgba(0,0,0,0.08)' }}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: '#7C3AED' }}>
          <FileText size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 13.5, fontWeight: 650, color: '#0B1220' }} className="truncate">{doc.fileName}</p>
          <p style={{ fontSize: 12, color: '#6B7280', fontFamily: 'monospace' }}>
            {doc.sentences.length} sentence{doc.sentences.length !== 1 ? 's' : ''} ready to mark up
          </p>
        </div>
        <button type="button" onClick={onReplace}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border shrink-0"
          style={{ fontSize: 12, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
          <RefreshCw size={12} />Replace
        </button>
      </div>
      {doc.sentences.length === 0 && (
        <div className="flex items-start gap-2 mt-3 rounded-xl p-2.5" style={{ background: '#FEF3C7', border: '1px solid #FCD34D' }}>
          <AlertTriangle size={14} style={{ color: '#92400E', marginTop: 1 }} />
          <p style={{ fontSize: 12, color: '#92400E' }}>No usable text was found. Try another source so you can highlight sentences.</p>
        </div>
      )}
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 mt-3 rounded-2xl p-3" style={{ background: '#FEE2E2', border: '1px solid #FCA5A5' }}>
      <AlertTriangle size={15} style={{ color: '#B91C1C', marginTop: 1 }} />
      <p style={{ fontSize: 12.5, color: '#991B1B' }}>{text}</p>
    </div>
  );
}

/* Tutorial Step 1 — choose a source: PDF, pasted text, YouTube, or a prompt. */
function TutorialSource(props: any) {
  const {
    mode, setMode, doc, onReplace,
    parsing, parseError, onFile,
    pasteText, setPasteText, onLoadText,
    ytUrl, setYtUrl, ytLoading, ytError, onFetchYoutube,
    promptText, setPromptText, showMedia,
    media, addImage, addVideo, updateMedia, removeMedia, pickImageAsset,
  } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const pick = (files: FileList | null) => { const f = files?.[0]; if (f) onFile(f); };

  const INTRO: Record<string, string> = {
    pdf: 'Upload the PDF this tutorial is built from. It is read right here in your browser — nothing leaves your device.',
    text: 'Paste the text this tutorial is built from — notes, an article, a transcript. You will mark up its sentences next.',
    youtube: 'Paste a YouTube link and we will pull its transcript to build from. The video needs captions available.',
    prompt: 'No source? Just describe what the tutorial should teach. Generation will build from your prompt — you can skip Mark up and Extract.',
  };

  return (
    <div className="p-5 max-w-2xl">
      {/* mode picker */}
      <div className="flex flex-wrap gap-2 mb-4">
        {SOURCE_MODES.map((m) => {
          const on = mode === m.id;
          return (
            <button key={m.id} onClick={() => setMode(m.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all"
              style={{ fontSize: 12.5, fontWeight: on ? 650 : 500, background: on ? '#7C3AED' : 'rgba(255,255,255,0.8)', color: on ? '#fff' : '#374151', borderColor: on ? '#7C3AED' : 'rgba(0,0,0,0.1)' }}>
              {m.icon}{m.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.2)' }}>
        <p style={{ fontSize: 13, color: '#4C1D95', lineHeight: 1.6 }}>{INTRO[mode]}</p>
      </div>

      {/* ── PDF ── */}
      {mode === 'pdf' && (
        <>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => pick(e.target.files)} />
          {!doc ? (
            <button type="button" onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files); }}
              disabled={parsing}
              className="w-full flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed transition-all"
              style={{ padding: '40px 20px', borderColor: dragOver ? '#7C3AED' : 'rgba(0,0,0,0.14)', background: dragOver ? 'rgba(124,58,237,0.05)' : 'rgba(255,255,255,0.7)', cursor: parsing ? 'default' : 'pointer' }}>
              {parsing ? (
                <><Loader2 size={26} className="animate-spin" style={{ color: '#7C3AED' }} />
                  <p style={{ fontSize: 13.5, fontWeight: 600, color: '#0B1220' }}>Reading your PDF…</p></>
              ) : (
                <><div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white" style={{ background: '#7C3AED' }}><Upload size={22} /></div>
                  <p style={{ fontSize: 14, fontWeight: 650, color: '#0B1220' }}>Drop a PDF here or click to upload</p>
                  <p style={{ fontSize: 12, color: '#9AA3AF' }}>PDF only · stays on this device</p></>
              )}
            </button>
          ) : <SourceReadyCard doc={doc} onReplace={onReplace} />}
          {parseError && <ErrorNote text={parseError} />}
        </>
      )}

      {/* ── Paste text ── */}
      {mode === 'text' && (
        <>
          {!doc ? (
            <>
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={9}
                placeholder="Paste your source text here…"
                className="w-full rounded-2xl px-3 py-2.5 resize-y"
                style={{ fontSize: 13, lineHeight: 1.6, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.85)', outline: 'none' }} />
              <div className="flex items-center justify-between mt-2">
                <span style={{ fontSize: 11.5, color: '#9AA3AF' }}>{pasteText.trim() ? `${pasteText.trim().split(/\s+/).length} words` : 'Notes, an article, a transcript…'}</span>
                <button type="button" onClick={onLoadText} disabled={!pasteText.trim()}
                  className="px-4 py-2 rounded-full transition-all"
                  style={{ fontSize: 12.5, fontWeight: 600, background: pasteText.trim() ? '#0B0F1A' : '#E5E7EB', color: pasteText.trim() ? '#fff' : '#9AA3AF' }}>
                  Use this text →
                </button>
              </div>
            </>
          ) : <SourceReadyCard doc={doc} onReplace={onReplace} />}
        </>
      )}

      {/* ── YouTube ── */}
      {mode === 'youtube' && (
        <>
          {!doc ? (
            <>
              <div className="flex gap-2">
                <input value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…"
                  className="flex-1 rounded-xl px-3 py-2.5"
                  style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.85)', outline: 'none' }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && ytUrl.trim() && !ytLoading) onFetchYoutube(); }} />
                <button type="button" onClick={onFetchYoutube} disabled={!ytUrl.trim() || ytLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white shrink-0"
                  style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 600, opacity: (!ytUrl.trim() || ytLoading) ? 0.7 : 1 }}>
                  {ytLoading ? <Loader2 size={13} className="animate-spin" /> : <Youtube size={14} />}{ytLoading ? 'Fetching…' : 'Fetch transcript'}
                </button>
              </div>
              {ytError && <ErrorNote text={ytError} />}
            </>
          ) : <SourceReadyCard doc={doc} onReplace={onReplace} />}
        </>
      )}

      {/* ── Prompt only ── */}
      {mode === 'prompt' && (
        <>
          <textarea value={promptText} onChange={(e) => setPromptText(e.target.value)} rows={7}
            placeholder="Describe what this tutorial should teach, e.g. 'A beginner tutorial on how contract bridge bidding works, covering opening bids, responses, and basic conventions.'"
            className="w-full rounded-2xl px-3 py-2.5 resize-y"
            style={{ fontSize: 13, lineHeight: 1.6, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.85)', outline: 'none' }} />
          <p style={{ fontSize: 11.5, color: '#9AA3AF', marginTop: 6 }}>
            With no source, there is nothing to mark up — you'll go straight to Define, and generation builds from this prompt.
          </p>
        </>
      )}

      {/* ── Media to include (images + cropped YouTube clips) ── */}
      {showMedia && (
      <div className="mt-6 pt-5" style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
        <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0B1220', marginBottom: 2 }}>Media to include <span style={{ fontWeight: 500, color: '#9AA3AF' }}>· optional</span></p>
        <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 12, lineHeight: 1.5 }}>
          Add images and YouTube clips here. They preview instantly and are showcased — with captions — in the generated tutorial.
        </p>

        <div className="flex items-center gap-2 mb-3">
          <button type="button" onClick={addImage} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all hover:bg-white"
            style={{ fontSize: 12, fontWeight: 600, color: '#0B1220', borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.8)' }}>
            <ImageIcon size={13} />Add image
          </button>
          <button type="button" onClick={addVideo} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all hover:bg-white"
            style={{ fontSize: 12, fontWeight: 600, color: '#0B1220', borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.8)' }}>
            <Youtube size={13} style={{ color: '#EF4444' }} />Add YouTube video
          </button>
        </div>

        {(!media || media.length === 0) ? (
          <div className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-1 py-7"
            style={{ borderColor: 'rgba(0,0,0,0.1)', color: '#9AA3AF' }}>
            <Layers size={18} />
            <p style={{ fontSize: 12 }}>No media yet — images and video clips you add appear in the tutorial.</p>
          </div>
        ) : (
          media.map((m: any) => (
            <div key={m.id} className="mb-3 rounded-2xl border overflow-hidden" style={{ background: 'rgba(255,255,255,0.9)', borderColor: 'rgba(0,0,0,0.08)' }}>
              <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.5)' }}>
                <div className="flex items-center gap-2">
                  {m.kind === 'image' ? <ImageIcon size={13} style={{ color: '#6B7280' }} /> : <Youtube size={13} style={{ color: '#EF4444' }} />}
                  <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#F3F4F6', color: '#374151' }}>{m.kind === 'image' ? 'Image' : 'YouTube clip'}</span>
                </div>
                <button type="button" onClick={() => removeMedia(m.id)} title="Remove"><Trash2 size={13} style={{ color: '#EF4444' }} /></button>
              </div>
              <div className="p-4">
                {m.kind === 'image'
                  ? <ImagePartEditor part={m} onChange={(patch: any) => updateMedia(m.id, patch)} onPickImage={(f: File) => pickImageAsset(m.id, f)} />
                  : <VideoPartEditor part={m} onChange={(patch: any) => updateMedia(m.id, patch)} />}
              </div>
            </div>
          ))
        )}
      </div>
      )}
    </div>
  );
}

function S1({ selected, setSelected, roles, setRoles, urlRefs, setUrlRefs }: any) {
  const [url, setUrl] = useState('');
  return (
    <div className="flex gap-5 p-5">
      <div className="flex-1 min-w-0">
        <p style={{ fontSize: 11.5, fontWeight: 700, color: '#6B7280', letterSpacing: '.06em', marginBottom: 10 }}>SOURCE POOL — Bridge</p>
        <div className="space-y-2">
          {SOURCES.map(s => {
            const on = selected.includes(s.id);
            return (
              <div key={s.id} onClick={() => setSelected((p: string[]) => on ? p.filter((x: string) => x !== s.id) : [...p, s.id])}
                className="flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-all"
                style={{ background: on ? 'rgba(124,58,237,0.06)' : 'rgba(255,255,255,0.7)', borderColor: on ? '#7C3AED' : 'rgba(0,0,0,0.08)' }}>
                <div className="mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all"
                  style={{ borderColor: on ? '#7C3AED' : '#D1D5DB', background: on ? '#7C3AED' : 'transparent' }}>
                  {on && <Check size={11} color="white" />}
                </div>
                <FileText size={15} style={{ color: '#7C3AED', marginTop: 2, flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220' }}>{s.title}</p>
                  <p style={{ fontSize: 11.5, color: '#9AA3AF', fontFamily: 'monospace' }}>{s.kind}{s.pages ? ` · ${s.pages}p` : ''}{s.duration ? ` · ${s.duration}` : ''}</p>
                  {on && (
                    <div className="flex gap-1.5 mt-1.5" onClick={e => e.stopPropagation()}>
                      {(['Primary', 'Supporting', 'Reference'] as const).map(r => (
                        <button key={r} onClick={() => setRoles((p: any) => ({ ...p, [s.id]: r }))}
                          className="px-2 py-0.5 rounded-full text-xs border transition-all"
                          style={{ background: roles[s.id] === r ? '#0B0F1A' : 'rgba(255,255,255,0.8)', color: roles[s.id] === r ? '#fff' : '#6B7280', borderColor: roles[s.id] === r ? '#0B0F1A' : 'rgba(0,0,0,0.1)' }}>
                          {r}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <span className="shrink-0 px-1.5 py-0.5 rounded text-xs" style={{ background: '#F3F4F6', color: '#6B7280' }}>{s.kind}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-4">
          <p style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>References — extra links</p>
          <div className="flex gap-2 mb-2">
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste a URL…"
              className="flex-1 rounded-xl px-3 py-2" style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' }}
              onKeyDown={e => { if (e.key === 'Enter' && url) { setUrlRefs((p: string[]) => [...p, url]); setUrl(''); } }} />
            <button onClick={() => { if (url) { setUrlRefs((p: string[]) => [...p, url]); setUrl(''); } }}
              className="px-3 py-2 rounded-xl text-white" style={{ background: '#0B0F1A', fontSize: 12 }}>＋ Add</button>
          </div>
          {urlRefs.map((u: string, i: number) => (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-xl mb-1" style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.06)' }}>
              <span style={{ fontSize: 12, flex: 1 }} className="truncate">{u}</span>
              <button onClick={() => setUrlRefs((p: string[]) => p.filter((_: any, j: number) => j !== i))}><X size={12} style={{ color: '#9AA3AF' }} /></button>
            </div>
          ))}
        </div>
      </div>
      <div className="w-60 shrink-0">
        <div className="rounded-2xl p-4 border border-white/50" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(8px)' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0B1220', marginBottom: 6 }}>Add a source</p>
          <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>Upload PDF / DOCX / slides / text. Saved to your library — upload once, use many times.</p>
          <div className="border-2 border-dashed rounded-xl p-4 text-center mb-3" style={{ borderColor: 'rgba(0,0,0,0.12)' }}>
            <p style={{ fontSize: 12, color: '#9AA3AF' }}>Drop files or click to upload</p>
          </div>
          <p style={{ fontSize: 12, color: '#9AA3AF', marginBottom: 6 }}>or name a source…</p>
          <div className="flex gap-2">
            <input placeholder="e.g. Bridge rulebook" className="flex-1 rounded-xl px-2 py-1.5"
              style={{ fontSize: 12, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' }} />
            <button className="px-2 py-1.5 rounded-xl text-white" style={{ background: '#0B0F1A' }}><Plus size={13} /></button>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#6B7280', marginTop: 8 }}>
          <strong style={{ color: '#0B1220' }}>{selected.length}</strong> selected · pick several to combine into one build.
        </p>
      </div>
    </div>
  );
}

function S2({ highlights, setHighlights, activeTag, setActiveTag, aiSuggestions, setAiSuggestions, docParas, docTitle, pages, query, setQuery, onSuggest, suggesting, suggestError }: any) {
  const [aiThinking, setAiThinking] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const paras: string[] = docParas;
  const busy = onSuggest ? suggesting : aiThinking;

  const toggle = (idx: number) => {
    const exists = highlights.find((h: any) => h.idx === idx);
    if (exists) setHighlights((p: any[]) => p.filter((h: any) => h.idx !== idx));
    else setHighlights((p: any[]) => [...p, { idx, tag: activeTag, text: paras[idx], page: pages?.[idx] ?? 1, comment: '' }]);
  };

  const suggest = () => {
    // Tutorial: real server-side LLM call (key stays on the backend).
    if (onSuggest) { onSuggest(aiQuery); return; }
    // Other object types (no uploaded doc / no backend): local heuristic fallback.
    setAiThinking(true);
    setTimeout(() => {
      const SIGNAL = /\b(is|are|means|refers?|defined|definition|key|important|must|always|never|first|because|therefore|consists?|includes?)\b/i;
      const scored = paras
        .map((text, idx) => {
          const words = text.split(/\s+/).length;
          let score = 0;
          if (SIGNAL.test(text)) score += 3;
          if (words >= 8 && words <= 40) score += 2;
          if (/\d/.test(text)) score += 1;
          return { idx, score, words };
        })
        .filter((s) => !highlights.find((h: any) => h.idx === s.idx))
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.min(6, Math.max(3, Math.round(paras.length / 6))))
        .map((s) => s.idx)
        .sort((a, b) => a - b);
      setAiSuggestions(scored);
      setAiThinking(false);
    }, 700);
  };

  const highlightAll = () => {
    const q = (query || '').trim().toLowerCase();
    if (!q) return;
    const matches = paras
      .map((text, idx) => ({ text, idx }))
      .filter((p) => p.text.toLowerCase().includes(q) && !highlights.find((h: any) => h.idx === p.idx))
      .map((p) => ({ idx: p.idx, tag: activeTag, text: p.text, page: pages?.[p.idx] ?? 1, comment: '' }));
    if (matches.length) setHighlights((p: any[]) => [...p, ...matches]);
  };

  // Highlight every sentence in the document with the active tag.
  const selectAll = () => {
    const additions = paras
      .map((text, idx) => ({ text, idx }))
      .filter((p) => !highlights.find((h: any) => h.idx === p.idx))
      .map((p) => ({ idx: p.idx, tag: activeTag, text: p.text, page: pages?.[p.idx] ?? 1, comment: '' }));
    if (additions.length) setHighlights((p: any[]) => [...p, ...additions]);
  };

  const clearAll = () => setHighlights([]);

  const acceptAll = () => {
    const newHl = aiSuggestions
      .filter((i: number) => !highlights.find((h: any) => h.idx === i))
      .map((i: number) => ({ idx: i, tag: 'Use', text: paras[i], page: pages?.[i] ?? 1, comment: '' }));
    setHighlights((p: any[]) => [...p, ...newHl]);
    setAiSuggestions([]);
  };

  const q = (query || '').trim().toLowerCase();

  return (
    <div className="flex gap-5 p-5">
      <div className="flex-1 min-w-0">
        <div className="rounded-2xl p-4 mb-4" style={{ background: '#FEF3C7', border: '1px solid #FCD34D' }}>
          <p style={{ fontSize: 12.5, color: '#92400E', lineHeight: 1.6 }}>
            Read the source and <strong>highlight what matters</strong> — mark passages to use, support, ignore, or note.
            <strong> Search to highlight every match at once</strong> or let <strong>AI suggest highlights</strong>.
            Your highlights become the <strong>commented-sources artifact</strong>. Optional — you can skip.
          </p>
        </div>

        {/* Tag selector */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span style={{ fontSize: 12, color: '#6B7280' }}>Highlight as:</span>
          {Object.keys(TAG).map(tag => {
            const c = TAG[tag];
            return (
              <button key={tag} onClick={() => setActiveTag(tag)}
                className="px-3 py-1 rounded-full border-2 transition-all"
                style={{ fontSize: 12, background: c.bg, color: c.text, borderColor: activeTag === tag ? c.border : 'transparent', textDecoration: tag === 'Ignore' ? 'line-through' : 'none' }}>
                {tag}
              </button>
            );
          })}
          <span style={{ fontSize: 10.5, color: '#C4CBD4' }}>Click sentence to highlight · click again to clear</span>
          <div className="flex items-center gap-1.5 ml-auto">
            <button onClick={selectAll} disabled={paras.length === 0}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full border transition-all"
              style={{ fontSize: 11.5, fontWeight: 600, color: paras.length === 0 ? '#C4CBD4' : '#0B1220', borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.85)' }}>
              <Check size={11} />Select all
            </button>
            {highlights.length > 0 && (
              <button onClick={clearAll}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full border transition-all"
                style={{ fontSize: 11.5, fontWeight: 500, color: '#6B7280', borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.85)' }}>
                <X size={11} />Clear all
              </button>
            )}
          </div>
        </div>

        {/* Find + AI */}
        <div className="flex gap-2 mb-3">
          <input value={query || ''} onChange={e => setQuery(e.target.value)} placeholder="Find in document…" className="flex-1 rounded-xl px-3 py-2"
            style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' }}
            onKeyDown={e => { if (e.key === 'Enter') highlightAll(); }} />
          <button onClick={highlightAll} className="px-3 py-2 rounded-xl text-white text-xs font-semibold" style={{ background: '#0B0F1A' }}>Highlight all</button>
        </div>
        <div className="flex flex-col gap-2 mb-4 p-3 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.6)', borderColor: 'rgba(0,0,0,0.08)' }}>
          <div className="flex gap-2">
            <input value={aiQuery} onChange={e => setAiQuery(e.target.value)} placeholder="What should AI look for? (optional)"
              className="flex-1 bg-transparent outline-none" style={{ fontSize: 12.5 }}
              onKeyDown={e => { if (e.key === 'Enter' && !busy) suggest(); }} />
            <button onClick={suggest} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white"
              style={{ background: '#0B0F1A', fontSize: 12, fontWeight: 600, opacity: busy ? 0.7 : 1 }}>
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}{busy ? 'Thinking…' : '✦ Suggest'}
            </button>
          </div>
          {suggestError && (
            <div className="flex items-start gap-1.5" style={{ fontSize: 11.5, color: '#B91C1C' }}>
              <AlertTriangle size={12} style={{ marginTop: 1 }} />{suggestError}
            </div>
          )}
        </div>

        {aiSuggestions.length > 0 && (
          <div className="flex items-center gap-3 mb-3 px-4 py-2 rounded-2xl" style={{ background: '#FEF3C7', border: '1px solid #FCD34D' }}>
            <Sparkles size={13} style={{ color: '#D97706' }} />
            <span style={{ fontSize: 12, color: '#92400E', flex: 1 }}>AI suggested {aiSuggestions.length} highlights (dashed) — review, then</span>
            <button onClick={acceptAll} className="px-3 py-1 rounded-full text-white text-xs font-semibold" style={{ background: '#D97706' }}>Accept all</button>
            <button onClick={() => setAiSuggestions([])} style={{ fontSize: 12, color: '#92400E' }}>Dismiss</button>
          </div>
        )}

        {/* Document */}
        <div className="rounded-2xl p-4 border" style={{ background: 'rgba(255,255,255,0.85)', borderColor: 'rgba(0,0,0,0.08)' }}>
          <div className="flex items-center justify-between mb-3">
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0B1220' }} className="truncate">{docTitle}</span>
            <span className="px-2 py-0.5 rounded text-xs shrink-0" style={{ background: '#F3F4F6', color: '#6B7280', fontFamily: 'monospace' }}>
              {pages?.length ? `p. ${pages[0]}–${pages[pages.length - 1]}` : `${paras.length} sentences`}
            </span>
          </div>
          {paras.length === 0 && (
            <p style={{ fontSize: 13, color: '#9AA3AF' }}>No document text to mark up. Go back to step 1 and upload a text-based PDF.</p>
          )}
          {paras.map((para, idx) => {
            const hl = highlights.find((h: any) => h.idx === idx);
            const isAi = aiSuggestions.includes(idx);
            const isMatch = q.length > 0 && para.toLowerCase().includes(q);
            const c = hl ? TAG[hl.tag] : null;
            return (
              <p key={idx} onClick={() => toggle(idx)}
                className="mb-1.5 rounded px-1 py-0.5 cursor-pointer transition-all"
                style={{
                  fontSize: 13.5, lineHeight: 1.7, fontFamily: 'Georgia, serif', color: '#1F2937',
                  background: hl ? c!.bg : isAi ? 'rgba(254,243,199,0.5)' : isMatch ? 'rgba(14,165,233,0.12)' : 'transparent',
                  borderBottom: isAi && !hl ? '2px dashed #F59E0B' : 'none',
                  textDecoration: hl?.tag === 'Ignore' ? 'line-through' : 'none',
                }}>{para}</p>
            );
          })}
        </div>
      </div>

      {/* Side panel */}
      <div className="w-60 shrink-0">
        <p style={{ fontSize: 12, fontWeight: 700, color: '#0B1220', marginBottom: 8 }}>Highlights & comments</p>
        {highlights.length === 0 && <p style={{ fontSize: 12, color: '#9AA3AF' }}>No highlights yet. Click any sentence in the document.</p>}
        {highlights.map((h: any, i: number) => {
          const c = TAG[h.tag];
          return (
            <div key={i} className="mb-2 rounded-xl p-3 border" style={{ background: c.bg, borderColor: c.border }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{ background: c.border }}>{h.tag}</span>
                <button onClick={() => setHighlights((p: any[]) => p.filter((_: any, j: number) => j !== i))}><X size={12} style={{ color: c.text }} /></button>
              </div>
              <p style={{ fontSize: 11.5, color: c.text, lineHeight: 1.5, marginBottom: 5 }} className="line-clamp-3">{h.text}</p>
              <input value={h.comment}
                onChange={e => setHighlights((p: any[]) => p.map((x: any, j: number) => j === i ? { ...x, comment: e.target.value } : x))}
                placeholder="Comment…" className="w-full rounded-lg px-2 py-1"
                style={{ fontSize: 11, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.7)', outline: 'none' }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function S3({ extracts, setExtracts, markHighlights, docTitle, typeNoun }: any) {
  const pullable: any[] = (markHighlights || []).filter((h: any) => h.tag === 'Use' || h.tag === 'Support');
  const hlCount = pullable.length;

  const KIND_FOR: Record<string, string> = { Use: 'Key point', Support: 'Fact' };

  const pull = () => {
    const existing = new Set(extracts.filter((e: any) => e.fromHl).map((e: any) => e.text));
    const newItems = pullable
      .filter((h: any) => !existing.has(h.text))
      .map((h: any, i: number) => ({
        id: Date.now() + i,
        kind: KIND_FOR[h.tag] || 'Key point',
        from: h.page ? `${docTitle} · p. ${h.page}` : docTitle,
        fromHl: true,
        text: h.comment ? `${h.text} — ${h.comment}` : h.text,
      }));
    setExtracts((p: any[]) => [...p, ...newItems]);
  };

  return (
    <div className="p-5 max-w-2xl">
      <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.08)' }}>
        <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
          <strong>Extraction distills your marked-up sources into the exact content units this object is built from.</strong>{' '}
          You turn what you highlighted into a short list of discrete, editable pieces. Nothing is guessed from the raw pile; it comes from your markup.
        </p>
      </div>
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.7)', borderColor: 'rgba(0,0,0,0.08)' }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220' }}>{hlCount} highlight{hlCount !== 1 ? 's' : ''} carried from Mark up</p>
            <p style={{ fontSize: 12, color: '#6B7280' }}>{hlCount > 0 ? 'Converts your Use/Support marks 1:1 into content units' : 'Go back to Mark up and tag sentences as Use or Support to pull them here'}</p>
          </div>
          <button onClick={pull} disabled={hlCount === 0} className="px-4 py-2 rounded-full transition-all" style={{ background: hlCount === 0 ? '#E5E7EB' : '#0B0F1A', color: hlCount === 0 ? '#9AA3AF' : '#fff', fontSize: 12.5, fontWeight: 600 }}>→ Pull into content units</button>
        </div>
        <div className="p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.7)', borderColor: 'rgba(0,0,0,0.08)' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220', marginBottom: 8 }}>Shape with AI</p>
          <div className="flex gap-2">
            <input placeholder="e.g. one definition + one example, short" className="flex-1 rounded-xl px-3 py-2"
              style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' }} />
            <button className="px-4 py-2 rounded-xl text-white" style={{ background: '#0B0F1A', fontSize: 13 }}>Extract</button>
          </div>
        </div>
        <button onClick={() => setExtracts((p: any[]) => [...p, { id: Date.now(), kind: 'Key point', from: '', fromHl: false, text: '' }])}
          className="flex items-center gap-2 w-full px-4 py-3 rounded-2xl border border-dashed"
          style={{ fontSize: 13, color: '#6B7280', borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.5)' }}>
          <Plus size={14} />Write one yourself → + Add manually
        </button>
      </div>

      {extracts.length === 0
        ? <p style={{ fontSize: 13, color: '#9AA3AF' }}>No content units yet. <strong>Pull from your highlights</strong> above (the usual path), shape some with AI, or add one by hand.</p>
        : (
          <div>
            <p style={{ fontSize: 11.5, fontWeight: 700, color: '#6B7280', letterSpacing: '.06em', marginBottom: 8 }}>EXTRACTED CONTENT UNITS</p>
            {extracts.map((e: any, i: number) => (
              <div key={e.id} className="mb-3 p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.85)', borderColor: 'rgba(0,0,0,0.08)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span style={{ fontSize: 11, color: '#9AA3AF', fontFamily: 'monospace' }}>#{i + 1}</span>
                  <select value={e.kind} onChange={ev => setExtracts((p: any[]) => p.map((x: any) => x.id === e.id ? { ...x, kind: ev.target.value } : x))}
                    className="rounded-lg px-2 py-1" style={{ fontSize: 12, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' }}>
                    {KINDS.map(k => <option key={k}>{k}</option>)}
                  </select>
                  {e.fromHl && <span className="px-2 py-0.5 rounded text-xs" style={{ background: '#FEF3C7', color: '#92400E' }}>✎ from highlight</span>}
                  <button onClick={() => setExtracts((p: any[]) => p.filter((x: any) => x.id !== e.id))} className="ml-auto">
                    <Trash2 size={13} style={{ color: '#EF4444' }} />
                  </button>
                </div>
                <input value={e.from} onChange={ev => setExtracts((p: any[]) => p.map((x: any) => x.id === e.id ? { ...x, from: ev.target.value } : x))}
                  placeholder="from which source…" className="w-full rounded-lg px-2 py-1 mb-2"
                  style={{ fontSize: 12, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' }} />
                <textarea value={e.text} onChange={ev => setExtracts((p: any[]) => p.map((x: any) => x.id === e.id ? { ...x, text: ev.target.value } : x))}
                  rows={2} placeholder="Passage or note…" className="w-full rounded-lg px-2 py-1 resize-none"
                  style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' }} />
              </div>
            ))}
            <p style={{ fontSize: 12, color: '#6B7280' }}>These {extracts.length} units become the raw material the {typeNoun} is generated from.</p>
          </div>
        )}
    </div>
  );
}

function S4({ typeId, title, setTitle, scope, setScope, fv, setF, srcCount, extCount, hlCount }: any) {
  const groups = CFG[typeId] || [];
  const blueprint = (() => {
    const chips: string[] = [];
    groups.forEach((g: GDef) => g.fields.forEach((f: FDef) => {
      if (f.type === 'num') {
        const v = fv[f.id] ?? f.default;
        if (v > 0) chips.push(`${v} ${f.label.toLowerCase()}`);
      }
    }));
    return `Drawing on ${srcCount} source${srcCount !== 1 ? 's' : ''}${extCount > 0 ? ` · ${extCount} extract${extCount !== 1 ? 's' : ''}` : ''}${chips.length > 0 ? ' · ' + chips.slice(0, 3).join(' · ') : ''}. Everything editable after generating.`;
  })();

  return (
    <div className="p-5 max-w-2xl">
      <div className="mb-4">
        <p style={{ fontSize: 11.5, fontWeight: 700, color: '#6B7280', letterSpacing: '.06em', marginBottom: 5 }}>TITLE</p>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={`e.g. ${fmtType(typeId)} on bidding basics`}
          className="w-full rounded-2xl px-4 py-3"
          style={{ fontSize: 15, fontWeight: 600, color: '#0B1220', border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.85)', outline: 'none' }} />
      </div>
      <div className="mb-4">
        <p style={{ fontSize: 11.5, fontWeight: 700, color: '#6B7280', letterSpacing: '.06em', marginBottom: 5 }}>VISIBILITY WHEN CREATED</p>
        <div className="flex flex-wrap gap-2">
          {SCOPES.map(s => (
            <button key={s.id} onClick={() => setScope(s.id)}
              className="px-3 py-1.5 rounded-full border transition-all"
              style={{ fontSize: 12, fontWeight: scope === s.id ? 650 : 400, background: scope === s.id ? '#0B0F1A' : 'rgba(255,255,255,0.8)', color: scope === s.id ? '#fff' : '#374151', borderColor: scope === s.id ? '#0B0F1A' : 'rgba(0,0,0,0.1)' }}>
              {s.label} <span style={{ opacity: 0.7, fontSize: 10.5 }}>— {s.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {groups.map((g: GDef, gi: number) => (
        <div key={gi} className="mb-4 p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.7)', borderColor: 'rgba(0,0,0,0.08)' }}>
          {g.title && <p style={{ fontSize: 13, fontWeight: 700, color: '#0B1220', marginBottom: g.note ? 2 : 10 }}>{g.title}</p>}
          {g.note && <p style={{ fontSize: 12, color: '#9AA3AF', marginBottom: 10 }}>{g.note}</p>}
          {g.fields.map((f: FDef) => (
            <div key={f.id} className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <p style={{ fontSize: 12.5, fontWeight: 500, color: '#374151' }}>{f.label}</p>
                {f.type === 'bool' && <Field f={f} val={fv[f.id]} set={v => setF(f.id, v)} />}
              </div>
              {f.type !== 'bool' && <Field f={f} val={fv[f.id]} set={v => setF(f.id, v)} />}
            </div>
          ))}
        </div>
      ))}

      <div className="p-4 rounded-2xl" style={{ background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.2)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#059669', marginBottom: 4 }}>What will be generated</p>
        <p style={{ fontSize: 12.5, color: '#065F46' }}>{blueprint}</p>
      </div>
    </div>
  );
}

/* ─── Object Editor ───────────────────────────────────────────── */

const DRAFT_PARTS = [
  { id: 'p1', type: 'rich-text', label: 'Introduction', body: 'Bridge is a trick-taking card game played by four players in two partnerships. Each player holds 13 cards, and the goal is to win tricks — rounds of play where each player contributes one card.' },
  { id: 'p2', type: 'concept-card', label: 'Concept', concept: 'High-Card Points (HCP)', plain: 'A way to measure how strong your hand is: Ace = 4, King = 3, Queen = 2, Jack = 1.', misc: 'HCP only counts the top four honors — nines and tens add nothing.' },
  { id: 'p3', type: 'question', label: 'Knowledge check', prompt: 'How many HCP does a King count as?', options: ['1', '2', '3', '4'], correct: 2, exp: 'A King counts as 3 HCP.' },
  { id: 'p4', type: 'rich-text', label: 'Summary', body: 'In this lesson you learned that Bridge uses HCP to evaluate hand strength. The four honors — Ace, King, Queen, Jack — account for all 40 HCP in the deck.' },
];

function ImagePartEditor({ part, onChange, onPickImage }: any) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isUploaded = typeof part.url === 'string' && part.url.startsWith('data:');
  return (
    <div>
      {part.uploading ? (
        <div className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 mb-3" style={{ borderColor: 'rgba(124,58,237,0.3)', color: '#7C3AED' }}>
          <Loader2 size={22} className="animate-spin" />
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>Uploading{part.fileName ? ` ${part.fileName}` : ''}…</span>
        </div>
      ) : part.url ? (
        <div className="mb-3 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
          <img src={part.url} alt={part.caption || ''} style={{ width: '100%', display: 'block' }} />
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()} className="w-full flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-8 mb-3 transition-colors hover:bg-white/60"
          style={{ borderColor: 'rgba(0,0,0,0.15)', color: '#6B7280' }}>
          <ImageIcon size={22} />
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>Click to upload an image</span>
          <span style={{ fontSize: 11, color: '#9AA3AF' }}>PNG, JPG, GIF — or paste a URL below</span>
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => onPickImage(e.target.files?.[0])} />
      <div className="flex items-center gap-2 mb-2">
        <input value={isUploaded ? '' : part.url} onChange={e => onChange({ url: e.target.value, fileName: undefined })}
          placeholder={isUploaded ? `Uploaded: ${part.fileName || 'image'}` : '…or paste an image URL'}
          disabled={isUploaded}
          className="flex-1 rounded-xl px-3 py-2" style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' }} />
        {part.url
          ? <button onClick={() => onChange({ url: '', fileName: undefined })} className="px-2.5 py-2 rounded-xl border text-xs shrink-0" style={{ color: '#6B7280', borderColor: 'rgba(0,0,0,0.1)' }}>Remove</button>
          : <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-white text-xs shrink-0" style={{ background: '#0B0F1A' }}><Upload size={12} />Upload</button>}
      </div>
      <input value={part.caption} onChange={e => onChange({ caption: e.target.value })} placeholder="Caption (shown under the image on the tutorial)"
        className="w-full rounded-xl px-3 py-2" style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' }} />
    </div>
  );
}

function VideoPartEditor({ part, onChange }: any) {
  const id = part.videoId || parseYtId(part.url || '');
  const start = parseTimestamp(part.startText || '');
  const end = parseTimestamp(part.endText || '');
  const badRange = start != null && end != null && end <= start;
  const params = new URLSearchParams();
  if (start) params.set('start', String(start));
  if (end && !badRange) params.set('end', String(end));
  const embedSrc = id ? `https://www.youtube.com/embed/${id}${params.toString() ? `?${params}` : ''}` : '';
  const field: React.CSSProperties = { fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' };
  const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 3, display: 'block' };
  return (
    <div>
      <input value={part.url} onChange={e => { const v = e.target.value; onChange({ url: v, videoId: parseYtId(v) }); }}
        placeholder="Paste a YouTube link (youtube.com/watch?v=… or youtu.be/…)"
        className="w-full rounded-xl px-3 py-2 mb-2" style={field} />
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1">
          <label style={lbl}>Start (m:ss)</label>
          <input value={part.startText} onChange={e => onChange({ startText: e.target.value })} placeholder="0:00"
            className="w-full rounded-xl px-3 py-2" style={field} />
        </div>
        <div className="flex-1">
          <label style={lbl}>End (m:ss)</label>
          <input value={part.endText} onChange={e => onChange({ endText: e.target.value })} placeholder="e.g. 2:30"
            className="w-full rounded-xl px-3 py-2" style={field} />
        </div>
      </div>
      {badRange && <p style={{ color: '#DC2626', fontSize: 11.5, marginBottom: 6 }}>End time must be after the start time.</p>}
      <input value={part.caption} onChange={e => onChange({ caption: e.target.value })} placeholder="Caption (optional)"
        className="w-full rounded-xl px-3 py-2" style={field} />
      {embedSrc ? (
        <div className="mt-3" style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 14, overflow: 'hidden', background: '#000' }}>
          <iframe src={embedSrc} title="preview" allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
        </div>
      ) : part.url ? (
        <p style={{ fontSize: 11.5, color: '#DC2626', marginTop: 6 }}>Couldn't read a YouTube video id from that link.</p>
      ) : null}
    </div>
  );
}

function AskAiPanel({ part, onApply, onClose }: any) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const chips: string[] = part.type === 'question'
    ? ['Make it harder', 'Simplify the wording', 'Improve the explanation', 'Rewrite the wrong answers']
    : part.type === 'concept-card'
      ? ['Make it simpler', 'Add a clearer example', 'Tighten the definition', 'Sharpen the misconception']
      : ['Make it simpler', 'Tighten', 'More vivid', 'Match the reading level'];

  const run = async (instruction: string) => {
    const ins = instruction.trim();
    if (!ins || busy) return;
    setBusy(true); setErr(null);
    try {
      const edited = await editTutorialBlock(part, ins);
      const { id: _id, type: _type, ...fields } = edited;
      onApply(fields);
      setText('');
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const field: React.CSSProperties = { fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' };
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {chips.map(q => (
          <button key={q} disabled={busy} onClick={() => run(q)} className="px-2.5 py-1 rounded-full border text-xs transition-all"
            style={{ background: '#FEF3C7', borderColor: '#FCD34D', color: '#92400E', opacity: busy ? 0.55 : 1 }}>{q}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)} disabled={busy}
          onKeyDown={e => { if (e.key === 'Enter') run(text); }}
          placeholder="Tell the AI how to change this block…" className="flex-1 rounded-xl px-3 py-2" style={field} />
        <button onClick={() => run(text)} disabled={busy || !text.trim()} className="px-3 py-2 rounded-xl text-white flex items-center"
          style={{ background: '#0B0F1A', opacity: busy || !text.trim() ? 0.6 : 1 }}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        </button>
      </div>
      {busy && <p style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 6 }}>Rewriting this block with AI…</p>}
      {err && <p style={{ fontSize: 11.5, color: '#DC2626', marginTop: 6 }}>{err}</p>}
    </div>
  );
}

function EditPanel({ part, onChange, onClose }: any) {
  const field: React.CSSProperties = { fontSize: 13, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.85)', outline: 'none' };
  const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 3, display: 'block' };
  const setOption = (i: number, val: string) =>
    onChange({ options: (part.options || ['', '', '', '']).map((o: string, idx: number) => (idx === i ? val : o)) });
  return (
    <div className="space-y-2.5">
      <div>
        <label style={lbl}>Label</label>
        <input value={part.label || ''} onChange={e => onChange({ label: e.target.value })}
          className="w-full rounded-xl px-3 py-2" style={field} />
      </div>

      {part.type === 'rich-text' && (
        <div>
          <label style={lbl}>Body</label>
          <textarea value={part.body || ''} onChange={e => onChange({ body: e.target.value })} rows={5}
            className="w-full rounded-xl px-3 py-2 resize-y" style={field} />
        </div>
      )}

      {part.type === 'concept-card' && (
        <>
          <div>
            <label style={lbl}>Concept</label>
            <input value={part.concept || ''} onChange={e => onChange({ concept: e.target.value })}
              className="w-full rounded-xl px-3 py-2" style={field} />
          </div>
          <div>
            <label style={lbl}>Plain-language explanation</label>
            <textarea value={part.plain || ''} onChange={e => onChange({ plain: e.target.value })} rows={3}
              className="w-full rounded-xl px-3 py-2 resize-y" style={field} />
          </div>
          <div>
            <label style={lbl}>Common misconception</label>
            <input value={part.misc || ''} onChange={e => onChange({ misc: e.target.value })}
              className="w-full rounded-xl px-3 py-2" style={field} />
          </div>
        </>
      )}

      {part.type === 'question' && (
        <>
          <div>
            <label style={lbl}>Question</label>
            <textarea value={part.prompt || ''} onChange={e => onChange({ prompt: e.target.value })} rows={2}
              className="w-full rounded-xl px-3 py-2 resize-y" style={field} />
          </div>
          <div>
            <label style={lbl}>Options · click the circle to mark the correct one</label>
            <div className="space-y-1.5">
              {(part.options || ['', '', '', '']).map((o: string, oi: number) => {
                const isCorrect = oi === (part.correct ?? 0);
                return (
                  <div key={oi} className="flex items-center gap-2">
                    <button type="button" onClick={() => onChange({ correct: oi })}
                      className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                      style={{ borderColor: isCorrect ? '#059669' : '#D1D5DB', background: isCorrect ? 'rgba(5,150,105,0.1)' : 'transparent' }}>
                      {isCorrect && <Check size={11} style={{ color: '#059669' }} />}
                    </button>
                    <input value={o} onChange={e => setOption(oi, e.target.value)} placeholder={`Option ${oi + 1}`}
                      className="flex-1 rounded-xl px-3 py-1.5" style={field} />
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <label style={lbl}>Explanation</label>
            <textarea value={part.exp || ''} onChange={e => onChange({ exp: e.target.value })} rows={2}
              className="w-full rounded-xl px-3 py-2 resize-y" style={field} />
          </div>
        </>
      )}

      <button onClick={onClose} className="px-3 py-1.5 rounded-full text-white text-xs font-semibold" style={{ background: '#059669' }}>✓ Done</button>
    </div>
  );
}

function ObjEditor({ typeId, title, scope, fv, generatedParts, srcCount, extCount, hlCount, onBack, onDone }: any) {
  const { addObject } = useApp();
  const [parts, setParts] = useState(
    Array.isArray(generatedParts) && generatedParts.length ? generatedParts : DRAFT_PARTS,
  );
  const [editId, setEditId] = useState<string | null>(null);
  const [aiId, setAiId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const displayTitle = title || `${fmtType(typeId)} on Bidding Basics`;
  const briefObjective = (fv?.obj as string)?.trim() || 'After this tutorial, the learner can apply the key ideas from the source.';
  const briefChips: string[] = typeId === 'tutorial'
    ? [fv?.aud || 'High school', fv?.lvl || 'Basic', fv?.prog || 'Linear build-up', fv?.dpth || 'Standard'].filter(Boolean)
    : ['High school', 'Basic', 'Plain & friendly', 'Explain → check'];

  const [docTitle, setDocTitle] = useState<string>(displayTitle);
  const [objective, setObjective] = useState<string>(briefObjective);
  const [savedNote, setSavedNote] = useState(false);
  const savedId = useRef<string | null>(null);

  const updatePart = (id: string, patch: Record<string, any>) =>
    setParts((prev: any[]) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const addBlock = (type: 'rich-text' | 'concept-card' | 'question') => {
    const id = `new-${Date.now()}`;
    const base =
      type === 'rich-text' ? { id, type, label: 'New section', body: '' }
        : type === 'concept-card' ? { id, type, label: 'Concept', concept: '', plain: '', misc: '' }
          : { id, type, label: 'Knowledge check', prompt: '', options: ['', '', '', ''], correct: 0, exp: '' };
    setParts((prev: any[]) => [...prev, base]);
    setAiId(null);
    setEditId(id);
  };

  const buildBlocks = () =>
    parts.map((p: any, i: number) => {
      const id = `blk-${Date.now()}-${i}`;
      if (p.type === 'concept-card')
        return { id, type: 'concept-card', content: { term: p.concept || p.label || '', definition: p.plain || '', example: p.misc || '' } };
      if (p.type === 'question')
        return { id, type: 'quiz', content: { questions: [{ question: p.prompt || '', type: 'multiple-choice', options: p.options || [], correct: p.correct ?? 0, explanation: p.exp || '' }] } };
      if (p.type === 'image')
        return { id, type: 'image', content: { url: p.url || '', caption: p.caption || '', alt: p.caption || '' } };
      if (p.type === 'video')
        return { id, type: 'video-embed', content: { provider: 'youtube', url: p.url || '', videoId: p.videoId || parseYtId(p.url || ''), start: parseTimestamp(p.startText || ''), end: parseTimestamp(p.endText || ''), caption: p.caption || '' } };
      return { id, type: 'rich-text', content: { text: p.body || p.plain || p.label || '' } };
    });

  const onPickImage = async (id: string, file?: File) => {
    if (!file) return;
    if (supabaseEnabled) {
      updatePart(id, { uploading: true, fileName: file.name });
      try {
        const url = await uploadImage(file);
        updatePart(id, { url, uploading: false });
        return;
      } catch (e) {
        console.warn('[supabase] image upload failed, using inline copy:', errorMessage(e));
      }
    }
    const reader = new FileReader();
    reader.onload = () => updatePart(id, { url: String(reader.result), fileName: file.name, uploading: false });
    reader.readAsDataURL(file);
  };

  const save = (status: 'draft' | 'in-review') => {
    const id = addObject({
      id: savedId.current || undefined,
      type: typeId,
      title: (docTitle || displayTitle).trim(),
      status,
      description: objective.trim(),
      estimatedTime: `${Math.max(5, parts.length * 3)} min`,
      blocks: buildBlocks() as any,
      tags: briefChips,
      sourceIds: [],
    });
    savedId.current = id;
    return id;
  };

  const handleSaveDraft = () => {
    save('draft');
    setSavedNote(true);
    setTimeout(() => onDone(), 650);
  };

  if (submitted) return (
    <div className="flex flex-col items-center justify-center p-10 text-center min-h-[50vh]">
      <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: '#FEF3C7' }}>
        <Check size={24} style={{ color: '#D97706' }} />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0B1220', marginBottom: 6 }}>Submitted for review</h2>
      <p style={{ fontSize: 13.5, color: '#6B7280', maxWidth: 380, marginBottom: 14 }}>
        "{displayTitle}" has been submitted. A reviewer will provide feedback before it can be published.
      </p>
      <div className="flex gap-2 mb-8">
        <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: '#FEF3C7', color: '#92400E' }}>in review</span>
        <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: '#F3F4F6', color: '#374151' }}>Bridge</span>
      </div>
      <button onClick={onDone} className="px-6 py-2.5 rounded-full text-white" style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600 }}>
        ✓ Done — go to library
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="sticky top-0 z-20 flex items-center gap-3 px-5 py-3 border-b border-white/40" style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(12px)' }}>
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: '#6B7280' }}>
          <ArrowLeft size={14} />Back to Create
        </button>
        {[fmtType(typeId), '✦ generated draft', scope].map((chip, i) => (
          <span key={i} className="px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ background: i === 1 ? '#FEF3C7' : '#F3F4F6', color: i === 1 ? '#92400E' : '#374151' }}>{chip}</span>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-5 max-w-2xl">
        <input value={docTitle} onChange={e => setDocTitle(e.target.value)} className="w-full mb-4 bg-transparent border-b border-transparent focus:border-gray-200 outline-none transition-all"
          style={{ fontSize: 22, fontWeight: 700, color: '#0B1220' }} />
        <div className="mb-4 p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.7)', borderColor: 'rgba(0,0,0,0.08)' }}>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: '#6B7280', marginBottom: 6 }}>what this was generated to do</p>
          <textarea value={objective} onChange={e => setObjective(e.target.value)}
            rows={2} className="w-full rounded-xl px-3 py-2 resize-none mb-3"
            style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' }} />
          <div className="flex flex-wrap gap-1.5 mb-2">
            {briefChips.map(c => (
              <span key={c} className="px-2 py-0.5 rounded text-xs" style={{ background: '#F3F4F6', color: '#374151' }}>{c}</span>
            ))}
          </div>
          <p style={{ fontSize: 11, color: '#9AA3AF' }}>Built from {srcCount} source{srcCount !== 1 ? 's' : ''} · {hlCount} marked up · {extCount} extract{extCount !== 1 ? 's' : ''}</p>
        </div>
        <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 10 }}>{parts.length} parts generated to match that brief. Edit any field by hand, use the per-part <strong>AI</strong> menu, or <strong>Edit with AI</strong> to change everything at once.</p>

        {parts.map((p, i) => (
          <div key={p.id} className="mb-3 rounded-2xl border overflow-hidden" style={{ background: 'rgba(255,255,255,0.88)', borderColor: 'rgba(0,0,0,0.08)' }}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.5)' }}>
              <div className="flex items-center gap-2">
                {p.type === 'image' ? <ImageIcon size={13} style={{ color: '#6B7280' }} /> : p.type === 'video' ? <Youtube size={13} style={{ color: '#EF4444' }} /> : <BookOpen size={13} style={{ color: '#6B7280' }} />}
                <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#F3F4F6', color: '#374151' }}>{p.type}</span>
                {p.type === 'image' || p.type === 'video'
                  ? <span className="px-2 py-0.5 rounded text-xs" style={{ background: '#EFF6FF', color: '#2563EB' }}>added by you</span>
                  : <span className="px-2 py-0.5 rounded text-xs" style={{ background: '#FEF3C7', color: '#92400E' }}>✦ AI-drafted</span>}
              </div>
              <div className="flex items-center gap-1">
                {p.type !== 'image' && p.type !== 'video' && (
                  <>
                    <button onClick={() => setAiId(aiId === p.id ? null : p.id)} className="flex items-center gap-1 px-2 py-1 rounded text-xs" style={{ color: '#D97706', background: aiId === p.id ? '#FEF3C7' : 'transparent' }}><Sparkles size={11} />Ask AI</button>
                    <button onClick={() => setEditId(editId === p.id ? null : p.id)} className="flex items-center gap-1 px-2 py-1 rounded text-xs" style={{ color: '#2563EB', background: editId === p.id ? '#EFF6FF' : 'transparent' }}>✎ Edit</button>
                  </>
                )}
                <button onClick={() => { if (i > 0) { const c = [...parts]; [c[i-1], c[i]] = [c[i], c[i-1]]; setParts(c); } }} disabled={i === 0} className="px-1 text-sm" style={{ color: i === 0 ? '#E5E7EB' : '#6B7280' }}>↑</button>
                <button onClick={() => { if (i < parts.length-1) { const c = [...parts]; [c[i], c[i+1]] = [c[i+1], c[i]]; setParts(c); } }} disabled={i === parts.length-1} className="px-1 text-sm" style={{ color: i === parts.length-1 ? '#E5E7EB' : '#6B7280' }}>↓</button>
                <button onClick={() => setParts(prev => prev.filter(x => x.id !== p.id))}><Trash2 size={12} style={{ color: '#EF4444' }} /></button>
              </div>
            </div>
            <div className="p-4">
              {p.type === 'image' ? (
                <ImagePartEditor part={p} onChange={patch => updatePart(p.id, patch)} onPickImage={file => onPickImage(p.id, file)} />
              ) : p.type === 'video' ? (
                <VideoPartEditor part={p} onChange={patch => updatePart(p.id, patch)} />
              ) : editId === p.id ? (
                <EditPanel part={p} onChange={patch => updatePart(p.id, patch)} onClose={() => setEditId(null)} />
              ) : aiId === p.id ? (
                <AskAiPanel part={p} onApply={patch => updatePart(p.id, patch)} onClose={() => setAiId(null)} />
              ) : (
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220', marginBottom: 4 }}>{p.label}</p>
                  {p.type === 'rich-text' && <p style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.65, fontFamily: 'Georgia, serif' }}>{'body' in p ? p.body : ''}</p>}
                  {p.type === 'concept-card' && (
                    <div>
                      <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0B1220', marginBottom: 3 }}>{'concept' in p ? p.concept : ''}</p>
                      <p style={{ fontSize: 13, color: '#374151', marginBottom: 3 }}>{'plain' in p ? p.plain : ''}</p>
                      <p style={{ fontSize: 12, color: '#DC2626' }}>Misconception: {'misc' in p ? p.misc : ''}</p>
                    </div>
                  )}
                  {p.type === 'question' && (
                    <div>
                      <p style={{ fontSize: 13.5, color: '#0B1220', marginBottom: 6 }}>{'prompt' in p ? p.prompt : ''}</p>
                      {'options' in p && p.options.map((o: string, oi: number) => {
                        const isCorrect = oi === ('correct' in p ? p.correct : -1);
                        return (
                          <p key={oi} className="mb-1 flex items-center gap-2" style={{ fontSize: 13 }}>
                            <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                              style={{ borderColor: isCorrect ? '#059669' : '#D1D5DB', background: isCorrect ? 'rgba(5,150,105,0.1)' : 'transparent' }}>
                              {isCorrect && <Check size={11} style={{ color: '#059669' }} />}
                            </span>
                            <span style={{ color: isCorrect ? '#059669' : '#374151' }}>{o}</span>
                          </p>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Add a new block */}
        <div className="rounded-2xl border-2 border-dashed p-3 flex items-center gap-2 flex-wrap" style={{ borderColor: 'rgba(0,0,0,0.12)' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>Add block:</span>
          <button onClick={() => addBlock('rich-text')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all hover:bg-white"
            style={{ fontSize: 12, fontWeight: 600, color: '#0B1220', borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.8)' }}>
            <Plus size={12} />Text
          </button>
          <button onClick={() => addBlock('concept-card')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all hover:bg-white"
            style={{ fontSize: 12, fontWeight: 600, color: '#0B1220', borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.8)' }}>
            <Plus size={12} />Concept card
          </button>
          <button onClick={() => addBlock('question')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all hover:bg-white"
            style={{ fontSize: 12, fontWeight: 600, color: '#0B1220', borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.8)' }}>
            <Plus size={12} />Question
          </button>
        </div>
      </div>
      <div className="sticky bottom-0 flex items-center justify-between px-5 py-3 border-t border-white/40" style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)' }}>
        <button className="flex items-center gap-1.5 px-4 py-2 rounded-full border" style={{ fontSize: 12.5, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
          <Sparkles size={13} style={{ color: '#D97706' }} />✦ Edit with AI
        </button>
        <span style={{ fontSize: 11.5, color: savedNote ? '#059669' : '#9AA3AF' }}>
          {savedNote ? '✓ Saved to Object Library' : `${parts.length} parts · save to add it to the Object Library`}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={handleSaveDraft} className="flex items-center gap-1.5 px-4 py-2 rounded-full border" style={{ fontSize: 12.5, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
            <Save size={13} />✎ Save draft
          </button>
          <button onClick={() => { save('in-review'); setSubmitted(true); }} className="flex items-center gap-1.5 px-5 py-2 rounded-full text-white" style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 600 }}>
            <Send size={13} />➤ Submit for review
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── generating view (streamed LLM parts) ───────────────────────── */

function GeneratingView({ progress, parts, onCancel, noun = 'tutorial' }: { progress: string; parts: { id: string; type: string; label: string }[]; onCancel: () => void; noun?: string }) {
  const unit = noun === 'flashcards' ? 'CARD' : 'PART';
  return (
    <div className="flex flex-col items-center justify-center p-10 text-center min-h-[60vh]">
      <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(124,58,237,0.1)' }}>
        <Loader2 size={26} className="animate-spin" style={{ color: '#7C3AED' }} />
      </div>
      <h2 style={{ fontSize: 19, fontWeight: 700, color: '#0B1220', marginBottom: 4 }}>Generating your {noun}…</h2>
      <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>{progress || 'Working…'}</p>

      {parts.length > 0 && (
        <div className="w-full max-w-md text-left">
          <p style={{ fontSize: 11.5, fontWeight: 700, color: '#6B7280', letterSpacing: '.06em', marginBottom: 8 }}>
            {parts.length} {unit}{parts.length !== 1 ? 'S' : ''} SO FAR
          </p>
          <div className="space-y-1.5 max-h-[38vh] overflow-y-auto">
            {parts.map((p) => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border" style={{ background: 'rgba(255,255,255,0.8)', borderColor: 'rgba(0,0,0,0.08)' }}>
                <Check size={13} style={{ color: '#059669' }} />
                <span className="px-1.5 py-0.5 rounded text-xs shrink-0" style={{ background: '#F3F4F6', color: '#374151' }}>{p.type}</span>
                <span style={{ fontSize: 12.5, color: '#0B1220' }} className="truncate">{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={onCancel} className="mt-6 px-4 py-2 rounded-full border" style={{ fontSize: 12.5, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
        Cancel
      </button>
    </div>
  );
}

/* ─── main component ──────────────────────────────────────────── */

export function ObjectCreator() {
  const { navigate, creatorObjectType } = useApp();
  const typeId = creatorObjectType || 'lesson';
  const isTutorial = typeId === 'tutorial';
  const isFlashcard = typeId === 'flashcard-set';
  // Types that use the real Sources → Mark up → Extract → Generate pipeline.
  const usesPipeline = isTutorial || isFlashcard;

  const [step, setStep] = useState(1);
  const [reached, setReached] = useState(1);
  const [showEditor, setShowEditor] = useState(false);

  const [sel, setSel] = useState<string[]>(SOURCES.filter(s => s.primary).map(s => s.id));
  const [roles, setRoles] = useState<Record<string, string>>(Object.fromEntries(SOURCES.map(s => [s.id, s.primary ? 'Primary' : 'Supporting'])));
  const [urlRefs, setUrlRefs] = useState<string[]>([]);
  const [highlights, setHighlights] = useState<any[]>([]);
  const [activeTag, setActiveTag] = useState('Use');
  const [aiSuggestions, setAiSuggestions] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [extracts, setExtracts] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState('program');
  const [fv, setFvState] = useState<Record<string, any>>({});
  const setF = (id: string, v: any) => setFvState(p => ({ ...p, [id]: v }));

  // Tutorial Step 1 — source can be a PDF, pasted text, a YouTube link, or a prompt.
  const [srcMode, setSrcMode] = useState<'pdf' | 'text' | 'youtube' | 'prompt'>('pdf');
  const [doc, setDoc] = useState<ParsedDoc | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [ytUrl, setYtUrl] = useState('');
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [promptText, setPromptText] = useState('');

  // Media attachments added in the Sources step — images + cropped YouTube clips.
  // These are showcased (with captions) in the generated tutorial.
  const [media, setMedia] = useState<any[]>([]);
  const addImageAsset = () => setMedia(p => [...p, { id: `m-img-${Date.now()}`, kind: 'image', url: '', caption: '', fileName: '' }]);
  const addVideoAsset = () => setMedia(p => [...p, { id: `m-vid-${Date.now()}`, kind: 'video', url: '', videoId: '', startText: '', endText: '', caption: '' }]);
  const updateMedia = (id: string, patch: Record<string, any>) => setMedia(p => p.map(m => (m.id === id ? { ...m, ...patch } : m)));
  const removeMedia = (id: string) => setMedia(p => p.filter(m => m.id !== id));
  const pickImageAsset = async (id: string, file?: File) => {
    if (!file) return;
    if (supabaseEnabled) {
      updateMedia(id, { uploading: true, fileName: file.name });
      try {
        const url = await uploadImage(file);
        updateMedia(id, { url, uploading: false });
        return;
      } catch (e) {
        console.warn('[supabase] image upload failed, using inline copy:', errorMessage(e));
      }
    }
    const reader = new FileReader();
    reader.onload = () => updateMedia(id, { url: String(reader.result), fileName: file.name, uploading: false });
    reader.readAsDataURL(file);
  };
  const mediaToPart = (m: any) =>
    m.kind === 'image'
      ? { id: m.id, type: 'image', label: 'Image', url: m.url, caption: m.caption }
      : { id: m.id, type: 'video', label: 'YouTube video', url: m.url, videoId: m.videoId, startText: m.startText, endText: m.endText, caption: m.caption };

  /**
   * Merge generated parts with author media: the model emits {type:'media',ref}
   * placeholders where each asset best fits — swap those for the real media,
   * then append any the model didn't place (fallback) at the end.
   */
  const assembleParts = () => {
    const used = new Set<string>();
    const out: any[] = [];
    for (const p of genParts as any[]) {
      if (p.type === 'media') {
        const m = media.find((x: any) => x.id === p.ref);
        if (m && !used.has(m.id)) { out.push(mediaToPart(m)); used.add(m.id); }
        continue;
      }
      out.push(p);
    }
    for (const m of media) if (!used.has(m.id)) out.push(mediaToPart(m));
    return out;
  };

  // Switching source type clears the committed source + any markup built on it.
  const changeMode = (m: 'pdf' | 'text' | 'youtube' | 'prompt') => {
    setSrcMode(m);
    setDoc(null); setParseError(null); setYtError(null);
    setHighlights([]); setAiSuggestions([]); setExtracts([]);
  };
  const replaceSource = () => {
    setDoc(null); setParseError(null); setYtError(null);
    setHighlights([]); setAiSuggestions([]); setExtracts([]);
  };

  // Tutorial: real LLM — suggest highlights + streamed generation.
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState('');
  const [genParts, setGenParts] = useState<GeneratedPart[]>([]);
  const [genCards, setGenCards] = useState<GeneratedCard[]>([]);
  const [genError, setGenError] = useState<string | null>(null);
  const genAbort = useRef<AbortController | null>(null);

  const handleFile = async (file: File) => {
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setParseError('That file is not a PDF. Please upload a PDF.');
      return;
    }
    setParsing(true);
    setParseError(null);
    try {
      const parsed = await parsePdf(file);
      setDoc(parsed);
      // A new document invalidates prior markup/extracts.
      setHighlights([]);
      setAiSuggestions([]);
      setExtracts([]);
      if (!title) setTitle(file.name.replace(/\.pdf$/i, ''));
    } catch (e) {
      setParseError(e instanceof Error ? `Could not read that PDF: ${e.message}` : 'Could not read that PDF.');
      setDoc(null);
    } finally {
      setParsing(false);
    }
  };

  const handleLoadText = () => {
    if (!pasteText.trim()) return;
    setHighlights([]); setAiSuggestions([]); setExtracts([]);
    if (!title) setTitle('Pasted source');
    setDoc(docFromText(pasteText, 'Pasted source'));
  };

  const handleFetchYoutube = async () => {
    if (!ytUrl.trim()) return;
    setYtError(null);
    setYtLoading(true);
    try {
      const out = await ingestYoutube(ytUrl.trim());
      setHighlights([]); setAiSuggestions([]); setExtracts([]);
      if (!title && out.title) setTitle(out.title);
      setDoc({ fileName: out.title || 'YouTube transcript', pageCount: 1, sentences: (out.sentences || []).map((t) => ({ text: t, page: 1 })) });
    } catch (e) {
      setYtError(errorMessage(e, 'Could not fetch that transcript.'));
    } finally {
      setYtLoading(false);
    }
  };

  // Document the Mark up / Extract steps operate on.
  const docParas: string[] = usesPipeline ? (doc ? doc.sentences.map(s => s.text) : []) : DOC_PARAS;
  const docPages: number[] | undefined = usesPipeline && doc ? doc.sentences.map(s => s.page) : undefined;
  const docTitle = usesPipeline ? (doc?.fileName ?? (srcMode === 'prompt' ? 'Prompt only' : 'Your source')) : 'How to Play Bridge';

  const goTo = (n: number) => { if (n >= 1 && n <= 4 && n <= reached) setStep(n); };

  // Tutorial "AI suggest": ask the backend LLM which sentences to USE.
  const handleSuggest = async (instruction: string) => {
    setSuggestError(null);
    setSuggesting(true);
    try {
      const indices = await suggestTutorialHighlights(docParas, instruction || undefined);
      const fresh = indices.filter((i) => !highlights.find((h: any) => h.idx === i));
      setAiSuggestions(fresh);
      if (fresh.length === 0) setSuggestError('The model did not suggest any new passages.');
    } catch (e) {
      setSuggestError(errorMessage(e, 'AI suggest failed.'));
    } finally {
      setSuggesting(false);
    }
  };

  // Tutorial generation: stream real parts from the backend LLM.
  const runGenerate = async () => {
    const ctrl = new AbortController();
    genAbort.current = ctrl;
    setGenError(null);
    setGenParts([]);
    setGenProgress('Starting…');
    setGenerating(true);
    try {
      const config = {
        obj: fv.obj, topic: fv.topic || title, aud: fv.aud, lvl: fv.lvl,
        secs: fv.secs, prog: fv.prog, dpth: fv.dpth, end: fv.end,
        chks: fv.chks, excpts: fv.excpts, wex: fv.wex,
      };
      const payload = {
        title,
        config,
        extracts: extracts.map((e: any) => ({ kind: e.kind, text: e.text, from: e.from })),
        prompt: srcMode === 'prompt' ? promptText : undefined,
        // Only ref + kind + caption go to the model (never the image bytes) so
        // it can decide where each image / clip belongs in the flow.
        media: media.map((m: any) => ({ ref: m.id, kind: m.kind, caption: m.caption })),
      };
      const collected: GeneratedPart[] = [];
      for await (const ev of generateTutorial(payload, ctrl.signal) as AsyncGenerator<TutorialGenEvent>) {
        if (ev.type === 'progress') setGenProgress(ev.message);
        else if (ev.type === 'part') { collected.push(ev.part); setGenParts([...collected]); }
        else if (ev.type === 'error') throw new Error(ev.message);
        else if (ev.type === 'done') break;
      }
      if (collected.length === 0) throw new Error('No parts were generated.');
      setGenerating(false);
      setShowEditor(true);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') { setGenerating(false); return; }
      setGenError(errorMessage(e, 'Generation failed.'));
      setGenerating(false);
    } finally {
      genAbort.current = null;
    }
  };

  const cancelGenerate = () => { genAbort.current?.abort(); setGenerating(false); };

  // Flashcards: stream a generated set from the backend LLM.
  const runGenerateFlashcards = async () => {
    const ctrl = new AbortController();
    genAbort.current = ctrl;
    setGenError(null);
    setGenCards([]);
    setGenProgress('Starting…');
    setGenerating(true);
    try {
      const config = {
        mem: fv.mem || title,
        aud: fv.aud ?? 'High school',
        lvl: fv.lvl ?? 'Basic',
        cc: fv.cc ?? 'Key terms → definitions',
        pull: fv.pull ?? 'Glossary / key terms in source',
        dir: fv.dir ?? 'Front→back',
        hooks: fv.hooks ?? false,
        nc: typeof fv.nc === 'number' ? fv.nc : 12,
      };
      const payload = {
        title,
        config,
        extracts: extracts.map((e: any) => ({ kind: e.kind, text: e.text, from: e.from })),
        prompt: srcMode === 'prompt' ? promptText : undefined,
      };
      const collected: GeneratedCard[] = [];
      for await (const ev of generateFlashcards(payload, ctrl.signal) as AsyncGenerator<FlashcardGenEvent>) {
        if (ev.type === 'progress') setGenProgress(ev.message);
        else if (ev.type === 'card') { collected.push(ev.card); setGenCards([...collected]); }
        else if (ev.type === 'error') throw new Error(ev.message);
        else if (ev.type === 'done') break;
      }
      if (collected.length === 0) throw new Error('No cards were generated.');
      setGenerating(false);
      setShowEditor(true);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') { setGenerating(false); return; }
      setGenError(errorMessage(e, 'Generation failed.'));
      setGenerating(false);
    } finally {
      genAbort.current = null;
    }
  };

  const advance = () => {
    if (step >= 4) {
      if (isTutorial) { runGenerate(); return; }
      if (isFlashcard) { runGenerateFlashcards(); return; }
      setShowEditor(true);
      return;
    }
    // "No source" pipelines have nothing to mark up/extract → jump to Define.
    if (usesPipeline && srcMode === 'prompt' && step === 1) {
      setStep(4);
      if (4 > reached) setReached(4);
      return;
    }
    const next = step + 1;
    setStep(next);
    if (next > reached) setReached(next);
  };

  if (showEditor) {
    if (isFlashcard) return (
      <FlashcardEditor typeId={typeId} title={title} scope={scope} fv={fv} cards={genCards}
        onBack={() => setShowEditor(false)} onDone={() => navigate('cd-library')} />
    );
    return (
      <ObjEditor typeId={typeId} title={title} scope={scope} fv={fv}
        generatedParts={isTutorial ? assembleParts() : undefined}
        srcCount={usesPipeline ? (doc ? 1 : 0) : sel.length} extCount={extracts.length} hlCount={highlights.length}
        onBack={() => setShowEditor(false)} onDone={() => navigate('cd-library')} />
    );
  }

  if (usesPipeline && generating) return (
    <GeneratingView
      progress={genProgress}
      noun={isFlashcard ? 'flashcards' : 'tutorial'}
      parts={isFlashcard ? genCards.map(c => ({ id: c.id, type: 'card', label: c.front })) : genParts}
      onCancel={cancelGenerate} />
  );

  const canNext = step === 1
    ? (usesPipeline
      ? (srcMode === 'prompt' ? promptText.trim().length > 0 : !!doc && doc.sentences.length > 0)
      : sel.length > 0)
    : true;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="sticky top-0 z-20 flex items-center gap-3 px-5 py-3 border-b border-white/40" style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(12px)' }}>
        <button onClick={() => navigate('cd-create')} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: '#6B7280' }}>
          <ArrowLeft size={14} />Back to Create
        </button>
        <ChevronRight size={13} style={{ color: '#C4CBD4' }} />
        <span className="px-3 py-1 rounded-full text-sm font-semibold text-white" style={{ background: '#0B0F1A' }}>New {fmtType(typeId)}</span>
        <span style={{ fontSize: 12, color: '#9AA3AF', marginLeft: 2 }}>every object starts from its sources</span>
      </div>

      {/* Step rail */}
      <div className="sticky top-[49px] z-10 flex items-center gap-0 px-5 py-2.5 border-b border-white/30 overflow-x-auto" style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(8px)' }}>
        {STEP_META.map((s, i) => {
          const n = i + 1; const isActive = n === step; const isDone = n < step; const canClick = n <= reached;
          return (
            <React.Fragment key={n}>
              <button onClick={() => goTo(n)} disabled={!canClick}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-all shrink-0"
                style={{ background: isActive ? '#0B0F1A' : isDone ? 'rgba(5,150,105,0.1)' : 'rgba(255,255,255,0.5)', color: isActive ? '#fff' : isDone ? '#059669' : '#9AA3AF', border: `1.5px solid ${isActive ? '#0B0F1A' : isDone ? '#059669' : 'rgba(0,0,0,0.08)'}`, cursor: canClick ? 'pointer' : 'default' }}>
                {isDone ? <Check size={12} /> : s.icon}
                <span style={{ fontSize: 12.5, fontWeight: isActive ? 650 : 500 }}>{s.label}</span>
                {(s as any).skip && n > step && <span style={{ fontSize: 10, opacity: 0.5 }}>optional</span>}
              </button>
              {i < 3 && <ChevronRight size={13} style={{ color: '#C4CBD4', margin: '0 3px', flexShrink: 0 }} />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {step === 1 && (usesPipeline
              ? <TutorialSource
                  mode={srcMode} setMode={changeMode} doc={doc} onReplace={replaceSource}
                  parsing={parsing} parseError={parseError} onFile={handleFile}
                  pasteText={pasteText} setPasteText={setPasteText} onLoadText={handleLoadText}
                  ytUrl={ytUrl} setYtUrl={setYtUrl} ytLoading={ytLoading} ytError={ytError} onFetchYoutube={handleFetchYoutube}
                  promptText={promptText} setPromptText={setPromptText} showMedia={isTutorial}
                  media={media} addImage={addImageAsset} addVideo={addVideoAsset} updateMedia={updateMedia} removeMedia={removeMedia} pickImageAsset={pickImageAsset} />
              : <S1 selected={sel} setSelected={setSel} roles={roles} setRoles={setRoles} urlRefs={urlRefs} setUrlRefs={setUrlRefs} />)}
            {step === 2 && <S2 highlights={highlights} setHighlights={setHighlights} activeTag={activeTag} setActiveTag={setActiveTag} aiSuggestions={aiSuggestions} setAiSuggestions={setAiSuggestions} docParas={docParas} docTitle={docTitle} pages={docPages} query={query} setQuery={setQuery} onSuggest={usesPipeline ? handleSuggest : undefined} suggesting={suggesting} suggestError={suggestError} />}
            {step === 3 && <S3 extracts={extracts} setExtracts={setExtracts} markHighlights={highlights} docTitle={docTitle} typeNoun={NOUNS[typeId] || typeId} />}
            {step === 4 && <S4 typeId={typeId} title={title} setTitle={setTitle} scope={scope} setScope={setScope} fv={fv} setF={setF} srcCount={usesPipeline ? (doc ? 1 : 0) : sel.length} extCount={extracts.length} hlCount={highlights.length} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Generation error */}
      {usesPipeline && step === 4 && genError && (
        <div className="flex items-start gap-2 mx-5 mb-2 rounded-2xl p-3" style={{ background: '#FEE2E2', border: '1px solid #FCA5A5' }}>
          <AlertTriangle size={15} style={{ color: '#B91C1C', marginTop: 1 }} />
          <p style={{ fontSize: 12.5, color: '#991B1B', flex: 1 }}>{genError}</p>
          <button onClick={() => setGenError(null)} className="shrink-0"><X size={14} style={{ color: '#B91C1C' }} /></button>
        </div>
      )}

      {/* Bottom bar */}
      <div className="sticky bottom-0 flex items-center justify-between px-5 py-3 border-t border-white/40" style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)' }}>
        <button onClick={() => step > 1 ? setStep(step - 1) : navigate('cd-create')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full border"
          style={{ fontSize: 13, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
          <ArrowLeft size={13} />{step === 1 ? 'Cancel' : 'Back'}
        </button>
        <span style={{ fontSize: 12, color: '#9AA3AF' }}>
          Step {step} of 4 · {STEP_META[step - 1].label}
          {(STEP_META[step - 1] as any).skip && ' · you can skip'}
          {step === 1 && usesPipeline && !canNext && (srcMode === 'prompt' ? ' · describe what to generate to continue' : ' · add a source to continue')}
        </span>
        <div className="flex items-center gap-2">
          {(STEP_META[step - 1] as any).skip && (
            <button onClick={advance} className="px-3 py-2 rounded-full border"
              style={{ fontSize: 12.5, color: '#6B7280', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
              Skip
            </button>
          )}
          <button onClick={advance} disabled={!canNext}
            className="flex items-center gap-1.5 px-5 py-2 rounded-full transition-all"
            style={{ fontSize: 13, fontWeight: 600, background: canNext ? (step === 4 ? '#059669' : '#0B0F1A') : '#E5E7EB', color: canNext ? '#fff' : '#9AA3AF' }}>
            {step === 4 ? <><Sparkles size={13} />✦ Generate {NOUNS[typeId] || typeId}</> : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
