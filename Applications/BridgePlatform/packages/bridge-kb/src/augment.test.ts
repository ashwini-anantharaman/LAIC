import { beforeEach, describe, expect, it } from "vitest";
import { runAugmentation, type AugmentOutput } from "./augment";
import type { ExtractionSection } from "./extraction";
import type { KbSourcePassage, KnowledgeItem } from "./model";
import { KbService } from "./service";
import { InMemoryKbStore, type KbStore } from "./store";

function clock() {
  let t = Date.parse("2026-07-21T00:00:00.000Z");
  return () => new Date((t += 1000)).toISOString();
}

const item = (title: string, hcpMin: number): Omit<KnowledgeItem, "itemId" | "version" | "createdAt" | "updatedAt"> => ({
  title,
  humanReadableText: `${title} original text`,
  knowledgeType: "agreement",
  phase: "auction",
  payload: {
    kind: "auction_rules",
    rules: [
      {
        key: "r0",
        label: title,
        context: { role: "opening" },
        conditions: { hcp: { min: hcpMin } },
        action: { type: "bid", level: 1, strain: "N" },
        priority: 10,
      },
    ],
  },
  settings: [],
  sourceReferences: [{ sourceId: "src_claude", anchor: "test" }],
  supportedLevels: [],
  status: "draft",
  createdBy: "u",
});

const passages: KbSourcePassage[] = [
  { passageId: "pp_a", sourceId: "src_book", ordinal: 0, anchor: "NT ranges", text: "…" },
];
const SECTION: ExtractionSection = { anchor: "NT ranges", passages };

let store: KbStore;
let svc: KbService;
let kbId: string;
let targetId: string;

beforeEach(async () => {
  store = new InMemoryKbStore();
  svc = new KbService(store, { now: clock() });
  const kb = await svc.createKb({ name: "Draft", systemLabel: "SAYC", createdBy: "u" });
  kbId = kb.kbId;
  const created = await svc.createItem(kbId, item("1NT opening", 15));
  targetId = created.itemId;
  // Stamp the augmentation ledger the way startAugmentation does.
  await store.putKb({
    ...(await svc.getKb(kbId)),
    augmentation: {
      baseKbId: "kb_base",
      baseKbName: "Base",
      sourceId: "src_book",
      status: "review",
      newItemIds: [],
      modified: [],
      startedAt: "2026-07-21T00:00:00.000Z",
    },
  });
});

const augmentorReturning = (out: AugmentOutput) => async () => out;

describe("runAugmentation", () => {
  it("modifies an existing item by title (versioned before/after) and adds new items", async () => {
    const jobs = await runAugmentation(
      store,
      svc,
      augmentorReturning({
        items: [
          {
            localId: "n1",
            title: "2NT rebid range",
            humanReadableText: "Rebid 2NT with 18–19.",
            knowledgeType: "agreement",
            phase: "auction",
            payload: { kind: "none" },
            citedPassageOrdinals: [0],
          },
        ],
        edges: [],
        modifications: [
          {
            targetTitle: "1nt opening", // case-insensitive match
            reason: "source widens the range",
            humanReadableText: "1NT opening updated text",
            citedPassageOrdinals: [0],
          },
        ],
      }),
      { kbId, sourceId: "src_book", requestedBy: "u", sections: [SECTION] },
    );

    expect(jobs[0]!.status).toBe("completed");
    expect(jobs[0]!.createdItemIds).toHaveLength(1);
    expect(jobs[0]!.modifiedItemIds).toEqual([targetId]);

    const modified = (await store.getItem(targetId))!;
    expect(modified.humanReadableText).toBe("1NT opening updated text");
    expect(modified.version).toBe(2);
    // Provenance: source passage joined the citations.
    expect(modified.sourceReferences.some((r) => r.passageId === "pp_a")).toBe(true);
    // Before/after both committed.
    const versions = await store.listItemVersions(targetId);
    expect(versions.map((v) => v.changeNote)).toEqual([
      expect.stringContaining("Augmented from source"),
      "Pre-augmentation snapshot",
    ]);
    // Ledger updated on the draft KB record.
    const kb = await svc.getKb(kbId);
    expect(kb.augmentation!.modified).toEqual([
      { itemId: targetId, reason: "source widens the range" },
    ]);
    expect(kb.augmentation!.newItemIds).toHaveLength(1);
  });

  it("compile-gates a broken modification and reports unknown targets", async () => {
    const jobs = await runAugmentation(
      store,
      svc,
      augmentorReturning({
        items: [],
        edges: [],
        modifications: [
          {
            targetTitle: "1NT opening",
            reason: "bad ref",
            payload: {
              kind: "auction_rules",
              rules: [
                {
                  key: "r0",
                  label: "broken",
                  context: { role: "opening" },
                  conditions: { hcp: { min: { $setting: "does_not_exist" } } },
                  action: { type: "bid", level: 1, strain: "N" },
                  priority: 10,
                },
              ],
            },
            citedPassageOrdinals: [0],
          },
          {
            targetTitle: "No Such Item",
            reason: "…",
            humanReadableText: "x",
            citedPassageOrdinals: [0],
          },
        ],
      }),
      { kbId, sourceId: "src_book", requestedBy: "u", sections: [SECTION] },
    );

    const job = jobs[0]!;
    expect(job.status).toBe("completed");
    expect(job.modifiedItemIds).toEqual([]);
    expect(job.failures.map((f) => f.reason).join(" | ")).toMatch(/unknown setting/);
    expect(job.failures.some((f) => f.reason.includes("not found"))).toBe(true);
    // Target untouched.
    const target = (await store.getItem(targetId))!;
    expect(target.version).toBe(1);
    expect(target.humanReadableText).toBe("1NT opening original text");
  });
});
