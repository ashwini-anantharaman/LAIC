import React, { useState } from 'react';
import { MessageSquare, Inbox, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { REVIEWS } from '../../../lib/data';
import { StatusPill } from './StatusPill';
import type { ObjectStatus } from '../../../lib/types';

const REVIEW_STATUS_MAP: Record<string, ObjectStatus> = {
  pending: 'in-review', 'in-review': 'in-review',
  approved: 'approved', 'changes-requested': 'changes-requested',
};

/* ─── mock feedback inbox data ────────────────────────────────── */

const FEEDBACK_INBOX = [
  {
    targetTitle: 'HCP Basics — Lesson 1',
    targetType: 'Lesson',
    comments: [
      { id: 'fb1', author: 'Lee Park', role: 'Object Reviewer', on: 'Block 3 — Key term', content: 'The definition is a bit circular. Try anchoring it to a concrete example of an opening hand.', date: '2h ago' },
      { id: 'fb2', author: 'Lee Park', role: 'Object Reviewer', on: 'Block 5 — Question', content: 'Distractor B is too obviously wrong — replace it to make the question fair.', date: '2h ago' },
    ],
  },
  {
    targetTitle: 'Trump vs No-Trump — Concept card',
    targetType: 'Concept card',
    comments: [
      { id: 'fb3', author: 'Lee Park', role: 'Object Reviewer', on: 'Block 1 — Introduction', content: 'Good framing. Consider adding a one-sentence hook before the definition.', date: '1d ago' },
    ],
  },
];

export function MySubmissions() {
  const [resolved, setResolvedState] = useState<Set<string>>(new Set());
  const resolve = (id: string) => setResolvedState(prev => new Set([...prev, id]));

  const objectReviews = REVIEWS.filter(r => r.type === 'object');
  const openCount = FEEDBACK_INBOX.reduce((sum, g) => sum + g.comments.filter(c => !resolved.has(c.id)).length, 0);

  return (
    <div className="px-6 py-6 w-full space-y-6">

      {/* Feedback inbox */}
      {openCount > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Inbox size={14} style={{ color: '#374151' }} />
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0B1220' }}>Feedback inbox</p>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(234,88,12,0.1)', color: '#EA580C' }}>{openCount} open</span>
          </div>
          <div className="space-y-3">
            {FEEDBACK_INBOX.map((group) => {
              const openComments = group.comments.filter(c => !resolved.has(c.id));
              if (openComments.length === 0) return null;
              return (
                <motion.div key={group.targetTitle} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-[22px] overflow-hidden" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
                  <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(0,0,0,0.05)', background: 'rgba(0,0,0,0.02)' }}>
                    <div>
                      <p style={{ fontSize: 13.5, fontWeight: 650, color: '#0B1220' }}>{group.targetTitle}</p>
                      <p style={{ fontSize: 12, color: '#9AA3AF' }}>{group.targetType}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(234,88,12,0.1)', color: '#EA580C' }}>
                      {openComments.length} open
                    </span>
                  </div>
                  <div className="divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
                    {openComments.map((cmt) => (
                      <div key={cmt.id} className="flex items-start gap-3 px-4 py-3">
                        <div className="w-7 h-7 rounded-full bg-[#0B0F1A] text-white flex items-center justify-center shrink-0 mt-0.5" style={{ fontSize: 10, fontWeight: 700 }}>
                          {cmt.author.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p style={{ fontSize: 12.5, fontWeight: 600, color: '#0B1220' }}>
                            {cmt.author} <span style={{ fontWeight: 400, color: '#9AA3AF' }}>· {cmt.role} · {cmt.date}</span>
                          </p>
                          <p style={{ fontSize: 12, color: '#6B7280', margin: '2px 0' }}>on {cmt.on}</p>
                          <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.55 }}>{cmt.content}</p>
                        </div>
                        <button onClick={() => resolve(cmt.id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border shrink-0 mt-0.5"
                          style={{ color: '#059669', borderColor: 'rgba(5,150,105,0.25)', background: 'rgba(5,150,105,0.06)' }}>
                          <Check size={10} />Resolve
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Submitted for review */}
      <div>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#0B1220', marginBottom: 10 }}>
          Submitted for review
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(0,0,0,0.06)', color: '#6B7280' }}>
            {objectReviews.length}
          </span>
        </p>
        <div className="space-y-3">
          {objectReviews.map((review, i) => (
            <motion.div key={review.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              className="flex items-center gap-3 px-4 py-3 rounded-[22px]"
              style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(0,0,0,0.04)' }}>
                <Inbox size={15} style={{ color: '#9AA3AF' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 13.5, fontWeight: 550, color: '#0B1220' }}>{review.title}</p>
                <p style={{ fontSize: 12, color: '#9AA3AF' }}>{review.objectType} · Submitted {review.submittedAt}</p>
              </div>
              <StatusPill status={REVIEW_STATUS_MAP[review.status] ?? 'draft'} />
              {review.status === 'changes-requested' && (
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white shrink-0"
                  style={{ background: '#0B0F1A', fontSize: 12, fontWeight: 600 }}>
                  Address & resubmit
                </button>
              )}
            </motion.div>
          ))}
          {objectReviews.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center">
              <MessageSquare size={28} className="text-[#C4CBD4] mb-3" />
              <p style={{ fontSize: 14, fontWeight: 600, color: '#0B1220' }}>Nothing in review</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
