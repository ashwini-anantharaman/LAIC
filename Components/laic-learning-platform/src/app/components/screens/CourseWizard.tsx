import React, { useRef, useState } from 'react';
import {
  ArrowLeft, Check, ChevronRight, Plus, Trash2, Upload,
  GraduationCap, Wand2, Layers, Pencil, Eye,
  Settings, Send, BookOpen, ListChecks, Sparkles, X,
  ToggleLeft, ToggleRight, ChevronDown, FileText, Compass,
  Loader2, AlertTriangle, Youtube, ClipboardPaste, MessageSquare, Link2, RefreshCw,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../App';
import { ingestYoutube, ingestWeb, errorMessage } from '../../../lib/api';
import { docFromText } from '../../../lib/pdf';
import { PullFromLibraryButton, type PickedLibrarySource } from './CDSources';

/* ─── constants ───────────────────────────────────────────────── */

const STEP_CONFIG = [
  { label: 'Source',       Icon: Upload,     nextLabel: 'Design structure →' },
  { label: 'Structure',    Icon: Wand2,      nextLabel: 'Parse source →',       badge: 'NEW' },
  { label: 'Skeleton',     Icon: Layers,     nextLabel: 'Confirm outline →' },
  { label: 'Generate',     Icon: Sparkles,   nextLabel: 'Generate content →' },
  { label: 'Editor',       Icon: Pencil,     nextLabel: 'Open review →' },
  { label: 'Review',       Icon: Eye,        nextLabel: 'Set interactions →' },
  { label: 'Interactions', Icon: Settings,   nextLabel: 'Go to publish →' },
  { label: 'Publish',      Icon: Send,       nextLabel: '' },
];

/* ─── mock outline data ───────────────────────────────────────── */

interface Lesson { id: string; title: string; kind: 'lesson' | 'checkpoint'; blocks: Block[] }
interface Module { id: string; title: string; ref?: string; lessons: Lesson[] }

interface Block {
  id: string; type: string; label: string; body?: string;
  concept?: string; plain?: string; misc?: string;
  prompt?: string; options?: string[]; correct?: number;
}

const SEED_MODULES: Module[] = [
  {
    id: 'm1', title: 'The Basics', ref: 'Ch.1 pp.1–8',
    lessons: [
      { id: 'l1', kind: 'lesson', title: 'Introduction to Bridge', blocks: [
        { id: 'b1', type: 'rich-text', label: 'Introduction', body: 'Bridge is a trick-taking card game played by four players in two partnerships sitting opposite each other. The goal is to win as many tricks as your contract requires.' },
        { id: 'b2', type: 'concept-card', label: 'Concept', concept: 'Tricks', plain: 'A trick is one round of play where each player contributes one card. The highest card of the suit led wins the trick, unless a trump is played.', misc: 'You always have to follow the suit led if you can.' },
        { id: 'b3', type: 'rich-text', label: 'Summary', body: 'You now understand the basic structure of Bridge: four players, 13 tricks, and the goal of meeting your contract.' },
      ]},
      { id: 'l2', kind: 'lesson', title: 'Suits & Rankings', blocks: [
        { id: 'b4', type: 'rich-text', label: 'Introduction', body: 'The 52-card deck is divided into four suits. Understanding suit ranking is essential for bidding.' },
        { id: 'b5', type: 'concept-card', label: 'Concept', concept: 'Suit Ranking', plain: 'Suits rank from lowest to highest: ♣ (Clubs) < ♦ (Diamonds) < ♥ (Hearts) < ♠ (Spades). No-Trump (NT) outranks all suits.', misc: 'Spades and hearts are the "major" suits; diamonds and clubs are "minor" suits.' },
        { id: 'b6', type: 'question', label: 'Knowledge check', prompt: 'Which suit ranks highest among the four?', options: ['Clubs', 'Diamonds', 'Hearts', 'Spades'], correct: 3 },
      ]},
      { id: 'cp1', kind: 'checkpoint', title: 'Checkpoint — The Basics', blocks: [
        { id: 'b7', type: 'quiz', label: 'Quiz', body: '5 questions · passing 70% · 2 attempts' },
      ]},
    ],
  },
  {
    id: 'm2', title: 'High-Card Points', ref: 'Ch.2 pp.9–14',
    lessons: [
      { id: 'l3', kind: 'lesson', title: 'Evaluating Your Hand', blocks: [
        { id: 'b8', type: 'rich-text', label: 'Introduction', body: 'Before you bid, you need to evaluate the strength of your hand. The standard method uses high-card points (HCP).' },
        { id: 'b9', type: 'concept-card', label: 'Concept', concept: 'High-Card Points (HCP)', plain: 'HCP values: Ace = 4, King = 3, Queen = 2, Jack = 1. A full deck has 40 HCP. Opening bids typically require 12–13 HCP.', misc: 'Nines and tens are valuable but score zero HCP.' },
      ]},
      { id: 'l4', kind: 'lesson', title: 'Opening Requirements', blocks: [
        { id: 'b10', type: 'rich-text', label: 'Explanation', body: 'A standard opening bid requires at least 12 HCP and a 5-card suit (or two good 4-card suits). With 15–17 HCP and a balanced hand, open 1NT.' },
        { id: 'b11', type: 'flashcard-set', label: 'Flashcards', body: '8 cards · self-rated review' },
      ]},
    ],
  },
];

/* ─── helpers ─────────────────────────────────────────────────── */

const BLOCK_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  'rich-text':    { bg: '#EFF6FF', text: '#1D4ED8' },
  'concept-card': { bg: '#F0FDF4', text: '#15803D' },
  'question':     { bg: '#FEF3C7', text: '#92400E' },
  'quiz':         { bg: '#FEF3C7', text: '#92400E' },
  'flashcard-set':{ bg: '#F3E8FF', text: '#7C3AED' },
  'source-excerpt':{ bg: '#FFFBEB', text: '#B45309' },
};

function BChip({ type }: { type: string }) {
  const c = BLOCK_TYPE_COLORS[type] || { bg: '#F3F4F6', text: '#374151' };
  return <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: c.bg, color: c.text }}>{type.replace(/-/g, ' ')}</span>;
}

/* ─── Step 1 — Source (same modes as other learning objects) ──── */

type CourseSrcMode = 'pdf' | 'text' | 'web' | 'youtube' | 'prompt';

const COURSE_SOURCE_MODES: { id: CourseSrcMode; label: string; icon: React.ReactNode }[] = [
  { id: 'pdf', label: 'Upload PDF', icon: <Upload size={15} /> },
  { id: 'text', label: 'Paste text', icon: <ClipboardPaste size={15} /> },
  { id: 'web', label: 'Website link', icon: <Link2 size={15} /> },
  { id: 'youtube', label: 'YouTube link', icon: <Youtube size={15} /> },
  { id: 'prompt', label: 'No source — AI prompt', icon: <MessageSquare size={15} /> },
];

const COURSE_SOURCE_INTRO: Record<CourseSrcMode, string> = {
  pdf: 'Attach the PDF this course is built from. We only store the file here — text is used in later structure steps.',
  text: 'Paste the text this course is built from — notes, an article, a transcript.',
  web: 'Paste a public website link. We fetch the page and extract readable text.',
  youtube: 'Paste a YouTube link and we will pull its transcript. The video needs captions available.',
  prompt: 'No source? Describe what the course should teach. Later steps build from your prompt.',
};

function CourseSourceReady({
  name,
  sub,
  onReplace,
}: {
  name: string;
  sub: string;
  onReplace: () => void;
}) {
  return (
    <div className="rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.85)', borderColor: 'rgba(0,0,0,0.08)' }}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: '#7C3AED' }}>
          <FileText size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 13.5, fontWeight: 650, color: '#0B1220' }} className="truncate">{name}</p>
          <p style={{ fontSize: 12, color: '#6B7280', fontFamily: 'monospace' }}>{sub}</p>
        </div>
        <button
          type="button"
          onClick={onReplace}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border shrink-0"
          style={{ fontSize: 12, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}
        >
          <RefreshCw size={12} />Replace
        </button>
      </div>
    </div>
  );
}

function CourseSourceStep({
  mode,
  setMode,
  pdfFile,
  setPdfFile,
  pasteText,
  setPasteText,
  textReady,
  setTextReady,
  webUrl,
  setWebUrl,
  ytUrl,
  setYtUrl,
  promptText,
  setPromptText,
  remoteTitle,
  setRemoteTitle,
  remoteReady,
  setRemoteReady,
  librarySource,
  setLibrarySource,
}: {
  mode: CourseSrcMode;
  setMode: (m: CourseSrcMode) => void;
  pdfFile: File | null;
  setPdfFile: (f: File | null) => void;
  pasteText: string;
  setPasteText: (t: string) => void;
  textReady: boolean;
  setTextReady: (v: boolean) => void;
  webUrl: string;
  setWebUrl: (t: string) => void;
  ytUrl: string;
  setYtUrl: (t: string) => void;
  promptText: string;
  setPromptText: (t: string) => void;
  remoteTitle: string | null;
  setRemoteTitle: (t: string | null) => void;
  remoteReady: boolean;
  setRemoteReady: (v: boolean) => void;
  librarySource: PickedLibrarySource | null;
  setLibrarySource: (s: PickedLibrarySource | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [webLoading, setWebLoading] = useState(false);
  const [ytLoading, setYtLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f) {
      setLibrarySource(null);
      setPdfFile(f);
      setFetchError(null);
    }
  };

  const replaceAll = () => {
    setLibrarySource(null);
    setPdfFile(null);
    setTextReady(false);
    setRemoteReady(false);
    setRemoteTitle(null);
    setFetchError(null);
  };

  const loadText = () => {
    if (!pasteText.trim()) return;
    setLibrarySource(null);
    setTextReady(true);
    setFetchError(null);
  };

  const fetchWeb = async () => {
    if (!webUrl.trim()) return;
    setWebLoading(true);
    setFetchError(null);
    try {
      const r = await ingestWeb(webUrl.trim());
      docFromText(r.sentences?.join('\n') || '', r.title || webUrl);
      setLibrarySource(null);
      setRemoteTitle(r.title || webUrl);
      setRemoteReady(true);
    } catch (e) {
      setFetchError(errorMessage(e, 'Could not fetch that page.'));
    } finally {
      setWebLoading(false);
    }
  };

  const fetchYt = async () => {
    if (!ytUrl.trim()) return;
    setYtLoading(true);
    setFetchError(null);
    try {
      const r = await ingestYoutube(ytUrl.trim());
      setLibrarySource(null);
      setRemoteTitle(r.title || 'YouTube transcript');
      setRemoteReady(true);
    } catch (e) {
      setFetchError(errorMessage(e, 'Could not fetch that transcript.'));
    } finally {
      setYtLoading(false);
    }
  };

  return (
    <div className="p-5 max-w-2xl">
      <p style={{ fontSize: 11.5, fontWeight: 700, color: '#6B7280', letterSpacing: '.06em', marginBottom: 2 }}>NEW COURSE · STEP 1</p>
      <p style={{ fontSize: 18, fontWeight: 700, color: '#0B1220', marginBottom: 12 }}>Choose your source</p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {COURSE_SOURCE_MODES.map((m) => {
          const on = mode === m.id && !librarySource;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setMode(m.id);
                replaceAll();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all"
              style={{
                fontSize: 12.5,
                fontWeight: on ? 650 : 500,
                background: on ? '#7C3AED' : 'rgba(255,255,255,0.8)',
                color: on ? '#fff' : '#374151',
                borderColor: on ? '#7C3AED' : 'rgba(0,0,0,0.1)',
              }}
            >
              {m.icon}{m.label}
            </button>
          );
        })}
        <PullFromLibraryButton
          onPick={(src) => {
            replaceAll();
            setLibrarySource(src);
          }}
        />
      </div>

      {librarySource ? (
        <CourseSourceReady
          name={librarySource.title}
          sub={`From Source Library · ${librarySource.kind}`}
          onReplace={replaceAll}
        />
      ) : (
        <>
      <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.2)' }}>
        <p style={{ fontSize: 13, color: '#4C1D95', lineHeight: 1.6 }}>{COURSE_SOURCE_INTRO[mode]}</p>
      </div>

      {mode === 'pdf' && (
        <>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => pick(e.target.files)} />
          {!pdfFile ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files); }}
              className="w-full flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed transition-all"
              style={{
                padding: '40px 20px',
                borderColor: dragOver ? '#7C3AED' : 'rgba(0,0,0,0.14)',
                background: dragOver ? 'rgba(124,58,237,0.05)' : 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
              }}
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white" style={{ background: '#7C3AED' }}><Upload size={22} /></div>
              <p style={{ fontSize: 14, fontWeight: 650, color: '#0B1220' }}>Drop a PDF here or click to attach</p>
              <p style={{ fontSize: 12, color: '#9AA3AF' }}>PDF only · stays on this device</p>
            </button>
          ) : (
            <CourseSourceReady
              name={pdfFile.name}
              sub={`${(pdfFile.size / 1024).toFixed(0)} KB · ready`}
              onReplace={replaceAll}
            />
          )}
        </>
      )}

      {mode === 'text' && (
        <>
          {!textReady ? (
            <>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={9}
                placeholder="Paste your source text here…"
                className="w-full rounded-2xl px-3 py-2.5 resize-y"
                style={{ fontSize: 13, lineHeight: 1.6, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.85)', outline: 'none' }}
              />
              <div className="flex items-center justify-between mt-2">
                <span style={{ fontSize: 11.5, color: '#9AA3AF' }}>
                  {pasteText.trim() ? `${pasteText.trim().split(/\s+/).length} words` : 'Notes, an article, a transcript…'}
                </span>
                <button
                  type="button"
                  onClick={loadText}
                  disabled={!pasteText.trim()}
                  className="px-4 py-2 rounded-full transition-all"
                  style={{ fontSize: 12.5, fontWeight: 600, background: pasteText.trim() ? '#0B0F1A' : '#E5E7EB', color: pasteText.trim() ? '#fff' : '#9AA3AF' }}
                >
                  Use this text →
                </button>
              </div>
            </>
          ) : (
            <CourseSourceReady
              name="Pasted text"
              sub={`${pasteText.trim().split(/\s+/).length} words · ready`}
              onReplace={replaceAll}
            />
          )}
        </>
      )}

      {mode === 'web' && (
        <>
          {!remoteReady ? (
            <>
              <div className="flex gap-2">
                <input
                  value={webUrl}
                  onChange={(e) => setWebUrl(e.target.value)}
                  placeholder="https://example.com/article…"
                  className="flex-1 rounded-xl px-3 py-2.5"
                  style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.85)', outline: 'none' }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && webUrl.trim() && !webLoading) void fetchWeb(); }}
                />
                <button
                  type="button"
                  onClick={() => void fetchWeb()}
                  disabled={!webUrl.trim() || webLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white shrink-0"
                  style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 600, opacity: (!webUrl.trim() || webLoading) ? 0.7 : 1 }}
                >
                  {webLoading ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={14} />}
                  {webLoading ? 'Fetching…' : 'Fetch page'}
                </button>
              </div>
              <p style={{ fontSize: 11.5, color: '#9AA3AF', marginTop: 6 }}>
                Public pages only · paywalled sites may need Paste text instead.
              </p>
            </>
          ) : (
            <CourseSourceReady name={remoteTitle || webUrl} sub="Web page · ready" onReplace={replaceAll} />
          )}
        </>
      )}

      {mode === 'youtube' && (
        <>
          {!remoteReady ? (
            <>
              <div className="flex gap-2">
                <input
                  value={ytUrl}
                  onChange={(e) => setYtUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=…"
                  className="flex-1 rounded-xl px-3 py-2.5"
                  style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.85)', outline: 'none' }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && ytUrl.trim() && !ytLoading) void fetchYt(); }}
                />
                <button
                  type="button"
                  onClick={() => void fetchYt()}
                  disabled={!ytUrl.trim() || ytLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white shrink-0"
                  style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 600, opacity: (!ytUrl.trim() || ytLoading) ? 0.7 : 1 }}
                >
                  {ytLoading ? <Loader2 size={13} className="animate-spin" /> : <Youtube size={14} />}
                  {ytLoading ? 'Fetching…' : 'Fetch transcript'}
                </button>
              </div>
            </>
          ) : (
            <CourseSourceReady name={remoteTitle || 'YouTube transcript'} sub="Transcript · ready" onReplace={replaceAll} />
          )}
        </>
      )}

      {mode === 'prompt' && (
        <>
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            rows={7}
            placeholder="Describe what this course should teach, e.g. 'A beginner course on contract bridge bidding, covering opening bids, responses, and basic conventions.'"
            className="w-full rounded-2xl px-3 py-2.5 resize-y"
            style={{ fontSize: 13, lineHeight: 1.6, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.85)', outline: 'none' }}
          />
          <p style={{ fontSize: 11.5, color: '#9AA3AF', marginTop: 6 }}>
            With no source file, later steps build from this prompt.
          </p>
        </>
      )}
        </>
      )}

      {fetchError && (
        <div className="flex items-start gap-2 mt-3 rounded-2xl p-3" style={{ background: '#FEE2E2', border: '1px solid #FCA5A5' }}>
          <AlertTriangle size={15} style={{ color: '#B91C1C', marginTop: 1 }} />
          <p style={{ fontSize: 12.5, color: '#991B1B' }}>{fetchError}</p>
        </div>
      )}
    </div>
  );
}

/* ─── Step 2 — Structure ──────────────────────────────────────── */

const DEFAULT_STRUCT = {
  title: '', subtitle: '', audience: 'Mixed level',
  parsing: 'ai', approach: 'Concept-first',
  topLevel: false, topName: 'Part',
  groupLevel: true, groupName: 'Module',
  contentName: 'Lesson',
  assessName: 'Checkpoint', assessOn: true,
  progression: 'Linear (in order)', pace: 'Standard lessons',
  draftObjectives: true,
  diagnostic: false, capstone: false, certificate: false, completion: 'Finish all lessons & checkpoints',
};

function Step2({ cfg, setCfg }: { cfg: typeof DEFAULT_STRUCT; setCfg: (c: typeof DEFAULT_STRUCT) => void }) {
  const set = (k: keyof typeof DEFAULT_STRUCT, v: any) => setCfg({ ...cfg, [k]: v });
  const hierarchy = [cfg.topLevel && cfg.topName, cfg.groupLevel && cfg.groupName, cfg.contentName, cfg.assessOn && cfg.assessName].filter(Boolean).join(' › ');

  const Card = ({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) => (
    <div className="mb-4 p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.72)', borderColor: 'rgba(0,0,0,0.08)' }}>
      <div className="flex items-center gap-2 mb-4">
        <Icon size={15} style={{ color: '#6B7280' }} />
        <p style={{ fontSize: 13, fontWeight: 700, color: '#0B1220' }}>{title}</p>
      </div>
      {children}
    </div>
  );

  const Tog = ({ on, onToggle }: { on: boolean; onToggle: () => void }) => (
    <button onClick={onToggle}>
      {on ? <ToggleRight size={22} style={{ color: '#059669' }} /> : <ToggleLeft size={22} style={{ color: '#C4CBD4' }} />}
    </button>
  );

  const Pill = ({ val, opt, k }: { val: string; opt: string; k: keyof typeof DEFAULT_STRUCT }) => (
    <button onClick={() => set(k, opt)} className="px-3 py-1.5 rounded-full border transition-all text-xs font-medium"
      style={{ background: val === opt ? '#0B0F1A' : 'rgba(255,255,255,0.8)', color: val === opt ? '#fff' : '#374151', borderColor: val === opt ? '#0B0F1A' : 'rgba(0,0,0,0.1)' }}>
      {opt}
    </button>
  );

  return (
    <div className="flex gap-5 p-5">
      <div className="flex-1 min-w-0">
        <Card title="Course identity" icon={GraduationCap}>
          <div className="space-y-3">
            <input value={cfg.title} onChange={e => set('title', e.target.value)} placeholder="Name your course (optional)"
              className="w-full rounded-xl px-3 py-2.5" style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.85)', outline: 'none' }} />
            <input value={cfg.subtitle} onChange={e => set('subtitle', e.target.value)} placeholder="One line on what it covers"
              className="w-full rounded-xl px-3 py-2.5" style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.85)', outline: 'none' }} />
            <div>
              <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>Who is it for?</p>
              <div className="flex flex-wrap gap-2">
                {['Beginners', 'Intermediate', 'Advanced', 'Mixed level'].map(o => <Pill key={o} val={cfg.audience} opt={o} k="audience" />)}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Source parsing & teaching approach" icon={Wand2}>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              { id: 'toc', label: 'Parse by table of contents', sub: 'Follow the source\'s own chapters and section headings.' },
              { id: 'ai', label: 'Let AI parse & recommend', sub: 'AI proposes a pedagogical structure from the content.' },
            ].map(m => (
              <button key={m.id} onClick={() => set('parsing', m.id)}
                className="p-3 rounded-xl border-2 text-left transition-all"
                style={{ background: cfg.parsing === m.id ? 'rgba(11,15,26,0.06)' : 'rgba(255,255,255,0.7)', borderColor: cfg.parsing === m.id ? '#0B0F1A' : 'rgba(0,0,0,0.08)' }}>
                <p style={{ fontSize: 12.5, fontWeight: 650, color: '#0B1220', marginBottom: 2 }}>{m.label}</p>
                <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>{m.sub}</p>
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>How should content be organized?</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'Concept-first', sub: 'Explain the idea, then apply it' },
              { id: 'Case-based', sub: 'Anchor each topic in a real case' },
              { id: 'Problem-based', sub: 'Open with a problem to solve' },
              { id: 'Spiral review', sub: 'Revisit ideas with growing depth' },
            ].map(a => (
              <button key={a.id} onClick={() => set('approach', a.id)}
                className="p-3 rounded-xl border-2 text-left transition-all"
                style={{ background: cfg.approach === a.id ? 'rgba(11,15,26,0.06)' : 'rgba(255,255,255,0.7)', borderColor: cfg.approach === a.id ? '#0B0F1A' : 'rgba(0,0,0,0.08)' }}>
                <p style={{ fontSize: 12.5, fontWeight: 650, color: '#0B1220' }}>{a.id}</p>
                <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>{a.sub}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card title="Define your hierarchy" icon={ListTree}>
          <p style={{ fontSize: 12, color: '#9AA3AF', marginBottom: 10 }}>Turn levels on or off and rename them. Only the innermost level is required.</p>
          {[
            { on: cfg.topLevel, setOn: () => set('topLevel', !cfg.topLevel), name: cfg.topName, setName: (v: string) => set('topName', v), required: false, hint: 'Optional — e.g. Part, Unit, Strand' },
            { on: cfg.groupLevel, setOn: () => set('groupLevel', !cfg.groupLevel), name: cfg.groupName, setName: (v: string) => set('groupName', v), required: false, hint: 'e.g. Module, Chapter, Topic' },
            { on: true, setOn: () => {}, name: cfg.contentName, setName: (v: string) => set('contentName', v), required: true, hint: 'The teachable pieces — always on' },
            { on: cfg.assessOn, setOn: () => set('assessOn', !cfg.assessOn), name: cfg.assessName, setName: (v: string) => set('assessName', v), required: false, hint: 'Optional — e.g. Checkpoint, Quiz' },
          ].map((row, i) => (
            <div key={i} className="flex items-center gap-3 mb-3">
              {row.required ? (
                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"><Check size={12} style={{ color: '#059669' }} /></div>
              ) : (
                <button onClick={row.setOn}>
                  {row.on ? <ToggleRight size={22} style={{ color: '#059669' }} /> : <ToggleLeft size={22} style={{ color: '#C4CBD4' }} />}
                </button>
              )}
              <input value={row.name} onChange={e => row.setName(e.target.value)} disabled={!row.on && !row.required}
                className="flex-1 rounded-xl px-3 py-2" style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.08)', background: row.on || row.required ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.03)', outline: 'none', color: row.on || row.required ? '#0B1220' : '#C4CBD4' }} />
              <span style={{ fontSize: 11, color: '#C4CBD4', minWidth: 160 }}>{row.hint}</span>
            </div>
          ))}
        </Card>

        <Card title="The learning experience" icon={Route}>
          <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>How do learners move through it?</p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { id: 'Linear (in order)', sub: 'Learners move step by step' },
              { id: 'Open (any order)', sub: 'Learners choose where to start' },
              { id: 'Unlock by prerequisite', sub: 'Later parts unlock as earlier ones finish' },
            ].map(p => (
              <button key={p.id} onClick={() => set('progression', p.id)}
                className="p-2.5 rounded-xl border-2 text-left transition-all"
                style={{ background: cfg.progression === p.id ? 'rgba(11,15,26,0.06)' : 'rgba(255,255,255,0.7)', borderColor: cfg.progression === p.id ? '#0B0F1A' : 'rgba(0,0,0,0.08)' }}>
                <p style={{ fontSize: 12, fontWeight: 650, color: '#0B1220', marginBottom: 1 }}>{p.id}</p>
                <p style={{ fontSize: 11, color: '#9AA3AF' }}>{p.sub}</p>
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>Lesson length</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {['Short (~5 min)', 'Standard lessons', 'In-depth (20 min+)'].map(o => <Pill key={o} val={cfg.pace} opt={o} k="pace" />)}
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p style={{ fontSize: 13, color: '#0B1220' }}>Draft learning objectives for each {cfg.groupName || 'module'}</p>
              <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>Adds a short "what you'll be able to do" at the start.</p>
            </div>
            <Tog on={cfg.draftObjectives} onToggle={() => set('draftObjectives', !cfg.draftObjectives)} />
          </div>
        </Card>

        <Card title="Assessment & completion" icon={Award}>
          {[
            { k: 'diagnostic' as const, label: 'Open with a diagnostic check', hint: 'A short quiz up front to gauge what learners already know.' },
            { k: 'capstone' as const, label: 'Finish with a capstone / final', hint: 'A culminating assessment that ties the whole course together.' },
            { k: 'certificate' as const, label: 'Issue a certificate on completion', hint: 'Award a certificate when the learner meets the criteria.' },
          ].map(row => (
            <div key={row.k} className="mb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p style={{ fontSize: 13, color: '#0B1220' }}>{row.label}</p>
                  <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>{row.hint}</p>
                </div>
                <Tog on={cfg[row.k] as boolean} onToggle={() => set(row.k, !cfg[row.k])} />
              </div>
              {row.k === 'certificate' && cfg.certificate && (
                <div className="mt-2 relative">
                  <select value={cfg.completion} onChange={e => set('completion', e.target.value)}
                    className="w-full appearance-none rounded-xl px-3 py-2 pr-7"
                    style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.85)', outline: 'none' }}>
                    {['Finish all lessons & checkpoints', 'Pass every checkpoint', 'Score 80%+ overall'].map(o => <option key={o}>{o}</option>)}
                  </select>
                  <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                </div>
              )}
            </div>
          ))}
        </Card>
      </div>

      {/* Right preview */}
      <div className="w-64 shrink-0">
        <div className="sticky top-4 rounded-2xl p-4 border border-white/50" style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(8px)' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#0B1220', marginBottom: 8 }}>Your structure</p>
          <span className="inline-block px-2.5 py-1 rounded-lg mb-3 font-mono text-xs" style={{ background: '#0B0F1A', color: '#fff' }}>{hierarchy || 'Module › Lesson'}</span>
          {[
            ['Parsing', cfg.parsing === 'ai' ? 'AI recommends' : 'Table of contents'],
            ['Approach', cfg.approach],
            ['For', cfg.audience],
            ['Flow', cfg.progression],
            ['Pace', cfg.pace],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between mb-1.5">
              <span style={{ fontSize: 12, color: '#9AA3AF' }}>{k}</span>
              <span style={{ fontSize: 12, color: '#0B1220', fontWeight: 500 }}>{v}</span>
            </div>
          ))}
          <div className="flex flex-wrap gap-1 mt-3">
            {cfg.draftObjectives && <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>objectives</span>}
            {cfg.diagnostic && <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: '#FEF3C7', color: '#92400E' }}>diagnostic</span>}
            {cfg.capstone && <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: '#F0FDF4', color: '#15803D' }}>capstone</span>}
            {cfg.certificate && <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: '#F3E8FF', color: '#7C3AED' }}>certificate</span>}
          </div>
          <div className="mt-3 p-3 rounded-xl" style={{ background: '#FEF3C7', border: '1px solid #FCD34D' }}>
            <p style={{ fontSize: 11.5, color: '#92400E' }}>The parser drafts an outline in exactly this shape. A diagnostic or capstone is added straight into the outline; objectives are drafted into each {cfg.groupName || 'module'}.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Step 3 — Skeleton ───────────────────────────────────────── */

function Step3({ modules, setModules, contentName, groupName, assessName }: { modules: Module[]; setModules: (m: Module[]) => void; contentName: string; groupName: string; assessName: string }) {
  const [regenMsg, setRegenMsg] = useState('');

  const regen = () => { setRegenMsg('Re-parsed — fresh outline generated'); setTimeout(() => setRegenMsg(''), 2000); };

  const renameModule = (id: string, title: string) => setModules(modules.map(m => m.id === id ? { ...m, title } : m));
  const deleteModule = (id: string) => setModules(modules.filter(m => m.id !== id));
  const addLesson = (modId: string) => setModules(modules.map(m => m.id === modId ? { ...m, lessons: [...m.lessons, { id: `l${Date.now()}`, kind: 'lesson', title: `New ${contentName}`, blocks: [] }] } : m));
  const deleteLesson = (modId: string, lesId: string) => setModules(modules.map(m => m.id === modId ? { ...m, lessons: m.lessons.filter(l => l.id !== lesId) } : m));
  const renameLesson = (modId: string, lesId: string, title: string) => setModules(modules.map(m => m.id === modId ? { ...m, lessons: m.lessons.map(l => l.id === lesId ? { ...l, title } : l) } : m));
  const addModule = () => setModules([...modules, { id: `m${Date.now()}`, title: `New ${groupName}`, lessons: [] }]);

  const lessonCount = modules.reduce((a, m) => a + m.lessons.filter(l => l.kind === 'lesson').length, 0);
  const cpCount = modules.reduce((a, m) => a + m.lessons.filter(l => l.kind === 'checkpoint').length, 0);

  return (
    <div className="flex gap-5 p-5">
      <div className="flex-1 min-w-0">
        {regenMsg && <div className="mb-3 px-4 py-2 rounded-xl text-sm" style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #86EFAC' }}>{regenMsg}</div>}
        {modules.map(mod => (
          <div key={mod.id} className="mb-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.75)', borderColor: 'rgba(0,0,0,0.08)' }}>
            <div className="flex items-center gap-2 p-3 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
              <Layers size={14} style={{ color: '#6B7280' }} />
              <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#F3F4F6', color: '#374151' }}>{groupName}</span>
              {mod.ref && <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: '#FEF3C7', color: '#92400E' }}>{mod.ref}</span>}
              <input value={mod.title} onChange={e => renameModule(mod.id, e.target.value)}
                className="flex-1 bg-transparent outline-none font-semibold"
                style={{ fontSize: 13.5, color: '#0B1220' }} />
              <button onClick={() => deleteModule(mod.id)}><Trash2 size={13} style={{ color: '#EF4444' }} /></button>
            </div>
            <div className="p-3 space-y-1.5">
              {mod.lessons.map(les => (
                <div key={les.id} className="flex items-center gap-2 pl-3">
                  {les.kind === 'checkpoint'
                    ? <ListChecks size={13} style={{ color: '#D97706' }} />
                    : <BookOpen size={13} style={{ color: '#6B7280' }} />}
                  <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: les.kind === 'checkpoint' ? '#FEF3C7' : '#F3F4F6', color: les.kind === 'checkpoint' ? '#92400E' : '#374151' }}>
                    {les.kind === 'checkpoint' ? assessName : contentName}
                  </span>
                  <input value={les.title} onChange={e => renameLesson(mod.id, les.id, e.target.value)}
                    className="flex-1 bg-transparent outline-none" style={{ fontSize: 13, color: '#374151' }} />
                  <button onClick={() => deleteLesson(mod.id, les.id)}><X size={12} style={{ color: '#C4CBD4' }} /></button>
                </div>
              ))}
              <button onClick={() => addLesson(mod.id)} className="flex items-center gap-1.5 pl-3 mt-1" style={{ fontSize: 12, color: '#9AA3AF' }}>
                <Plus size={12} />＋ Add {contentName}
              </button>
            </div>
          </div>
        ))}
        <button onClick={addModule} className="flex items-center gap-2 w-full p-3 rounded-2xl border-2 border-dashed justify-center"
          style={{ fontSize: 13, color: '#9AA3AF', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.4)' }}>
          <Plus size={14} />＋ Add {groupName}
        </button>
      </div>
      <div className="w-56 shrink-0">
        <div className="sticky top-4 rounded-2xl p-4 border border-white/50" style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(8px)' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#0B1220', marginBottom: 8 }}>Parsed into</p>
          {[
            [groupName + ' groups', modules.length],
            [contentName + ' items', lessonCount],
            [assessName + 's', cpCount],
          ].map(([k, v]) => (
            <div key={k as string} className="flex justify-between mb-2">
              <span style={{ fontSize: 12, color: '#6B7280' }}>{k}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0B1220' }}>{v}</span>
            </div>
          ))}
          <div className="mt-3 p-3 rounded-xl" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
            <p style={{ fontSize: 11.5, color: '#1D4ED8' }}>Nothing has been written yet. You approve this outline, then choose what to generate for each item.</p>
          </div>
          <button onClick={regen} className="flex items-center gap-1.5 mt-3 w-full justify-center px-3 py-2 rounded-xl border"
            style={{ fontSize: 12, color: '#6B7280', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
            <RefreshCw size={12} />↻ Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Step 4 — Generate ───────────────────────────────────────── */

const GEN_PILLS = ['Full lesson', 'Summary', 'Quiz questions', 'Flashcards', 'Concept cards', 'Reflection prompts', 'Scenario activity', 'Assignment', 'Video script'];

function Step4({ modules, contentName, groupName, assessName }: { modules: Module[]; contentName: string; groupName: string; assessName: string }) {
  const [selPills, setSelPills] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    modules.forEach(m => m.lessons.forEach(l => { init[l.id] = l.kind === 'checkpoint' ? ['Quiz questions'] : ['Full lesson']; }));
    return init;
  });
  const [style, setStyle] = useState('Conversational');
  const [readingLevel, setReadingLevel] = useState('High school');
  const [depth, setDepth] = useState('Standard');

  const toggle = (lesId: string, pill: string) => {
    setSelPills(prev => {
      const cur = prev[lesId] || [];
      return { ...prev, [lesId]: cur.includes(pill) ? cur.filter(x => x !== pill) : [...cur, pill] };
    });
  };

  const addToAll = (pill: string) => {
    setSelPills(prev => {
      const next = { ...prev };
      modules.forEach(m => m.lessons.forEach(l => { if (!next[l.id].includes(pill)) next[l.id] = [...next[l.id], pill]; }));
      return next;
    });
  };

  return (
    <div className="flex gap-5 p-5">
      <div className="flex-1 min-w-0">
        {modules.map(mod => (
          <div key={mod.id} className="mb-4 rounded-2xl border overflow-hidden" style={{ background: 'rgba(255,255,255,0.75)', borderColor: 'rgba(0,0,0,0.08)' }}>
            <div className="px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: 'rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.5)' }}>
              <Layers size={13} style={{ color: '#6B7280' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0B1220' }}>{mod.title}</span>
              <span className="px-2 py-0.5 rounded text-xs ml-auto" style={{ background: '#F3F4F6', color: '#6B7280' }}>{groupName}</span>
            </div>
            {mod.lessons.map(les => {
              const picked = selPills[les.id] || [];
              return (
                <div key={les.id} className="px-4 py-3 border-b last:border-0" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    {les.kind === 'checkpoint' ? <ListChecks size={13} style={{ color: '#D97706' }} /> : <BookOpen size={13} style={{ color: '#6B7280' }} />}
                    <span style={{ fontSize: 13, color: '#0B1220', fontWeight: 500 }}>{les.title}</span>
                    <span className="px-1.5 py-0.5 rounded text-xs ml-auto" style={{ background: '#F3F4F6', color: '#6B7280' }}>
                      {les.kind === 'checkpoint' ? assessName : contentName}
                    </span>
                    <span style={{ fontSize: 11.5, color: '#9AA3AF' }}>{picked.length} selected</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {GEN_PILLS.map(pill => {
                      const on = picked.includes(pill);
                      return (
                        <button key={pill} onClick={() => toggle(les.id, pill)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full border transition-all"
                          style={{ fontSize: 11.5, fontWeight: on ? 650 : 400, background: on ? '#0B0F1A' : 'rgba(255,255,255,0.8)', color: on ? '#fff' : '#374151', borderColor: on ? '#0B0F1A' : 'rgba(0,0,0,0.1)' }}>
                          {on && <Check size={10} />}{pill}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="w-60 shrink-0">
        <div className="sticky top-4 space-y-3">
          <div className="rounded-2xl p-4 border border-white/50" style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(8px)' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#0B1220', marginBottom: 10 }}>Teaching preferences</p>
            {[
              { label: 'Teaching style', val: style, set: setStyle, opts: ['Conversational', 'Textbook', 'Concise / bulleted', 'Q&A', 'Scenario-first'] },
              { label: 'Reading level', val: readingLevel, set: setReadingLevel, opts: ['Middle school', 'High school', 'General adult', 'Advanced'] },
              { label: 'Depth', val: depth, set: setDepth, opts: ['Overview', 'Standard', 'Deep dive'] },
            ].map(row => (
              <div key={row.label} className="mb-3">
                <p style={{ fontSize: 11.5, color: '#6B7280', marginBottom: 4 }}>{row.label}</p>
                <div className="relative">
                  <select value={row.val} onChange={e => row.set(e.target.value)}
                    className="w-full appearance-none rounded-xl px-3 py-2 pr-7"
                    style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.85)', outline: 'none' }}>
                    {row.opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                  <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-2xl p-4 border border-white/50" style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(8px)' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#0B1220', marginBottom: 8 }}>Apply to all items</p>
            {['+ Full lesson', '+ Quiz questions', '+ Flashcards'].map(pill => (
              <button key={pill} onClick={() => addToAll(pill.slice(2))} className="block w-full text-left mb-2 px-3 py-1.5 rounded-xl border"
                style={{ fontSize: 12, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
                {pill}
              </button>
            ))}
          </div>
          <div className="p-3 rounded-xl" style={{ background: '#FEF3C7', border: '1px solid #FCD34D' }}>
            <p style={{ fontSize: 11.5, color: '#92400E' }}>The AI selects block types automatically based on what you asked it to generate.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Step 5 — Editor ─────────────────────────────────────────── */

function BlockCard({ block, onUp, onDown, onDelete }: { block: Block; onUp: () => void; onDown: () => void; onDelete: () => void }) {
  const [mode, setMode] = useState<'read' | 'edit' | 'ai'>('read');
  return (
    <div className="mb-3 rounded-2xl border overflow-hidden" style={{ background: 'rgba(255,255,255,0.88)', borderColor: 'rgba(0,0,0,0.08)' }}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.5)' }}>
        <BChip type={block.type} />
        <span className="px-2 py-0.5 rounded text-xs" style={{ background: '#FEF3C7', color: '#92400E' }}>✦ AI-drafted</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setMode(mode === 'ai' ? 'read' : 'ai')} className="px-2 py-1 rounded text-xs" style={{ color: '#D97706', background: mode === 'ai' ? '#FEF3C7' : 'transparent' }}><Sparkles size={11} className="inline" /> Ask AI</button>
          <button onClick={() => setMode(mode === 'edit' ? 'read' : 'edit')} className="px-2 py-1 rounded text-xs" style={{ color: '#2563EB', background: mode === 'edit' ? '#EFF6FF' : 'transparent' }}>✎ Edit</button>
          <button onClick={onUp} className="px-1 text-sm" style={{ color: '#9AA3AF' }}>↑</button>
          <button onClick={onDown} className="px-1 text-sm" style={{ color: '#9AA3AF' }}>↓</button>
          <button onClick={onDelete}><Trash2 size={12} style={{ color: '#EF4444' }} /></button>
        </div>
      </div>
      <div className="p-4">
        {mode === 'read' && (
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220', marginBottom: 4 }}>{block.label}</p>
            {block.type === 'rich-text' && <p style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.65, fontFamily: 'Georgia, serif' }}>{block.body}</p>}
            {block.type === 'concept-card' && (
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#0B1220', marginBottom: 3 }}>{block.concept}</p>
                <p style={{ fontSize: 13, color: '#374151', marginBottom: 3 }}>{block.plain}</p>
                {block.misc && <p style={{ fontSize: 12, color: '#DC2626' }}>Misconception: {block.misc}</p>}
              </div>
            )}
            {block.type === 'question' && (
              <div>
                <p style={{ fontSize: 13.5, color: '#0B1220', marginBottom: 6 }}>{block.prompt}</p>
                {block.options?.map((o, oi) => {
                  const ok = oi === block.correct;
                  return (
                    <p key={oi} className="flex items-center gap-2 mb-1" style={{ fontSize: 13 }}>
                      <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                        style={{ borderColor: ok ? '#059669' : '#D1D5DB', background: ok ? 'rgba(5,150,105,0.1)' : 'transparent' }}>
                        {ok && <Check size={11} style={{ color: '#059669' }} />}
                      </span>
                      <span style={{ color: ok ? '#059669' : '#374151' }}>{o}</span>
                    </p>
                  );
                })}
              </div>
            )}
            {(block.type === 'quiz' || block.type === 'flashcard-set') && (
              <p style={{ fontSize: 13, color: '#6B7280' }}>{block.body}</p>
            )}
          </div>
        )}
        {mode === 'edit' && (
          <div>
            <textarea defaultValue={block.body || block.plain || ''} rows={4} className="w-full rounded-xl px-3 py-2 resize-none"
              style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.85)', outline: 'none' }} />
            <button onClick={() => setMode('read')} className="mt-2 px-3 py-1.5 rounded-full text-white text-xs font-semibold" style={{ background: '#059669' }}>✓ Save</button>
          </div>
        )}
        {mode === 'ai' && (
          <div>
            <div className="flex flex-wrap gap-2 mb-2">
              {['Make it simpler', 'Tighten', 'More vivid', 'Match reading level'].map(q => (
                <button key={q} className="px-2.5 py-1 rounded-full border text-xs" style={{ background: '#FEF3C7', borderColor: '#FCD34D', color: '#92400E' }}>{q}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <input placeholder="Tell the AI how to change this block…" className="flex-1 rounded-xl px-3 py-2"
                style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.85)', outline: 'none' }} />
              <button className="px-3 py-2 rounded-xl text-white" style={{ background: '#0B0F1A' }}><Sparkles size={13} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Step5({ modules, setModules }: { modules: Module[]; setModules: (m: Module[]) => void }) {
  const [selLesson, setSelLesson] = useState(modules[0]?.lessons[0]?.id || '');
  const totalBlocks = modules.reduce((a, m) => a + m.lessons.reduce((b, l) => b + l.blocks.length, 0), 0);

  const currentLesson = modules.flatMap(m => m.lessons).find(l => l.id === selLesson);
  const currentModule = modules.find(m => m.lessons.some(l => l.id === selLesson));

  const updateBlocks = (lesId: string, blocks: Block[]) => {
    setModules(modules.map(m => ({ ...m, lessons: m.lessons.map(l => l.id === lesId ? { ...l, blocks } : l) })));
  };

  return (
    <div className="flex h-full min-h-[500px]">
      {/* Lesson tree */}
      <div className="w-52 shrink-0 overflow-y-auto p-3 border-r" style={{ borderColor: 'rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.4)' }}>
        {modules.map(mod => (
          <div key={mod.id} className="mb-3">
            <p style={{ fontSize: 11, fontWeight: 700, color: '#9AA3AF', letterSpacing: '.05em', marginBottom: 4, paddingLeft: 4 }}>
              {mod.title.toUpperCase()}
            </p>
            {mod.lessons.map(les => (
              <button key={les.id} onClick={() => setSelLesson(les.id)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left mb-1 transition-all"
                style={{ background: selLesson === les.id ? '#0B0F1A' : 'transparent', color: selLesson === les.id ? '#fff' : '#374151' }}>
                {les.kind === 'checkpoint' ? <ListChecks size={12} /> : <BookOpen size={12} />}
                <span style={{ fontSize: 12, flex: 1 }} className="truncate">{les.title}</span>
                <span style={{ fontSize: 10, opacity: 0.5 }}>{les.blocks.length}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Blocks */}
      <div className="flex-1 overflow-y-auto p-4">
        {currentLesson ? (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <p style={{ fontSize: 15, fontWeight: 700, color: '#0B1220' }}>{currentLesson.title}</p>
              {currentModule && <span className="px-2 py-0.5 rounded text-xs" style={{ background: '#F3F4F6', color: '#374151' }}>{currentModule.title}</span>}
              <span className="px-2 py-0.5 rounded text-xs ml-auto" style={{ background: '#FEF3C7', color: '#92400E' }}>✦ {currentLesson.blocks.length} blocks generated</span>
            </div>
            {currentLesson.blocks.map((block, i) => (
              <BlockCard key={block.id} block={block}
                onUp={() => { if (i > 0) { const b = [...currentLesson.blocks]; [b[i-1], b[i]] = [b[i], b[i-1]]; updateBlocks(currentLesson.id, b); } }}
                onDown={() => { if (i < currentLesson.blocks.length-1) { const b = [...currentLesson.blocks]; [b[i], b[i+1]] = [b[i+1], b[i]]; updateBlocks(currentLesson.id, b); } }}
                onDelete={() => updateBlocks(currentLesson.id, currentLesson.blocks.filter(b => b.id !== block.id))}
              />
            ))}
            <div className="flex items-center gap-2 mt-4">
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm" style={{ color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
                <Plus size={13} />＋ Add block ▾
              </button>
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm" style={{ color: '#D97706', borderColor: 'rgba(217,119,6,0.3)', background: '#FFFBEB' }}>
                <Sparkles size={13} />✦ Generate a block with AI
              </button>
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm" style={{ color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
                ▤ Use object from library
              </button>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: '#9AA3AF', padding: 16 }}>Select a lesson to view and edit its blocks.</p>
        )}
      </div>
    </div>
  );
}

/* ─── Step 6 — Review ─────────────────────────────────────────── */

function Step6({ modules, cfg }: { modules: Module[]; cfg: typeof DEFAULT_STRUCT }) {
  const totalBlocks = modules.reduce((a, m) => a + m.lessons.reduce((b, l) => b + l.blocks.length, 0), 0);
  const totalLessons = modules.reduce((a, m) => a + m.lessons.filter(l => l.kind === 'lesson').length, 0);
  const flashcardCount = modules.reduce((a, m) => a + m.lessons.reduce((b, l) => b + l.blocks.filter(b2 => b2.type === 'flashcard-set').length, 0), 0);

  return (
    <div className="p-5 max-w-2xl">
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Modules', val: modules.length },
          { label: 'Lessons', val: totalLessons },
          { label: 'Blocks', val: totalBlocks },
          { label: 'Flashcard sets', val: flashcardCount },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.75)', border: '1px solid rgba(0,0,0,0.08)' }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#0B1220' }}>{s.val}</p>
            <p style={{ fontSize: 12, color: '#6B7280' }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.75)', borderColor: 'rgba(0,0,0,0.08)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Compass size={15} style={{ color: '#6B7280' }} />
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0B1220' }}>Course design</p>
        </div>
        <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 8 }}>{cfg.subtitle || 'An introduction to Bridge for new learners.'}</p>
        <div className="flex flex-wrap gap-2">
          {[cfg.audience, cfg.approach, cfg.progression, cfg.pace,
            cfg.draftObjectives && 'objectives', cfg.diagnostic && 'diagnostic',
            cfg.capstone && 'capstone', cfg.certificate && 'certificate',
          ].filter(Boolean).map(c => (
            <span key={c as string} className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: '#F3F4F6', color: '#374151' }}>{c}</span>
          ))}
        </div>
      </div>

      {modules.map(mod => (
        <div key={mod.id} className="mb-3 rounded-2xl border overflow-hidden" style={{ background: 'rgba(255,255,255,0.75)', borderColor: 'rgba(0,0,0,0.08)' }}>
          <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.5)' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0B1220' }}>{mod.title}</p>
            {mod.ref && <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: '#FEF3C7', color: '#92400E' }}>{mod.ref}</span>}
          </div>
          <div className="p-2">
            {mod.lessons.map(les => (
              <div key={les.id} className="flex items-center gap-2 px-3 py-2 rounded-xl">
                {les.kind === 'checkpoint' ? <ListChecks size={13} style={{ color: '#D97706' }} /> : <BookOpen size={13} style={{ color: '#6B7280' }} />}
                <span style={{ fontSize: 13, color: '#374151', flex: 1 }}>{les.title}</span>
                <div className="flex gap-1">
                  {[...new Set(les.blocks.map(b => b.type))].slice(0, 4).map(t => <BChip key={t} type={t} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="p-4 rounded-2xl" style={{ background: '#F0FDF4', border: '1px solid #86EFAC' }}>
        <p style={{ fontSize: 13, color: '#15803D', fontWeight: 500 }}>
          Content review complete on your side. Next, set learner interactions, then submit for administrator approval.
        </p>
      </div>
    </div>
  );
}

/* ─── Step 7 — Interactions ───────────────────────────────────── */

function Step7() {
  const [t, setT] = useState({
    askAI: true, quizMe: true, flashcards: false, notes: true,
    requireOrder: true, skipOptional: false, showHints: true, feedbackTiming: 'After the attempt',
  });
  const tog = (k: keyof typeof t) => setT(p => ({ ...p, [k]: !p[k] }));

  const Tog = ({ k }: { k: keyof typeof t }) => (
    <button onClick={() => tog(k as any)}>
      {t[k as keyof typeof t]
        ? <ToggleRight size={22} style={{ color: '#059669' }} />
        : <ToggleLeft size={22} style={{ color: '#C4CBD4' }} />}
    </button>
  );

  return (
    <div className="p-5 max-w-xl">
      <div className="mb-4 p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.72)', borderColor: 'rgba(0,0,0,0.08)' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#0B1220', marginBottom: 10 }}>AI & study tools</p>
        {[
          { k: 'askAI', label: 'Ask-AI study panel', hint: 'explain · example · simplify · why wrong' },
          { k: 'quizMe', label: "AI 'quiz me'", hint: 'AI generates on-demand practice questions' },
          { k: 'flashcards', label: 'Learner-made flashcards', hint: 'Students can make their own cards' },
          { k: 'notes', label: 'Private notes', hint: 'Personal notes per lesson' },
        ].map(row => (
          <div key={row.k} className="flex items-center justify-between mb-3 last:mb-0">
            <div>
              <p style={{ fontSize: 13, color: '#0B1220' }}>{row.label}</p>
              <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>{row.hint}</p>
            </div>
            <Tog k={row.k as any} />
          </div>
        ))}
      </div>
      <div className="p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.72)', borderColor: 'rgba(0,0,0,0.08)' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#0B1220', marginBottom: 10 }}>Navigation & feedback</p>
        {[
          { k: 'requireOrder', label: 'Require completion in order', hint: 'Auto-set from Step 2 progression choice' },
          { k: 'skipOptional', label: 'Allow skipping optional items', hint: '' },
          { k: 'showHints', label: 'Show question hints', hint: '' },
        ].map(row => (
          <div key={row.k} className="flex items-center justify-between mb-3 last:mb-0">
            <div>
              <p style={{ fontSize: 13, color: '#0B1220' }}>{row.label}</p>
              {row.hint && <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>{row.hint}</p>}
            </div>
            <Tog k={row.k as any} />
          </div>
        ))}
        <div className="mt-3">
          <p style={{ fontSize: 13, color: '#0B1220', marginBottom: 4 }}>Feedback timing</p>
          <div className="relative">
            <select value={t.feedbackTiming}
              onChange={e => setT(p => ({ ...p, feedbackTiming: e.target.value }))}
              className="w-full appearance-none rounded-xl px-3 py-2 pr-7"
              style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.85)', outline: 'none' }}>
              {['Immediately after each answer', 'After the attempt', 'After completion', 'Never show answers'].map(o => <option key={o}>{o}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Step 8 — Publish ────────────────────────────────────────── */

function Step8({ courseTitle, onSubmit, submitted }: { courseTitle: string; onSubmit: () => void; submitted: boolean }) {
  const [pubType, setPubType] = useState('Course');
  const [note, setNote] = useState('Initial release, content reviewed.');

  if (submitted) return (
    <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-5" style={{ background: '#FEF3C7' }}>
        <Check size={26} style={{ color: '#D97706' }} />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0B1220', marginBottom: 6 }}>Submitted for administrator approval</h2>
      <p style={{ fontSize: 13.5, color: '#6B7280', maxWidth: 420, marginBottom: 14 }}>
        "{courseTitle || 'Learn to Play Bridge'}" has gone to the organization administrator. It publishes to learners only once they approve it.
      </p>
      <div className="flex gap-2 mb-6">
        <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: '#FEF3C7', color: '#92400E' }}>in review</span>
        <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: '#F3F4F6', color: '#374151' }}>Bridge</span>
      </div>
      <p style={{ fontSize: 12.5, color: '#9AA3AF' }}>Track it under <strong>Versions & Publishing</strong> or <strong>Review Queue</strong>. Use "Finish" below to return to Activity objects.</p>
    </div>
  );

  return (
    <div className="p-5 max-w-lg">
      <div className="rounded-2xl p-5 border" style={{ background: 'rgba(255,255,255,0.75)', borderColor: 'rgba(0,0,0,0.08)' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#0B1220', marginBottom: 10 }}>Publication type</p>
        <div className="space-y-2 mb-5">
          {[
            { id: 'Course', sub: 'Full structured course with modules, lessons, and checkpoints.' },
            { id: 'Learning package', sub: 'A small assignable bundle.' },
            { id: 'Standalone objects', sub: 'Publish objects individually.' },
          ].map(r => (
            <label key={r.id} className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all"
              style={{ background: pubType === r.id ? 'rgba(11,15,26,0.06)' : 'rgba(255,255,255,0.7)', borderColor: pubType === r.id ? '#0B0F1A' : 'rgba(0,0,0,0.08)' }}>
              <input type="radio" name="pubType" checked={pubType === r.id} onChange={() => setPubType(r.id)} className="mt-0.5" />
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220' }}>{r.id}</p>
                <p style={{ fontSize: 12, color: '#9AA3AF' }}>{r.sub}</p>
              </div>
            </label>
          ))}
        </div>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220', marginBottom: 6 }}>Note to the administrator</p>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
          className="w-full rounded-xl px-3 py-2.5 resize-none mb-5"
          style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.85)', outline: 'none' }} />
        <button onClick={onSubmit}
          className="flex items-center gap-2 w-full justify-center px-5 py-3 rounded-full text-white"
          style={{ background: '#0B0F1A', fontSize: 14, fontWeight: 700 }}>
          <Send size={15} />➤ Submit for administrator approval
        </button>
        <p style={{ fontSize: 12, color: '#9AA3AF', marginTop: 10, textAlign: 'center' }}>
          You cannot publish directly — the administrator makes the final call. This keeps a human quality gate before students see anything.
        </p>
      </div>
    </div>
  );
}

/* ─── main component ──────────────────────────────────────────── */

export function CourseWizard() {
  const { navigate } = useApp();
  const [step, setStep] = useState(1);
  const [reached, setReached] = useState(1);
  const [submitted, setSubmitted] = useState(false);

  const [cfg, setCfg] = useState(DEFAULT_STRUCT);
  const [modules, setModules] = useState<Module[]>(SEED_MODULES);

  /* ── Step 1: same source modes as other learning objects ──────── */
  const [srcMode, setSrcMode] = useState<CourseSrcMode>('pdf');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [textReady, setTextReady] = useState(false);
  const [webUrl, setWebUrl] = useState('');
  const [ytUrl, setYtUrl] = useState('');
  const [promptText, setPromptText] = useState('');
  const [remoteTitle, setRemoteTitle] = useState<string | null>(null);
  const [remoteReady, setRemoteReady] = useState(false);
  const [librarySource, setLibrarySource] = useState<PickedLibrarySource | null>(null);

  const sourceReady =
    !!librarySource ||
    (srcMode === 'pdf' && !!pdfFile) ||
    (srcMode === 'text' && textReady) ||
    ((srcMode === 'web' || srcMode === 'youtube') && remoteReady) ||
    (srcMode === 'prompt' && promptText.trim().length > 0);

  const sourceLabel = librarySource
    ? librarySource.title
    : srcMode === 'pdf' && pdfFile
    ? pdfFile.name
    : srcMode === 'text' && textReady
      ? 'Pasted text'
      : (srcMode === 'web' || srcMode === 'youtube') && remoteReady
        ? (remoteTitle || 'Source ready')
        : srcMode === 'prompt' && promptText.trim()
          ? 'AI prompt'
          : null;

  const goTo = (n: number) => { if (n >= 1 && n <= 8 && n <= reached) setStep(n); };

  const advance = () => {
    if (step === 8) return;
    const next = step + 1;
    setStep(next);
    if (next > reached) setReached(next);
  };

  const canNext = step === 1 ? sourceReady : step !== 8;
  const nextLabel = STEP_CONFIG[step - 1].nextLabel;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top header */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 border-b border-white/40"
        style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)' }}>
        <button onClick={() => navigate('cd-library')} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: '#6B7280' }}>
          <ArrowLeft size={14} />Activity objects
        </button>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#0B1220' }}>New course from a source</p>
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
          style={{ background: sourceReady ? '#D1FAE5' : '#F3F4F6', color: sourceReady ? '#047857' : '#374151' }}>
          {sourceReady ? `✓ ${sourceLabel}` : 'No source yet'}
        </span>
      </div>

      {/* Stepper */}
      <div className="sticky top-[49px] z-10 flex items-center gap-0 px-4 py-2.5 border-b border-white/30 overflow-x-auto"
        style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(8px)' }}>
        {STEP_CONFIG.map((s, i) => {
          const n = i + 1; const isActive = n === step; const isDone = n < step; const canClick = n <= reached;
          return (
            <React.Fragment key={n}>
              <button onClick={() => goTo(n)} disabled={!canClick}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-all shrink-0 relative"
                style={{ background: isActive ? '#0B0F1A' : isDone ? 'rgba(5,150,105,0.1)' : 'rgba(255,255,255,0.5)', color: isActive ? '#fff' : isDone ? '#059669' : '#9AA3AF', border: `1.5px solid ${isActive ? '#0B0F1A' : isDone ? '#059669' : 'rgba(0,0,0,0.08)'}`, cursor: canClick ? 'pointer' : 'default' }}>
                {isDone
                  ? <span className="w-4 h-4 rounded-full flex items-center justify-center text-white" style={{ background: '#059669', fontSize: 9 }}><Check size={10} /></span>
                  : <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: isActive ? '#D97706' : 'rgba(0,0,0,0.12)', color: isActive ? '#fff' : '#9AA3AF', fontSize: 10, fontWeight: 700 }}>{n}</span>}
                <span style={{ fontSize: 12, fontWeight: isActive ? 650 : 500 }}>{s.label}</span>
                {s.badge && n > step && <span className="px-1 rounded text-xs font-bold" style={{ background: '#FDE68A', color: '#92400E', fontSize: 9 }}>{s.badge}</span>}
              </button>
              {i < 7 && <ChevronRight size={13} style={{ color: '#D1D5DB', margin: '0 2px', flexShrink: 0 }} />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {step === 1 && (
              <CourseSourceStep
                mode={srcMode}
                setMode={setSrcMode}
                pdfFile={pdfFile}
                setPdfFile={setPdfFile}
                pasteText={pasteText}
                setPasteText={setPasteText}
                textReady={textReady}
                setTextReady={setTextReady}
                webUrl={webUrl}
                setWebUrl={setWebUrl}
                ytUrl={ytUrl}
                setYtUrl={setYtUrl}
                promptText={promptText}
                setPromptText={setPromptText}
                remoteTitle={remoteTitle}
                setRemoteTitle={setRemoteTitle}
                remoteReady={remoteReady}
                setRemoteReady={setRemoteReady}
                librarySource={librarySource}
                setLibrarySource={setLibrarySource}
              />
            )}
            {step === 2 && <Step2 cfg={cfg} setCfg={setCfg} />}
            {step === 3 && <Step3 modules={modules} setModules={setModules} contentName={cfg.contentName} groupName={cfg.groupName} assessName={cfg.assessName} />}
            {step === 4 && <Step4 modules={modules} contentName={cfg.contentName} groupName={cfg.groupName} assessName={cfg.assessName} />}
            {step === 5 && <Step5 modules={modules} setModules={setModules} />}
            {step === 6 && <Step6 modules={modules} cfg={cfg} />}
            {step === 7 && <Step7 />}
            {step === 8 && <Step8 courseTitle={cfg.title} onSubmit={() => { setSubmitted(true); setReached(8); }} submitted={submitted} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom action bar */}
      <div className="sticky bottom-0 flex items-center justify-between px-5 py-3 border-t border-white/40"
        style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)' }}>
        <button
          onClick={() => step > 1 ? setStep(step - 1) : navigate('cd-library')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full border"
          style={{ fontSize: 13, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
          <ArrowLeft size={13} />{step === 1 ? 'Back' : 'Back'}
        </button>

        <span style={{ fontSize: 12, color: '#9AA3AF' }}>Step {step} of 8 · {STEP_CONFIG[step - 1].label}</span>

        {step === 8 ? (
          submitted ? (
            <button onClick={() => navigate('cd-library')}
              className="flex items-center gap-1.5 px-5 py-2 rounded-full"
              style={{ fontSize: 13, fontWeight: 600, background: '#059669', color: '#fff' }}>
              <Check size={14} />✓ Finish
            </button>
          ) : (
            <span className="px-4 py-2 rounded-full text-xs font-medium" style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}>
              use "Submit" above
            </span>
          )
        ) : (
          <button onClick={advance} disabled={!canNext}
            className="flex items-center gap-1.5 px-5 py-2 rounded-full transition-all"
            style={{ fontSize: 13, fontWeight: 600, background: canNext ? '#0B0F1A' : '#E5E7EB', color: canNext ? '#fff' : '#9AA3AF' }}>
            {nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}
