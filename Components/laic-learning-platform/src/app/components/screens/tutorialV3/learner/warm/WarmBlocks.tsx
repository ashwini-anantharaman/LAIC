/**
 * Every block type a Tutorial V3 student can meet that is not one of the four
 * with a renderer of its own, drawn in the reference export's visual language.
 *
 * The reference tutorial only contains prose, concept cards, quizzes,
 * flashcards, tables, auctions and a card-play problem. The platform's block
 * vocabulary is wider than that, so the types the reference has no drawing for
 * — summary, reflection, assignment, image, video, drill, live bridge table —
 * are built from the same parts it does use: a white `rounded-2xl` card on a
 * soft shadow, stone prose, amber for the author's own asides, sage for the one
 * action that moves the learner forward.
 *
 * Nothing here decides what a block says. Every string on screen comes from the
 * course developer's content.
 */

import React, { useState } from 'react';
import type {
  AssignmentContent,
  BridgePlayContent,
  BridgeTableContent,
  DrillContent,
  ImageContent,
  LearningObject,
  ReflectionContent,
  SummaryContent,
  VideoEmbedContent,
  VideoScriptContent,
} from '../../../../../../lib/types';
import { richTextToSafeHtml } from '../../../../../../lib/richTextMarkdown';
import { readBridgeConfig } from '../../../../../../lib/tutorialV2/bridgeEmbed';
import { mockDrillContent } from '../../../../../../lib/mockDrillBlueprint';
import { DrillView } from '../../../drill/DrillView';
import { VideoScriptPlayer } from '../../../VideoScriptPlayer';
import { BridgeEmbedBlock } from '../../../tutorialV2/BridgeEmbedBlock';
import type { QuizResolveStatus } from '../../../McqClusterExperience';
import { SAGE, suitColor } from './theme';
import { WarmCard } from './WarmPrimitives';

/* ── rich text ─────────────────────────────────────────────────── */

/**
 * Prose at the reference's reading size. The body arrives as HTML from the
 * generator, so the element rules live in a scoped stylesheet rather than in
 * class names — one copy of it, keyed to `.tv3-prose`.
 */
export function WarmRichText({
  text,
  heading,
  subheads,
}: {
  text: string;
  heading?: string;
  subheads?: string[];
}) {
  const body = text && text.trim() ? richTextToSafeHtml(text) : '';
  if (!body && !heading && !(subheads || []).length) return null;
  return (
    <div className="tv3-prose">
      {heading && <h2 className="text-2xl font-bold text-stone-900 mb-3 leading-tight">{heading}</h2>}
      {subheads && subheads.length > 0 && (
        <ul className="mb-4 pl-5 text-stone-500 text-sm font-semibold list-disc space-y-1">
          {subheads.map((s) => <li key={s}>{s}</li>)}
        </ul>
      )}
      {body && (
        <div
          className="text-stone-700 text-[15px] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: body }}
        />
      )}
    </div>
  );
}

/** Injected once by the reader; every `.tv3-prose` body on the page uses it. */
export const WARM_PROSE_CSS = `
.tv3-prose h1 { font-size: 1.75rem; font-weight: 700; color: #1c1917; margin: 24px 0 10px; line-height: 1.2; }
.tv3-prose h2 { font-size: 1.5rem; font-weight: 700; color: #1c1917; margin: 22px 0 10px; line-height: 1.25; }
.tv3-prose h3 { font-size: 1.125rem; font-weight: 700; color: #1c1917; margin: 18px 0 8px; }
.tv3-prose p { margin: 0 0 12px; }
.tv3-prose ul { margin: 0 0 12px; padding-left: 1.25rem; list-style: disc; }
.tv3-prose ol { margin: 0 0 12px; padding-left: 1.25rem; list-style: decimal; }
.tv3-prose li { margin: 0 0 4px; }
.tv3-prose blockquote {
  margin: 0 0 14px; padding: 12px 16px;
  background: #fffbeb; border-radius: 16px; color: #78716c; font-weight: 500;
}
.tv3-prose code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em; background: #f5f5f4; padding: 0.1em 0.4em; border-radius: 6px;
}
.tv3-prose table { width: 100%; border-collapse: collapse; margin: 0 0 14px; font-size: 0.9rem; }
.tv3-prose th { text-align: left; padding: 10px 14px; background: #fafaf9; color: #78716c; font-weight: 700; font-size: 0.75rem; }
.tv3-prose td { padding: 10px 14px; border-top: 1px solid #f5f5f4; color: #57534e; font-weight: 500; }
.tv3-prose a { color: #4d7c5a; text-decoration: underline; font-weight: 600; }
.tv3-prose strong { font-weight: 700; color: #1c1917; }
.tv3-prose em { font-style: italic; }
.tv3-prose img { max-width: 100%; border-radius: 16px; }
`;

/* ── summary ───────────────────────────────────────────────────── */

export function WarmSummary({ content }: { content: SummaryContent }) {
  const points = content.keyPoints || [];
  return (
    <div>
      <h2 className="text-2xl font-bold text-stone-900 mb-2">{content.topic || 'Summary'}</h2>
      {content.tldr && <p className="text-stone-600 text-[15px] leading-relaxed mb-5">{content.tldr}</p>}

      {points.length > 0 && (
        <WarmCard className="p-6 mb-5">
          <h3 className="text-lg font-bold text-stone-900 mb-4">Key points</h3>
          <ol className="space-y-4">
            {points.map((p, i) => (
              <li key={i} className="flex items-start gap-4">
                <span
                  className="flex items-center justify-center w-7 h-7 rounded-full text-white text-sm font-black shrink-0 mt-0.5"
                  style={{ background: SAGE }}
                >
                  {i + 1}
                </span>
                <span className="text-stone-700 text-[15px] leading-snug pt-0.5 font-medium">{p}</span>
              </li>
            ))}
          </ol>
        </WarmCard>
      )}

      {content.body && (
        <WarmCard tone="stone" className="p-6">
          <p className="text-stone-700 text-[15px] leading-relaxed font-medium whitespace-pre-wrap">{content.body}</p>
        </WarmCard>
      )}
    </div>
  );
}

/* ── reflection ────────────────────────────────────────────────── */

export function WarmReflection({ content, blockId }: { content: ReflectionContent; blockId: string }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const prompts = content.prompts || [];
  if (!prompts.length) return null;
  const shared = String(content.visibility || '').toLowerCase().includes('share');

  return (
    <div>
      <h2 className="text-2xl font-bold text-stone-900 mb-2">Reflection</h2>
      {content.goal && <p className="text-stone-600 text-[15px] leading-relaxed mb-5">{content.goal}</p>}

      <div className="space-y-3">
        {prompts.map((p, i) => (
          <WarmCard key={p.id || i} className="p-5">
            <p className="text-stone-900 text-[15px] leading-relaxed font-medium mb-3">{p.prompt}</p>
            {(p.starters || []).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {(p.starters || []).map((s, si) => (
                  <button
                    key={si}
                    type="button"
                    onClick={() => setAnswers((prev) => ({
                      ...prev,
                      [p.id || String(i)]: `${prev[p.id || String(i)] || ''}${prev[p.id || String(i)] ? ' ' : ''}${s}`,
                    }))}
                    className="text-xs font-bold px-3 py-1.5 rounded-full border-2 border-stone-200 text-stone-500 hover:border-stone-400"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <textarea
              rows={4}
              value={answers[p.id || String(i)] || ''}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [p.id || String(i)]: e.target.value }))}
              placeholder="Write your response here…"
              className="w-full text-sm text-stone-800 border-2 border-stone-200 rounded-xl p-3 resize-none focus:outline-none focus:border-amber-400 font-medium"
              data-block={blockId}
            />
          </WarmCard>
        ))}
      </div>

      <p className="text-xs text-stone-400 font-semibold mt-3 px-1">
        {shared ? 'Shared with your group.' : 'Private to you.'}
      </p>
    </div>
  );
}

/* ── assignment ────────────────────────────────────────────────── */

export function WarmAssignment({ content }: { content: AssignmentContent }) {
  const requirements = content.requirements || [];
  const rubric = content.rubric || [];
  return (
    <div>
      <h2 className="text-2xl font-bold text-stone-900 mb-2">{content.taskType || 'Assignment'}</h2>
      {content.objective && <p className="text-stone-600 text-[15px] leading-relaxed mb-5">{content.objective}</p>}

      {content.prompt && (
        <WarmCard tone="amber" className="p-6 mb-5">
          <h3 className="text-lg font-bold text-stone-900 mb-3">The task</h3>
          <p className="text-stone-700 text-[15px] leading-relaxed font-medium whitespace-pre-wrap">{content.prompt}</p>
        </WarmCard>
      )}

      {requirements.length > 0 && (
        <WarmCard className="p-6 mb-5">
          <h3 className="text-lg font-bold text-stone-900 mb-4">What to hand in</h3>
          <ul className="space-y-3">
            {requirements.map((r, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] shrink-0 mt-0.5 font-bold"
                  style={{ background: SAGE }}
                >
                  ✓
                </span>
                <span className="text-stone-700 text-[15px] font-medium">{r}</span>
              </li>
            ))}
          </ul>
          {(content.deliverable || content.expectedLength || content.requireCitations) && (
            <p className="text-xs text-stone-400 font-semibold mt-4">
              {[
                content.deliverable,
                content.expectedLength,
                content.requireCitations ? 'citations required' : '',
              ].filter(Boolean).join(' · ')}
            </p>
          )}
        </WarmCard>
      )}

      {rubric.length > 0 && (
        <div className="rounded-2xl bg-white shadow-sm overflow-x-auto">
          <div className="min-w-[320px]">
            <div className="grid grid-cols-2 border-b border-stone-100 bg-stone-50">
              <div className="px-4 py-2.5 text-xs font-bold text-stone-500">CRITERION</div>
              <div className="px-4 py-2.5 text-xs font-bold text-stone-500">WHAT GOOD LOOKS LIKE</div>
            </div>
            {rubric.map((r, i) => (
              <div key={i} className="grid grid-cols-2 border-b border-stone-100 last:border-0">
                <div className="px-4 py-3 text-sm font-bold text-stone-800">{r.criterion}</div>
                <div className="px-4 py-3 text-sm text-stone-600 font-medium">
                  {r.description || (r.levels || []).join(' · ') || '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── image ─────────────────────────────────────────────────────── */

export function WarmImage({ content }: { content: ImageContent }) {
  if (!content.url) return null;
  return (
    <figure className="rounded-2xl bg-white shadow-sm overflow-hidden">
      <img src={content.url} alt={content.alt || content.caption || ''} className="w-full block" />
      {content.caption && (
        <figcaption className="px-5 py-3 text-sm text-stone-500 font-medium">{content.caption}</figcaption>
      )}
    </figure>
  );
}

/* ── plain video embed ─────────────────────────────────────────── */

export function WarmVideoEmbed({ content }: { content: VideoEmbedContent }) {
  const id = content.videoId;
  if (!id) return null;
  const params = new URLSearchParams({ rel: '0' });
  if (content.start) params.set('start', String(content.start));
  if (content.end) params.set('end', String(content.end));
  return (
    <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
      <div style={{ aspectRatio: '16 / 9' }}>
        <iframe
          title="Video"
          src={`https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ width: '100%', height: '100%', border: 0 }}
        />
      </div>
    </div>
  );
}

/* ── card-play problem ─────────────────────────────────────────── */

/** One hand in the compass. */
function CompassHand({ label, cards, tone = 'stone' }: { label: string; cards: string; tone?: 'stone' | 'amber' }) {
  const rows = String(cards || '').split(/\s{2,}|\n|,/).map((s) => s.trim()).filter(Boolean);
  return (
    <div className={`rounded-xl p-3 border ${tone === 'amber' ? 'bg-amber-50 border-amber-200' : 'bg-stone-50 border-stone-200'}`}>
      <p className={`text-[10px] font-bold mb-1 ${tone === 'amber' ? 'text-amber-700' : 'text-stone-400'}`}>{label}</p>
      {rows.map((r, i) => {
        const suit = r.charAt(0);
        return (
          <p key={i} className="font-mono text-[13px] font-semibold" style={{ color: suitColor(suit) }}>
            <span>{r}</span>
          </p>
        );
      })}
    </div>
  );
}

export function WarmBridgePlay({ content }: { content: BridgePlayContent }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const options = content.south || [];
  const right = selected === content.correctAnswer;

  return (
    <div>
      <h2 className="text-xl font-bold text-stone-900 mb-2">{content.title || 'Card-play problem'}</h2>
      {content.description && (
        <p className="text-stone-600 text-[15px] leading-relaxed mb-5">{content.description}</p>
      )}

      <div className="rounded-2xl bg-white shadow-sm overflow-hidden mb-4">
        <div className="grid grid-cols-3 gap-2 p-3 sm:p-4">
          <div />
          <CompassHand label="NORTH (dummy)" cards={content.north} />
          <div />
          <CompassHand label="WEST" cards={content.west} />
          <div className="flex items-center justify-center text-stone-300 text-2xl">⟳</div>
          <CompassHand label="EAST" cards={content.east} />
          <div />
          <div className="rounded-xl p-3 border bg-amber-50 border-amber-200">
            <p className="text-[10px] text-amber-700 font-bold mb-1">SOUTH (you)</p>
            <p className="text-stone-700 text-xs font-semibold">Your cards are below.</p>
          </div>
          <div />
        </div>
        {content.trump && (
          <div className="px-4 py-3 bg-stone-50 border-t border-stone-100 text-sm text-stone-700 font-medium">
            <span className="text-xs font-bold text-stone-400 mr-2">TRUMP</span>{content.trump}
          </div>
        )}
      </div>

      <p className="text-stone-800 font-bold mb-3">Which card do you play?</p>
      <div className="flex flex-wrap gap-2 mb-4">
        {options.map((card) => {
          let cls = 'px-5 py-2.5 rounded-full border-2 text-sm font-bold font-mono transition-all ';
          if (!revealed) {
            cls += selected === card
              ? 'border-amber-400 bg-amber-50 text-amber-900 cursor-pointer'
              : 'border-stone-200 bg-white text-stone-700 hover:border-stone-400 cursor-pointer';
          } else if (card === content.correctAnswer) cls += 'border-green-400 bg-green-50 text-green-900 cursor-default';
          else if (selected === card) cls += 'border-red-300 bg-red-50 text-red-700 cursor-default';
          else cls += 'border-stone-100 text-stone-400 cursor-default';
          return (
            <button key={card} type="button" className={cls} disabled={revealed} onClick={() => setSelected(card)}>
              {card}
            </button>
          );
        })}
      </div>

      {revealed ? (
        <div className={`rounded-2xl px-4 py-3 text-sm ${right ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          <span className="font-bold">{right ? '✓ Correct. ' : '✗ Not quite. '}</span>
          <span className="font-medium">{content.explanation}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          disabled={!selected}
          className="px-6 py-2.5 rounded-full text-white text-sm font-bold disabled:opacity-30 transition-opacity"
          style={{ background: SAGE }}
        >
          Play {selected || 'a card'}
        </button>
      )}
    </div>
  );
}

/* ── the three that keep their own machinery ───────────────────── */

/**
 * A warm frame around a component the platform already owns.
 *
 * The drill engine, the checkpoint video player and the live bridge table are
 * real machinery, not layouts — reimplementing them to change their colour
 * would be a poor trade. They keep their behaviour and sit inside the same
 * white card every other block on the page sits inside, under a heading in the
 * reference's own type.
 */
function WarmFrame({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-stone-900 mb-2">{title}</h2>
      {note && <p className="text-stone-600 text-[15px] leading-relaxed mb-5">{note}</p>}
      <div className="rounded-2xl bg-white shadow-sm p-4 sm:p-5">{children}</div>
    </div>
  );
}

export function WarmDrill({ content }: { content: DrillContent }) {
  const hasItems = (content?.items && content.items.length > 0)
    || (content?.blueprint?.items && content.blueprint.items.length > 0);
  const resolved = hasItems ? content : mockDrillContent({
    skill: content?.skill,
    format: content?.format,
    difficultyCurve: content?.difficultyCurve,
    feedback: content?.feedback,
    timed: content?.timed,
    repeatUntilMastery: content?.repeatUntilMastery ?? true,
  });
  return (
    <WarmFrame title={content?.skill || 'Practice drill'} note={content?.format ? `${content.format} practice.` : undefined}>
      <DrillView content={resolved} />
    </WarmFrame>
  );
}

export function WarmVideoScript({
  content,
  objectId,
  title,
}: {
  content: VideoScriptContent;
  objectId: string;
  title: string;
}) {
  // The player wants a LearningObject for its grounded chat; in the student
  // preview the tutorial itself is that object.
  const host = { id: objectId, title, type: 'tutorial-v3', blocks: [] } as unknown as LearningObject;
  return (
    <WarmFrame title={title ? `Watch: ${title}` : 'Interactive video'}>
      <VideoScriptPlayer content={content} object={host} />
    </WarmFrame>
  );
}

export function WarmBridgeTable({
  content,
  blockId,
  onResolvedChange,
}: {
  content: BridgeTableContent;
  blockId: string;
  onResolvedChange?: (info: {
    keyPrefix: string;
    byIndex: Record<number, QuizResolveStatus>;
    correct: number;
    total: number;
    allDone: boolean;
  }) => void;
}) {
  const kind = String(content?.kind || 'table');
  const heading = kind === 'challenge' ? 'Bridge challenge' : kind === 'bidding' ? 'Opening-bid drill' : 'At the table';
  return (
    <WarmFrame title={heading} note={content?.caption}>
      <BridgeEmbedBlock
        config={readBridgeConfig(content || ({} as BridgeTableContent))}
        readOnly
        onResolvedChange={onResolvedChange}
        resultKeyPrefix={blockId}
      />
    </WarmFrame>
  );
}

/* ── source excerpt ────────────────────────────────────────────── */

export function WarmSourceExcerpt({
  content,
}: {
  content: { sourceTitle?: string; excerpt?: string; page?: number };
}) {
  if (!content?.excerpt) return null;
  return (
    <WarmCard tone="stone" className="p-6">
      <p className="text-xs text-stone-400 font-bold tracking-wide mb-3">FROM THE SOURCE</p>
      <p className="text-stone-700 text-[15px] italic leading-relaxed mb-2">“{content.excerpt}”</p>
      <p className="text-xs text-stone-400 font-semibold">
        {[content.sourceTitle, content.page ? `p. ${content.page}` : ''].filter(Boolean).join(' · ')}
      </p>
    </WarmCard>
  );
}
