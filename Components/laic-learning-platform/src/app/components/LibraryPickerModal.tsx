/**
 * Finder-style Content Library browser for embedding / version-pinning.
 * Large directory panel: folders (double-click), content grouped by type, search.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight, FolderOpen, Search, X, Check, FileText,
} from 'lucide-react';
import type { EmbeddableObjectType, ObjectType } from '../../lib/types';
import {
  embedTypeToLibraryTypes,
  type LibraryObjectChoice,
} from '../../lib/tutorialTemplates';
import {
  getChildCollections,
  getCollectionPath,
  getRootCollections,
  type ObjectCollection,
} from '../../lib/objectCollectionsStore';
import { useApp } from '../App';
import { GlassFolderTile, tintForKey } from './GlassFolder';

const TYPE_LABELS: Record<string, string> = {
  tutorial: 'Tutorials',
  'tutorial-v2': 'Tutorials V2',
  'tutorial-v3': 'Tutorials V3',
  lesson: 'Lessons',
  quiz: 'Quizzes',
  'flashcard-set': 'Flashcard sets',
  'concept-card': 'Concept cards',
  scenario: 'Scenarios',
  assignment: 'Assignments',
  reflection: 'Reflections',
  summary: 'Summaries',
  drill: 'Drills',
  'video-script': 'Video scripts',
};

const TYPE_ORDER = [
  'tutorial', 'tutorial-v2', 'tutorial-v3', 'lesson', 'concept-card', 'flashcard-set', 'quiz',
  'assignment', 'reflection', 'summary', 'scenario', 'drill', 'video-script',
];

const TYPE_ICON: Record<string, string> = {
  lesson: '📖', tutorial: '🎓', 'tutorial-v2': '🎓', 'tutorial-v3': '🎓', quiz: '✅', 'flashcard-set': '🃏',
  'concept-card': '💡', summary: '📋', reflection: '🪞', scenario: '🎭',
  assignment: '📝', drill: '🔁', 'video-script': '🎬',
};

function typeLabel(t: string) {
  return TYPE_LABELS[t] || t.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function itemInFolder(item: LibraryObjectChoice, folderId: string | null): boolean {
  const ids = item.collectionIds || [];
  if (folderId === null) {
    // Root “unfiled” strip — items with no folder membership
    return ids.length === 0;
  }
  return ids.includes(folderId);
}

/** Modal to pick Content Library content + version pin for embedding. */
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
  /** When set to a specific embed type, filters to that Content Library type. */
  slotObjectType?: EmbeddableObjectType;
  initialObjectId?: string;
  initialVersionId?: string;
  onConfirm: (objectId: string, versionId: string, title: string, objectType: ObjectType) => void;
}) {
  const { objectCollections } = useApp();
  const lockedTypes = embedTypeToLibraryTypes(slotObjectType);

  const [search, setSearch] = useState('');
  const [openedFolderId, setOpenedFolderId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [objectId, setObjectId] = useState(initialObjectId || '');
  const [versionId, setVersionId] = useState(initialVersionId || '');

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setOpenedFolderId(null);
    setSelectedFolderId(null);
    setObjectId(initialObjectId || '');
    setVersionId(initialVersionId || '');
  }, [open, slotObjectType, initialObjectId, initialVersionId]);

  const typeFiltered = useMemo(() => {
    if (!lockedTypes) return library;
    return library.filter((o) => lockedTypes.includes(o.type));
  }, [library, lockedTypes]);

  const q = search.trim().toLowerCase();
  const searching = q.length > 0;

  const opened = objectCollections.find((c) => c.id === openedFolderId) ?? null;
  const breadcrumb = opened
    ? [...getCollectionPath(objectCollections, opened.id), opened]
    : [];

  const foldersHere = useMemo(() => {
    if (searching) {
      return objectCollections
        .filter((c) => c.name.toLowerCase().includes(q))
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return opened
      ? getChildCollections(objectCollections, opened.id)
      : getRootCollections(objectCollections);
  }, [objectCollections, opened, searching, q]);

  const contentHere = useMemo(() => {
    let rows: LibraryObjectChoice[];
    if (searching) {
      // Global search across the library (respect type lock)
      rows = typeFiltered.filter((o) => o.title.toLowerCase().includes(q));
    } else if (opened) {
      rows = typeFiltered.filter((o) => itemInFolder(o, opened.id));
    } else {
      // Root: only unfiled content (folders carry the rest)
      rows = typeFiltered.filter((o) => itemInFolder(o, null));
    }
    return rows;
  }, [typeFiltered, searching, q, opened]);

  const grouped = useMemo(() => {
    const map = new Map<string, LibraryObjectChoice[]>();
    for (const o of contentHere) {
      const list = map.get(o.type) || [];
      list.push(o);
      map.set(o.type, list);
    }
    const keys = [
      ...TYPE_ORDER.filter((t) => map.has(t)),
      ...[...map.keys()].filter((t) => !TYPE_ORDER.includes(t)).sort(),
    ];
    return keys.map((type) => ({
      type,
      label: typeLabel(type),
      items: (map.get(type) || []).slice().sort((a, b) => a.title.localeCompare(b.title)),
    }));
  }, [contentHere]);

  const selected = typeFiltered.find((o) => o.id === objectId)
    || library.find((o) => o.id === objectId);

  const countsByFolder = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of typeFiltered) {
      for (const cid of o.collectionIds || []) {
        map.set(cid, (map.get(cid) || 0) + 1);
      }
    }
    return map;
  }, [typeFiltered]);

  const selectContent = (o: LibraryObjectChoice) => {
    setObjectId(o.id);
    const vid = o.versions.find((v) => v.isLive)?.versionId
      || o.versions[0]?.versionId
      || '';
    setVersionId(vid);
  };

  const openFolder = (id: string) => {
    setOpenedFolderId(id);
    setSelectedFolderId(id);
    setObjectId('');
    setVersionId('');
  };

  const goRoot = () => {
    setOpenedFolderId(null);
    setSelectedFolderId(null);
  };

  if (!open) return null;

  const typeHint = lockedTypes
    ? `Showing ${typeLabel(lockedTypes[0])} only`
    : 'All content types';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full flex flex-col overflow-hidden"
        style={{
          maxWidth: 980,
          height: 'min(820px, 92vh)',
          background: '#F7F8FA',
          borderRadius: 20,
          border: '1px solid rgba(0,0,0,0.1)',
          boxShadow: '0 28px 80px -24px rgba(15,23,42,0.45)',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Browse Content Library"
      >
        {/* Title bar */}
        <div
          className="flex items-center gap-3 px-4 py-3 shrink-0"
          style={{
            background: 'linear-gradient(180deg, #FFFFFF 0%, #F3F4F6 100%)',
            borderBottom: '1px solid rgba(0,0,0,0.08)',
          }}
        >
          <FolderOpen size={18} style={{ color: '#0B1220' }} />
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 14, fontWeight: 750, color: '#0B1220' }}>Content Library</p>
            <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>
              Double-click a folder to open · {typeHint}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/5"
            aria-label="Close"
          >
            <X size={16} style={{ color: '#6B7280' }} />
          </button>
        </div>

        {/* Search + breadcrumb */}
        <div
          className="px-4 py-3 shrink-0 space-y-2.5"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#fff' }}
        >
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: '#9AA3AF' }}
            />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search folders and content…"
              className="w-full rounded-xl pl-9 pr-3 py-2.5"
              style={{
                fontSize: 13.5,
                border: '1px solid rgba(0,0,0,0.1)',
                background: '#F9FAFB',
                outline: 'none',
              }}
            />
          </div>
          <div className="flex items-center gap-1 flex-wrap" style={{ fontSize: 12.5 }}>
            <button
              type="button"
              onClick={goRoot}
              className="px-2 py-0.5 rounded-md hover:bg-black/5"
              style={{
                fontWeight: !opened && !searching ? 700 : 500,
                color: !opened && !searching ? '#0B1220' : '#6B7280',
              }}
            >
              Library
            </button>
            {breadcrumb.map((c) => (
              <React.Fragment key={c.id}>
                <ChevronRight size={12} style={{ color: '#C4CBD4' }} />
                <button
                  type="button"
                  onClick={() => openFolder(c.id)}
                  className="px-2 py-0.5 rounded-md hover:bg-black/5"
                  style={{
                    fontWeight: opened?.id === c.id && !searching ? 700 : 500,
                    color: opened?.id === c.id && !searching ? '#0B1220' : '#6B7280',
                  }}
                >
                  {c.name}
                </button>
              </React.Fragment>
            ))}
            {searching && (
              <>
                <ChevronRight size={12} style={{ color: '#C4CBD4' }} />
                <span style={{ fontWeight: 650, color: '#0B1220', padding: '0 6px' }}>
                  Search results
                </span>
              </>
            )}
          </div>
        </div>

        {/* Directory body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          {libraryStatus === 'loading' ? (
            <p style={{ fontSize: 13, color: '#9AA3AF' }}>Loading Content Library…</p>
          ) : libraryStatus === 'empty' && !typeFiltered.length ? (
            <p style={{ fontSize: 13, color: '#9AA3AF' }}>{libraryEmptyCopy}</p>
          ) : (
            <>
              {/* Folders — root / current directory, or name matches while searching */}
              {(foldersHere.length > 0 || !searching) && (
                <section className="mb-5">
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#9AA3AF',
                      letterSpacing: '.06em',
                      textTransform: 'uppercase',
                      marginBottom: 10,
                    }}
                  >
                    {searching ? 'Folders' : opened ? 'Folders' : 'Folders'}
                    {foldersHere.length ? ` · ${foldersHere.length}` : ''}
                  </p>
                  {foldersHere.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: '#9AA3AF' }}>
                      {opened ? 'No subfolders in this folder.' : 'No folders yet — content may appear under Unfiled below.'}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {foldersHere.map((col, i) => (
                        <FolderButton
                          key={col.id}
                          col={col}
                          count={countsByFolder.get(col.id) || 0}
                          selected={selectedFolderId === col.id}
                          index={i}
                          onSelect={() => setSelectedFolderId(col.id)}
                          onOpen={() => {
                            setSearch('');
                            openFolder(col.id);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Content grouped by type */}
              <section>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#9AA3AF',
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                    marginBottom: 10,
                  }}
                >
                  {searching
                    ? `Content · ${contentHere.length} match${contentHere.length === 1 ? '' : 'es'}`
                    : opened
                      ? `Content in this folder · ${contentHere.length}`
                      : `Unfiled content · ${contentHere.length}`}
                </p>

                {grouped.length === 0 ? (
                  <div
                    className="rounded-2xl px-4 py-8 text-center"
                    style={{ background: '#fff', border: '1px dashed rgba(0,0,0,0.1)' }}
                  >
                    <FileText size={22} className="mx-auto mb-2" style={{ color: '#C4CBD4' }} />
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: '#0B1220' }}>
                      {searching ? 'No matches' : 'No content here'}
                    </p>
                    <p style={{ fontSize: 12.5, color: '#9AA3AF', marginTop: 4 }}>
                      {searching
                        ? 'Try another search, or clear the search to browse folders.'
                        : opened
                          ? 'Open a subfolder, or pick another folder from the breadcrumb.'
                          : 'Double-click a folder above to browse its content.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {grouped.map((group) => (
                      <div
                        key={group.type}
                        className="rounded-2xl overflow-hidden"
                        style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)' }}
                      >
                        <div
                          className="flex items-center gap-2 px-3.5 py-2.5"
                          style={{
                            background: 'rgba(249,250,251,0.95)',
                            borderBottom: '1px solid rgba(0,0,0,0.05)',
                          }}
                        >
                          <span style={{ fontSize: 15 }}>{TYPE_ICON[group.type] || '📄'}</span>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#0B1220' }}>
                            {group.label}
                          </p>
                          <span style={{ fontSize: 11.5, color: '#9AA3AF', marginLeft: 2 }}>
                            {group.items.length}
                          </span>
                        </div>
                        <ul className="divide-y" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
                          {group.items.map((o) => {
                            const on = objectId === o.id;
                            return (
                              <li key={o.id}>
                                <button
                                  type="button"
                                  onClick={() => selectContent(o)}
                                  onDoubleClick={() => {
                                    selectContent(o);
                                  }}
                                  className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors"
                                  style={{
                                    background: on ? 'rgba(5,150,105,0.08)' : 'transparent',
                                  }}
                                >
                                  <span
                                    className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0"
                                    style={{
                                      borderColor: on ? '#059669' : '#D1D5DB',
                                      background: on ? '#059669' : '#fff',
                                    }}
                                  >
                                    {on && <Check size={11} color="#fff" strokeWidth={3} />}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p
                                      className="truncate"
                                      style={{
                                        fontSize: 13.5,
                                        fontWeight: on ? 650 : 500,
                                        color: '#0B1220',
                                      }}
                                    >
                                      {o.title}
                                    </p>
                                    <p style={{ fontSize: 11.5, color: '#9AA3AF', marginTop: 1 }}>
                                      {o.status}
                                      {o.versions.length ? ` · ${o.versions.length} version${o.versions.length === 1 ? '' : 's'}` : ''}
                                      {searching && (o.collectionIds?.length)
                                        ? ` · ${folderNames(objectCollections, o.collectionIds)}`
                                        : ''}
                                    </p>
                                  </div>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        {/* Footer — version + confirm */}
        <div
          className="shrink-0 px-4 py-3 flex flex-wrap items-center gap-3"
          style={{
            background: '#fff',
            borderTop: '1px solid rgba(0,0,0,0.08)',
          }}
        >
          <div className="flex-1 min-w-[200px]">
            {selected ? (
              <div className="flex flex-wrap items-center gap-2">
                <span style={{ fontSize: 12.5, color: '#6B7280' }}>
                  <strong style={{ color: '#0B1220' }}>{selected.title}</strong>
                </span>
                <select
                  value={versionId}
                  onChange={(e) => setVersionId(e.target.value)}
                  className="rounded-lg px-2.5 py-1.5"
                  style={{
                    fontSize: 12.5,
                    border: '1px solid rgba(0,0,0,0.12)',
                    background: '#F9FAFB',
                    outline: 'none',
                  }}
                >
                  {(selected.versions || []).map((v) => (
                    <option key={v.versionId} value={v.versionId}>
                      v{v.versionNumber}{v.isLive ? ' (live)' : ''} — {v.status}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p style={{ fontSize: 12.5, color: '#9AA3AF' }}>
                Select content from the list, then pin a version.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full border"
            style={{ fontSize: 13, color: '#6B7280', borderColor: 'rgba(0,0,0,0.1)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!objectId || !versionId || !selected}
            onClick={() => {
              if (!objectId || !versionId || !selected) return;
              onConfirm(objectId, versionId, selected.title, selected.type);
            }}
            className="px-4 py-2 rounded-full text-white disabled:opacity-40"
            style={{ background: '#059669', fontSize: 13, fontWeight: 650 }}
          >
            Use this content
          </button>
        </div>
      </div>
    </div>
  );
}

function folderNames(collections: ObjectCollection[], ids: string[]): string {
  const names = ids
    .map((id) => collections.find((c) => c.id === id)?.name)
    .filter(Boolean);
  return names.length ? names.join(', ') : 'folder';
}

function FolderButton({
  col,
  count,
  selected,
  onSelect,
  onOpen,
}: {
  col: ObjectCollection;
  count: number;
  selected: boolean;
  index: number;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <GlassFolderTile
      id={col.id}
      name={col.name}
      count={count}
      selected={selected}
      tint={tintForKey(col.id)}
      onClick={onSelect}
      onDoubleClick={onOpen}
    />
  );
}
