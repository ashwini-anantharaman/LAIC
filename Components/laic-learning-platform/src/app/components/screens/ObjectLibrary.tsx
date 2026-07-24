import React, { useState } from 'react';
import { Search, Filter, Eye, GitBranch, PenLine, BookOpen, Layers, HelpCircle, Copy, FileText, Lightbulb, Zap, Video, BookMarked } from 'lucide-react';
import { motion } from 'motion/react';
import { OBJECTS, COURSES } from '../../../lib/data';
import { StatusPill } from './StatusPill';
import type { ObjectType, ObjectStatus } from '../../../lib/types';
import { useApp } from '../../App';

const TYPE_ICONS: Record<ObjectType | 'course', React.ReactNode> = {
  lesson:        <BookOpen size={14} />,
  tutorial:      <Layers size={14} />,
  quiz:          <HelpCircle size={14} />,
  'flashcard-set': <Copy size={14} />,
  'concept-card':  <Lightbulb size={14} />,
  summary:       <FileText size={14} />,
  reflection:    <FileText size={14} />,
  scenario:      <Zap size={14} />,
  assignment:    <PenLine size={14} />,
  drill:         <Zap size={14} />,
  'video-script':  <Video size={14} />,
  course:        <BookMarked size={14} />,
};

const TYPE_GROUPS: { type: ObjectType | 'course'; label: string }[] = [
  { type: 'course', label: 'Courses' },
  { type: 'lesson', label: 'Lessons' },
  { type: 'tutorial', label: 'Tutorials' },
  { type: 'quiz', label: 'Quizzes' },
  { type: 'flashcard-set', label: 'Flashcard Sets' },
  { type: 'concept-card', label: 'Concept Cards' },
  { type: 'summary', label: 'Summaries' },
  { type: 'reflection', label: 'Reflections' },
  { type: 'scenario', label: 'Scenarios' },
  { type: 'assignment', label: 'Assignments' },
  { type: 'drill', label: 'Drills' },
  { type: 'video-script', label: 'Video scripts' },
];

export function ObjectLibrary() {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<ObjectStatus | 'all'>('all');
  const { openReader, openEditor, createdObjects } = useApp();

  // Saved objects first (account library), then seed catalog without duplicates.
  const allObjects = [
    ...createdObjects,
    ...OBJECTS.filter(o => !createdObjects.some(c => c.id === o.id)),
  ];

  const filtered = allObjects.filter(o => {
    const matchSearch = o.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || o.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const savedCount = createdObjects.length;

  const courseFiltered = COURSES.filter(c => {
    const matchSearch = c.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="px-6 py-6 w-full">
      {savedCount > 0 && (
        <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 12 }}>
          <span style={{ fontWeight: 650, color: '#0B1220' }}>{savedCount} saved</span>
          {' '}in your account library (shown first)
        </p>
      )}
      {/* Search + filter bar */}
      <div className="flex gap-2 mb-6">
        <div
          className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.8)' }}
        >
          <Search size={14} className="text-[#9AA3AF] shrink-0" />
          <input
            className="flex-1 bg-transparent outline-none placeholder:text-[#C4CBD4]"
            style={{ fontSize: 13.5, color: '#0B1220' }}
            placeholder="Search objects…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as ObjectStatus | 'all')}
          className="px-3 py-2 rounded-2xl outline-none cursor-pointer"
          style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.8)', fontSize: 13, color: '#374151' }}
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="in-review">In review</option>
          <option value="approved">Approved</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Groups */}
      {TYPE_GROUPS.map(({ type, label }) => {
        const items = type === 'course'
          ? courseFiltered.map(c => ({ id: c.id, title: c.title, ownerName: c.authorName, status: c.status as ObjectStatus, reuseCount: c.learnerCount, scope: c.scope, isCourse: true }))
          : filtered.filter(o => o.type === type).map(o => ({ ...o, isCourse: false }));

        if (items.length === 0) return null;

        return (
          <motion.section
            key={type}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="mb-6"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[#9AA3AF]">{TYPE_ICONS[type]}</span>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{label}</p>
              <span style={{ fontSize: 11, color: '#C4CBD4' }}>{items.length}</span>
            </div>
            <div
              className="rounded-[22px] overflow-hidden"
              style={{ background: 'white', boxShadow: '0 4px 20px -8px rgba(30,50,80,0.12)' }}
            >
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50/80"
                  style={{ borderBottom: idx < items.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}
                >
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 13.5, fontWeight: 550, color: '#0B1220' }}>{item.title}</p>
                    <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>{item.ownerName}</p>
                  </div>
                  <StatusPill status={item.status} />
                  <span style={{ fontSize: 11.5, color: '#C4CBD4', minWidth: 32, textAlign: 'right' }}>
                    {item.isCourse ? `${(item as typeof items[0]).reuseCount} learners` : `×${(item as typeof items[0]).reuseCount}`}
                  </span>
                  <div className="flex items-center gap-1">
                    {!item.isCourse && (
                      <button
                        onClick={() => openReader(item.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100 text-[#9AA3AF]"
                        title="Student preview"
                      >
                        <Eye size={13} />
                      </button>
                    )}
                    {!item.isCourse && ('type' in item) && (item.type === 'tutorial' || item.type === 'flashcard-set' || createdObjects.some(o => o.id === item.id)) && (
                      <button
                        onClick={() => openEditor(item.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100 text-[#9AA3AF]"
                        title="Edit (available even in review)"
                      >
                        <PenLine size={13} />
                      </button>
                    )}
                    <button className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100 text-[#9AA3AF]" title="New draft">
                      <GitBranch size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        );
      })}

      {filtered.length === 0 && courseFiltered.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <BookOpen size={32} className="text-[#C4CBD4] mb-3" />
          <p style={{ fontSize: 15, fontWeight: 600, color: '#0B1220', marginBottom: 4 }}>No objects found</p>
          <p style={{ fontSize: 13, color: '#9AA3AF' }}>Try a different search or filter.</p>
        </div>
      )}
    </div>
  );
}
