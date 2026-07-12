// Anthropic implementation of the LLM extraction seam (plan §20.2: LLMs
// draft knowledge content, never make table decisions). Server-side only —
// the key comes from ANTHROPIC_API_KEY in .env.local. Output is constrained
// to a strict JSON schema; the rule payload itself travels as a JSON string
// (HandConstraintExpr is recursive, which structured-output schemas can't
// express) and is validated structurally at generation time.

import Anthropic from "@anthropic-ai/sdk";
import type { LlmExtractedItem, LlmExtractionClient, SourcePassage } from "@bridge/knowledge";

const MODEL = process.env.BRIDGE_EXTRACTOR_MODEL || "claude-opus-4-8";

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          slug: { type: "string", description: "short_snake_case id, unique within the book" },
          itemType: {
            type: "string",
            enum: ["bidding_rule", "play_rule", "lead_rule", "setting_definition", "convention", "expert_decision"],
          },
          title: { type: "string" },
          humanReadableRule: {
            type: "string",
            description: "The rule stated plainly, as a coach would say it to a learner.",
          },
          structuredFieldsJson: {
            type: ["string", "null"],
            description:
              "For bidding_rule/play_rule/lead_rule: JSON string of {\"rule\": <payload>} per the schema in the prompt. null when the passage is prose without an executable rule.",
          },
          passageIds: { type: "array", items: { type: "string" } },
          flags: { type: "array", items: { type: "string" } },
        },
        required: ["slug", "itemType", "title", "humanReadableRule", "structuredFieldsJson", "passageIds", "flags"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

const SYSTEM = `You extract bridge (the card game) knowledge from book passages into a
knowledge base that configures a rule-following AI player.

For each passage, propose zero or more knowledge items:
- bidding_rule / play_rule / lead_rule: a concrete, executable rule.
- setting_definition: a configurable convention/toggle the book describes.
- convention / expert_decision: notable prose knowledge without an executable payload.

Every item MUST cite the passageIds it came from — never invent content that
is not in the passages. humanReadableRule restates the rule plainly; do not
copy long verbatim quotes.

For bidding_rule items, structuredFieldsJson is a JSON string of:
{"rule": {"ruleId": "<slug>", "title": "...", "priority": <int, lower evaluates first; openings ~5-30, responses ~10-40>,
  "settingGates": [], "auctionContext": {"role": "opening"|"response"|"any", "partnerLastBidRegex": "<optional regex like ^1[HS]$>"},
  "handConditions": <expr>, "action": <action>}}
where <expr> is {"predicate": name, "params": {...}} or {"all": [<expr>...]}/{"any": [...]}/{"not": <expr>},
using ONLY predicates from the list provided in the user message,
and <action> is one of:
  {"kind": "call", "call": "1N"} (call strings like 1C,1D,1H,1S,1N,2C..,P)
  {"kind": "pass"}
  {"kind": "openLongest", "among": "majors"|"minors"|"all", "level": 1}
  {"kind": "raisePartner", "toLevel": 2}
  {"kind": "newSuitAtLevel", "level": 1, "minLength": 4}
For play_rule/lead_rule: {"rule": {"ruleId", "title", "priority", "settingGates": [],
  "when": {"role": "lead"|"follow"|"any"}, "action": {"kind": "topOfLongestSuit"|"lowestFollowing"|"highestFollowing"|"lowestLegal"}}}.
If a rule cannot be expressed with these predicates/actions, set
structuredFieldsJson to null and add a flag explaining what is missing.
Flag every assumption or ambiguity.`;

class AnthropicExtractionClient implements LlmExtractionClient {
  private readonly client: Anthropic;
  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async extractItems(input: {
    systemFamily: string;
    passages: SourcePassage[];
    knownPredicates: readonly string[];
    extractionGoals?: readonly string[];
  }): Promise<LlmExtractedItem[]> {
    const passageBlock = input.passages
      .map((p) => `<passage id="${p.passageId}" anchor="${p.anchor}">\n${p.text}\n</passage>`)
      .join("\n\n");
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `System family: ${input.systemFamily}
${input.extractionGoals?.length ? `Extraction goals (declared intent — §12.5): focus on ${input.extractionGoals.join(", ")}; still flag conflicts/exceptions/ambiguities you notice outside these areas.\n` : ""}Available hand predicates (use ONLY these): ${input.knownPredicates.join(", ")}
Predicate params: hcpRange {min,max}; suitLengthAtLeast {suit,min}; longestAmong {among,min}; balanced {}; supportForPartner {min}.

Extract knowledge items from these passages:

${passageBlock}`,
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      throw new Error("Extraction request was refused by the model");
    }
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("No text block in extraction response");
    const parsed = JSON.parse(text.text) as { items: Array<LlmExtractedItem & { structuredFieldsJson: string | null }> };
    return parsed.items.map((i) => ({
      ...i,
      structuredFieldsJson: i.structuredFieldsJson ?? undefined,
    }));
  }
}

/** Null when ANTHROPIC_API_KEY is not provisioned — callers surface the hint. */
export function extractionClient(): LlmExtractionClient | null {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new AnthropicExtractionClient(key) : null;
}

export function extractionAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
