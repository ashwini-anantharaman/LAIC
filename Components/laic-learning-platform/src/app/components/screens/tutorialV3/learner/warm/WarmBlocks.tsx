/**
 * Every block type a Tutorial V3 student can meet that is not one of the four
 * with a renderer of its own, drawn in the reference export's visual language.
 *
 * The reference tutorial only contains prose, concept cards, quizzes,
 * flashcards, tables, auctions and a card-play problem. The platform's block
 * vocabulary is wider than that, so the types the reference has no drawing for
 * — summary, reflection, assignment, image, video, drill, live bridge table —
 * are built from the same parts it does use: a hairline-bordered card over a
 * tinted ground, stone prose, amber for the author's own asides, sage for the
 * one action that moves the learner forward.
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
      {heading && <h2 className="text-2xl text-stone-900 mb-3 leading-tight">{heading}</h2>}
      {subheads && subheads.length > 0 && (
        <ul className="mb-4 pl-5 text-stone-500 text-sm list-disc space-y-1">
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
.tv3-prose h1 { font-size: 1.75rem; color: #1c1917; margin: 24px 0 10px; line-height: 1.2; }
.tv3-prose h2 { font-size: 1.5rem; color: #1c1917; margin: 22px 0 10px; line-height: 1.25; }
.tv3-prose h3 { font-size: 1.125rem; font-weight: 700; color: #1c1917; margin: 18px 0 8px; }
.tv3-prose p { margin: 0 0 12px; }
.tv3-prose ul { margin: 0 0 12px; padding-left: 1.25rem; list-style: disc; }
.tv3-prose ol { margin: 0 0 12px; padding-left: 1.25rem; list-style: decimal; }
.tv3-prose li { margin: 0 0 4px; }
.tv3-prose blockquote {
  margin: 0 0 14px; padding: 12px 16px;
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; color: #78716c;
}
.tv3-prose code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em; background: #f5f5f4; padding: 0.1em 0.4em; border-radius: 4px;
}
.tv3-prose table {
  width: 100%; border-collapse: collapse; margin: 0 0 14px; font-size: 0.9rem;
  border: 1px solid #e7e5e4; border-radius: 8px; overflow: hidden;
}
.tv3-prose th { text-align: left; padding: 8px 16px; background: #fafaf9; color: #78716c; font-weight: 700; font-size: 0.75rem; }
.tv3-prose td { padding: 12px 16px; border-top: 1px solid #f5f5f4; color: #57534e; }
.tv3-prose a { color: #4d7c5a; text-decoration: underline; }
.tv3-prose strong { font-weight: 700; color: #1c1917; }
.tv3-prose em { font-style: italic; }
.tv3-prose img { max-width: 100%; border-radius: 12px; }
`;

/* ── summary ───────────────────────────────────────────────────── */

export function WarmSummary({ content }: { content: SummaryContent }) {
  const points = content.keyPoints || [];
  return (
    <div>
      <h2 className="text-2xl text-stone-900 mb-2">{content.topic || 'Summary'}</h2>
      {content.tldr && <p className="text-stone-600 text-[15px] leading-relaxed mb-5">{content.tldr}</p>}

      {points.length > 0 && (
        <WarmCard tone="stone" className="p-6 mb-5">
          <h3 className="text-xl text-stone-900 mb-5">Key points</h3>
          <ol className="space-y-4">
            {points.map((p, i) => (
              <li key={i} className="flex items-start gap-4">
                <span
                  className="flex items-center justify-center w-7 h-7 rounded-full text-white text-sm font-black shrink-0 mt-0.5"
                  style={{ background: SAGE }}
                >
                  {i + 1}
                </span>
                <span className="text-stone-700 text-[15px] leading-snug pt-0.5">{p}</span>
              </li>
            ))}
          </ol>
        </WarmCard>
      )}

      {content.body && (
        <WarmCard className="p-6">
          <p className="text-stone-700 text-[15px] leading-relaxed whitespace-pre-wrap">{content.body}</p>
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
      <h2 className="text-2xl text-stone-900 mb-2">Reflection</h2>
      {content.goal && <p className="text-stone-600 text-[15px] leading-relaxed mb-5">{content.goal}</p>}

      <div className="space-y-3">
        {prompts.map((p, i) => {
          const key = p.id || String(i);
          return (
            <WarmCard key={key} className="p-5">
              <p className="text-stone-900 text-[15px] leading-relaxed mb-3">{p.prompt}</p>
              {(p.starters || []).length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {(p.starters || []).map((s, si) => (
                    <button
                      key={si}
                      type="button"
                      onClick={() => setAnswers((prev) => ({
                        ...prev,
                        [key]: `${prev[key] || ''}${prev[key] ? ' ' : ''}${s}`,
                      }))}
                      className="text-xs font-mono px-2.5 py-1 rounded border border-stone-200 text-stone-500 hover:border-stone-400"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                rows={4}
                value={answers[key] || ''}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder="Write your response here…"
                className="w-full text-sm text-stone-800 border border-stone-200 rounded p-3 resize-none focus:outline-none focus:border-amber-400"
                data-block={blockId}
              />
            </WarmCard>
          );
        })}
      </div>

      <p className="font-mono text-[10px] text-stone-400 tracking-wider mt-3 px-1">
        {shared ? 'SHARED WITH YOUR GROUP' : 'PRIVATE TO YOU'}
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
      <h2 className="text-2xl text-stone-900 mb-2">{content.taskType || 'Assignment'}</h2>
      {content.objective && <p className="text-stone-600 text-[15px] leading-relaxed mb-5">{content.objective}</p>}

      {content.prompt && (
        <WarmCard tone="amber" className="p-6 mb-5">
          <h3 className="text-xl text-stone-900 mb-3">The task</h3>
          <p className="text-stone-700 text-[15px] leading-relaxed whitespace-pre-wrap">{content.prompt}</p>
        </WarmCard>
      )}

      {requirements.length > 0 && (
        <WarmCard className="p-6 mb-5">
          <h3 className="text-xl text-stone-900 mb-4">What to hand in</h3>
          <ul className="space-y-3">
            {requirements.map((r, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] shrink-0 mt-0.5">
                  ✓
                </span>
                <span className="text-stone-700 text-[15px]">{r}</span>
              </li>
            ))}
          </ul>
          {(content.deliverable || content.expectedLength || content.requireCitations) && (
            <p className="font-mono text-[10px] text-stone-400 tracking-wider mt-4">
              {[
                content.deliverable,
                content.expectedLength,
                content.requireCitations ? 'citations required' : '',
              ].filter(Boolean).join(' · ').toUpperCase()}
            </p>
          )}
        </WarmCard>
      )}

      {rubric.length > 0 && (
        <div className="rounded-lg border border-stone-200 bg-white overflow-x-auto">
          <div className="min-w-[320px]">
            <div className="grid grid-cols-2 bg-stone-50 border-b border-stone-200">
              <div className="px-4 py-2 text-xs font-bold text-stone-500">CRITERION</div>
              <div className="px-4 py-2 text-xs font-bold text-stone-500">WHAT GOOD LOOKS LIKE</div>
            </div>
            {rubric.map((r, i) => (
              <div key={i} className="grid grid-cols-2 border-b border-stone-100 last:border-0">
                <div className="px-4 py-3 font-medium text-stone-800 text-sm">{r.criterion}</div>
                <div className="px-4 py-3 text-sm text-stone-600">
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
    <figure className="rounded-lg border border-stone-200 bg-white overflow-hidden">
      <img src={content.url} alt={content.alt || content.caption || ''} className="w-full block" />
      {content.caption && (
        <figcaption className="px-4 py-3 bg-stone-50 border-t border-stone-100 text-sm text-stone-600">
          {content.caption}
        </figcaption>
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
    <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
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

/** One hand in the compass. Cards arrive as a single string per seat. */
function CompassHand({ label, cards, tone = 'stone' }: { label: string; cards: string; tone?: 'stone' | 'amber' }) {
  const rows = String(cards || '').split(/\s{2,}|\n|,|\s(?=[♠♥♦♣])/).map((s) => s.trim()).filter(Boolean);
  return (
    <div className={`rounded p-3 border ${tone === 'amber' ? 'bg-amber-50 border-amber-200' : 'bg-stone-50 border-stone-200'}`}>
      <p className={`text-[10px] mb-1 ${tone === 'amber' ? 'text-amber-700' : 'text-stone-400'}`}>{label}</p>
      {rows.map((r, i) => (
        <p key={i} style={{ color: suitColor(r.charAt(0)) }}>{r}</p>
      ))}
    </div>
  );
}

export function WarmBridgePlay({ content }: { content: BridgePlayContent }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const options = content.south || [];
  const right = selected === content.correctAnswer;

  return (
    <div>
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span className="text-xs font-bold text-stone-500 bg-stone-100 px-2 py-0.5 rounded shrink-0">BRIDGE PLAY</span>
        <h2 className="text-xl text-stone-900">{content.title || 'Card-Play Problem'}</h2>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white overflow-hidden mb-4">
        <div className="grid grid-cols-3 gap-2 text-center text-[13px] font-semibold p-3 sm:p-4">
          <div />
          <CompassHand label="NORTH (dummy)" cards={content.north} />
          <div />
          <CompassHand label="WEST" cards={content.west} />
          <div className="flex items-center justify-center text-stone-300 text-2xl">⟳</div>
          <CompassHand label="EAST" cards={content.east} />
          <div />
          <CompassHand label="SOUTH (you)" cards={options.join('  ')} tone="amber" />
          <div />
        </div>
        <div className="px-4 py-3 bg-stone-50 border-t border-stone-100 text-sm text-stone-700">
          <span className="text-xs font-bold text-stone-400 mr-2">TRUMP</span>{content.trump || '—'}
          <span className="mx-3 text-stone-300">|</span>
          <span className="text-xs font-bold text-stone-400 mr-2">QUESTION</span>
          {content.description || 'Which card do you play?'}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        {options.map((card) => {
          let cls = 'rounded border px-3 py-2.5 text-sm text-left font-mono transition-all ';
          if (!submitted) {
            cls += selected === card
              ? 'border-amber-500 bg-amber-50 text-amber-900 font-medium cursor-pointer'
              : 'border-stone-200 bg-white hover:border-stone-400 text-stone-700 cursor-pointer';
          } else if (card === content.correctAnswer) cls += 'border-green-500 bg-green-100 text-green-900 font-medium cursor-default';
          else if (selected === card) cls += 'border-red-400 bg-red-100 text-red-800 cursor-default';
          else cls += 'border-stone-100 text-stone-400 cursor-default';
          return (
            <button key={card} type="button" className={cls} disabled={submitted} onClick={() => setSelected(card)}>
              {card}
            </button>
          );
        })}
      </div>

      {submitted ? (
        <div
          className={`text-sm rounded px-3 py-2 ${
            right ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          <span className="font-medium">{right ? '✓ Correct. ' : '✗ Not quite. '}</span>{content.explanation}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSubmitted(true)}
          disabled={!selected}
          className="mt-2 text-sm font-bold px-6 py-2.5 rounded-full text-white disabled:opacity-30 transition-opacity"
          style={{ background: SAGE }}
        >
          Submit answer
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
 * bordered card every other block on the page sits inside, under a heading in
 * the reference's own type.
 */
function WarmFrame({ chip, title, note, children }: {
  chip: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span className="text-xs font-bold text-stone-500 bg-stone-100 px-2 py-0.5 rounded shrink-0">{chip}</span>
        <h2 className="text-xl text-stone-900">{title}</h2>
      </div>
      {note && <p className="text-stone-600 text-[15px] leading-relaxed mb-4">{note}</p>}
      <div className="rounded-lg border border-stone-200 bg-white p-4 sm:p-5">{children}</div>
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
    <WarmFrame chip="DRILL" title={content?.skill || 'Practice drill'} note={content?.format ? `${content.format} practice.` : undefined}>
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
    <WarmFrame chip="INTERACTIVE VIDEO" title="Watch and answer">
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
  const title = kind === 'challenge' ? 'Bridge challenge' : kind === 'bidding' ? 'Opening-bid drill' : 'At the table';
  return (
    <WarmFrame chip="BRIDGE TABLE" title={title} note={content?.caption}>
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
    <div className="rounded-lg border border-stone-200 bg-stone-50 overflow-hidden">
      <div className="px-4 py-2 border-b border-stone-200">
        <span className="font-mono text-[10px] tracking-widest text-stone-500">FROM THE SOURCE</span>
      </div>
      <div className="px-4 py-3">
        <p className="text-sm text-stone-700 italic leading-relaxed mb-1">"{content.excerpt}"</p>
        <p className="font-mono text-[10px] text-stone-400">
          {[content.sourceTitle, content.page ? `p. ${content.page}` : ''].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  );
}
