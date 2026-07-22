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
  navigate: (screen: string) => void;
  login: (userId: string) => void;
  logout: () => void;
  setRole: (role: Role) => void;
  setProgram: (program: Program) => void;
  openReader: (objectId: string) => void;
  closeReader: () => void;
  setCreatorObjectType: (type: string) => void;
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
  const activeUserIdRef = useRef(activeUserId);
  const createdObjectsRef = useRef(createdObjects);
  activeUserIdRef.current = activeUserId;
  createdObjectsRef.current = createdObjects;

  const hydrateForUser = useCallback(async (userId: string) => {
    const local = isDemoCdUser(userId) ? loadDemoCdLibrary() : loadUserObjects(userId);
    setCreatedObjects(local);
    if (!supabaseEnabled) return;
    try {
      const remote = objectsForUser(await listObjects(), userId);
      const claimedRemote = isDemoCdUser(userId)
        ? remote.map((o) => ({
            ...o,
            ownerId: DEMO_CD_USER_ID,
            ownerName: o.ownerName || 'Course Dev Demo',
          }))
        : remote;
      const merged = mergeObjects(local, claimedRemote);
      setCreatedObjects(merged);
      saveUserObjects(userId, merged);
    } catch (err: any) {
      console.warn('[supabase] could not load objects:', err?.message || err);
    }
  }, []);

  // Keep the active user's library written to localStorage whenever it changes.
  useEffect(() => {
    if (!isLoggedIn) return;
    saveUserObjects(activeUserId, createdObjects);
  }, [isLoggedIn, activeUserId, createdObjects]);

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
    setActiveUserId(userId);
    setRoleState(user.role);
    // Email demo + all CDs land on Object Library (saved objects).
    setCurrentScreen(DEFAULT_SCREEN[user.role]);
    setReaderObjectId(null);
    setEditingObjectId(null);
    setIsLoggedIn(true);
    writeSessionUserId(userId);
    void hydrateForUser(userId);
  }, [hydrateForUser]);

  const logout = useCallback(() => {
    // Persist current user's objects before clearing session.
    saveUserObjects(activeUserIdRef.current, createdObjectsRef.current);
    writeSessionUserId(null);
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
    // Prefer demo-cd when switching into content-developer so the email account's library sticks.
    const match =
      newRole === 'content-developer'
        ? USERS.find((u) => u.id === DEMO_CD_USER_ID) || USERS.find((u) => u.role === newRole)
        : USERS.find((u) => u.role === newRole);
    if (match) {
      setActiveUserId(match.id);
      writeSessionUserId(match.id);
      void hydrateForUser(match.id);
    }
  }, [hydrateForUser]);

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
      saveUserObjects(ownerId, nextList);
      if (supabaseEnabled) {
        saveObject(obj).catch(err => console.warn('[supabase] could not save object:', err?.message || err));
      }
      return nextList;
    });
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
    readerObjectId, creatorObjectType, createdObjects, editingObjectId,
    navigate, login, logout,
    setRole, setProgram, openReader, closeReader, setCreatorObjectType, addObject,
    openEditor, clearEditingObject,
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
