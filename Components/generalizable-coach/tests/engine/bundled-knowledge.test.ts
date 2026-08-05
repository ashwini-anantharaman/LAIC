/**
 * M1 gate — bundled knowledge retrieval (A1 + A2).
 *
 * KnowledgeSource.retrieve() returns conforming, tagged KnowledgeChunks from a
 * bundled package; the required-tag rule fills a safe default for any chunk a
 * producer shipped untagged.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { BundledKnowledgeSource } from "../../platform/knowledge-source/index";
import { validate } from "../../contracts/index";

const here = path.dirname(fileURLToPath(import.meta.url));
const bridgePkg = JSON.parse(
  readFileSync(path.join(here, "..", "..", "fixtures", "knowledge", "bridge-sample.package.json"), "utf8"),
);

const source = new BundledKnowledgeSource(bridgePkg);

describe("BundledKnowledgeSource", () => {
  it("retrieves chunks matching a concept, all conforming to the KnowledgeChunk contract", async () => {
    const chunks = await source.retrieve({ conceptIds: ["concept.opening_bid"] });
    expect(chunks.length).toBeGreaterThan(0);
    for (const c of chunks) {
      expect(c.conceptIds).toContain("concept.opening_bid");
      // score is added by retrieval and is a valid KnowledgeChunk field
      expect(validate("KnowledgeChunk", c).errors).toEqual([]);
    }
  });

  it("enforces the required-tag rule with a safe default (A1)", async () => {
    // br-untagged has no chunkType and no skillIds in the fixture.
    const chunks = await source.retrieve({ conceptIds: ["concept.hand_balanced"] });
    const untagged = chunks.find((c) => c.id === "br-untagged");
    expect(untagged).toBeTruthy();
    expect(untagged!.chunkType).toBe("explanation"); // safe default
    expect(untagged!.skillIds).toEqual([]); // filled, not undefined
    expect(validate("KnowledgeChunk", untagged).valid).toBe(true);
  });

  it("filters by chunkType for progressive disclosure", async () => {
    const rules = await source.retrieve({ conceptIds: ["concept.opening_bid"], chunkType: "rule" });
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((c) => c.chunkType === "rule")).toBe(true);

    const hints = await source.retrieve({ conceptIds: ["concept.opening_bid"], chunkType: "hint_template" });
    expect(hints.every((c) => c.chunkType === "hint_template")).toBe(true);
  });

  it("ranks by tag overlap and respects topK", async () => {
    const chunks = await source.retrieve({ conceptIds: ["concept.opening_bid"], topK: 2 });
    expect(chunks.length).toBe(2);
  });

  it("supports keyword text queries offline", async () => {
    const chunks = await source.retrieve({ text: "balanced" });
    expect(chunks.some((c) => c.content.toLowerCase().includes("balanced"))).toBe(true);
  });

  it("returns nothing for an unmatched query", async () => {
    expect(await source.retrieve({ conceptIds: ["concept.does_not_exist"] })).toEqual([]);
  });
});
