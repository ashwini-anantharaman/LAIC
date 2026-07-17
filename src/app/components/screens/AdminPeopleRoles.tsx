import React, { useState } from 'react';
import { Shield, Users, Lock, Plus, BookOpen, Puzzle, Award, BarChart2, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PEOPLE } from '../../../lib/data';
import type { Role } from '../../../lib/types';

/* ─── permission catalogue ────────────────────────────────────── */

interface Permission { id: string; label: string; group: string; }

const PERMISSIONS: Permission[] = [
  // Authoring & sources
  { id: 'create_objects',   label: 'Create learning objects',                  group: 'Authoring & sources' },
  { id: 'edit_objects',     label: 'Edit & regenerate objects',                group: 'Authoring & sources' },
  { id: 'delete_objects',   label: 'Delete objects',                           group: 'Authoring & sources' },
  { id: 'markup_extract',   label: 'Mark up sources & extract content',        group: 'Authoring & sources' },
  { id: 'manage_sources',   label: 'Create & manage source pools',             group: 'Authoring & sources' },
  { id: 'use_tools',        label: 'Use tools & utilities',                    group: 'Authoring & sources' },
  // Courses
  { id: 'create_courses',   label: 'Create & build courses',                   group: 'Courses' },
  { id: 'edit_courses',     label: 'Edit courses',                             group: 'Courses' },
  { id: 'reuse_library',    label: 'Reuse library objects in courses',         group: 'Courses' },
  { id: 'submit_review',    label: 'Submit work for review',                   group: 'Courses' },
  // Review & feedback
  { id: 'comment',          label: 'Comment on blocks (leave feedback)',       group: 'Review & feedback' },
  { id: 'review_objects',   label: 'Approve / request changes — objects',      group: 'Review & feedback' },
  { id: 'review_courses',   label: 'Approve / request changes — courses',      group: 'Review & feedback' },
  { id: 'resolve_comments', label: 'Resolve feedback threads',                 group: 'Review & feedback' },
  // Publishing & governance
  { id: 'publish',          label: 'Publish & set audience',                   group: 'Publishing & governance' },
  { id: 'manage_versions',  label: 'Manage versions',                          group: 'Publishing & governance' },
  { id: 'scope_program',    label: 'Promote content to program scope',         group: 'Publishing & governance' },
  { id: 'scope_org',        label: 'Promote content to organization scope',    group: 'Publishing & governance' },
  // Teaching
  { id: 'assign_courses',   label: 'Assign courses to learners',               group: 'Teaching' },
  { id: 'cohort_settings',  label: 'Set cohort interaction settings',          group: 'Teaching' },
  { id: 'preview_learner',  label: 'Use the learner experience',               group: 'Teaching' },
  // Repository & administration
  { id: 'repo_read',        label: 'Browse the object repository',             group: 'Repository & administration' },
  { id: 'repo_write',       label: 'Organize repository folders',              group: 'Repository & administration' },
  { id: 'manage_people',    label: 'Manage people & roles',                    group: 'Repository & administration' },
];

const PERM_GROUPS = ['Authoring & sources', 'Courses', 'Review & feedback', 'Publishing & governance', 'Teaching', 'Repository & administration'];

const OBJ_TYPES = ['lesson', 'tutorial', 'quiz', 'flashcard set', 'concept card', 'summary', 'reflection', 'scenario', 'assignment', 'drill'];

/* ─── shipped role presets ───────────────────────────────────── */

interface RecommendedRole { id: string; name: string; blurb: string; permissions: string[]; }

const RECOMMENDED_ROLES: RecommendedRole[] = [
  {
    id: 'content-developer', name: 'Content Developer', blurb: 'Creates, edits, and submits learning objects and courses.',
    permissions: ['create_objects','edit_objects','delete_objects','markup_extract','manage_sources','use_tools','create_courses','edit_courses','reuse_library','submit_review','comment','repo_read','preview_learner'],
  },
  {
    id: 'object-reviewer', name: 'Object Reviewer', blurb: 'Reviews and approves individual learning objects.',
    permissions: ['review_objects','comment','resolve_comments','repo_read'],
  },
  {
    id: 'course-reviewer', name: 'Course Reviewer', blurb: 'Reviews and approves assembled courses before admin sign-off.',
    permissions: ['review_courses','comment','resolve_comments','repo_read'],
  },
  {
    id: 'administrator', name: 'Administrator', blurb: 'Manages publishing, audience, people, and governance.',
    permissions: ['publish','manage_versions','scope_program','scope_org','manage_people','review_objects','review_courses','resolve_comments','repo_read','repo_write'],
  },
  {
    id: 'coach', name: 'Coach', blurb: 'Assigns courses to students, monitors progress, sends feedback.',
    permissions: ['assign_courses','cohort_settings','preview_learner','comment'],
  },
  {
    id: 'student', name: 'Student', blurb: 'Goes through assigned courses in the learner experience.',
    permissions: ['preview_learner'],
  },
];

/* ─── mock custom roles ──────────────────────────────────────── */

interface CustomRole { id: string; name: string; desc: string; permissions: string[]; restrictedTypes?: string[]; }

const INITIAL_CUSTOM: CustomRole[] = [
  { id: 'drill-dev', name: 'Drill Developer', desc: 'Create drills only — read everything else.', permissions: ['create_objects','edit_objects','markup_extract','use_tools','repo_read'], restrictedTypes: ['drill'] },
  { id: 'tester', name: 'Tester', desc: 'Play and comment, read-only otherwise.', permissions: ['preview_learner','comment','repo_read'], restrictedTypes: [] },
];

const ROLE_LABELS: Record<Role, string> = {
  'content-developer': 'Content Dev', 'object-reviewer': 'Obj Reviewer',
  'course-reviewer': 'Course Reviewer', 'administrator': 'Administrator',
  'coach': 'Coach', 'student': 'Student',
};

/* ─── role editor modal ──────────────────────────────────────── */

function RoleEditorModal({ initial, onSave, onClose }: {
  initial: { name: string; desc: string; permissions: string[]; restrictedTypes?: string[] } | null;
  onSave: (role: CustomRole) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [desc, setDesc] = useState(initial?.desc || '');
  const [perms, setPerms] = useState<Set<string>>(new Set(initial?.permissions || []));
  const [restricted, setRestricted] = useState<string[]>(initial?.restrictedTypes || []);

  const toggle = (id: string) => setPerms(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleType = (t: string) => setRestricted(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  const hasCreate = perms.has('create_objects');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(11,18,32,0.5)', backdropFilter: 'blur(4px)' }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl rounded-[28px] overflow-hidden flex flex-col"
        style={{ background: 'white', boxShadow: '0 24px 64px -16px rgba(30,50,80,0.3)', maxHeight: '90vh' }}>
        {/* Header */}
        <div className="p-5 border-b flex items-start justify-between" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0B1220' }}>{initial?.name ? `Edit "${initial.name}"` : 'New role'}</h3>
            <p style={{ fontSize: 12.5, color: '#9AA3AF', marginTop: 2 }}>A role is just a name plus the exact set of things it can access. Grant any combination.</p>
          </div>
          <button onClick={onClose}><X size={16} style={{ color: '#9AA3AF' }} /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Role name</p>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Drill Developer"
                className="w-full rounded-xl px-3 py-2" style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }} />
            </div>
            <div>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Description</p>
              <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What this role is for"
                className="w-full rounded-xl px-3 py-2" style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }} />
            </div>
          </div>

          {PERM_GROUPS.map(group => {
            const groupPerms = PERMISSIONS.filter(p => p.group === group);
            return (
              <div key={group}>
                <p style={{ fontSize: 11.5, fontWeight: 700, color: '#9AA3AF', letterSpacing: '.05em', marginBottom: 8, textTransform: 'uppercase' }}>{group}</p>
                <div className="flex flex-wrap gap-2">
                  {groupPerms.map(p => {
                    const on = perms.has(p.id);
                    return (
                      <button key={p.id} onClick={() => toggle(p.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all"
                        style={{ background: on ? 'rgba(5,150,105,0.08)' : 'rgba(0,0,0,0.03)', borderColor: on ? 'rgba(5,150,105,0.4)' : 'rgba(0,0,0,0.08)', color: on ? '#059669' : '#6B7280', fontSize: 12.5, fontWeight: on ? 600 : 400 }}>
                        {on && <Check size={11} />}
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                {/* Object type restriction — only under Authoring & sources, only when create_objects is on */}
                {group === 'Authoring & sources' && hasCreate && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                    className="mt-3 p-3 rounded-2xl" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}>
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: '#92400E', marginBottom: 7 }}>
                      Which object types can this role create? — leave empty for all
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {OBJ_TYPES.map(t => {
                        const on = restricted.includes(t);
                        return (
                          <button key={t} onClick={() => toggleType(t)}
                            className="px-2.5 py-1 rounded-full border transition-all capitalize"
                            style={{ background: on ? 'rgba(217,119,6,0.15)' : 'rgba(255,255,255,0.7)', borderColor: on ? '#D97706' : 'rgba(0,0,0,0.1)', color: on ? '#92400E' : '#6B7280', fontSize: 12 }}>
                            {t}
                          </button>
                        );
                      })}
                    </div>
                    {restricted.length > 0 && (
                      <p style={{ fontSize: 11.5, color: '#9AA3AF', marginTop: 6 }}>
                        ⌗ Can create: {restricted.join(', ')}
                      </p>
                    )}
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-full" style={{ background: 'rgba(0,0,0,0.05)', fontSize: 13, fontWeight: 600, color: '#374151' }}>Cancel</button>
          <button
            onClick={() => { if (!name) return; onSave({ id: `custom-${Date.now()}`, name, desc, permissions: [...perms], restrictedTypes: restricted }); onClose(); }}
            disabled={!name}
            className="flex-1 py-2.5 rounded-full text-white"
            style={{ background: name ? '#0B0F1A' : '#E5E7EB', color: name ? '#fff' : '#9AA3AF', fontSize: 13, fontWeight: 600 }}>
            ✓ Save role · {perms.size} permission{perms.size !== 1 ? 's' : ''}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── main component ──────────────────────────────────────────── */

export function AdminPeopleRoles() {
  const [customRoles, setCustomRoles] = useState<CustomRole[]>(INITIAL_CUSTOM);
  const [editorState, setEditorState] = useState<{ open: boolean; initial: CustomRole | null }>({ open: false, initial: null });
  const [toast, setToast] = useState('');

  const fireToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2400); };

  const openNew = () => setEditorState({ open: true, initial: null });
  const openDuplicate = (r: RecommendedRole) => {
    setEditorState({ open: true, initial: { id: '', name: `${r.name} (custom)`, desc: `Based on ${r.name}`, permissions: r.permissions, restrictedTypes: [] } });
  };
  const openEdit = (c: CustomRole) => setEditorState({ open: true, initial: c });
  const deleteCustom = (id: string) => { setCustomRoles(prev => prev.filter(r => r.id !== id)); fireToast('Role deleted'); };
  const saveRole = (role: CustomRole) => {
    setCustomRoles(prev => {
      const existing = prev.find(r => r.id === role.id);
      if (existing) return prev.map(r => r.id === role.id ? role : r);
      return [...prev, { ...role, id: `custom-${Date.now()}` }];
    });
    fireToast('Role saved');
  };

  const ENABLED_TYPES = ['lesson', 'tutorial', 'quiz', 'flashcard set', 'concept card', 'summary', 'reflection', 'scenario', 'assignment', 'drill'];
  const SPEC_BLOCKS = ['Bridge Play', 'Bidding Sequence'];

  const rolePermChips = (perms: string[]) => {
    const labels = PERMISSIONS.filter(p => perms.includes(p.id)).map(p => p.label);
    const show = labels.slice(0, 5);
    const more = labels.length - show.length;
    return { show, more };
  };

  return (
    <div className="px-6 py-6 w-full space-y-8">

      {/* ── Section 1: Instance configuration ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="p-5 rounded-[24px]" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl" style={{ background: '#F3F4F6' }}>🃏</div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#0B1220' }}>Bridge — LAIC Instance</p>
              <p style={{ fontSize: 12.5, color: '#9AA3AF' }}>How this instance is configured — the platform reads this to decide what's available here.</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: '#F3F4F6', color: '#374151' }}>
            Sport configuration
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3.5 rounded-2xl" style={{ background: 'rgba(0,0,0,0.025)' }}>
            <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 7 }}>OBJECT TYPES ENABLED ({ENABLED_TYPES.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {ENABLED_TYPES.map(t => (
                <span key={t} className="px-2 py-0.5 rounded-full text-xs capitalize" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>{t}</span>
              ))}
            </div>
          </div>
          <div className="p-3.5 rounded-2xl" style={{ background: 'rgba(0,0,0,0.025)' }}>
            <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 7 }}>SPECIALIZED BLOCKS ({SPEC_BLOCKS.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {SPEC_BLOCKS.map(b => (
                <span key={b} className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(217,119,6,0.1)', color: '#92400E' }}>{b}</span>
              ))}
            </div>
          </div>
          <div className="p-3.5 rounded-2xl" style={{ background: 'rgba(0,0,0,0.025)' }}>
            <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 7 }}>DECLARED ROLES ({RECOMMENDED_ROLES.length + customRoles.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {[...RECOMMENDED_ROLES.map(r => r.name), ...customRoles.map(r => r.name)].map(n => (
                <span key={n} className="px-2 py-0.5 rounded-full text-xs" style={{ background: '#F3F4F6', color: '#374151' }}>{n}</span>
              ))}
            </div>
          </div>
          <div className="p-3.5 rounded-2xl" style={{ background: 'rgba(0,0,0,0.025)' }}>
            <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 7 }}>METERING</p>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0B1220' }}>13 of 100 objects used</p>
            <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-xs" style={{ background: '#F0FDF4', color: '#15803D' }}>Purchase more available</span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4 pt-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <Lock size={12} style={{ color: '#9AA3AF' }} />
          <p style={{ fontSize: 12, color: '#9AA3AF' }}>Content created here is isolated to this instance. Provisioning is managed upstream; this view shows what the platform received.</p>
        </div>
      </motion.div>

      {/* ── Section 2: Roles & access ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield size={15} style={{ color: '#374151' }} />
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0B1220' }}>Roles & access</h2>
          </div>
          <button onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white"
            style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 600 }}>
            <Plus size={12} />New role
          </button>
        </div>
        <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 14 }}>
          A role is a name plus the exact set of things it can access. Recommended roles are a sensible starting point; build your own by granting any combination — e.g. a "Drill Developer" who can only create drills, or a "Tester" who can just play and comment.
        </p>

        {/* Recommended */}
        <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', letterSpacing: '.05em', marginBottom: 10, textTransform: 'uppercase' }}>
          Recommended by LAIC · declared for this instance
        </p>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {RECOMMENDED_ROLES.map(r => {
            const { show, more } = rolePermChips(r.permissions);
            return (
              <div key={r.id} className="p-4 rounded-[22px]" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
                <div className="flex items-start gap-2 mb-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#0B0F1A' }}>
                    <Award size={14} style={{ color: 'white' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0B1220' }}>{r.name}</p>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#F3F4F6', color: '#374151' }}>LAIC</span>
                    </div>
                    <p style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5 }}>{r.blurb}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {show.map(l => (
                    <span key={l} className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(0,0,0,0.05)', color: '#374151' }}>{l}</span>
                  ))}
                  {more > 0 && <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(0,0,0,0.05)', color: '#9AA3AF' }}>+{more} more</span>}
                </div>
                <button onClick={() => openDuplicate(r)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium"
                  style={{ color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(0,0,0,0.02)' }}>
                  ⧉ Duplicate & customize
                </button>
              </div>
            );
          })}
        </div>

        {/* Custom */}
        <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', letterSpacing: '.05em', marginBottom: 10, textTransform: 'uppercase' }}>
          Custom roles in Bridge
        </p>
        {customRoles.length === 0 ? (
          <div className="p-5 rounded-[22px] text-center" style={{ background: 'rgba(255,255,255,0.55)', border: '1px dashed rgba(0,0,0,0.1)' }}>
            <p style={{ fontSize: 13, color: '#9AA3AF' }}>No custom roles yet. Duplicate a recommended role above, or create one from scratch.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {customRoles.map(r => {
              const { show, more } = rolePermChips(r.permissions);
              return (
                <div key={r.id} className="p-4 rounded-[22px]" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
                  <div className="flex items-start gap-2 mb-2">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#7C3AED' }}>
                      <Award size={14} style={{ color: 'white' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0B1220' }}>{r.name}</p>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(124,58,237,0.1)', color: '#7C3AED' }}>custom</span>
                      </div>
                      <p style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5 }}>{r.desc}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {show.map(l => <span key={l} className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(0,0,0,0.05)', color: '#374151' }}>{l}</span>)}
                    {more > 0 && <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(0,0,0,0.05)', color: '#9AA3AF' }}>+{more} more</span>}
                  </div>
                  {r.restrictedTypes && r.restrictedTypes.length > 0 && (
                    <p style={{ fontSize: 12, color: '#D97706', marginBottom: 8 }}>⌗ Can create: {r.restrictedTypes.join(', ')}</p>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(r)} className="flex items-center gap-1 px-3 py-1 rounded-full border text-xs font-medium" style={{ color: '#374151', borderColor: 'rgba(0,0,0,0.1)' }}>✎ Edit</button>
                    <button onClick={() => deleteCustom(r.id)} className="flex items-center gap-1 px-3 py-1 rounded-full border text-xs font-medium" style={{ color: '#EA580C', borderColor: 'rgba(234,88,12,0.2)' }}>🗑 Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* ── Section 3: People table ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="flex items-center gap-2 mb-3">
          <Users size={15} style={{ color: '#374151' }} />
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0B1220' }}>People</h2>
        </div>
        <div className="rounded-[22px] overflow-hidden" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                {['Person', 'Roles', 'Team', 'Active', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left" style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PEOPLE.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: i < PEOPLE.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#0B0F1A] text-white flex items-center justify-center shrink-0" style={{ fontSize: 11, fontWeight: 700 }}>{p.initials}</div>
                      <p style={{ fontSize: 13, fontWeight: 550, color: '#0B1220' }}>{p.name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: p.role === 'student' ? 'rgba(6,182,212,0.1)' : 'rgba(0,0,0,0.05)', color: p.role === 'student' ? '#0E7490' : '#374151' }}>
                      {ROLE_LABELS[p.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p style={{ fontSize: 12.5, color: '#6B7280' }}>{p.team || 'Bridge'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p style={{ fontSize: 12.5, color: '#9AA3AF' }}>today</p>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => fireToast(`Roles updated for ${p.name}`)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium"
                      style={{ color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.9)' }}>
                      ⚙ Roles
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Role editor modal */}
      {editorState.open && (
        <RoleEditorModal
          initial={editorState.initial}
          onSave={saveRole}
          onClose={() => setEditorState({ open: false, initial: null })}
        />
      )}

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full text-white z-50"
            style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px -8px rgba(0,0,0,0.3)' }}>
            ✓ {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
