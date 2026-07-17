import React, { useState } from 'react';
import { Command, ChevronDown } from 'lucide-react';
import { useApp } from '../App';
import type { Role, Program } from '../../lib/types';
import { USERS } from '../../lib/data';

const ROLE_LABELS: Record<Role, string> = {
  'content-developer': 'Content Dev',
  'object-reviewer': 'Obj Reviewer',
  'course-reviewer': 'Course Reviewer',
  'administrator': 'Administrator',
  'coach': 'Coach',
  'student': 'Student',
};

const ALL_ROLES: Role[] = [
  'content-developer', 'object-reviewer', 'course-reviewer',
  'administrator', 'coach', 'student',
];

const PROGRAMS: { id: Program; label: string }[] = [
  { id: 'bridge', label: 'Bridge' },
  { id: 'brain-bee', label: 'Brain Bee' },
  { id: 'mind-ai', label: 'MindAI' },
];

const SCREEN_TITLES: Record<string, { title: string; sub: string }> = {
  'cd-home': { title: 'Home', sub: 'Content Developer workspace' },
  'cd-create': { title: 'Create', sub: 'New learning object' },
  'cd-sources': { title: 'Sources', sub: 'Source library' },
  'cd-library': { title: 'Object Library', sub: 'Bridge program' },
  'cd-submissions': { title: 'My Submissions', sub: 'Review history' },
  'cd-versions': { title: 'Versions & Publishing', sub: 'Version timeline' },
  'cd-analytics': { title: 'Author Analytics', sub: 'Usage & performance' },
  'or-reviews': { title: 'Object Reviews', sub: 'Review queue' },
  'cr-reviews': { title: 'Course Reviews', sub: 'Review queue' },
  'admin-overview': { title: 'Program Overview', sub: 'Bridge configuration' },
  'admin-people': { title: 'People & Roles', sub: 'Permissions & assignments' },
  'admin-courses': { title: 'Courses & Assignments', sub: 'Learner management' },
  'admin-publishing': { title: 'Publishing & Governance', sub: "What's live" },
  'coach': { title: 'Coach', sub: 'Learner roster' },
  'student-dashboard': { title: 'Today', sub: '' },
  'student-courses': { title: 'My Courses', sub: 'Bridge program' },
};

function GlassPill({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all hover:bg-white/70"
      style={{
        background: 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.7)',
        fontSize: 12.5,
        fontWeight: 500,
        color: '#0B1220',
      }}
    >
      {children}
    </button>
  );
}

export function TopBar() {
  const { role, program, currentScreen, setRole, setProgram } = useApp();
  const [showRoles, setShowRoles] = useState(false);
  const [showPrograms, setShowPrograms] = useState(false);

  const info = SCREEN_TITLES[currentScreen] ?? { title: currentScreen, sub: '' };

  return (
    <header
      className="h-14 flex items-center px-5 gap-3 shrink-0 relative z-10"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.45)' }}
    >
      <div className="flex-1 min-w-0">
        <span style={{ fontSize: 15, fontWeight: 650, color: '#0B1220', letterSpacing: '-0.2px' }}>{info.title}</span>
        {info.sub && (
          <span style={{ fontSize: 12.5, color: '#9AA3AF', marginLeft: 8 }}>{info.sub}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Program switcher */}
        <div className="relative">
          <GlassPill onClick={() => { setShowPrograms(v => !v); setShowRoles(false); }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            {PROGRAMS.find(p => p.id === program)?.label}
            <ChevronDown size={11} className="text-[#9AA3AF]" />
          </GlassPill>
          {showPrograms && (
            <div
              className="absolute right-0 top-full mt-1.5 rounded-2xl overflow-hidden z-50 min-w-[140px] py-1"
              style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 8px 32px -8px rgba(30,50,80,0.18)' }}
            >
              {PROGRAMS.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setProgram(p.id); setShowPrograms(false); }}
                  className="w-full text-left px-4 py-2 transition-colors hover:bg-black/5"
                  style={{ fontSize: 13, fontWeight: program === p.id ? 600 : 400, color: '#0B1220' }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Role switcher */}
        <div className="relative">
          <GlassPill onClick={() => { setShowRoles(v => !v); setShowPrograms(false); }}>
            {ROLE_LABELS[role]}
            <ChevronDown size={11} className="text-[#9AA3AF]" />
          </GlassPill>
          {showRoles && (
            <div
              className="absolute right-0 top-full mt-1.5 rounded-2xl overflow-hidden z-50 min-w-[180px] py-1"
              style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 8px 32px -8px rgba(30,50,80,0.18)' }}
            >
              {ALL_ROLES.map(r => {
                const u = USERS.find(u => u.role === r);
                return (
                  <button
                    key={r}
                    onClick={() => { setRole(r); setShowRoles(false); }}
                    className="w-full flex items-center gap-2.5 text-left px-4 py-2 transition-colors hover:bg-black/5"
                    style={{ fontSize: 13, color: '#0B1220' }}
                  >
                    <div className="w-6 h-6 rounded-full bg-[#0B0F1A] text-white flex items-center justify-center shrink-0" style={{ fontSize: 9, fontWeight: 700 }}>
                      {u?.initials}
                    </div>
                    <div>
                      <div style={{ fontWeight: role === r ? 600 : 400 }}>{u?.name}</div>
                      <div style={{ fontSize: 11, color: '#9AA3AF' }}>{ROLE_LABELS[r]}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ⌘K button */}
        <button
          className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-white/70"
          style={{ background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.7)' }}
          title="Command palette (⌘K)"
        >
          <Command size={14} className="text-[#6B7280]" />
        </button>
      </div>
    </header>
  );
}
