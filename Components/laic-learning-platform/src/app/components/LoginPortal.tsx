import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../App';
import { USERS } from '../../lib/data';
import { authenticateDemo } from '../../lib/demoAuth';
import type { Role } from '../../lib/types';

const ROLE_DISPLAY: Record<Role, string> = {
  'content-developer': 'Content Developer',
  'object-reviewer': 'Object Reviewer',
  'course-reviewer': 'Course Reviewer',
  'administrator': 'Administrator',
  'coach': 'Coach',
  'student': 'Student',
};

const FEATURED = ['demo-cd', 'sam', 'riya'];

export function LoginPortal() {
  const { login } = useApp();
  const [showAll, setShowAll] = useState(false);
  const [email, setEmail] = useState('1@gmail.com');
  const [password, setPassword] = useState('123456');
  const [error, setError] = useState<string | null>(null);

  const featured = USERS.filter(u => FEATURED.includes(u.id));
  const rest = USERS.filter(u => !FEATURED.includes(u.id));
  const displayed = showAll ? [...featured, ...rest] : featured;

  const signInWithForm = () => {
    setError(null);
    const userId = authenticateDemo(email, password);
    if (!userId) {
      setError('Invalid email or password. Use the Course Dev demo: 1@gmail.com / 123456');
      return;
    }
    login(userId);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
        style={{
          background: 'rgba(255,255,255,0.62)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          borderRadius: 28,
          border: '1px solid rgba(255,255,255,0.75)',
          boxShadow: '0 20px 60px -16px rgba(30,50,80,0.22)',
          padding: '36px 32px 32px',
        }}
      >
        {/* Wordmark */}
        <div className="mb-6">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ background: '#0B0F1A' }}>
              <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '-0.5px' }}>LA</span>
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#0B1220', letterSpacing: '-0.3px' }}>Life in AI Center</p>
              <p style={{ fontSize: 12, color: '#9AA3AF' }}>LAIC Learning Platform</p>
            </div>
          </div>
          <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5, marginTop: 8 }}>
            Authoring and delivery for the Bridge program.
          </p>
        </div>

        {/* Email + password */}
        <div className="space-y-2.5 mb-2">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') signInWithForm(); }}
            className="w-full px-4 py-2.5 rounded-2xl outline-none transition-all"
            style={{
              background: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(0,0,0,0.08)',
              fontSize: 13.5,
              color: '#0B1220',
            }}
            autoComplete="username"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') signInWithForm(); }}
            className="w-full px-4 py-2.5 rounded-2xl outline-none transition-all"
            style={{
              background: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(0,0,0,0.08)',
              fontSize: 13.5,
              color: '#0B1220',
            }}
            autoComplete="current-password"
          />
        </div>
        <p style={{ fontSize: 11.5, color: '#9AA3AF', marginBottom: 10, lineHeight: 1.45 }}>
          Course-dev demo: <span style={{ color: '#6B7280', fontWeight: 600 }}>1@gmail.com</span> / <span style={{ color: '#6B7280', fontWeight: 600 }}>123456</span>
          {' '}· your objects are saved to this account
        </p>
        {error && (
          <p style={{ fontSize: 12, color: '#B91C1C', marginBottom: 10, lineHeight: 1.4 }}>{error}</p>
        )}

        <button
          type="button"
          onClick={signInWithForm}
          className="w-full py-3 rounded-full text-white transition-all hover:opacity-90 active:scale-[0.98] mb-6"
          style={{ background: '#0B0F1A', fontSize: 14, fontWeight: 600 }}
        >
          Sign in
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.08)' }} />
          <span style={{ fontSize: 11.5, color: '#9AA3AF', fontWeight: 500 }}>Or pick a demo persona</span>
          <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.08)' }} />
        </div>

        {/* Persona rows */}
        <div className="space-y-1.5">
          {displayed.map(user => (
            <motion.button
              key={user.id}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => login(user.id)}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left transition-all hover:bg-white/60"
              style={{
                background: 'rgba(255,255,255,0.45)',
                border: '1px solid rgba(255,255,255,0.65)',
              }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0"
                style={{ background: '#0B0F1A', fontSize: 11, fontWeight: 700 }}
              >
                {user.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220' }}>{user.name}</p>
                <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>
                  Bridge · {ROLE_DISPLAY[user.role]}
                  {user.id === 'demo-cd' ? ' · saved library' : ''}
                </p>
              </div>
              <ChevronRight size={14} className="text-[#C4CBD4] shrink-0" />
            </motion.button>
          ))}

          {!showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-2 text-center transition-colors hover:text-[#0B1220]"
              style={{ fontSize: 12.5, color: '#9AA3AF', fontWeight: 500 }}
            >
              All roles ↓
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
