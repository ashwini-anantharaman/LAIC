/**
 * The left navigation for a generated Tutorial V3 — the reference export's
 * `TutorialSidebar`, row for row.
 *
 * Sage ground, white accents, a progress meter over the section list, the
 * learner's name at the foot, a sticky desktop rail that collapses to nothing
 * and a drawer on narrow screens.
 *
 * The dots mean the learner's own progress, not the author's: `V3Section.done`
 * says the author finished writing a section, which is a different claim
 * entirely. `sectionStatus` derives these from work actually resolved.
 */

import React from 'react';
import {
  overallPercent,
  sectionStatus,
  type LearnerProgressState,
  type LearnerSection,
  type LearnerSectionStatus,
} from './progress';
import { SAGE } from './warm/theme';

export { SAGE };

function StatusDot({ status }: { status: LearnerSectionStatus }) {
  if (status === 'done') {
    return (
      <span
        className="flex items-center justify-center w-5 h-5 rounded-full bg-white text-[10px] shrink-0 font-bold"
        style={{ color: SAGE }}
        aria-hidden
      >
        ✓
      </span>
    );
  }
  if (status === 'in_progress') {
    return (
      <span className="flex items-center justify-center w-5 h-5 rounded-full border-2 border-white/50 shrink-0" aria-hidden>
        <span className="w-2 h-2 rounded-full bg-white" />
      </span>
    );
  }
  return <span className="flex items-center justify-center w-5 h-5 rounded-full border-2 border-white/25 shrink-0" aria-hidden />;
}

const STATUS_LABEL: Record<LearnerSectionStatus, string> = {
  done: 'finished',
  in_progress: 'in progress',
  not_started: 'not started',
};

/** The panel body, shared by the sticky desktop rail and the mobile drawer. */
function Panel({
  title,
  sections,
  progress,
  activePage,
  onPick,
  onBack,
  onCollapse,
  learnerName,
}: {
  title: string;
  sections: LearnerSection[];
  progress: LearnerProgressState;
  activePage: number;
  onPick: (section: LearnerSection) => void;
  onBack?: () => void;
  onCollapse?: () => void;
  learnerName?: string;
}) {
  const pct = overallPercent(sections, progress);
  const initials = (learnerName || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  return (
    <div className="w-64 flex flex-col h-full">
      <div className="px-5 pt-5 pb-4 border-b border-white/15 flex-shrink-0">
        <div className="flex items-start justify-between mb-4">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm font-semibold transition-colors"
            >
              ← All tutorials
            </button>
          )}
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              className="w-6 h-6 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white text-xs transition-colors shrink-0 ml-auto"
            >
              ‹
            </button>
          )}
        </div>
        <h1 className="text-base font-bold text-white leading-snug">{title || 'Untitled tutorial'}</h1>
        <div className="mt-3">
          <div className="flex justify-between mb-1.5">
            <span className="text-xs text-white/60 font-medium">Progress</span>
            <span className="text-xs text-white font-bold">{pct}%</span>
          </div>
          <div
            className="h-2 rounded-full bg-white/20"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Tutorial progress"
          >
            <div className="h-2 rounded-full bg-white transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <nav className="flex-1 py-2 overflow-y-auto">
        {sections.length === 0 && (
          <p className="text-white/55 text-xs leading-relaxed px-5 py-3">
            No sections yet — this tutorial&rsquo;s content sits outside the section spine.
          </p>
        )}
        {sections.map((s) => {
          const status = sectionStatus(s, progress);
          const active = s.pages.includes(activePage);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s)}
              aria-current={active ? 'true' : undefined}
              className={`w-full text-left mx-2 my-0.5 px-3 py-2.5 rounded-xl flex items-center gap-3 transition-colors ${
                active ? 'bg-white/20' : 'hover:bg-white/10'
              }`}
              style={{ width: 'calc(100% - 16px)' }}
            >
              <StatusDot status={status} />
              <p className={`text-sm font-semibold leading-tight flex-1 min-w-0 ${active ? 'text-white' : 'text-white/75'}`}>
                {s.title}
              </p>
              <span className="sr-only">
                {STATUS_LABEL[status]}{s.required ? ', required' : ''}
              </span>
            </button>
          );
        })}
      </nav>

      {learnerName && (
        <div className="px-5 py-4 border-t border-white/15 flex items-center gap-3 flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-white/25 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {initials || '·'}
          </div>
          <p className="text-white/90 text-sm font-bold truncate">{learnerName}</p>
        </div>
      )}
    </div>
  );
}

export function TutorialV3SectionSidebar({
  title,
  sections,
  progress,
  activePage,
  onNavigate,
  onBack,
  open = false,
  onClose,
  collapsed = false,
  onToggleCollapse,
  learnerName,
}: {
  title: string;
  sections: LearnerSection[];
  progress: LearnerProgressState;
  /** 1-based learner page currently on screen. */
  activePage: number;
  onNavigate: (page: number, sectionId: string) => void;
  onBack?: () => void;
  /** Drawer state on narrow screens. */
  open?: boolean;
  onClose?: () => void;
  /** Desktop rail collapsed to zero width. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  learnerName?: string;
}) {
  const pick = (section: LearnerSection) => {
    onNavigate(section.pages[0] ?? 1, section.id);
    onClose?.();
  };

  const body = (withCollapse: boolean) => (
    <Panel
      title={title}
      sections={sections}
      progress={progress}
      activePage={activePage}
      onPick={pick}
      onBack={onBack}
      onCollapse={withCollapse ? onToggleCollapse : undefined}
      learnerName={learnerName}
    />
  );

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={onClose} role="presentation" />}

      {/* Desktop: sticky rail that collapses to nothing. */}
      <aside
        aria-label="Tutorial sections"
        /* h-full, not h-screen: the rail fills the reader, which owns the scroll. */
        /*
          No z-index: the rail is a column in the layout, not an overlay. It
          carried z-30 from when it was sticky, which let it paint over the
          authoring header above the student preview.
        */
        className={`hidden lg:flex flex-col shrink-0 h-full overflow-hidden transition-[width] duration-300 ${
          collapsed ? 'w-0' : 'w-64'
        }`}
        style={{ background: SAGE }}
      >
        {body(true)}
      </aside>

      {/* Mobile: drawer over the page. */}
      <aside
        aria-label="Tutorial sections"
        className={`lg:hidden flex flex-col w-64 shrink-0 fixed top-0 left-0 h-full z-30 transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: SAGE }}
      >
        {body(false)}
      </aside>
    </>
  );
}
