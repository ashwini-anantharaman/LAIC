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
  /**
   * Open, domain-defined metadata. The platform never reads domain-specific
   * keys — it carries this through opaquely. `sourceDocument` is the one
   * cross-domain convention (citation/provenance); everything else (e.g. a
   * bridge domain's `exampleHands`, a music domain's `audioClip`) is the
   * domain's own and lives under here without the platform contract naming it.
   */
  metadata?: {
    sourceDocument?: string;
  } & Record<string, unknown>;
}

export interface KnowledgePackage {
  packageId: string;
  domainId: string;
  version: string;
  chunks: KnowledgeChunk[];
}
