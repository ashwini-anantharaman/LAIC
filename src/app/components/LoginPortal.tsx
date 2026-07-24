import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useApp } from '../App';
import { DEMO_ACCOUNTS, authenticateDemo } from '../../lib/demoAuth';
import {
  authenticatePolicyDemo,
  listPolicyDemoAccounts,
} from '../../lib/roleAccess';

export function LoginPortal() {
  const { login } = useApp();
  const [email, setEmail] = useState('1@gmail.com');
  const [password, setPassword] = useState('123456');
  const [error, setError] = useState<string | null>(null);

  const customRoleAccounts = listPolicyDemoAccounts({ customOnly: true });

  const signInWithForm = () => {
    setError(null);
    const policyHit = authenticatePolicyDemo(email, password);
    if (policyHit) {
      login(policyHit.userId);
      return;
    }
    const userId = authenticateDemo(email, password);
    if (!userId) {
      setError('Invalid email or password. Use one of the demo accounts listed below.');
      return;
    }
    login(userId);
  };

  const fillAccount = (accountEmail: string, accountPassword: string) => {
    setEmail(accountEmail);
    setPassword(accountPassword);
    setError(null);
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
            Sign in with a role account. Custom roles only unlock the capabilities you granted.
          </p>
        </div>

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

        {error && (
          <p style={{ fontSize: 12, color: '#B91C1C', marginBottom: 10, lineHeight: 1.4 }}>{error}</p>
        )}

        <button
          type="button"
          onClick={signInWithForm}
          className="w-full py-3 rounded-full text-white transition-all hover:opacity-90 active:scale-[0.98] mb-5"
          style={{ background: '#0B0F1A', fontSize: 14, fontWeight: 600 }}
        >
          Sign in
        </button>

        {customRoleAccounts.length > 0 && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.08)' }} />
              <span style={{ fontSize: 11.5, color: '#9AA3AF', fontWeight: 500 }}>Your custom roles</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.08)' }} />
            </div>
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto mb-4">
              {customRoleAccounts.map((account) => (
                <button
                  key={account.userId}
                  type="button"
                  onClick={() => fillAccount(account.email, account.password)}
                  className="w-full text-left px-3.5 py-2.5 rounded-2xl transition-all hover:bg-white/60"
                  style={{
                    background: 'rgba(5,150,105,0.08)',
                    border: '1px solid rgba(5,150,105,0.22)',
                  }}
                >
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220' }}>{account.label}</p>
                  <p style={{ fontSize: 11.5, color: '#6B7280', marginTop: 2 }}>
                    {account.email} · {account.password}
                  </p>
                  <p style={{ fontSize: 11, color: '#047857', marginTop: 3 }}>
                    {account.capabilityIds.length} capacit{account.capabilityIds.length === 1 ? 'y' : 'ies'} · fake login
                  </p>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.08)' }} />
          <span style={{ fontSize: 11.5, color: '#9AA3AF', fontWeight: 500 }}>Built-in demo accounts</span>
          <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.08)' }} />
        </div>

        <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.userId}
              type="button"
              onClick={() => fillAccount(account.email, account.password)}
              className="w-full text-left px-3.5 py-2.5 rounded-2xl transition-all hover:bg-white/60"
              style={{
                background: 'rgba(255,255,255,0.45)',
                border: '1px solid rgba(255,255,255,0.65)',
              }}
            >
              <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220' }}>{account.label}</p>
              <p style={{ fontSize: 11.5, color: '#6B7280', marginTop: 2 }}>
                {account.email} · {account.password}
              </p>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
