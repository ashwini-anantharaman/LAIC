import React, { useEffect, useMemo, useState } from 'react';
import { CloudOff, Eye, GitBranch, Loader2, Lock, LockOpen, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { LearningObject, Version } from '../../../lib/types';
import { useApp } from '../../App';
import { backToNexus, hasReturnUrl } from '../../../lib/nexus';
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
    restoreObjectVersion,
    publishObjectVersion,
    unpublishObject,
    ensureObjectInitialVersion,
    lockObjectVersion,
    deleteObjectVersion,
    openReaderVersion,
    nexusClubName,
  } = useApp();
  const confirm = useConfirm();
  const [notes, setNotes] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  // Opening this modal used to commit a version whenever the working copy had
  // drifted from the tip — looking at the history changed it. It now only
  // guarantees v1 exists: objects created before versions were tracked (or
  // never re-saved since) would otherwise show an empty history with nothing
  // to publish. This can never add a second version.
  useEffect(() => {
    if (!object || !activeUserId) return;
    ensureObjectInitialVersion(object.id);
  }, [object?.id, activeUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const versions = useMemo(
    () => (typeof listObjectVersions === 'function' ? (listObjectVersions(object.id) || []) : []),
    [object.id, objectVersionsTick, listObjectVersions],
  );

  /** The newest version — its content is the working copy until a later one exists. */
  const isTipVersion = (v: Version) =>
    versions.every((x) => x.versionNumber <= v.versionNumber);

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

  const onRestore = async (v: Version) => {
    setError(null);
    const above = versions.filter((x) => x.versionNumber > v.versionNumber);
    const discarded = above.length
      ? ` ${above.map((x) => `v${x.versionNumber}`).reverse().join(', ')} `
        + `${above.length === 1 ? 'is' : 'are'} deleted, so v${v.versionNumber} becomes the newest version.`
      : '';
    const ok = await confirm({
      title: `Restore to v${v.versionNumber}?`,
      description:
        `“${object.title}” goes back to the content saved in v${v.versionNumber}`
        + `${v.createdAt ? ` on ${v.createdAt}` : ''}.${discarded}`
        + ' Your current content is replaced and nothing new is recorded —'
        + ' submit afterwards if you want the restored state kept as a version.',
      confirmLabel: above.length
        ? `Restore and delete ${above.length} version${above.length === 1 ? '' : 's'}`
        : `Restore to v${v.versionNumber}`,
      destructive: true,
    });
    if (!ok) return;
    const res = restoreObjectVersion(object.id, v.id);
    if (!res.ok) {
      setError(res.error || 'Could not restore that version.');
      return;
    }
    flash(
      res.removed
        ? `Restored to v${v.versionNumber} · removed ${res.removed} newer version${res.removed === 1 ? '' : 's'}`
        : `Restored to v${v.versionNumber}`,
    );
  };

  const onPublish = async (v: Version) => {
    setError(null);
    const live = versions.find((x) => x.publishedAt && x.id !== v.id);
    // Name the DESTINATION. "the shared library" is true and tells an author nothing;
    // whether this lands in one club's Activities or in the curriculum every club
    // reads is the only thing they actually need to know before pressing it.
    const destination = nexusClubName
      ? `It will appear in ${nexusClubName}’s Activities — and not in Learn.`
      : 'It will appear in Learn, for every club that reads this program.';
    const ok = await confirm({
      title: `Publish v${v.versionNumber}?`,
      description:
        `v${v.versionNumber} of “${object.title}” goes live. ${destination}`
        + (live ? ` v${live.versionNumber} is live now and will be replaced.` : '')
        + ' Later edits stay private until you publish again.',
      confirmLabel: `Publish v${v.versionNumber}`,
    });
    if (!ok) return;
    setPublishingId(v.id);
    const res = await publishObjectVersion(object.id, v.id);
    setPublishingId(null);
    if (!res.ok) {
      setError(res.error || 'Could not publish that version.');
      return;
    }
    flash(`Published v${v.versionNumber} to the shared library`);
  };

  const onUnpublish = async (v: Version) => {
    setError(null);
    const ok = await confirm({
      title: `Unpublish v${v.versionNumber}?`,
      description:
        `“${object.title}” is removed from the shared library, so the apps reading it stop showing it.`
        + ' Your copy and its version history are untouched — you can publish again any time.',
      confirmLabel: 'Unpublish',
      destructive: true,
    });
    if (!ok) return;
    setPublishingId(v.id);
    const res = await unpublishObject(object.id);
    setPublishingId(null);
    if (!res.ok) {
      setError(res.error || 'Could not unpublish that version.');
      return;
    }
    flash(`Unpublished v${v.versionNumber}`);
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
          {error && (
            <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 8 }}>
              <p style={{ fontSize: 12, color: '#DC2626' }}>{error}</p>
              {/*
                A session problem is the one error the author can actually fix
                from here, so it gets the button rather than an instruction to go
                and do it themselves. Only offered when we still know where the
                launch came from.
              */}
              {/Nexus (launch|session)/i.test(error) && hasReturnUrl() && (
                <button
                  type="button"
                  onClick={() => backToNexus()}
                  className="px-3 py-1.5 rounded-full"
                  style={{ fontSize: 12, fontWeight: 650, color: '#fff', background: '#0B0F1A' }}
                >
                  Open Nexus
                </button>
              )}
            </div>
          )}
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
                  {!!v.publishedAt && (
                    <span
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold"
                      style={{ background: 'rgba(4,120,87,0.12)', color: '#047857' }}
                      title="Partner apps are showing this version"
                    >
                      <Upload size={9} /> PUBLISHED
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
                {v.snapshotTrimmed && (
                  <p style={{ fontSize: 11.5, color: '#B45309', marginTop: 4 }}>
                    Content dropped to free browser storage — this version is kept for the record
                    but can’t be restored or published.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!!v.publishedAt && (
                  <button
                    type="button"
                    onClick={() => void onUnpublish(v)}
                    disabled={publishingId !== null}
                    className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border disabled:opacity-40"
                    style={{ fontSize: 11.5, fontWeight: 650, color: '#B91C1C', borderColor: 'rgba(185,28,28,0.3)', background: '#fff' }}
                    title="Remove this from the shared library so reader apps stop showing it"
                  >
                    {publishingId === v.id
                      ? <Loader2 size={12} className="animate-spin" />
                      : <CloudOff size={12} />}
                    Unpublish
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void onPublish(v)}
                  disabled={(!v.snapshot && !isTipVersion(v)) || publishingId !== null || !!v.publishedAt}
                  className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg text-white disabled:opacity-40"
                  style={{ fontSize: 11.5, fontWeight: 650, background: v.publishedAt ? '#047857' : '#0B0F1A' }}
                  title={
                    v.publishedAt
                      ? `v${v.versionNumber} is the version partner apps are showing`
                      : !v.snapshot
                        ? 'This version has no saved content to publish'
                        : `Publish v${v.versionNumber} to the shared library`
                  }
                >
                  {publishingId === v.id
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Upload size={12} />}
                  {v.publishedAt ? 'Published' : 'Publish'}
                </button>
                <button
                  type="button"
                  onClick={() => void onRestore(v)}
                  disabled={!v.snapshot}
                  className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
                  style={{ fontSize: 11.5, fontWeight: 650, color: '#0B1220', borderColor: 'rgba(0,0,0,0.12)' }}
                  title={v.snapshot
                    ? `Restore the content to v${v.versionNumber}`
                    : 'This version has no saved content to restore'}
                >
                  <RotateCcw size={12} /> Restore to v{v.versionNumber}
                </button>
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
