// Two-level versioning helpers (spec: KB versions + item versions). Pure
// functions — the service orchestrates the store around them.
//
// Two orthogonal axes, deliberately kept apart:
//  - FORK   (new itemId, forkedFromItemId): cross-KB divergence — the same
//            situation authored differently in two KBs (copy-on-diverge).
//  - VERSION (same itemId, committed snapshots): the SAME item evolving over
//            time. Committed versions are immutable and retained; the head
//            keeps moving above them.
//
// A published KB version is a manifest pinning one committed item version per
// member — a lockfile. "KB v1 ≠ every item v1": the manifest mixes freely.

import { hashValue } from "./ids";
import type { KnowledgeItem, KnowledgeItemVersion } from "./model";

/** The editable content of an item — everything a version snapshot freezes. */
export const ITEM_CONTENT_KEYS = [
  "title",
  "humanReadableText",
  "knowledgeType",
  "phase",
  "payload",
  "settings",
  "sourceReferences",
  "supportedLevels",
  "status",
] as const;

/** Stable hash of an item's content (ignores metadata: version, timestamps). */
export function itemContentHash(item: KnowledgeItem | KnowledgeItemVersion): string {
  const src = item as unknown as Record<string, unknown>;
  const content: Record<string, unknown> = {};
  for (const key of ITEM_CONTENT_KEYS) content[key] = src[key];
  return hashValue(content);
}

/**
 * True when the head has edits not yet frozen into its latest committed
 * version (or has never been committed at all).
 */
export function itemIsDirty(
  item: KnowledgeItem,
  latest: KnowledgeItemVersion | null,
): boolean {
  if (!latest) return true;
  return itemContentHash(item) !== latest.contentHash;
}

/** Freeze an item head into an immutable version snapshot. */
export function snapshotItem(
  item: KnowledgeItem,
  versionNumber: number,
  committedBy: string,
  committedAt: string,
  changeNote?: string,
): KnowledgeItemVersion {
  return {
    itemId: item.itemId,
    versionNumber,
    headVersion: item.version,
    title: item.title,
    humanReadableText: item.humanReadableText,
    knowledgeType: item.knowledgeType,
    phase: item.phase,
    payload: item.payload,
    settings: item.settings,
    sourceReferences: item.sourceReferences,
    supportedLevels: item.supportedLevels,
    status: item.status,
    contentHash: itemContentHash(item),
    changeNote,
    committedBy,
    committedAt,
  };
}

/** Reconstruct an item head's content from a committed snapshot (for restore). */
export function itemContentFromVersion(
  v: KnowledgeItemVersion,
): Pick<
  KnowledgeItem,
  | "title"
  | "humanReadableText"
  | "knowledgeType"
  | "phase"
  | "payload"
  | "settings"
  | "sourceReferences"
  | "supportedLevels"
  | "status"
> {
  return {
    title: v.title,
    humanReadableText: v.humanReadableText,
    knowledgeType: v.knowledgeType,
    phase: v.phase,
    payload: v.payload,
    settings: v.settings,
    sourceReferences: v.sourceReferences,
    supportedLevels: v.supportedLevels,
    status: v.status,
  };
}
