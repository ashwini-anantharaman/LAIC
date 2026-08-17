/**
 * The view a Tutorial V3 gets after generation.
 *
 * Two things the reader has never had, on one screen: a section sidebar down
 * the left, and — inside the block stream — the V3 replacements for the four
 * blocks whose renderers existed but were missing named features.
 *
 * Everything else still comes from the shared reader. This is chrome plus four
 * per-type overrides, not a second reader: pagination, cumulative pooling, the
 * pass banner, the glossary and every other block type stay exactly where they
 * are, so V1 and V2 tutorials are untouched by all of it.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { Block, BiddingSequenceContent, ConceptCardContent, FlashcardSetContent, QuizContent } from '../../../../../lib/types';
import type { TutorialV3Draft } from '../../../../../lib/tutorialV3/types';
import { LearningBlocksPreview, type BlockOverrides } from '../../LearnerReader';
import { expandTutorialBlocks } from '../../../../../lib/libraryEmbed';
import { LearnerProgressProvider, useLearnerProgress } from './LearnerProgressContext';
import { TutorialV3SectionSidebar } from './TutorialV3SectionSidebar';
import { TutorialV3QuizBlock } from './TutorialV3QuizBlock';
import { TutorialV3ConceptCard } from './TutorialV3ConceptCard';
import { TutorialV3FlashcardSet } from './TutorialV3FlashcardSet';
import { TutorialV3BiddingSequence } from './TutorialV3BiddingSequence';
import { buildLearnerSections, pageCount as countPages, sectionForPage } from './progress';

/** The four blocks the atlas marks "extend" — every other type falls through. */
function buildOverrides(objectId: string): BlockOverrides {
  return {
    quiz: ({ block, quizProps }) => (
      <TutorialV3QuizBlock
        content={block.content as QuizContent}
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
  sourceUnits?: Parameters<typeof LearningBlocksPreview>[0]['sourceUnits'];
  onBack?: () => void;
  learnerName?: string;
}) {
  const { progress, visitSection } = useLearnerProgress();

  // The sidebar has to agree with the pager about where each page begins, and
  // the pager runs on the expanded stream — so this does too.
  const expanded = useMemo(() => expandTutorialBlocks(blocks), [blocks]);
  const sections = useMemo(() => buildLearnerSections(draft, expanded), [draft, expanded]);
  const [pageIdx, setPageIdx] = useState(0);
  const [pageTotal, setPageTotal] = useState(() => countPages(expanded));
  const [menuOpen, setMenuOpen] = useState(false);

  const page = pageIdx + 1;
  const currentSection = sectionForPage(sections, page);

  // Reading a page is what "visited" means. A section with no questions in it
  // has no other way to ever count as started.
  useEffect(() => {
    if (currentSection) visitSection(currentSection.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSection?.id]);

  // A different tutorial resets the page, not the learner's progress.
  useEffect(() => {
    setPageIdx(0);
  }, [objectId]);

  const overrides = useMemo(() => buildOverrides(objectId), [objectId]);

  const goToPage = (next: number) => {
    setPageIdx(Math.max(0, Math.min(pageTotal - 1, next)));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex" style={{ minHeight: 480 }}>
      <TutorialV3SectionSidebar
        title={draft.title || 'Untitled tutorial'}
        sections={sections}
        progress={progress}
        activePage={page}
        onNavigate={(p, sectionId) => {
          visitSection(sectionId);
          goToPage(p - 1);
        }}
        onBack={onBack}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        learnerName={learnerName}
      />

      <div className="flex-1 min-w-0" style={{ padding: '20px 20px 28px' }}>
        {/* Header: title, page position, dot pager, and the section band naming
            the section this page belongs to. */}
        <div style={{ paddingBottom: 16, borderBottom: '1px solid rgba(0,0,0,0.08)', marginBottom: 20 }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 6 }}>
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  className="lg:hidden flex items-center justify-center rounded"
                  style={{ width: 30, height: 30, border: '1px solid rgba(0,0,0,0.12)', color: '#6B7280' }}
                  aria-label="Open section list"
                >
                  ☰
                </button>
                <span
                  className="px-2 py-0.5 rounded"
                  style={{ fontSize: 10, letterSpacing: '0.14em', color: '#B45309', background: 'rgba(217,119,6,0.09)', border: '1px solid rgba(217,119,6,0.28)', fontWeight: 700 }}
                >
                  TUTORIAL
                </span>
                {draft.structure?.pass && (
                  <span style={{ fontSize: 11, color: '#9AA3AF' }}>pass {draft.structure.pass}</span>
                )}
              </div>
              <h1 style={{ fontSize: 25, fontWeight: 700, color: '#0B1220', lineHeight: 1.15, letterSpacing: '-0.01em' }}>
                {draft.title || 'Untitled tutorial'}
              </h1>
              <p style={{ fontSize: 11.5, color: '#9AA3AF', marginTop: 5 }}>
                tutorial-v3 · page {page} of {pageTotal}
              </p>
            </div>

            {pageTotal > 1 && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={pageIdx <= 0}
                  onClick={() => goToPage(pageIdx - 1)}
                  className="flex items-center justify-center rounded"
                  style={{ width: 29, height: 29, border: '1px solid rgba(0,0,0,0.12)', color: '#6B7280', background: '#fff', opacity: pageIdx <= 0 ? 0.35 : 1 }}
                  aria-label="Previous page"
                >
                  ←
                </button>
                <div className="hidden sm:flex gap-1">
                  {Array.from({ length: pageTotal }).map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => goToPage(i)}
                      aria-label={`Go to page ${i + 1}`}
                      aria-current={i === pageIdx ? 'page' : undefined}
                      style={{ width: 6, height: 6, borderRadius: 99, background: i === pageIdx ? '#d97706' : 'rgba(0,0,0,0.12)' }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  disabled={pageIdx >= pageTotal - 1}
                  onClick={() => goToPage(pageIdx + 1)}
                  className="flex items-center justify-center rounded"
                  style={{ width: 29, height: 29, border: '1px solid rgba(0,0,0,0.12)', color: '#6B7280', background: '#fff', opacity: pageIdx >= pageTotal - 1 ? 0.35 : 1 }}
                  aria-label="Next page"
                >
                  →
                </button>
              </div>
            )}
          </div>

          {currentSection && (
            <div className="flex items-center gap-2.5 flex-wrap" style={{ marginTop: 16 }}>
              <span style={{ fontSize: 10, letterSpacing: '0.13em', color: '#9AA3AF', fontWeight: 700 }}>SECTION</span>
              <span style={{ fontSize: 15, color: '#374151', fontWeight: 650 }}>{currentSection.title}</span>
              {currentSection.required && (
                <span
                  className="px-1.5 py-0.5 rounded"
                  style={{ fontSize: 9, letterSpacing: '0.13em', color: '#B45309', background: 'rgba(217,119,6,0.09)', border: '1px solid rgba(217,119,6,0.28)', fontWeight: 700 }}
                >
                  REQUIRED
                </span>
              )}
            </div>
          )}
        </div>

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
          pageIndex={pageIdx}
          onPageChange={setPageIdx}
          onPageCountChange={setPageTotal}
          hidePager
        />
      </div>
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
