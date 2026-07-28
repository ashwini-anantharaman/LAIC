// Per-section VISUAL extraction with a stubbed model: the section is windowed,
// each window is sent as the PDF's PIXELS (a native document block) with the
// slide guidance, the dedupe context GROWS as windows land, and a malformed
// reply gets exactly one repair attempt before the section fails visibly.
// No network, no pdf-lib: the slicer and the client are injected.

import { describe, expect, it } from "vitest";
import type { ExtractionSection, ExtractorOutput } from "@bridge/kb";
import {
  LANGUAGE_REFERENCE,
  SLIDE_EXTRACTION_GUIDANCE,
  buildVisualExtractionUser,
  createVisualSectionExtractor,
  extractVisualSection,
  parseExtractorOutput,
} from "./extraction";
import type { VisionClient, VisionContentBlock, VisionRequest } from "./visualIngest";

/** A stub of the tiny VisionClient surface: replies in order, calls recorded. */
function stubClient(replies: string[]): { client: VisionClient; calls: VisionRequest[] } {
  const calls: VisionRequest[] = [];
  const client: VisionClient = {
    messages: {
      stream(params: VisionRequest) {
        calls.push(params);
        const text = replies[calls.length - 1] ?? "";
        return {
          finalMessage: async () => ({ content: [{ type: "text", text }] }),
        };
      },
    },
  };
  return { client, calls };
}

/** Stand-in for slicePdf: the "PDF" is just the window's page numbers. */
const fakeSlice = async (_bytes: Uint8Array, fromPage: number, toPage: number) =>
  new Uint8Array([fromPage, toPage]);

function reply(items: { localId: string; title: string; pages: number[] }[]): string {
  const output: ExtractorOutput = {
    items: items.map((i) => ({
      localId: i.localId,
      title: i.title,
      humanReadableText: `${i.title} explained.`,
      knowledgeType: "agreement",
      phase: "auction",
      payload: { kind: "none" },
      citedPassageOrdinals: i.pages,
    })),
    edges: [],
  };
  return `Sure — here is the JSON.\n${JSON.stringify(output)}`;
}

const CONTEXT = {
  kbId: "kb_1",
  sourceId: "src_deck",
  bytes: new Uint8Array([37, 80, 68, 70]),
  slicePages: fakeSlice,
};

function textBlocks(request: VisionRequest): string[] {
  return (request.messages[0]?.content ?? [])
    .filter((b): b is Extract<VisionContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text);
}

function documentData(request: VisionRequest): string[] {
  return (request.messages[0]?.content ?? [])
    .filter((b): b is Extract<VisionContentBlock, { type: "document" }> => b.type === "document")
    .map((b) => b.source.data);
}

describe("extractVisualSection", () => {
  it("windows the section, sends each slice as pixels, and merges the windows", async () => {
    const { client, calls } = stubClient([
      reply([{ localId: "a", title: "1NT opening", pages: [12] }]),
      reply([
        // the overlap page restates the table — the duplicate must not land twice
        { localId: "a", title: "1NT opening", pages: [17] },
        { localId: "b", title: "Stayman", pages: [18] },
      ]),
      reply([{ localId: "a", title: "Jacoby transfers", pages: [22] }]),
    ]);

    const output = await extractVisualSection({
      ...CONTEXT,
      section: { title: "Opening bids", fromPage: 12, toPage: 23 },
      existingTitles: ["Weak two bids"],
      existingSettingKeys: ["weak_two_style"],
      model: "claude-test",
      client,
    });

    // Three windows of 6 pages with a 1-page overlap → three calls.
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c.model)).toEqual(["claude-test", "claude-test", "claude-test"]);

    // The PIXELS go up: one PDF document block per call, base64 of that slice.
    expect(documentData(calls[0]!)).toEqual([
      Buffer.from(new Uint8Array([12, 17])).toString("base64"),
    ]);
    expect(documentData(calls[2]!)).toEqual([
      Buffer.from(new Uint8Array([22, 23])).toString("base64"),
    ]);

    // The system prompt is the language contract PLUS the slide guidance.
    expect(calls[0]!.system).toContain(LANGUAGE_REFERENCE.trim().slice(0, 40));
    expect(calls[0]!.system).toContain("EVERY ROW IS A CANDIDATE RULE");

    // The dedupe context starts with the KB and GROWS with what landed.
    expect(textBlocks(calls[0]!).join()).toContain("- Weak two bids");
    expect(textBlocks(calls[0]!).join()).toContain("weak_two_style");
    expect(textBlocks(calls[0]!).join()).not.toContain("1NT opening");
    expect(textBlocks(calls[1]!).join()).toContain("- 1NT opening");
    expect(textBlocks(calls[2]!).join()).toContain("- Stayman");

    // The window's own pages are named, so citations are page numbers.
    expect(textBlocks(calls[1]!).join()).toContain("17, 18, 19, 20, 21, 22");

    expect(output.items.map((i) => i.title)).toEqual([
      "1NT opening",
      "Stayman",
      "Jacoby transfers",
    ]);
    expect(output.items.map((i) => i.citedPassageOrdinals)).toEqual([[12], [18], [22]]);
    expect(output.items.map((i) => i.localId)).toEqual(["w1_a", "w2_b", "w3_a"]);
  });

  it("repairs one malformed reply, then fails the section if it stays malformed", async () => {
    const good = stubClient([
      "I could not comply.",
      reply([{ localId: "a", title: "Opening 1C", pages: [4] }]),
    ]);
    const output = await extractVisualSection({
      ...CONTEXT,
      section: { title: "Opening bids", fromPage: 4, toPage: 6 },
      client: good.client,
    });
    expect(good.calls).toHaveLength(2);
    expect(textBlocks(good.calls[1]!).join()).toContain("not parseable");
    expect(textBlocks(good.calls[1]!).join()).toContain("I could not comply.");
    // The repair still shows the slides — the model re-reads the pixels.
    expect(documentData(good.calls[1]!)).toHaveLength(1);
    expect(output.items.map((i) => i.title)).toEqual(["Opening 1C"]);

    const bad = stubClient(["nope", "still nope"]);
    await expect(
      extractVisualSection({
        ...CONTEXT,
        section: { title: "Opening bids", fromPage: 4, toPage: 6 },
        client: bad.client,
      }),
    ).rejects.toThrow(/no JSON object/);
    expect(bad.calls).toHaveLength(2);
  });

  it("skips honestly when the section covers no pages", async () => {
    const { client, calls } = stubClient([]);
    const output = await extractVisualSection({
      ...CONTEXT,
      section: { title: "Ghost", fromPage: 9, toPage: 4 },
      client,
    });
    expect(calls).toHaveLength(0);
    expect(output.items).toEqual([]);
    expect(output.skippedReason).toMatch(/covers no pages/);
  });

  it("honours an explicit window size and overlap", async () => {
    const { client, calls } = stubClient([reply([]), reply([]), reply([])]);
    await extractVisualSection({
      ...CONTEXT,
      section: { title: "Play techniques", fromPage: 1, toPage: 6 },
      windowSize: 3,
      windowOverlap: 1,
      client,
    });
    expect(calls.map((c) => documentData(c)[0])).toEqual([
      Buffer.from(new Uint8Array([1, 3])).toString("base64"),
      Buffer.from(new Uint8Array([3, 5])).toString("base64"),
      Buffer.from(new Uint8Array([5, 6])).toString("base64"),
    ]);
  });
});

describe("createVisualSectionExtractor", () => {
  const passages = [12, 13, 14].map((page) => ({
    passageId: `pp_${page}`,
    sourceId: "src_deck",
    ordinal: page,
    anchor: `page-${page}`,
    text: `Page ${page} — Slide ${page} [table]`,
  }));

  it("reads the page range off the section (a visual section IS a section)", async () => {
    const { client, calls } = stubClient([reply([{ localId: "a", title: "1NT", pages: [13] }])]);
    const extractor = createVisualSectionExtractor({ ...CONTEXT, client });
    const section: ExtractionSection = {
      anchor: "Opening bids",
      passages,
      pageRange: { fromPage: 12, toPage: 14 },
    };
    const output = await extractor(section);
    expect(documentData(calls[0]!)).toEqual([
      Buffer.from(new Uint8Array([12, 14])).toString("base64"),
    ]);
    expect(textBlocks(calls[0]!).join()).toContain('Section: "Opening bids"');
    expect(output.items).toHaveLength(1);
  });

  it("falls back to the passages' own page span, and refuses without pages", async () => {
    const { client, calls } = stubClient([reply([])]);
    const extractor = createVisualSectionExtractor({ ...CONTEXT, client });
    await extractor({ anchor: "Opening bids", passages });
    expect(documentData(calls[0]!)).toEqual([
      Buffer.from(new Uint8Array([12, 14])).toString("base64"),
    ]);
    await expect(extractor({ anchor: "Nothing", passages: [] })).rejects.toThrow(
      /no page passages/,
    );
  });
});

describe("the slide guidance and the shared JSON contract", () => {
  it("states the rules that make a slide extractable", () => {
    for (const rule of [
      "citedPassageOrdinals",
      "internalNotes",
      "EVERY ROW IS A CANDIDATE RULE",
      "ROW COLOUR IS SEMANTIC",
      "ONE RULE PER CELL",
      "combinedHcp",
      "DON'T USE THEM!",
      "NOT AUCTION RULES",
      "partner_last_bid_suit",
      "forcing_rules",
    ])
      expect(SLIDE_EXTRACTION_GUIDANCE).toContain(rule);
  });

  it("parses the extractor contract the same way for text and slides", () => {
    expect(parseExtractorOutput('prose {"items":[]} tail')).toEqual({ items: [], edges: [] });
    expect(() => parseExtractorOutput("{}")).toThrow(/missing items array/);
    expect(() => parseExtractorOutput("")).toThrow(/no JSON object/);
  });

  it("names the section, the window and the deck pages in the user message", () => {
    const user = buildVisualExtractionUser({
      section: { title: "Responses", fromPage: 24, toPage: 31 },
      windowPages: [24, 25, 26],
      dedupeContext: "KB IS EMPTY",
    });
    expect(user).toContain('Section: "Responses" — pages 24-31 of the deck.');
    expect(user).toContain("24, 25, 26");
    expect(user).toContain("KB IS EMPTY");
    expect(user).toContain("citedPassageOrdinals");
  });
});
