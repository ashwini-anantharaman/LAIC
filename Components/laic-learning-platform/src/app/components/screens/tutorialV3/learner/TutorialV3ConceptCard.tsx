/**
 * Tutorial V3 concept card — the reference export's `ConceptCardBlock` from
 * `blocks.tsx`.
 *
 * An amber sheet with a mono CONCEPT CARD chip, a RELATES TO line under the
 * term, a white body whose first panel — ONE-SENTENCE MEANING — is always open,
 * and the rest disclosing one at a time under mono field labels. Read and Test
 * yourself sit in a bordered pair, with a compact toggle and a bookmark star
 * beside them.
 *
 * Which panels exist is the author's choice in Define; the layout is not.
 * `meaning` is promoted to the open panel and `connection` to the chip, exactly
 * as the reference does, so neither appears twice.
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
import { AMBER, NAVY } from './warm/theme';

/**
 * Fallback recall prompts, used when the author has not written one for a
 * panel. `recallQuestion` is a single card-level string and cannot cover eight
 * panels, which is why `sectionRecallPrompts` exists.
 */
const DEFAULT_PROMPTS: Record<string, string> = {
  why: 'Why does this concept matter?',
  core: 'Explain the core idea in full.',
  components: 'List the key components and what each contributes.',
  visual: 'What does the visual or formula show?',
  example: 'Give an example.',
  nonExample: 'Give a non-example — something that looks like it but is not.',
  mistake: 'What mistake do most people make with this?',
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
      <div className="rounded overflow-hidden mt-3" style={{ aspectRatio: '16 / 9' }}>
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
      className="mt-3 rounded"
      style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain' }}
    />
  );
}

/** The two-box "this, not that" diagram with its formula beneath. */
function VisualDiagram({ content }: { content: ConceptCardContent }) {
  const { visualChoice, visualAlternative, visualFormula, visualOrFormula } = content;
  const formula = visualFormula || visualOrFormula;
  if (!visualChoice && !visualAlternative) {
    if (!formula) return null;
    return (
      <div className="my-4 text-center">
        <code className="font-mono text-xs text-stone-600 bg-stone-100 px-3 py-1.5 rounded">{formula}</code>
      </div>
    );
  }
  return (
    <div className="my-4">
      <div className="flex items-stretch gap-0 rounded-lg overflow-hidden border border-amber-200">
        <div className="flex-1 bg-amber-50 px-4 py-3 text-center">
          <p className="font-mono text-[10px] text-amber-600 tracking-wider mb-1">CHOICE</p>
          <p className="text-stone-800 text-sm font-medium">{visualChoice || '—'}</p>
        </div>
        <div className="flex items-center justify-center px-3 bg-white border-x border-amber-200">
          <span className="text-amber-400 font-mono text-sm">vs</span>
        </div>
        <div className="flex-1 bg-stone-50 px-4 py-3 text-center">
          <p className="font-mono text-[10px] text-stone-400 tracking-wider mb-1">ALTERNATIVE</p>
          <p className="text-stone-500 text-sm">{visualAlternative || '—'}</p>
        </div>
      </div>
      {formula && (
        <div className="mt-2 text-center">
          <code className="font-mono text-xs text-stone-600 bg-stone-100 px-3 py-1.5 rounded">{formula}</code>
        </div>
      )}
    </div>
  );
}

function PanelBody({ cat, content }: { cat: ConceptCategoryDef; content: ConceptCardContent }) {
  if (cat.id === 'visual') {
    return (
      <>
        <VisualDiagram content={content} />
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
        <div className="space-y-2">
          {bullets.map((b) => (
            <div key={b} className="flex items-start gap-2">
              <span className="text-amber-500 shrink-0 mt-0.5 text-xs">→</span>
              <p className="text-stone-700 text-sm leading-snug">{b}</p>
            </div>
          ))}
        </div>
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

/** One disclosing panel — an accordion when reading, a reveal when testing. */
function SectionReveal({
  fieldLabel,
  open,
  testMode,
  prompt,
  onToggle,
  children,
}: {
  fieldLabel: string;
  open: boolean;
  testMode: boolean;
  prompt?: string;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-stone-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
          open ? 'bg-stone-50' : 'bg-white hover:bg-stone-50'
        }`}
      >
        <span className="font-mono text-[10px] text-stone-400 tracking-wider">{fieldLabel}</span>
        <span className="text-stone-300 font-mono text-sm">
          {testMode ? (open ? '▾' : 'Reveal') : (open ? '▾' : '▸')}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-stone-100 bg-white">
          {children}
          {testMode && prompt && <p className="text-stone-400 text-xs mt-2 font-mono">Q: {prompt}</p>}
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

  /** The header carries meaning and connection, so the body does not repeat them. */
  const bodyCategories = useMemo(
    () => categories.filter((cat) => cat.id !== 'connection' && cat.id !== 'meaning'),
    [categories],
  );

  const [mode, setMode] = useState<'read' | 'test'>('read');
  const [compact, setCompact] = useState(false);
  const [opened, setOpened] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<string[]>([]);

  const { markBlockDone, isBookmarked, toggleBookmark } = useLearnerProgress();
  const bookmarkKey = `concept:${blockId}`;
  const bookmarked = isBookmarked(bookmarkKey);

  const seen = mode === 'test' ? revealed : opened;
  const allSeen = bodyCategories.length > 0 && bodyCategories.every((cat) => seen.includes(cat.id));

  // Finished means the learner has been through every panel, in either mode —
  // not that the card scrolled past.
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

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-amber-100">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-[10px] tracking-widest text-amber-700 bg-amber-100 px-2 py-0.5 rounded shrink-0">
              CONCEPT CARD
            </span>
            <h3 className="text-lg text-stone-900 truncate">{c.term || '—'}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex rounded-lg border border-amber-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setMode('read')}
                className={`px-3 py-1.5 text-xs font-mono transition-colors ${
                  mode === 'read' ? 'text-white' : 'text-amber-700 hover:bg-amber-100'
                }`}
                style={mode === 'read' ? { background: NAVY } : undefined}
              >
                Read
              </button>
              <button
                type="button"
                onClick={() => { setMode('test'); setRevealed([]); setCompact(false); }}
                className={`px-3 py-1.5 text-xs font-mono transition-colors ${
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
              title={compact ? 'Expand' : 'Compact'}
              aria-pressed={compact}
              className="w-7 h-7 flex items-center justify-center rounded border border-amber-200 text-amber-600 hover:bg-amber-100 font-mono text-xs"
            >
              {compact ? '⊞' : '⊟'}
            </button>
            <button
              type="button"
              onClick={() => toggleBookmark(bookmarkKey)}
              title="Bookmark to glossary"
              aria-pressed={bookmarked}
              className={`w-7 h-7 flex items-center justify-center rounded border transition-colors text-sm ${
                bookmarked ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-200 text-amber-600 hover:bg-amber-100'
              }`}
            >
              {bookmarked ? '★' : '☆'}
            </button>
          </div>
        </div>

        {connection && (
          <div className="mt-3 flex items-start gap-2">
            <span className="font-mono text-[9px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded tracking-wider shrink-0 mt-0.5">
              RELATES TO
            </span>
            <p className="text-amber-800 text-xs leading-snug">{connection}</p>
          </div>
        )}
      </div>

      {compact ? (
        <div className="px-5 py-3 bg-white">
          <p className="text-stone-700 text-sm italic">{meaning || '—'}</p>
          <button
            type="button"
            onClick={() => setCompact(false)}
            className="text-xs text-amber-600 font-mono mt-2 hover:text-amber-800"
          >
            Expand →
          </button>
        </div>
      ) : mode === 'read' ? (
        <div className="px-5 py-4 space-y-3 bg-white">
          {meaning && (
            <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3">
              <p className="font-mono text-[10px] text-amber-700 tracking-wider mb-1">ONE-SENTENCE MEANING</p>
              <p className="text-stone-800 text-sm">{meaning}</p>
            </div>
          )}
          {bodyCategories.length === 0 && !meaning && (
            <p className="text-stone-400 text-sm text-center py-4">No categories selected in Define.</p>
          )}
          {bodyCategories.map((cat) => (
            <SectionReveal
              key={cat.id}
              fieldLabel={cat.label.toUpperCase()}
              open={opened.includes(cat.id)}
              testMode={false}
              onToggle={() => toggleOpen(cat.id)}
            >
              <PanelBody cat={cat} content={c} />
            </SectionReveal>
          ))}
        </div>
      ) : (
        <div className="bg-white">
          <div className="px-5 pt-4 pb-3 border-b border-stone-100">
            <div className="flex items-center justify-between mb-2 gap-3">
              <p className="text-stone-700 text-sm">Recall each section before revealing it.</p>
              <span className="font-mono text-xs text-stone-400 shrink-0">
                {revealed.length}/{bodyCategories.length} revealed
              </span>
            </div>
            <div className="flex gap-1" aria-hidden>
              {bodyCategories.map((cat) => (
                <div
                  key={cat.id}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    revealed.includes(cat.id) ? 'bg-amber-500' : 'bg-stone-200'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="px-5 pt-4 pb-3 border-b border-stone-100 bg-amber-50">
            <p className="font-mono text-[10px] text-amber-700 tracking-wider mb-1">TERM</p>
            <p className="text-xl text-stone-900">{c.term || '—'}</p>
          </div>

          <div className="px-5 py-4 space-y-3">
            {bodyCategories.map((cat) => (
              <SectionReveal
                key={cat.id}
                fieldLabel={cat.label.toUpperCase()}
                open={revealed.includes(cat.id)}
                testMode
                prompt={promptFor(c, cat)}
                onToggle={() => toggleOpen(cat.id)}
              >
                <PanelBody cat={cat} content={c} />
              </SectionReveal>
            ))}
          </div>

          {allSeen && (
            <div className="mx-5 mb-5 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-amber-800 text-sm font-medium">All sections reviewed ✓</p>
              <button
                type="button"
                onClick={() => setMode('read')}
                className="text-xs font-mono text-amber-700 hover:text-amber-900 border border-amber-300 rounded px-3 py-1 shrink-0"
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
