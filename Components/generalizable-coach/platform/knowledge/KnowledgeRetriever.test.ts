import { describe, it, expect } from "vitest";
import { KnowledgeRetriever } from "./KnowledgeRetriever";
import type { KnowledgePackage } from "../types/index";

// A self-contained, domain-neutral package. The retriever is Zone-1 platform
// code and must not depend on any specific domain (e.g. bridge) to be tested —
// concept/skill ids here are opaque strings, exactly as a real domain supplies.
const CONCEPT_A = "concept.a";
const CONCEPT_B = "concept.b";

function pkg(): KnowledgePackage {
  const c = (
    chunkId: string,
    conceptIds: string[],
    chunkType: any,
    difficulty: any = "beginner",
  ) => ({
    chunkId,
    conceptIds,
    skillIds: [],
    chunkType,
    difficulty,
    content: `content-${chunkId}`,
  });
  return {
    packageId: "generic_test_pkg_v1",
    domainId: "generic_test",
    version: "1.0.0",
    chunks: [
      c("h1", [CONCEPT_A], "hint_template"),
      c("h2", [CONCEPT_A], "hint_template"),
      c("r1", [CONCEPT_A], "rule"),
      c("r2", [CONCEPT_A, CONCEPT_B], "rule"), // tagged with BOTH concepts
      c("e1", [CONCEPT_A], "example"),
      c("x1", [CONCEPT_A], "explanation"),
      c("b1", [CONCEPT_B], "rule"),
      c("adv", [CONCEPT_A], "rule", "advanced"), // different difficulty
    ],
  };
}

const retriever = new KnowledgeRetriever(pkg());

describe("knowledge package", () => {
  it("loads all chunks well-formed", () => {
    const p = pkg();
    expect(p.packageId).toBe("generic_test_pkg_v1");
    expect(p.chunks.length).toBeGreaterThanOrEqual(8);
    for (const ch of p.chunks) {
      expect(ch.chunkId).toBeTruthy();
      expect(ch.conceptIds.length).toBeGreaterThan(0);
      expect(ch.content.length).toBeGreaterThan(0);
    }
  });
});

describe("retrieve", () => {
  it("returns chunks matching a concept", () => {
    const chunks = retriever.retrieve([CONCEPT_A]);
    expect(chunks.length).toBeGreaterThan(0);
    for (const c of chunks) {
      expect(c.conceptIds).toContain(CONCEPT_A);
    }
  });

  it("filters by chunkType", () => {
    const rules = retriever.retrieve([CONCEPT_A], undefined, "rule");
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((c) => c.chunkType === "rule")).toBe(true);
  });

  it("filters by difficulty", () => {
    const chunks = retriever.retrieve([CONCEPT_A], "beginner");
    expect(chunks.every((c) => c.difficulty === "beginner")).toBe(true);
    expect(chunks.some((c) => c.chunkId === "adv")).toBe(false);
  });

  it("orders by concept overlap (more matches first)", () => {
    const chunks = retriever.retrieve([CONCEPT_A, CONCEPT_B]);
    const overlaps = chunks.map(
      (c) =>
        c.conceptIds.filter((id) => [CONCEPT_A, CONCEPT_B].includes(id)).length,
    );
    const sorted = [...overlaps].sort((a, b) => b - a);
    expect(overlaps).toEqual(sorted);
    // the chunk tagged with both concepts ranks first
    expect(chunks[0].chunkId).toBe("r2");
  });

  it("returns nothing for an unknown concept", () => {
    expect(retriever.retrieve(["concept.does_not_exist"])).toEqual([]);
  });
});

describe("retrieveForHint", () => {
  it("level 1 returns only hint_template chunks", () => {
    const chunks = retriever.retrieveForHint([CONCEPT_A], 1);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.chunkType === "hint_template")).toBe(true);
  });

  it("level 2 returns only rule chunks", () => {
    const chunks = retriever.retrieveForHint([CONCEPT_A], 2);
    expect(chunks.every((c) => c.chunkType === "rule")).toBe(true);
  });

  it("level 3 returns rule + example chunks", () => {
    const chunks = retriever.retrieveForHint([CONCEPT_A], 3);
    expect(chunks.every((c) => ["rule", "example"].includes(c.chunkType))).toBe(
      true,
    );
    expect(chunks.some((c) => c.chunkType === "example")).toBe(true);
  });

  it("level 4 adds explanation chunks", () => {
    const chunks = retriever.retrieveForHint([CONCEPT_A], 4);
    expect(
      chunks.every((c) =>
        ["rule", "example", "explanation"].includes(c.chunkType),
      ),
    ).toBe(true);
    expect(chunks.some((c) => c.chunkType === "explanation")).toBe(true);
  });
});
