// B2F3 classifier unit tests.
//
// Two layers:
//  1. SYNTHETIC units — hand-built KnowledgeItems exercise every branch of the
//     classifier deterministically, immune to curated-content churn.
//  2. INTEGRATION — the REAL curated SAYC template is installed and classified,
//     asserting coverage invariants and the owner's three acceptance anchors
//     by CONCEPT (title-contains) rather than exact wording, since the slam /
//     2♣ / rebid chapters are actively being rebuilt in parallel.

import { beforeAll, describe, expect, it } from "vitest";
import {
  InMemoryKbStore,
  KbService,
  type AuctionRuleSpec,
  type ItemPayload,
  type KnowledgeItem,
  type KnowledgePhase,
  type KnowledgeType,
} from "@bridge/kb";
import { installSaycTemplate } from "@bridge/sayc-template/install";
import {
  B2F3_COLLECTIONS,
  classifyB2f3Level,
  draftB2f3Collections,
  isB2f3Collection,
  type B2f3Level,
} from "./b2f3";

// ---------------------------------------------------------------------------
// A minimal KnowledgeItem factory for the synthetic units.
// ---------------------------------------------------------------------------

let seq = 0;
function makeItem(
  title: string,
  opts: {
    knowledgeType?: KnowledgeType;
    phase?: KnowledgePhase;
    payload?: ItemPayload;
  } = {},
): KnowledgeItem {
  const now = "2026-07-24T00:00:00.000Z";
  return {
    itemId: `ki_test_${seq++}`,
    title,
    humanReadableText: title,
    knowledgeType: opts.knowledgeType ?? "agreement",
    phase: opts.phase ?? "auction",
    payload: opts.payload ?? { kind: "none" },
    settings: [],
    sourceReferences: [],
    supportedLevels: [],
    status: "draft",
    version: 1,
    createdBy: "u_test",
    createdAt: now,
    updatedAt: now,
  };
}

const auctionRule = (over: Partial<AuctionRuleSpec>): AuctionRuleSpec => ({
  key: "r",
  label: "r",
  context: { role: "any" },
  conditions: { all: [] },
  action: { type: "pass" },
  priority: 10,
  ...over,
});

const auctionPayload = (...rules: AuctionRuleSpec[]): ItemPayload => ({
  kind: "auction_rules",
  rules,
});

describe("classifyB2f3Level — synthetic units (one per branch)", () => {
  it("scoring phase is out of the curriculum", () => {
    expect(classifyB2f3Level(makeItem("Matchpoints", { phase: "scoring" })).level).toBe(
      "out_of_scope",
    );
  });

  it("card-play, lead and defense are beginner fundamentals", () => {
    for (const phase of ["opening_lead", "declarer_play", "defense"] as KnowledgePhase[]) {
      expect(classifyB2f3Level(makeItem("Some technique", { phase })).level).toBe("beginner");
    }
  });

  it("the engine floor and the forcing framework are beginner infrastructure", () => {
    expect(
      classifyB2f3Level(
        makeItem("Fallback", {
          knowledgeType: "fallback_rule",
          payload: { kind: "fallback", fallback: { phase: "auction", behavior: "pass" } },
        }),
      ).level,
    ).toBe("beginner");
    expect(
      classifyB2f3Level(
        makeItem("Forcing situations", {
          payload: { kind: "forcing_rules", rules: [] },
        }),
      ).level,
    ).toBe("beginner");
  });

  it("natural openings/responses/rebids with no keyword are beginner", () => {
    for (const t of ["1NT opening", "Raises of a major opening", "Opener's rebids"]) {
      expect(classifyB2f3Level(makeItem(t)).level).toBe("beginner");
    }
  });

  it("a title naming basic competition or Stayman is advanced beginner", () => {
    for (const t of ["Simple overcalls", "Takeout doubles", "Negative doubles", "Stayman", "Balancing"]) {
      expect(classifyB2f3Level(makeItem(t)).level).toBe("advanced_beginner");
    }
  });

  it("a title naming a convention or advanced competition is intermediate", () => {
    for (const t of [
      "Jacoby transfers",
      "Gerber over notrump",
      "Blackwood",
      "Roman Keycard Blackwood",
      "Michaels cue-bid",
      "Unusual 2NT",
      "Reverses by opener",
      "Strong artificial 2♣ opening",
    ]) {
      expect(classifyB2f3Level(makeItem(t)).level).toBe("intermediate");
    }
  });

  it("a rule that declares a slam ask is intermediate even with a plain title", () => {
    const item = makeItem("Four notrump", {
      payload: auctionPayload(
        auctionRule({ ask: { id: "blackwood", responses: {} } }),
      ),
    });
    expect(classifyB2f3Level(item).level).toBe("intermediate");
  });

  it("a rule bid from the overcaller/advancer seat is at least advanced beginner", () => {
    const item = makeItem("Bidding over their opening", {
      payload: auctionPayload(auctionRule({ context: { role: "overcaller" } })),
    });
    expect(classifyB2f3Level(item).level).toBe("advanced_beginner");
  });

  it("a non-opening convention with no keyword defaults to advanced beginner", () => {
    const item = makeItem("Some 1NT gadget", {
      knowledgeType: "convention",
      payload: auctionPayload(auctionRule({ context: { role: "responder" } })),
    });
    expect(classifyB2f3Level(item).level).toBe("advanced_beginner");
  });

  it("a preemptive OPENING authored as a convention stays beginner (day-one opening)", () => {
    const item = makeItem("Weak two-bids", {
      knowledgeType: "convention",
      payload: auctionPayload(auctionRule({ context: { role: "opening" } })),
    });
    expect(classifyB2f3Level(item).level).toBe("beginner");
  });

  it("every assignment carries a non-empty rationale ending in a period", () => {
    const c = classifyB2f3Level(makeItem("Stayman"));
    expect(c.rationale.trim().length).toBeGreaterThan(0);
    expect(c.rationale.endsWith(".")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration over the real curated SAYC KB.
// ---------------------------------------------------------------------------

let items: KnowledgeItem[];

beforeAll(async () => {
  const store = new InMemoryKbStore();
  const service = new KbService(store);
  const result = await installSaycTemplate(store, service, { createdBy: "u_test" });
  expect(result.compileError).toBeNull();
  items = await store.listItemsForKb(result.kbId);
});

const findByTitleIncludes = (needle: string): KnowledgeItem => {
  const n = needle.toLowerCase();
  const hit = items.find((i) => i.title.toLowerCase().includes(n));
  if (!hit) throw new Error(`no seeded item whose title contains "${needle}"`);
  return hit;
};

describe("owner's acceptance anchors (by concept, over the live SAYC KB)", () => {
  it("the 1NT opening is beginner", () => {
    const item = items.find((i) => i.title.toLowerCase() === "1nt opening")!;
    expect(item, "SAYC should seed a '1NT opening' item").toBeTruthy();
    expect(classifyB2f3Level(item).level).toBe("beginner");
  });

  it("Stayman is advanced beginner", () => {
    expect(classifyB2f3Level(findByTitleIncludes("stayman")).level).toBe("advanced_beginner");
  });

  it("Blackwood is intermediate", () => {
    expect(classifyB2f3Level(findByTitleIncludes("blackwood")).level).toBe("intermediate");
  });
});

describe("coverage invariants over the live SAYC KB", () => {
  it("assigns a valid level and a rationale to every item, deterministically", () => {
    const levels: B2f3Level[] = ["beginner", "advanced_beginner", "intermediate", "out_of_scope"];
    for (const i of items) {
      const c = classifyB2f3Level(i);
      expect(levels).toContain(c.level);
      expect(c.rationale.trim().length).toBeGreaterThan(0);
      expect(classifyB2f3Level(i)).toEqual(c); // stable
    }
  });

  it("every play/lead/defense item lands in beginner", () => {
    const play = items.filter(
      (i) => i.phase === "opening_lead" || i.phase === "declarer_play" || i.phase === "defense",
    );
    expect(play.length).toBeGreaterThan(0);
    for (const i of play) expect(classifyB2f3Level(i).level).toBe("beginner");
  });
});

describe("draftB2f3Collections — roster assembly over the seeded SAYC KB", () => {
  it("partitions every item exactly once across the three rungs (+ out of scope)", () => {
    const draft = draftB2f3Collections(items);
    const total =
      draft.buckets.reduce((n, b) => n + b.itemIds.length, 0) + draft.outOfScopeItemIds.length;
    expect(total).toBe(items.length);
    const seen = new Set<string>();
    for (const b of draft.buckets) for (const id of b.itemIds) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it("the ladder is ordered beginner → advanced beginner → intermediate, each with content", () => {
    const draft = draftB2f3Collections(items);
    const [beg, adv, int] = draft.buckets;
    expect(beg!.def.level).toBe("beginner");
    expect(adv!.def.level).toBe("advanced_beginner");
    expect(int!.def.level).toBe("intermediate");
    expect(adv!.def.extendsLevel).toBe("beginner");
    expect(int!.def.extendsLevel).toBe("advanced_beginner");
    for (const b of draft.buckets) expect(b.itemIds.length).toBeGreaterThan(0);
  });

  it("SAYC seeds no out-of-scope (scoring) items", () => {
    expect(draftB2f3Collections(items).outOfScopeItemIds).toHaveLength(0);
  });

  it("prints the draft membership counts (for the build report)", () => {
    const draft = draftB2f3Collections(items);
    const counts = Object.fromEntries(draft.buckets.map((b) => [b.def.name, b.itemIds.length]));
    // eslint-disable-next-line no-console
    console.log("B2F3 draft counts:", { total: items.length, ...counts });
    expect(counts["B2F3 Beginner"]).toBeGreaterThan(counts["B2F3 Advanced Beginner"]!);
  });
});

describe("isB2f3Collection", () => {
  it("recognizes the three collection names and nothing else", () => {
    for (const c of B2F3_COLLECTIONS) expect(isB2f3Collection(c.name)).toBe(true);
    expect(isB2f3Collection("Full SAYC")).toBe(false);
    expect(isB2f3Collection("Core natural bidding")).toBe(false);
  });
});
