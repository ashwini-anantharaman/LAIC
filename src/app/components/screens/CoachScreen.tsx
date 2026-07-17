import React, { useState } from 'react';
import { BookOpen, Clock, TrendingUp, MessageSquare, Play, UserPlus, X, Check, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PEOPLE, COURSES, LEARNER_PROGRESS } from '../../../lib/data';

function ProgressRing({ percent, size = 40, stroke = 3.5 }: { percent: number; size?: number; stroke?: number }) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - percent / 100);
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(30,50,80,0.1)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#059669" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
    </svg>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
      <span style={{ fontSize: 13, color: '#374151' }}>{label}</span>
      <button onClick={() => onChange(!on)} className="w-9 h-5 rounded-full relative shrink-0 transition-all" style={{ background: on ? '#059669' : 'rgba(0,0,0,0.12)' }}>
        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all" style={{ left: on ? '17px' : '2px' }} />
      </button>
    </div>
  );
}

/* ─── assign modal ────────────────────────────────────────────── */
function AssignModal({ courseTitle, learners, onAssign, onClose }: {
  courseTitle: string; learners: typeof PEOPLE; onAssign: (ids: string[]) => void; onClose: () => void;
}) {
  const [sel, setSel] = useState<string[]>([]);
  const toggle = (id: string) => setSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(11,18,32,0.45)', backdropFilter: 'blur(4px)' }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm rounded-[28px] overflow-hidden"
        style={{ background: 'white', boxShadow: '0 24px 64px -16px rgba(30,50,80,0.3)' }}>
        <div className="p-5 border-b flex items-start justify-between" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0B1220' }}>Assign — {courseTitle}</h3>
            <p style={{ fontSize: 12.5, color: '#9AA3AF', marginTop: 1 }}>Choose which students to assign</p>
          </div>
          <button onClick={onClose}><X size={16} style={{ color: '#9AA3AF' }} /></button>
        </div>
        <div className="p-4 max-h-64 overflow-y-auto space-y-1">
          {learners.map(p => (
            <button key={p.id} onClick={() => toggle(p.id)}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all"
              style={{ background: sel.includes(p.id) ? '#F0FDF4' : 'transparent', borderColor: sel.includes(p.id) ? '#059669' : 'transparent' }}>
              <div className="w-7 h-7 rounded-full bg-[#0B0F1A] text-white flex items-center justify-center shrink-0" style={{ fontSize: 10, fontWeight: 700 }}>{p.initials}</div>
              <p style={{ fontSize: 13, color: '#0B1220', flex: 1, textAlign: 'left' }}>{p.name}</p>
              {sel.includes(p.id) && <Check size={13} style={{ color: '#059669' }} />}
            </button>
          ))}
        </div>
        <div className="flex gap-2 p-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-full" style={{ background: 'rgba(0,0,0,0.05)', fontSize: 13, fontWeight: 600, color: '#374151' }}>Cancel</button>
          <button onClick={() => { onAssign(sel); onClose(); }} disabled={!sel.length}
            className="flex-1 py-2.5 rounded-full text-white"
            style={{ background: sel.length ? '#0B0F1A' : '#E5E7EB', color: sel.length ? '#fff' : '#9AA3AF', fontSize: 13, fontWeight: 600 }}>
            Assign to {sel.length || '—'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── main component ──────────────────────────────────────────── */

export function CoachScreen() {
  const learners = PEOPLE.filter(p => p.role === 'student');
  const [assignModal, setAssignModal] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [interactions, setInteractions] = useState({
    askAi: true, quizMe: true, flashcards: false, notes: true, hints: true,
  });
  const [saved, setSaved] = useState(false);

  const fireToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2400); };
  const saveSettings = () => { setSaved(true); fireToast('Saved for my students'); setTimeout(() => setSaved(false), 2400); };

  const interactionChips = ['Ask AI', 'Quiz me', 'Flashcards', 'Reflections', 'Notes'];

  return (
    <div className="px-6 py-6 w-full space-y-6">

      {/* Available to assign */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 10 }}>Available to assign</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {COURSES.filter(c => c.status === 'published').map((course, i) => {
            const totalLessons = course.modules.reduce((s, m) => s + m.lessons.length, 0);
            return (
              <motion.div key={course.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                className="p-4 rounded-[22px]" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
                <p style={{ fontSize: 14, fontWeight: 650, color: '#0B1220', marginBottom: 2 }}>{course.title}</p>
                <p style={{ fontSize: 12, color: '#9AA3AF', marginBottom: 12 }}>{course.modules.length} modules · {totalLessons} lessons</p>
                <div className="flex gap-2">
                  <button onClick={() => fireToast('Opened in review workspace')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-medium"
                    style={{ borderColor: 'rgba(0,0,0,0.1)', color: '#374151' }}>
                    <MessageSquare size={11} />Comment
                  </button>
                  <button onClick={() => fireToast('Opening learner experience…')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-medium"
                    style={{ borderColor: 'rgba(0,0,0,0.1)', color: '#374151' }}>
                    <Play size={11} />Try
                  </button>
                  <button onClick={() => setAssignModal(course.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-white text-xs font-semibold"
                    style={{ background: '#0B0F1A' }}>
                    <UserPlus size={11} />⊕ Assign
                  </button>
                </div>
              </motion.div>
            );
          })}
          {COURSES.filter(c => c.status === 'published').length === 0 && (
            <p style={{ fontSize: 13, color: '#9AA3AF' }}>No published courses available to assign yet.</p>
          )}
        </div>
      </div>

      {/* My students */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 10 }}>My students</p>
        <div className="rounded-[22px] overflow-hidden" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
          <div className="px-4 py-2.5 border-b" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
            <p style={{ fontSize: 12, color: '#9AA3AF' }}>Progress is per-student: completion, quiz scores, and time on task.</p>
          </div>
          {learners.map((person, i) => {
            const progress = LEARNER_PROGRESS.find(p => p.learnerId === person.id);
            const pct = progress?.overallPercent || 0;
            const needsNudge = pct < 20;
            return (
              <div key={person.id} className="flex items-center gap-3 px-4 py-3"
                style={{ borderBottom: i < learners.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                <div className="w-8 h-8 rounded-full bg-[#0B0F1A] text-white flex items-center justify-center shrink-0" style={{ fontSize: 11, fontWeight: 700 }}>
                  {person.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 13.5, fontWeight: 550, color: '#0B1220' }}>{person.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 rounded-full max-w-[120px]" style={{ background: 'rgba(0,0,0,0.07)' }}>
                      <div className="h-1.5 rounded-full transition-all" style={{ background: needsNudge ? '#EF4444' : '#059669', width: `${pct}%` }} />
                    </div>
                    <span style={{ fontSize: 11.5, color: '#9AA3AF' }}>{pct}%</span>
                  </div>
                </div>
                {needsNudge && (
                  <button onClick={() => fireToast(`Nudge sent to ${person.name}`)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                    style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
                    <Send size={10} />Nudge
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Learner experience panel */}
      <div className="p-5 rounded-[24px]" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p style={{ fontSize: 13.5, fontWeight: 650, color: '#0B1220' }}>The learner experience</p>
            <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 1 }}>Walk through the course exactly as your students do — ask AI, take quizzes, use flashcards and notes.</p>
          </div>
          <button onClick={() => fireToast('Opening learner experience…')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white shrink-0"
            style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600 }}>
            <Play size={13} />▶ Open
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {interactionChips.map(c => (
            <span key={c} className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(0,0,0,0.05)', color: '#374151' }}>{c}</span>
          ))}
        </div>
      </div>

      {/* Cohort interaction settings */}
      <div className="p-5 rounded-[24px]" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
        <p style={{ fontSize: 13.5, fontWeight: 650, color: '#0B1220', marginBottom: 2 }}>Learner interaction settings — your cohort</p>
        <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 12 }}>These settings override the course defaults for your students only. The developer's published course is unchanged.</p>
        <Toggle on={interactions.askAi}     onChange={v => setInteractions(p => ({...p, askAi: v}))}     label="Ask-AI study panel" />
        <Toggle on={interactions.quizMe}    onChange={v => setInteractions(p => ({...p, quizMe: v}))}    label="AI 'quiz me'" />
        <Toggle on={interactions.flashcards} onChange={v => setInteractions(p => ({...p, flashcards: v}))} label="Learner-made flashcards" />
        <Toggle on={interactions.notes}     onChange={v => setInteractions(p => ({...p, notes: v}))}     label="Private notes" />
        <Toggle on={interactions.hints}     onChange={v => setInteractions(p => ({...p, hints: v}))}     label="Show question hints" />
        <button onClick={saveSettings}
          className="mt-4 w-full py-2.5 rounded-full text-white"
          style={{ background: saved ? '#059669' : '#0B0F1A', fontSize: 13.5, fontWeight: 600 }}>
          {saved ? '✓ Saved for my students' : 'Save for my students'}
        </button>
      </div>

      {/* Assign modal */}
      {assignModal && (
        <AssignModal
          courseTitle={COURSES.find(c => c.id === assignModal)?.title || ''}
          learners={learners}
          onAssign={(ids) => fireToast(`Assigned to ${ids.length} student${ids.length !== 1 ? 's' : ''}`)}
          onClose={() => setAssignModal(null)}
        />
      )}

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full text-white z-50"
            style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px -8px rgba(0,0,0,0.3)', whiteSpace: 'nowrap' }}>
            ✓ {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
