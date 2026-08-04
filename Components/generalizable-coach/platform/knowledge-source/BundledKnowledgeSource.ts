/**
 * Zone 1 — Platform core: the offline, in-process KnowledgeSource (LAIC M1/A2).
 *
 * Holds a pre-baked KnowledgePackage in memory and answers retrieve() with
 * tag-based ranking (concept/skill overlap) + keyword match on content, and
 * optional cosine ranking when the caller supplies a query embedding and the
 * chunks carry embeddings. No network, no vector DB — the "Application mode"
 * adapter that lets the Coach run fully embedded.
 *
 * All chunks are normalized on construction so the required-tag rule (A1) holds
 * for whatever the producer supplied.
 */
import type { KnowledgeChunk } from "../../contracts/generated/index";
import { cosineSimilarity } from "../knowledge/embeddings";
import type { KnowledgePackage, KnowledgeQuery, KnowledgeSource } from "./KnowledgeSource";
import { toKnowledgeChunk, type RawChunk } from "./normalize";

const DEFAULT_TOP_K = 5;

/** Lowercase word tokens (letters/digits), punctuation stripped. */
function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

export class BundledKnowledgeSource implements KnowledgeSource {
  readonly domainId: string;
  private readonly chunks: KnowledgeChunk[];

  constructor(pkg: { domainId: string; chunks: RawChunk[] } | KnowledgePackage) {
    this.domainId = pkg.domainId;
    this.chunks = pkg.chunks.map((c) => toKnowledgeChunk(c as RawChunk));
  }

  /** The normalized corpus (read-only). */
  all(): readonly KnowledgeChunk[] {
    return this.chunks;
  }

  async retrieve(query: KnowledgeQuery): Promise<KnowledgeChunk[]> {
    const wantedConcepts = new Set(query.conceptIds ?? []);
    const wantedSkills = new Set(query.skillIds ?? []);
    // Whole-word tokens, length ≥ 3, so stopwords like "i"/"me" don't match as
    // substrings of unrelated words (e.g. "me" inside "memories").
    const terms = tokenize(query.text ?? "").filter((t) => t.length >= 3);
    const topK = query.topK ?? DEFAULT_TOP_K;

    const scored = this.chunks
      .filter((c) => (query.chunkType ? c.chunkType === query.chunkType : true))
      .filter((c) => (query.difficulty ? c.difficulty === query.difficulty : true))
      .map((c) => ({ chunk: c, score: this.score(c, wantedConcepts, wantedSkills, terms, query.embedding) }))
      .filter((s) => s.score > 0);

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map((s) => ({ ...s.chunk, score: s.score }));
  }

  private score(
    chunk: KnowledgeChunk,
    concepts: Set<string>,
    skills: Set<string>,
    terms: string[],
    queryEmbedding?: number[],
  ): number {
    let score = 0;
    // Tag overlap dominates (this is a tag-first retriever).
    for (const c of chunk.conceptIds ?? []) if (concepts.has(c)) score += 3;
    for (const s of chunk.skillIds ?? []) if (skills.has(s)) score += 2;
    // Keyword match on content (offline semantic proxy) — whole words only.
    if (terms.length) {
      const words = new Set(tokenize(chunk.content));
      for (const t of terms) if (words.has(t)) score += 1;
    }
    // Cosine, only when both sides have vectors (kept offline: caller supplies it).
    if (queryEmbedding && chunk.embedding && chunk.embedding.length === queryEmbedding.length) {
      score += 5 * cosineSimilarity(queryEmbedding, chunk.embedding);
    }
    // A pure tag/skill query with no text still returns everything it matched;
    // if the caller gave neither tags, text, nor embedding, surface nothing.
    return score;
  }
}
