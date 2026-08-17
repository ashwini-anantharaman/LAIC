/**
 * Tutorial V3 concept card — the reference export's `GenericConceptCard`.
 *
 * Amber sheet, white body, one disclosing panel per category, a Read /
 * Test-yourself pair, a compact toggle and a bookmark star: the layout is fixed
 * by the reference and does not vary with content.
 *
 * What varies is which categories the author enabled in Define and what each
 * one says. Panel bodies are drawn through the same `lib/conceptCard` helpers
 * the V1 sheet uses, so the two never disagree about what a category means.
 *
 * Three fields are promoted out of the panel list into the header, exactly as
 * the reference does: the term, its one-sentence meaning, and the connection —
 * the "Related:" line. They are not repeated below.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { ConceptCardContent } from '../../../../../lib/types';
import {
  categoryBody,
  normalizeConceptCardContent,
  resolveConceptCategories,
  type ConceptCategoryDef,
} from '../../../../../lib/conceptCard';
import { useLearnerProgress } from './LearnerProgressContext';
import { SAGE } from './warm/theme';
import { WarmStrip } from './warm/WarmPrimitives';

const AMBER = '#d97706';

/**
 * Fallback recall prompts, used when the author has not written one for a
 * panel. `recallQuestion` is a single card-level string and cannot cover eight
 * panels, which is why `sectionRecallPrompts` exists.
 */
const DEFAULT_PROMPTS: Record<string, string> = {
  meaning: 'In one sentence — what is this concept?',
  why: 'Why does this concept matter?',
  core: 'Explain the core idea in full.',
  components: 'List the key components and what each contributes.',
  visual: 'What does the visual or formula show?',
  example: 'Give an example.',
  nonExample: 'Give a non-example — something that looks like it but is not.',
  mistake: 'What mistake do most people make with this?',
  connection: 'How does this connect to something you already know?',
  recall: 'Answer the recall question from memory.',
  teachBack: 'Teach this back in your own words.',
};

function promptFor(content: ConceptCardContent, cat: ConceptCategoryDef): string {
  const authored = content.sectionRecallPrompts?.[cat.id];
  if (authored && authored.trim()) return authored.trim();
  if (DEFAULT_PROMPTS[cat.id]) return DEFAULT_PROMPTS[cat.id];
  return `Recall: ${cat.label.toLowerCase()}.`;
}

function ytId(url: string): string {
  const raw = (url || '').trim();
  if (!raw) return '';
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  const m = raw.match(/(?:youtu\.be\/|youtube\.com\/(?:embed|shorts|live|v)\/|watch\?.*?v=)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
}

function PanelMedia({ id, content }: { id: string; content: ConceptCardContent }) {
  const media = content.categoryMedia?.[id];
  if (!media?.url) return null;
  if (media.kind === 'video') {
    const yt = ytId(media.url);
    if (!yt) return null;
    return (
      <div className="rounded-xl overflow-hidden mt-3" style={{ aspectRatio: '16 / 9' }}>
        <iframe
          title={media.caption || 'Video'}
          src={`https://www.youtube-nocookie.com/embed/${yt}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ width: '100%', height: '100%', border: 0 }}
        />
      </div>
    );
  }
  return (
    <img
      src={media.url}
      alt={media.caption || ''}
      className="mt-3 rounded-xl"
      style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain' }}
    />
  );
}

/** The two-box "this counts, that does not" diagram, with its formula beneath. */
function VisualBody({ content }: { content: ConceptCardContent }) {
  const { visualChoice, visualAlternative, visualFormula, visualOrFormula } = content;
  if (!visualChoice && !visualAlternative && !visualFormula) {
    if (!visualOrFormula) return null;
    return <p className="text-stone-700 text-sm leading-relaxed whitespace-pre-wrap">{visualOrFormula}</p>;
  }
  return (
    <div>
      {(visualChoice || visualAlternative) && (
        <div className="flex items-stretch rounded-xl overflow-hidden border border-amber-200">
          <div className="flex-1 bg-amber-50 px-4 py-3 text-center">
            <p className="text-[10px] text-amber-600 font-bold tracking-wider mb-1">CHOICE</p>
            <p className="text-stone-800 text-sm font-bold">{visualChoice || '—'}</p>
          </div>
          <div className="flex items-center justify-center px-3 bg-white border-x border-amber-200">
            <span className="text-amber-400 text-sm font-bold">vs</span>
          </div>
          <div className="flex-1 bg-stone-50 px-4 py-3 text-center">
            <p className="text-[10px] text-stone-400 font-bold tracking-wider mb-1">ALTERNATIVE</p>
            <p className="text-stone-500 text-sm font-medium">{visualAlternative || '—'}</p>
          </div>
        </div>
      )}
      {(visualFormula || visualOrFormula) && (
        <p className="text-center mt-2">
          <code className="font-mono text-xs text-stone-600 bg-stone-100 px-3 py-1.5 rounded-lg">
            {visualFormula || visualOrFormula}
          </code>
        </p>
      )}
    </div>
  );
}

function PanelBody({ cat, content }: { cat: ConceptCategoryDef; content: ConceptCardContent }) {
  if (cat.id === 'visual') {
    return (
      <>
        <VisualBody content={content} />
        <PanelMedia id={cat.id} content={content} />
      </>
    );
  }
  if (cat.id === 'components') {
    const bullets = content.keyComponents || [];
    if (!bullets.length) {
      return <p className="text-stone-700 text-sm leading-relaxed">{categoryBody(content, cat.id) || '—'}</p>;
    }
    return (
      <>
        <ul className="space-y-2 text-sm text-stone-700 font-medium">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <span className="text-amber-500 shrink-0 mt-0.5">→</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <PanelMedia id={cat.id} content={content} />
      </>
    );
  }
  const text = categoryBody(content, cat.id);
  return (
    <>
      {text && <p className="text-stone-700 text-sm leading-relaxed whitespace-pre-wrap">{text}</p>}
      <PanelMedia id={cat.id} content={content} />
      {!text && !content.categoryMedia?.[cat.id]?.url && <p className="text-stone-400 text-sm">—</p>}
    </>
  );
}

/** One panel — an accordion when reading, a reveal when testing. */
function Panel({
  label,
  open,
  testMode,
  prompt,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  testMode: boolean;
  prompt?: string;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl overflow-hidden border border-stone-100">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
          open ? 'bg-stone-50' : 'bg-white hover:bg-stone-50'
        }`}
      >
        <span className="text-sm font-bold text-stone-700">{label}</span>
        <span className="text-stone-400 font-bold text-xs">
          {testMode ? (open ? '▾' : 'Reveal') : (open ? '▾' : '▸')}
        </span>
      </button>
      {testMode && !open && prompt && (
        <div className="px-4 py-3 border-t border-stone-100 bg-amber-50">
          <p className="text-amber-800 text-sm font-medium leading-snug">{prompt}</p>
        </div>
      )}
      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-stone-100 bg-white">
          {children}
          {testMode && prompt && <p className="text-stone-400 text-xs font-semibold mt-3">Q: {prompt}</p>}
        </div>
      )}
    </div>
  );
}

export function TutorialV3ConceptCard({
  content,
  blockId,
}: {
  content: ConceptCardContent;
  blockId: string;
}) {
  const c = useMemo(() => normalizeConceptCardContent(content), [content]);
  const categories = useMemo(
    () => resolveConceptCategories(c.categories).filter((cat) => cat.enabled),
    [c.categories],
  );

  const meaning = categoryBody(c, 'meaning') || c.oneSentenceMeaning || '';
  const connection = categoryBody(c, 'connection');

  // The header carries meaning and connection, so they do not also sit in the
  // body — otherwise the same sentence appears twice on one card.
  const bodyCategories = useMemo(
    () => categories.filter((cat) => cat.id !== 'connection' && cat.id !== 'meaning'),
    [categories],
  );
  const visualCat = useMemo(() => bodyCategories.find((cat) => cat.id === 'visual'), [bodyCategories]);
  const readCategories = useMemo(() => bodyCategories.filter((cat) => cat.id !== 'visual'), [bodyCategories]);

  const [mode, setMode] = useState<'read' | 'test'>('read');
  const [compact, setCompact] = useState(false);
  const [opened, setOpened] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<string[]>([]);

  const { markBlockDone, isBookmarked, toggleBookmark } = useLearnerProgress();
  const bookmarkKey = `concept:${blockId}`;
  const bookmarked = isBookmarked(bookmarkKey);

  const seen = mode === 'test' ? revealed : opened;
  const allSeen = bodyCategories.length > 0 && bodyCategories.every((cat) => seen.includes(cat.id));

  // Finished means the learner has actually been through every panel, in either
  // mode — not that the card scrolled past.
  useEffect(() => {
    if (allSeen) markBlockDone(blockId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSeen, blockId]);

  const toggleOpen = (id: string) => {
    if (mode === 'test') {
      setRevealed((p) => (p.includes(id) ? p : [...p, id]));
      return;
    }
    setOpened((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const hasVisual = !!visualCat
    && !!(c.visualChoice || c.visualAlternative || c.visualFormula || c.visualOrFormula || c.categoryMedia?.visual?.url);

  return (
    <div className="rounded-2xl bg-amber-50 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-amber-100">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-700 font-bold mb-1">Concept</p>
            <h3 className="text-lg font-bold text-stone-900">{c.term || '—'}</h3>
            {meaning && <p className="text-amber-800 text-sm leading-snug mt-1">{meaning}</p>}
            {connection && <p className="text-xs text-stone-500 font-semibold mt-1.5">Related: {connection}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex rounded-xl overflow-hidden border-2 border-amber-200">
              <button
                type="button"
                onClick={() => setMode('read')}
                className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                  mode === 'read' ? 'text-white' : 'text-amber-700 hover:bg-amber-100'
                }`}
                style={mode === 'read' ? { background: SAGE } : undefined}
              >
                Read
              </button>
              <button
                type="button"
                onClick={() => { setMode('test'); setRevealed([]); setCompact(false); }}
                className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                  mode === 'test' ? 'text-white' : 'text-amber-700 hover:bg-amber-100'
                }`}
                style={mode === 'test' ? { background: AMBER } : undefined}
              >
                Test yourself
              </button>
            </div>
            <button
              type="button"
              onClick={() => setCompact((v) => !v)}
              title={compact ? 'Expand card' : 'Collapse to one sentence'}
              aria-pressed={compact}
              className="w-8 h-8 flex items-center justify-center rounded-xl border-2 border-amber-200 text-amber-600 hover:bg-amber-100 text-xs font-bold"
            >
              {compact ? '⊞' : '⊟'}
            </button>
            <button
              type="button"
              onClick={() => toggleBookmark(bookmarkKey)}
              title="Bookmark to glossary"
              aria-pressed={bookmarked}
              className={`w-8 h-8 flex items-center justify-center rounded-xl border-2 transition-colors text-sm font-bold ${
                bookmarked ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-200 text-amber-600 hover:bg-amber-100'
              }`}
            >
              {bookmarked ? '★' : '☆'}
            </button>
          </div>
        </div>
      </div>

      {compact ? (
        <div className="px-5 py-3 bg-white">
          <p className="text-stone-700 text-sm italic">{meaning || '—'}</p>
          <button
            type="button"
            onClick={() => setCompact(false)}
            className="text-xs text-amber-600 font-bold mt-2 hover:text-amber-800"
          >
            Expand →
          </button>
        </div>
      ) : mode === 'read' ? (
        <div className="px-5 py-4 space-y-3 bg-white">
          {bodyCategories.length === 0 && (
            <p className="text-stone-400 text-sm text-center py-4 font-semibold">No categories selected in Define.</p>
          )}
          {hasVisual && visualCat && (
            <div className="rounded-2xl bg-stone-50 p-4">
              <PanelBody cat={visualCat} content={c} />
            </div>
          )}
          {readCategories.map((cat) => (
            <Panel
              key={cat.id}
              label={cat.label}
              open={opened.includes(cat.id)}
              testMode={false}
              onToggle={() => toggleOpen(cat.id)}
            >
              <PanelBody cat={cat} content={c} />
            </Panel>
          ))}
        </div>
      ) : (
        <div className="bg-white">
          <div className="px-5 pt-4 pb-3 border-b border-stone-100">
            <div className="flex items-center justify-between mb-2 gap-3">
              <p className="text-stone-700 text-sm font-semibold">Try to recall each section before revealing it.</p>
              <span className="text-xs text-stone-400 font-bold shrink-0">
                {revealed.length}/{bodyCategories.length} revealed
              </span>
            </div>
            <WarmStrip items={bodyCategories.map((cat) => (revealed.includes(cat.id) ? 'current' : 'todo'))} />
          </div>
          <div className="px-5 pt-4 pb-3 border-b border-stone-100 bg-amber-50">
            <p className="text-xl font-bold text-stone-900">{c.term || '—'}</p>
          </div>
          <div className="px-5 py-4 space-y-3">
            {bodyCategories.map((cat) => (
              <Panel
                key={cat.id}
                label={cat.label}
                open={revealed.includes(cat.id)}
                testMode
                prompt={promptFor(c, cat)}
                onToggle={() => toggleOpen(cat.id)}
              >
                <PanelBody cat={cat} content={c} />
              </Panel>
            ))}
          </div>
          {allSeen && (
            <div className="mx-5 mb-5 rounded-2xl bg-amber-50 px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-amber-800 text-sm font-bold">All sections reviewed ✓</p>
              <button
                type="button"
                onClick={() => setMode('read')}
                className="text-xs font-bold text-amber-700 hover:text-amber-900 border-2 border-amber-300 rounded-full px-3 py-1 shrink-0"
              >
                Back to reading
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
