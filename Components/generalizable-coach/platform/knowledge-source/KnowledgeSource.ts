/**
 * Zone 2 — Domain Contracts: the KnowledgeSource port (LAIC §11.2, M1/A2).
 *
 * The ENTIRE surface between the Coach and "where knowledge lives". The Coach
 * decides when and what to retrieve and calls `retrieve()`; it never knows
 * whether the answer came from an in-process bundle, an HTTP `/retrieve`, or a
 * cross-course composite. One port, many producers — this is what lets the same
 * engine run embedded in Bridge and online in the Learning Platform.
 *
 * Retrieved chunks conform to the generated M0 `KnowledgeChunk` contract.
 */
import type { KnowledgeChunk } from "../../contracts/generated/index";

export type ChunkType = NonNullable<KnowledgeChunk["chunkType"]>;
export type Difficulty = NonNullable<KnowledgeChunk["difficulty"]>;

export interface KnowledgeQuery {
  /** free-text semantic query (keyword match offline; cosine if `embedding` given) */
  text?: string;
  /** tag query — retrieve chunks about these concepts */
  conceptIds?: string[];
  /** tag query — chunks that train these skills */
  skillIds?: string[];
  /** progressive disclosure by hint level: restrict to one chunk type */
  chunkType?: ChunkType;
  difficulty?: Difficulty;
  topK?: number;
  /** course/domain scope; defaults to "current". Cross-scope is policy-gated. */
  scope?: "current" | "all" | string[];
  /** optional query vector; enables cosine ranking against chunk embeddings */
  embedding?: number[];
}

/** A pull port owned by the Coach. Identical whether bundled or platform-backed. */
export interface KnowledgeSource {
  retrieve(query: KnowledgeQuery): Promise<KnowledgeChunk[]>;
}

/** A bundled corpus of chunks for one domain (the offline "Application mode" unit). */
export interface KnowledgePackage {
  packageId: string;
  domainId: string;
  version: string;
  chunks: KnowledgeChunk[];
}

/**
 * The chunk-type ladder for progressive disclosure. The intervention engine
 * (M2) maps a numeric hint level onto these; the port itself stays level-agnostic.
 */
export const CHUNK_TYPES_BY_HINT_LEVEL: Record<number, ChunkType[]> = {
  1: ["hint_template"],
  2: ["rule"],
  3: ["rule", "example"],
  4: ["rule", "example", "explanation"],
};
