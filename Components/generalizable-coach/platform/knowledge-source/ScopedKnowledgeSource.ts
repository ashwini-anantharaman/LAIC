/**
 * Zone 1 — Platform core: scope enforcement over any KnowledgeSource (M3).
 *
 * The primary tutoring guardrail: wraps any KnowledgeSource and filters its
 * results to a `KnowledgeScope` — a chunk must touch an allowed concept and
 * must not touch a forbidden one. An out-of-scope query therefore returns
 * nothing, which is what lets the tutor DECLINE rather than hallucinate.
 */
import type { KnowledgeChunk, KnowledgeScope } from "../../contracts/generated/index";
import type { KnowledgeQuery, KnowledgeSource } from "./KnowledgeSource";

export class ScopedKnowledgeSource implements KnowledgeSource {
  constructor(
    private readonly inner: KnowledgeSource,
    private readonly scope: KnowledgeScope,
  ) {}

  async retrieve(query: KnowledgeQuery): Promise<KnowledgeChunk[]> {
    const results = await this.inner.retrieve(query);
    return results.filter((c) => this.inScope(c));
  }

  private inScope(chunk: KnowledgeChunk): boolean {
    const concepts = chunk.conceptIds ?? [];
    const allowed = this.scope.allowedConceptIds ?? [];
    const forbidden = this.scope.forbiddenConceptIds ?? [];

    if (concepts.some((c) => forbidden.includes(c))) return false;
    // If an allowlist is set, the chunk must touch at least one allowed concept.
    if (allowed.length > 0 && !concepts.some((c) => allowed.includes(c))) return false;
    return true;
  }
}
