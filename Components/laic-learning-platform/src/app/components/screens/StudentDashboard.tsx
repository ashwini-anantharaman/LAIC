import React from 'react';
import { Lock, Play, Clock, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../../App';
import { COURSES, LEARNER_PROGRESS } from '../../../lib/data';

function ProgressRing({ percent, size = 40, stroke = 3.5, color = '#059669' }: { percent: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - percent / 100);
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
    </svg>
  );
}

export function StudentDashboard() {
  const { activeUserId, openReader, navigate } = useApp();
  const progress = LEARNER_PROGRESS.find(p => p.learnerId === activeUserId);
  const featuredCourse = COURSES[0];
  const otherCourses = COURSES.slice(1);
  const totalLessons = featuredCourse?.modules.reduce((s, m) => s + m.lessons.length, 0) || 0;

  return (
    <div className="px-6 py-6 w-full space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <p style={{ fontSize: 27, fontWeight: 750, color: '#0B1220', letterSpacing: '-0.5px' }}>My learning</p>
        <p style={{ fontSize: 13, color: '#9AA3AF', marginTop: 3 }}>Courses assigned by your coach or enrolled through your program. Pick up where you left off.</p>
      </motion.div>

      {/* Featured course card */}
      {featuredCourse && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
          className="p-5 rounded-[28px]"
          style={{ background: 'linear-gradient(135deg, #4C1D95, #7C3AED)', boxShadow: '0 12px 40px -12px rgba(124,58,237,0.45)' }}>
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)' }}>Sport</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)' }}>assigned</span>
              </div>
              <p style={{ fontSize: 20, fontWeight: 750, color: 'white', letterSpacing: '-0.3px', lineHeight: 1.2 }}>{featuredCourse.title}</p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 4, lineHeight: 1.5 }}>{featuredCourse.description}</p>
            </div>
            {progress && (
              <div className="shrink-0 flex flex-col items-center gap-1">
                <ProgressRing percent={progress.overallPercent} size={44} stroke={3.5} color="white" />
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{progress.overallPercent}%</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 mb-4">
            <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)' }}>
              <Clock size={11} className="inline mr-1" />~{featuredCourse.estimatedTotal}
            </span>
            <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)' }}>
              {featuredCourse.modules.length} modules · {totalLessons} lessons
            </span>
          </div>
          <button
            onClick={() => openReader('obj-1')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full"
            style={{ background: 'white', color: '#4C1D95', fontSize: 13.5, fontWeight: 700 }}>
            <div className="w-5 h-5 rounded-lg flex items-center justify-center" style={{ background: 'rgba(76,29,149,0.12)' }}>
              <Play size={10} />
            </div>
            ▶ Open course
          </button>
        </motion.div>
      )}

      {/* Also assigned */}
      {otherCourses.length > 0 && (
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 10 }}>Also assigned</p>
          <div className="space-y-2">
            {otherCourses.map((course, i) => {
              const isLocked = i > 0;
              const lessons = course.modules.reduce((s, m) => s + m.lessons.length, 0);
              return (
                <motion.div key={course.id}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}
                  className="flex items-center gap-3 p-4 rounded-[22px]"
                  style={{ background: isLocked ? 'rgba(255,255,255,0.5)' : 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)', opacity: isLocked ? 0.65 : 1 }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: isLocked ? '#F3F4F6' : 'rgba(0,0,0,0.05)' }}>
                    {isLocked ? <Lock size={15} style={{ color: '#9AA3AF' }} /> : <span style={{ fontSize: 16 }}>🎓</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 13.5, fontWeight: 550, color: '#0B1220' }}>{course.title}</p>
                    <p style={{ fontSize: 12, color: '#9AA3AF' }}>
                      {isLocked ? 'Unlocks after Module 1' : `${course.modules.length} modules · ${lessons} lessons`}
                    </p>
                  </div>
                  {!isLocked && <ChevronRight size={15} style={{ color: '#C4CBD4' }} />}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Info note */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="p-4 rounded-[22px]" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
        <p style={{ fontSize: 12.5, color: '#92400E', lineHeight: 1.6 }}>
          The first course above is fully playable — use it to experience the whole learner runtime (lessons, quizzes, Ask-AI, flashcards). Other listed courses are placeholders seeded for demonstration purposes.
        </p>
      </motion.div>
    </div>
  );
}
