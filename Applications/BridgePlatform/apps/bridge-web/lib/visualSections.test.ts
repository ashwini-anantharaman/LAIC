// Section-by-section slide ingestion, deterministic half: the section map is
// REPAIRED (never trusted), windows overlap so a table crossing a page break is
// seen whole, and merging the windows of one section cannot duplicate an item —
// across windows or against the knowledge base.

import { describe, expect, it } from "vitest";
import type { ExtractedItem, ExtractorOutput } from "@bridge/kb";
import {
  DEFAULT_WINDOW_OVERLAP,
  DEFAULT_WINDOW_SIZE,
  UNSORTED_SECTION_TITLE,
  buildDedupeContext,
  buildSectionMapPrompt,
  digestPageReading,
  looksLikeAgendaPage,
  mergeVisualOutputs,
  pagesInRange,
  parseSectionMapResponse,
  readingsFromPassages,
  sectionWindows,
  validateSections,
} from "./visualSections";
import type { PageReading } from "./visualIngest";

describe("validateSections", () => {
  it("keeps a clean, complete proposal as it is", () => {
    const proposal = [
      { title: "Front matter", fromPage: 1, toPage: 3 },
      { title: "Opening bids", fromPage: 4, toPage: 9 },
      { title: "Play techniques", fromPage: 10, toPage: 12 },
    ];
    expect(validateSections(proposal, 12)).toEqual(proposal);
  });

  it("fills leading, interior and trailing gaps with visible Unsorted pages", () => {
    expect(
      validateSections(
        [
          { title: "Opening bids", fromPage: 3, toPage: 5 },
          { title: "Responses", fromPage: 8, toPage: 9 },
        ],
        12,
      ),
    ).toEqual([
      { title: UNSORTED_SECTION_TITLE, fromPage: 1, toPage: 2 },
      { title: "Opening bids", fromPage: 3, toPage: 5 },
      { title: `${UNSORTED_SECTION_TITLE} (2)`, fromPage: 6, toPage: 7 },
      { title: "Responses", fromPage: 8, toPage: 9 },
      { title: `${UNSORTED_SECTION_TITLE} (3)`, fromPage: 10, toPage: 12 },
    ]);
  });

  it("truncates overlaps and drops fully-swallowed sections", () => {
    expect(
      validateSections(
        [
          { title: "A", fromPage: 1, toPage: 6 },
          { title: "B", fromPage: 4, toPage: 8 }, // overlaps A → starts at 7
          { title: "C", fromPage: 5, toPage: 6 }, // entirely inside A → dropped
          { title: "D", fromPage: 9, toPage: 10 },
        ],
        10,
      ),
    ).toEqual([
      { title: "A", fromPage: 1, toPage: 6 },
      { title: "B", fromPage: 7, toPage: 8 },
      { title: "D", fromPage: 9, toPage: 10 },
    ]);
  });

  it("clamps out-of-range pages, un-swaps reversed bounds, sorts, and names blanks", () => {
    expect(
      validateSections(
        [
          { title: "  ", fromPage: 4, toPage: 5 },
          { title: "Late", fromPage: 9, toPage: 40 },
          { title: "Backwards", fromPage: 3, toPage: 1 },
        ],
        10,
      ),
    ).toEqual([
      { title: "Backwards", fromPage: 1, toPage: 3 },
      { title: "Untitled section", fromPage: 4, toPage: 5 },
      { title: UNSORTED_SECTION_TITLE, fromPage: 6, toPage: 8 },
      { title: "Late", fromPage: 9, toPage: 10 },
    ]);
  });

  it("drops unusable entries and still covers the deck", () => {
    expect(validateSections([{ title: "x" }, "nonsense", null, 7], 4)).toEqual([
      { title: UNSORTED_SECTION_TITLE, fromPage: 1, toPage: 4 },
    ]);
    expect(validateSections([], 3)).toEqual([
      { title: UNSORTED_SECTION_TITLE, fromPage: 1, toPage: 3 },
    ]);
    expect(validateSections(undefined, 0)).toEqual([]);
  });

  it("makes repeated titles distinct (the wizard keys rows off them)", () => {
    expect(
      validateSections(
        [
          { title: "Responses", fromPage: 1, toPage: 2 },
          { title: "responses", fromPage: 3, toPage: 4 },
        ],
        4,
      ).map((s) => s.title),
    ).toEqual(["Responses", "responses (2)"]);
  });
});

describe("sectionWindows", () => {
  it("splits a section into overlapping windows (a table over a break is seen whole)", () => {
    expect(sectionWindows({ fromPage: 12, toPage: 23 })).toEqual([
      { fromPage: 12, toPage: 17 },
      { fromPage: 17, toPage: 22 },
      { fromPage: 22, toPage: 23 },
    ]);
    expect(DEFAULT_WINDOW_SIZE).toBe(6);
    expect(DEFAULT_WINDOW_OVERLAP).toBe(1);
  });

  it("returns one window when the section fits, and never loops forever", () => {
    expect(sectionWindows({ fromPage: 4, toPage: 9 })).toEqual([{ fromPage: 4, toPage: 9 }]);
    expect(sectionWindows({ fromPage: 7, toPage: 7 })).toEqual([{ fromPage: 7, toPage: 7 }]);
    // overlap >= size would not advance: it is clamped to size - 1.
    expect(sectionWindows({ fromPage: 1, toPage: 3 }, { size: 1, overlap: 4 })).toEqual([
      { fromPage: 1, toPage: 1 },
      { fromPage: 2, toPage: 2 },
      { fromPage: 3, toPage: 3 },
    ]);
    expect(sectionWindows({ fromPage: 5, toPage: 2 })).toEqual([]);
  });

  it("honours an explicit size and overlap, and every page is covered", () => {
    const windows = sectionWindows({ fromPage: 1, toPage: 10 }, { size: 4, overlap: 2 });
    expect(windows).toEqual([
      { fromPage: 1, toPage: 4 },
      { fromPage: 3, toPage: 6 },
      { fromPage: 5, toPage: 8 },
      { fromPage: 7, toPage: 10 },
    ]);
    const covered = new Set(windows.flatMap((w) => pagesInRange(w.fromPage, w.toPage)));
    expect([...covered].sort((a, b) => a - b)).toEqual(pagesInRange(1, 10));
  });
});

describe("readingsFromPassages", () => {
  it("recovers page, kind, title and transcript from a stored page passage", () => {
    expect(
      readingsFromPassages([
        { ordinal: 12, text: "Page 12 — Responses to 1H/1S [table]\n\n| Points | Bid |" },
        { ordinal: 3, text: "no header here" },
      ]),
    ).toEqual([
      { page: 3, kind: "mixed", title: "", transcript: "no header here" },
      { page: 12, kind: "table", title: "Responses to 1H/1S", transcript: "| Points | Bid |" },
    ]);
  });
});

describe("the section-map prompt", () => {
  const readings: PageReading[] = [
    { page: 1, kind: "prose", title: "Teaching bridge", transcript: "A course in six evenings" },
    { page: 2, kind: "prose", title: "Agenda", transcript: "1. Opening bids\n2. Responses" },
    { page: 3, kind: "table", title: "Opening bids", transcript: "| Points | Bid |\n| 12-14 | 1C |" },
  ];

  it("digests every page and shows agenda slides in full", () => {
    const { system, user } = buildSectionMapPrompt({ readings, pageCount: 3 });
    expect(system).toContain("CONTIGUOUS");
    expect(user).toContain("The deck has 3 pages.");
    expect(user).toContain("p3 [table] Opening bids — | Points | Bid | / | 12-14 | 1C |");
    expect(user).toContain("AGENDA / CONTENTS SLIDES (full reading):");
    expect(user).toContain("1. Opening bids");
    expect(looksLikeAgendaPage(readings[1]!)).toBe(true);
    expect(looksLikeAgendaPage(readings[2]!)).toBe(false);
    expect(digestPageReading({ ...readings[0]!, title: "" })).toContain("(untitled slide)");
  });

  it("parses a reply and repairs it in the same step", () => {
    const reply =
      'Here you go:\n{"sections":[{"title":"Front matter","fromPage":1,"toPage":1},' +
      '{"title":"Opening bids","fromPage":3,"toPage":3}]}';
    expect(parseSectionMapResponse(reply, 3)).toEqual([
      { title: "Front matter", fromPage: 1, toPage: 1 },
      { title: UNSORTED_SECTION_TITLE, fromPage: 2, toPage: 2 },
      { title: "Opening bids", fromPage: 3, toPage: 3 },
    ]);
    expect(() => parseSectionMapResponse("no json at all", 3)).toThrow(/no JSON object/);
    expect(() => parseSectionMapResponse('{"nope":1}', 3)).toThrow(/missing sections array/);
  });
});

describe("buildDedupeContext", () => {
  it("names existing titles and setting keys, and is honest when empty", () => {
    expect(buildDedupeContext({})).toContain("EMPTY");
    const text = buildDedupeContext({
      existingTitles: ["1NT opening", "Stayman"],
      existingSettingKeys: ["nt_range", "stayman_on"],
    });
    expect(text).toContain("- 1NT opening");
    expect(text).toContain("nt_range, stayman_on");
    expect(text).toMatch(/do NOT declare them again/);
  });

  it("caps the title list without hiding the count", () => {
    const titles = Array.from({ length: 5 }, (_, i) => `Item ${i + 1}`);
    const text = buildDedupeContext({ existingTitles: titles }, 2);
    expect(text).toContain("- Item 1");
    expect(text).not.toContain("- Item 3");
    expect(text).toContain("and 3 more");
  });
});

// ---------------------------------------------------------------------------
// Merging the windows of one section
// ---------------------------------------------------------------------------

function item(localId: string, title: string, over: Partial<ExtractedItem> = {}): ExtractedItem {
  return {
    localId,
    title,
    humanReadableText: `${title} explained.`,
    knowledgeType: "agreement",
    phase: "auction",
    payload: { kind: "none" },
    citedPassageOrdinals: [12],
    ...over,
  };
}

describe("mergeVisualOutputs", () => {
  it("namespaces localIds, drops duplicate titles, and re-points their edges", () => {
    const w1: ExtractorOutput = {
      items: [item("a", "1NT opening"), item("b", "Stayman", { citedPassageOrdinals: [13] })],
      edges: [{ fromLocalId: "b", edgeType: "requires", toLocalId: "a" }],
    };
    const w2: ExtractorOutput = {
      // "Stayman" repeats across the overlap page; "Jacoby" is new and needs the
      // duplicate as its target.
      items: [item("a", "Stayman", { citedPassageOrdinals: [17] }), item("b", "Jacoby transfers")],
      edges: [{ fromLocalId: "b", edgeType: "requires", toLocalId: "a" }],
    };
    const merged = mergeVisualOutputs([
      { pages: [12, 13], output: w1 },
      { pages: [17, 18], output: w2 },
    ]);

    expect(merged.items.map((i) => i.localId)).toEqual(["w1_a", "w1_b", "w2_b"]);
    expect(merged.items.map((i) => i.title)).toEqual([
      "1NT opening",
      "Stayman",
      "Jacoby transfers",
    ]);
    expect(merged.edges).toEqual([
      { fromLocalId: "w1_b", edgeType: "requires", toLocalId: "w1_a" },
      // re-pointed at the surviving "Stayman" (window 1's "b")
      { fromLocalId: "w2_b", edgeType: "requires", toLocalId: "w1_b" },
    ]);
  });

  it("drops items the KB already has and points edges at them by title", () => {
    const merged = mergeVisualOutputs(
      [
        {
          pages: [12],
          output: {
            items: [item("a", "1NT opening"), item("b", "Stayman")],
            edges: [{ fromLocalId: "b", edgeType: "requires", toLocalId: "a" }],
          },
        },
      ],
      { existingTitles: ["1nt OPENING"] },
    );
    expect(merged.items.map((i) => i.title)).toEqual(["Stayman"]);
    expect(merged.edges).toEqual([
      { fromLocalId: "w1_b", edgeType: "requires", toExistingTitle: "1NT opening" },
    ]);
  });

  it("strips duplicate setting declarations (keys are KB-global)", () => {
    const spec = {
      key: "nt_range",
      label: "1NT range",
      control: "range_hcp" as const,
      role: "parameter" as const,
      default: { low: 15, high: 17 },
    };
    const merged = mergeVisualOutputs(
      [
        { pages: [1], output: { items: [item("a", "1NT opening", { settings: [spec] })], edges: [] } },
        { pages: [2], output: { items: [item("a", "2NT opening", { settings: [spec] })], edges: [] } },
        {
          pages: [3],
          output: { items: [item("a", "Weak twos", { settings: [{ ...spec, key: "weak_two" }] })], edges: [] },
        },
      ],
      { existingSettingKeys: ["stayman_on"] },
    );
    expect(merged.items.map((i) => i.settings?.map((s) => s.key))).toEqual([
      ["nt_range"],
      [],
      ["weak_two"],
    ]);

    const alreadyDeclared = mergeVisualOutputs(
      [{ pages: [1], output: { items: [item("a", "1NT opening", { settings: [spec] })], edges: [] } }],
      { existingSettingKeys: ["nt_range"] },
    );
    expect(alreadyDeclared.items[0]!.settings).toEqual([]);
  });

  it("clamps citations to the section's pages, falling back to the window's own", () => {
    const merged = mergeVisualOutputs(
      [
        {
          pages: [12, 13],
          output: {
            items: [
              item("a", "Cites outside", { citedPassageOrdinals: [99] }),
              item("b", "Cites some", { citedPassageOrdinals: [13, 99, 13] }),
              item("c", "Cites nothing", { citedPassageOrdinals: [] }),
            ],
            edges: [],
          },
        },
      ],
      { allowedOrdinals: [12, 13] },
    );
    expect(merged.items.map((i) => i.citedPassageOrdinals)).toEqual([[12, 13], [13], [12, 13]]);
  });

  it("keeps teaches edges, kills dangling ones, and reports skipped windows", () => {
    const merged = mergeVisualOutputs([
      {
        pages: [1, 2],
        output: {
          items: [item("a", "Finesse")],
          edges: [
            { fromLocalId: "a", edgeType: "teaches", toConceptId: "c_finesse" },
            { fromLocalId: "a", edgeType: "requires", toLocalId: "ghost" },
            { fromLocalId: "ghost", edgeType: "requires", toLocalId: "a" },
            { fromLocalId: "a", edgeType: "requires", toExistingTitle: "Finesse" },
            { fromLocalId: "a", edgeType: "teaches", toConceptId: "c_finesse" },
          ],
        },
      },
      { pages: [3], output: { items: [], edges: [], skippedReason: "title slide" } },
    ]);
    expect(merged.edges).toEqual([
      { fromLocalId: "w1_a", edgeType: "teaches", toConceptId: "c_finesse" },
    ]);
    expect(merged.skippedReason).toBe("pages 3-3: title slide");
  });
});
