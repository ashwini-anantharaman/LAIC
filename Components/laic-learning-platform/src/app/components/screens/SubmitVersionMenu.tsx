/**
 * Submit controls for the authoring review step.
 *
 * Submitting used to always mint a version, so an author who fixed a typo and
 * resubmitted three times ended up at v5 with four dead versions behind them.
 * This splits the act into two plain buttons: "Submit as new version" commits a
 * new one, "Submit as…" opens the existing versions so the author can overwrite
 * one instead.
 *
 * Two buttons rather than a button with an attached caret: the review toolbar
 * clips its overflow, so an inline dropdown rendered there was invisible. The
 * chooser is a fixed overlay for the same reason — it cannot be clipped by
 * whatever ancestor the caller happens to render inside.
 *
 * Locked versions are listed but not selectable — a lock is a promise that what
 * someone reviewed cannot change underneath them.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { History, Lock, Send, X } from 'lucide-react';
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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
    <>
      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => submit({})}
        title={canSubmit ? `Submit as a new version (v${nextNumber})` : disabledTitle}
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-white disabled:opacity-40"
        style={{ fontSize: 12.5, fontWeight: 650, background: '#0B0F1A' }}
      >
        <Send size={13} /> {label} as new version
      </button>
      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => setOpen(true)}
        title={canSubmit ? 'Submit onto an existing version…' : disabledTitle}
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border disabled:opacity-40"
        style={{ fontSize: 12.5, fontWeight: 650, color: '#0B1220', background: '#fff', borderColor: 'rgba(0,0,0,0.18)' }}
      >
        <History size={13} /> {label} as…
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }}
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="w-full rounded-[22px] overflow-hidden flex flex-col"
            style={{ maxWidth: 460, maxHeight: '80vh', background: '#fff', boxShadow: '0 24px 60px -20px rgba(15,23,42,0.5)' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Submit as which version"
          >
            <div
              className="flex items-center gap-2 px-4 py-3 shrink-0"
              style={{ borderBottom: '1px solid rgba(0,0,0,0.07)' }}
            >
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 14, fontWeight: 700, color: '#0B1220' }}>Submit as</p>
                <p style={{ fontSize: 12, color: '#6B7280' }}>
                  Add a new version, or replace one you already have.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5"
                aria-label="Close"
              >
                <X size={15} style={{ color: '#6B7280' }} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              <button
                type="button"
                onClick={() => submit({})}
                className="w-full text-left rounded-xl px-3.5 py-3 border"
                style={{ borderColor: 'rgba(11,15,26,0.18)', background: 'rgba(11,15,26,0.03)' }}
              >
                <p style={{ fontSize: 13, fontWeight: 700, color: '#0B1220' }}>
                  New version (v{nextNumber})
                </p>
                <p style={{ fontSize: 11.5, color: '#6B7280', marginTop: 2 }}>
                  Keeps every earlier version as it is.
                </p>
              </button>

              {ordered.length > 0 && (
                <p
                  className="px-1 pt-2"
                  style={{ fontSize: 10.5, fontWeight: 700, color: '#9AA3AF', letterSpacing: '.05em', textTransform: 'uppercase' }}
                >
                  Replace existing
                </p>
              )}
              {ordered.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  disabled={!!v.locked}
                  onClick={() => submit({ versionId: v.id, versionNumber: v.versionNumber })}
                  className="w-full text-left rounded-xl px-3.5 py-2.5 border hover:bg-gray-50 disabled:opacity-45 disabled:hover:bg-transparent"
                  style={{ borderColor: 'rgba(0,0,0,0.09)' }}
                  title={v.locked ? `v${v.versionNumber} is locked` : `Overwrite v${v.versionNumber}`}
                >
                  <span className="flex items-center gap-1.5">
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0B1220' }}>
                      v{v.versionNumber}
                    </span>
                    {v.locked && <Lock size={11} style={{ color: '#9AA3AF' }} />}
                    {v.isLive && (
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: '#047857' }}>LIVE</span>
                    )}
                    <span style={{ fontSize: 11, color: '#9AA3AF' }}>· {v.createdAt}</span>
                  </span>
                  <span className="block truncate" style={{ fontSize: 11.5, color: '#6B7280', marginTop: 2 }}>
                    {v.locked ? 'Locked — cannot be replaced' : (v.notes || 'No note')}
                  </span>
                </button>
              ))}

              {!ordered.length && (
                <p className="px-1 py-2" style={{ fontSize: 12, color: '#9AA3AF' }}>
                  No saved versions yet — this submit will create v1.
                </p>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
