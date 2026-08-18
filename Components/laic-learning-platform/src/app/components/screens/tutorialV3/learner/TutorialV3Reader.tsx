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
 * Two pages sit outside the block stream: the lesson overview on the front and
 * the lesson complete on the back. Both are `lesson-overview` /
 * `lesson-complete` blocks when the author wrote them — lifted out of the
 * stream so the overview gates the lesson rather than scrolling past as its
 * first paragraph — and are derived from the draft when they did not.
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
  LearningObject,
  LessonCompleteContent,
  LessonOverviewContent,
  MatchingContent,
  OpeningQuestionContent,
  QuestionContent,
  QuickDecisionsContent,
  QuizContent,
  ReferenceTableContent,
  ReflectionContent,
  SummaryContent,
  VideoEmbedContent,
  VideoScriptContent,
} from '../../../../../lib/types';
import type { TutorialV3Draft } from '../../../../../lib/tutorialV3/types';
import { LearningBlocksPreview, type BlockOverrides } from '../../LearnerReader';
import { expandTutorialBlocks, parseEmbedSlotHeading } from '../../../../../lib/libraryEmbed';
import { countBlocksWords } from '../../../../../lib/tutorialPages.js';
import { enrichQuizQuestionsWithSources } from '../../../../../lib/mcqSources.js';
import { LearnerProgressProvider, useLearnerProgress } from './LearnerProgressContext';
import { GripVertical } from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AskAIChat } from '../../AskAIChat';
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
import {
  WarmMatching,
  WarmOpeningQuestion,
  WarmQuickDecisions,
  WarmReferenceTable,
} from './warm/WarmExercises';

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
      /*
        A reserved embed position that never got filled. The generator writes
        ⟦EMBED_SLOT:…⟧ as a placeholder heading and something else is supposed to
        replace it; when that did not happen the marker used to render to the
        learner as a title. A gap is the right failure here, not a token.
      */
      if (parseEmbedSlotHeading(c.heading)) return null;
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

    'opening-question': ({ block }) => (
      <WarmOpeningQuestion content={block.content as OpeningQuestionContent} blockId={block.id} />
    ),

    'reference-table': ({ block }) => (
      <WarmReferenceTable content={block.content as ReferenceTableContent} />
    ),

    'quick-decisions': ({ block }) => (
      <WarmQuickDecisions content={block.content as QuickDecisionsContent} blockId={block.id} />
    ),

    matching: ({ block }) => (
      <WarmMatching content={block.content as MatchingContent} blockId={block.id} />
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

/**
 * Drag-to-rearrange over the student preview.
 *
 * Blocks could only be reordered in the parts list, which shows a label and a
 * page number — an author moving a worked example has to picture the lesson
 * rather than look at it. The frame goes around the block as the learner sees
 * it, and the dashed outline is the whole affordance: nothing about the
 * lesson's own styling changes underneath it.
 */
function ArrangeContext({
  enabled,
  blockIds,
  onReorder,
  children,
}: {
  enabled: boolean;
  blockIds: string[];
  onReorder?: (orderedBlockIds: string[]) => void;
  children: React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (!enabled) return <>{children}</>;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id || !onReorder) return;
        const from = blockIds.indexOf(String(active.id));
        const to = blockIds.indexOf(String(over.id));
        if (from < 0 || to < 0) return;
        onReorder(arrayMove(blockIds, from, to));
      }}
    >
      <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

function ArrangeFrame({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      className="relative rounded-2xl"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        outline: `2px dashed ${isDragging ? SAGE : 'rgba(120,113,108,0.45)'}`,
        outlineOffset: 6,
        opacity: isDragging ? 0.85 : 1,
        zIndex: isDragging ? 5 : undefined,
        background: isDragging ? '#fff' : undefined,
      }}
    >
      <button
        type="button"
        // Sits on the frame's edge so it never covers the block's own content.
        className="absolute -top-3 left-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full shadow-sm cursor-grab active:cursor-grabbing"
        style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.1)', fontSize: 10.5, fontWeight: 700, color: '#78716c' }}
        aria-label="Drag to move this block"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={11} /> Drag
      </button>
      {children}
    </div>
  );
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
  object,
  arrange,
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
  /**
   * The object being read, for Ask Hoot. Hoot answers only from this content,
   * so it needs the whole object rather than the page in front of the learner.
   */
  object?: LearningObject;
  /**
   * Author-only: put a drag frame around each block so the lesson can be
   * rearranged in the view the learner actually sees, rather than only in a
   * list of parts that reads nothing like the finished thing.
   */
  arrange?: { onReorder: (orderedBlockIds: string[]) => void };
}) {
  const { progress, visitSection } = useLearnerProgress();

  /**
   * The two covers are pages of their own, not blocks in the stream. When the
   * author has written them, their content drives the covers and the blocks are
   * lifted out of the stream — otherwise the overview would render twice, once
   * as the cover and once inline on page one, and the start gate would mean
   * nothing.
   */
  const overviewContent = useMemo(
    () => blocks.find((b) => b.type === 'lesson-overview')?.content as LessonOverviewContent | undefined,
    [blocks],
  );
  const completeContent = useMemo(
    () => blocks.find((b) => b.type === 'lesson-complete')?.content as LessonCompleteContent | undefined,
    [blocks],
  );
  const streamBlocks = useMemo(
    () => blocks.filter((b) => b.type !== 'lesson-overview' && b.type !== 'lesson-complete'),
    [blocks],
  );

  // The sidebar has to agree with the pager about where each page begins, and
  // the pager runs on the expanded stream — so this does too.
  const expanded = useMemo(() => expandTutorialBlocks(streamBlocks), [streamBlocks]);
  const contentSections = useMemo(() => buildLearnerSections(draft, expanded), [draft, expanded]);
  const [contentPages, setContentPages] = useState(() => countPages(expanded));
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [askOpen, setAskOpen] = useState(false);

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

  /*
    The reading column scrolls, not the window — so `window.scrollTo` moved
    nothing and a learner who paged forward from halfway down a long page
    landed halfway down the next one. Scroll the column that actually moved.
  */
  const readingRef = React.useRef<HTMLElement | null>(null);
  const goToPage = (next: number) => {
    setPage(Math.max(1, Math.min(total, next)));
    readingRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
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
    /*
      The reader owns its own scrolling. The rail is full height and does not
      move; the reading column scrolls inside it. Letting the page scroll instead
      dragged the rail up and out of view — it was only ever as tall as the
      viewport, so scrolling down left an empty strip where it had been.
    */
    <div
      className="flex overflow-hidden"
      style={{ background: WARM_BG, fontFamily: WARM_FONT, height: '100%', minHeight: 520 }}
    >
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

      <main ref={readingRef} className="flex-1 min-w-0 overflow-y-auto" style={{ height: '100%' }}>
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
                {object && (
                  <button
                    type="button"
                    onClick={() => setAskOpen((v) => !v)}
                    aria-label="Ask Hoot about this lesson"
                    className="flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-full bg-white shadow-sm hover:shadow"
                    style={{ fontSize: 12.5, fontWeight: 650, color: SAGE }}
                  >
                    <img
                      src="/owl-logo.png"
                      alt=""
                      style={{ width: 17, height: 17, borderRadius: '50%', objectFit: 'cover' }}
                    />
                    <span className="hidden sm:inline">Ask Hoot</span>
                  </button>
                )}
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

          {/* The section this page belongs to — named on every page, covers included. */}
          {currentSection && (
            <div className="mb-6">
              <p className="text-sm font-semibold text-stone-500">{currentSection.title}</p>
            </div>
          )}

          {page === 1 && (
            <WarmLessonOverview
              draft={draft}
              duration={duration}
              onStart={() => goToPage(2)}
              content={overviewContent}
            />
          )}

          {page === total && (
            <WarmLessonComplete
              draft={draft}
              sections={contentSections}
              progress={progress}
              pageCount={contentPages}
              onBack={onBack}
              content={completeContent}
            />
          )}

          {/*
            The block stream stays mounted on the cover pages so a half-finished
            quiz is still half-finished when the learner comes back to it.
          */}
          <div style={{ display: onCover ? 'none' : 'block' }} aria-hidden={onCover}>
            <ArrangeContext
              enabled={!!arrange}
              blockIds={streamBlocks.map((b) => b.id)}
              onReorder={arrange?.onReorder}
            >
            <LearningBlocksPreview
              renderBlockFrame={arrange ? (id, node) => <ArrangeFrame key={id} id={id}>{node}</ArrangeFrame> : undefined}
              blocks={streamBlocks}
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
            </ArrangeContext>
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

      {object && <AskAIChat open={askOpen} onClose={() => setAskOpen(false)} obj={object} />}
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
