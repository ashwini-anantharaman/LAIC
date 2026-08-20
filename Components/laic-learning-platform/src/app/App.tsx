import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { Role, Program, LearningObject, ObjectType, Version } from '../lib/types';
import { USERS, OBJECTS } from '../lib/data';
import { supabaseEnabled, listObjects, fetchObject, saveObject, objectToPublishRow } from '../lib/supabase';
// Publishing goes through Nexus (session-scoped) rather than the Content Studio's
// own service-role server. Same bodies, same call sites — a different door.
import {
  deleteObjectEverywhere,
  fetchLibraryRows,
  publishObject,
  unpublishObject,
} from '../lib/supabase';

/**
 * Back the library up to the shared store, coalesced per object.
 *
 * Saves fire on nearly every edit and each row can carry megabytes of inlined
 * images, so pushing every one would flood the API and the author's uplink.
 * The last write within the window wins, which is the one that matters.
 */
const SHARED_SYNC_DELAY_MS = 2500;
const sharedSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();

function queueSharedSync(obj: LearningObject, collectionNames: string[]) {
  const pending = sharedSyncTimers.get(obj.id);
  if (pending) clearTimeout(pending);
  sharedSyncTimers.set(obj.id, setTimeout(() => {
    sharedSyncTimers.delete(obj.id);
    // Standalone (no Nexus session) is draft-only: the local library is still the
    // author's, it simply has nowhere shared to go. Skipping keeps the console clean
    // rather than logging a refusal every 2.5s per edited object.
    if (!supabaseEnabled()) return;
    publishObject(objectToPublishRow(obj, collectionNames)).catch((err) => {
      console.warn('[library] could not back up to the shared store:', err?.message || err);
    });
  }, SHARED_SYNC_DELAY_MS));
}

/** A shared-store row (snake_case) back into the app's LearningObject shape. */
function sharedRowToObject(row: any): LearningObject {
  return {
    id: row.id,
    type: row.type,
    title: row.title || 'Untitled',
    ownerId: row.owner_id || '',
    ownerName: row.owner_name || 'You',
    status: row.status || 'draft',
    scope: row.scope || 'bridge',
    reuseCount: row.reuse_count ?? 0,
    description: row.description || '',
    estimatedTime: row.estimated_time || '',
    blocks: row.blocks || [],
    createdAt: String(row.created_at || '').slice(0, 10),
    updatedAt: String(row.updated_at || '').slice(0, 10),
    tags: row.tags || [],
    sourceIds: row.source_ids || [],
    collectionIds: Array.isArray(row.collection_ids) && row.collection_ids.length
      ? row.collection_ids
      : undefined,
    pipelineDraft: row.pipeline_draft ?? undefined,
    // The authoring draft rides along in pipeline_draft's sibling fields when
    // present, so reopening a synced tutorial resumes where it left off.
    ...(row.pipeline_draft?.tutorialV2Draft
      ? { tutorialV2Draft: row.pipeline_draft.tutorialV2Draft }
      : {}),
    ...(row.pipeline_draft?.tutorialV3Draft
      ? { tutorialV3Draft: row.pipeline_draft.tutorialV3Draft }
      : {}),
  } as LearningObject;
}
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
import { ensureSnapshotCollections, mergeLibrarySnapshot } from '../lib/librarySnapshotSeed';
import { fileObjectsByType, folderIdForType } from '../lib/libraryFiling';
import {
  syncWorkingVersion,
  saveAsNewVersion as storeSaveAsNewVersion,
  overwriteVersion as storeOverwriteVersion,
  getVersion,
  objectFromVersion,
  truncateVersionsAfter as storeTruncateVersionsAfter,
  markVersionPublished,
  clearVersionPublished,
  ensureInitialVersion,
  setVersionLocked as storeSetVersionLocked,
  deleteVersion as storeDeleteVersion,
  deleteVersionsForObject as storeDeleteVersionsForObject,
  sealVersionTip as storeSealVersionTip,
  listVersionsForObject,
  listAllVersions,
  subscribeObjectVersions,
} from '../lib/objectVersionsStore';
import { LoginPortal } from './components/LoginPortal';
import { Layout } from './components/Layout';
import { ConfirmProvider } from './components/ConfirmDialog';
import { ObjectEmbedPage } from './components/screens/ObjectEmbedPage';
import { parseObjectEmbedId } from '../lib/objectUrls';
import { applyEmbedSkin } from './embedSkin';
import {
  consumeLaunchFromUrl,
  fetchLearningContext,
  lastLearningContextFailure,
  type LearningContextFailure,
  contextToRole,
  signOutToNexus,
} from '../lib/nexus';
import { navItemsForPerms, type AreaLevel } from '../lib/learningAreas';
import { canAccessScreen, defaultScreenForCapabilities } from '../lib/roleAccess';

/**
 * What a save should do to version history.
 *  'auto'  — the usual working-version sync (amend the tip, or commit the next)
 *  'skip'  — touch nothing
 *  'new'   — always commit the next version, even if content is unchanged
 *  { overwriteId } — replace that version in place, bumping its edit count
 * Submit passes an explicit mode so the amend window cannot reinterpret it.
 */
export type AddObjectVersionMode = 'auto' | 'skip' | 'new' | { overwriteId: string };

export interface AddObjectOptions {
  version?: AddObjectVersionMode;
  /** Reported when an overwrite is refused (locked version, v1, …). */
  onVersionError?: (message: string) => void;
}

export interface AppState {
  role: Role;
  program: Program;
  currentScreen: string;
  activeUserId: string;
  isLoggedIn: boolean;
  /** True when the session came from a Nexus launch (vs the demo picker). */
  nexusMode: boolean;
  /** Embedded viewer (?embed=1): render ONLY the reader — no sidebar/topbar,
   *  no back navigation. Used when a host app (e.g. the mobile app) shows one
   *  object in a WebView and owns the surrounding navigation itself. */
  embedMode: boolean;
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
  /** The club this session authors for, or null when it is not a club launch. */
  nexusClubName: string | null;
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
  saveObjectAsNewVersion: (objectId: string, notes?: string, force?: boolean) => Version | null;
  /** Replace an existing version in place (Submit as → v2) instead of adding one. */
  overwriteObjectVersion: (
    objectId: string,
    versionId: string,
    notes?: string,
  ) => { ok: boolean; version?: Version; error?: string };
  /** Roll content AND history back to a version, discarding everything above it. */
  restoreObjectVersion: (
    objectId: string,
    versionId: string,
  ) => { ok: boolean; version?: Version; removed?: number; error?: string };
  /** Push one version's content to the shared library partner apps read. */
  publishObjectVersion: (
    objectId: string,
    versionId: string,
  ) => Promise<{ ok: boolean; version?: Version; error?: string }>;
  /** Guarantee this object has a v1 (never adds a second version). */
  ensureObjectInitialVersion: (objectId: string) => Version | null;
  /** Withdraw this object from the shared library — reader apps stop showing it. */
  unpublishObject: (objectId: string) => Promise<{ ok: boolean; error?: string }>;
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
  /** `pinned` = the author NAMED this folder (New ▾ inside an open folder), so it
   *  wins over the type's own home folder. One-shot. */
  setCreateCollectionIds: (ids: string[], opts?: { pinned?: boolean }) => void;
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
  /**
   * One-shot from Create: Tutorial V2 path after folder picker
   * (`template` | `write-yourself`). Cleared when the creator consumes it.
   */
  pendingAuthoringPath: 'template' | 'write-yourself' | 'source-first' | null;
  setPendingAuthoringPath: (path: 'template' | 'write-yourself' | 'source-first' | null) => void;
  /**
   * One-shot: when set, Content Library opens this folder once then clears.
   * Normal nav to Content Library leaves this null → collections root.
   */
  pendingLibraryFolderId: string | null;
  clearPendingLibraryFolderId: () => void;
  /** Bumps when opening Content Library at root so the screen remounts outside any folder. */
  libraryRootNonce: number;
  navigate: (screen: string, opts?: { libraryFolderId?: string | null }) => void;
  login: (userId: string) => void;
  logout: () => void;
  setRole: (role: Role) => void;
  setProgram: (program: Program) => void;
  openReader: (objectId: string) => void;
  closeReader: () => void;
  setCreatorObjectType: (type: string) => void;
  setPendingTemplateId: (id: string | null) => void;
  setPendingAuthoringPath: (path: 'template' | 'write-yourself' | 'source-first' | null) => void;
  addObject: (
    partial: Partial<LearningObject> & { type: ObjectType; title: string },
    opts?: AddObjectOptions,
  ) => string;
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
  if (embedObjectId) {
    // A share link opened INSIDE the club app (?embed=1 — e.g. its tutorial
    // card) wears the app's skin, for the same cross-origin reason as the
    // reader boot below. A share link opened as itself keeps its own face.
    if (new URLSearchParams(window.location.search).get('embed') === '1') applyEmbedSkin();
    return <ObjectEmbedPage objectId={embedObjectId} />;
  }
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
  const [pendingAuthoringPath, setPendingAuthoringPath] = useState<'template' | 'write-yourself' | 'source-first' | null>(null);
  const [pendingLibraryFolderId, setPendingLibraryFolderId] = useState<string | null>(null);
  const [libraryRootNonce, setLibraryRootNonce] = useState(0);
  const clearPendingLibraryFolderId = useCallback(() => setPendingLibraryFolderId(null), []);
  /** Only persist to localStorage after the library for this user has been loaded. */
  const [libraryReady, setLibraryReady] = useState(false);
  const [nexusMode, setNexusMode] = useState(false);
  const [embedMode, setEmbedMode] = useState(false);
  const [learningPerms, setLearningPerms] = useState<Record<string, AreaLevel> | null>(null);
  const [learningIsAdmin, setLearningIsAdmin] = useState(false);
  const [learningCapabilities, setLearningCapabilities] = useState<string[] | null>(null);
  const [previewPerms, setPreviewPerms] = useState<Record<string, AreaLevel> | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [nexusProgramName, setNexusProgramName] = useState<string | null>(null);
  /**
   * The CLUB this session is authoring for, when the launch came from one.
   *
   * It exists to answer the question an author actually has — "where does this go?" —
   * which `nexusProgramName` cannot: for a club launch that is the connected PARENT,
   * so showing it would name the wrong place with total confidence.
   */
  const [nexusClubName, setNexusClubName] = useState<string | null>(null);
  const [nexusUserName, setNexusUserName] = useState<string | null>(null);
  const [nexusUserRole, setNexusUserRole] = useState<string | null>(null);
  /** Gate first paint until we know whether this is a Nexus launch. */
  const [booting, setBooting] = useState(true);
  /**
   * A launch arrived and could not be signed in. Held separately from "not logged in"
   * because the honest answer differs: a visitor should see the sign-in page, whereas
   * someone sent here by the app should be told to reopen it rather than be handed a
   * demo identity that quietly authors as the wrong person.
   */
  const [launchFailed, setLaunchFailed] = useState<LearningContextFailure | null>(null);

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
  /** Did the author NAME the destination folder (New ▾ inside an open folder),
   *  rather than merely have one selected? One-shot: cleared once used, so it
   *  cannot leak into the next ordinary Create. */
  const createFolderPinnedRef = useRef(false);

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
    ensureSnapshotCollections(userId);
    refreshObjectCollections(userId);

    const localRaw = isDemoCdUser(userId) ? loadDemoCdLibrary() : loadUserObjects(userId);
    const local = fileObjectsByType(userId, mergeLibrarySnapshot(
      userId,
      mergeBbTutorialsIntoLibrary(userId, withCollectionIds(userId, localRaw)),
    ));
    if (gen !== hydrateGenRef.current) return;
    setCreatedObjects(local);
    if (local !== localRaw) {
      saveUserObjects(userId, local);
    }
    // Local load is enough to start persisting again (don't wait on network).
    setLibraryReady(true);

    // Rebuild from the shared store too, so content an author created here
    // survives a refresh, a cleared cache, or a different machine — this is
    // what replaced baking a snapshot into the build.
    try {
      const shared = await fetchLibraryRows();
      if (gen !== hydrateGenRef.current) return;
      if (Array.isArray(shared) && shared.length) {
        const claimed = shared.map((r) => ({ ...sharedRowToObject(r), ownerId: userId }));
        setCreatedObjects((prev) => {
          const merged = fileObjectsByType(userId, withCollectionIds(userId, mergeObjects(prev, claimed)));
          saveUserObjects(userId, merged);
          return merged;
        });
      }
    } catch (err: any) {
      console.warn('[library] shared store unavailable:', err?.message || err);
    }

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
      const merged = mergeLibrarySnapshot(
        userId,
        mergeBbTutorialsIntoLibrary(
          userId,
          withCollectionIds(userId, mergeObjects(local, claimedRemote)),
        ),
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
    const res = saveUserObjects(activeUserId, createdObjects);
    // A failed write means this session's work is not on disk and will be gone
    // on refresh. It used to pass silently, so the first an author knew of it
    // was a library that had lost their tutorials.
    if (!res.ok) {
      console.error('[library] SAVE FAILED — work from this session is not persisted:', res.error);
    }
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
      // Deep link (?object=<id>) — e.g. the mobile app opening one object in a
      // WebView. Capture before consumeLaunchFromUrl strips the query string.
      const bootParams = new URLSearchParams(window.location.search);
      const deepLinkObjectId = bootParams.get('object');
      const embedBoot = bootParams.get('embed') === '1';
      // TWO SEPARATE THINGS, and they used to be one.
      //
      //   chrome=none → render the screen alone: no sidebar, no topbar.
      //   embed=1     → that, PLUS wear the club app's cream-and-Neco skin.
      //
      // The Nexus console frames this app to show its Content Library as a
      // program tab, and wants the first without the second: dressing a Nexus
      // panel in BirdBridge's brand would be an app wearing another app's
      // clothes. `embed=1` keeps its established meaning for the club app,
      // which passes it and does expect the skin.
      const chromeless = embedBoot || bootParams.get('chrome') === 'none';
      if (chromeless) setEmbedMode(true);
      if (embedBoot) {
        // Dress the page as its host: the club app's WEB build shows this
        // reader in a cross-origin iframe it cannot style, so the skin must
        // come from in here (its native WebView injects the same sheet).
        applyEmbedSkin();
      }
      // Read BEFORE the exchange: consumeLaunchFromUrl strips the query either way, so
      // afterwards there is no way to tell a launch that failed from a plain visit.
      const arrivedWithLaunchToken = !!bootParams.get('launch_token');
      await consumeLaunchFromUrl();
      // Embed boot renders exactly one object — fetch just that object (not
      // the whole org library), in parallel with the context read.
      const embedObjectPromise =
        deepLinkObjectId && embedBoot ? fetchObject(deepLinkObjectId).catch(() => null) : null;
      const ctx = await fetchLearningContext();
      if (!live) return;
      if (ctx) {
        const r = contextToRole(ctx);
        const uid = ctx.nexusUserId || 'nexus';
        const isAdmin = ctx.is_admin ?? r === 'administrator';
        const perms = ctx.learning_role?.perms ?? null;
        // Admins are NOT exempt. This used to be `isAdmin ? null : …`, discarding the
        // server's answer and treating null as unrestricted — which made the org's
        // provisioning ceiling decorative for exactly the person most likely to test
        // it. The server clamps every branch, admin included, to what the org
        // provisioned this club; take what it says. An empty/absent list still means
        // "nothing recorded" and falls back to perms, as before.
        const caps = ctx.capabilities ?? null;
        setNexusMode(true);
        setLearningIsAdmin(isAdmin);
        setLearningPerms(perms);
        setLearningCapabilities(caps);
        setNexusProgramName(ctx.program_name ?? null);
        setNexusClubName(ctx.nexus_club_program_name ?? null);
        setNexusUserName(ctx.displayName ?? null);
        setNexusUserRole(isAdmin ? 'Administrator' : (ctx.learning_role?.role_name ?? ctx.role_name ?? 'Member'));
        setActiveUserId(uid);
        setRoleState(r);
        // Land on the first screen the person's access exposes. Members are gated
        // by their effective capabilities (Access Catalogue); admins land on the
        // program overview. Fall back to the legacy area-perms nav.
        const nav = navItemsForPerms(perms, isAdmin);
        const memberLanding = caps?.length ? defaultScreenForCapabilities(caps) : (nav[0]?.id ?? DEFAULT_SCREEN[r]);
        // A launch may name the screen it wants — the club app opens this straight
        // into the creator from its own + button, and landing on the overview first
        // would make that button feel like it did nothing. Honoured only when the
        // person's own access actually exposes that screen, so a URL cannot be a way
        // in: an unauthorised `screen` falls back to wherever they would have landed.
        const wanted = bootParams.get('screen');
        const allowed =
          wanted && (isAdmin || (caps?.length ? canAccessScreen(caps, wanted) : false));
        setCurrentScreen(allowed ? wanted : isAdmin ? 'admin-overview' : memberLanding);
        setIsLoggedIn(true);
        if (deepLinkObjectId && embedObjectPromise) {
          // Embedded viewer: one object is all we render — skip the authoring
          // library hydration entirely; the fetch started before the context.
          const found = await embedObjectPromise;
          if (!live) return;
          if (found) setCreatedObjects([found]);
          setReaderObjectId(deepLinkObjectId);
        } else if (deepLinkObjectId) {
          // Full-app deep link: hydrate first, then resolve the object from the
          // org library (a learner rarely OWNS the object) and open the reader.
          await hydrateForUser(uid);
          if (!live) return;
          try {
            const found = (await listObjects()).find((o) => o.id === deepLinkObjectId);
            if (found) setCreatedObjects((prev) => mergeObjects(prev, [found]));
          } catch {
            /* reader still falls back to seed objects */
          }
          setReaderObjectId(deepLinkObjectId);
        } else {
          void hydrateForUser(uid);
        }
        setBooting(false);
        return;
      }
      // A LAUNCHED session that failed must NOT become somebody else.
      //
      // This used to fall straight through to the demo session below, so a launch whose
      // token had already been spent — they are single-use, and the query is stripped
      // after the first exchange, so any reload of the host's WebView qualifies — came
      // up as a hard-coded demo user with the full desktop sidebar. Everything after
      // that is wrong in ways that look like bugs somewhere else: the wrong name, the
      // wrong program, and content saved as the wrong person.
      if (arrivedWithLaunchToken) {
        setLaunchFailed(lastLearningContextFailure() ?? { reason: 'no-session' });
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
        if (deepLinkObjectId) setReaderObjectId(deepLinkObjectId);
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

  const navigate = useCallback((screen: string, opts?: { libraryFolderId?: string | null }) => {
    if (screen === 'cd-library') {
      const folderId = opts && 'libraryFolderId' in opts ? (opts.libraryFolderId || null) : null;
      setPendingLibraryFolderId(folderId);
      setLibraryRootNonce((n) => n + 1);
    }
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

  const addObject = useCallback((
    partial: Partial<LearningObject> & { type: ObjectType; title: string },
    opts?: AddObjectOptions,
  ) => {
    const versionMode = opts?.version ?? 'auto';
    const onVersionError = opts?.onVersionError;
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
      // The type decides the folder: a flashcard set belongs with flashcards
      // even if the author happened to have a tutorials folder selected when
      // they hit Create. Falls back to the picked folder for types with no
      // home of their own.
      //
      // UNLESS THE AUTHOR NAMED ONE. That rule was written for a folder that
      // happened to be selected — an accident of navigation. "New ▾" inside an
      // open folder is the opposite: someone looking at a folder asking for
      // content in THAT folder, and overriding them there would make the menu
      // item lie about what it does. Pinned is one-shot (cleared on use), so the
      // ordinary Create flow keeps filing by type.
      const pinned = createFolderPinnedRef.current && fromCreate.length ? fromCreate : null;
      // Spend it here: the next Create must file by type again, or one use of the
      // folder menu would silently change how everything after it is filed.
      if (createFolderPinnedRef.current) createFolderPinnedRef.current = false;
      const byType = pinned ? null : folderIdForType(ownerId, partial.type);
      const collectionIds = pinned
        ? pinned
        : byType
        ? [byType]
        : (fromPartial.length
          ? fromPartial
          : (fromExisting.length ? fromExisting : (fromCreate.length ? fromCreate : (fallback ? [fallback] : []))));
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
        tutorialV3Draft: (partial as any).tutorialV3Draft !== undefined
          ? (partial as any).tutorialV3Draft
          : (existing as any)?.tutorialV3Draft,
        structuredV2Draft: (partial as any).structuredV2Draft !== undefined
          ? (partial as any).structuredV2Draft
          : (existing as any)?.structuredV2Draft,
      };
      const nextList = [obj, ...prev.filter(o => o.id !== id)];
      const result = saveUserObjects(ownerId, nextList);
      if (!result.ok) {
        console.warn('[addObject] local persist failed:', result.error);
      }
      // Versioning happens HERE, against the object just built — not in the
      // caller. createdObjectsRef only refreshes on render, so a caller acting
      // right after this returns would version the PRE-EDIT content: the
      // overwrite would store stale blocks, and the next save would then see a
      // difference and mint the spare version this is meant to avoid.
      const createdBy = obj.ownerName || user?.name || 'You';
      try {
        if (versionMode === 'new') {
          storeSaveAsNewVersion(ownerId, obj, createdBy, undefined, true);
        } else if (typeof versionMode === 'object' && versionMode.overwriteId) {
          const res = storeOverwriteVersion(ownerId, versionMode.overwriteId, obj, createdBy);
          if (!res.ok && res.error) onVersionError?.(res.error);
        } else if (versionMode === 'skip') {
          // Draft saves add nothing — but every object still needs a v1 in the
          // history, ready to publish, from the moment it exists.
          ensureInitialVersion(ownerId, obj, createdBy);
        } else {
          syncWorkingVersion(ownerId, obj, createdBy);
        }
      } catch (err: any) {
        console.warn('[versions] sync failed:', err?.message || err);
      }
      if (supabaseEnabled()) {
        saveObject(obj).catch(err => console.warn('[nexus] could not save object:', err?.message || err));
      }
      // Back the library up to the shared store so it survives a refresh, a
      // cleared cache, or another machine. This is a SAVE, not a publish: no
      // version_number goes with it, so published_at stays untouched and
      // reader apps keep showing whichever version was deliberately published.
      queueSharedSync(obj, cols.filter((c) => collectionIds.includes(c.id)).map((c) => c.name));
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

  const saveObjectAsNewVersion = useCallback((objectId: string, notes?: string, force = false) => {
    const ownerId = activeUserIdRef.current;
    const obj = createdObjectsRef.current.find((o) => o.id === objectId)
      || OBJECTS.find((o) => o.id === objectId);
    if (!obj) return null;
    const user = USERS.find((u) => u.id === ownerId);
    return storeSaveAsNewVersion(ownerId, obj, obj.ownerName || user?.name || 'You', notes, force);
  }, []);

  const overwriteObjectVersion = useCallback((
    objectId: string,
    versionId: string,
    notes?: string,
  ) => {
    const ownerId = activeUserIdRef.current;
    const obj = createdObjectsRef.current.find((o) => o.id === objectId)
      || OBJECTS.find((o) => o.id === objectId);
    if (!obj) return { ok: false, error: 'Content not found.' };
    const user = USERS.find((u) => u.id === ownerId);
    return storeOverwriteVersion(ownerId, versionId, obj, obj.ownerName || user?.name || 'You', notes);
  }, []);

  /**
   * Roll the object back to a version: its content AND its history.
   *
   * Everything above the restored version is discarded, so the version you
   * restored to becomes the tip and the list still describes the object you
   * have. Nothing new is committed — the restored state is only recorded if
   * the author submits afterwards.
   *
   * History is truncated FIRST: if something above is locked the whole restore
   * is refused, and refusing after already overwriting the content would leave
   * the object and its history disagreeing.
   */
  const restoreObjectVersion = useCallback((objectId: string, versionId: string) => {
    const ownerId = activeUserIdRef.current;
    const base = createdObjectsRef.current.find((o) => o.id === objectId)
      || OBJECTS.find((o) => o.id === objectId);
    if (!base) return { ok: false, error: 'Content not found.' };
    const version = getVersion(ownerId, versionId);
    if (!version) return { ok: false, error: 'That version no longer exists.' };
    if (!version.snapshot) {
      return { ok: false, error: `v${version.versionNumber} has no saved content to restore.` };
    }

    const trimmed = storeTruncateVersionsAfter(ownerId, objectId, version.versionNumber);
    if (!trimmed.ok) return { ok: false, error: trimmed.error };

    const restored = objectFromVersion(base, version);
    addObject({
      ...restored,
      // Keep the object where it lives now; the snapshot predates any moves.
      collectionIds: objectCollectionIds(base),
      status: base.status,
    } as any, { version: 'skip' });
    return { ok: true, version, removed: trimmed.removed };
  }, [addObject]);

  /**
   * Push ONE version's content to the shared library, where partner apps read.
   *
   * The snapshot is what ships — not the working copy — so an author can keep
   * editing after publishing without that work leaking out. The shared table
   * holds one row per object, so publishing a version is also what unpublishes
   * the previous one: readers see exactly the version chosen here.
   */
  const publishObjectVersion = useCallback(async (objectId: string, versionId: string) => {
    const ownerId = activeUserIdRef.current;
    const base = createdObjectsRef.current.find((o) => o.id === objectId)
      || OBJECTS.find((o) => o.id === objectId);
    if (!base) return { ok: false, error: 'Content not found.' };
    const version = getVersion(ownerId, versionId);
    if (!version) return { ok: false, error: 'That version no longer exists.' };

    // A snapshot can be missing because the browser's storage was full when it
    // was written. For the NEWEST version that is recoverable rather than
    // fatal: the working copy is that version's content until a later version
    // freezes it, so the live object is exactly what would have been stored.
    const isTip = listVersionsForObject(ownerId, objectId)
      .every((v) => v.versionNumber <= version.versionNumber);
    if (!version.snapshot && !isTip) {
      return { ok: false, error: `v${version.versionNumber} has no saved content to publish.` };
    }

    const cols = getObjectCollections(ownerId);
    const ids = objectCollectionIds(base);
    const names = cols.filter((c) => ids.includes(c.id)).map((c) => c.name);
    const shipped = {
      ...(version.snapshot ? objectFromVersion(base, version) : base),
      collectionIds: ids,
    };

    try {
      await publishObject(
        objectToPublishRow(shipped, names, version.versionNumber),
      );
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Could not reach the shared library.' };
    }
    // Only after the upload lands — see markVersionPublished.
    markVersionPublished(ownerId, objectId, versionId);
    return { ok: true, version };
  }, []);

  /**
   * Withdraw an object from the shared library.
   *
   * The row IS the publication — reader apps read that table — so taking it
   * out is what makes the content disappear from them. The author's own copy
   * is untouched: unpublishing is not deleting, and they keep editing.
   *
   * The local published mark is cleared only after the row is gone, so a
   * failed withdrawal never leaves the library claiming nothing is live while
   * readers still see it.
   */
  const unpublishObject = useCallback(async (objectId: string) => {
    const ownerId = activeUserIdRef.current;
    // A queued backup would put the row straight back.
    const queued = sharedSyncTimers.get(objectId);
    if (queued) {
      clearTimeout(queued);
      sharedSyncTimers.delete(objectId);
    }
    try {
      await unpublishObject(objectId);
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Could not reach the shared library.' };
    }
    clearVersionPublished(ownerId, objectId);
    return { ok: true };
  }, []);

  const ensureObjectInitialVersion = useCallback((objectId: string) => {
    const ownerId = activeUserIdRef.current;
    const obj = createdObjectsRef.current.find((o) => o.id === objectId)
      || OBJECTS.find((o) => o.id === objectId);
    if (!obj) return null;
    const user = USERS.find((u) => u.id === ownerId);
    return ensureInitialVersion(ownerId, obj, obj.ownerName || user?.name || 'You');
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

  const setCreateCollectionIds = useCallback((ids: string[], opts?: { pinned?: boolean }) => {
    const unique = [...new Set(ids.filter(Boolean))];
    // Keep ref in sync immediately so the next addObject (same tick) sees the pick.
    createCollectionIdsRef.current = unique;
    createFolderPinnedRef.current = !!opts?.pinned && unique.length > 0;
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
    // Primary folder for deep-link after save → Content Library.
    if (ids[0]) {
      storeSetActiveObjectCollectionId(uid, ids[0]);
      setActiveObjectCollectionIdState(ids[0]);
    }
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
    // A queued backup would otherwise re-create the row moments after this.
    const queued = sharedSyncTimers.get(objectId);
    if (queued) {
      clearTimeout(queued);
      sharedSyncTimers.delete(objectId);
    }
    // Delete the durable copy too — otherwise the next hydrate rebuilds it.
    deleteObjectEverywhere(objectId).catch((err) => {
      console.warn('[library] could not delete from the shared store:', err?.message || err);
    });
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
    const fromCreated = (createdObjectsRef.current || []).find(o => o.id === objectId);
    const obj = fromCreated || OBJECTS.find(o => o.id === objectId);
    if (obj) setCreatorObjectTypeState(obj.type);
    // Keep Create-folder picks aligned with where the object lives now (after moves).
    if (fromCreated) {
      const ids = objectCollectionIds(fromCreated);
      createCollectionIdsRef.current = ids;
      setCreateCollectionIdsState(ids);
      if (ids[0]) {
        storeSetActiveObjectCollectionId(activeUserIdRef.current, ids[0]);
        setActiveObjectCollectionIdState(ids[0]);
      }
    }
    // Next content-differing save should commit a new version (git-style).
    try {
      storeSealVersionTip(activeUserIdRef.current, objectId);
    } catch (err: any) {
      console.warn('[versions] seal tip failed:', err?.message || err);
    }
    setEditingObjectId(objectId);
    setReaderObjectId(null);
    setReaderVersionId(null);
    setCurrentScreen('cd-creator');
  }, []);

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
    role, program, currentScreen, activeUserId, isLoggedIn, nexusMode, embedMode,
    // While previewing a role, the whole app runs confined to that role's perms.
    learningPerms: previewing ? previewPerms : learningPerms,
    learningIsAdmin: previewing ? false : learningIsAdmin,
    learningCapabilities,
    previewName, startRolePreview, stopRolePreview,
    nexusProgramName, nexusClubName, nexusUserName, nexusUserRole,
    readerObjectId, readerVersionId, creatorObjectType, createdObjects,
    objectVersionsTick, listObjectVersions, listAllObjectVersions,
    saveObjectAsNewVersion, overwriteObjectVersion, restoreObjectVersion, publishObjectVersion,
    ensureObjectInitialVersion, unpublishObject,
    lockObjectVersion, deleteObjectVersion, openReaderVersion,
    objectCollections, activeObjectCollectionId,
    setActiveObjectCollectionId, createCollectionIds, setCreateCollectionIds,
    createObjectCollection, renameObjectCollection,
    deleteObjectCollection, setObjectCollectionIds, deleteCreatedObject,
    editingObjectId, pendingTemplateId, pendingAuthoringPath,
    pendingLibraryFolderId, clearPendingLibraryFolderId, libraryRootNonce,
    navigate, login, logout,
    setRole, setProgram, openReader, closeReader, setCreatorObjectType, setPendingTemplateId, setPendingAuthoringPath, addObject,
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
          ) : launchFailed ? (
            <div className="grid min-h-screen place-items-center px-6">
              <div className="text-center" style={{ maxWidth: 360 }}>
                <p style={{ fontSize: 17, fontWeight: 700, color: '#1f1f1f' }}>
                  {launchFailed.reason === 'refused' ? 'No access to author here' : 'Couldn’t sign you in'}
                </p>
                <p style={{ fontSize: 13.5, color: 'rgba(31,31,31,0.65)', marginTop: 6, lineHeight: 1.5 }}>
                  {launchFailed.reason === 'refused'
                    // The server's own words: it names the exact toggle that is off —
                    // the club's Learning feature, its parent program's, or the org's
                    // learning module — which a generic message would send someone
                    // hunting for.
                    ? (launchFailed.detail ?? `The server refused this (${launchFailed.status ?? '403'}).`)
                    : launchFailed.reason === 'unreachable'
                      ? 'Could not reach the server. Check the connection and try again from the app.'
                      : 'This link works once. Close this and open it again from the app, which mints a fresh one.'}
                </p>
              </div>
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
