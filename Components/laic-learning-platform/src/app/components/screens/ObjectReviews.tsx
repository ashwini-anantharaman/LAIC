import React, { useState } from 'react';
import { MessageSquare, Check, RotateCcw, X } from 'lucide-react';
import { motion } from 'motion/react';
import { REVIEWS, OBJECTS } from '../../../lib/data';
import { StatusPill } from './StatusPill';
import type { ReviewItem } from '../../../lib/types';

function ReviewDetail({ review, onClose }: { review: ReviewItem; onClose: () => void }) {
  const obj = review.objectId ? OBJECTS.find(o => o.id === review.objectId) : null;
  const [comment, setComment] = useState('');
  const [decision, setDecision] = useState<'approved' | 'changes-requested' | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex-1 min-w-0"
    >
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors" style={{ background: 'rgba(255,255,255,0.7)' }}>
          <X size={14} className="text-[#374151]" />
        </button>
        <div>
          <p style={{ fontSize: 15, fontWeight: 650, color: '#0B1220' }}>{review.title}</p>
          <p style={{ fontSize: 12, color: '#9AA3AF' }}>Submitted by {review.submittedBy} · {review.submittedAt}</p>
        </div>
      </div>

      {/* Object preview (blocks) */}
      {obj && (
        <div className="mb-5 p-4 rounded-[20px]" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
          <p style={{ fontSize: 14, fontWeight: 650, color: '#0B1220', marginBottom: 6 }}>{obj.title}</p>
          <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>{obj.description}</p>
          {obj.blocks.slice(0, 1).map(b => (
            <div key={b.id} className="mt-3 p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.03)' }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF', marginBottom: 4, textTransform: 'uppercase' }}>{b.type.replace(/-/g, ' ')}</p>
              <p style={{ fontSize: 13, color: '#374151' }}>
                {('text' in b.content) ? (b.content as { text: string }).text.slice(0, 120) + '…'
                 : ('term' in b.content) ? (b.content as { term: string }).term
                 : 'Block content'}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Existing comments */}
      {review.comments.length > 0 && (
        <div className="mb-4">
          <p style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 10 }}>Comments</p>
          <div className="space-y-3">
            {review.comments.map(cmt => (
              <div key={cmt.id} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-[#0B0F1A] text-white flex items-center justify-center shrink-0 text-[10px] font-bold">
                  {cmt.authorName.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="flex-1 p-3 rounded-2xl" style={{ background: 'white' }}>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: '#0B1220' }}>{cmt.authorName}
                    <span style={{ fontWeight: 400, color: '#9AA3AF' }}> · {cmt.authorRole}</span>
                  </p>
                  <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.55, marginTop: 2 }}>{cmt.content}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add comment */}
      <div className="p-4 rounded-[20px] mb-4" style={{ background: 'white', boxShadow: '0 4px 12px -6px rgba(30,50,80,0.08)' }}>
        <p style={{ fontSize: 12.5, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>Add block-level comment</p>
        <textarea
          className="w-full rounded-2xl px-3 py-2.5 outline-none resize-none"
          style={{ background: 'rgba(0,0,0,0.04)', fontSize: 13.5, color: '#0B1220', minHeight: 80 }}
          placeholder="Comment on a specific block…"
          value={comment}
          onChange={e => setComment(e.target.value)}
        />
      </div>

      {/* Decision */}
      <div className="flex gap-2">
        <button
          onClick={() => setDecision('approved')}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full transition-all"
          style={{ background: decision === 'approved' ? '#059669' : 'rgba(5,150,105,0.1)', color: decision === 'approved' ? 'white' : '#059669', fontSize: 13.5, fontWeight: 600 }}
        >
          <Check size={15} /> Approve
        </button>
        <button
          onClick={() => setDecision('changes-requested')}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full transition-all"
          style={{ background: decision === 'changes-requested' ? '#EA580C' : 'rgba(234,88,12,0.08)', color: decision === 'changes-requested' ? 'white' : '#EA580C', fontSize: 13.5, fontWeight: 600 }}
        >
          <RotateCcw size={15} /> Request changes
        </button>
      </div>
    </motion.div>
  );
}

export function ObjectReviews() {
  const [selected, setSelected] = useState<ReviewItem | null>(null);
  const queue = REVIEWS.filter(r => r.type === 'object');

  return (
    <div className="px-6 py-6 w-full flex gap-5">
      {/* Queue */}
      <div className={`space-y-3 ${selected ? 'w-64 shrink-0' : 'flex-1'}`}>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 12 }}>
          {queue.length} object{queue.length !== 1 ? 's' : ''} in queue
        </p>
        {queue.map((review, i) => (
          <motion.button
            key={review.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            onClick={() => setSelected(review)}
            className="w-full text-left p-4 rounded-[22px] transition-all"
            style={{
              background: selected?.id === review.id ? '#0B0F1A' : 'white',
              boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)',
            }}
          >
            <p style={{ fontSize: 13.5, fontWeight: 650, color: selected?.id === review.id ? 'white' : '#0B1220' }}>{review.title}</p>
            <p style={{ fontSize: 12, color: selected?.id === review.id ? 'rgba(255,255,255,0.55)' : '#9AA3AF', marginTop: 2 }}>
              {review.objectType} · {review.submittedBy}
            </p>
            <div className="flex items-center gap-2 mt-3">
              <StatusPill status={review.status === 'in-review' ? 'in-review' : 'draft'} />
              {review.comments.length > 0 && (
                <span className="flex items-center gap-1" style={{ fontSize: 11.5, color: selected?.id === review.id ? 'rgba(255,255,255,0.55)' : '#9AA3AF' }}>
                  <MessageSquare size={11} /> {review.comments.length}
                </span>
              )}
            </div>
          </motion.button>
        ))}

        {queue.length === 0 && (
          <div className="flex flex-col items-center py-12 text-center">
            <Check size={28} className="text-[#C4CBD4] mb-3" />
            <p style={{ fontSize: 14, fontWeight: 600, color: '#0B1220', marginBottom: 3 }}>All caught up</p>
            <p style={{ fontSize: 13, color: '#9AA3AF' }}>No objects waiting for review.</p>
          </div>
        )}
      </div>

      {selected && <ReviewDetail review={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
