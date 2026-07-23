import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { Role, Program, LearningObject, ObjectType } from '../lib/types';
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
import { LoginPortal } from './components/LoginPortal';
import { Layout } from './components/Layout';

export interface AppState {
  role: Role;
  program: Program;
  currentScreen: string;
  activeUserId: string;
  isLoggedIn: boolean;
  readerObjectId: string | null;
  creatorObjectType: string;
  createdObjects: LearningObject[];
  /** When set, ObjectCreator opens this library object for editing. */
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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeUserId, setActiveUserId] = useState('riya');
  const [role, setRoleState] = useState<Role>('student');
  const [program, setProgramState] = useState<Program>('bridge');
  const [currentScreen, setCurrentScreen] = useState('student-dashboard');
  const [readerObjectId, setReaderObjectId] = useState<string | null>(null);
  const [creatorObjectType, setCreatorObjectTypeState] = useState<string>('lesson');
  const [createdObjects, setCreatedObjects] = useState<LearningObject[]>([]);
  const [editingObjectId, setEditingObjectId] = useState<string | null>(null);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  /** Only persist to localStorage after the library for this user has been loaded. */
  const [libraryReady, setLibraryReady] = useState(false);

  const activeUserIdRef = useRef(activeUserId);
  const createdObjectsRef = useRef(createdObjects);
  const hydrateGenRef = useRef(0);
  activeUserIdRef.current = activeUserId;
  createdObjectsRef.current = createdObjects;

  const hydrateForUser = useCallback(async (userId: string) => {
    const gen = ++hydrateGenRef.current;
    setLibraryReady(false);

    const local = isDemoCdUser(userId) ? loadDemoCdLibrary() : loadUserObjects(userId);
    if (gen !== hydrateGenRef.current) return;
    setCreatedObjects(local);
    // Local load is enough to start persisting again (don't wait on network).
    setLibraryReady(true);

    if (!supabaseEnabled) return;
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
      const merged = mergeObjects(local, claimedRemote);
      setCreatedObjects(merged);
      if (merged.length > 0) saveUserObjects(userId, merged);
    } catch (err: any) {
      console.warn('[supabase] could not load objects:', err?.message || err);
    }
  }, []);

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

  // Restore last demo session on first load.
  useEffect(() => {
    const uid = readSessionUserId();
    if (!uid) return;
    const user = USERS.find((u) => u.id === uid);
    if (!user) {
      writeSessionUserId(null);
      return;
    }
    setActiveUserId(uid);
    setRoleState(user.role);
    setCurrentScreen(DEFAULT_SCREEN[user.role]);
    setIsLoggedIn(true);
    void hydrateForUser(uid);
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
    writeSessionUserId(null);
    setLibraryReady(false);
    setIsLoggedIn(false);
    setReaderObjectId(null);
    setEditingObjectId(null);
    setCreatedObjects([]);
  }, []);

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
    setReaderObjectId(objectId);
  }, []);

  const closeReader = useCallback(() => {
    setReaderObjectId(null);
  }, []);

  const setCreatorObjectType = useCallback((type: string) => {
    setCreatorObjectTypeState(type);
  }, []);

  const setPendingTemplateIdCb = useCallback((id: string | null) => {
    setPendingTemplateId(id);
  }, []);

  const addObject = useCallback((partial: Partial<LearningObject> & { type: ObjectType; title: string }) => {
    const ownerId = activeUserIdRef.current;
    const user = USERS.find(u => u.id === ownerId);
    const now = new Date().toISOString().slice(0, 10);
    const id = partial.id || `obj-new-${Date.now()}`;
    setCreatedObjects(prev => {
      const existing = prev.find(o => o.id === id);
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
        pipelineDraft: partial.pipelineDraft !== undefined ? partial.pipelineDraft : existing?.pipelineDraft,
      };
      const nextList = [obj, ...prev.filter(o => o.id !== id)];
      const result = saveUserObjects(ownerId, nextList);
      if (!result.ok) {
        console.warn('[addObject] local persist failed:', result.error);
      }
      if (supabaseEnabled) {
        saveObject(obj).catch(err => console.warn('[supabase] could not save object:', err?.message || err));
      }
      return nextList;
    });
    // Ensure subsequent effect-based saves are allowed (e.g. first object after empty hydrate).
    setLibraryReady(true);
    return id;
  }, []);

  const openEditor = useCallback((objectId: string) => {
    const fromCreated = createdObjects.find(o => o.id === objectId);
    const obj = fromCreated || OBJECTS.find(o => o.id === objectId);
    if (obj) setCreatorObjectTypeState(obj.type);
    setEditingObjectId(objectId);
    setReaderObjectId(null);
    setCurrentScreen('cd-creator');
  }, [createdObjects]);

  const clearEditingObject = useCallback(() => {
    setEditingObjectId(null);
  }, []);

  const ctx: AppState = {
    role, program, currentScreen, activeUserId, isLoggedIn,
    readerObjectId, creatorObjectType, createdObjects, editingObjectId, pendingTemplateId,
    navigate, login, logout,
    setRole, setProgram, openReader, closeReader, setCreatorObjectType,
    setPendingTemplateId: setPendingTemplateIdCb,
    addObject, openEditor, clearEditingObject,
  };

  return (
    <AppContext.Provider value={ctx}>
      <div
        className="min-h-screen w-full"
        style={{ background: 'linear-gradient(170deg, #A9BBCB 0%, #D4DDE6 40%, #F2F5F8 100%)' }}
      >
        {!isLoggedIn ? <LoginPortal /> : <Layout />}
      </div>
    </AppContext.Provider>
  );
}
