import { describe, expect, it } from "vitest";
import type { KbExtractionJob, KbSource, KnowledgeItem } from "@bridge/kb";
import { scopeSources } from "./sources";

const src = (sourceId: string, kbId?: string): KbSource => ({
  sourceId,
  title: sourceId,
  sourceType: "book",
  rightsStatus: "owned",
  kbId,
  registeredBy: "u",
  createdAt: "2026-07-20T00:00:00.000Z",
});

const itemCiting = (sourceId: string) =>
  ({ sourceReferences: [{ sourceId, anchor: "a" }] }) as unknown as KnowledgeItem;
const jobFor = (sourceId: string) => ({ sourceId }) as unknown as KbExtractionJob;

describe("scopeSources", () => {
  const registry = [src("src_claude"), src("src_sayc"), src("src_new", "kb_b")];

  it("a fresh KB sees only src_claude — no other KB's booklet", () => {
    expect(scopeSources(registry, "kb_fresh", [], []).map((s) => s.sourceId)).toEqual([
      "src_claude",
    ]);
  });

  it("legacy unstamped sources surface where items or jobs reference them", () => {
    expect(
      scopeSources(registry, "kb_a", [itemCiting("src_sayc")], []).map((s) => s.sourceId),
    ).toEqual(["src_claude", "src_sayc"]);
    expect(
      scopeSources(registry, "kb_a", [], [jobFor("src_sayc")]).map((s) => s.sourceId),
    ).toEqual(["src_claude", "src_sayc"]);
  });

  it("stamped sources show in their own KB, and via citation in derived KBs", () => {
    expect(scopeSources(registry, "kb_b", [], []).map((s) => s.sourceId)).toEqual([
      "src_claude",
      "src_new",
    ]);
    expect(
      scopeSources(registry, "kb_derived", [itemCiting("src_new")], []).map((s) => s.sourceId),
    ).toEqual(["src_claude", "src_new"]);
  });
});
