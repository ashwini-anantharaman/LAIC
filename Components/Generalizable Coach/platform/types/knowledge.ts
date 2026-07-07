/**
 * Zone 2 — Domain Contracts: knowledge package / chunk shapes.
 *
 * Domains author knowledge as chunks tagged with the concepts and skills
 * they teach. The platform retrieves chunks generically by these tags.
 */

export type Difficulty = "beginner" | "intermediate" | "advanced";

export type ChunkType =
  | "rule"
  | "example"
  | "explanation"
  | "misconception"
  | "hint_template"
  | "drill_prompt";

export interface KnowledgeChunk {
  chunkId: string;
  conceptIds: string[];
  skillIds: string[];
  difficulty: Difficulty;
  chunkType: ChunkType;
  content: string;
  metadata?: {
    sourceDocument?: string;
    bridgeSystem?: string;
    exampleHands?: string[];
  };
}

export interface KnowledgePackage {
  packageId: string;
  domainId: string;
  version: string;
  chunks: KnowledgeChunk[];
}
