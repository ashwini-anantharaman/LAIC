// The Claude section AUGMENTOR (2026-07-21): like the extractor, but it sees
// an index of the knowledge base's existing items and may propose
// MODIFICATIONS to them (matched by title) alongside new items. Runs only
// against augmentation-draft KBs; the compiler gates everything it returns.

import Anthropic from "@anthropic-ai/sdk";
import type {
  AugmentOutput,
  ExtractionSection,
  KnowledgeItem,
  SectionAugmentor,
} from "@bridge/kb";
import { LANGUAGE_REFERENCE } from "./extraction";

const AUGMENT_ADDENDUM = `
AUGMENTATION MODE — this knowledge base already has content. Besides "items"
(NEW knowledge) you may return "modifications" to EXISTING items:

"modifications": [{
  "targetTitle": string,          // EXACT title from the item index below
  "reason": string,               // one sentence: why the source changes it
  "humanReadableText"?: string,   // COMPLETE replacement (not a patch)
  "payload"?: ItemPayload,        // COMPLETE replacement (not a patch)
  "settings"?: [SettingSpec...],  // COMPLETE replacement (keep existing keys!)
  "citedPassageOrdinals": [number...]   // REQUIRED
}]

Decision rule per piece of source knowledge:
- The source REFINES or CONTRADICTS an existing item (different range, extra
  rule in the same agreement, extended continuation) → MODIFY that item.
  Return its complete new payload: start from the existing meaning as the
  item index describes it, change only what the source justifies.
- The source teaches something NO existing item covers → a NEW item.
- Already fully covered → neither (mention in skippedReason).
Prefer few, meaningful modifications over sweeping rewrites. Never change a
setting key that exists — players' saved overrides bind to those keys.
`;

/** Compact index the augmentor sees — enough to decide modify-vs-new. */
function itemIndex(items: KnowledgeItem[]): string {
  const lines = items
    .filter((i) => i.status !== "deprecated")
    .map((i) => {
      const rules =
        i.payload.kind === "auction_rules" || i.payload.kind === "play_rules"
          ? ` · ${i.payload.rules.length} rules`
          : i.payload.kind === "none"
            ? " · prose"
            : ` · ${i.payload.kind}`;
      const keys = i.settings.length
        ? ` · settings: ${i.settings.map((s) => s.key).join(",")}`
        : "";
      return `- "${i.title}" [${i.knowledgeType}/${i.phase}${rules}${keys}]: ${i.humanReadableText.slice(0, 160)}`;
    });
  return `EXISTING ITEM INDEX (${lines.length} items):\n${lines.join("\n")}`;
}

export function createClaudeAugmentor(existingItems: KnowledgeItem[]): SectionAugmentor {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Augmentation needs ANTHROPIC_API_KEY");
  const client = new Anthropic({ apiKey });
  const system = `${LANGUAGE_REFERENCE}\n${AUGMENT_ADDENDUM}\n\n${itemIndex(existingItems)}`;

  return async (section: ExtractionSection): Promise<AugmentOutput> => {
    const passagesBlock = section.passages
      .map((p) => `[passage ${p.ordinal}]\n${p.text}`)
      .join("\n\n");

    const stream = client.messages.stream({
      model: "claude-opus-4-8",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system,
      messages: [
        {
          role: "user",
          content: `Section: "${section.anchor}"\n\n${passagesBlock}\n\nAugment the knowledge base from this section as strict JSON (items + modifications + edges).`,
        },
      ],
    });
    const message = await stream.finalMessage();
    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => ("text" in b ? b.text : ""))
      .join("");
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd <= jsonStart) throw new Error("augmentor returned no JSON");
    return JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as AugmentOutput;
  };
}
