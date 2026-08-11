import React, { useEffect, useMemo, useState } from 'react';
import { Eye, GitBranch, Lock, LockOpen, Trash2, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { LearningObject, Version } from '../../../lib/types';
import { useApp } from '../../App';
import { StatusPill } from './StatusPill';
import { useConfirm } from '../ConfirmDialog';

export function ObjectVersionsModal({
  object,
  onClose,
}: {
  object: LearningObject;
  onClose: () => void;
}) {
  const {
    activeUserId,
    objectVersionsTick,
    listObjectVersions,
    saveObjectAsNewVersion,
    lockObjectVersion,
    deleteObjectVersion,
    openReaderVersion,
  } = useApp();
  const confirm = useConfirm();
  const [notes, setNotes] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Opening this modal used to commit a version whenever the working copy had
  // drifted from the tip — so looking at the history changed it. Versions are
  // now created only by an explicit act: Submit as…, or Save as new version
  // below.

  const versions = useMemo(
    () => (typeof listObjectVersions === 'function' ? (listObjectVersions(object.id) || []) : []),
    [object.id, objectVersionsTick, listObjectVersions],
  );

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1800);
  };

  const onSaveNew = () => {
    setError(null);
    const v = saveObjectAsNewVersion(object.id, notes.trim() || undefined);
    if (!v) {
      setError('Could not save a new version.');
      return;
    }
    setNotes('');
    flash(`Saved v${v.versionNumber}`);
  };

  const onToggleLock = (v: Version) => {
    setError(null);
    const next = lockObjectVersion(v.id, !v.locked);
    if (!next) {
      setError('Only versions you’ve saved can be locked (not demo catalog rows).');
      return;
    }
    flash(next.locked ? `Locked v${next.versionNumber}` : `Unlocked v${next.versionNumber}`);
  };

  const onDelete = async (v: Version) => {
    setError(null);
    const ok = await confirm({
      title: `Delete v${v.versionNumber}?`,
      description: `Remove version ${v.versionNumber} of “${object.title}”. This can’t be undone.`,
      confirmLabel: 'Delete version',
      destructive: true,
    });
    if (!ok) return;
    const result = deleteObjectVersion(v.id);
    if (!result.ok) {
      setError(result.error || 'Could not delete version.');
      return;
    }
    flash(`Deleted v${v.versionNumber}`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="presentation"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full flex flex-col overflow-hidden"
        style={{
          maxWidth: 640,
          maxHeight: 'min(720px, 90vh)',
          background: '#F7F8FA',
          borderRadius: 20,
          border: '1px solid rgba(0,0,0,0.1)',
          boxShadow: '0 28px 80px -24px rgba(15,23,42,0.45)',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Version history"
      >
        <div
          className="flex items-start gap-3 px-4 py-3.5 shrink-0"
          style={{
            background: 'linear-gradient(180deg, #FFFFFF 0%, #F3F4F6 100%)',
            borderBottom: '1px solid rgba(0,0,0,0.08)',
          }}
        >
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 14, fontWeight: 750, color: '#0B1220' }}>Versions</p>
            <p className="truncate" style={{ fontSize: 12.5, color: '#6B7280', marginTop: 2 }}>
              {object.title}
              <span style={{ color: '#9AA3AF' }}> · {object.type}</span>
            </p>
            <p style={{ fontSize: 11.5, color: '#9AA3AF', marginTop: 4 }}>
              v1 is the original. Editing never adds a version on its own — use Submit as… or Save version.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5" aria-label="Close">
            <X size={16} style={{ color: '#6B7280' }} />
          </button>
        </div>

        <div className="px-4 py-3 shrink-0" style={{ background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 12, fontWeight: 650, color: '#374151', marginBottom: 8 }}>Save as new version</p>
          <div className="flex gap-2">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note (e.g. Added quiz section)"
              className="flex-1 min-w-0 rounded-xl px-3 py-2"
              style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', background: '#F9FAFB', outline: 'none' }}
              onKeyDown={(e) => { if (e.key === 'Enter') onSaveNew(); }}
            />
            <button
              type="button"
              onClick={onSaveNew}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-white shrink-0"
              style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 600 }}
            >
              <GitBranch size={13} /> Save version
            </button>
          </div>
          {error && <p style={{ fontSize: 12, color: '#DC2626', marginTop: 8 }}>{error}</p>}
          {toast && <p style={{ fontSize: 12, color: '#059669', marginTop: 8 }}>{toast}</p>}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2">
          {versions.length === 0 ? (
            <p className="text-center py-10" style={{ fontSize: 13, color: '#9AA3AF' }}>No versions yet.</p>
          ) : versions.map((v) => (
            <div
              key={v.id}
              className="rounded-2xl px-3.5 py-3 flex flex-wrap items-start gap-3"
              style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)' }}
            >
              <div className="flex-1 min-w-[160px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0B1220' }}>v{v.versionNumber}</span>
                  {v.isLive && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: 'rgba(5,150,105,0.12)', color: '#059669' }}>
                      LIVE
                    </span>
                  )}
                  {v.locked && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: 'rgba(217,119,6,0.12)', color: '#B45309' }}>
                      <Lock size={9} /> LOCKED
                    </span>
                  )}
                  {!!v.editCount && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                      style={{ background: 'rgba(180,83,9,0.1)', color: '#B45309' }}
                      title={`Resubmitted onto this version ${v.editCount} time${v.editCount === 1 ? '' : 's'}`}
                    >
                      EDITED {v.editCount}x
                    </span>
                  )}
                  <StatusPill status={v.status} />
                </div>
                <p style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                  {v.createdAt} · {v.createdBy}
                </p>
                {v.notes ? (
                  <p style={{ fontSize: 12.5, color: '#374151', marginTop: 4 }}>{v.notes}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => { onClose(); openReaderVersion(object.id, v.id); }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100"
                  title="View this version"
                  disabled={!v.snapshot && !v.id.includes('__v')}
                  style={{ opacity: v.snapshot || v.id.includes('__v') || v.id.startsWith('v') ? 1 : 0.4 }}
                >
                  <Eye size={14} style={{ color: '#6B7280' }} />
                </button>
                <button
                  type="button"
                  onClick={() => onToggleLock(v)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100"
                  title={v.locked ? 'Unlock version' : 'Lock version'}
                >
                  {v.locked
                    ? <LockOpen size={14} style={{ color: '#B45309' }} />
                    : <Lock size={14} style={{ color: '#6B7280' }} />}
                </button>
                <button
                  type="button"
                  onClick={() => void onDelete(v)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50"
                  title="Delete version"
                >
                  <Trash2 size={14} style={{ color: '#EF4444' }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
