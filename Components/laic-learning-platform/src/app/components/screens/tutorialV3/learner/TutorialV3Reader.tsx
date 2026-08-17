/**
 * The view a Tutorial V3 gets after generation — the reference export's
 * `TutorialApp`, driven by real draft data.
 *
 * The chrome is fixed: warm ground, a sage section rail down the left that
 * collapses when the reading column wants the width, a header carrying the
 * title, the reading time and a dot pager, the section this page belongs to,
 * the blocks, and a footer that names the page either side of this one.
 *
 * Every block type a student can meet is drawn by a V3 renderer rather than by
 * the shared reader's, so nothing inside the frame is in a different visual
 * language from the frame. The shared reader still owns everything underneath —
 * pagination, cumulative pooling, library-embed expansion, the glossary — and
 * V1 and V2 tutorials are untouched by all of it.
 *
 * Two pages exist here that are not blocks: the lesson overview on the front and
 * the lesson complete on the back. The reference wraps every tutorial in them,
 * and they are assembled from the draft in `warm/WarmLessonPages`.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type {
  AssignmentContent,
  BiddingSequenceContent,
  Block,
  BridgePlayContent,
  BridgeTableContent,
  ConceptCardContent,
  DrillContent,
  FlashcardSetContent,
  ImageContent,
  QuestionContent,
  QuizContent,
  ReflectionContent,
  SummaryContent,
  VideoEmbedContent,
  VideoScriptContent,
} from '../../../../../lib/types';
import type { TutorialV3Draft } from '../../../../../lib/tutorialV3/types';
import { LearningBlocksPreview, type BlockOverrides } from '../../LearnerReader';
import { expandTutorialBlocks } from '../../../../../lib/libraryEmbed';
import { countBlocksWords } from '../../../../../lib/tutorialPages.js';
import { enrichQuizQuestionsWithSources } from '../../../../../lib/mcqSources.js';
import { LearnerProgressProvider, useLearnerProgress } from './LearnerProgressContext';
import { TutorialV3SectionSidebar } from './TutorialV3SectionSidebar';
import { TutorialV3QuizBlock } from './TutorialV3QuizBlock';
import { TutorialV3ConceptCard } from './TutorialV3ConceptCard';
import { TutorialV3FlashcardSet } from './TutorialV3FlashcardSet';
import { TutorialV3BiddingSequence } from './TutorialV3BiddingSequence';
import { buildLearnerSections, pageCount as countPages, type LearnerSection } from './progress';
import { SAGE, WARM_BG, WARM_FONT, readingTime } from './warm/theme';
import {
  WARM_PROSE_CSS,
  WarmAssignment,
  WarmBridgePlay,
  WarmBridgeTable,
  WarmDrill,
  WarmImage,
  WarmReflection,
  WarmRichText,
  WarmSourceExcerpt,
  WarmSummary,
  WarmVideoEmbed,
  WarmVideoScript,
} from './warm/WarmBlocks';
import { WarmLessonComplete, WarmLessonOverview } from './warm/WarmLessonPages';

type SourceUnits = Parameters<typeof LearningBlocksPreview>[0]['sourceUnits'];

/**
 * One renderer per block type. Nothing falls through to the shared reader: a
 * block drawn in the platform's own navy-and-mono idiom inside this frame would
 * read as a different product.
 */
function buildOverrides(
  objectId: string,
  title: string,
  sourceUnits: SourceUnits,
): BlockOverrides {
  /**
   * Grounded quotes normally reach a question through the MCQ cluster, which
   * V3 does not use. Enriching here keeps FROM YOUR SOURCES working.
   */
  const withSources = (content: QuizContent): QuizContent => {
    if (!sourceUnits?.length) return content;
    return {
      ...content,
      questions: enrichQuizQuestionsWithSources(content.questions || [], sourceUnits) as QuestionContent[],
    };
  };

  return {
    'rich-text': ({ block }) => {
      const c = block.content as { text?: string; heading?: string; subheads?: string[] };
      return <WarmRichText text={c.text || ''} heading={c.heading} subheads={c.subheads} />;
    },

    quiz: ({ block, quizProps }) => (
      <TutorialV3QuizBlock
        content={withSources(block.content as QuizContent)}
        blockId={block.id}
        deferPassScore={quizProps?.deferPassScore}
        maxHints={quizProps?.maxHints}
        hintsEnabled={quizProps?.hintsEnabled}
        onResolvedChange={quizProps?.onResolvedChange}
        resultKeyPrefix={block.id}
      />
    ),

    question: ({ block, quizProps }) => (
      <TutorialV3QuizBlock
        content={withSources({
          questions: [block.content as QuestionContent],
          passMark: (block.content as { passMark?: number })?.passMark,
        })}
        blockId={block.id}
        deferPassScore={quizProps?.deferPassScore}
        maxHints={quizProps?.maxHints}
        hintsEnabled={quizProps?.hintsEnabled}
        onResolvedChange={quizProps?.onResolvedChange}
        resultKeyPrefix={block.id}
      />
    ),

    'concept-card': ({ block }) => (
      <TutorialV3ConceptCard content={block.content as ConceptCardContent} blockId={block.id} />
    ),

    'flashcard-set': ({ block }) => (
      <TutorialV3FlashcardSet
        content={block.content as FlashcardSetContent}
        objectId={objectId}
        blockId={block.id}
      />
    ),

    'bidding-sequence': ({ block }) => (
      <TutorialV3BiddingSequence content={block.content as BiddingSequenceContent} blockId={block.id} />
    ),

    'bridge-play': ({ block }) => <WarmBridgePlay content={block.content as BridgePlayContent} />,

    'bridge-table': ({ block, quizProps }) => (
      <WarmBridgeTable
        content={block.content as BridgeTableContent}
        blockId={block.id}
        onResolvedChange={quizProps?.onResolvedChange}
      />
    ),

    summary: ({ block }) => <WarmSummary content={block.content as SummaryContent} />,
    reflection: ({ block }) => <WarmReflection content={block.content as ReflectionContent} blockId={block.id} />,
    assignment: ({ block }) => <WarmAssignment content={block.content as AssignmentContent} />,
    drill: ({ block }) => <WarmDrill content={block.content as DrillContent} />,
    image: ({ block }) => <WarmImage content={block.content as ImageContent} />,
    'video-embed': ({ block }) => <WarmVideoEmbed content={block.content as VideoEmbedContent} />,
    'video-script': ({ block }) => (
      <WarmVideoScript content={block.content as VideoScriptContent} objectId={objectId} title={title} />
    ),
    'source-excerpt': ({ block }) => (
      <WarmSourceExcerpt content={block.content as { sourceTitle?: string; excerpt?: string; page?: number }} />
    ),
  };
}

/** A sidebar row that is a cover page rather than a section of the lesson. */
function coverRow(id: string, sectionTitle: string, page: number, index: number): LearnerSection {
  return {
    id,
    title: sectionTitle,
    required: false,
    index,
    pages: [page],
    interactiveBlockIds: [],
    blockIds: [],
  };
}

function ReaderInner({
  draft,
  blocks,
  objectId,
  cumulativePassMark,
  passRequired,
  maxHints,
  hintsEnabled,
  glossary,
  sourceUnits,
  onBack,
  learnerName,
}: {
  draft: TutorialV3Draft;
  blocks: Block[];
  objectId: string;
  cumulativePassMark?: number;
  passRequired?: boolean;
  maxHints?: number;
  hintsEnabled?: boolean;
  glossary?: Parameters<typeof LearningBlocksPreview>[0]['glossary'];
  sourceUnits?: SourceUnits;
  onBack?: () => void;
  learnerName?: string;
}) {
  const { progress, visitSection } = useLearnerProgress();

  // The sidebar has to agree with the pager about where each page begins, and
  // the pager runs on the expanded stream — so this does too.
  const expanded = useMemo(() => expandTutorialBlocks(blocks), [blocks]);
  const contentSections = useMemo(() => buildLearnerSections(draft, expanded), [draft, expanded]);
  const [contentPages, setContentPages] = useState(() => countPages(expanded));
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  /**
   * Page numbering the learner sees: 1 is the overview, the content pages
   * follow, and the last is the completion page. The block stream never knows
   * about either cover — it is still paged 0-based underneath.
   */
  const total = contentPages + 2;
  const [page, setPage] = useState(1);
  const contentIdx = Math.max(0, Math.min(contentPages - 1, page - 2));
  const onCover = page === 1 || page === total;

  const title = draft.title || 'Untitled tutorial';
  const duration = useMemo(() => readingTime(countBlocksWords(expanded)), [expanded]);

  /** Sidebar rows: the two covers wrap the sections, whose pages shift by one. */
  const navSections = useMemo<LearnerSection[]>(() => [
    coverRow('__overview__', 'Lesson overview', 1, 0),
    ...contentSections.map((s) => ({ ...s, pages: s.pages.map((p) => p + 1) })),
    coverRow('__complete__', 'Lesson complete', total, contentSections.length + 1),
  ], [contentSections, total]);

  const currentSection = useMemo(
    () => navSections.find((s) => s.pages.includes(page)) || null,
    [navSections, page],
  );

  // Reading a page is what "visited" means. A section with no questions in it
  // has no other way to ever count as started.
  useEffect(() => {
    if (currentSection) visitSection(currentSection.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSection?.id]);

  // A different tutorial resets the page, not the learner's progress.
  useEffect(() => {
    setPage(1);
  }, [objectId]);

  // Editing content can shorten the tutorial under the learner's feet.
  useEffect(() => {
    setPage((p) => Math.min(p, total));
  }, [total]);

  const overrides = useMemo(
    () => buildOverrides(objectId, title, sourceUnits),
    [objectId, title, sourceUnits],
  );

  const goToPage = (next: number) => {
    setPage(Math.max(1, Math.min(total, next)));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** What the footer calls the page either side of this one. */
  const labelFor = (p: number): string => {
    if (p <= 1) return 'Lesson overview';
    if (p >= total) return 'Lesson complete';
    const sec = navSections.find((s) => s.id !== '__overview__' && s.id !== '__complete__' && s.pages.includes(p));
    return sec?.title || `Page ${p - 1}`;
  };

  return (
    <div className="flex min-h-screen" style={{ background: WARM_BG, fontFamily: WARM_FONT }}>
      <style>{WARM_PROSE_CSS}</style>

      <TutorialV3SectionSidebar
        title={title}
        sections={navSections}
        progress={progress}
        activePage={page}
        onNavigate={(p, sectionId) => {
          visitSection(sectionId);
          goToPage(p);
        }}
        onBack={onBack}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        learnerName={learnerName}
      />

      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Expand sidebar"
          aria-label="Expand sidebar"
          className="hidden lg:flex fixed left-0 top-1/2 -translate-y-1/2 z-40 items-center justify-center w-6 h-12 rounded-r-xl text-white text-xs shadow-md transition-colors"
          style={{ background: SAGE }}
        >
          ›
        </button>
      )}

      <main className="flex-1 min-w-0">
        <div className="max-w-2xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setMenuOpen(true)}
                    aria-label="Open menu"
                    className="lg:hidden mr-1 w-9 h-9 flex items-center justify-center rounded-xl bg-white shadow-sm text-stone-500 hover:shadow"
                  >
                    <span className="text-base leading-none">☰</span>
                  </button>
                  <span className="text-sm text-stone-400 font-medium">{duration}</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 leading-tight">{title}</h1>
              </div>
              <div className="flex items-center gap-2 shrink-0 pt-1">
                <button
                  type="button"
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  aria-label="Previous page"
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm text-stone-500 hover:shadow disabled:opacity-30 font-medium"
                >
                  ←
                </button>
                <div className="hidden sm:flex gap-1.5">
                  {Array.from({ length: total }).map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => goToPage(i + 1)}
                      aria-label={`Go to page ${i + 1}`}
                      aria-current={i + 1 === page ? 'page' : undefined}
                      className={`w-2 h-2 rounded-full transition-colors ${i + 1 === page ? '' : 'bg-stone-200'}`}
                      style={i + 1 === page ? { background: SAGE } : undefined}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= total}
                  aria-label="Next page"
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm text-stone-500 hover:shadow disabled:opacity-30 font-medium"
                >
                  →
                </button>
              </div>
            </div>
          </div>

          {/* The section this page belongs to. */}
          {currentSection && !onCover && (
            <div className="mb-6 flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-stone-500">{currentSection.title}</p>
              {currentSection.required && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">Required</span>
              )}
            </div>
          )}

          {page === 1 && (
            <WarmLessonOverview draft={draft} duration={duration} onStart={() => goToPage(2)} />
          )}

          {page === total && (
            <WarmLessonComplete
              draft={draft}
              sections={contentSections}
              progress={progress}
              pageCount={contentPages}
              onBack={onBack}
            />
          )}

          {/*
            The block stream stays mounted on the cover pages so a half-finished
            quiz is still half-finished when the learner comes back to it.
          */}
          <div style={{ display: onCover ? 'none' : 'block' }} aria-hidden={onCover}>
            <LearningBlocksPreview
              blocks={blocks}
              objectId={objectId}
              cumulativePassMark={cumulativePassMark}
              passRequired={passRequired}
              maxHints={maxHints}
              hintsEnabled={hintsEnabled}
              glossary={glossary}
              sourceUnits={sourceUnits}
              paginate
              blockOverrides={overrides}
              clusterMcqs={false}
              pageIndex={contentIdx}
              onPageChange={(i) => setPage(i + 2)}
              onPageCountChange={setContentPages}
              hidePager
            />
          </div>

          {/* Footer: the page either side of this one, by name. */}
          <div className="flex justify-between items-center gap-3 pt-6 border-t border-stone-200 mt-8">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="text-sm text-stone-500 hover:text-stone-800 disabled:opacity-30 font-bold text-left min-w-0 truncate"
            >
              ← {page > 1 ? labelFor(page - 1) : 'Start'}
            </button>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= total}
              className="text-sm font-black hover:opacity-80 disabled:opacity-30 px-5 py-2.5 rounded-full text-white transition-opacity shrink-0"
              style={{ background: SAGE }}
            >
              {page < total ? labelFor(page + 1) : 'Finish'} →
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export function TutorialV3Reader(props: Parameters<typeof ReaderInner>[0]) {
  return (
    <LearnerProgressProvider objectId={props.objectId}>
      <ReaderInner {...props} />
    </LearnerProgressProvider>
  );
}
