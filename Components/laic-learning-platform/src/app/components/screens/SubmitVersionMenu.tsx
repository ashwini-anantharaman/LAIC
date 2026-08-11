/**
 * Submit control for the authoring review step.
 *
 * Submitting used to always mint a version, so an author who fixed a typo and
 * resubmitted three times ended up at v5 with four dead versions behind them.
 * This splits the act in two: the main button commits a NEW version, and the
 * caret opens the existing versions so the author can overwrite one instead.
 *
 * Locked versions are listed but not selectable — a lock is a promise that
 * what someone reviewed cannot change underneath them.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Lock, Send } from 'lucide-react';
import type { Version } from '../../../lib/types';

export interface SubmitTarget {
  /** Overwrite this version; absent = commit a new one. */
  versionId?: string;
  versionNumber?: number;
}

export function SubmitVersionMenu({
  versions,
  canSubmit,
  onSubmit,
  label = 'Submit',
  disabledTitle,
}: {
  versions: Version[];
  canSubmit: boolean;
  onSubmit: (target: SubmitTarget) => void;
  label?: string;
  disabledTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Oldest first so v1 sits at the top — authors think in ascending versions.
  const ordered = useMemo(
    () => [...versions].sort((a, b) => a.versionNumber - b.versionNumber),
    [versions],
  );

  const nextNumber = (versions.reduce((max, v) => Math.max(max, v.versionNumber), 0) || 0) + 1;

  const submit = (target: SubmitTarget) => {
    setOpen(false);
    onSubmit(target);
  };

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => submit({})}
        title={canSubmit ? `Submit as a new version (v${nextNumber})` : disabledTitle}
        className="inline-flex items-center gap-1.5 pl-3.5 pr-3 py-1.5 rounded-l-full text-white disabled:opacity-40"
        style={{ fontSize: 12.5, fontWeight: 650, background: '#0B0F1A' }}
      >
        <Send size={13} /> {label} as new version
      </button>
      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => setOpen((o) => !o)}
        title={canSubmit ? 'Submit as an existing version…' : disabledTitle}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center px-2 py-1.5 rounded-r-full text-white disabled:opacity-40"
        style={{
          fontSize: 12.5,
          background: '#0B0F1A',
          borderLeft: '1px solid rgba(255,255,255,0.22)',
        }}
      >
        <ChevronDown size={13} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 bottom-full mb-2 rounded-2xl overflow-hidden z-50"
          style={{
            minWidth: 248,
            background: '#fff',
            border: '1px solid rgba(0,0,0,0.1)',
            boxShadow: '0 18px 40px -18px rgba(30,50,80,0.4)',
          }}
        >
          <p
            className="px-3.5 pt-3 pb-1.5"
            style={{ fontSize: 10.5, fontWeight: 700, color: '#9AA3AF', letterSpacing: '.05em', textTransform: 'uppercase' }}
          >
            Submit as
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => submit({})}
            className="w-full text-left px-3.5 py-2 hover:bg-gray-50"
            style={{ fontSize: 12.5, fontWeight: 600, color: '#0B1220' }}
          >
            New version (v{nextNumber})
          </button>
          {ordered.length > 0 && (
            <>
              <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }} />
              <p
                className="px-3.5 pt-2.5 pb-1"
                style={{ fontSize: 10.5, fontWeight: 700, color: '#9AA3AF', letterSpacing: '.05em', textTransform: 'uppercase' }}
              >
                Replace existing
              </p>
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {ordered.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    role="menuitem"
                    disabled={!!v.locked}
                    onClick={() => submit({ versionId: v.id, versionNumber: v.versionNumber })}
                    className="w-full text-left px-3.5 py-2 hover:bg-gray-50 disabled:opacity-45 disabled:hover:bg-transparent"
                    title={v.locked ? `v${v.versionNumber} is locked` : `Overwrite v${v.versionNumber}`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span style={{ fontSize: 12.5, fontWeight: 650, color: '#0B1220' }}>
                        v{v.versionNumber}
                      </span>
                      {v.locked && <Lock size={10} style={{ color: '#9AA3AF' }} />}
                      {v.isLive && (
                        <span style={{ fontSize: 9.5, fontWeight: 700, color: '#047857' }}>LIVE</span>
                      )}
                    </span>
                    <span className="block truncate" style={{ fontSize: 11, color: '#9AA3AF' }}>
                      {v.notes || v.createdAt}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
