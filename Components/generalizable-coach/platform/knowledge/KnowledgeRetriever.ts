/**
 * Zone 1 — Platform core: generic knowledge retriever.
 *
 * Domain-agnostic. Retrieves chunks from a KnowledgePackage by concept tags,
 * with optional difficulty / chunkType filters, and supports the coach's
 * progressive-disclosure hint levels.
 */
import type {
  KnowledgePackage,
  KnowledgeChunk,
  Difficulty,
  ChunkType,
  HintLevel,
} from "../types/index";

export class KnowledgeRetriever {
  private readonly chunks: KnowledgeChunk[];

  constructor(pkg: KnowledgePackage) {
    this.chunks = pkg.chunks;
  }

  /** The full corpus (read-only) — used by free-text retrieval layers. */
  allChunks(): readonly KnowledgeChunk[] {
    return this.chunks;
  }

  /**
   * Return chunks matching ANY of the given conceptIds, optionally filtered by
   * difficulty and chunkType. Ordered by relevance: chunks matching more of
   * the requested conceptIds come first.
   */
  retrieve(
    conceptIds: string[],
    difficulty?: Difficulty,
    chunkType?: ChunkType,
  ): KnowledgeChunk[] {
    const wanted = new Set(conceptIds);

    const scored = this.chunks
      .map((chunk) => {
        const overlap = chunk.conceptIds.filter((c) => wanted.has(c)).length;
        return { chunk, overlap };
      })
      .filter(({ chunk, overlap }) => {
        if (overlap === 0) return false;
        if (difficulty && chunk.difficulty !== difficulty) return false;
        if (chunkType && chunk.chunkType !== chunkType) return false;
        return true;
      });

    scored.sort((a, b) => b.overlap - a.overlap);
    return scored.map((s) => s.chunk);
  }

  /**
   * Progressive disclosure by hint level:
   *  - 1: hint_template chunks only
   *  - 2: rule chunks only
   *  - 3: rule + example chunks
   *  - 4: rule + example + explanation chunks
   */
  retrieveForHint(conceptIds: string[], hintLevel: HintLevel): KnowledgeChunk[] {
    const typesByLevel: Record<HintLevel, ChunkType[]> = {
      1: ["hint_template"],
      2: ["rule"],
      3: ["rule", "example"],
      4: ["rule", "example", "explanation"],
    };
    const allowed = new Set<ChunkType>(typesByLevel[hintLevel]);
    return this.retrieve(conceptIds).filter((c) => allowed.has(c.chunkType));
  }
}
