import React from 'react';
import { ChevronRight, GitBranch } from 'lucide-react';
import { motion } from 'motion/react';
import { OBJECTS, COURSES, PEOPLE } from '../../../lib/data';

const STATUS_COLORS: Record<string, { bg: string; bar: string; label: string }> = {
  draft:              { bg: '#F3F4F6', bar: '#D1D5DB', label: 'Draft' },
  'in-review':        { bg: '#FEF3C7', bar: '#F59E0B', label: 'In review' },
  'changes-requested':{ bg: '#FEE2E2', bar: '#EF4444', label: 'Changes requested' },
  approved:           { bg: '#D1FAE5', bar: '#059669', label: 'Approved' },
  published:          { bg: '#DBEAFE', bar: '#2563EB', label: 'Published' },
};

const ACTIVITY = [
  { icon: '✏️', text: '"How the Bidding Works" drafted', when: '2h ago', who: 'Sam Chen' },
  { icon: '✅', text: '"HCP Basics — Lesson 1" approved', when: '5h ago', who: 'Lee Park' },
  { icon: '⑂',  text: '"Bridge Terms" adopted by Cognition program', when: 'yesterday', who: 'María Gómez' },
  { icon: '🌐', text: '"Learn to Play Bridge" published', when: '2d ago', who: 'Dr. Amina Okafor' },
];

export function AdminProgramOverview() {
  const objects = OBJECTS;
  const courses = COURSES;
  const people  = PEOPLE;
  const teams   = [...new Set(PEOPLE.map(p => p.team).filter(Boolean))];

  const statusCounts = objects.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});
  const maxCount = Math.max(...Object.values(statusCounts), 1);

  return (
    <div className="px-6 py-6 w-full space-y-5">
      {/* Breadcrumb */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 flex-wrap">
        <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ background: '#F3F4F6', color: '#374151' }}>LAIC</span>
        <ChevronRight size={13} style={{ color: '#C4CBD4' }} />
        <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: '#0B0F1A', color: 'white' }}>Bridge — Learn to Play</span>
        <span className="px-3 py-1 rounded-full text-xs" style={{ background: '#FEF3C7', color: '#92400E' }}>Sport program</span>
      </motion.div>

      {/* 4 stat cards */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Objects',  value: objects.length,  icon: '📖', sub: `${statusCounts['published'] || 0} published` },
          { label: 'Courses',  value: courses.length,  icon: '🎓', sub: `${courses.filter(c => c.status === 'published').length} live` },
          { label: 'People',   value: people.length,   icon: '👥', sub: 'across all roles' },
          { label: 'Teams',    value: teams.length || 3, icon: '🏷️', sub: 'in this program' },
        ].map((s, i) => (
          <div key={s.label} className="p-4 rounded-[20px]"
            style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
            <div className="flex items-start justify-between mb-1">
              <span style={{ fontSize: 20 }}>{s.icon}</span>
            </div>
            <p style={{ fontSize: 24, fontWeight: 750, color: '#0B1220', letterSpacing: '-0.5px' }}>{s.value}</p>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{s.label}</p>
            <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>{s.sub}</p>
          </div>
        ))}
      </motion.div>

      {/* Object pipeline */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
        className="p-5 rounded-[24px]" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
        <div className="flex items-center gap-2 mb-4">
          <GitBranch size={14} style={{ color: '#6B7280' }} />
          <p style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Object pipeline</p>
        </div>
        <div className="space-y-3">
          {Object.entries(STATUS_COLORS).map(([status, cfg]) => {
            const count = statusCounts[status] || 0;
            const pct = Math.round((count / maxCount) * 100);
            return (
              <div key={status} className="flex items-center gap-3">
                <div className="w-28 shrink-0">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: cfg.bg, color: '#374151' }}>{cfg.label}</span>
                </div>
                <div className="flex-1 h-2 rounded-full" style={{ background: 'rgba(0,0,0,0.06)' }}>
                  <div className="h-2 rounded-full transition-all" style={{ background: cfg.bar, width: `${pct}%` }} />
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', minWidth: 20, textAlign: 'right' }}>{count}</span>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Recent activity */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
        className="p-5 rounded-[24px]" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 14 }}>Recent activity</p>
        <div className="space-y-3">
          {ACTIVITY.map((a, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-base shrink-0">{a.icon}</span>
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 13, color: '#0B1220' }}>{a.text}</p>
                <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>{a.who} · {a.when}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
