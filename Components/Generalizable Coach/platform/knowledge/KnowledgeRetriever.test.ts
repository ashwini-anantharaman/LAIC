import { describe, it, expect } from "vitest";
import { KnowledgeRetriever } from "./KnowledgeRetriever.js";
import { loadBeginner1Package } from "../../domains/bridge/knowledge/loadPackage.js";
import * as C from "../../domains/bridge/plugin/constants.js";

const pkg = loadBeginner1Package();
const retriever = new KnowledgeRetriever(pkg);

describe("knowledge package", () => {
  it("loads all beginner-1 chunks", () => {
    expect(pkg.packageId).toBe("bridge_beginner_1_v1");
    expect(pkg.chunks.length).toBeGreaterThanOrEqual(20);
    // every chunk is well-formed
    for (const c of pkg.chunks) {
      expect(c.chunkId).toBeTruthy();
      expect(c.conceptIds.length).toBeGreaterThan(0);
      expect(c.difficulty).toBe("beginner");
      expect(c.content.length).toBeGreaterThan(0);
    }
  });
});

describe("retrieve", () => {
  it("returns chunks matching a concept", () => {
    const chunks = retriever.retrieve([C.CONCEPT_OPENING_BID]);
    expect(chunks.length).toBeGreaterThan(0);
    for (const c of chunks) {
      expect(c.conceptIds).toContain(C.CONCEPT_OPENING_BID);
    }
  });

  it("filters by chunkType", () => {
    const rules = retriever.retrieve(
      [C.CONCEPT_OPENING_BID],
      undefined,
      "rule",
    );
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((c) => c.chunkType === "rule")).toBe(true);
  });

  it("filters by difficulty", () => {
    const chunks = retriever.retrieve([C.CONCEPT_HCP], "beginner");
    expect(chunks.every((c) => c.difficulty === "beginner")).toBe(true);
  });

  it("orders by concept overlap (more matches first)", () => {
    const chunks = retriever.retrieve([
      C.CONCEPT_OPENING_BID,
      C.CONCEPT_HAND_BALANCED,
    ]);
    // a chunk tagged with both should come before one tagged with only one
    const overlaps = chunks.map(
      (c) =>
        c.conceptIds.filter((id) =>
          [C.CONCEPT_OPENING_BID, C.CONCEPT_HAND_BALANCED].includes(id),
        ).length,
    );
    const sorted = [...overlaps].sort((a, b) => b - a);
    expect(overlaps).toEqual(sorted);
  });

  it("returns nothing for an unknown concept", () => {
    expect(retriever.retrieve(["CONCEPT_DOES_NOT_EXIST"])).toEqual([]);
  });
});

describe("retrieveForHint", () => {
  it("level 1 returns only hint_template chunks", () => {
    const chunks = retriever.retrieveForHint([C.CONCEPT_OPENING_BID], 1);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.chunkType === "hint_template")).toBe(true);
  });

  it("level 2 returns only rule chunks", () => {
    const chunks = retriever.retrieveForHint([C.CONCEPT_OPENING_BID], 2);
    expect(chunks.every((c) => c.chunkType === "rule")).toBe(true);
  });

  it("level 3 returns rule + example chunks", () => {
    const chunks = retriever.retrieveForHint([C.CONCEPT_OPENING_BID], 3);
    expect(chunks.every((c) => ["rule", "example"].includes(c.chunkType))).toBe(
      true,
    );
    expect(chunks.some((c) => c.chunkType === "example")).toBe(true);
  });

  it("level 4 adds explanation chunks", () => {
    const chunks = retriever.retrieveForHint([C.CONCEPT_HAND_BALANCED], 4);
    expect(
      chunks.every((c) =>
        ["rule", "example", "explanation"].includes(c.chunkType),
      ),
    ).toBe(true);
  });
});
