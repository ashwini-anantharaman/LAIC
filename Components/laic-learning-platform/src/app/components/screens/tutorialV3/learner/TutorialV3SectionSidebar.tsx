/**
 * The left navigation for a generated Tutorial V3 — the piece the reader has
 * never had. One row per section, each carrying the learner's own status, over
 * a progress meter computed from work actually finished.
 */

import React from 'react';
import {
  overallPercent,
  sectionStatus,
  type LearnerProgressState,
  type LearnerSection,
  type LearnerSectionStatus,
} from './progress';

const NAVY = '#0e1c35';
const AMBER = '#d97706';
const AMBER_LIGHT = '#fbbf24';

function StatusDot({ status }: { status: LearnerSectionStatus }) {
  if (status === 'done') {
    return (
      <span
        className="flex items-center justify-center shrink-0"
        style={{ width: 19, height: 19, borderRadius: 99, background: AMBER, color: '#fff', fontSize: 10 }}
        aria-hidden
      >
        ✓
      </span>
    );
  }
  if (status === 'in_progress') {
    return (
      <span
        className="flex items-center justify-center shrink-0"
        style={{ width: 19, height: 19, borderRadius: 99, border: `2px solid ${AMBER}` }}
        aria-hidden
      >
        <span style={{ width: 7, height: 7, borderRadius: 99, background: AMBER }} />
      </span>
    );
  }
  return (
    <span
      className="shrink-0"
      style={{ width: 19, height: 19, borderRadius: 99, border: '2px solid rgba(255,255,255,0.2)' }}
      aria-hidden
    />
  );
}

const STATUS_LABEL: Record<LearnerSectionStatus, string> = {
  done: 'finished',
  in_progress: 'in progress',
  not_started: 'not started',
};

export function TutorialV3SectionSidebar({
  title,
  sections,
  progress,
  activePage,
  onNavigate,
  onBack,
  open = false,
  onClose,
  learnerName,
  learnerRole = 'Learner',
}: {
  title: string;
  sections: LearnerSection[];
  progress: LearnerProgressState;
  /** 1-based learner page currently on screen. */
  activePage: number;
  onNavigate: (page: number, sectionId: string) => void;
  onBack?: () => void;
  /** Drawer state on narrow screens; the rail is always present from lg up. */
  open?: boolean;
  onClose?: () => void;
  learnerName?: string;
  learnerRole?: string;
}) {
  const pct = overallPercent(sections, progress);
  const initials = (learnerName || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  const go = (section: LearnerSection) => {
    onNavigate(section.pages[0] ?? 1, section.id);
    onClose?.();
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-20 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={onClose}
          role="presentation"
        />
      )}
      <aside
        aria-label="Tutorial sections"
        className={`flex flex-col shrink-0 z-30 transition-transform duration-300 lg:relative lg:translate-x-0 lg:flex fixed top-0 left-0 h-full ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ width: 256, background: NAVY }}
      >
        <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 mb-3"
              style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.04em' }}
            >
              ← All tutorials
            </button>
          )}
          <span style={{ fontSize: 9.5, letterSpacing: '0.16em', color: AMBER_LIGHT, fontWeight: 700 }}>
            TUTORIAL · V3
          </span>
          <h2 style={{ fontSize: 17, color: '#fff', marginTop: 4, lineHeight: 1.3, fontWeight: 650 }}>
            {title || 'Untitled tutorial'}
          </h2>
          <div style={{ marginTop: 14 }}>
            <div className="flex justify-between" style={{ marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Progress</span>
              <span style={{ fontSize: 10, color: AMBER_LIGHT, fontWeight: 700 }}>{pct}%</span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Tutorial progress"
              style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.1)' }}
            >
              <div style={{ height: 4, width: `${pct}%`, borderRadius: 99, background: AMBER, transition: 'width 240ms ease' }} />
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto" style={{ padding: '10px 0' }}>
          {sections.length === 0 && (
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.4)', padding: '12px 18px', lineHeight: 1.5 }}>
              No sections yet — this tutorial's content sits outside the section spine.
            </p>
          )}
          {sections.map((s) => {
            const status = sectionStatus(s, progress);
            const active = s.pages.includes(activePage);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => go(s)}
                aria-current={active ? 'true' : undefined}
                className="w-full text-left flex items-start gap-3 transition-colors"
                style={{
                  padding: '11px 18px',
                  background: active ? 'rgba(217,119,6,0.12)' : 'transparent',
                  borderLeft: `2px solid ${active ? AMBER : 'transparent'}`,
                }}
              >
                <StatusDot status={status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>§{s.index}</span>
                    {s.required && (
                      <span style={{ fontSize: 9, letterSpacing: '0.12em', color: 'rgba(251,191,36,0.7)', fontWeight: 700 }}>
                        REQ
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 13.5, color: active ? '#fff' : 'rgba(255,255,255,0.6)', marginTop: 2, lineHeight: 1.3 }}>
                    {s.title}
                  </p>
                  <span className="sr-only">{STATUS_LABEL[status]}</span>
                </div>
              </button>
            );
          })}
        </nav>

        {learnerName && (
          <div
            className="flex items-center gap-2.5"
            style={{ padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,0.1)' }}
          >
            <span
              className="flex items-center justify-center shrink-0"
              style={{ width: 27, height: 27, borderRadius: 99, background: 'rgba(217,119,6,0.3)', color: AMBER_LIGHT, fontSize: 11, fontWeight: 700 }}
            >
              {initials || '·'}
            </span>
            <div className="min-w-0">
              <p style={{ fontSize: 12, color: '#fff' }} className="truncate">{learnerName}</p>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{learnerRole}</p>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
