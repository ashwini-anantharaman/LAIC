/**
 * KnowledgeChunk normalization (LAIC M1/A1).
 *
 * Enforces the "required-tag rule": every chunk a producer ships must carry
 * conceptIds/skillIds/chunkType, because retrieval and progressive disclosure
 * key off them. Rather than reject or silently accept an untagged chunk, we
 * apply a safe default (`chunkType: "explanation"`, empty tag arrays) so a chunk
 * is never silently un-retrievable. Also stamps `schemaVersion` and adapts the
 * Phase-1 `chunkId` field onto the M0 `id` field at the boundary (approach 1b).
 */
import type { KnowledgeChunk } from "../../contracts/index.js";
import { CONTRACTS_SCHEMA_VERSION } from "../../contracts/index.js";

/** A loose, producer-supplied chunk — may be a Phase-1 chunk or partially tagged. */
export interface RawChunk {
  id?: string;
  chunkId?: string; // Phase-1 field name, adapted here
  content: string;
  conceptIds?: string[];
  skillIds?: string[];
  chunkType?: KnowledgeChunk["chunkType"];
  difficulty?: KnowledgeChunk["difficulty"];
  scopeId?: string;
  citation?: string;
  schemaVersion?: string;
  embedding?: number[];
  score?: number;
}

/** The safe default chunk type when a producer failed to tag one. */
export const DEFAULT_CHUNK_TYPE: NonNullable<KnowledgeChunk["chunkType"]> = "explanation";

export function toKnowledgeChunk(raw: RawChunk): KnowledgeChunk {
  const id = raw.id ?? raw.chunkId;
  if (!id) throw new Error("KnowledgeChunk requires an id (or Phase-1 chunkId).");
  if (raw.content == null) throw new Error(`KnowledgeChunk ${id} requires content.`);

  const chunk: KnowledgeChunk = {
    schemaVersion: raw.schemaVersion ?? CONTRACTS_SCHEMA_VERSION,
    id,
    content: raw.content,
    conceptIds: raw.conceptIds ?? [],
    skillIds: raw.skillIds ?? [],
    chunkType: raw.chunkType ?? DEFAULT_CHUNK_TYPE, // required-tag rule: safe default
  };
  if (raw.difficulty !== undefined) chunk.difficulty = raw.difficulty;
  if (raw.scopeId !== undefined) chunk.scopeId = raw.scopeId;
  if (raw.citation !== undefined) chunk.citation = raw.citation;
  if (raw.embedding !== undefined) chunk.embedding = raw.embedding;
  if (raw.score !== undefined) chunk.score = raw.score;
  return chunk;
}
