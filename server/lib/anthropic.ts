import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";

export const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

const JSON_TOOL_NAME = "emit_structured_json";

/** Strip trailing commas and other common LLM JSON mistakes. */
function repairJSON(text: string): string {
  return text
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2018|\u2019/g, "'");
}

/** Extract the first balanced JSON object or array from text. */
function extractJSONString(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const startObj = candidate.indexOf("{");
  const startArr = candidate.indexOf("[");
  const start =
    startObj === -1 ? startArr : startArr === -1 ? startObj : Math.min(startObj, startArr);
  if (start === -1) throw new Error("Claude did not return JSON");

  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    if (ch === close) {
      depth--;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }

  throw new Error("Claude returned incomplete JSON (response may have been truncated)");
}

function parseJSONText<T>(text: string): T {
  const raw = extractJSONString(text);
  try {
    return JSON.parse(raw) as T;
  } catch {
    return JSON.parse(repairJSON(raw)) as T;
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Claude tool_use sometimes nests payload under json/data or returns {}. */
export function unwrapStructuredPayload<T>(input: unknown): T {
  const r = asRecord(input);
  const nested = r.json ?? r.data ?? r.result ?? r.response;
  if (typeof nested === "string" && nested.trim()) {
    try {
      return parseJSONText<T>(nested);
    } catch {
      /* use outer object */
    }
  }
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as T;
  }
  return input as T;
}

export function isEmptyStructuredPayload(input: unknown): boolean {
  if (input == null) return true;
  if (typeof input !== "object") return false;
  const keys = Object.keys(input as object);
  if (!keys.length) return true;
  if (keys.length === 1 && (keys[0] === "json" || keys[0] === "data")) {
    const inner = (input as Record<string, unknown>)[keys[0]!];
    if (inner == null) return true;
    if (typeof inner === "string") return !inner.trim();
    if (typeof inner === "object" && !Array.isArray(inner)) {
      return !Object.keys(inner as object).length;
    }
  }
  return false;
}

function isTruncationError(err: unknown): boolean {
  return (
    err instanceof Error &&
    /incomplete JSON|truncated|max_tokens/i.test(err.message)
  );
}

function assertNotTruncated(stopReason: string | null, label: string) {
  if (stopReason === "max_tokens") {
    throw new Error(`Claude ${label} truncated (max_tokens)`);
  }
}

async function claudeJSONViaTool<T>(
  system: string,
  user: string,
  maxTokens: number
): Promise<T> {
  const res = await anthropic.messages.create({
    model: config.claudeModel,
    max_tokens: maxTokens,
    system: `${system}\n\nReturn your answer ONLY via the ${JSON_TOOL_NAME} tool. No markdown.`,
    tools: [
      {
        name: JSON_TOOL_NAME,
        description: "Emit the structured JSON response",
        input_schema: {
          type: "object",
          additionalProperties: true,
        },
      },
    ],
    tool_choice: { type: "tool", name: JSON_TOOL_NAME },
    messages: [{ role: "user", content: user }],
  });

  assertNotTruncated(res.stop_reason, "tool response");

  const toolUse = res.content.find((b) => b.type === "tool_use" && b.name === JSON_TOOL_NAME);
  if (toolUse && toolUse.type === "tool_use") {
    return unwrapStructuredPayload<T>(toolUse.input);
  }
  throw new Error("Claude did not return structured JSON via tool");
}

async function claudeJSONViaText<T>(
  system: string,
  user: string,
  maxTokens: number
): Promise<T> {
  const res = await anthropic.messages.create({
    model: config.claudeModel,
    max_tokens: maxTokens,
    system: `${system}\n\nRespond with valid JSON only. No markdown fences. Escape quotes inside strings.`,
    messages: [{ role: "user", content: user }],
  });

  assertNotTruncated(res.stop_reason, "text response");

  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  return parseJSONText<T>(text);
}

async function claudeJSONOnce<T>(
  system: string,
  user: string,
  maxTokens: number
): Promise<T> {
  try {
    const viaTool = await claudeJSONViaTool<T>(system, user, maxTokens);
    if (!isEmptyStructuredPayload(viaTool)) return viaTool;
    console.warn("[claudeJSON] Tool returned empty payload; retrying via text");
  } catch (err) {
    console.warn("[claudeJSON] Tool mode failed; retrying via text:", err);
  }
  return claudeJSONViaText<T>(system, user, maxTokens);
}

export async function claudeJSON<T>(
  system: string,
  user: string,
  maxTokens = 4096
): Promise<T> {
  const retryLimit = Math.min(Math.max(maxTokens * 2, 8192), 16384);
  const tokenLimits =
    retryLimit > maxTokens ? [maxTokens, retryLimit] : [maxTokens];

  let lastError: unknown;
  for (const tokens of tokenLimits) {
    try {
      return await claudeJSONOnce<T>(system, user, tokens);
    } catch (err) {
      lastError = err;
      if (!isTruncationError(err) || tokens === tokenLimits[tokenLimits.length - 1]) {
        throw err;
      }
      console.warn(
        `[claudeJSON] Truncated at ${tokens} tokens — retrying with ${retryLimit}`
      );
    }
  }
  throw lastError;
}

export async function claudeText(
  system: string,
  user: string,
  maxTokens = 2048
): Promise<string> {
  const res = await anthropic.messages.create({
    model: config.claudeModel,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}
