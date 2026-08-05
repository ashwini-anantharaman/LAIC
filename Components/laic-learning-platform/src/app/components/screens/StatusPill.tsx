import React from 'react';
import type { ObjectStatus } from '../../../lib/types';

const CONFIG: Record<ObjectStatus, { dot: string; bg: string; text: string; label: string }> = {
  draft:              { dot: '#94A3B8', bg: 'rgba(148,163,184,0.12)', text: '#64748B', label: 'Draft' },
  'in-review':        { dot: '#D97706', bg: 'rgba(217,119,6,0.1)',   text: '#B45309', label: 'In review' },
  'changes-requested':{ dot: '#EA580C', bg: 'rgba(234,88,12,0.1)',   text: '#C2410C', label: 'Changes req.' },
  approved:           { dot: '#0284C7', bg: 'rgba(2,132,199,0.1)',   text: '#0369A1', label: 'Approved' },
  published:          { dot: '#059669', bg: 'rgba(5,150,105,0.1)',   text: '#047857', label: 'Published' },
  archived:           { dot: '#9CA3AF', bg: 'rgba(156,163,175,0.1)', text: '#6B7280', label: 'Archived' },
};

export function StatusPill({ status }: { status: ObjectStatus }) {
  const c = CONFIG[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full"
      style={{ background: c.bg, fontSize: 11.5, fontWeight: 500, color: c.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.dot }} />
      {c.label}
    </span>
  );
}
