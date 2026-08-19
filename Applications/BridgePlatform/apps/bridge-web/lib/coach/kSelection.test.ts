// The tag binding — a curated deal's stored JSON in, the Know panel's
// collection out.
//
// The assertion that matters most is the tolerant one: a curated deal saved
// before tags existed must still open, and must not come back with an empty
// panel. Everything else is arithmetic over the registry.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_TAGS, MAX_DEAL_ITEMS, MAX_DEAL_TAGS, readKItemIds, readKTags, resolveKItems,
  tagCensus, writeKItemIds, writeKTags,
} from "./kSelection";

const json = (o: unknown) => JSON.stringify(o);

describe("reading a deal's tags", () => {
  it("reads what the deal named", () => {
    expect(readKTags(json({ kTags: ["finesses", "trump-management"] }))).toEqual([
      "finesses", "trump-management",
    ]);
  });

  it("answers nothing — never throws — for a payload it cannot read", () => {
    for (const bad of [undefined, "", "{oh no", "null", json([1, 2]), json({ kTags: "finesses" })]) {
      expect(readKTags(bad)).toEqual([]);
    }
  });

  it("ignores a tag this build has never heard of, keeping the rest", () => {
    expect(readKTags(json({ kTags: ["squeezes", "endplays"] }))).toEqual(["endplays"]);
  });

  it("caps how many lessons one deal may claim", () => {
    const many = [
      "finesses", "entries", "endplays", "signaling", "discarding",
      "preempts", "overcalls", "responding",
    ];
    expect(readKTags(json({ kTags: many }))).toHaveLength(MAX_DEAL_TAGS);
  });
});

describe("writing a deal's tags", () => {
  it("leaves every other field exactly as it was", () => {
    const before = json({
      v: 2,
      annotations: [{ at: { kind: "call", auctionIndex: 0 }, note: "hi" }],
      constraint: "locked",
      somethingNewerThanThisBuild: { keep: "me" },
    });
    const after = JSON.parse(writeKTags(before, ["finesses"]));
    expect(after.annotations).toHaveLength(1);
    expect(after.constraint).toBe("locked");
    expect(after.somethingNewerThanThisBuild).toEqual({ keep: "me" });
    expect(after.kTags).toEqual(["finesses"]);
  });

  it("removes the key rather than writing an empty list", () => {
    const withTags = writeKTags(json({ annotations: [] }), ["finesses"]);
    const cleared = JSON.parse(writeKTags(withTags, []));
    expect("kTags" in cleared).toBe(false);
    expect(cleared.annotations).toEqual([]);
  });

  it("starts a payload from nothing when there wasn't one", () => {
    expect(JSON.parse(writeKTags(undefined, ["endplays"])).kTags).toEqual(["endplays"]);
  });

  it("does not carry junk through from a broken payload", () => {
    expect(JSON.parse(writeKTags("{not json", ["endplays"]))).toEqual({ kTags: ["endplays"] });
  });

  it("round-trips", () => {
    const tags = ["opening-lead", "signaling"] as const;
    expect(readKTags(writeKTags(undefined, tags))).toEqual([...tags]);
  });

  it("drops unknown tags on the way in", () => {
    const out = JSON.parse(writeKTags(undefined, ["nope", "signaling"] as never));
    expect(out.kTags).toEqual(["signaling"]);
  });
});

describe("resolving the collection", () => {
  it("selects the deal's lesson", () => {
    const r = resolveKItems(json({ kTags: ["trump-management"] }), { phase: "play" });
    expect(r.usedDefaults).toBe(false);
    expect(r.items.map((k) => k.id)).toContain("trumps-out");
  });

  it("stands the defaults in for an untagged deal, rather than showing nothing", () => {
    const r = resolveKItems(undefined, { phase: "play" });
    expect(r.usedDefaults).toBe(true);
    expect(r.tags).toEqual(DEFAULT_TAGS);
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.map((k) => k.id)).toContain("tricks-needed");
  });

  it("shows only what can be right, by default", () => {
    const r = resolveKItems(json({ kTags: ["responding"] }), { phase: "auction" });
    for (const k of r.items) expect(["FACT", "PROOF"]).toContain(k.tier);
    expect(r.items.map((k) => k.id)).not.toContain("combined-points"); // READ
  });

  it("shows the whole declared collection when asked — the authoring view", () => {
    const r = resolveKItems(json({ kTags: ["responding"] }), {
      phase: "auction", buildableOnly: false,
    });
    expect(r.items.map((k) => k.id)).toContain("combined-points");
  });

  it("reports what a cap cut instead of dropping it silently", () => {
    const full = resolveKItems(json({ kTags: ["counting-the-hand"] }), { phase: "play" });
    const capped = resolveKItems(json({ kTags: ["counting-the-hand"] }), {
      phase: "play", limit: 2,
    });
    expect(capped.items).toHaveLength(2);
    expect(capped.dropped).toBe(full.items.length - 2);
    // and the cap keeps the teaching order's head, not a random two
    expect(capped.items.map((k) => k.id)).toEqual(full.items.slice(0, 2).map((k) => k.id));
  });

  it("drops nothing when the cap is wider than the collection", () => {
    const r = resolveKItems(json({ kTags: ["endplays"] }), { phase: "play", limit: 50 });
    expect(r.dropped).toBe(0);
  });

  it("can come back empty for a topic with no deterministic knowledge", () => {
    // entries has one item and it is JUDGMENT — honest emptiness, not a bug.
    const r = resolveKItems(json({ kTags: ["entries"] }), { phase: "play" });
    expect(r.items).toEqual([]);
    expect(r.usedDefaults).toBe(false); // the deal DID name a lesson
  });
});

describe("the census a curate UI shows before a coach commits", () => {
  it("separates what is declared from what is buildable", () => {
    expect(tagCensus("entries")).toEqual({ declared: 1, buildable: 0 });
    expect(tagCensus("safety-plays")).toEqual({ declared: 0, buildable: 0 });
  });

  it("counts a well-stocked tag", () => {
    const c = tagCensus("counting-the-hand");
    expect(c.buildable).toBeGreaterThan(5);
    expect(c.declared).toBeGreaterThanOrEqual(c.buildable);
  });
});

describe("reading and writing a deal's hand-picked cards", () => {
  it("reads what the coach chose", () => {
    expect(readKItemIds(json({ kItems: ["hcp", "still-out"] }))).toEqual(["hcp", "still-out"]);
  });

  it("answers empty for junk rather than throwing", () => {
    for (const bad of [undefined, "", "{oh no", "null", json([1, 2]), json({ kItems: "hcp" })]) {
      expect(readKItemIds(bad)).toEqual([]);
    }
  });

  it("drops a card this build has never heard of, alone", () => {
    expect(readKItemIds(json({ kItems: ["no-such-card", "hcp"] }))).toEqual(["hcp"]);
  });

  it("caps a deal that picked the whole catalogue", () => {
    const many = Array.from({ length: 20 }, () => "hcp");
    expect(readKItemIds(json({ kItems: many }))).toHaveLength(1); // duplicates collapse
    expect(readKItemIds(json({ kItems: ["hcp", "distribution", "shape", "longest-suit", "vulnerability", "total-points", "quick-tricks", "our-tricks", "their-tricks"] })))
      .toHaveLength(MAX_DEAL_ITEMS);
  });

  it("keeps every other field, and the tags beside it", () => {
    const before = writeKTags(json({ annotations: [{ note: "hi" }], pin: "West is danger" }), ["finesses"]);
    const after = JSON.parse(writeKItemIds(before, ["honour-location"]));
    expect(after.annotations).toEqual([{ note: "hi" }]);
    expect(after.pin).toBe("West is danger");
    expect(after.kTags).toEqual(["finesses"]);
    expect(after.kItems).toEqual(["honour-location"]);
  });

  it("clearing the picks REMOVES the key", () => {
    const withPicks = writeKItemIds(json({ annotations: [] }), ["hcp"]);
    expect("kItems" in JSON.parse(writeKItemIds(withPicks, []))).toBe(false);
  });

  it("round-trips", () => {
    expect(readKItemIds(writeKItemIds(undefined, ["hcp", "still-out"]))).toEqual([
      "hcp", "still-out",
    ]);
  });
});

describe("resolving a lesson the coach picked card by card", () => {
  it("leads with the picks, not the topic's whole collection", () => {
    const whole = resolveKItems(json({ kTags: ["counting-the-hand"] }), { phase: "play" });
    const picked = resolveKItems(
      json({ kTags: ["counting-the-hand"], kItems: ["points-hidden", "still-out"] }),
      { phase: "play" },
    );
    expect(whole.items.length).toBeGreaterThan(2);
    expect(picked.items.map((k) => k.id)).toEqual(["points-hidden", "still-out"]);
    expect(picked.picked).toBe(true);
    expect(picked.usedDefaults).toBe(false);
    // The topic still rides along — it is the lesson's name, not its contents.
    expect(picked.tags).toEqual(["counting-the-hand"]);
  });

  it("takes picks without a topic as a lesson in their own right", () => {
    const r = resolveKItems(json({ kItems: ["points-hidden"] }), { phase: "play" });
    expect(r.items.map((k) => k.id)).toEqual(["points-hidden"]);
    expect(r.tags).toEqual([]);
    expect(r.usedDefaults).toBe(false);
  });

  it("falls back to the topic when the coach picked no cards", () => {
    const r = resolveKItems(json({ kTags: ["trump-management"] }), { phase: "play" });
    expect(r.picked).toBe(false);
    expect(r.items.length).toBeGreaterThan(0);
  });

  it("still stands in with the defaults for a deal that named nothing", () => {
    const r = resolveKItems(json({ annotations: [] }), { phase: "play" });
    expect(r.usedDefaults).toBe(true);
    expect(r.picked).toBe(false);
    expect(r.tags).toEqual(DEFAULT_TAGS);
  });
});
