/**
 * Tutorial V3 concept card.
 *
 * The card itself is the one the concept-card pipeline produces — the same
 * `ConceptCardTemplate` a standalone card renders in. A concept card does not
 * change shape because it was embedded in a tutorial, so nothing here redraws
 * it; the template is rendered as-is.
 *
 * What V3 adds is the chrome around it, and only things the tutorial context
 * justifies:
 *
 *   · Test yourself — the panels come back as prompts to answer from memory
 *     before they will reveal. Standalone, a card is a reference sheet; inside
 *     a lesson it is also something to be learnt.
 *   · Compact — a tutorial can carry several cards, and a full sheet each is a
 *     lot of page. Collapsing to the one-sentence meaning keeps the lesson
 *     readable.
 *   · Bookmark — sends the term to the reader's glossary, which only exists
 *     because there is a tutorial around the card.
 *   · Completion — reading every panel is what marks this block done for the
 *     section sidebar.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { ConceptCardContent } from '../../../../../lib/types';
import {
  categoryBody,
  normalizeConceptCardContent,
  resolveConceptCategories,
  type ConceptCategoryDef,
} from '../../../../../lib/conceptCard';
import { ConceptCardTemplate } from '../../ConceptCardTemplate';
import { useLearnerProgress } from './LearnerProgressContext';
import { AMBER, NAVY } from './warm/theme';

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

/** One panel in Test-yourself: the prompt, then the template's own body text. */
function RecallPanel({
  label,
  prompt,
  revealed,
  onReveal,
  children,
}: {
  label: string;
  prompt: string;
  revealed: boolean;
  onReveal: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.08)', background: '#fff' }}>
      <div className="flex items-center justify-between gap-3" style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.02)' }}>
        <span style={{ fontSize: 10.5, letterSpacing: '0.13em', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase' }}>
          {label}
        </span>
        {!revealed && (
          <button
            type="button"
            onClick={onReveal}
            className="px-3 py-1 rounded-full"
            style={{ fontSize: 11.5, fontWeight: 650, color: '#B45309', border: '1px solid rgba(217,119,6,0.35)' }}
          >
            Reveal
          </button>
        )}
      </div>
      {!revealed ? (
        <p style={{ padding: '12px 14px', fontSize: 13, color: '#92400E', lineHeight: 1.5, background: 'rgba(217,119,6,0.05)' }}>
          {prompt}
        </p>
      ) : (
        <div style={{ padding: '12px 14px', fontSize: 13.5, lineHeight: 1.55, color: '#1F2937', whiteSpace: 'pre-wrap' }}>
          {children}
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

  const [mode, setMode] = useState<'read' | 'test'>('read');
  const [compact, setCompact] = useState(false);
  const [revealed, setRevealed] = useState<string[]>([]);

  const { markBlockDone, isBookmarked, toggleBookmark } = useLearnerProgress();
  const bookmarkKey = `concept:${blockId}`;
  const bookmarked = isBookmarked(bookmarkKey);

  const allRevealed = categories.length > 0 && categories.every((cat) => revealed.includes(cat.id));

  /**
   * Reading the sheet is finishing it. Test-yourself finishes it too, but only
   * once every panel has actually been answered and revealed.
   */
  useEffect(() => {
    if (mode === 'read' && !compact) markBlockDone(blockId);
    else if (allRevealed) markBlockDone(blockId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, compact, allRevealed, blockId]);

  const meaning = categoryBody(c, 'meaning') || c.oneSentenceMeaning || '';

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* V3 chrome. The card below it is untouched. */}
      <div className="flex items-center justify-end gap-2 flex-wrap" style={{ marginBottom: 8 }}>
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.12)' }}>
          <button
            type="button"
            onClick={() => setMode('read')}
            className="px-3 py-1.5"
            style={{ fontSize: 11.5, fontWeight: 650, background: mode === 'read' ? NAVY : 'transparent', color: mode === 'read' ? '#fff' : '#6B7280' }}
          >
            Read
          </button>
          <button
            type="button"
            onClick={() => { setMode('test'); setRevealed([]); setCompact(false); }}
            className="px-3 py-1.5"
            style={{ fontSize: 11.5, fontWeight: 650, background: mode === 'test' ? AMBER : 'transparent', color: mode === 'test' ? '#fff' : '#6B7280' }}
          >
            Test yourself
          </button>
        </div>
        <button
          type="button"
          onClick={() => setCompact((v) => !v)}
          title={compact ? 'Expand card' : 'Collapse to one sentence'}
          aria-pressed={compact}
          className="flex items-center justify-center rounded"
          style={{ width: 27, height: 27, border: '1px solid rgba(0,0,0,0.12)', color: '#6B7280', fontSize: 12 }}
        >
          {compact ? '⊞' : '⊟'}
        </button>
        <button
          type="button"
          onClick={() => toggleBookmark(bookmarkKey)}
          title="Bookmark to glossary"
          aria-pressed={bookmarked}
          className="flex items-center justify-center rounded"
          style={{
            width: 27,
            height: 27,
            border: `1px solid ${bookmarked ? AMBER : 'rgba(0,0,0,0.12)'}`,
            background: bookmarked ? AMBER : 'transparent',
            color: bookmarked ? '#fff' : '#6B7280',
            fontSize: 13,
          }}
        >
          {bookmarked ? '★' : '☆'}
        </button>
      </div>

      {compact ? (
        <div
          style={{
            background: '#fff',
            borderRadius: 18,
            padding: '16px 18px',
            border: '1px solid rgba(0,0,0,0.06)',
            boxShadow: '0 10px 36px -18px rgba(30,50,80,0.28)',
            fontFamily: "'Nunito', system-ui, sans-serif",
          }}
        >
          <p style={{ fontSize: 15, fontWeight: 700, color: '#0B1220', marginBottom: 4 }}>{c.term || '—'}</p>
          <p style={{ fontSize: 13.5, color: '#374151', fontStyle: 'italic', lineHeight: 1.55 }}>{meaning || '—'}</p>
          <button
            type="button"
            onClick={() => setCompact(false)}
            style={{ fontSize: 11.5, color: '#B45309', fontWeight: 650, marginTop: 8 }}
          >
            Expand →
          </button>
        </div>
      ) : mode === 'read' ? (
        /* The pipeline's own card, rendered exactly as a standalone one is. */
        <ConceptCardTemplate content={content} />
      ) : (
        <div
          style={{
            background: '#fff',
            borderRadius: 18,
            padding: '18px 16px 20px',
            border: '1px solid rgba(0,0,0,0.06)',
            boxShadow: '0 10px 36px -18px rgba(30,50,80,0.28)',
            fontFamily: "'Nunito', system-ui, sans-serif",
          }}
        >
          <p style={{ fontSize: 10, letterSpacing: '0.14em', color: '#9AA3AF', fontWeight: 700, marginBottom: 4 }}>TERM</p>
          <p style={{ fontSize: 20, fontWeight: 700, color: '#0B1220', marginBottom: 12 }}>{c.term || '—'}</p>

          <div className="flex items-center justify-between gap-3" style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 13, color: '#374151' }}>Answer each prompt from memory, then reveal.</p>
            <span style={{ fontSize: 11.5, color: '#9AA3AF', fontWeight: 650 }}>
              {revealed.length}/{categories.length} revealed
            </span>
          </div>
          <div className="flex gap-1" style={{ marginBottom: 14 }} aria-hidden>
            {categories.map((cat) => (
              <div
                key={cat.id}
                style={{
                  height: 4,
                  flex: 1,
                  borderRadius: 99,
                  background: revealed.includes(cat.id) ? AMBER : 'rgba(0,0,0,0.09)',
                  transition: 'background 200ms ease',
                }}
              />
            ))}
          </div>

          <div className="space-y-2.5">
            {categories.map((cat) => (
              <RecallPanel
                key={cat.id}
                label={cat.label}
                prompt={promptFor(c, cat)}
                revealed={revealed.includes(cat.id)}
                onReveal={() => setRevealed((p) => (p.includes(cat.id) ? p : [...p, cat.id]))}
              >
                {categoryBody(c, cat.id) || '—'}
              </RecallPanel>
            ))}
          </div>

          {allRevealed && (
            <div
              className="flex items-center justify-between gap-3 rounded-xl"
              style={{ marginTop: 14, padding: '11px 14px', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)' }}
            >
              <p style={{ fontSize: 13, color: '#92400E', fontWeight: 650 }}>All sections reviewed ✓</p>
              <button
                type="button"
                onClick={() => setMode('read')}
                className="px-3 py-1 rounded"
                style={{ fontSize: 11.5, color: '#B45309', border: '1px solid rgba(217,119,6,0.35)', fontWeight: 650 }}
              >
                Back to the card
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
