// The K item library. Three classes of assertion, and the first is the one
// that earns its keep:
//
//   · the CENSUS — the counts the owner approved on 2026-08-18. A future edit
//     that adds, drops, or re-tiers an item fails here and has to say so out
//     loud, which is the whole point of declaring a catalogue;
//   · the INVARIANTS — unique ids, every item tag declared, no orphan tags;
//   · the SELECTION — that tags resolve to collections in teaching order,
//     once each, filtered honestly.

import { describe, expect, it } from "vitest";

import {
  isBuildable, isKItemId, isKTag, itemsName, kItem, kItemsForIds, kItemsForTag,
  kItemsForTags, parseKItemIds, parseKTags, K_ITEMS, K_TAGS,
} from "./kItems";
import type { KTag, KTier } from "./kItems";

const tally = (tier: KTier) => K_ITEMS.filter((k) => k.tier === tier).length;

describe("the census the owner approved", () => {
  it("declares 26 tags and 49 K items", () => {
    expect(K_TAGS).toHaveLength(26);
    expect(K_ITEMS).toHaveLength(49);
  });

  it("splits into 16 FACT, 13 PROOF, 14 READ, 6 JUDGMENT", () => {
    expect({
      FACT: tally("FACT"), PROOF: tally("PROOF"),
      READ: tally("READ"), JUDGMENT: tally("JUDGMENT"),
    }).toEqual({ FACT: 16, PROOF: 13, READ: 14, JUDGMENT: 6 });
  });

  it("leaves 29 buildable in the deterministic layer today", () => {
    expect(K_ITEMS.filter(isBuildable)).toHaveLength(29);
  });

  it("counts buildable as FACT and PROOF, and nothing else", () => {
    for (const k of K_ITEMS) {
      expect(isBuildable(k)).toBe(k.tier === "FACT" || k.tier === "PROOF");
    }
  });
});

describe("invariants", () => {
  it("gives every item a unique id", () => {
    expect(new Set(K_ITEMS.map((k) => k.id)).size).toBe(K_ITEMS.length);
  });

  it("gives every tag a unique name", () => {
    expect(new Set(K_TAGS.map((t) => t.tag)).size).toBe(K_TAGS.length);
  });

  it("only tags items with declared tags", () => {
    for (const k of K_ITEMS) for (const t of k.tags) expect(isKTag(t)).toBe(true);
  });

  it("never tags an item twice with the same tag", () => {
    for (const k of K_ITEMS) expect(new Set(k.tags).size).toBe(k.tags.length);
  });

  it("gives every item at least one tag and one phase", () => {
    for (const k of K_ITEMS) {
      expect(k.tags.length).toBeGreaterThan(0);
      expect(k.phases.length).toBeGreaterThan(0);
    }
  });

  it("keeps an item's tags inside the phases that tag lives in", () => {
    // A play-only item filed under an auction-only tag would never show.
    for (const k of K_ITEMS) {
      for (const t of k.tags) {
        const tag = K_TAGS.find((x) => x.tag === t)!;
        const shared = tag.phases.some((p) => (k.phases as readonly string[]).includes(p));
        expect(`${k.id} in ${t}: ${shared}`).toBe(`${k.id} in ${t}: true`);
      }
    }
  });

  it("writes a why and a when for every item", () => {
    for (const k of K_ITEMS) {
      expect(k.why.length).toBeGreaterThan(10);
      expect(k.when.length).toBeGreaterThan(5);
    }
  });

  it("looks items up by id, and rejects what it has never heard of", () => {
    expect(isKItemId("hcp")).toBe(true);
    expect(isKItemId("best-lead")).toBe(false); // advice is not knowledge
    expect(kItem("tricks-needed").tier).toBe("PROOF");
  });
});

describe("tag coverage", () => {
  const empties = K_TAGS.filter((t) => kItemsForTag(t.tag).length === 0).map((t) => t.tag);

  it("leaves exactly one tag deliberately empty — safety-plays", () => {
    // Its knowledge is advice-shaped ("play the ace first in case…"), and
    // advice belongs to the hints surface, never the Know panel. The tag
    // exists so a curated deal can name the topic. If this list grows, the
    // catalogue gained an orphan tag and someone has to decide about it.
    expect(empties).toEqual(["safety-plays"]);
  });

  it("names the six tags with NO deterministic knowledge at all", () => {
    // These topics can name a curated deal today but cannot fill its Know
    // panel — every item they carry is READ or JUDGMENT. Three of them are
    // core teaching situations, and that is the honest measure of what the
    // knowledge base is holding up:
    //
    //   opener-rebid / responder-rebid  every card is a system meaning
    //   signaling                       both cards are partnership agreements
    //   entries / holdup-play           the one item each is JUDGMENT
    //   safety-plays                    no items at all, by decision
    //
    // A tag LEAVING this list is good news and should be noticed.
    const thin = K_TAGS
      .filter((t) => kItemsForTag(t.tag, { buildableOnly: true }).length === 0)
      .map((t) => t.tag);
    expect(thin.sort()).toEqual([
      "entries", "holdup-play", "opener-rebid", "responder-rebid",
      "safety-plays", "signaling",
    ]);
  });
});

describe("selecting a collection", () => {
  it("returns a tag's items in registry order, not caller order", () => {
    const forward = kItemsForTags(["counting-the-hand", "trump-management"]).map((k) => k.id);
    const reversed = kItemsForTags(["trump-management", "counting-the-hand"]).map((k) => k.id);
    expect(forward).toEqual(reversed);
    // and registry order means hcp (declared first) precedes trumps-out
    expect(forward.indexOf("hcp")).toBeLessThan(forward.indexOf("trumps-out"));
  });

  it("yields an item once however many chosen tags it carries", () => {
    // hcp carries both of these.
    const ids = kItemsForTags(["hand-evaluation", "counting-the-hand"]).map((k) => k.id);
    expect(ids.filter((id) => id === "hcp")).toHaveLength(1);
  });

  it("filters to a phase", () => {
    const auction = kItemsForTag("counting-the-hand", { phase: "auction" }).map((k) => k.id);
    expect(auction).toContain("points-out-there");
    expect(auction).not.toContain("points-hidden"); // play only
  });

  it("filters to what a producer can emit today", () => {
    const all = kItemsForTag("responding").map((k) => k.id);
    const now = kItemsForTag("responding", { buildableOnly: true }).map((k) => k.id);
    expect(all).toContain("partner-shown-points"); // READ — declared, waiting on the KB
    expect(now).not.toContain("partner-shown-points");
    expect(now).toContain("partner-ceiling"); // PROOF — the certain bound, buildable now
  });

  it("finds nothing for a tag nobody has filled", () => {
    expect(kItemsForTag("safety-plays")).toEqual([]);
  });

  it("keeps the deliberate overlaps as separate items", () => {
    // Documented in the catalogue's appendix: different slots, different tiers.
    expect(isKItemId("trumps-out") && isKItemId("still-out")).toBe(true);
    expect(kItem("partner-ceiling").tier).toBe("PROOF");
    expect(kItem("partner-shown-points").tier).toBe("READ");
  });

  it("carries one id across both phases where it is one idea", () => {
    // hcp absorbed looking.ts's "HCP" / "HCP dealt" split.
    expect(kItem("hcp").phases).toEqual(["auction", "play"]);
    expect(K_ITEMS.filter((k) => k.title === "HCP")).toHaveLength(1);
  });
});

describe("reading tags from storage", () => {
  it("keeps the known ones, in order, once each", () => {
    expect(parseKTags(["finesses", "finesses", "opening-lead"])).toEqual([
      "finesses", "opening-lead",
    ]);
  });

  it("drops what it has never heard of, ALONE", () => {
    expect(parseKTags(["squeezes", "finesses"])).toEqual(["finesses"]);
  });

  it("answers nothing for junk rather than throwing", () => {
    for (const junk of [undefined, null, "finesses", 7, {}, [1, true, null]]) {
      expect(parseKTags(junk)).toEqual([]);
    }
  });

  it("accepts every declared tag", () => {
    const all = K_TAGS.map((t) => t.tag) as KTag[];
    expect(parseKTags(all)).toHaveLength(all.length);
  });
});

describe("reading hand-picked cards from storage", () => {
  it("keeps the known ones, in order, once each", () => {
    expect(parseKItemIds(["still-out", "still-out", "hcp"])).toEqual(["still-out", "hcp"]);
  });

  it("drops what it has never heard of, ALONE", () => {
    expect(parseKItemIds(["no-such-card", "hcp"])).toEqual(["hcp"]);
  });

  it("answers nothing for junk rather than throwing", () => {
    for (const junk of [undefined, null, "hcp", 7, {}, [1, true, null]]) {
      expect(parseKItemIds(junk)).toEqual([]);
    }
  });

  it("accepts every declared item", () => {
    const all = K_ITEMS.map((k) => k.id);
    expect(parseKItemIds(all)).toHaveLength(all.length);
  });
});

describe("a hand-picked collection", () => {
  it("answers in registry order, whatever order the coach picked", () => {
    const forward = kItemsForIds(["hcp", "still-out"]).map((k) => k.id);
    const reversed = kItemsForIds(["still-out", "hcp"]).map((k) => k.id);
    expect(forward).toEqual(reversed);
    // hcp is declared first, so it is taught first.
    expect(forward[0]).toBe("hcp");
  });

  it("filters for the phase and for what a producer can make", () => {
    const picks = ["hcp", "total-points", "honour-location"] as const;
    // total-points is auction-only; honour-location is JUDGMENT.
    expect(kItemsForIds(picks, { phase: "play", buildableOnly: true }).map((k) => k.id))
      .toEqual(["hcp"]);
    expect(kItemsForIds(picks, { phase: "auction", buildableOnly: true }).map((k) => k.id))
      .toEqual(["hcp", "total-points"]);
    // Unfiltered, a JUDGMENT pick is still a declared card — the authoring UI
    // wants the whole catalogue, the panel does not.
    expect(kItemsForIds(picks).map((k) => k.id)).toContain("honour-location");
  });

  it("ignores an id it has never heard of", () => {
    expect(kItemsForIds(["no-such-card", "hcp"] as never).map((k) => k.id)).toEqual(["hcp"]);
  });
});

describe("naming a lesson made of cards", () => {
  it("joins two with and, and counts the rest", () => {
    expect(itemsName(["hcp"])).toBe("HCP");
    expect(itemsName(["hcp", "shape"])).toBe("HCP and Shape");
    expect(itemsName(["hcp", "shape", "distribution"])).toBe("HCP, Distribution and 1 more");
  });

  it("is empty for nothing, and for junk", () => {
    expect(itemsName([])).toBe("");
    expect(itemsName(["no-such-card"] as never)).toBe("");
  });
});
