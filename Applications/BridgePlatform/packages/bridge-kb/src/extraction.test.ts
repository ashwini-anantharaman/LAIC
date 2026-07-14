// Stage C acceptance: deterministic chunking, and the one-shot contract —
// valid structured items land (draft, cited, auto-confirmed edges), invalid
// ones fail VISIBLY in the job report and never half-land.

import { describe, expect, it } from "vitest";
import { materializeExtraction, runExtraction, type ExtractorOutput } from "./extraction";
import type { ExtractionSection } from "./extraction";
import { chunkDocument, looksLikeHeading } from "./passages";
import { KbService } from "./service";
import { InMemoryKbStore } from "./store";

const NOW = "2026-07-14T13:00:00.000Z";

const SAMPLE_DOC = `NOTRUMP OPENINGS

An opening bid of 1NT shows a balanced hand with 15 to 17 high-card points.

With a balanced 20 to 21 you open 2NT instead.

RESPONSES TO 1NT

A response of 2C is the Stayman convention, asking opener to bid a four-card major. Responder needs at least 8 points and a four-card major.`;

describe("chunkDocument", () => {
  it("is deterministic and heading-sectioned", () => {
    const a = chunkDocument(SAMPLE_DOC);
    const b = chunkDocument(SAMPLE_DOC);
    expect(a).toEqual(b);
    expect(a.sections.map((s) => s.anchor)).toEqual(["NOTRUMP OPENINGS", "RESPONSES TO 1NT"]);
    expect(a.passages).toHaveLength(5); // 2 headings + 3 paragraphs
    // Headings are citable passages inside their own sections.
    expect(a.sections[0]!.passageOrdinals).toEqual([0, 1, 2]);
    expect(a.sections[1]!.passageOrdinals).toEqual([3, 4]);
  });

  it("recognizes heading styles", () => {
    expect(looksLikeHeading("NOTRUMP OPENINGS")).toBe(true);
    expect(looksLikeHeading("## Responses")).toBe(true);
    expect(looksLikeHeading("2.1 Major suit openings")).toBe(true);
    expect(looksLikeHeading("This is a normal sentence, with punctuation.")).toBe(false);
  });
});

function sectionOf(doc: string, index: number, sourceId = "src_test"): ExtractionSection {
  const { passages, sections } = chunkDocument(doc);
  const section = sections[index]!;
  return {
    anchor: section.anchor,
    passages: section.passageOrdinals.map((o) => ({ ...passages[o]!, sourceId })),
  };
}

const GOOD_OUTPUT: ExtractorOutput = {
  items: [
    {
      localId: "nt1",
      title: "1NT opening",
      humanReadableText: "Open 1NT with a balanced 15–17 HCP.",
      knowledgeType: "agreement",
      phase: "auction",
      settings: [
        {
          key: "nt_range",
          label: "1NT range",
          control: "range_hcp",
          role: "parameter",
          default: { low: 15, high: 17 },
        },
      ],
      payload: {
        kind: "auction_rules",
        rules: [
          {
            key: "open",
            label: "Open 1NT",
            context: { role: "opening" },
            conditions: {
              all: [
                { balanced: true },
                {
                  hcp: {
                    min: { $setting: "nt_range", field: "low" },
                    max: { $setting: "nt_range", field: "high" },
                  },
                },
              ],
            },
            action: { type: "bid", level: 1, strain: "N" },
            priority: 10,
          },
        ],
      },
      citedPassageOrdinals: [1],
    },
    {
      localId: "stayman",
      title: "Stayman",
      humanReadableText: "2♣ over 1NT asks for a four-card major (8+ points).",
      knowledgeType: "convention",
      phase: "auction",
      payload: {
        kind: "auction_rules",
        rules: [
          {
            key: "ask",
            label: "Stayman ask",
            context: {
              role: "responder",
              opening: { kind: "bid", levelMin: 1, levelMax: 1, strains: ["N"] },
            },
            conditions: { hcp: { min: 8 } },
            action: { type: "bid", level: 2, strain: "C" },
            priority: 5,
          },
        ],
      },
      citedPassageOrdinals: [1],
    },
  ],
  edges: [{ fromLocalId: "stayman", edgeType: "requires", toLocalId: "nt1" }],
};

describe("materializeExtraction", () => {
  const section = sectionOf(SAMPLE_DOC, 0);

  it("lands valid items as drafts with real citations and resolved edges", () => {
    const result = materializeExtraction(GOOD_OUTPUT, section, {
      sourceId: "src_test",
      requestedBy: "u_fellow",
      now: NOW,
      existingItems: [],
    });
    expect(result.items).toHaveLength(2);
    expect(result.failures).toHaveLength(0);
    const stayman = result.items.find((i) => i.title === "Stayman")!;
    expect(stayman.status).toBe("draft");
    expect(stayman.sourceReferences[0]!.passageId).toBeTruthy();
    expect(result.edges).toEqual([
      expect.objectContaining({
        edgeType: "requires",
        fromItemId: stayman.itemId,
        origin: "extracted",
        confirmed: true,
      }),
    ]);
  });

  it("drops uncited or uncompilable items into the failure report", () => {
    const bad: ExtractorOutput = {
      items: [
        { ...GOOD_OUTPUT.items[0]!, localId: "uncited", title: "Uncited", citedPassageOrdinals: [] },
        {
          ...GOOD_OUTPUT.items[0]!,
          localId: "badref",
          title: "Bad setting ref",
          settings: [],
          payload: {
            kind: "auction_rules",
            rules: [
              {
                key: "open",
                label: "Bad",
                context: { role: "opening" },
                conditions: { hcp: { min: { $setting: "nonexistent" } } },
                action: { type: "bid", level: 1, strain: "N" },
                priority: 1,
              },
            ],
          },
        },
        GOOD_OUTPUT.items[1]!,
      ],
      edges: [],
    };
    const result = materializeExtraction(bad, section, {
      sourceId: "src_test",
      requestedBy: "u_fellow",
      now: NOW,
      existingItems: [],
    });
    expect(result.items.map((i) => i.title)).toEqual(["Stayman"]);
    expect(result.failures.map((f) => f.anchor)).toEqual([
      expect.stringContaining("Uncited"),
      expect.stringContaining("Bad setting ref"),
    ]);
  });
});

describe("runExtraction", () => {
  it("processes sections into jobs; failures are visible; KB recompiles", async () => {
    const store = new InMemoryKbStore();
    const service = new KbService(store, { now: () => NOW });
    const kb = await service.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });

    const sections = [sectionOf(SAMPLE_DOC, 0), sectionOf(SAMPLE_DOC, 1)];
    const extractor = async (section: ExtractionSection): Promise<ExtractorOutput> => {
      if (section.anchor === "RESPONSES TO 1NT") throw new Error("model went sideways");
      return GOOD_OUTPUT;
    };

    const jobs = await runExtraction(store, service, extractor, {
      kbId: kb.kbId,
      sourceId: "src_test",
      requestedBy: "u_fellow",
      sections,
      now: () => NOW,
    });

    expect(jobs.map((j) => j.status)).toEqual(["completed", "failed"]);
    expect(jobs[0]!.createdItemIds).toHaveLength(2);
    expect(jobs[1]!.failures[0]!.reason).toMatch(/sideways/);

    const items = await store.listItemsForKb(kb.kbId);
    expect(items).toHaveLength(2);
    const compiled = await service.liveCompile(kb.kbId);
    expect(compiled?.auctionRules.length).toBe(2);
    expect(compiled?.requires).toHaveLength(1);
  });
});
