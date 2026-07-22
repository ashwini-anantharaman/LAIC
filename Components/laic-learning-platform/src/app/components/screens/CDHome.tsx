import React from 'react';
import { BookOpen, Database, GitBranch, ClipboardCheck, PlusSquare, ArrowRight, GraduationCap, BarChart2 } from 'lucide-react';
import { motion } from 'motion/react';
import { OBJECTS } from '../../../lib/data';
import { useApp } from '../../App';
import { StatusPill } from './StatusPill';

const OBJECT_TYPE_ICONS: Record<string, string> = {
  lesson: '📖', tutorial: '🎓', quiz: '✅', 'flashcard-set': '🃏',
  'concept-card': '💡', summary: '📋', reflection: '🪞', scenario: '🎭',
  assignment: '📝', drill: '🔁',
};

export function CDHome() {
  const { navigate, activeUserId, createdObjects } = useApp();

  const seedMine = OBJECTS.filter(o => o.ownerId === activeUserId || o.ownerId === 'sam' || o.ownerId === 'chen');
  const myObjects = [...createdObjects, ...seedMine.filter(o => !createdObjects.some(c => c.id === o.id))];
  const inReview = myObjects.filter(o => o.status === 'in-review').length;
  const published = myObjects.filter(o => o.status === 'published').length;

  const actionCards = [
    { id: 'cd-create',      icon: <PlusSquare size={20} />,     label: 'Create a learning object', desc: 'Start the Sources → Define → Build pipeline', color: '#0B0F1A' },
    { id: 'cd-wizard',      icon: <GraduationCap size={20} />,  label: 'Build a course',            desc: 'Assemble objects into a structured course', color: '#1D4ED8' },
    { id: 'cd-sources',     icon: <Database size={20} />,       label: 'Bring in sources',          desc: 'Manage collections and per-object pools', color: '#7C3AED' },
    { id: 'cd-library',     icon: <BookOpen size={20} />,       label: 'Object Library',            desc: `${myObjects.length} objects in this program`, color: '#059669' },
    { id: 'cd-submissions', icon: <ClipboardCheck size={20} />, label: 'My Submissions',            desc: `${inReview} in review`, color: '#D97706' },
    { id: 'cd-versions',    icon: <GitBranch size={20} />,      label: 'Versions & Publishing',     desc: 'Version history and publish status', color: '#6B7280' },
  ];

  const recentObjects = myObjects.slice(0, 4);

  return (
    <div className="px-6 py-6 w-full">
      {/* Program banner */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 p-4 rounded-[24px] mb-6"
        style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.08)' }}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0" style={{ background: 'rgba(0,0,0,0.04)' }}>🃏</div>
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 11.5, color: '#9AA3AF', fontWeight: 500 }}>LAIC · Sport program</p>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#0B1220' }}>Bridge — Learn to Play</p>
          <p style={{ fontSize: 12, color: '#6B7280', marginTop: 1 }}>Your workspace for building learning content for this program.</p>
        </div>
        <div className="flex gap-4 shrink-0">
          {[
            { label: 'Objects', value: myObjects.length },
            { label: 'In review', value: inReview },
            { label: 'Published', value: published },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p style={{ fontSize: 20, fontWeight: 750, color: '#0B1220', letterSpacing: '-0.5px' }}>{s.value}</p>
              <p style={{ fontSize: 11, color: '#9AA3AF' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Action cards */}
      <p style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 10 }}>What do you want to do?</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
        {actionCards.map((card, i) => (
          <motion.button
            key={card.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ y: -2 }}
            onClick={() => navigate(card.id)}
            className="text-left p-4 rounded-[22px] group transition-all"
            style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3 text-white" style={{ background: card.color }}>
              {card.icon}
            </div>
            <p style={{ fontSize: 13.5, fontWeight: 650, color: '#0B1220' }}>{card.label}</p>
            <p style={{ fontSize: 12, color: '#9AA3AF', marginTop: 2, lineHeight: 1.4 }}>{card.desc}</p>
            <p className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontSize: 12, color: '#6B7280' }}>Open →</p>
          </motion.button>
        ))}
      </div>

      {/* Recent objects */}
      {recentObjects.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>Recent objects</p>
            <button onClick={() => navigate('cd-library')} className="flex items-center gap-1 transition-colors hover:text-[#0B1220]" style={{ fontSize: 12, color: '#9AA3AF' }}>
              Object Library → <ArrowRight size={11} />
            </button>
          </div>
          <div className="rounded-[22px] overflow-hidden" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
            {recentObjects.map((obj, i) => (
              <div key={obj.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/80 transition-colors"
                style={{ borderBottom: i < recentObjects.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0" style={{ background: 'rgba(0,0,0,0.04)' }}>
                  {OBJECT_TYPE_ICONS[obj.type] || '📄'}
                </div>
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 13.5, fontWeight: 550, color: '#0B1220' }}>{obj.title}</p>
                  <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>{obj.type} · updated {obj.updatedAt}</p>
                </div>
                <StatusPill status={obj.status} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
