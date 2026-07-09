/* eslint-disable */
/**
 * AUTO-GENERATED from contracts/schemas/KnowledgeChunk.schema.json — DO NOT EDIT BY HAND.
 * Regenerate with: npm run contracts:gen
 */

/**
 * A single unit of retrievable teaching material. The Coach consumes these through the KnowledgeSource contract; producers (authored or ingested) populate the tags. See LAIC architecture §11.1.
 */
export interface KnowledgeChunk {
  /**
   * Contract version, e.g. "1.0.0". Adapters reject unknown major versions.
   */
  schemaVersion: string;
  id: string;
  content: string;
  conceptIds?: string[];
  skillIds?: string[];
  chunkType?: "rule" | "example" | "explanation" | "misconception" | "hint_template" | "drill_prompt";
  difficulty?: "beginner" | "intermediate" | "advanced";
  scopeId?: string;
  citation?: string;
  pageStart?: number;
  pageEnd?: number;
  timeStart?: number;
  timeEnd?: number;
  score?: number;
  embedding?: number[];
}
