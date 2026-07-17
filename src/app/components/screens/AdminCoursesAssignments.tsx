import React, { useState } from 'react';
import { BookMarked, GraduationCap, Plus, UserPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { COURSES } from '../../../lib/data';
import { StatusPill } from './StatusPill';

function Toast({ msg }: { msg: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full text-white z-50"
      style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px -8px rgba(0,0,0,0.3)', whiteSpace: 'nowrap' }}>
      ✓ {msg}
    </motion.div>
  );
}

const STAFF: Record<string, { developer: string; objReviewer: string; courseReviewer: string }> = {
  'course-1': { developer: 'Sam Chen', objReviewer: 'Lee Park', courseReviewer: 'María Gómez' },
  'course-2': { developer: 'Sam Chen', objReviewer: 'Lee Park', courseReviewer: 'María Gómez' },
};

export function AdminCoursesAssignments() {
  const [toast, setToast] = useState('');
  const [newCourseCreated, setNewCourseCreated] = useState(false);

  const fireToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2400); };

  const createNewCourse = () => {
    setNewCourseCreated(true);
    fireToast('New course created — assign a developer');
  };

  return (
    <div className="px-6 py-6 w-full space-y-5">
      {/* Header action */}
      <div className="flex items-center justify-between">
        <p style={{ fontSize: 12.5, color: '#9AA3AF' }}>Where a course begins its life before a developer picks it up.</p>
        <button onClick={createNewCourse}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white shrink-0"
          style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600 }}>
          <Plus size={13} />New course
        </button>
      </div>

      {newCourseCreated && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-[22px]" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(217,119,6,0.12)' }}>
              <GraduationCap size={18} style={{ color: '#D97706' }} />
            </div>
            <div className="flex-1">
              <p style={{ fontSize: 13.5, fontWeight: 650, color: '#0B1220' }}>New course (untitled)</p>
              <p style={{ fontSize: 12, color: '#92400E' }}>Assign a developer to start building</p>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ background: '#FEF3C7', color: '#92400E' }}>draft</span>
          </div>
          <div className="flex items-center gap-2 mt-3 pt-3 border-t flex-wrap" style={{ borderColor: 'rgba(217,119,6,0.2)' }}>
            <span className="px-2.5 py-1 rounded-full text-xs" style={{ background: 'rgba(0,0,0,0.05)', color: '#9AA3AF' }}>Developer: unassigned</span>
            <span className="px-2.5 py-1 rounded-full text-xs" style={{ background: 'rgba(0,0,0,0.05)', color: '#9AA3AF' }}>Object reviewer: unassigned</span>
            <span className="px-2.5 py-1 rounded-full text-xs" style={{ background: 'rgba(0,0,0,0.05)', color: '#9AA3AF' }}>Course reviewer: unassigned</span>
            <button onClick={() => fireToast('Assignment updated')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
              style={{ background: '#0B0F1A', color: 'white' }}>
              <UserPlus size={10} />⊕ Assign people
            </button>
          </div>
        </motion.div>
      )}

      {COURSES.map((course, i) => {
        const staff = STAFF[course.id] || { developer: 'Sam Chen', objReviewer: 'Lee Park', courseReviewer: 'María Gómez' };
        const totalLessons = course.modules.reduce((s, m) => s + m.lessons.length, 0);
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
                  <p style={{ fontSize: 12.5, color: '#9AA3AF', marginTop: 2 }}>
                    <BookMarked size={11} className="inline mr-1" />
                    {course.modules.length} modules · {totalLessons} lessons
                  </p>
                </div>
              </div>
              <StatusPill status={course.status} />
            </div>

            {/* Staffing row */}
            <div className="flex items-center gap-2 flex-wrap pt-3 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
              <span className="px-2.5 py-1 rounded-full text-xs" style={{ background: 'rgba(0,0,0,0.05)', color: '#374151' }}>
                Developer: <strong>{staff.developer}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs" style={{ background: 'rgba(0,0,0,0.05)', color: '#374151' }}>
                Object reviewer: <strong>{staff.objReviewer}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs" style={{ background: 'rgba(0,0,0,0.05)', color: '#374151' }}>
                Course reviewer: <strong>{staff.courseReviewer}</strong>
              </span>
              <button onClick={() => fireToast('Assignment updated')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border"
                style={{ borderColor: 'rgba(0,0,0,0.1)', color: '#374151', background: 'rgba(255,255,255,0.8)' }}>
                <UserPlus size={10} />⊕ Assign people
              </button>
            </div>
          </motion.div>
        );
      })}

      <AnimatePresence>{toast && <Toast msg={toast} />}</AnimatePresence>
    </div>
  );
}
