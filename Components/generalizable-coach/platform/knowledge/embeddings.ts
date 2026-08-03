/**
 * Zone 1 — Platform core: embeddings port + hybrid retrieval.
 *
 * The keyword retriever (chat.ts `scoreChunks`) is the zero-config default.
 * When an EmbeddingProvider is injected, HybridRetriever blends normalized
 * keyword overlap with cosine similarity of embeddings — better grounding as
 * the corpus grows, and the on-ramp to the architecture doc's §4 (Embedding
 * Generator + Vector Store). With no provider it falls back to pure keyword.
 */
import type { KnowledgeChunk } from "../types/index";
import { scoreChunksScored } from "../embed/chat";

/** Anything that turns text into vectors (OpenAI, a local model, a stub). */
export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    // `i < n` bounds both, so the fallbacks never fire — they are here so the
    // file compiles under a consumer's `noUncheckedIndexedAccess`, and 0 is the
    // identity for every term below anyway.
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface HybridOptions {
  /** weight of the keyword signal (default 0.5) */
  keywordWeight?: number;
  /** weight of the embedding signal (default 0.5) */
  embeddingWeight?: number;
}

/**
 * Retrieves chunks by a blend of keyword overlap and embedding similarity.
 * Chunk embeddings are computed once (lazily) and cached for the retriever's
 * lifetime, so a session's repeated chats don't re-embed the corpus.
 */
export class HybridRetriever {
  private chunkVecs: number[][] | null = null;
  private readonly kw: number;
  private readonly ew: number;

  constructor(
    private readonly chunks: KnowledgeChunk[],
    private readonly embedder?: EmbeddingProvider,
    opts: HybridOptions = {},
  ) {
    this.kw = opts.keywordWeight ?? 0.5;
    this.ew = opts.embeddingWeight ?? 0.5;
  }

  async retrieve(question: string, topN = 5): Promise<KnowledgeChunk[]> {
    const keyword = scoreChunksScored(question, this.chunks);

    // No embedder → pure keyword (same as scoreChunks).
    if (!this.embedder) {
      return keyword
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN)
        .map((s) => s.chunk);
    }

    if (!this.chunkVecs) {
      this.chunkVecs = await this.embedder.embed(this.chunks.map((c) => c.content));
    }
    const [qVec] = await this.embedder.embed([question]);
    const chunkVecs = this.chunkVecs ?? [];
    // An embedder that returned nothing for the question can't contribute a
    // similarity; fall back to the keyword ranking rather than scoring everything 0.
    if (!qVec) {
      return keyword
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN)
        .map((s) => s.chunk);
    }

    const maxKw = Math.max(1, ...keyword.map((s) => s.score));
    const blended = this.chunks.map((chunk, i) => {
      const kwNorm = (keyword[i]?.score ?? 0) / maxKw; // 0..1
      const cos = Math.max(0, cosineSimilarity(qVec, chunkVecs[i] ?? [])); // 0..1
      return { chunk, score: this.kw * kwNorm + this.ew * cos };
    });

    return blended
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
      .map((s) => s.chunk);
  }
}

export interface OpenAIEmbeddingOptions {
  apiKey: string;
  model?: string;
}

/**
 * OpenAI embeddings provider (browser-safe: uses fetch, no process.env).
 * Optional — inject only if you want real semantic retrieval; the platform
 * never requires it.
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(opts: OpenAIEmbeddingOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "text-embedding-3-small";
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI embeddings failed: ${res.status}`);
    }
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data.map((d) => d.embedding);
  }
}
