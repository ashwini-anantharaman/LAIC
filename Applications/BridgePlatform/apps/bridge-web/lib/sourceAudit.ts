// The SOURCE-FIDELITY AUDITOR (2026-07-23): a batch LLM pass that reads each
// knowledge item alongside the SOURCE PASSAGES it cites and asks whether the
// compiled rules FAITHFULLY capture what the source says. An expert found
// items whose rules are shallow proxies of the source ("4+ cards in partner's
// suit" standing in for "a fit is established and slam is likely") and rules
// that misfire because the rule language cannot express the real concept. This
// module classifies each discrepancy:
//   - content_fix   — the concept CAN be expressed in the current rule
//                      language; the item just authored it poorly.
//   - inexpressible  — the source relies on a concept the language lacks
//                      (e.g. "the agreed fit suit", "combined keycards"); no
//                      re-authoring fixes it — it is a language feature request.
//   - faithful       — the rules capture the source.
//
// LLM boundary: same client/model/env as extraction (see ./extraction). The
// audit only READS; findings land in the KB's Suggestions queue for fellows to
// adjudicate. Claude never decides bids or edits knowledge here.

import Anthropic from "@anthropic-ai/sdk";
import type { Citation, ItemPayload, KnowledgeItem, SettingSpec } from "@bridge/kb";

/** Prefix every audit finding carries in the Suggestions queue, so repeated
 *  runs can skip items already flagged and the summary can group them. */
export const SOURCE_AUDIT_PREFIX = "[source audit]";

export type AuditClassification = "content_fix" | "inexpressible";
export type AuditVerdict = "faithful" | "content_fix" | "inexpressible" | "no_provenance";

/** A cited source passage, resolved to real text, ready to show the model. */
export interface AuditPassage {
  sourceTitle: string;
  anchor: string;
  text: string;
}

export interface AuditProblem {
  classification: AuditClassification;
  rationale: string;
  suggestedFix: string;
  /** The exact phrase from the source the model believes is not captured. */
  quotedSourcePhrase: string;
}

export interface AuditResult {
  verdict: AuditVerdict;
  problems: AuditProblem[];
}

/** Honest no-key behavior, mirroring extractionAvailable(). */
export function auditAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// ---------------------------------------------------------------------------
// Pure helpers (no LLM) — unit-tested directly.
// ---------------------------------------------------------------------------

/**
 * The cited SOURCE passages for an item, resolved to real text. Only external
 * sources with a resolvable passage count as provenance — `src_claude`
 * (platform-authored) is not a source to audit against, and a bare anchor with
 * no passage gives the model nothing to compare. An item with an empty result
 * has "no provenance" and is skipped.
 */
export function citedPassagesForItem(
  item: Pick<KnowledgeItem, "sourceReferences">,
  passagesBySource: Map<string, { passageId: string; anchor: string; text: string }[]>,
  sourceTitleById: Map<string, string>,
): AuditPassage[] {
  const out: AuditPassage[] = [];
  for (const ref of item.sourceReferences) {
    if (ref.sourceId === "src_claude" || !ref.passageId) continue;
    const passage = passagesBySource
      .get(ref.sourceId)
      ?.find((p) => p.passageId === ref.passageId);
    if (!passage) continue;
    out.push({
      sourceTitle: sourceTitleById.get(ref.sourceId) ?? ref.sourceId,
      anchor: ref.anchor || passage.anchor,
      text: passage.text,
    });
  }
  return out;
}

/** True if the item already carries an OPEN [source audit] flag — repeated
 *  runs walk past these so the KB gets audited resumably, one batch a click. */
export function hasOpenAuditSuggestion(
  itemId: string,
  suggestions: { itemId?: string; status: string; text: string }[],
): boolean {
  return suggestions.some(
    (s) =>
      s.status === "open" &&
      s.itemId === itemId &&
      s.text.startsWith(SOURCE_AUDIT_PREFIX),
  );
}

/** Classification a stored [source audit] suggestion carries, from its prefix
 *  tag — for the summary table's grouping. Defaults to content_fix. */
export function classificationOfSuggestion(text: string): AuditClassification {
  return text.startsWith(`${SOURCE_AUDIT_PREFIX}[inexpressible]`)
    ? "inexpressible"
    : "content_fix";
}

export interface AuditCandidate {
  item: KnowledgeItem;
  passages: AuditPassage[];
}

/**
 * The items an audit run would process, in stable itemId order: those WITH
 * provenance and WITHOUT an open [source audit] suggestion. Slicing the first
 * N of this list is what makes repeated clicks walk the whole KB.
 */
export function auditCandidates(input: {
  items: KnowledgeItem[];
  suggestions: { itemId?: string; status: string; text: string }[];
  passagesBySource: Map<string, { passageId: string; anchor: string; text: string }[]>;
  sourceTitleById: Map<string, string>;
}): AuditCandidate[] {
  return input.items
    .map((item) => ({
      item,
      passages: citedPassagesForItem(item, input.passagesBySource, input.sourceTitleById),
    }))
    .filter(
      (c) =>
        c.passages.length > 0 &&
        !hasOpenAuditSuggestion(c.item.itemId, input.suggestions),
    )
    .sort((a, b) => a.item.itemId.localeCompare(b.item.itemId));
}

/** Compact, stable serialization of what the compiler holds for this item —
 *  the model judges THIS against the source, not the JSX-rendered English. */
export function serializeItemForAudit(
  item: Pick<
    KnowledgeItem,
    "title" | "humanReadableText" | "knowledgeType" | "phase" | "payload" | "settings"
  >,
): string {
  const compact: {
    title: string;
    humanReadableText: string;
    knowledgeType: string;
    phase: string;
    payload: ItemPayload;
    settings: SettingSpec[];
  } = {
    title: item.title,
    humanReadableText: item.humanReadableText,
    knowledgeType: item.knowledgeType,
    phase: item.phase,
    payload: item.payload,
    settings: item.settings,
  };
  return JSON.stringify(compact, null, 2);
}

const AUDIT_INSTRUCTIONS = `
You are a SOURCE-FIDELITY AUDITOR for a bridge knowledge base. The block above
is the COMPLETE rule language the compiler can express — nothing outside it can
be represented in a compiled rule.

You are given ONE knowledge item (its prose + its compiled payload, serialized
as JSON) and the SOURCE PASSAGES it cites. Decide whether the compiled rules
FAITHFULLY capture what the cited source actually says.

Classify every discrepancy you find as exactly one of:
- "content_fix": the source's concept CAN be expressed in the rule language
  above, but the current rules express it poorly — a shallow proxy, the wrong
  threshold, a missing condition, an over-broad context. A fellow re-authoring
  the item IN THE SAME LANGUAGE could fix it. Example: rules test "4+ cards in
  partner's suit" where the source means "a fit is established and slam is
  likely" — length is expressible; the item just chose a crude proxy.
- "inexpressible": the source depends on a concept the language above simply
  CANNOT represent — e.g. "the agreed fit suit", "my last call was specifically
  4NT", "combined keycards between the two hands", "the suit we have both bid".
  No re-authoring in the current language captures it. This is a LANGUAGE
  FEATURE REQUEST, not an authoring error.

Return STRICT JSON (no markdown fences, no commentary) of shape:
{
  "verdict": "faithful" | "content_fix" | "inexpressible",
  "problems": [
    {
      "classification": "content_fix" | "inexpressible",
      "rationale": "<one or two sentences: what the rules capture vs what the source says>",
      "suggestedFix": "<what a fellow should change, OR which language concept is missing>",
      "quotedSourcePhrase": "<the EXACT phrase from a cited passage you believe is not captured>"
    }
  ]
}

RULES:
- Prefer "faithful" when unsure. Only flag a real, defensible discrepancy — do
  not manufacture problems, and do not nitpick teaching prose that has no
  compiled rules to be unfaithful.
- When faithful, return {"verdict":"faithful","problems":[]}.
- EVERY problem MUST quote the source phrase (quotedSourcePhrase) it concerns.
- Overall verdict: "inexpressible" if any problem is inexpressible; else
  "content_fix" if any problem is content_fix; else "faithful".
`;

export interface AuditPromptInput {
  item: Pick<
    KnowledgeItem,
    "title" | "humanReadableText" | "knowledgeType" | "phase" | "payload" | "settings"
  >;
  passages: AuditPassage[];
  languageReference: string;
}

/** Build the (system, user) prompt. Pure — unit-tested without the LLM. */
export function buildAuditPrompt(input: AuditPromptInput): {
  system: string;
  user: string;
} {
  const system = `THE RULE LANGUAGE (capability reference — the full set of concepts a compiled rule can express):\n${input.languageReference}\n${AUDIT_INSTRUCTIONS}`;
  const passagesBlock = input.passages
    .map((p, i) => `[passage ${i + 1} — ${p.sourceTitle} · ${p.anchor}]\n${p.text}`)
    .join("\n\n");
  const user = `KNOWLEDGE ITEM (compiled, JSON):\n${serializeItemForAudit(input.item)}\n\nCITED SOURCE PASSAGES:\n${passagesBlock}\n\nAudit whether the compiled rules faithfully capture the cited source. Return strict JSON.`;
  return { system, user };
}

/**
 * Parse the model's reply into a normalized AuditResult. Follows the extraction
 * JSON-slice pattern (first "{" … last "}"). The verdict is DERIVED from the
 * problems, not trusted from the model, so it is deterministic: no problems →
 * faithful; any inexpressible → inexpressible; otherwise content_fix.
 */
export function parseAuditResponse(text: string): AuditResult {
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart)
    throw new Error("source audit returned no JSON object");
  const raw = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
    problems?: unknown;
  };
  const rawProblems = Array.isArray(raw.problems) ? raw.problems : [];
  const problems: AuditProblem[] = rawProblems
    .map((p): AuditProblem | null => {
      if (typeof p !== "object" || p === null) return null;
      const o = p as Record<string, unknown>;
      const classification: AuditClassification =
        o.classification === "inexpressible" ? "inexpressible" : "content_fix";
      const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
      const rationale = str(o.rationale);
      const quotedSourcePhrase = str(o.quotedSourcePhrase);
      // A problem with neither a rationale nor a quoted phrase is empty noise.
      if (!rationale && !quotedSourcePhrase) return null;
      return {
        classification,
        rationale,
        suggestedFix: str(o.suggestedFix),
        quotedSourcePhrase,
      };
    })
    .filter((p): p is AuditProblem => p !== null);

  const verdict: AuditVerdict =
    problems.length === 0
      ? "faithful"
      : problems.some((p) => p.classification === "inexpressible")
        ? "inexpressible"
        : "content_fix";
  return { verdict, problems };
}

/** The Suggestions-queue text for one audit problem, carrying the prefixed
 *  classification tag + rationale + suggested fix + the quoted source phrase. */
export function suggestionTextForProblem(problem: AuditProblem): string {
  const parts = [`${SOURCE_AUDIT_PREFIX}[${problem.classification}]`];
  if (problem.rationale) parts.push(problem.rationale);
  if (problem.suggestedFix) parts.push(`Suggested fix: ${problem.suggestedFix}`);
  if (problem.quotedSourcePhrase)
    parts.push(`Source says: "${problem.quotedSourcePhrase}"`);
  return parts.join(" — ");
}

// ---------------------------------------------------------------------------
// The LLM call.
// ---------------------------------------------------------------------------

/**
 * Audit ONE item against its cited passages. Returns "no_provenance" (without
 * calling the model) when there is nothing to compare against. Uses the same
 * Anthropic client/model/env and JSON-parse/retry idiom as extraction.
 */
export async function auditItem(input: {
  item: KnowledgeItem;
  passages: AuditPassage[];
  languageReference: string;
}): Promise<AuditResult> {
  if (input.passages.length === 0) return { verdict: "no_provenance", problems: [] };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Source-fidelity audit needs ANTHROPIC_API_KEY");
  const client = new Anthropic({ apiKey });

  const { system, user } = buildAuditPrompt(input);
  const stream = client.messages.stream({
    model: "claude-opus-4-8",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: user }],
  });
  const message = await stream.finalMessage();
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("");
  return parseAuditResponse(text);
}

/** The Citation shape re-exported for callers assembling passage maps. */
export type { Citation };
