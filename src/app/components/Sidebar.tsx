import React from 'react';
import {
  Home, PlusSquare, Database, BookOpen, SendHorizontal,
  GitBranch, BarChart2, ClipboardCheck, GraduationCap,
  Users, BookMarked, Shield, UserCheck, ChevronRight, LogOut,
} from 'lucide-react';
import { useApp } from '../App';
import { USERS } from '../../lib/data';
import type { Role } from '../../lib/types';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const NAV: Record<Role, NavItem[]> = {
  'content-developer': [
    { id: 'cd-home', label: 'Home', icon: <Home size={16} /> },
    { id: 'cd-create', label: 'Create', icon: <PlusSquare size={16} /> },
    { id: 'cd-sources', label: 'Sources', icon: <Database size={16} /> },
    { id: 'cd-library', label: 'Object Library', icon: <BookOpen size={16} /> },
    { id: 'cd-submissions', label: 'My Submissions', icon: <SendHorizontal size={16} /> },
    { id: 'cd-versions', label: 'Versions & Publishing', icon: <GitBranch size={16} /> },
    { id: 'cd-analytics', label: 'Author Analytics', icon: <BarChart2 size={16} /> },
  ],
  'object-reviewer': [
    { id: 'or-reviews', label: 'Object Reviews', icon: <ClipboardCheck size={16} /> },
  ],
  'course-reviewer': [
    { id: 'cr-reviews', label: 'Course Reviews', icon: <ClipboardCheck size={16} /> },
  ],
  'administrator': [
    { id: 'admin-overview', label: 'Program Overview', icon: <Shield size={16} /> },
    { id: 'admin-people', label: 'People & Roles', icon: <Users size={16} /> },
    { id: 'admin-courses', label: 'Courses & Assignments', icon: <BookMarked size={16} /> },
    { id: 'admin-publishing', label: 'Publishing & Governance', icon: <GitBranch size={16} /> },
  ],
  'coach': [
    { id: 'coach', label: 'Coach', icon: <UserCheck size={16} /> },
  ],
  'student': [
    { id: 'student-dashboard', label: 'Today', icon: <Home size={16} /> },
    { id: 'student-courses', label: 'My Courses', icon: <GraduationCap size={16} /> },
  ],
};

const PROGRAM_LABELS: Record<string, string> = {
  bridge: 'Bridge',
  'brain-bee': 'Brain Bee',
  'mind-ai': 'MindAI',
};

const PROGRAM_COLORS: Record<string, string> = {
  bridge: 'bg-emerald-100 text-emerald-800',
  'brain-bee': 'bg-sky-100 text-sky-800',
  'mind-ai': 'bg-violet-100 text-violet-800',
};

export function Sidebar() {
  const { role, program, currentScreen, navigate, logout, activeUserId } = useApp();
  const items = NAV[role] ?? [];
  const user = USERS.find(u => u.id === activeUserId);

  return (
    <aside
      className="flex flex-col w-56 min-h-screen shrink-0"
      style={{
        background: 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRight: '1px solid rgba(255,255,255,0.6)',
      }}
    >
      {/* Wordmark + program chip */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0"
            style={{ background: '#0B0F1A' }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '-0.5px' }}>LA</span>
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0B1220', letterSpacing: '-0.3px' }}>
            Life in AI Center
          </span>
        </div>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide ${PROGRAM_COLORS[program] || 'bg-slate-100 text-slate-700'}`}>
          {PROGRAM_LABELS[program] || program}
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {items.map(item => {
          const active = currentScreen === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all ${
                active
                  ? 'bg-white shadow-[0_2px_8px_-2px_rgba(30,50,80,0.15)] text-[#0B1220]'
                  : 'text-[#6B7280] hover:bg-white/60 hover:text-[#0B1220]'
              }`}
              style={{ fontSize: 13.5, fontWeight: active ? 600 : 450 }}
            >
              <span className={active ? 'text-[#0B1220]' : 'text-[#9AA3AF]'}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* User chip + logout */}
      <div className="px-3 pb-5 pt-2 border-t border-white/40">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/60">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0"
            style={{ background: '#0B0F1A', fontSize: 11, fontWeight: 700 }}
          >
            {user?.initials ?? '??'}
          </div>
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 12.5, fontWeight: 600, color: '#0B1220' }} className="truncate">{user?.name ?? 'User'}</p>
            <p style={{ fontSize: 11, color: '#9AA3AF' }} className="truncate capitalize">{role.replace(/-/g, ' ')}</p>
          </div>
          <button
            onClick={logout}
            className="text-[#9AA3AF] hover:text-[#0B1220] transition-colors shrink-0"
            title="Log out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
