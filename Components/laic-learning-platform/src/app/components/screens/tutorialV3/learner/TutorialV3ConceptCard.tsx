/**
 * Tutorial V3 concept card.
 *
 * The schema was already complete — this is a behaviour change, not a content
 * one. The flat sheet where every panel sits open becomes progressive: panels
 * disclose one at a time, a Test-yourself mode asks for recall before it will
 * reveal anything, the card collapses to its one-sentence meaning, CONNECTION
 * is promoted out of the body into a RELATES TO chip above the fold, and the
 * card can be bookmarked into the glossary the reader already has.
 *
 * Panel content is drawn through the same `lib/conceptCard` helpers the V1
 * sheet uses, so the two never disagree about what a category says.
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
      <div className="rounded-lg overflow-hidden mt-2" style={{ aspectRatio: '16 / 9' }}>
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
      className="mt-2 rounded-lg"
      style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'contain' }}
    />
  );
}

function VisualBody({ content }: { content: ConceptCardContent }) {
  const { visualChoice, visualAlternative, visualFormula, visualOrFormula } = content;
  if (!visualChoice && !visualAlternative && !visualFormula) {
    return <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{visualOrFormula || '—'}</p>;
  }
  return (
    <div>
      {(visualChoice || visualAlternative) && (
        <div className="flex items-stretch rounded-lg overflow-hidden" style={{ border: '1px solid rgba(217,119,6,0.3)' }}>
          <div className="flex-1 text-center" style={{ background: 'rgba(217,119,6,0.08)', padding: '10px 14px' }}>
            <p style={{ fontSize: 10, letterSpacing: '0.12em', color: '#B45309', fontWeight: 700, marginBottom: 3 }}>CHOICE</p>
            <p style={{ fontSize: 13, color: '#1F2937', fontWeight: 600 }}>{visualChoice || '—'}</p>
          </div>
          <div className="flex items-center justify-center" style={{ padding: '0 12px', background: '#fff', borderLeft: '1px solid rgba(217,119,6,0.25)', borderRight: '1px solid rgba(217,119,6,0.25)' }}>
            <span style={{ color: AMBER, fontSize: 12, fontWeight: 700 }}>vs</span>
          </div>
          <div className="flex-1 text-center" style={{ background: 'rgba(0,0,0,0.03)', padding: '10px 14px' }}>
            <p style={{ fontSize: 10, letterSpacing: '0.12em', color: '#9AA3AF', fontWeight: 700, marginBottom: 3 }}>ALTERNATIVE</p>
            <p style={{ fontSize: 13, color: '#6B7280' }}>{visualAlternative || '—'}</p>
          </div>
        </div>
      )}
      {(visualFormula || visualOrFormula) && (
        <p className="text-center" style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: '#4B5563' }}>
          {visualFormula || visualOrFormula}
        </p>
      )}
    </div>
  );
}

function PanelBody({ cat, content }: { cat: ConceptCategoryDef; content: ConceptCardContent }) {
  if (cat.id === 'components') {
    const bullets = content.keyComponents || [];
    if (!bullets.length) return <>{categoryBody(content, cat.id) || '—'}</>;
    return (
      <>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {bullets.map((b) => <li key={b} style={{ marginBottom: 4 }}>{b}</li>)}
        </ul>
        <PanelMedia id={cat.id} content={content} />
      </>
    );
  }
  if (cat.id === 'visual') return <VisualBody content={content} />;
  const text = categoryBody(content, cat.id);
  return (
    <div style={{ whiteSpace: 'pre-wrap' }}>
      {text || (content.categoryMedia?.[cat.id]?.url ? '' : '—')}
      <PanelMedia id={cat.id} content={content} />
    </div>
  );
}

/** One disclosing panel — an accordion when reading, a reveal when testing. */
function Disclosure({
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
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.09)' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between text-left transition-colors"
        style={{ padding: '11px 14px', background: open ? 'rgba(0,0,0,0.02)' : '#fff' }}
      >
        <span style={{ fontSize: 10.5, letterSpacing: '0.13em', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase' }}>
          {label}
        </span>
        <span style={{ fontSize: 11.5, color: open ? '#9AA3AF' : AMBER, fontWeight: 650 }}>
          {testMode ? (open ? '▾' : 'Reveal') : (open ? '▾' : '▸')}
        </span>
      </button>
      {testMode && !open && prompt && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(0,0,0,0.05)', background: 'rgba(217,119,6,0.04)' }}>
          <p style={{ fontSize: 12.5, color: '#92400E', lineHeight: 1.5 }}>{prompt}</p>
        </div>
      )}
      {open && (
        <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(0,0,0,0.06)', background: '#fff', fontSize: 13.5, lineHeight: 1.55, color: '#1F2937' }}>
          {children}
          {testMode && prompt && (
            <p style={{ fontSize: 11.5, color: '#9AA3AF', marginTop: 8 }}>Q: {prompt}</p>
          )}
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

  // CONNECTION is promoted into the header chip, so it does not also sit in the
  // body — otherwise the same sentence appears twice on one card.
  const bodyCategories = useMemo(
    () => categories.filter((cat) => cat.id !== 'connection'),
    [categories],
  );
  const connection = categoryBody(c, 'connection');

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

  const meaning = categoryBody(c, 'meaning') || c.oneSentenceMeaning || '';

  return (
    <div
      className="rounded-[18px] overflow-hidden"
      style={{ border: '1.5px solid rgba(217,119,6,0.3)', background: 'rgba(217,119,6,0.05)', maxWidth: 720, margin: '0 auto' }}
    >
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(217,119,6,0.2)' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="shrink-0 px-2 py-0.5 rounded"
              style={{ fontSize: 10, letterSpacing: '0.13em', color: '#B45309', background: 'rgba(217,119,6,0.14)', fontWeight: 700 }}
            >
              CONCEPT CARD
            </span>
            <h3 className="truncate" style={{ fontSize: 17, fontWeight: 700, color: '#0B1220' }}>{c.term || '—'}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(217,119,6,0.3)' }}>
              <button
                type="button"
                onClick={() => setMode('read')}
                className="px-3 py-1.5"
                style={{ fontSize: 11.5, fontWeight: 650, background: mode === 'read' ? '#0e1c35' : 'transparent', color: mode === 'read' ? '#fff' : '#B45309' }}
              >
                Read
              </button>
              <button
                type="button"
                onClick={() => { setMode('test'); setRevealed([]); setCompact(false); }}
                className="px-3 py-1.5"
                style={{ fontSize: 11.5, fontWeight: 650, background: mode === 'test' ? AMBER : 'transparent', color: mode === 'test' ? '#fff' : '#B45309' }}
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
              style={{ width: 27, height: 27, border: '1px solid rgba(217,119,6,0.3)', color: '#B45309', fontSize: 12 }}
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
                border: `1px solid ${bookmarked ? AMBER : 'rgba(217,119,6,0.3)'}`,
                background: bookmarked ? AMBER : 'transparent',
                color: bookmarked ? '#fff' : '#B45309',
                fontSize: 13,
              }}
            >
              {bookmarked ? '★' : '☆'}
            </button>
          </div>
        </div>

        {/* RELATES TO — above the fold, where a connection is actually useful. */}
        {connection && (
          <div className="flex items-start gap-2" style={{ marginTop: 11 }}>
            <span
              className="shrink-0 px-1.5 py-0.5 rounded"
              style={{ fontSize: 9, letterSpacing: '0.12em', color: '#B45309', background: 'rgba(217,119,6,0.14)', fontWeight: 700, marginTop: 1 }}
            >
              RELATES TO
            </span>
            <p style={{ fontSize: 12.5, color: '#92400E', lineHeight: 1.45 }}>{connection}</p>
          </div>
        )}
      </div>

      {compact ? (
        <div style={{ padding: '12px 16px', background: '#fff' }}>
          <p style={{ fontSize: 13.5, color: '#374151', fontStyle: 'italic', lineHeight: 1.55 }}>{meaning || '—'}</p>
          <button
            type="button"
            onClick={() => setCompact(false)}
            style={{ fontSize: 11.5, color: '#B45309', fontWeight: 650, marginTop: 8 }}
          >
            Expand →
          </button>
        </div>
      ) : (
        <div style={{ background: '#fff' }}>
          {mode === 'test' && (
            <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <div className="flex items-center justify-between gap-3" style={{ marginBottom: 8 }}>
                <p style={{ fontSize: 13, color: '#374151' }}>Answer each prompt from memory, then reveal.</p>
                <span style={{ fontSize: 11.5, color: '#9AA3AF', fontWeight: 650 }}>
                  {revealed.length}/{bodyCategories.length} revealed
                </span>
              </div>
              <div className="flex gap-1" aria-hidden>
                {bodyCategories.map((cat, i) => (
                  <div
                    key={cat.id}
                    style={{
                      height: 4,
                      flex: 1,
                      borderRadius: 99,
                      background: i < revealed.length ? AMBER : 'rgba(0,0,0,0.09)',
                      transition: 'background 200ms ease',
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2.5" style={{ padding: '14px 16px 16px' }}>
            {bodyCategories.length === 0 && (
              <p style={{ fontSize: 13.5, color: '#9AA3AF', textAlign: 'center', padding: 16 }}>
                No categories selected in Define.
              </p>
            )}
            {bodyCategories.map((cat) => (
              <Disclosure
                key={cat.id}
                label={cat.label}
                open={seen.includes(cat.id)}
                testMode={mode === 'test'}
                prompt={mode === 'test' ? promptFor(c, cat) : undefined}
                onToggle={() => toggleOpen(cat.id)}
              >
                <PanelBody cat={cat} content={c} />
              </Disclosure>
            ))}
          </div>

          {mode === 'test' && allSeen && (
            <div
              className="flex items-center justify-between gap-3 rounded-xl"
              style={{ margin: '0 16px 16px', padding: '11px 14px', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)' }}
            >
              <p style={{ fontSize: 13, color: '#92400E', fontWeight: 650 }}>All sections reviewed ✓</p>
              <button
                type="button"
                onClick={() => setMode('read')}
                className="px-3 py-1 rounded"
                style={{ fontSize: 11.5, color: '#B45309', border: '1px solid rgba(217,119,6,0.35)', fontWeight: 650 }}
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
