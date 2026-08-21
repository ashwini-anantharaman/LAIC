import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, Eye, GitBranch, PenLine, BookOpen, Layers, HelpCircle, Copy, FileText, Lightbulb, Zap, Video,
  BookMarked, Link2, Check, FolderOpen, Plus, FilePenLine, ArrowLeft, LayoutGrid, List, History, Trash2, Download,
  GripVertical, Upload, Users, FolderInput,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { OBJECTS } from '../../../lib/data';
import { StatusPill } from './StatusPill';
import type { LearningObject, ObjectType, ObjectStatus } from '../../../lib/types';
import { useApp } from '../../App';
import { exportLibrarySnapshot } from '../../../lib/librarySnapshotSeed';
import { objectEmbedUrl } from '../../../lib/objectUrls';
import { objectToPublishRow, saveObject, setObjectShared } from '../../../lib/supabase';
import { applyObjectOrder, setObjectOrder, subscribeObjectOrder } from '../../../lib/objectOrderStore';
import {
  objectCollectionIds,
  getRootCollections,
  getChildCollections,
  getCollectionPath,
  isBuiltinObjectCollection,
} from '../../../lib/objectCollectionsStore';
import { GlassFolder, GlassFolderTile } from '../GlassFolder';
import { ShareWithClubsModal } from './ShareWithClubsModal';
import { PublishToLibraryModal } from './PublishToLibraryModal';
import { LibraryNewMenu } from './LibraryNewMenu';
import { useConfirm } from '../ConfirmDialog';
import { ObjectVersionsModal } from './ObjectVersionsModal';

const TYPE_ICONS: Record<ObjectType, React.ReactNode> = {
  lesson: <BookOpen size={14} />,
  tutorial: <Layers size={14} />,
  'tutorial-v2': <Layers size={14} />,
  'tutorial-v3': <Layers size={14} />,
  quiz: <HelpCircle size={14} />,
  'flashcard-set': <Copy size={14} />,
  'concept-card': <Lightbulb size={14} />,
  summary: <FileText size={14} />,
  reflection: <FileText size={14} />,
  scenario: <Zap size={14} />,
  assignment: <PenLine size={14} />,
  drill: <Zap size={14} />,
  'video-script': <Video size={14} />,
  course: <BookMarked size={14} />,
};

const DRAFT_STATUSES: ObjectStatus[] = ['draft', 'changes-requested'];

function isDraftStatus(status: ObjectStatus) {
  return DRAFT_STATUSES.includes(status);
}

type ViewMode = 'folders' | 'list';

function NewCollectionModal({
  onClose,
  onCreate,
  parentName,
}: {
  onClose: () => void;
  onCreate: (name: string) => void;
  parentName?: string | null;
}) {
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(11,18,32,0.45)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm rounded-[28px] overflow-hidden"
        style={{ background: 'white', boxShadow: '0 24px 64px -16px rgba(30,50,80,0.3)' }}
      >
        <div className="p-5 border-b" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0B1220' }}>
            {parentName ? 'New subfolder' : 'New folder'}
          </h3>
          <p style={{ fontSize: 13, color: '#9AA3AF', marginTop: 2 }}>
            {parentName
              ? `Inside “${parentName}”. Nest folders however you like.`
              : 'Group content by topic, course, or project. You can nest folders later.'}
          </p>
        </div>
        <div className="p-5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) onCreate(name.trim());
            }}
            placeholder="e.g. Opening bids"
            className="w-full rounded-2xl px-4 py-2.5"
            style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
          />
        </div>
        <div className="flex gap-2 p-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-full" style={{ background: 'rgba(0,0,0,0.05)', fontSize: 13, fontWeight: 600, color: '#374151' }}>Cancel</button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => onCreate(name.trim())}
            className="flex-1 py-2.5 rounded-full"
            style={{ background: name.trim() ? '#0B0F1A' : '#E5E7EB', color: name.trim() ? '#fff' : '#9AA3AF', fontSize: 13, fontWeight: 600 }}
          >
            Create
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * One library row, draggable by its grip.
 *
 * The grip exists because the row already carries six click targets — dragging
 * from anywhere would steal those clicks. Listeners go on the handle only.
 */
function SortableObjectRow({
  id,
  reorderable,
  isLast,
  children,
}: {
  id: string;
  reorderable: boolean;
  isLast: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !reorderable,
  });
  return (
    <div
      ref={setNodeRef}
      className="flex flex-wrap items-center gap-y-2 gap-x-3 px-3 sm:px-4 py-3 transition-colors hover:bg-gray-50/80"
      style={{
        borderBottom: isLast ? 'none' : '1px solid rgba(0,0,0,0.05)',
        transform: CSS.Transform.toString(transform),
        transition,
        background: isDragging ? '#F8FAFC' : undefined,
        boxShadow: isDragging ? '0 8px 20px -10px rgba(30,50,80,0.35)' : undefined,
        position: isDragging ? 'relative' : undefined,
        zIndex: isDragging ? 5 : undefined,
      }}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="w-5 shrink-0 flex items-center justify-center"
        style={{
          cursor: reorderable ? (isDragging ? 'grabbing' : 'grab') : 'default',
          color: '#C7CDD6',
          opacity: reorderable ? 1 : 0.25,
          touchAction: 'none',
        }}
        title={reorderable ? 'Drag to reorder' : 'Clear the search and status filter to reorder'}
        aria-label="Reorder"
        disabled={!reorderable}
      >
        <GripVertical size={14} />
      </button>
      {children}
    </div>
  );
}

export function ObjectLibrary() {
  const [search, setSearch] = useState('');
  const [collectionSearch, setCollectionSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<ObjectStatus | 'all'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  /** Bumped when the saved folder order changes (this tab or another). */
  const [orderTick, setOrderTick] = useState(0);
  /** Per object: did publishing succeed? Absent = not attempted this session. */
  const [linkPublic, setLinkPublic] = useState<Record<string, boolean>>({});
  const [showNewCol, setShowNewCol] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [collectionsMenuFor, setCollectionsMenuFor] = useState<string | null>(null);
  const [openedCollectionId, setOpenedCollectionId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('folders');
  const [versionsFor, setVersionsFor] = useState<LearningObject | null>(null);
  const [versionToast, setVersionToast] = useState<string | null>(null);
  const [sharingFor, setSharingFor] = useState<LearningObject | null>(null);
  const [filingFor, setFilingFor] = useState<LearningObject | null>(null);

  const {
    activeUserId,
    openReader,
    openEditor,
    createdObjects: createdObjectsRaw,
    objectCollections: objectCollectionsRaw,
    setActiveObjectCollectionId,
    createObjectCollection,
    renameObjectCollection,
    deleteObjectCollection,
    setObjectCollectionIds,
    deleteCreatedObject,
    saveObjectAsNewVersion,
    listObjectVersions,
    objectVersionsTick,
    pendingLibraryFolderId,
    clearPendingLibraryFolderId,
    learningCapabilities,
    learningIsAdmin,
    setCreateCollectionIds,
    setCreatorObjectType,
    navigate,
  } = useApp();

  /**
   * Make content that lands in the folder being looked at.
   *
   * `pinned` is what makes the menu item honest: without it the type's own home
   * folder wins (libraryFiling.ts) and a tutorial created from inside "quiz"
   * would file itself under bb-tutorials, which is not what the menu said.
   */
  const createInFolder = (type: string, folderId: string | null) => {
    setCreateCollectionIds(folderId ? [folderId] : [], { pinned: !!folderId });
    setCreatorObjectType(type);
    navigate('cd-creator');
  };

  // Capability gates for the actions this screen offers.
  //
  // `learningCapabilities === null` means no Nexus session (standalone/demo) —
  // absent is not denial anywhere else in this codebase and must not become it
  // here, or opening the Studio on its own would strip the library bare. Admins
  // are likewise unconfined.
  const can = (id: string) =>
    learningIsAdmin || learningCapabilities === null || learningCapabilities.includes(id);
  const canShareClubs = can('learning.library.share_club');
  const canViewShares = can('learning.library.share_view');
  const canTargetApp = can('learning.publish.app_target');
  // Putting content into a PROGRAM library folder. Distinct from sharing (who may
  // see this object) and from publishing to an app (it goes live in a product):
  // this decides which shared folder the content sits in, and therefore which
  // audience the folder's own grants hand it to.
  const canFileToLibrary = can('learning.library.file_content');
  const canExport = can('learning.library.export');
  const createdObjects = createdObjectsRaw || [];
  const objectCollections = objectCollectionsRaw || [];
  const confirm = useConfirm();

  const opened = objectCollections.find((c) => c.id === openedCollectionId) ?? null;
  const breadcrumb = opened ? [...getCollectionPath(objectCollections, opened.id), opened] : [];

  const removeOrDeleteObject = (item: LearningObject) => {
    void (async () => {
      const folderId = opened?.id;
      const ids = objectCollectionIds(item);
      const isCreated = createdObjects.some((o) => o.id === item.id);
      const inOtherFolders = folderId
        ? ids.filter((cid) => cid !== folderId).length
        : Math.max(0, ids.length - 1);

      // In a folder and also in other folders → just unlink from this folder.
      if (folderId && ids.includes(folderId) && inOtherFolders > 0) {
        const ok = await confirm({
          title: 'Remove from folder?',
          description: `Remove “${item.title}” from “${opened.name}”? It stays in ${inOtherFolders} other folder${inOtherFolders === 1 ? '' : 's'}.`,
          confirmLabel: 'Remove',
          destructive: true,
        });
        if (!ok) return;
        setObjectCollectionIds(item.id, ids.filter((cid) => cid !== folderId));
        return;
      }

      if (!isCreated) {
        setVersionToast('Demo catalog content can’t be deleted — use the folders menu to move it.');
        window.setTimeout(() => setVersionToast(null), 2400);
        return;
      }

      const ok = await confirm({
        title: 'Delete content?',
        description: folderId
          ? `Delete “${item.title}” from your library? This removes it from “${opened.name}” and permanently deletes the content and its versions.`
          : `Delete “${item.title}” from your library? This permanently deletes the content and its versions.`,
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!ok) return;
      const result = deleteCreatedObject(item.id);
      if (!result.ok) {
        setVersionToast(result.error || 'Could not delete content.');
        window.setTimeout(() => setVersionToast(null), 2200);
      }
    })();
  };

  const versionCount = (objectId: string) => (
    typeof listObjectVersions === 'function' ? listObjectVersions(objectId).length : 0
  );
  /** Is a version of this object live? One live version per object by construction
   *  (markVersionPublished clears the stamp from its siblings), so `some` is exact. */
  const publishedVersion = (objectId: string) => (
    typeof listObjectVersions === 'function'
      ? listObjectVersions(objectId).some((v) => !!v.publishedAt)
      : false
  );
  // Keep count reactive when history changes.
  void objectVersionsTick;

  const saveNewVersion = (item: LearningObject) => {
    const v = saveObjectAsNewVersion(item.id);
    if (!v) {
      setVersionToast('Could not save version — open the content once so it’s in your library.');
    } else {
      setVersionToast(`Saved “${item.title}” as v${v.versionNumber}`);
    }
    window.setTimeout(() => setVersionToast(null), 2200);
  };

  // One-shot deep-link from save → “Go to Content Library” (not from sidebar).
  useEffect(() => {
    if (!pendingLibraryFolderId) return;
    if (!objectCollections.some((c) => c.id === pendingLibraryFolderId)) {
      clearPendingLibraryFolderId();
      return;
    }
    setOpenedCollectionId(pendingLibraryFolderId);
    setSelectedFolderId(pendingLibraryFolderId);
    clearPendingLibraryFolderId();
  }, [pendingLibraryFolderId, objectCollections, clearPendingLibraryFolderId]);

  const rootFolders = useMemo(() => {
    const roots = getRootCollections(objectCollections);
    const q = collectionSearch.trim().toLowerCase();
    if (!q) return roots;
    return roots.filter((c) => c.name.toLowerCase().includes(q));
  }, [objectCollections, collectionSearch]);

  const childFolders = useMemo(() => {
    if (!opened) return [];
    const kids = getChildCollections(objectCollections, opened.id);
    const q = collectionSearch.trim().toLowerCase();
    if (!q) return kids;
    return kids.filter((c) => c.name.toLowerCase().includes(q));
  }, [objectCollections, opened, collectionSearch]);

  /**
   * Copy the object's link AND publish it, because a link nobody else can open is
   * not a link. /o/<id> used to resolve only in the browser that authored the
   * object, so a copied URL failed everywhere it was pasted.
   *
   * The clipboard write happens FIRST and unawaited-on-network: browsers only
   * allow it inside the user's gesture, and putting a round trip in front of it
   * loses that gesture in Safari. Publishing then follows, and its outcome is
   * reported on the button — a link that is merely copied and a link that
   * actually works must not look the same.
   */
  const copyObjectUrl = async (objectId: string) => {
    const url = objectEmbedUrl(objectId);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(objectId);
      window.setTimeout(() => setCopiedId((id) => (id === objectId ? null : id)), 1600);
    } catch {
      window.prompt('Copy this content URL:', url);
    }

    // Publishing needs the row to exist server-side first: object saves are
    // fire-and-forget (App.tsx), so an object authored in a session without a
    // Nexus token was never persisted and has nothing to share.
    // `allObjects` is declared just below; this only runs from a click, long
    // after the component body has evaluated.
    const obj = allObjects.find((o) => o.id === objectId);
    let ok = false;
    if (obj) {
      try {
        await saveObject(obj);
        ok = await setObjectShared(objectId, true);
      } catch {
        ok = false;
      }
      // No second attempt. There used to be a fallback here that published through
      // the Content Studio's own service-role API when the two calls above failed —
      // which is to say, precisely when the authenticated path REFUSED. That made it
      // an authentication bypass by construction: every server-side permission check
      // could be defeated by failing it once. Without a session the link is simply
      // reported as not public, which is the truth.
    }
    setLinkPublic((m) => ({ ...m, [objectId]: ok }));
  };

  const allObjects = useMemo(() => {
    const createdIds = new Set(createdObjects.map((o) => o.id));
    return [
      ...createdObjects,
      ...OBJECTS.filter((o) => !createdIds.has(o.id) && objectCollectionIds(o).length > 0),
    ];
  }, [createdObjects]);

  const countsByCollection = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of allObjects) {
      for (const cid of objectCollectionIds(o)) {
        map.set(cid, (map.get(cid) || 0) + 1);
      }
    }
    return map;
  }, [allObjects]);

  const collectionObjects = useMemo(() => {
    if (!opened) return [] as LearningObject[];
    return allObjects.filter((o) => objectCollectionIds(o).includes(opened.id));
  }, [allObjects, opened]);

  useEffect(() => subscribeObjectOrder(() => setOrderTick((n) => n + 1)), []);

  /** The author's saved order for this folder, ahead of any filtering. */
  const orderedCollectionObjects = useMemo(() => {
    if (!opened) return collectionObjects;
    return applyObjectOrder(activeUserId, opened.id, collectionObjects);
  }, [collectionObjects, opened, activeUserId, orderTick]);

  const listObjects = useMemo(() => {
    return orderedCollectionObjects.filter((o) => {
      const matchSearch = o.title.toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === 'all' || o.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [orderedCollectionObjects, search, filterStatus]);

  /**
   * Reordering is only offered on the unfiltered list: a partial view cannot
   * express a total order, and dropping row 2 onto row 5 of a filtered list
   * would move it somewhere the author cannot see.
   */
  const canReorder = !!opened && !search.trim() && filterStatus === 'all';

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleReorder = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!opened || !over || active.id === over.id) return;
    const ids = orderedCollectionObjects.map((o) => o.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    setObjectOrder(activeUserId, opened.id, arrayMove(ids, from, to));
    setOrderTick((n) => n + 1);
  };

  const openFolder = (id: string) => {
    setSelectedFolderId(id);
    setOpenedCollectionId(id);
    setActiveObjectCollectionId(id);
    setViewMode('folders');
    setSearch('');
    setFilterStatus('all');
    setCollectionSearch('');
  };

  const closeCollection = () => {
    setOpenedCollectionId(null);
    setSelectedFolderId(null);
    setViewMode('folders');
    setSearch('');
    setFilterStatus('all');
    setCollectionSearch('');
  };

  const goBack = () => {
    if (!opened) return;
    if (opened.parentId) openFolder(opened.parentId);
    else closeCollection();
  };

  const savedCount = createdObjects.length;
  const draftCount = createdObjects.filter((o) => isDraftStatus(o.status)).length;

  const canEdit = (item: { id: string; type?: ObjectType }) =>
    !!item.type && (
      item.type === 'tutorial'
      || item.type === 'tutorial-v2'
      || item.type === 'tutorial-v3'
      || item.type === 'flashcard-set'
      || item.type === 'quiz'
      || item.type === 'concept-card'
      || item.type === 'summary'
      || item.type === 'reflection'
      || item.type === 'assignment'
      || item.type === 'drill'
      || item.type === 'video-script'
      || createdObjects.some((o) => o.id === item.id)
    );

  const commitRename = () => {
    if (!renamingId || !renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    renameObjectCollection(renamingId, renameValue.trim());
    setRenamingId(null);
  };

  /** Flat list for membership menu, indented by depth. */
  const collectionsForMenu = useMemo(() => {
    const out: { id: string; name: string; depth: number }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      const kids = parentId == null
        ? getRootCollections(objectCollections)
        : getChildCollections(objectCollections, parentId);
      for (const c of kids) {
        out.push({ id: c.id, name: c.name, depth });
        walk(c.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [objectCollections]);

  const renderFolderTile = (col: typeof objectCollections[0], i: number, theme: 'dark' | 'light' = 'dark') => (
    <motion.div
      key={col.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.03 }}
    >
      <GlassFolderTile
        id={col.id}
        name={col.name}
        count={countsByCollection.get(col.id) || 0}
        selected={selectedFolderId === col.id}
        theme={theme}
        onClick={() => setSelectedFolderId(col.id)}
        onDoubleClick={() => openFolder(col.id)}
        onRename={isBuiltinObjectCollection(col.id)
          ? undefined
          : () => { setRenamingId(col.id); setRenameValue(col.name); }}
        onDelete={() => {
          void (async () => {
            if (isBuiltinObjectCollection(col.id)) return;
            const kids = getChildCollections(objectCollections, col.id).length;
            const ok = await confirm({
              description: kids
                ? `Delete “${col.name}”? ${kids} subfolder${kids === 1 ? '' : 's'} move up one level. Content stays in any other collections they’re in.`
                : `Delete “${col.name}”? Content stays in any other collections they’re in.`,
            });
            if (ok) {
              const wasOpen = openedCollectionId === col.id;
              const parent = col.parentId;
              deleteObjectCollection(col.id);
              if (wasOpen) {
                if (parent) openFolder(parent);
                else closeCollection();
              }
            }
          })();
        }}
        canDelete={objectCollections.length > 1 && !isBuiltinObjectCollection(col.id)}
        renaming={renamingId === col.id}
        renameValue={renameValue}
        onRenameValueChange={setRenameValue}
        onCommitRename={commitRename}
        onCancelRename={() => setRenamingId(null)}
      />
    </motion.div>
  );

  const renderObjectRows = (items: LearningObject[]) => (
    <DndContext
      sensors={dndSensors}
      collisionDetection={closestCenter}
      onDragEnd={handleReorder}
    >
    <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
    <div
      className="rounded-[22px] overflow-hidden"
      style={{ background: 'white', boxShadow: '0 4px 20px -8px rgba(30,50,80,0.12)' }}
    >
      {items.map((item, idx) => {
        const draft = isDraftStatus(item.status);
        return (
          <SortableObjectRow
            key={item.id}
            id={item.id}
            reorderable={canReorder}
            isLast={idx === items.length - 1}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: draft ? 'rgba(217,119,6,0.1)' : 'rgba(11,18,32,0.05)', color: draft ? '#D97706' : '#6B7280' }}
              title={item.type}
            >
              {TYPE_ICONS[item.type] || <FileText size={14} />}
            </div>
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 13.5, fontWeight: 550, color: '#0B1220' }}>{item.title}</p>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>
                  {item.ownerName} · {item.type}
                </p>
                {draft && (
                  <span
                    className="inline-flex items-center gap-1"
                    style={{ fontSize: 10.5, fontWeight: 650, color: '#B45309', letterSpacing: '0.02em' }}
                  >
                    <FilePenLine size={11} />
                    Draft
                  </span>
                )}
              </div>
            </div>
            <StatusPill status={item.status} />
            {objectCollections.length > 1 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCollectionsMenuFor((id) => (id === item.id ? null : item.id))}
                  className="rounded-lg px-2 py-1 inline-flex items-center gap-1"
                  style={{ fontSize: 11, color: '#6B7280', border: '1px solid rgba(0,0,0,0.06)' }}
                  title="Collections"
                >
                  <FolderOpen size={11} />
                  {objectCollectionIds(item).length}
                </button>
                {collectionsMenuFor === item.id && (
                  <div
                    className="absolute right-0 top-full mt-1 z-20 w-52 rounded-xl p-2"
                    style={{ background: 'white', boxShadow: '0 12px 32px -10px rgba(30,50,80,0.28)', border: '1px solid rgba(0,0,0,0.06)' }}
                  >
                    <p style={{ fontSize: 10.5, fontWeight: 650, color: '#9AA3AF', letterSpacing: '0.04em', textTransform: 'uppercase', margin: '2px 6px 8px' }}>
                      In collections
                    </p>
                    {collectionsForMenu.map((c) => {
                      const ids = objectCollectionIds(item);
                      const on = ids.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            const next = on
                              ? ids.filter((x) => x !== c.id)
                              // Newly checked folder becomes primary (first) for save → library deep-link.
                              : [c.id, ...ids.filter((x) => x !== c.id)];
                            if (!next.length) return;
                            setObjectCollectionIds(item.id, next);
                          }}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-gray-50"
                          style={{ paddingLeft: 8 + c.depth * 12 }}
                        >
                          <GlassFolder id={c.id} size={22} />
                          <span className="truncate flex-1" style={{ fontSize: 12.5, color: '#0B1220' }}>{c.name}</span>
                          {on && <Check size={12} className="text-[#0B1220]" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <span style={{ fontSize: 11.5, color: '#C4CBD4', minWidth: 32, textAlign: 'right' }}>
              ×{item.reuseCount}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void copyObjectUrl(item.id)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100 text-[#9AA3AF]"
                title={
                  copiedId !== item.id
                    ? 'Copy content URL'
                    : linkPublic[item.id] === false
                      ? 'Copied — but this link only opens in this browser (publishing failed; sign in with authoring access)'
                      : 'Copied — this link opens anywhere'
                }
              >
                {copiedId === item.id ? (
                  <Check
                    size={13}
                    className={linkPublic[item.id] === false ? 'text-amber-600' : 'text-emerald-600'}
                  />
                ) : (
                  <Link2 size={13} />
                )}
              </button>
              <button
                type="button"
                onClick={() => openReader(item.id)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100 text-[#9AA3AF]"
                title="Student preview"
              >
                <Eye size={13} />
              </button>
              {/* Shown to anyone who may SEE the grants; the modal itself goes
                  read-only when they may not change them, so "who can see this?"
                  stays answerable without also being editable. */}
              {canViewShares && (
                <button
                  type="button"
                  onClick={() => setSharingFor(item)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100 text-[#9AA3AF]"
                  title={canShareClubs ? 'Share with clubs' : 'Who can see this'}
                >
                  <Users size={13} />
                </button>
              )}
              {canFileToLibrary && (
                <button
                  type="button"
                  onClick={() => setFilingFor(item)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100 text-[#9AA3AF]"
                  title="Publish to a Content Library folder"
                >
                  <FolderInput size={13} />
                </button>
              )}
              {canEdit(item) && (
                <button
                  type="button"
                  onClick={() => openEditor(item.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100 text-[#9AA3AF]"
                  title="Continue editing"
                >
                  <PenLine size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={() => saveNewVersion(item)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100 text-[#9AA3AF]"
                title="Save as new version"
              >
                <GitBranch size={13} />
              </button>
              {/* PUBLISH, said out loud.
                  The action already existed and was reachable only behind the history
                  icon below — an author looking for "how do I make this appear in the
                  app" had no reason to open a version list to find it. Same modal, same
                  action; this is a signpost, not a second flow. The label switches to
                  Published once a version is live, so the row states the fact rather
                  than inviting the same click twice. */}
              <button
                type="button"
                onClick={() => setVersionsFor(item)}
                className={`h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-semibold transition-colors ${
                  publishedVersion(item.id)
                    ? 'text-emerald-700 hover:bg-emerald-50'
                    : 'text-[#0B0F1A] hover:bg-gray-100'
                }`}
                title={
                  publishedVersion(item.id)
                    ? 'Published — open versions to change or withdraw it'
                    : 'Publish a version so readers can see it'
                }
              >
                <Upload size={12} />
                {publishedVersion(item.id) ? 'Published' : 'Publish'}
              </button>
              <button
                type="button"
                onClick={() => setVersionsFor(item)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100 text-[#9AA3AF] relative"
                title="Version history"
              >
                <History size={13} />
                {versionCount(item.id) > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full flex items-center justify-center"
                    style={{ background: '#0B0F1A', color: '#fff', fontSize: 9, fontWeight: 700 }}
                  >
                    {versionCount(item.id)}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => removeOrDeleteObject(item)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-50"
                style={{ color: '#EF4444' }}
                title={
                  opened && objectCollectionIds(item).filter((cid) => cid !== opened.id).length > 0
                    ? 'Remove from this folder'
                    : 'Delete from library'
                }
              >
                <Trash2 size={13} />
              </button>
            </div>
          </SortableObjectRow>
        );
      })}
    </div>
    </SortableContext>
    </DndContext>
  );

  return (
    <div className="px-4 sm:px-6 py-5 sm:py-6 w-full">
      {versionToast && (
        <div
          className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 px-4 py-2.5 rounded-full text-white shadow-lg"
          style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600 }}
        >
          {versionToast}
        </div>
      )}
      {versionsFor && (
        <ObjectVersionsModal object={versionsFor} onClose={() => setVersionsFor(null)} />
      )}
      {filingFor && (
        <PublishToLibraryModal
          objectId={filingFor.id}
          objectTitle={filingFor.title}
          currentCollectionIds={objectCollectionIds(filingFor)}
          onClose={() => setFilingFor(null)}
          onSaved={(names) => {
            setVersionToast(
              names.length
                ? `Published to ${names.join(', ')}`
                : 'Removed from the Content Library',
            );
            window.setTimeout(() => setVersionToast(null), 2600);
          }}
        />
      )}
      {sharingFor && (
        <ShareWithClubsModal
          objectId={sharingFor.id}
          objectTitle={sharingFor.title}
          canShare={canShareClubs}
          canTargetApp={canTargetApp}
          onClose={() => setSharingFor(null)}
        />
      )}
      {savedCount > 0 && !opened && (
        <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 12 }}>
          <span style={{ fontWeight: 650, color: '#0B1220' }}>{savedCount} saved</span>
          {' '}across your collections
          {draftCount > 0 && (
            <> · <span style={{ fontWeight: 650, color: '#0B1220' }}>{draftCount} draft{draftCount === 1 ? '' : 's'}</span></>
          )}
        </p>
      )}

      {/* Root directory — hidden while inside a collection */}
      {!opened && (
        <section
          className="mb-6 rounded-[28px] p-5"
          style={{
            background: 'linear-gradient(165deg, rgba(28,33,48,0.94) 0%, rgba(18,22,34,0.96) 55%, rgba(12,14,22,0.98) 100%)',
            boxShadow: '0 20px 48px -20px rgba(15,20,35,0.55)',
          }}
        >
          <div className="flex items-center justify-between gap-3 mb-4 px-1 flex-wrap">
            <div>
              <p style={{ fontSize: 11.5, fontWeight: 650, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Directory
              </p>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.2px', marginTop: 2 }}>
                Collections
              </h2>
              <p style={{ fontSize: 12.5, color: 'rgba(248,250,252,0.45)', marginTop: 4 }}>
                Double-click a folder to open it · nest folders inside folders
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 flex-1 justify-end min-w-0">
              <div
                className="flex items-center gap-2 px-3.5 py-2 rounded-full flex-1 max-w-xs"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                <Search size={14} style={{ color: 'rgba(248,250,252,0.45)', flexShrink: 0 }} />
                <input
                  value={collectionSearch}
                  onChange={(e) => setCollectionSearch(e.target.value)}
                  placeholder="Search folders…"
                  className="flex-1 bg-transparent outline-none placeholder:text-white/35"
                  style={{ fontSize: 13, color: '#F8FAFC' }}
                />
              </div>
              <LibraryNewMenu
                dark
                folderName={null}
                onNewFolder={() => setShowNewCol(true)}
                onCreate={(type) => createInFolder(type, null)}
              />
              {/* This downloads EVERY object and folder in one click. It ran
                  ungoverned until learning.library.export existed — a purely
                  client-side blob, so no server check ever saw it, which is
                  exactly why the gate has to be right here. */}
              {canExport && (
                <button
                  type="button"
                  onClick={() => exportLibrarySnapshot(activeUserId, createdObjects || [])}
                  title="Download the whole library (folders + content) as a snapshot JSON — commit it as src/lib/seed/librarySnapshot.json to make it the baseline for every visitor."
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full shrink-0"
                  style={{ background: 'rgba(255,255,255,0.12)', color: '#F8FAFC', fontSize: 12.5, fontWeight: 600, border: '1px solid rgba(255,255,255,0.14)' }}
                >
                  <Download size={14} /> Export snapshot
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-5 justify-start">
            {rootFolders.map((col, i) => renderFolderTile(col, i, 'dark'))}

            {!collectionSearch.trim() && (
              <button
                type="button"
                onClick={() => setShowNewCol(true)}
                className="flex flex-col items-center justify-start w-[108px] gap-2 rounded-2xl px-2 pt-2 pb-1"
                style={{ border: '1.5px dashed rgba(255,255,255,0.18)' }}
              >
                <div
                  className="flex items-center justify-center rounded-2xl"
                  style={{ width: 86, height: 70, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }}
                >
                  <Plus size={22} />
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>New</span>
              </button>
            )}
          </div>
          {rootFolders.length === 0 && (
            <p className="text-center py-10" style={{ fontSize: 13, color: 'rgba(248,250,252,0.45)' }}>
              {collectionSearch.trim() ? `No folders match “${collectionSearch.trim()}”` : 'No folders yet'}
            </p>
          )}
        </section>
      )}

      {/* Inside a folder */}
      {opened && (
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <button
              type="button"
              onClick={goBack}
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 hover:bg-white"
              style={{ border: '1px solid rgba(0,0,0,0.08)', color: '#6B7280' }}
              title={opened.parentId ? 'Up one folder' : 'Back to directory'}
            >
              <ArrowLeft size={16} />
            </button>
            <GlassFolder id={opened.id} size={40} selected />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                {breadcrumb.map((c, i) => (
                  <React.Fragment key={c.id}>
                    {i > 0 && <span style={{ fontSize: 12, color: '#C4CBD4' }}>/</span>}
                    <button
                      type="button"
                      onClick={() => openFolder(c.id)}
                      className="truncate"
                      style={{
                        fontSize: i === breadcrumb.length - 1 ? 18 : 13,
                        fontWeight: i === breadcrumb.length - 1 ? 700 : 550,
                        color: i === breadcrumb.length - 1 ? '#0B1220' : '#6B7280',
                        letterSpacing: i === breadcrumb.length - 1 ? '-0.3px' : undefined,
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        maxWidth: 180,
                      }}
                    >
                      {c.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>
              <p style={{ fontSize: 13, color: '#9AA3AF', marginTop: 1 }}>
                {viewMode === 'list'
                  ? 'List view · content in this folder'
                  : 'Subfolders + content · double-click a folder to go deeper'}
              </p>
            </div>

            {/* Inside a folder the menu names it, so "Create in “quiz”" is the
                promise — and `pinned` is what keeps it. */}
            <LibraryNewMenu
              folderName={opened?.name ?? null}
              onNewFolder={() => setShowNewCol(true)}
              onCreate={(type) => createInFolder(type, opened?.id ?? null)}
            />

            <div
              className="flex items-center rounded-full p-0.5 shrink-0"
              style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.06)' }}
              role="group"
              aria-label="View mode"
            >
              <button
                type="button"
                onClick={() => setViewMode('folders')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors"
                style={{
                  background: viewMode === 'folders' ? 'white' : 'transparent',
                  boxShadow: viewMode === 'folders' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  fontSize: 12,
                  fontWeight: 650,
                  color: viewMode === 'folders' ? '#0B1220' : '#6B7280',
                }}
                title="Folder view"
              >
                <LayoutGrid size={13} /> Folders
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors"
                style={{
                  background: viewMode === 'list' ? 'white' : 'transparent',
                  boxShadow: viewMode === 'list' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  fontSize: 12,
                  fontWeight: 650,
                  color: viewMode === 'list' ? '#0B1220' : '#6B7280',
                }}
                title="List view"
              >
                <List size={13} /> List
              </button>
            </div>
          </div>

          {viewMode === 'folders' && (
            <section
              className="rounded-[28px] p-5 mb-4"
              style={{
                background: 'linear-gradient(165deg, rgba(28,33,48,0.94) 0%, rgba(18,22,34,0.96) 55%, rgba(12,14,22,0.98) 100%)',
                boxShadow: '0 20px 48px -20px rgba(15,20,35,0.55)',
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-3 px-1">
                <p style={{ fontSize: 11.5, fontWeight: 650, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Subfolders
                </p>
                <button
                  type="button"
                  onClick={() => setShowNewCol(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full"
                  style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(248,250,252,0.85)', border: '1px solid rgba(255,255,255,0.14)' }}
                >
                  <Plus size={12} /> Add
                </button>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-5 justify-start">
                {childFolders.map((col, i) => renderFolderTile(col, i, 'dark'))}
                <button
                  type="button"
                  onClick={() => setShowNewCol(true)}
                  className="flex flex-col items-center justify-start w-[108px] gap-2 rounded-2xl px-2 pt-2 pb-1"
                  style={{ border: '1.5px dashed rgba(255,255,255,0.18)' }}
                >
                  <div
                    className="flex items-center justify-center rounded-2xl"
                    style={{ width: 86, height: 70, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }}
                  >
                    <Plus size={22} />
                  </div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>New</span>
                </button>
              </div>
              {childFolders.length === 0 && (
                <p className="text-center pt-2" style={{ fontSize: 12.5, color: 'rgba(248,250,252,0.4)' }}>
                  No subfolders yet — add one, or keep content directly in this folder below.
                </p>
              )}
            </section>
          )}

          <div className="flex gap-2 mb-4">
            <div
              className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.8)' }}
            >
              <Search size={14} className="text-[#9AA3AF] shrink-0" />
              <input
                className="flex-1 bg-transparent outline-none placeholder:text-[#C4CBD4]"
                style={{ fontSize: 13.5, color: '#0B1220' }}
                placeholder="Search content in this folder…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as ObjectStatus | 'all')}
              className="px-3 py-2 rounded-2xl outline-none cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.8)', fontSize: 13, color: '#374151' }}
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="in-review">In review</option>
              <option value="changes-requested">Changes requested</option>
              <option value="approved">Approved</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <p style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', letterSpacing: '.04em', marginBottom: 8 }}>
            OBJECTS IN THIS FOLDER
          </p>
          {listObjects.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center rounded-[22px]" style={{ background: 'rgba(255,255,255,0.55)', border: '1px dashed rgba(0,0,0,0.1)' }}>
              <FolderOpen size={32} className="text-[#C4CBD4] mb-3" />
              <p style={{ fontSize: 15, fontWeight: 600, color: '#0B1220', marginBottom: 4 }}>
                {search || filterStatus !== 'all' ? 'No content found' : 'No content in this folder yet'}
              </p>
              <p style={{ fontSize: 13, color: '#9AA3AF' }}>
                {search || filterStatus !== 'all'
                  ? 'Try a different search or filter.'
                  : 'Create content and save it into this folder, or nest a subfolder above.'}
              </p>
            </div>
          ) : (
            renderObjectRows(listObjects)
          )}
        </div>
      )}

      {showNewCol && (
        <NewCollectionModal
          parentName={opened?.name}
          onClose={() => setShowNewCol(false)}
          onCreate={(name) => {
            const created = createObjectCollection(name, opened?.id || null);
            setShowNewCol(false);
            if (opened) {
              setSelectedFolderId(created.id);
            } else {
              openFolder(created.id);
            }
          }}
        />
      )}
    </div>
  );
}
