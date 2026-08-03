/**
 * Zone 1 — Platform core: cross-scope retrieval composite (LAIC §11.4, M4/D2).
 *
 * Fans a query across N KnowledgeSources (typically one PlatformKnowledgeSource
 * per enrolled course), merges and re-ranks the results, and returns the top-K —
 * all behind the same KnowledgeSource port, so nothing upstream changes.
 *
 * GATED BY POLICY: cross-course/cross-scope retrieval is off by default to
 * satisfy the LPIP isolation rule (§5.4). A single-course session uses one
 * PlatformKnowledgeSource directly and never constructs this composite; this is
 * only built when the resolved policy enables cross-scope awareness.
 *
 * Ranking: per-source min-max normalization of `score` before merge (cheap and
 * source-count-agnostic), then dedupe by chunk id, then top-K. A shared reranker
 * can replace this later on evidence, without touching callers.
 */
import type { KnowledgeChunk } from "../../contracts/index";
import type { KnowledgeQuery, KnowledgeSource } from "./KnowledgeSource";

const DEFAULT_TOP_K = 5;

/** Min-max normalize the `score` field of one source's results into [0,1]. */
function normalizeScores(chunks: KnowledgeChunk[]): KnowledgeChunk[] {
  const scored = chunks.filter((c) => typeof c.score === "number");
  if (scored.length < 2) return chunks; // nothing meaningful to normalize
  const scores = scored.map((c) => c.score as number);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;
  if (range === 0) return chunks;
  return chunks.map((c) =>
    typeof c.score === "number" ? { ...c, score: (c.score - min) / range } : c,
  );
}

export class MultiScopeKnowledgeSource implements KnowledgeSource {
  private readonly sources: KnowledgeSource[];

  constructor(sources: KnowledgeSource[]) {
    this.sources = sources;
  }

  async retrieve(query: KnowledgeQuery): Promise<KnowledgeChunk[]> {
    const topK = query.topK ?? DEFAULT_TOP_K;
    // One source failing must not sink the whole query.
    const settled = await Promise.allSettled(this.sources.map((s) => s.retrieve(query)));

    const merged: KnowledgeChunk[] = [];
    const seen = new Set<string>();
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      for (const chunk of normalizeScores(result.value)) {
        if (seen.has(chunk.id)) continue;
        seen.add(chunk.id);
        merged.push(chunk);
      }
    }

    merged.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return merged.slice(0, topK);
  }
}
