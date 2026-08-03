/**
 * M4 gate (D2) — PlatformKnowledgeSource contract test.
 *
 * Verifies the HTTP-backed KnowledgeSource adapter against a mock `/retrieve`:
 *   - a KnowledgeQuery maps onto the correct RetrievalRequest wire body;
 *   - the response maps to conforming KnowledgeChunk[] (required-tag rule held);
 *   - a chunk with an unrecognized major schemaVersion is rejected, not guessed;
 *   - a non-2xx response surfaces as an error.
 *
 * No live server/Supabase needed — the fetch is injected. End-to-end against a
 * real Owlwise course is a manual/integration step (see M4 plan A4).
 */
import { describe, it, expect } from "vitest";
import { PlatformKnowledgeSource } from "../../platform/knowledge-source/index";
import { validate } from "../../contracts/index";

type Captured = { url: string; init: RequestInit };

/** A fetch stub that records the request and returns a canned JSON body. */
function mockFetch(
  response: { ok?: boolean; status?: number; body?: unknown; text?: string },
  captured: Captured[],
): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    captured.push({ url, init });
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.body,
      text: async () => response.text ?? "",
    };
  }) as unknown as typeof fetch;
}

const goodChunk = {
  schemaVersion: "1.0.0",
  id: "ch-1",
  content: "Working memory holds ~4 chunks.",
  conceptIds: ["concept.working_memory"],
  skillIds: ["skill.recall"],
  chunkType: "explanation",
  citation: "Notes · p. 3",
  pageStart: 3,
  pageEnd: 3,
  score: 0.82,
};

describe("PlatformKnowledgeSource", () => {
  it("maps a KnowledgeQuery onto the RetrievalRequest wire body", async () => {
    const captured: Captured[] = [];
    const source = new PlatformKnowledgeSource({
      endpoint: "http://lp.test/",
      scopeId: "course-42",
      authToken: "svc-token",
      forbiddenConceptIds: ["concept.exam_answer"],
      allowedSourceIds: ["src-9"],
      fetchImpl: mockFetch({ body: { chunks: [goodChunk] } }, captured),
    });

    await source.retrieve({ text: "how big is working memory", conceptIds: ["concept.working_memory"], chunkType: "explanation", topK: 4 });

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("http://lp.test/api/rag/retrieve");
    expect(captured[0].init.method).toBe("POST");
    const headers = captured[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer svc-token");
    const body = JSON.parse(String(captured[0].init.body));
    expect(body).toMatchObject({
      domainId: "course_learning",
      knowledgeScopeId: "course-42",
      text: "how big is working memory",
      conceptIds: ["concept.working_memory"],
      chunkType: "explanation",
      topK: 4,
      forbiddenConceptIds: ["concept.exam_answer"],
      allowedSourceIds: ["src-9"],
    });
  });

  it("maps the response to conforming KnowledgeChunks", async () => {
    const source = new PlatformKnowledgeSource({
      endpoint: "http://lp.test",
      scopeId: "course-42",
      fetchImpl: mockFetch({ body: { chunks: [goodChunk, { ...goodChunk, id: "ch-2", chunkType: undefined, skillIds: undefined }] } }, []),
    });

    const chunks = await source.retrieve({ text: "recall" });
    expect(chunks).toHaveLength(2);
    for (const c of chunks) {
      expect(validate("KnowledgeChunk", c).errors).toEqual([]);
    }
    // Required-tag rule: a chunk with no chunkType/skillIds is filled, not left undefined.
    expect(chunks[1].chunkType).toBe("explanation");
    expect(chunks[1].skillIds).toEqual([]);
    expect(chunks[0].pageStart).toBe(3);
  });

  it("rejects a chunk with an unrecognized major schemaVersion", async () => {
    const source = new PlatformKnowledgeSource({
      endpoint: "http://lp.test",
      scopeId: "course-42",
      fetchImpl: mockFetch({ body: { chunks: [{ ...goodChunk, schemaVersion: "2.0.0" }] } }, []),
    });
    await expect(source.retrieve({ text: "x" })).rejects.toThrow(/unsupported schemaVersion 2\.0\.0/);
  });

  it("surfaces a non-2xx response as an error", async () => {
    const source = new PlatformKnowledgeSource({
      endpoint: "http://lp.test",
      scopeId: "course-42",
      fetchImpl: mockFetch({ ok: false, status: 500, text: "boom" }, []),
    });
    await expect(source.retrieve({ text: "x" })).rejects.toThrow(/500/);
  });
});
