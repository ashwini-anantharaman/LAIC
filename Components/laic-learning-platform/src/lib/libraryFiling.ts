/**
 * File content into the folder that matches its type.
 *
 * The library filed by whatever folder happened to be selected when an object
 * was created, so a flashcard set could sit in the tutorials folder — the type
 * printed under its title and the folder it lived in disagreed.
 *
 * The type is the fact; the folder follows it. Folders are matched by NAME so
 * an author's existing "flashcards" folder is reused rather than duplicated,
 * and created only when nothing suitable exists.
 */

import type { LearningObject } from './types';
import {
  BB_TUTORIALS_COLLECTION_ID,
  BB_TUTORIALS_COLLECTION_NAME,
  getObjectCollections,
  objectCollectionIds,
  setObjectCollections,
  type ObjectCollection,
} from './objectCollectionsStore';

/** Folder each content type belongs in, by folder name. */
const FOLDER_FOR_TYPE: Record<string, string> = {
  'tutorial': BB_TUTORIALS_COLLECTION_NAME,
  'tutorial-v2': BB_TUTORIALS_COLLECTION_NAME,
  'quiz': 'quiz',
  'flashcard-set': 'flashcards',
  'concept-card': 'concept cards',
  'video-script': 'video scripts',
  'summary': 'summaries',
  'reflection': 'reflections',
  'assignment': 'assignments',
  'scenario': 'scenarios',
  'drill': 'drills',
};

function newCollectionId(): string {
  return `ocol-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** The folder one type belongs in, created if missing. Null = no home for it. */
export function folderIdForType(userId: string, type: string): string | null {
  const name = FOLDER_FOR_TYPE[String(type)];
  if (!name) return null;
  const existing = getObjectCollections(userId);
  const hit = existing.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
  if (hit) return hit.id;
  const folder: ObjectCollection = {
    id: name === BB_TUTORIALS_COLLECTION_NAME ? BB_TUTORIALS_COLLECTION_ID : newCollectionId(),
    name,
    createdAt: new Date().toISOString().slice(0, 10),
    parentId: null,
    builtin: name === BB_TUTORIALS_COLLECTION_NAME,
  };
  setObjectCollections(userId, [...existing, folder]);
  return folder.id;
}

/**
 * Move every object into its type's folder, creating folders as needed.
 *
 * Returns the objects unchanged when nothing is misfiled, so callers can keep
 * their existing "did anything change?" short-circuits.
 */
export function fileObjectsByType(
  userId: string,
  objects: LearningObject[],
): LearningObject[] {
  if (!objects.length) return objects;

  const existing = getObjectCollections(userId);
  const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c]));
  const created: ObjectCollection[] = [];

  const folderIdFor = (type: string): string | null => {
    const name = FOLDER_FOR_TYPE[type];
    if (!name) return null; // unknown type: leave the author's filing alone
    const hit = byName.get(name.toLowerCase());
    if (hit) return hit.id;
    const folder: ObjectCollection = {
      // bb-tutorials is a stable builtin; everything else gets a fresh id.
      id: name === BB_TUTORIALS_COLLECTION_NAME ? BB_TUTORIALS_COLLECTION_ID : newCollectionId(),
      name,
      createdAt: new Date().toISOString().slice(0, 10),
      parentId: null,
      builtin: name === BB_TUTORIALS_COLLECTION_NAME,
    };
    byName.set(name.toLowerCase(), folder);
    created.push(folder);
    return folder.id;
  };

  let changed = false;
  const next = objects.map((o) => {
    const target = folderIdFor(String(o.type));
    if (!target) return o;
    const ids = objectCollectionIds(o);
    if (ids.length === 1 && ids[0] === target) return o;
    changed = true;
    return { ...o, collectionIds: [target], collectionId: undefined };
  });

  if (created.length) setObjectCollections(userId, [...existing, ...created]);
  return changed ? next : objects;
}
