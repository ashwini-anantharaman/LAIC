import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

import { getSettings } from "./config";

let _client: Anthropic | null = null;

function _getClient(): Anthropic {
  if (_client !== null) return _client;
  const settings = getSettings();
  if (!settings.anthropicApiKey || settings.anthropicApiKey === "your_anthropic_api_key_here") {
    throw new Error("ANTHROPIC_API_KEY is not configured. Set it in backend-ts/.env");
  }
  _client = new Anthropic({ apiKey: settings.anthropicApiKey });
  return _client;
}

/** Single text completion (mirrors the LIAC lib/claude.ts wrapper). */
export async function callClaude(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 3000,
): Promise<string> {
  const client = _getClient();
  const settings = getSettings();
  const message = await client.messages.create({
    model: settings.claudeModel,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });
  const block = message.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Unexpected Claude response type");
  }
  return block.text;
}

/** Strip markdown fences / prose and return the JSON object substring. */
export function extractJson(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    // remove opening fence (```json or ```) and trailing fence
    const parts = t.split("```");
    t = parts.length >= 3 ? parts[1] : t.replace(/`/g, "");
    if (t.trimStart().toLowerCase().startsWith("json")) {
      t = t.trimStart().slice(4);
    }
  }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return t.slice(start, end + 1);
  }
  return t.trim();
}

/**
 * Call Claude and validate the response against a Zod schema.
 *
 * Retries once (with a corrective nudge) if the first response is not valid
 * JSON matching the schema.
 */
export async function callClaudeJson<S extends z.ZodTypeAny>(
  systemPrompt: string,
  userMessage: string,
  schema: S,
  maxTokens = 3500,
): Promise<z.output<S>> {
  let raw = await callClaude(systemPrompt, userMessage, maxTokens);
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = JSON.parse(extractJson(raw));
      const result = schema.safeParse(data);
      if (result.success) return result.data;
      lastErr = result.error;
    } catch (err) {
      lastErr = err;
    }
    if (attempt === 0) {
      raw = await callClaude(
        systemPrompt,
        userMessage +
          "\n\nYour previous response was not valid JSON matching the required shape. " +
          "Return ONLY the raw JSON object, no markdown, no commentary.",
        maxTokens,
      );
    }
  }
  throw new Error(`Claude did not return valid JSON: ${lastErr}`);
}
