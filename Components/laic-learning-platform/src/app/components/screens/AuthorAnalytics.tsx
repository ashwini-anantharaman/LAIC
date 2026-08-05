import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'motion/react';
import { OBJECTS } from '../../../lib/data';

const STAT_CARDS = [
  { label: 'Avg completion',       value: '74%',  sub: 'across 8 published objects', icon: '📊' },
  { label: 'Avg quiz score',        value: '81%',  sub: 'last 30 days',               icon: '✅' },
  { label: 'AI drafts accepted',    value: '68%',  sub: 'of generated content kept',  icon: '✦' },
  { label: 'Published objects',     value: '4',    sub: 'in Bridge program',           icon: '🌐' },
];

const PER_OBJECT_DATA = [
  { id: 'obj-1', title: 'HCP Basics — Lesson 1',          type: 'Lesson',       views: 41, completion: 74, signal: 'Q4 missed by 61% — review distractor B' },
  { id: 'obj-2', title: 'Bridge Terms — Concept card',    type: 'Concept card', views: 38, completion: 88, signal: null },
  { id: 'obj-3', title: 'Basics Checkpoint — Quiz',       type: 'Quiz',         views: 29, completion: 61, signal: 'Low completion — 14 students stopped on Q2' },
  { id: 'obj-4', title: 'Trump vs No-Trump — Concept card',type: 'Concept card',views: 22, completion: 92, signal: null },
];

const COMPLETION_BAR = PER_OBJECT_DATA.map(o => ({ name: o.title.split(' — ')[0], pct: o.completion }));

export function AuthorAnalytics() {
  return (
    <div className="px-6 py-6 w-full space-y-5">
      {/* 4 stat cards */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STAT_CARDS.map((s, i) => (
          <div key={s.label} className="p-4 rounded-[20px]" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
            <span style={{ fontSize: 20 }}>{s.icon}</span>
            <p style={{ fontSize: 26, fontWeight: 750, color: '#0B1220', letterSpacing: '-0.5px', marginTop: 6 }}>{s.value}</p>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151' }}>{s.label}</p>
            <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>{s.sub}</p>
          </div>
        ))}
      </motion.div>

      {/* Completion bar chart */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
        className="p-5 rounded-[24px]" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 14 }}>Completion % by object</p>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={COMPLETION_BAR} layout="vertical">
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#9AA3AF' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#9AA3AF' }} axisLine={false} tickLine={false} width={120} />
            <Tooltip contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12 }} formatter={(v: number) => [`${v}%`, 'Completion']} />
            <Bar dataKey="pct" fill="#059669" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Per-object table */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="rounded-[24px] overflow-hidden" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
        <div className="px-5 py-3.5 border-b" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Per-object breakdown — last 30 days</p>
        </div>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
              {['Object', 'Views', 'Completion %', 'Signals'].map(h => (
                <th key={h} className="px-5 py-3 text-left" style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PER_OBJECT_DATA.map((row, i) => (
              <tr key={row.id} style={{ borderBottom: i < PER_OBJECT_DATA.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
                <td className="px-5 py-3.5">
                  <p style={{ fontSize: 13.5, fontWeight: 550, color: '#0B1220' }}>{row.title}</p>
                  <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs" style={{ background: '#F3F4F6', color: '#374151' }}>{row.type}</span>
                </td>
                <td className="px-5 py-3.5" style={{ fontSize: 13.5, color: '#374151' }}>{row.views}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full" style={{ background: 'rgba(0,0,0,0.07)' }}>
                      <div className="h-1.5 rounded-full" style={{ background: row.completion >= 75 ? '#059669' : row.completion >= 50 ? '#F59E0B' : '#EF4444', width: `${row.completion}%` }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{row.completion}%</span>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  {row.signal ? (
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle size={12} style={{ color: '#F59E0B', marginTop: 1, shrink: 0 }} />
                      <p style={{ fontSize: 12.5, color: '#92400E', lineHeight: 1.4 }}>{row.signal}</p>
                    </div>
                  ) : (
                    <span style={{ color: '#C4CBD4', fontSize: 14 }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-5 py-3 border-t" style={{ borderColor: 'rgba(0,0,0,0.05)', background: 'rgba(0,0,0,0.01)' }}>
          <p style={{ fontSize: 12, color: '#9AA3AF' }}>Analytics figures are illustrative/seeded — not computed from real usage in this prototype.</p>
        </div>
      </motion.div>
    </div>
  );
}
