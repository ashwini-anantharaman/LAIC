/**
 * Named Content Library collections — nested folders for content.
 */

import type { LearningObject } from './types';

export interface ObjectCollection {
  id: string;
  name: string;
  createdAt: string;
  /** Parent folder id; omit / null = root directory. */
  parentId?: string | null;
  /** Built-in folders ship with the app and cannot be deleted. */
  builtin?: boolean;
}

/** Stable Content Library folder — always present for every user/role. */
export const BB_TUTORIALS_COLLECTION_ID = 'ocol-bb-tutorials';
export const BB_TUTORIALS_COLLECTION_NAME = 'bb-tutorials';
/** Local-only id from early authoring; remapped to the stable builtin id. */
export const BB_TUTORIALS_LEGACY_COLLECTION_ID = 'ocol-msidjuqo-copb';

export function isBuiltinObjectCollection(id: string): boolean {
  return id === BB_TUTORIALS_COLLECTION_ID;
}

/** Normalize membership — supports multi-collection + legacy single id. */
export function objectCollectionIds(obj: Pick<LearningObject, 'collectionIds' | 'collectionId'>): string[] {
  if (Array.isArray(obj.collectionIds) && obj.collectionIds.length > 0) {
    return [...new Set(obj.collectionIds.filter(Boolean))];
  }
  if (obj.collectionId) return [obj.collectionId];
  return [];
}

const KEY = (userId: string) => `laic-object-collections:${userId || 'anon'}`;
const ACTIVE_KEY = (userId: string) => `laic-object-collection-active:${userId || 'anon'}`;

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeObjectCollections(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function normalizeCollection(c: any): ObjectCollection | null {
  if (!c || typeof c.id !== 'string' || typeof c.name !== 'string') return null;
  const parentId = c.parentId == null || c.parentId === ''
    ? null
    : (typeof c.parentId === 'string' ? c.parentId : null);
  const id = c.id;
  return {
    id,
    name: String(c.name).trim() || 'Untitled collection',
    createdAt: String(c.createdAt || new Date().toISOString().slice(0, 10)),
    parentId,
    builtin: id === BB_TUTORIALS_COLLECTION_ID || Boolean(c.builtin),
  };
}

function readList(userId: string): ObjectCollection[] {
  try {
    const raw = localStorage.getItem(KEY(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeCollection).filter(Boolean) as ObjectCollection[];
  } catch {
    return [];
  }
}

function writeList(userId: string, list: ObjectCollection[]) {
  localStorage.setItem(KEY(userId), JSON.stringify(list));
  emit();
}

export function getRootCollections(list: ObjectCollection[]): ObjectCollection[] {
  return list.filter((c) => !c.parentId);
}

export function getChildCollections(list: ObjectCollection[], parentId: string): ObjectCollection[] {
  return list.filter((c) => c.parentId === parentId);
}

/** Ancestors from root → parent of `id` (not including `id`). */
export function getCollectionPath(list: ObjectCollection[], id: string): ObjectCollection[] {
  const byId = new Map(list.map((c) => [c.id, c]));
  const chain: ObjectCollection[] = [];
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur?.parentId && !seen.has(cur.parentId)) {
    seen.add(cur.parentId);
    const parent = byId.get(cur.parentId);
    if (!parent) break;
    chain.unshift(parent);
    cur = parent;
  }
  return chain;
}

export function isDescendantOf(
  list: ObjectCollection[],
  ancestorId: string,
  nodeId: string,
): boolean {
  const byId = new Map(list.map((c) => [c.id, c]));
  let cur = byId.get(nodeId);
  const seen = new Set<string>();
  while (cur?.parentId && !seen.has(cur.parentId)) {
    if (cur.parentId === ancestorId) return true;
    seen.add(cur.parentId);
    cur = byId.get(cur.parentId);
  }
  return false;
}

function bbTutorialsFolder(): ObjectCollection {
  return {
    id: BB_TUTORIALS_COLLECTION_ID,
    name: BB_TUTORIALS_COLLECTION_NAME,
    createdAt: '2026-08-07',
    parentId: null,
    builtin: true,
  };
}

/**
 * Ensure every user has the built-in bb-tutorials folder plus at least one
 * personal root collection. Migrates any legacy “bb-tutorials” folder id.
 */
export function ensureDefaultObjectCollection(userId: string): ObjectCollection[] {
  let list = readList(userId).map((c) => (
    c.id === BB_TUTORIALS_COLLECTION_ID
      ? { ...c, name: BB_TUTORIALS_COLLECTION_NAME, parentId: null, builtin: true }
      : c
  ));

  // Collapse any user-created “bb-tutorials” folder into the stable builtin id.
  const legacy = list.find((c) => (
    c.id === BB_TUTORIALS_LEGACY_COLLECTION_ID
    || (c.name.trim().toLowerCase() === BB_TUTORIALS_COLLECTION_NAME && c.id !== BB_TUTORIALS_COLLECTION_ID)
  ));
  if (legacy) {
    list = list
      .filter((c) => c.id !== legacy.id)
      .map((c) => (c.parentId === legacy.id ? { ...c, parentId: BB_TUTORIALS_COLLECTION_ID } : c));
  }

  if (!list.some((c) => c.id === BB_TUTORIALS_COLLECTION_ID)) {
    list = [bbTutorialsFolder(), ...list];
  }

  if (!list.some((c) => c.id !== BB_TUTORIALS_COLLECTION_ID)) {
    const personal: ObjectCollection = {
      id: `ocol-${Date.now().toString(36)}`,
      name: 'My content',
      createdAt: new Date().toISOString().slice(0, 10),
      parentId: null,
    };
    list = [...list, personal];
  }

  writeList(userId, list);
  const active = getActiveObjectCollectionId(userId);
  if (!active || !list.some((c) => c.id === active)) {
    const personal = list.find((c) => c.id !== BB_TUTORIALS_COLLECTION_ID) || list[0];
    if (personal) setActiveObjectCollectionId(userId, personal.id);
  }
  return list;
}

export function getObjectCollections(userId: string): ObjectCollection[] {
  return ensureDefaultObjectCollection(userId);
}

export function setObjectCollections(userId: string, next: ObjectCollection[]): void {
  writeList(userId, next);
}

export function createObjectCollection(
  userId: string,
  name: string,
  parentId?: string | null,
): ObjectCollection {
  const trimmed = name.trim() || 'Untitled collection';
  const list = getObjectCollections(userId);
  const parent = parentId && list.some((c) => c.id === parentId) ? parentId : null;
  const created: ObjectCollection = {
    id: `ocol-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: trimmed,
    createdAt: new Date().toISOString().slice(0, 10),
    parentId: parent,
  };
  writeList(userId, [created, ...list]);
  setActiveObjectCollectionId(userId, created.id);
  return created;
}

export function renameObjectCollection(userId: string, id: string, name: string): void {
  if (isBuiltinObjectCollection(id)) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const list = getObjectCollections(userId).map((c) => (c.id === id ? { ...c, name: trimmed } : c));
  writeList(userId, list);
}

/**
 * Delete a folder. Child folders are reparented to this folder's parent (or root).
 * Always keeps at least one collection in the account.
 * Built-in folders (bb-tutorials) cannot be deleted.
 */
export function deleteObjectCollection(userId: string, id: string): void {
  if (isBuiltinObjectCollection(id)) return;
  const current = getObjectCollections(userId);
  if (current.length <= 1) return;
  const target = current.find((c) => c.id === id);
  if (!target || target.builtin) return;
  const newParent = target.parentId || null;
  const list = current
    .filter((c) => c.id !== id)
    .map((c) => (c.parentId === id ? { ...c, parentId: newParent } : c));
  if (!list.length) return;
  writeList(userId, list);
  const active = getActiveObjectCollectionId(userId);
  if (active === id) setActiveObjectCollectionId(userId, list[0].id);
}

export function getActiveObjectCollectionId(userId: string): string | null {
  try {
    const id = localStorage.getItem(ACTIVE_KEY(userId));
    if (!id) return null;
    const list = getObjectCollections(userId);
    return list.some((c) => c.id === id) ? id : (list[0]?.id || null);
  } catch {
    return null;
  }
}

export function setActiveObjectCollectionId(userId: string, id: string): void {
  localStorage.setItem(ACTIVE_KEY(userId), id);
  emit();
}
