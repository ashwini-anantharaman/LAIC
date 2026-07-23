import { describe, expect, it } from "vitest";
import type { KnowledgeItem } from "@bridge/kb";
import {
  auditCandidates,
  buildAuditPrompt,
  citedPassagesForItem,
  classificationOfSuggestion,
  hasOpenAuditSuggestion,
  parseAuditResponse,
  serializeItemForAudit,
  SOURCE_AUDIT_PREFIX,
  suggestionTextForProblem,
  type AuditProblem,
} from "./sourceAudit";

// ---- fixtures --------------------------------------------------------------

const item = (
  itemId: string,
  refs: { sourceId: string; passageId?: string; anchor?: string }[],
): KnowledgeItem =>
  ({
    itemId,
    title: `Item ${itemId}`,
    humanReadableText: "Raise partner with support.",
    knowledgeType: "bidding_rule",
    phase: "auction",
    payload: { kind: "auction_rules", rules: [] },
    settings: [],
    sourceReferences: refs.map((r) => ({ anchor: "a", ...r })),
    supportedLevels: [],
    status: "draft",
    version: 1,
    createdBy: "u",
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
  }) as unknown as KnowledgeItem;

const passagesBySource = new Map([
  [
    "src_sayc",
    [
      { passageId: "pp_1", anchor: "Raises", text: "Raise to game when a fit is established and slam is likely." },
    ],
  ],
]);
const titles = new Map([["src_sayc", "SAYC Booklet"]]);

const sug = (over: Partial<{ itemId: string; status: string; text: string }>) => ({
  itemId: over.itemId,
  status: over.status ?? "open",
  text: over.text ?? "",
});

// ---- citedPassagesForItem --------------------------------------------------

describe("citedPassagesForItem", () => {
  it("resolves an external cited passage to real text with its source title", () => {
    const out = citedPassagesForItem(
      item("i1", [{ sourceId: "src_sayc", passageId: "pp_1", anchor: "Raises" }]),
      passagesBySource,
      titles,
    );
    expect(out).toEqual([
      {
        sourceTitle: "SAYC Booklet",
        anchor: "Raises",
        text: "Raise to game when a fit is established and slam is likely.",
      },
    ]);
  });

  it("ignores src_claude, bare-anchor (no passageId), and unresolvable citations", () => {
    expect(
      citedPassagesForItem(
        item("i2", [
          { sourceId: "src_claude", passageId: "pp_1" },
          { sourceId: "src_sayc", anchor: "no passage id here" },
          { sourceId: "src_sayc", passageId: "pp_missing" },
        ]),
        passagesBySource,
        titles,
      ),
    ).toEqual([]);
  });
});

// ---- suggestion helpers ----------------------------------------------------

describe("audit suggestion helpers", () => {
  it("detects an existing open [source audit] flag for an item", () => {
    const suggestions = [
      sug({ itemId: "i1", text: `${SOURCE_AUDIT_PREFIX}[content_fix] shallow proxy` }),
      sug({ itemId: "i2", text: "unrelated flag from the table" }),
      sug({ itemId: "i3", status: "resolved", text: `${SOURCE_AUDIT_PREFIX}[inexpressible] x` }),
    ];
    expect(hasOpenAuditSuggestion("i1", suggestions)).toBe(true);
    expect(hasOpenAuditSuggestion("i2", suggestions)).toBe(false);
    // resolved ones don't block a re-audit
    expect(hasOpenAuditSuggestion("i3", suggestions)).toBe(false);
  });

  it("reads the classification tag out of a stored suggestion", () => {
    expect(classificationOfSuggestion(`${SOURCE_AUDIT_PREFIX}[inexpressible] x`)).toBe(
      "inexpressible",
    );
    expect(classificationOfSuggestion(`${SOURCE_AUDIT_PREFIX}[content_fix] y`)).toBe(
      "content_fix",
    );
    expect(classificationOfSuggestion("[source audit] untagged")).toBe("content_fix");
  });

  it("formats a suggestion carrying prefix + rationale + fix + quote", () => {
    const problem: AuditProblem = {
      classification: "inexpressible",
      rationale: "Rules test 4+ cards, not an established fit.",
      suggestedFix: "Needs an 'agreed fit suit' concept.",
      quotedSourcePhrase: "a fit is established and slam is likely",
    };
    expect(suggestionTextForProblem(problem)).toBe(
      `${SOURCE_AUDIT_PREFIX}[inexpressible] — Rules test 4+ cards, not an established fit.` +
        ` — Suggested fix: Needs an 'agreed fit suit' concept.` +
        ` — Source says: "a fit is established and slam is likely"`,
    );
  });
});

// ---- auditCandidates -------------------------------------------------------

describe("auditCandidates", () => {
  it("keeps provenance items without an open flag, sorted by itemId", () => {
    const items = [
      item("i_c", [{ sourceId: "src_sayc", passageId: "pp_1" }]), // ok
      item("i_a", [{ sourceId: "src_sayc", passageId: "pp_1" }]), // ok, sorts first
      item("i_b", [{ sourceId: "src_claude", passageId: "pp_1" }]), // no provenance
      item("i_d", [{ sourceId: "src_sayc", passageId: "pp_1" }]), // already flagged
    ];
    const suggestions = [
      sug({ itemId: "i_d", text: `${SOURCE_AUDIT_PREFIX}[content_fix] flagged` }),
    ];
    const out = auditCandidates({ items, suggestions, passagesBySource, sourceTitleById: titles });
    expect(out.map((c) => c.item.itemId)).toEqual(["i_a", "i_c"]);
    expect(out[0]!.passages).toHaveLength(1);
  });
});

// ---- serializeItemForAudit + buildAuditPrompt ------------------------------

describe("buildAuditPrompt", () => {
  it("serializes the compiled fields the model judges", () => {
    const json = serializeItemForAudit(item("i1", []));
    const parsed = JSON.parse(json);
    expect(parsed).toMatchObject({
      title: "Item i1",
      knowledgeType: "bidding_rule",
      phase: "auction",
      payload: { kind: "auction_rules", rules: [] },
    });
    // internal-only fields never reach the model
    expect(json).not.toContain("createdBy");
    expect(json).not.toContain("itemId");
  });

  it("puts the language reference in the system prompt and the passages in the user prompt", () => {
    const { system, user } = buildAuditPrompt({
      item: item("i1", []),
      passages: [{ sourceTitle: "SAYC Booklet", anchor: "Raises", text: "Raise to game." }],
      languageReference: "LANG-REF-SENTINEL",
    });
    expect(system).toContain("LANG-REF-SENTINEL");
    expect(system).toContain("content_fix");
    expect(system).toContain("inexpressible");
    expect(user).toContain("Raise to game.");
    expect(user).toContain("SAYC Booklet");
    expect(user).toContain("Item i1");
  });
});

// ---- parseAuditResponse ----------------------------------------------------

describe("parseAuditResponse", () => {
  it("faithful with no problems", () => {
    expect(parseAuditResponse('{"verdict":"faithful","problems":[]}')).toEqual({
      verdict: "faithful",
      problems: [],
    });
  });

  it("slices JSON out of surrounding prose / fences", () => {
    const text =
      'Here is the audit:\n```json\n{"verdict":"content_fix","problems":' +
      '[{"classification":"content_fix","rationale":"proxy","suggestedFix":"fix it","quotedSourcePhrase":"fit is established"}]}\n```\nDone.';
    const out = parseAuditResponse(text);
    expect(out.verdict).toBe("content_fix");
    expect(out.problems).toHaveLength(1);
    expect(out.problems[0]!.quotedSourcePhrase).toBe("fit is established");
  });

  it("derives inexpressible verdict when any problem is inexpressible", () => {
    const out = parseAuditResponse(
      JSON.stringify({
        verdict: "content_fix", // model's guess is ignored; derived from problems
        problems: [
          { classification: "content_fix", rationale: "a", quotedSourcePhrase: "x" },
          { classification: "inexpressible", rationale: "b", quotedSourcePhrase: "y" },
        ],
      }),
    );
    expect(out.verdict).toBe("inexpressible");
    expect(out.problems).toHaveLength(2);
  });

  it("drops empty problems and falls back to faithful when nothing survives", () => {
    const out = parseAuditResponse(
      JSON.stringify({
        verdict: "content_fix",
        problems: [{ classification: "content_fix", rationale: "", quotedSourcePhrase: "" }],
      }),
    );
    expect(out).toEqual({ verdict: "faithful", problems: [] });
  });

  it("throws when there is no JSON object", () => {
    expect(() => parseAuditResponse("no json here")).toThrow();
  });
});
