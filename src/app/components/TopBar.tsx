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

const PROGRAMS: { id: Program; label: string }[] = [
  { id: 'bridge', label: 'Bridge' },
  { id: 'brain-bee', label: 'Brain Bee' },
  { id: 'mind-ai', label: 'MindAI' },
];

const SCREEN_TITLES: Record<string, { title: string; sub: string }> = {
  'cd-home': { title: 'Home', sub: 'Content Developer workspace' },
  'cd-create': { title: 'Create', sub: 'New learning object' },
  'cd-templates': { title: 'Template Library', sub: 'Recommended & custom templates' },
  'cd-sources': { title: 'Sources', sub: 'Source library' },
  'cd-library': { title: 'Object Library', sub: 'Bridge program' },
  'cd-submissions': { title: 'My Submissions', sub: 'Review history' },
  'cd-versions': { title: 'Versions & Publishing', sub: 'Version timeline' },
  'cd-analytics': { title: 'Author Analytics', sub: 'Usage & performance' },
  'or-reviews': { title: 'Object Reviews', sub: 'Review queue' },
  'cr-reviews': { title: 'Course Reviews', sub: 'Review queue' },
  'admin-overview': { title: 'Program Overview', sub: 'Bridge configuration' },
  'admin-people': { title: 'People & Roles', sub: 'Permissions & assignments' },
  'admin-access': { title: 'Access Catalogue', sub: 'Platform · what can be controlled' },
  'admin-access-manual': { title: 'Access Manual', sub: 'LAIC cross-platform access control' },
  'admin-sample-roles': { title: 'Sample Roles', sub: 'Catalogue templates & Bridge examples' },
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
  const { role, program, currentScreen, setProgram, activeUserId, policyRoleId, policyRoleName, grantedCapabilities } = useApp();
  const [showPrograms, setShowPrograms] = useState(false);
  const user = USERS.find(u => u.id === activeUserId);

  const info = SCREEN_TITLES[currentScreen] ?? { title: currentScreen, sub: '' };
  const roleLabel = policyRoleId
    ? (policyRoleName || 'Custom role')
    : ROLE_LABELS[role];
  const roleTitle = policyRoleId
    ? `${policyRoleName || 'Custom role'} · ${grantedCapabilities.length} capabilities`
    : (user ? `${user.name} · sign out to change role` : 'Signed-in role');

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
          <GlassPill onClick={() => setShowPrograms(v => !v)}>
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

        {/* Current role only — switch roles by signing out and signing in as another account */}
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
          style={{
            background: policyRoleId ? 'rgba(5,150,105,0.12)' : 'rgba(255,255,255,0.55)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: policyRoleId ? '1px solid rgba(5,150,105,0.3)' : '1px solid rgba(255,255,255,0.7)',
            fontSize: 12.5,
            fontWeight: 500,
            color: policyRoleId ? '#047857' : '#0B1220',
            maxWidth: 220,
          }}
          title={roleTitle}
        >
          <span className="truncate">{roleLabel}</span>
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
