import React, { useState } from 'react';
import { Check, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { REVIEWS, COURSES } from '../../../lib/data';
import { StatusPill } from './StatusPill';
import type { ReviewItem } from '../../../lib/types';

function CourseDetail({ review }: { review: ReviewItem }) {
  const course = review.courseId ? COURSES.find(c => c.id === review.courseId) : null;
  const [expanded, setExpanded] = useState<string[]>([]);
  const [decision, setDecision] = useState<'approved' | 'changes-requested' | null>(null);

  const toggle = (id: string) => setExpanded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="flex-1 min-w-0">
      <div className="mb-5">
        <p style={{ fontSize: 15, fontWeight: 650, color: '#0B1220' }}>{review.title}</p>
        <p style={{ fontSize: 12, color: '#9AA3AF' }}>Submitted by {review.submittedBy} · {review.submittedAt}</p>
      </div>

      {course && (
        <div className="mb-5 p-5 rounded-[22px]" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
          <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6, marginBottom: 14 }}>{course.description}</p>
          <div className="space-y-2">
            {course.modules.map(mod => (
              <div key={mod.id}>
                <button
                  onClick={() => toggle(mod.id)}
                  className="w-full flex items-center gap-2 py-2 text-left hover:text-[#0B1220] transition-colors"
                  style={{ fontSize: 13.5, fontWeight: 600, color: '#374151' }}
                >
                  {expanded.includes(mod.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  {mod.title}
                  <span style={{ fontSize: 11.5, color: '#9AA3AF', fontWeight: 400 }}>({mod.lessons.length} lessons)</span>
                </button>
                {expanded.includes(mod.id) && (
                  <div className="pl-6 space-y-1.5 mb-1">
                    {mod.lessons.map(les => (
                      <div key={les.id} className="flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-[#C4CBD4]" />
                        <p style={{ fontSize: 13, color: '#6B7280' }}>{les.title}</p>
                        <span style={{ fontSize: 11.5, color: '#C4CBD4' }}>{les.estimatedTime}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-4 rounded-[20px] mb-4" style={{ background: 'white', boxShadow: '0 4px 12px -6px rgba(30,50,80,0.08)' }}>
        <p style={{ fontSize: 12.5, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>Comment on section or lesson</p>
        <textarea
          className="w-full rounded-2xl px-3 py-2.5 outline-none resize-none"
          style={{ background: 'rgba(0,0,0,0.04)', fontSize: 13.5, color: '#0B1220', minHeight: 80 }}
          placeholder="e.g. Module 2 feels rushed — consider adding a recap lesson…"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setDecision('approved')}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full transition-all"
          style={{ background: decision === 'approved' ? '#059669' : 'rgba(5,150,105,0.1)', color: decision === 'approved' ? 'white' : '#059669', fontSize: 13.5, fontWeight: 600 }}
        >
          <Check size={15} /> Approve course
        </button>
        <button
          onClick={() => setDecision('changes-requested')}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full transition-all"
          style={{ background: decision === 'changes-requested' ? '#EA580C' : 'rgba(234,88,12,0.08)', color: decision === 'changes-requested' ? 'white' : '#EA580C', fontSize: 13.5, fontWeight: 600 }}
        >
          <RotateCcw size={15} /> Request changes
        </button>
      </div>
    </div>
  );
}

export function CourseReviews() {
  const [selected, setSelected] = useState<ReviewItem | null>(null);
  const queue = REVIEWS.filter(r => r.type === 'course');

  return (
    <div className="px-6 py-6 w-full flex gap-5">
      <div className={`space-y-3 ${selected ? 'w-64 shrink-0' : 'flex-1'}`}>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 12 }}>
          {queue.length} course{queue.length !== 1 ? 's' : ''} in queue
        </p>
        {queue.map((review, i) => (
          <motion.button
            key={review.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            onClick={() => setSelected(review)}
            className="w-full text-left p-4 rounded-[22px] transition-all"
            style={{ background: selected?.id === review.id ? '#0B0F1A' : 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}
          >
            <p style={{ fontSize: 13.5, fontWeight: 650, color: selected?.id === review.id ? 'white' : '#0B1220' }}>{review.title}</p>
            <p style={{ fontSize: 12, color: selected?.id === review.id ? 'rgba(255,255,255,0.55)' : '#9AA3AF', marginTop: 2 }}>
              {review.submittedBy} · {review.submittedAt}
            </p>
            <div className="mt-2">
              <StatusPill status={review.status === 'pending' ? 'draft' : 'in-review'} />
            </div>
          </motion.button>
        ))}
        {queue.length === 0 && (
          <div className="flex flex-col items-center py-12 text-center">
            <Check size={28} className="text-[#C4CBD4] mb-3" />
            <p style={{ fontSize: 14, fontWeight: 600, color: '#0B1220' }}>No courses to review</p>
          </div>
        )}
      </div>
      {selected && <CourseDetail review={selected} />}
    </div>
  );
}
