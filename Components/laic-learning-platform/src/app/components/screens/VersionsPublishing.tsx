import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Eye, Lock, LockOpen, Trash2, History } from 'lucide-react';
import { OBJECTS } from '../../../lib/data';
import { useApp } from '../../App';
import { StatusPill } from './StatusPill';
import { useConfirm } from '../ConfirmDialog';
import { ObjectVersionsModal } from './ObjectVersionsModal';
import type { LearningObject } from '../../../lib/types';

export function VersionsPublishing() {
  const {
    createdObjects,
    listAllObjectVersions,
    objectVersionsTick,
    openReaderVersion,
    lockObjectVersion,
    deleteObjectVersion,
  } = useApp();
  const confirm = useConfirm();
  const [versionsFor, setVersionsFor] = useState<LearningObject | null>(null);
  const [error, setError] = useState<string | null>(null);

  const libraryById = useMemo(() => {
    const map = new Map<string, LearningObject>();
    for (const o of OBJECTS) map.set(o.id, o);
    for (const o of createdObjects) map.set(o.id, o);
    return map;
  }, [createdObjects]);

  const rows = useMemo(() => {
    void objectVersionsTick;
    return listAllObjectVersions().map((v) => {
      const obj = libraryById.get(v.objectId);
      return {
        ...v,
        displayTitle: obj?.title || v.objectTitle || 'Untitled',
        displayType: obj?.type || 'Content',
        object: obj || null,
      };
    });
  }, [listAllObjectVersions, libraryById, objectVersionsTick]);

  return (
    <div className="px-4 sm:px-6 py-5 sm:py-6 w-full">
      {versionsFor && (
        <ObjectVersionsModal object={versionsFor} onClose={() => setVersionsFor(null)} />
      )}
      <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 16 }}>
        Version history for learning content. Save new versions from the Content Library, lock a version to freeze it, or open an older snapshot.
      </p>
      {error && (
        <p className="mb-3 px-3 py-2 rounded-xl" style={{ fontSize: 12.5, color: '#991B1B', background: '#FEF2F2' }}>
          {error}
        </p>
      )}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-[24px] overflow-x-auto" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
        <table className="w-full min-w-[720px]">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              {['Content', 'Version', 'Status', 'Date', 'Note', ''].map((h) => (
                <th key={h || 'actions'} className="px-5 py-3.5 text-left" style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((v, i) => (
              <motion.tr key={v.id}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}
                style={{ borderBottom: i < rows.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
                <td className="px-5 py-3.5">
                  <p style={{ fontSize: 13.5, fontWeight: 550, color: '#0B1220' }}>{v.displayTitle}</p>
                  <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs" style={{ background: '#F3F4F6', color: '#374151', textTransform: 'capitalize' }}>{v.displayType}</span>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: '#374151' }}>v{v.versionNumber}</span>
                    {v.isLive && <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: 'rgba(5,150,105,0.1)', color: '#059669' }}>LIVE</span>}
                    {v.locked && <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: 'rgba(217,119,6,0.12)', color: '#B45309' }}>LOCKED</span>}
                  </div>
                </td>
                <td className="px-5 py-3.5"><StatusPill status={v.status} /></td>
                <td className="px-5 py-3.5" style={{ fontSize: 12.5, color: '#9AA3AF', whiteSpace: 'nowrap' }}>{v.createdAt}</td>
                <td className="px-5 py-3.5" style={{ fontSize: 12.5, color: '#6B7280', maxWidth: 200 }}>{v.notes || <span style={{ color: '#C4CBD4' }}>—</span>}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      type="button"
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100"
                      title="View version"
                      onClick={() => openReaderVersion(v.objectId, v.id)}
                    >
                      <Eye size={13} style={{ color: '#6B7280' }} />
                    </button>
                    {v.object && (
                      <button
                        type="button"
                        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100"
                        title="Manage versions"
                        onClick={() => setVersionsFor(v.object!)}
                      >
                        <History size={13} style={{ color: '#6B7280' }} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100"
                      title={v.locked ? 'Unlock' : 'Lock'}
                      onClick={() => {
                        setError(null);
                        const next = lockObjectVersion(v.id, !v.locked);
                        if (!next) setError('Only saved library versions can be locked (not demo catalog rows).');
                      }}
                    >
                      {v.locked
                        ? <LockOpen size={13} style={{ color: '#B45309' }} />
                        : <Lock size={13} style={{ color: '#6B7280' }} />}
                    </button>
                    <button
                      type="button"
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50"
                      title="Delete version"
                      onClick={async () => {
                        setError(null);
                        const ok = await confirm({
                          title: `Delete v${v.versionNumber}?`,
                          description: `Remove this version of “${v.displayTitle}”.`,
                          confirmLabel: 'Delete version',
                          destructive: true,
                        });
                        if (!ok) return;
                        const result = deleteObjectVersion(v.id);
                        if (!result.ok) setError(result.error || 'Could not delete.');
                      }}
                    >
                      <Trash2 size={13} style={{ color: '#EF4444' }} />
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="py-12 text-center">
            <p style={{ fontSize: 13, color: '#9AA3AF' }}>No version history yet.</p>
            <p style={{ fontSize: 12.5, color: '#C4CBD4', marginTop: 6 }}>
              Save content from Create, then use “Save as new version” in the Content Library.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
