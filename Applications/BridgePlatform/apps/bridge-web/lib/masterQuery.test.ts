// The Master query module reproduces the items list's filter + sort. These
// tests pin the behaviors the item page relies on for prev/next review nav:
// search over rule labels, the exact filters, deprecated exclusion, and sort.

import type { KnowledgeItem } from "@bridge/kb";
import { describe, expect, it } from "vitest";
import {
  applyMasterQuery,
  matchesWhen,
  parseMasterQuery,
  ruleCount,
  searchText,
} from "./masterQuery";

type Payload = KnowledgeItem["payload"];

function mkItem(o: Partial<KnowledgeItem> = {}): KnowledgeItem {
  return {
    itemId: "ki_1",
    title: "Item",
    humanReadableText: "some teaching text",
    knowledgeType: "convention",
    phase: "auction",
    payload: { kind: "none" },
    settings: [],
    sourceReferences: [],
    supportedLevels: [],
    status: "approved",
    version: 1,
    createdBy: "u",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...o,
  };
}

/** An auction_rules item carrying one rule with the given role + label. */
function auctionItem(role: string, label: string, o: Partial<KnowledgeItem> = {}) {
  const payload = {
    kind: "auction_rules",
    rules: [{ key: "r1", label, context: { role }, conditions: {}, action: {}, priority: 1 }],
  } as unknown as Payload;
  return mkItem({ payload, ...o });
}

describe("searchText", () => {
  it("includes rule labels so a rule term matches the item", () => {
    const item = auctionItem("responder", "Stayman 2♣ ask");
    const text = searchText(item);
    expect(text).toContain("stayman 2♣ ask");
    // The kind's display label is searchable too.
    expect(text).toContain("convention");
  });

  it("includes lead-rule style/versus labels", () => {
    const payload = {
      kind: "lead_rules",
      leads: [{ versus: "notrump", style: "fourth_best" }],
    } as unknown as Payload;
    const item = mkItem({ knowledgeType: "lead_agreement", payload });
    expect(searchText(item)).toContain("fourth best vs notrump");
  });

  it("includes title, description and tags", () => {
    const item = mkItem({ title: "Jacoby Transfers", humanReadableText: "hearts", tags: ["nt"] });
    const text = searchText(item);
    expect(text).toContain("jacoby transfers");
    expect(text).toContain("hearts");
    expect(text).toContain("nt");
  });
});

describe("ruleCount", () => {
  it("counts auction rules and treats prose as zero", () => {
    expect(ruleCount(auctionItem("opening", "Open 1NT"))).toBe(1);
    expect(ruleCount(mkItem({ payload: { kind: "none" } }))).toBe(0);
  });
});

describe("matchesWhen", () => {
  it("maps roles to auction stages", () => {
    expect(matchesWhen(auctionItem("opening", "x"), "opening")).toBe(true);
    expect(matchesWhen(auctionItem("opening", "x"), "responding")).toBe(false);
    expect(matchesWhen(auctionItem("responder", "x"), "responding")).toBe(true);
    expect(matchesWhen(auctionItem("opener", "x"), "rebidding")).toBe(true);
    expect(matchesWhen(auctionItem("overcaller", "x"), "competing")).toBe(true);
    expect(matchesWhen(auctionItem("advancer", "x"), "competing")).toBe(true);
  });

  it("'any' role matches every stage", () => {
    const any = auctionItem("any", "x");
    for (const when of ["opening", "responding", "rebidding", "competing"]) {
      expect(matchesWhen(any, when)).toBe(true);
    }
  });

  it("items with no auction roles never match a specific stage", () => {
    const prose = mkItem({ payload: { kind: "none" } });
    expect(matchesWhen(prose, "opening")).toBe(false);
  });
});

describe("parseMasterQuery", () => {
  it("reads keys from URLSearchParams and skips empty strings", () => {
    const q = parseMasterQuery(new URLSearchParams("q=stayman&type=convention&status="));
    expect(q).toEqual({ q: "stayman", type: "convention" });
  });

  it("reads keys from a plain record", () => {
    expect(parseMasterQuery({ tag: "nt", when: "opening" })).toEqual({
      tag: "nt",
      when: "opening",
    });
  });
});

describe("applyMasterQuery", () => {
  const alpha = mkItem({ itemId: "a", title: "Alpha", knowledgeType: "convention", phase: "auction", tags: ["core"], updatedAt: "2026-01-01T00:00:00Z" });
  const beta = mkItem({ itemId: "b", title: "Beta", knowledgeType: "bidding_rule", phase: "defense", updatedAt: "2026-03-01T00:00:00Z" });
  const gamma = auctionItem("opening", "Open 1NT", { itemId: "c", title: "Gamma", knowledgeType: "agreement", updatedAt: "2026-02-01T00:00:00Z" });
  const dep = mkItem({ itemId: "d", title: "Deprecated one", status: "deprecated" });
  const all = [beta, alpha, gamma, dep];

  it("excludes deprecated items by default", () => {
    const ids = applyMasterQuery(all, {}).map((i) => i.itemId);
    expect(ids).not.toContain("d");
    expect(ids).toContain("a");
  });

  it("includes deprecated only when explicitly asked for", () => {
    const ids = applyMasterQuery(all, { status: "deprecated" }).map((i) => i.itemId);
    expect(ids).toEqual(["d"]);
  });

  it("sorts by title A–Z by default", () => {
    expect(applyMasterQuery(all, {}).map((i) => i.title)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("sorts by updatedAt descending for sort=updated", () => {
    expect(applyMasterQuery(all, { sort: "updated" }).map((i) => i.itemId)).toEqual(["b", "c", "a"]);
  });

  it("sorts by rule count descending for sort=rules", () => {
    // gamma has 1 rule; the others have 0 (title tie-break: Alpha before Beta).
    expect(applyMasterQuery(all, { sort: "rules" }).map((i) => i.itemId)).toEqual(["c", "a", "b"]);
  });

  it("filters by type, phase and tag", () => {
    expect(applyMasterQuery(all, { type: "convention" }).map((i) => i.itemId)).toEqual(["a"]);
    expect(applyMasterQuery(all, { phase: "defense" }).map((i) => i.itemId)).toEqual(["b"]);
    expect(applyMasterQuery(all, { tag: "core" }).map((i) => i.itemId)).toEqual(["a"]);
  });

  it("filters by search term over rule labels", () => {
    expect(applyMasterQuery(all, { q: "1nt" }).map((i) => i.itemId)).toEqual(["c"]);
  });

  it("filters by the when facet role logic", () => {
    expect(applyMasterQuery(all, { when: "opening" }).map((i) => i.itemId)).toEqual(["c"]);
  });
});
