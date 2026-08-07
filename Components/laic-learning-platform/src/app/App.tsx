import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { Role, Program, LearningObject, ObjectType, Version } from '../lib/types';
import { USERS, OBJECTS } from '../lib/data';
import { supabaseEnabled, listObjects, saveObject } from '../lib/supabase';
import {
  loadUserObjects,
  saveUserObjects,
  mergeObjects,
  readSessionUserId,
  writeSessionUserId,
  isDemoCdUser,
  loadDemoCdLibrary,
  remoteObjectsForDemoCd,
  DEMO_CD_USER_ID,
} from '../lib/demoAuth';
import {
  type ObjectCollection,
  getObjectCollections,
  createObjectCollection as storeCreateObjectCollection,
  renameObjectCollection as storeRenameObjectCollection,
  deleteObjectCollection as storeDeleteObjectCollection,
  getActiveObjectCollectionId,
  setActiveObjectCollectionId as storeSetActiveObjectCollectionId,
  ensureDefaultObjectCollection,
  subscribeObjectCollections,
  objectCollectionIds,
  BB_TUTORIALS_COLLECTION_ID,
  BB_TUTORIALS_LEGACY_COLLECTION_ID,
} from '../lib/objectCollectionsStore';
import { mergeBbTutorialsIntoLibrary } from '../lib/bbTutorialsSeed';
import {
  syncWorkingVersion,
  saveAsNewVersion as storeSaveAsNewVersion,
  setVersionLocked as storeSetVersionLocked,
  deleteVersion as storeDeleteVersion,
  deleteVersionsForObject as storeDeleteVersionsForObject,
  listVersionsForObject,
  listAllVersions,
  subscribeObjectVersions,
} from '../lib/objectVersionsStore';
import { LoginPortal } from './components/LoginPortal';
import { Layout } from './components/Layout';
import { ConfirmProvider } from './components/ConfirmDialog';
import { ObjectEmbedPage } from './components/screens/ObjectEmbedPage';
import { parseObjectEmbedId } from '../lib/objectUrls';
import {
  consumeLaunchFromUrl,
  fetchLearningContext,
  contextToRole,
  signOutToNexus,
} from '../lib/nexus';
import { navItemsForPerms, type AreaLevel } from '../lib/learningAreas';
import { defaultScreenForCapabilities } from '../lib/roleAccess';

export interface AppState {
  role: Role;
  program: Program;
  currentScreen: string;
  activeUserId: string;
  isLoggedIn: boolean;
  /** True when the session came from a Nexus launch (vs the demo picker). */
  nexusMode: boolean;
  /** Custom-role area perms (null = admin/none); admins see everything. */
  learningPerms: Record<string, AreaLevel> | null;
  learningIsAdmin: boolean;
  /** Effective learning-catalogue capability ids from Nexus (null = admin/demo). */
  learningCapabilities: string[] | null;
  /** Admin "Test as" a role: preview the app confined to that role's perms. */
  previewName: string | null;
  startRolePreview: (name: string, perms: Record<string, AreaLevel>) => void;
  stopRolePreview: () => void;
  /** Identity from the Nexus launch (null in standalone demo mode). */
  nexusProgramName: string | null;
  nexusUserName: string | null;
  nexusUserRole: string | null;
  readerObjectId: string | null;
  /** When set with readerObjectId, LearnerReader shows that version’s snapshot. */
  readerVersionId: string | null;
  creatorObjectType: string;
  createdObjects: LearningObject[];
  /** Bumps when local version history changes (for library UI refresh). */
  objectVersionsTick: number;
  listObjectVersions: (objectId: string) => Version[];
  listAllObjectVersions: () => Version[];
  saveObjectAsNewVersion: (objectId: string, notes?: string) => Version | null;
  lockObjectVersion: (versionId: string, locked: boolean) => Version | null;
  deleteObjectVersion: (versionId: string) => { ok: boolean; error?: string };
  openReaderVersion: (objectId: string, versionId: string) => void;
  /** Named Object Library collections (user-defined folders). */
  objectCollections: ObjectCollection[];
  /** Library rail: which collection is open for browsing. */
  activeObjectCollectionId: string | null;
  setActiveObjectCollectionId: (id: string) => void;
  /** Collections chosen on Create for the next new object (multi-select). */
  createCollectionIds: string[];
  setCreateCollectionIds: (ids: string[]) => void;
  createObjectCollection: (name: string, parentId?: string | null) => ObjectCollection;
  renameObjectCollection: (id: string, name: string) => void;
  deleteObjectCollection: (id: string) => void;
  setObjectCollectionIds: (objectId: string, collectionIds: string[]) => void;
  /** Permanently remove user-created content from the library. */
  deleteCreatedObject: (objectId: string) => { ok: boolean; error?: string };
  /** When set, ObjectCreator opens this library content for editing. */
  editingObjectId: string | null;
  /** Template id chosen in Template Library before opening the creator. */
  pendingTemplateId: string | null;
  navigate: (screen: string) => void;
  login: (userId: string) => void;
  logout: () => void;
  setRole: (role: Role) => void;
  setProgram: (program: Program) => void;
  openReader: (objectId: string) => void;
  closeReader: () => void;
  setCreatorObjectType: (type: string) => void;
  setPendingTemplateId: (id: string | null) => void;
  addObject: (partial: Partial<LearningObject> & { type: ObjectType; title: string }) => string;
  openEditor: (objectId: string) => void;
  clearEditingObject: () => void;
}

export const AppContext = createContext<AppState>({} as AppState);
export const useApp = () => useContext(AppContext);

const DEFAULT_SCREEN: Record<Role, string> = {
  'content-developer': 'cd-library',
  'object-reviewer': 'or-reviews',
  'course-reviewer': 'cr-reviews',
  'administrator': 'admin-overview',
  'coach': 'coach',
  'student': 'student-dashboard',
};

function objectsForUser(all: LearningObject[], userId: string): LearningObject[] {
  if (isDemoCdUser(userId)) return remoteObjectsForDemoCd(all);
  return all.filter((o) => o.ownerId === userId);
}

export default function App() {
  // Standalone object-embed route (URL-driven) renders before the studio shell,
  // so the check stays outside the hook-bearing StudioApp (rules of hooks).
  const embedObjectId = typeof window !== 'undefined' ? parseObjectEmbedId() : null;
  if (embedObjectId) return <ObjectEmbedPage objectId={embedObjectId} />;
  return <StudioApp />;
}

function StudioApp() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeUserId, setActiveUserId] = useState('riya');
  const [role, setRoleState] = useState<Role>('student');
  const [program, setProgramState] = useState<Program>('bridge');
  const [currentScreen, setCurrentScreen] = useState('student-dashboard');
  const [readerObjectId, setReaderObjectId] = useState<string | null>(null);
  const [readerVersionId, setReaderVersionId] = useState<string | null>(null);
  const [objectVersionsTick, setObjectVersionsTick] = useState(0);
  const [creatorObjectType, setCreatorObjectTypeState] = useState<string>('lesson');
  const [createdObjects, setCreatedObjects] = useState<LearningObject[]>([]);
  const [editingObjectId, setEditingObjectId] = useState<string | null>(null);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  /** Only persist to localStorage after the library for this user has been loaded. */
  const [libraryReady, setLibraryReady] = useState(false);
  const [nexusMode, setNexusMode] = useState(false);
  const [learningPerms, setLearningPerms] = useState<Record<string, AreaLevel> | null>(null);
  const [learningIsAdmin, setLearningIsAdmin] = useState(false);
  const [learningCapabilities, setLearningCapabilities] = useState<string[] | null>(null);
  const [previewPerms, setPreviewPerms] = useState<Record<string, AreaLevel> | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [nexusProgramName, setNexusProgramName] = useState<string | null>(null);
  const [nexusUserName, setNexusUserName] = useState<string | null>(null);
  const [nexusUserRole, setNexusUserRole] = useState<string | null>(null);
  /** Gate first paint until we know whether this is a Nexus launch. */
  const [booting, setBooting] = useState(true);

  const activeUserIdRef = useRef(activeUserId);
  const createdObjectsRef = useRef(createdObjects);
  const hydrateGenRef = useRef(0);
  activeUserIdRef.current = activeUserId;
  createdObjectsRef.current = createdObjects;

  const [objectCollections, setObjectCollections] = useState<ObjectCollection[]>([]);
  const [activeObjectCollectionId, setActiveObjectCollectionIdState] = useState<string | null>(null);
  const [createCollectionIds, setCreateCollectionIdsState] = useState<string[]>([]);
  const createCollectionIdsRef = useRef<string[]>([]);
  createCollectionIdsRef.current = createCollectionIds;

  const refreshObjectCollections = useCallback((userId: string) => {
    const list = ensureDefaultObjectCollection(userId);
    setObjectCollections(list);
    const active = getActiveObjectCollectionId(userId) || list[0]?.id || null;
    setActiveObjectCollectionIdState(active);
    setCreateCollectionIdsState((prev) => {
      const valid = prev.filter((id) => list.some((c) => c.id === id));
      if (valid.length) return valid;
      return active ? [active] : (list[0] ? [list[0].id] : []);
    });
  }, []);

  /** Stamp objects missing collections into the user's default collection; normalize legacy ids. */
  const withCollectionIds = useCallback((userId: string, objs: LearningObject[]): LearningObject[] => {
    const cols = ensureDefaultObjectCollection(userId);
    const colSet = new Set(cols.map((c) => c.id));
    const fallback = getActiveObjectCollectionId(userId) || cols[0]?.id;
    if (!fallback) return objs;
    let changed = false;
    const next = objs.map((o) => {
      const ids = objectCollectionIds(o)
        .map((id) => (id === BB_TUTORIALS_LEGACY_COLLECTION_ID ? BB_TUTORIALS_COLLECTION_ID : id))
        .filter((id) => colSet.has(id));
      const normalized = ids.length ? ids : [fallback];
      const same =
        o.collectionIds?.length === normalized.length
        && normalized.every((id, i) => o.collectionIds?.[i] === id)
        && !o.collectionId;
      if (same) return o;
      changed = true;
      return { ...o, collectionIds: normalized, collectionId: undefined };
    });
    return changed ? next : objs;
  }, []);

  const hydrateForUser = useCallback(async (userId: string) => {
    const gen = ++hydrateGenRef.current;
    setLibraryReady(false);
    refreshObjectCollections(userId);

    const localRaw = isDemoCdUser(userId) ? loadDemoCdLibrary() : loadUserObjects(userId);
    const local = mergeBbTutorialsIntoLibrary(userId, withCollectionIds(userId, localRaw));
    if (gen !== hydrateGenRef.current) return;
    setCreatedObjects(local);
    if (local !== localRaw) {
      saveUserObjects(userId, local);
    }
    // Local load is enough to start persisting again (don't wait on network).
    setLibraryReady(true);

    if (!supabaseEnabled()) return;
    try {
      const remote = objectsForUser(await listObjects(), userId);
      if (gen !== hydrateGenRef.current) return;
      const claimedRemote = isDemoCdUser(userId)
        ? remote.map((o) => ({
            ...o,
            ownerId: DEMO_CD_USER_ID,
            ownerName: o.ownerName || 'Course Dev Demo',
          }))
        : remote;
      const merged = mergeBbTutorialsIntoLibrary(
        userId,
        withCollectionIds(userId, mergeObjects(local, claimedRemote)),
      );
      setCreatedObjects(merged);
      if (merged.length > 0) saveUserObjects(userId, merged);
    } catch (err: any) {
      console.warn('[supabase] could not load objects:', err?.message || err);
    }
  }, [refreshObjectCollections, withCollectionIds]);

  // Keep collection list in sync when Create / Library mutate the store.
  useEffect(() => {
    if (!isLoggedIn) return;
    return subscribeObjectCollections(() => refreshObjectCollections(activeUserIdRef.current));
  }, [isLoggedIn, refreshObjectCollections]);

  useEffect(() => {
    if (!isLoggedIn) return;
    return subscribeObjectVersions(() => setObjectVersionsTick((n) => n + 1));
  }, [isLoggedIn]);

  // Persist only after hydrate — writing [] on login was wiping the demo library.
  useEffect(() => {
    if (!isLoggedIn || !libraryReady) return;
    if (createdObjects.length === 0) return;
    saveUserObjects(activeUserId, createdObjects);
  }, [isLoggedIn, activeUserId, createdObjects, libraryReady]);

  // Flush on tab close / refresh so mid-session saves aren't lost.
  useEffect(() => {
    const flush = () => {
      if (!isLoggedIn || !libraryReady) return;
      if (createdObjectsRef.current.length === 0) return;
      saveUserObjects(activeUserIdRef.current, createdObjectsRef.current);
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [isLoggedIn, libraryReady]);

  // Boot: a Nexus launch takes precedence over the demo picker. Exchange any
  // launch token, then read /learning/context; if we have one, sign in as that
  // Nexus identity/role. Otherwise fall back to restoring the demo session.
  useEffect(() => {
    let live = true;
    (async () => {
      await consumeLaunchFromUrl();
      const ctx = await fetchLearningContext();
      if (!live) return;
      if (ctx) {
        const r = contextToRole(ctx);
        const uid = ctx.nexusUserId || 'nexus';
        const isAdmin = ctx.is_admin ?? r === 'administrator';
        const perms = ctx.learning_role?.perms ?? null;
        const caps = isAdmin ? null : (ctx.capabilities ?? null);
        setNexusMode(true);
        setLearningIsAdmin(isAdmin);
        setLearningPerms(perms);
        setLearningCapabilities(caps);
        setNexusProgramName(ctx.program_name ?? null);
        setNexusUserName(ctx.displayName ?? null);
        setNexusUserRole(isAdmin ? 'Administrator' : (ctx.learning_role?.role_name ?? ctx.role_name ?? 'Member'));
        setActiveUserId(uid);
        setRoleState(r);
        // Land on the first screen the person's access exposes. Members are gated
        // by their effective capabilities (Access Catalogue); admins land on the
        // program overview. Fall back to the legacy area-perms nav.
        const nav = navItemsForPerms(perms, isAdmin);
        const memberLanding = caps?.length ? defaultScreenForCapabilities(caps) : (nav[0]?.id ?? DEFAULT_SCREEN[r]);
        setCurrentScreen(isAdmin ? 'admin-overview' : memberLanding);
        setIsLoggedIn(true);
        void hydrateForUser(uid);
        setBooting(false);
        return;
      }
      // No Nexus session — restore the demo session if present.
      const uid = readSessionUserId();
      const user = uid ? USERS.find((u) => u.id === uid) : undefined;
      if (uid && user) {
        setActiveUserId(uid);
        setRoleState(user.role);
        setCurrentScreen(DEFAULT_SCREEN[user.role]);
        setIsLoggedIn(true);
        void hydrateForUser(uid);
      } else if (uid) {
        writeSessionUserId(null);
      }
      setBooting(false);
    })();
    return () => {
      live = false;
    };
  }, [hydrateForUser]);

  const login = useCallback((userId: string) => {
    const user = USERS.find(u => u.id === userId);
    if (!user) return;
    setLibraryReady(false);
    setActiveUserId(userId);
    setRoleState(user.role);
    setCurrentScreen(DEFAULT_SCREEN[user.role]);
    setReaderObjectId(null);
    setEditingObjectId(null);
    setIsLoggedIn(true);
    writeSessionUserId(userId);
    void hydrateForUser(userId);
  }, [hydrateForUser]);

  const logout = useCallback(() => {
    const uid = activeUserIdRef.current;
    const objs = createdObjectsRef.current;
    if (objs.length > 0) saveUserObjects(uid, objs);
    // Nexus-launched sessions return to the org's own gate; the demo picker
    // just clears local state.
    if (nexusMode) {
      signOutToNexus();
      return;
    }
    writeSessionUserId(null);
    setLibraryReady(false);
    setIsLoggedIn(false);
    setReaderObjectId(null);
    setEditingObjectId(null);
    setCreatedObjects([]);
  }, [nexusMode]);

  const navigate = useCallback((screen: string) => {
    setCurrentScreen(screen);
    setReaderObjectId(null);
    if (screen !== 'cd-creator') setEditingObjectId(null);
  }, []);

  const setRole = useCallback((newRole: Role) => {
    setRoleState(newRole);
    setCurrentScreen(DEFAULT_SCREEN[newRole]);
    setReaderObjectId(null);
    const match =
      newRole === 'content-developer'
        ? USERS.find((u) => u.id === DEMO_CD_USER_ID) || USERS.find((u) => u.role === newRole)
        : USERS.find((u) => u.role === newRole);
    if (match) {
      // Persist current library before switching identity.
      if (libraryReady && createdObjectsRef.current.length > 0) {
        saveUserObjects(activeUserIdRef.current, createdObjectsRef.current);
      }
      setLibraryReady(false);
      setActiveUserId(match.id);
      writeSessionUserId(match.id);
      void hydrateForUser(match.id);
    }
  }, [hydrateForUser, libraryReady]);

  const setProgram = useCallback((p: Program) => {
    setProgramState(p);
  }, []);

  const openReader = useCallback((objectId: string) => {
    setReaderVersionId(null);
    setReaderObjectId(objectId);
  }, []);

  const openReaderVersion = useCallback((objectId: string, versionId: string) => {
    setReaderVersionId(versionId);
    setReaderObjectId(objectId);
  }, []);

  const closeReader = useCallback(() => {
    setReaderObjectId(null);
    setReaderVersionId(null);
  }, []);

  const setCreatorObjectType = useCallback((type: string) => {
    setCreatorObjectTypeState(type);
  }, []);

  const addObject = useCallback((partial: Partial<LearningObject> & { type: ObjectType; title: string }) => {
    const ownerId = activeUserIdRef.current;
    const user = USERS.find(u => u.id === ownerId);
    const now = new Date().toISOString().slice(0, 10);
    const id = partial.id || `obj-new-${Date.now()}`;
    const cols = ensureDefaultObjectCollection(ownerId);
    const fallback = getActiveObjectCollectionId(ownerId) || cols[0]?.id;
    setCreatedObjects(prev => {
      const existing = prev.find(o => o.id === id);
      const fromPartial = objectCollectionIds(partial);
      const fromExisting = existing ? objectCollectionIds(existing) : [];
      const fromCreate = createCollectionIdsRef.current.filter((cid) => cols.some((c) => c.id === cid));
      const collectionIds =
        fromPartial.length
          ? fromPartial
          : (fromExisting.length ? fromExisting : (fromCreate.length ? fromCreate : (fallback ? [fallback] : [])));
      const obj: LearningObject = {
        id,
        type: partial.type,
        title: partial.title || 'Untitled',
        ownerId: existing?.ownerId || ownerId,
        ownerName: existing?.ownerName || user?.name || 'You',
        status: partial.status || 'draft',
        scope: partial.scope || existing?.scope || 'bridge',
        reuseCount: partial.reuseCount ?? existing?.reuseCount ?? 0,
        description: partial.description || '',
        estimatedTime: partial.estimatedTime || '10 min',
        blocks: partial.blocks || [],
        createdAt: existing?.createdAt || partial.createdAt || now,
        updatedAt: now,
        tags: partial.tags || [],
        sourceIds: partial.sourceIds ?? existing?.sourceIds ?? [],
        collectionIds,
        collectionId: undefined,
        pipelineDraft: partial.pipelineDraft !== undefined ? partial.pipelineDraft : existing?.pipelineDraft,
        tutorialV2Draft: (partial as any).tutorialV2Draft !== undefined
          ? (partial as any).tutorialV2Draft
          : (existing as any)?.tutorialV2Draft,
      };
      const nextList = [obj, ...prev.filter(o => o.id !== id)];
      const result = saveUserObjects(ownerId, nextList);
      if (!result.ok) {
        console.warn('[addObject] local persist failed:', result.error);
      }
      try {
        syncWorkingVersion(ownerId, obj, obj.ownerName || user?.name || 'You');
      } catch (err: any) {
        console.warn('[versions] sync failed:', err?.message || err);
      }
      if (supabaseEnabled()) {
        saveObject(obj).catch(err => console.warn('[nexus] could not save object:', err?.message || err));
      }
      return nextList;
    });
    // Ensure subsequent effect-based saves are allowed (e.g. first object after empty hydrate).
    setLibraryReady(true);
    return id;
  }, []);

  const listObjectVersions = useCallback((objectId: string) => {
    return listVersionsForObject(activeUserIdRef.current, objectId);
  }, [objectVersionsTick]);

  const listAllObjectVersions = useCallback(() => {
    return listAllVersions(activeUserIdRef.current);
  }, [objectVersionsTick]);

  const saveObjectAsNewVersion = useCallback((objectId: string, notes?: string) => {
    const ownerId = activeUserIdRef.current;
    const obj = createdObjectsRef.current.find((o) => o.id === objectId)
      || OBJECTS.find((o) => o.id === objectId);
    if (!obj) return null;
    const user = USERS.find((u) => u.id === ownerId);
    return storeSaveAsNewVersion(ownerId, obj, obj.ownerName || user?.name || 'You', notes);
  }, []);

  const lockObjectVersion = useCallback((versionId: string, locked: boolean) => {
    return storeSetVersionLocked(activeUserIdRef.current, versionId, locked);
  }, []);

  const deleteObjectVersion = useCallback((versionId: string) => {
    return storeDeleteVersion(activeUserIdRef.current, versionId);
  }, []);

  const setActiveObjectCollectionId = useCallback((id: string) => {
    storeSetActiveObjectCollectionId(activeUserIdRef.current, id);
    setActiveObjectCollectionIdState(id);
  }, []);

  const setCreateCollectionIds = useCallback((ids: string[]) => {
    const unique = [...new Set(ids.filter(Boolean))];
    setCreateCollectionIdsState(unique);
    if (unique[0]) {
      storeSetActiveObjectCollectionId(activeUserIdRef.current, unique[0]);
      setActiveObjectCollectionIdState(unique[0]);
    }
  }, []);

  const createObjectCollection = useCallback((name: string, parentId?: string | null) => {
    const created = storeCreateObjectCollection(activeUserIdRef.current, name, parentId);
    refreshObjectCollections(activeUserIdRef.current);
    return created;
  }, [refreshObjectCollections]);

  const renameObjectCollection = useCallback((id: string, name: string) => {
    storeRenameObjectCollection(activeUserIdRef.current, id, name);
    refreshObjectCollections(activeUserIdRef.current);
  }, [refreshObjectCollections]);

  const deleteObjectCollection = useCallback((id: string) => {
    const uid = activeUserIdRef.current;
    const remaining = getObjectCollections(uid).filter((c) => c.id !== id);
    const fallback = remaining[0]?.id;
    storeDeleteObjectCollection(uid, id);
    // Drop deleted id from membership; ensure every object stays in at least one collection.
    if (fallback) {
      setCreatedObjects((prev) => {
        const next = prev.map((o) => {
          const ids = objectCollectionIds(o).filter((cid) => cid !== id);
          return {
            ...o,
            collectionIds: ids.length ? ids : [fallback],
            collectionId: undefined,
          };
        });
        saveUserObjects(uid, next);
        return next;
      });
    }
    refreshObjectCollections(uid);
  }, [refreshObjectCollections]);

  const setObjectCollectionIds = useCallback((objectId: string, collectionIds: string[]) => {
    const uid = activeUserIdRef.current;
    const ids = [...new Set(collectionIds.filter(Boolean))];
    if (!ids.length) return;
    setCreatedObjects((prev) => {
      const next = prev.map((o) => (
        o.id === objectId
          ? { ...o, collectionIds: ids, collectionId: undefined, updatedAt: new Date().toISOString().slice(0, 10) }
          : o
      ));
      saveUserObjects(uid, next);
      const updated = next.find((o) => o.id === objectId);
      if (updated && supabaseEnabled()) {
        saveObject(updated).catch((err) => console.warn('[nexus] could not update collections:', err?.message || err));
      }
      return next;
    });
  }, []);

  const deleteCreatedObject = useCallback((objectId: string) => {
    const uid = activeUserIdRef.current;
    const exists = createdObjectsRef.current.some((o) => o.id === objectId);
    if (!exists) {
      return { ok: false, error: 'Only content you created can be deleted from the library.' };
    }
    setCreatedObjects((prev) => {
      const next = prev.filter((o) => o.id !== objectId);
      saveUserObjects(uid, next);
      return next;
    });
    try {
      storeDeleteVersionsForObject(uid, objectId);
    } catch (err: any) {
      console.warn('[versions] delete-for-object failed:', err?.message || err);
    }
    setEditingObjectId((cur) => (cur === objectId ? null : cur));
    setReaderObjectId((cur) => {
      if (cur === objectId) {
        setReaderVersionId(null);
        return null;
      }
      return cur;
    });
    setLibraryReady(true);
    return { ok: true };
  }, []);

  const openEditor = useCallback((objectId: string) => {
    const fromCreated = createdObjects.find(o => o.id === objectId);
    const obj = fromCreated || OBJECTS.find(o => o.id === objectId);
    if (obj) setCreatorObjectTypeState(obj.type);
    setEditingObjectId(objectId);
    setReaderObjectId(null);
    setReaderVersionId(null);
    setCurrentScreen('cd-creator');
  }, [createdObjects]);

  const clearEditingObject = useCallback(() => {
    setEditingObjectId(null);
  }, []);

  const startRolePreview = useCallback((name: string, perms: Record<string, AreaLevel>) => {
    setPreviewName(name);
    setPreviewPerms(perms);
    const nav = navItemsForPerms(perms, false);
    setCurrentScreen(nav[0]?.id ?? 'student-dashboard');
    setReaderObjectId(null);
    setEditingObjectId(null);
  }, []);
  const stopRolePreview = useCallback(() => {
    setPreviewName(null);
    setPreviewPerms(null);
    setCurrentScreen('admin-people');
  }, []);

  const previewing = previewPerms !== null;
  const ctx: AppState = {
    role, program, currentScreen, activeUserId, isLoggedIn, nexusMode,
    // While previewing a role, the whole app runs confined to that role's perms.
    learningPerms: previewing ? previewPerms : learningPerms,
    learningIsAdmin: previewing ? false : learningIsAdmin,
    learningCapabilities,
    previewName, startRolePreview, stopRolePreview,
    nexusProgramName, nexusUserName, nexusUserRole,
    readerObjectId, readerVersionId, creatorObjectType, createdObjects,
    objectVersionsTick, listObjectVersions, listAllObjectVersions,
    saveObjectAsNewVersion, lockObjectVersion, deleteObjectVersion, openReaderVersion,
    objectCollections, activeObjectCollectionId,
    setActiveObjectCollectionId, createCollectionIds, setCreateCollectionIds,
    createObjectCollection, renameObjectCollection,
    deleteObjectCollection, setObjectCollectionIds, deleteCreatedObject,
    editingObjectId, pendingTemplateId,
    navigate, login, logout,
    setRole, setProgram, openReader, closeReader, setCreatorObjectType, setPendingTemplateId, addObject,
    openEditor, clearEditingObject,
  };

  return (
    <AppContext.Provider value={ctx}>
      <ConfirmProvider>
        <div
          className="min-h-screen w-full"
          style={{ background: 'linear-gradient(170deg, #A9BBCB 0%, #D4DDE6 40%, #F2F5F8 100%)' }}
        >
          {booting ? (
            <div className="grid min-h-screen place-items-center text-slate-600">
              <div className="text-sm">Loading…</div>
            </div>
          ) : !isLoggedIn ? (
            <LoginPortal />
          ) : (
            <Layout />
          )}
          {previewName ? (
            <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 flex items-center gap-3 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
              <span>Viewing as <b>{previewName}</b></span>
              <button
                type="button"
                onClick={stopRolePreview}
                className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium hover:bg-white/25"
              >
                Exit test view
              </button>
            </div>
          ) : null}
        </div>
      </ConfirmProvider>
    </AppContext.Provider>
  );
}
