import { describe, it, expect } from "vitest";
import { cosineSimilarity, HybridRetriever, type EmbeddingProvider } from "./embeddings";
import type { KnowledgeChunk } from "../types/index";

function chunk(id: string, content: string): KnowledgeChunk {
  return {
    chunkId: id,
    conceptIds: [],
    skillIds: [],
    difficulty: "beginner",
    chunkType: "rule",
    content,
  };
}

// Stub embedder: "finesse"/"honor" text → one direction, everything else → another.
const stub: EmbeddingProvider = {
  async embed(texts) {
    return texts.map((t) =>
      /finesse|honor/i.test(t) ? [1, 0, 0] : [0, 1, 0],
    );
  },
};

describe("cosineSimilarity", () => {
  it("is 1 for identical direction, 0 for orthogonal", () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

describe("HybridRetriever", () => {
  const chunks = [chunk("finesse", "A finesse is a way to win a trick"), chunk("open", "Opening 1NT shows 15-17")];

  it("falls back to keyword ranking when no embedder is given", async () => {
    const r = new HybridRetriever(chunks);
    const hits = await r.retrieve("opening notrump", 5);
    expect(hits[0].chunkId).toBe("open");
  });

  it("surfaces a semantically-relevant chunk that keyword search misses", async () => {
    const r = new HybridRetriever(chunks, stub);
    // "capturing an honor" shares NO keyword with the finesse chunk's text,
    // but the embedder places them in the same direction.
    const hits = await r.retrieve("capturing an honor by leading up", 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].chunkId).toBe("finesse");
  });
});
