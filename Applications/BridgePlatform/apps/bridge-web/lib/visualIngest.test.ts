// Visual-ingest unit tests: the pure parts (window math, page candidates,
// price estimator, JSON parse + repair, passage ids, document text) plus real
// pdf-lib page counting/slicing on a PDF generated in-test. No network: the
// Anthropic client is injected as a stub.

import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  INGEST_MODELS,
  SOURCE_BUCKET,
  buildDocumentText,
  buildReadingPrompt,
  pageAnchor,
  pagePassageId,
  pageWindows,
  parseReadingResponse,
  pdfPageCount,
  priceEstimate,
  readingCandidates,
  readingPassageText,
  runReadingBatch,
  slicePdf,
  sourceStoragePath,
  type IngestModelId,
  type VisionClient,
  type VisionRequest,
} from "./visualIngest";

// --- fixtures --------------------------------------------------------------

/** A tiny multi-page PDF, generated so the suite carries no binary fixture. */
async function makePdf(pages: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = pdf.addPage([200, 200]);
    page.drawText(`page ${i + 1}`, { x: 10, y: 180, size: 12 });
  }
  return pdf.save();
}

/** A stub client that replies with the given texts, one per call, in order. */
function stubClient(replies: string[]): VisionClient & { calls: VisionRequest[] } {
  const calls: VisionRequest[] = [];
  return {
    calls,
    messages: {
      stream(params: VisionRequest) {
        calls.push(params);
        const text = replies[calls.length - 1] ?? "";
        return {
          async finalMessage() {
            return { content: [{ type: "text", text }] };
          },
        };
      },
    },
  };
}

// --- window math -----------------------------------------------------------

describe("pageWindows", () => {
  it("splits an exact multiple into equal windows", () => {
    expect(pageWindows(1, 16, 8)).toEqual([
      { from: 1, to: 8 },
      { from: 9, to: 16 },
    ]);
  });

  it("leaves a ragged final window", () => {
    expect(pageWindows(1, 10, 4)).toEqual([
      { from: 1, to: 4 },
      { from: 5, to: 8 },
      { from: 9, to: 10 },
    ]);
  });

  it("handles a single page and an offset start", () => {
    expect(pageWindows(7, 7, 8)).toEqual([{ from: 7, to: 7 }]);
    expect(pageWindows(24, 31, 6)).toEqual([
      { from: 24, to: 29 },
      { from: 30, to: 31 },
    ]);
  });

  it("returns nothing for an empty range and rejects a bad size", () => {
    expect(pageWindows(5, 4, 8)).toEqual([]);
    expect(() => pageWindows(1, 8, 0)).toThrow(/size/);
  });
});

// --- reading candidates ----------------------------------------------------

describe("readingCandidates", () => {
  it("returns every page when nothing has been read", () => {
    expect(readingCandidates(4, [])).toEqual([1, 2, 3, 4]);
  });

  it("skips pages that already have a passage", () => {
    expect(readingCandidates(5, [{ ordinal: 1 }, { ordinal: 3 }])).toEqual([2, 4, 5]);
  });

  it("returns nothing when the whole deck is read", () => {
    const done = [1, 2, 3].map((ordinal) => ({ ordinal }));
    expect(readingCandidates(3, done)).toEqual([]);
  });
});

// --- price estimator -------------------------------------------------------

describe("priceEstimate", () => {
  it("reproduces the plan's per-run bands at the reference 88 pages", () => {
    expect(priceEstimate("max", 88)).toEqual({ lowUsd: 8, highUsd: 18 });
    expect(priceEstimate("balanced", 88)).toEqual({ lowUsd: 5, highUsd: 12 });
    expect(priceEstimate("budget", 88)).toEqual({ lowUsd: 3, highUsd: 8 });
  });

  it("is monotone in page count and ordered max > balanced > budget", () => {
    const ids: IngestModelId[] = ["max", "balanced", "budget"];
    for (const id of ids) {
      const small = priceEstimate(id, 10);
      const big = priceEstimate(id, 40);
      expect(big.lowUsd).toBeGreaterThan(small.lowUsd);
      expect(big.highUsd).toBeGreaterThan(small.highUsd);
      expect(big.highUsd).toBeGreaterThan(big.lowUsd);
    }
    expect(priceEstimate("max", 88).lowUsd).toBeGreaterThan(priceEstimate("balanced", 88).lowUsd);
    expect(priceEstimate("balanced", 88).lowUsd).toBeGreaterThan(priceEstimate("budget", 88).lowUsd);
  });

  it("is zero for an empty deck and throws on an unknown option", () => {
    expect(priceEstimate("budget", 0)).toEqual({ lowUsd: 0, highUsd: 0 });
    expect(() => priceEstimate("cheap" as IngestModelId, 10)).toThrow(/Unknown ingest model/);
  });

  it("names the real model ids for all three options", () => {
    expect(INGEST_MODELS.map((m) => m.id)).toEqual(["max", "balanced", "budget"]);
    expect(INGEST_MODELS.map((m) => [m.readingModel, m.extractionModel])).toEqual([
      ["claude-opus-4-8", "claude-opus-4-8"],
      ["claude-haiku-4-5", "claude-opus-4-8"],
      ["claude-sonnet-4-6", "claude-sonnet-4-6"],
    ]);
    for (const option of INGEST_MODELS) {
      expect(option.estimate(88)).toEqual(priceEstimate(option.id, 88));
    }
  });
});

// --- pdf counting / slicing ------------------------------------------------

describe("pdfPageCount + slicePdf", () => {
  it("counts the pages of a generated PDF", async () => {
    expect(await pdfPageCount(await makePdf(5))).toBe(5);
  });

  it("slices an inclusive 1-indexed window", async () => {
    const bytes = await makePdf(9);
    expect(await pdfPageCount(await slicePdf(bytes, 3, 6))).toBe(4);
    expect(await pdfPageCount(await slicePdf(bytes, 1, 9))).toBe(9);
    expect(await pdfPageCount(await slicePdf(bytes, 4, 4))).toBe(1);
  });

  it("clamps past the end and rejects an empty slice", async () => {
    const bytes = await makePdf(3);
    expect(await pdfPageCount(await slicePdf(bytes, 2, 99))).toBe(2);
    await expect(slicePdf(bytes, 10, 12)).rejects.toThrow(/no pages/);
  });
});

// --- reading JSON parse ----------------------------------------------------

const GOOD_JSON = JSON.stringify({
  pages: [
    {
      page: 2,
      kind: "table",
      title: "1NT responses",
      transcript: "| Points | Bid |\n|---|---|\n| 8-9 | 2NT |\n\nOrange rows are forcing.",
    },
    { page: 1, kind: "prose", title: "Agenda", transcript: "Opening bids, responses." },
  ],
});

describe("parseReadingResponse", () => {
  it("parses pages out of a fenced/chatty reply and defaults an odd kind", () => {
    const readings = parseReadingResponse(
      "Sure! Here you go:\n```json\n" +
        JSON.stringify({ pages: [{ page: 3, kind: "weird", title: " T ", transcript: " x " }] }) +
        "\n```\nHope that helps.",
    );
    expect(readings).toEqual([{ page: 3, kind: "mixed", title: "T", transcript: "x" }]);
  });

  it("drops junk entries and keeps the good ones", () => {
    const readings = parseReadingResponse(
      JSON.stringify({
        pages: [null, { page: 0 }, { page: "x" }, { page: 4, kind: "diagram", title: "Finesse", transcript: "K J x opposite A x x" }],
      }),
    );
    expect(readings).toHaveLength(1);
    expect(readings[0]!.page).toBe(4);
  });

  it("throws with no JSON object and with no pages array", () => {
    expect(() => parseReadingResponse("nothing here")).toThrow(/no JSON object/);
    expect(() => parseReadingResponse('{"items":[]}')).toThrow(/missing pages array/);
  });
});

// --- passage shape ---------------------------------------------------------

describe("passage ids, anchors and text", () => {
  it("is deterministic per (source, page) and disjoint across sources", () => {
    expect(pagePassageId("src_a", 12)).toBe(pagePassageId("src_a", 12));
    expect(pagePassageId("src_a", 12)).not.toBe(pagePassageId("src_b", 12));
    expect(pagePassageId("src_a", 12)).not.toBe(pagePassageId("src_a", 13));
    expect(pagePassageId("src_a", 12)).toMatch(/^pp_12_[0-9a-f]{8}$/);
    expect(pageAnchor(12)).toBe("page-12");
  });

  it("puts a title line above the transcript", () => {
    expect(
      readingPassageText({ page: 7, kind: "table", title: "Weak two bids", transcript: "| a |" }),
    ).toBe("Page 7 — Weak two bids [table]\n\n| a |");
    expect(readingPassageText({ page: 8, kind: "prose", title: "", transcript: "" })).toBe(
      "Page 8 — (untitled slide) [prose]",
    );
  });
});

describe("buildDocumentText", () => {
  it("concatenates the readings in page order regardless of input order", () => {
    expect(
      buildDocumentText([
        { ordinal: 3, text: "third" },
        { ordinal: 1, text: "first" },
        { ordinal: 2, text: " second " },
      ]),
    ).toBe("first\n\nsecond\n\nthird");
  });

  it("is empty for a document with no readings yet", () => {
    expect(buildDocumentText([])).toBe("");
  });
});

// --- the batched reading pass (stubbed client) -----------------------------

describe("runReadingBatch", () => {
  it("returns store-ready passages for the requested pages", async () => {
    const bytes = await makePdf(4);
    const client = stubClient([GOOD_JSON]);
    const passages = await runReadingBatch({
      sourceId: "src_deck",
      bytes,
      pages: [1, 2],
      model: "claude-haiku-4-5",
      client,
    });

    expect(passages.map((p) => p.ordinal)).toEqual([1, 2]);
    expect(passages.map((p) => p.anchor)).toEqual(["page-1", "page-2"]);
    expect(passages.map((p) => p.passageId)).toEqual([
      pagePassageId("src_deck", 1),
      pagePassageId("src_deck", 2),
    ]);
    expect(passages.every((p) => p.sourceId === "src_deck")).toBe(true);
    expect(passages[1]!.text).toContain("Orange rows are forcing.");

    // One request, carrying the model, the PDF slice and the page list.
    expect(client.calls).toHaveLength(1);
    const call = client.calls[0]!;
    expect(call.model).toBe("claude-haiku-4-5");
    const blocks = call.messages[0]!.content;
    expect(blocks[0]!.type).toBe("document");
    expect(blocks[1]).toEqual({ type: "text", text: buildReadingPrompt([1, 2]).user });
  });

  it("repairs a malformed first reply with a second request", async () => {
    const client = stubClient(["I could not do that, sorry.", GOOD_JSON]);
    const passages = await runReadingBatch({
      sourceId: "src_deck",
      bytes: await makePdf(2),
      pages: [1, 2],
      model: "claude-opus-4-8",
      client,
    });
    expect(passages.map((p) => p.ordinal)).toEqual([1, 2]);
    expect(client.calls).toHaveLength(2);
    // The repair prompt re-sends the slice plus the malformed reply.
    const repairBlocks = client.calls[1]!.messages[0]!.content;
    expect(repairBlocks).toHaveLength(3);
    const last = repairBlocks[2]!;
    expect(last.type === "text" && last.text).toContain("I could not do that, sorry.");
  });

  it("throws when the repair also fails, leaving the window a candidate", async () => {
    const client = stubClient(["nope", "still nope"]);
    await expect(
      runReadingBatch({
        sourceId: "src_deck",
        bytes: await makePdf(2),
        pages: [1],
        model: "claude-opus-4-8",
        client,
      }),
    ).rejects.toThrow(/no JSON object/);
    expect(client.calls).toHaveLength(2);
  });

  it("ignores pages the model volunteered outside the window", async () => {
    const client = stubClient([GOOD_JSON]);
    const passages = await runReadingBatch({
      sourceId: "src_deck",
      bytes: await makePdf(4),
      pages: [1],
      model: "claude-opus-4-8",
      client,
    });
    expect(passages.map((p) => p.ordinal)).toEqual([1]);
  });

  it("does nothing (and calls nothing) for an empty page list", async () => {
    const client = stubClient([GOOD_JSON]);
    const passages = await runReadingBatch({
      sourceId: "src_deck",
      bytes: await makePdf(1),
      pages: [],
      model: "claude-opus-4-8",
      client,
    });
    expect(passages).toEqual([]);
    expect(client.calls).toHaveLength(0);
  });
});

// --- storage naming (pure part; the bucket calls need Supabase) ------------

describe("source storage paths", () => {
  it("scopes by source and sanitizes the file name", () => {
    expect(SOURCE_BUCKET).toBe("kb-source-files");
    expect(sourceStoragePath("src_deck", "teaching-bridge-slides2.pptx.pdf")).toBe(
      "src_deck/teaching-bridge-slides2.pptx.pdf",
    );
    expect(sourceStoragePath("src_deck", "my deck (final)/../x.pdf")).toBe(
      "src_deck/my_deck_final_.._x.pdf",
    );
  });
});
