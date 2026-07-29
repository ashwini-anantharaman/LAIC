import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { EmbeddableObjectType, ObjectType } from '../../lib/types';
import {
  embedTypeToLibraryTypes,
  type LibraryObjectChoice,
} from '../../lib/tutorialTemplates';

const field: React.CSSProperties = {
  fontSize: 13,
  border: '1px solid rgba(0,0,0,0.1)',
  background: 'rgba(255,255,255,0.9)',
  outline: 'none',
};

const LIBRARY_TYPE_FILTERS: { type: ObjectType | 'all'; label: string }[] = [
  { type: 'all', label: 'All types' },
  { type: 'tutorial', label: 'Tutorials' },
  { type: 'lesson', label: 'Lessons' },
  { type: 'quiz', label: 'Quizzes' },
  { type: 'flashcard-set', label: 'Flashcard sets' },
  { type: 'concept-card', label: 'Concept cards' },
  { type: 'scenario', label: 'Scenarios' },
  { type: 'assignment', label: 'Assignments' },
  { type: 'reflection', label: 'Reflections' },
  { type: 'summary', label: 'Summaries' },
  { type: 'drill', label: 'Drills' },
  { type: 'video-script', label: 'Video scripts' },
];

/** Modal to pick an Activity object + version pin for embedding. */
export function LibraryPickerModal({
  open,
  onClose,
  library,
  libraryStatus,
  libraryEmptyCopy,
  slotObjectType = 'reused-from-library',
  initialObjectId,
  initialVersionId,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  library: LibraryObjectChoice[];
  libraryStatus: 'idle' | 'loading' | 'empty' | 'error';
  libraryEmptyCopy: string;
  /** When set to a specific embed type, filters to that Activity object type. */
  slotObjectType?: EmbeddableObjectType;
  initialObjectId?: string;
  initialVersionId?: string;
  onConfirm: (objectId: string, versionId: string, title: string, objectType: ObjectType) => void;
}) {
  const lockedTypes = embedTypeToLibraryTypes(slotObjectType);
  const [typeFilter, setTypeFilter] = useState<ObjectType | 'all'>(lockedTypes?.[0] ?? 'all');
  const [objectId, setObjectId] = useState(initialObjectId || '');
  const [versionId, setVersionId] = useState(initialVersionId || '');

  useEffect(() => {
    if (!open) return;
    setTypeFilter(lockedTypes?.[0] ?? 'all');
    setObjectId(initialObjectId || '');
    setVersionId(initialVersionId || '');
  }, [open, slotObjectType, initialObjectId, initialVersionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    let rows = library;
    if (lockedTypes) {
      rows = rows.filter((o) => lockedTypes.includes(o.type));
    } else if (typeFilter !== 'all') {
      rows = rows.filter((o) => o.type === typeFilter);
    }
    return rows;
  }, [library, lockedTypes, typeFilter]);

  const selected = filtered.find((o) => o.id === objectId) || library.find((o) => o.id === objectId);

  useEffect(() => {
    if (!objectId) return;
    if (filtered.some((o) => o.id === objectId)) return;
    setObjectId('');
    setVersionId('');
  }, [filtered, objectId]);

  if (!open) return null;

  const typeLocked = !!lockedTypes;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.45)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-2xl border p-4 shadow-lg"
        style={{ background: '#fff', borderColor: 'rgba(0,0,0,0.1)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Pick from Activity objects"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#0B1220' }}>Pick from Activity objects</p>
            <p style={{ fontSize: 12.5, color: '#9AA3AF', marginTop: 2 }}>
              Choose a learning object and pin a version to embed in this tutorial.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg" aria-label="Close">
            <X size={15} style={{ color: '#6B7280' }} />
          </button>
        </div>

        <label style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>
          Object type
        </label>
        <select
          value={typeLocked ? (lockedTypes![0]) : typeFilter}
          disabled={typeLocked}
          onChange={(e) => {
            const next = e.target.value as ObjectType | 'all';
            setTypeFilter(next);
            setObjectId('');
            setVersionId('');
          }}
          className="w-full rounded-xl px-3 py-2 mb-3"
          style={field}
        >
          {(typeLocked
            ? LIBRARY_TYPE_FILTERS.filter((t) => t.type === lockedTypes![0])
            : LIBRARY_TYPE_FILTERS
          ).map((t) => (
            <option key={t.type} value={t.type}>{t.label}</option>
          ))}
        </select>

        <label style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>
          Learning object
        </label>
        {libraryStatus === 'loading' ? (
          <p style={{ fontSize: 12.5, color: '#9AA3AF', marginBottom: 12 }}>Loading Activity objects…</p>
        ) : filtered.length === 0 ? (
          <p style={{ fontSize: 12.5, color: '#9AA3AF', marginBottom: 12 }}>
            {library.length === 0
              ? libraryEmptyCopy
              : 'No objects of this type in the library yet.'}
          </p>
        ) : (
          <select
            value={objectId}
            onChange={(e) => {
              const id = e.target.value;
              setObjectId(id);
              const obj = filtered.find((o) => o.id === id);
              const vid = obj?.versions.find((v) => v.isLive)?.versionId
                || obj?.versions[0]?.versionId
                || '';
              setVersionId(vid);
            }}
            className="w-full rounded-xl px-3 py-2 mb-3"
            style={field}
          >
            <option value="">Select object…</option>
            {filtered.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title} · {o.status}
              </option>
            ))}
          </select>
        )}

        <label style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>
          Version pin
        </label>
        <select
          value={versionId}
          disabled={!selected}
          onChange={(e) => setVersionId(e.target.value)}
          className="w-full rounded-xl px-3 py-2 mb-4"
          style={field}
        >
          <option value="">Select version…</option>
          {(selected?.versions || []).map((v) => (
            <option key={v.versionId} value={v.versionId}>
              v{v.versionNumber}{v.isLive ? ' (live)' : ''} — {v.status}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!objectId || !versionId || !selected}
            onClick={() => {
              if (!objectId || !versionId || !selected) return;
              onConfirm(objectId, versionId, selected.title, selected.type);
            }}
            className="px-4 py-2 rounded-full text-white disabled:opacity-40"
            style={{ background: '#059669', fontSize: 13, fontWeight: 600 }}
          >
            Use this object
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full border"
            style={{ fontSize: 13, color: '#6B7280', borderColor: 'rgba(0,0,0,0.1)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
