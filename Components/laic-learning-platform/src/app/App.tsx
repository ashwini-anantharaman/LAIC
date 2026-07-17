import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Role, Program, LearningObject, ObjectType } from '../lib/types';
import { USERS } from '../lib/data';
import { supabaseEnabled, listObjects, saveObject } from '../lib/supabase';
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
  navigate: (screen: string) => void;
  login: (userId: string) => void;
  logout: () => void;
  setRole: (role: Role) => void;
  setProgram: (program: Program) => void;
  openReader: (objectId: string) => void;
  closeReader: () => void;
  setCreatorObjectType: (type: string) => void;
  addObject: (partial: Partial<LearningObject> & { type: ObjectType; title: string }) => string;
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

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeUserId, setActiveUserId] = useState('riya');
  const [role, setRoleState] = useState<Role>('student');
  const [program, setProgramState] = useState<Program>('bridge');
  const [currentScreen, setCurrentScreen] = useState('student-dashboard');
  const [readerObjectId, setReaderObjectId] = useState<string | null>(null);
  const [creatorObjectType, setCreatorObjectTypeState] = useState<string>('lesson');
  const [createdObjects, setCreatedObjects] = useState<LearningObject[]>([]);

  // Hydrate persisted objects from Supabase (if configured) on first load.
  useEffect(() => {
    if (!supabaseEnabled) return;
    let cancelled = false;
    listObjects()
      .then(objs => { if (!cancelled) setCreatedObjects(objs); })
      .catch(err => console.warn('[supabase] could not load objects:', err?.message || err));
    return () => { cancelled = true; };
  }, []);

  const login = useCallback((userId: string) => {
    const user = USERS.find(u => u.id === userId);
    if (!user) return;
    setActiveUserId(userId);
    setRoleState(user.role);
    setCurrentScreen(DEFAULT_SCREEN[user.role]);
    setReaderObjectId(null);
    setIsLoggedIn(true);
  }, []);

  const logout = useCallback(() => {
    setIsLoggedIn(false);
    setReaderObjectId(null);
  }, []);

  const navigate = useCallback((screen: string) => {
    setCurrentScreen(screen);
    setReaderObjectId(null);
  }, []);

  const setRole = useCallback((newRole: Role) => {
    setRoleState(newRole);
    setCurrentScreen(DEFAULT_SCREEN[newRole]);
    setReaderObjectId(null);
    const match = USERS.find(u => u.role === newRole);
    if (match) setActiveUserId(match.id);
  }, []);

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
    const user = USERS.find(u => u.id === activeUserId);
    const now = new Date().toISOString().slice(0, 10);
    const id = partial.id || `obj-new-${Date.now()}`;
    const obj: LearningObject = {
      id,
      type: partial.type,
      title: partial.title || 'Untitled',
      ownerId: activeUserId,
      ownerName: user?.name || 'You',
      status: partial.status || 'draft',
      scope: partial.scope || 'bridge',
      reuseCount: partial.reuseCount ?? 0,
      description: partial.description || '',
      estimatedTime: partial.estimatedTime || '10 min',
      blocks: partial.blocks || [],
      createdAt: partial.createdAt || now,
      updatedAt: now,
      tags: partial.tags || [],
      sourceIds: partial.sourceIds || [],
    };
    setCreatedObjects(prev => [obj, ...prev.filter(o => o.id !== id)]);
    if (supabaseEnabled) {
      saveObject(obj).catch(err => console.warn('[supabase] could not save object:', err?.message || err));
    }
    return id;
  }, [activeUserId]);

  const ctx: AppState = {
    role, program, currentScreen, activeUserId, isLoggedIn,
    readerObjectId, creatorObjectType, createdObjects,
    navigate, login, logout,
    setRole, setProgram, openReader, closeReader, setCreatorObjectType, addObject,
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
