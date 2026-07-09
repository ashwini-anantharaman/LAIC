/**
 * M3 gate — interaction memory recall (C2).
 *
 * recall() returns the coach's own prior interactions (distinct in shape from
 * KnowledgeSource chunks), filtered by learner, keyword, and recency.
 */
import { describe, it, expect } from "vitest";
import { InMemoryInteractionMemory } from "../../platform/memory/index.js";

function seed(): InMemoryInteractionMemory {
  const m = new InMemoryInteractionMemory();
  m.record({ learnerId: "L1", domainId: "d", timestamp: "2026-07-01T00:00:00.000Z", role: "learner", text: "What is an opening bid?" });
  m.record({ learnerId: "L1", domainId: "d", timestamp: "2026-07-02T00:00:00.000Z", role: "coach", text: "Open 1NT with 15-17 balanced.", kind: "answer" });
  m.record({ learnerId: "L2", domainId: "d", timestamp: "2026-07-02T00:00:00.000Z", role: "learner", text: "How do finesses work?" });
  return m;
}

describe("interaction memory", () => {
  it("recalls a learner's own interactions, most recent first", () => {
    const hits = seed().recall({ learnerId: "L1" });
    expect(hits).toHaveLength(2);
    expect(hits[0].timestamp).toBe("2026-07-02T00:00:00.000Z"); // recency order
    // Shape is an interaction record (role/text), NOT a knowledge chunk.
    expect(hits[0]).toHaveProperty("role");
    expect(hits[0]).toHaveProperty("text");
    expect(hits[0]).not.toHaveProperty("chunkType");
  });

  it("isolates by learner", () => {
    const hits = seed().recall({ learnerId: "L2" });
    expect(hits).toHaveLength(1);
    expect(hits[0].text).toMatch(/finesse/);
  });

  it("filters by keyword and topK", () => {
    const hits = seed().recall({ learnerId: "L1", text: "opening", topK: 1 });
    expect(hits).toHaveLength(1);
    expect(hits[0].text).toMatch(/opening bid/);
  });

  it("filters by recency window with an injected clock", () => {
    const now = Date.parse("2026-07-05T00:00:00.000Z");
    const m = new InMemoryInteractionMemory(() => now);
    m.record({ learnerId: "L1", domainId: "d", timestamp: "2026-06-01T00:00:00.000Z", role: "learner", text: "old" });
    m.record({ learnerId: "L1", domainId: "d", timestamp: "2026-07-04T00:00:00.000Z", role: "learner", text: "recent" });
    const hits = m.recall({ learnerId: "L1", sinceDays: 7 });
    expect(hits.map((h) => h.text)).toEqual(["recent"]);
  });
});
