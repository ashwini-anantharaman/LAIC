import React, { useState } from 'react';
import { GraduationCap, X, Globe, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { COURSES } from '../../../lib/data';
import { StatusPill } from './StatusPill';

/* ─── audience modal ─────────────────────────────────────────── */

interface AudienceState {
  orgWide: boolean;
  allProgram: boolean;
  specificTeams: string[];
  coachStudents: boolean;
  directEnroll: boolean;
}

const TEAMS = ['Memory', 'Cognition', 'Biases', 'Bridge Basics', 'Advanced Play'];

function AudienceModal({ courseTitle, current, onPublish, onClose }: {
  courseTitle: string;
  current: AudienceState | null;
  onPublish: (s: AudienceState) => void;
  onClose: () => void;
}) {
  const [s, setS] = useState<AudienceState>(current || {
    orgWide: false, allProgram: false, specificTeams: [], coachStudents: false, directEnroll: false,
  });

  const toggle = (key: keyof AudienceState) => {
    setS(prev => ({ ...prev, [key]: !prev[key] }));
  };
  const toggleTeam = (t: string) =>
    setS(prev => ({ ...prev, specificTeams: prev.specificTeams.includes(t) ? prev.specificTeams.filter(x => x !== t) : [...prev.specificTeams, t] }));

  const summary = () => {
    const parts: string[] = [];
    if (s.orgWide) parts.push('all of LAIC');
    else if (s.allProgram) parts.push('all of Bridge');
    else if (s.specificTeams.length) parts.push(s.specificTeams.join(', '));
    if (s.coachStudents) parts.push("coaches' students");
    if (s.directEnroll) parts.push('directly enrolled');
    return parts.length ? parts.join(' + ') : '—';
  };

  const canPublish = s.orgWide || s.allProgram || s.specificTeams.length > 0 || s.coachStudents || s.directEnroll;

  function ToggleRow({ on, onToggle, label, sub }: { on: boolean; onToggle: () => void; label: string; sub?: string }) {
    return (
      <div className="flex items-start gap-3 py-3 border-b" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
        <button onClick={onToggle}
          className="w-9 h-5 rounded-full relative shrink-0 transition-all mt-0.5"
          style={{ background: on ? '#059669' : 'rgba(0,0,0,0.12)' }}>
          <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all" style={{ left: on ? '17px' : '2px' }} />
        </button>
        <div>
          <p style={{ fontSize: 13.5, fontWeight: 550, color: '#0B1220' }}>{label}</p>
          {sub && <p style={{ fontSize: 12, color: '#9AA3AF', marginTop: 1 }}>{sub}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(11,18,32,0.45)', backdropFilter: 'blur(4px)' }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-[28px] overflow-hidden"
        style={{ background: 'white', boxShadow: '0 24px 64px -16px rgba(30,50,80,0.3)' }}>
        <div className="p-5 border-b flex items-start justify-between" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0B1220' }}>Publish — choose the audience</h3>
            <p style={{ fontSize: 12.5, color: '#9AA3AF', marginTop: 1 }}>{courseTitle}</p>
          </div>
          <button onClick={onClose}><X size={16} style={{ color: '#9AA3AF' }} /></button>
        </div>
        <div className="p-5">
          <ToggleRow on={s.orgWide} onToggle={() => toggle('orgWide')}
            label="Share org-wide — all programs in LAIC"
            sub="Other programs can adopt & adapt it." />
          <ToggleRow on={s.allProgram} onToggle={() => toggle('allProgram')}
            label="Everyone in Bridge"
            sub="All teams in this program." />

          {/* Specific teams — only visible when neither of the above */}
          {!s.orgWide && !s.allProgram && (
            <div className="py-3 border-b" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
              <p style={{ fontSize: 13, fontWeight: 550, color: '#374151', marginBottom: 8 }}>Specific teams</p>
              <div className="flex flex-wrap gap-2">
                {TEAMS.map(t => {
                  const on = s.specificTeams.includes(t);
                  return (
                    <button key={t} onClick={() => toggleTeam(t)}
                      className="px-3 py-1 rounded-full border text-xs font-medium transition-all"
                      style={{ background: on ? '#F0FDF4' : 'rgba(0,0,0,0.04)', borderColor: on ? '#059669' : 'rgba(0,0,0,0.1)', color: on ? '#059669' : '#374151' }}>
                      {on && '✓ '}{t}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <ToggleRow on={s.coachStudents} onToggle={() => toggle('coachStudents')}
            label="Coaches' students"
            sub="Coaches in this program can assign it to their own students." />
          <ToggleRow on={s.directEnroll} onToggle={() => toggle('directEnroll')}
            label="Directly to enrolled students" />

          {/* Live summary */}
          <div className="mt-4 px-3 py-2.5 rounded-2xl" style={{ background: 'rgba(0,0,0,0.04)' }}>
            <span style={{ fontSize: 12.5, color: '#6B7280' }}>Audience → </span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#0B1220' }}>{summary()}</span>
          </div>
        </div>
        <div className="flex gap-2 p-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-full" style={{ background: 'rgba(0,0,0,0.05)', fontSize: 13, fontWeight: 600, color: '#374151' }}>Cancel</button>
          <button onClick={() => { onPublish(s); onClose(); }} disabled={!canPublish}
            className="flex-1 py-2.5 rounded-full text-white flex items-center justify-center gap-1.5"
            style={{ background: canPublish ? '#059669' : '#E5E7EB', color: canPublish ? '#fff' : '#9AA3AF', fontSize: 13, fontWeight: 600 }}>
            <Globe size={13} />Publish to this audience
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── main component ──────────────────────────────────────────── */

export function AdminPublishingGovernance() {
  const [audiences, setAudiences] = useState<Record<string, AudienceState>>({});
  const [openModal, setOpenModal] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const fireToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2400); };

  const publishCourse = (courseId: string, audience: AudienceState) => {
    setAudiences(prev => ({ ...prev, [courseId]: audience }));
    fireToast('Course published');
  };

  const eligibleCourses = COURSES.filter(c => c.status === 'published' || c.status === 'approved');

  const audienceSummary = (courseId: string): string => {
    const a = audiences[courseId];
    if (!a) return 'not published yet';
    const parts: string[] = [];
    if (a.orgWide) parts.push('all of LAIC');
    else if (a.allProgram) parts.push('all of Bridge');
    else if (a.specificTeams.length) parts.push(a.specificTeams.join(', '));
    if (a.coachStudents) parts.push("coaches' students");
    if (a.directEnroll) parts.push('directly enrolled');
    return parts.length ? parts.join(' + ') : 'not published yet';
  };

  return (
    <div className="px-6 py-6 w-full space-y-4">
      <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 8 }}>
        Approved work waits here until you decide who it reaches. This is the one place that answers "published to whom?"
      </p>

      {eligibleCourses.map((course, i) => {
        const totalLessons = course.modules.reduce((s, m) => s + m.lessons.length, 0);
        const isPublished = course.status === 'published' || audiences[course.id];
        const summary = audienceSummary(course.id);

        return (
          <motion.div key={course.id}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className="p-5 rounded-[24px]" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#F3F4F6' }}>
                  <GraduationCap size={18} style={{ color: '#374151' }} />
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 650, color: '#0B1220' }}>{course.title}</p>
                  <p style={{ fontSize: 12.5, color: '#9AA3AF' }}>{course.modules.length} modules · {totalLessons} lessons</p>
                </div>
              </div>
              <StatusPill status={course.status} />
            </div>

            <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
              <div>
                <p style={{ fontSize: 12, color: '#9AA3AF' }}>Audience</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: summary === 'not published yet' ? '#9AA3AF' : '#0B1220' }}>{summary}</p>
              </div>
              <button onClick={() => setOpenModal(course.id)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-xs font-semibold"
                style={{ background: isPublished ? '#374151' : '#059669' }}>
                {isPublished ? <><Globe size={11} />⚙ Edit audience</> : <><Globe size={11} />➤ Set audience & publish</>}
              </button>
            </div>
          </motion.div>
        );
      })}

      {eligibleCourses.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <Globe size={32} className="text-[#C4CBD4] mb-3" />
          <p style={{ fontSize: 15, fontWeight: 600, color: '#0B1220', marginBottom: 4 }}>No approved courses yet</p>
          <p style={{ fontSize: 13, color: '#9AA3AF' }}>Approved courses appear here for audience setting and publishing.</p>
        </div>
      )}

      {openModal && (
        <AudienceModal
          courseTitle={COURSES.find(c => c.id === openModal)?.title || ''}
          current={audiences[openModal] || null}
          onPublish={(s) => publishCourse(openModal, s)}
          onClose={() => setOpenModal(null)}
        />
      )}

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full text-white z-50"
            style={{ background: '#059669', fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px -8px rgba(0,0,0,0.3)' }}>
            ✓ {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
