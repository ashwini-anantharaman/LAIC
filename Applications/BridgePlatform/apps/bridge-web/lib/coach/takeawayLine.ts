// The "one thing to remember" — a single sentence, written by the model,
// GROUNDED in the takeaway's own citation.
//
// The takeaway card (lib/coach/takeaway.ts) is deterministic: verdict chips
// from the KB, cost lines from the solver, a fallback line assembled from the
// rule label. This file adds the one non-deterministic touch — a memorable
// phrasing of the key moment — under the same discipline as hints.ts and
// eventQa.ts: the model is handed the coach's own material and may rephrase
// it, never overrule it. It is told the verdict; it does not produce one.
//
// A failed or missing line is NOT a failed card: the caller falls back to the
// deterministic sentence, so this route can only ever improve the wording.

import Anthropic from "@anthropic-ai/sdk";

import type { TakeawayMoment } from "./takeaway";

export const takeawayLineConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

/** Same knob as hints, Q&A and the explanation layer — the coach is one model. */
const modelId = (): string => process.env.COACH_MODEL ?? "claude-opus-5";
const supportsAdaptive = (model: string): boolean => !/haiku/.test(model);

const SCHEMA = {
  type: "object",
  properties: { line: { type: "string" } },
  required: ["line"],
  additionalProperties: false,
} as const;

const SYSTEM = `You are a bridge coach writing the ONE THING TO REMEMBER from a finished board — the single sentence a learner should carry to the next one.

You are given the key decision: the position, what the learner called, what their partnership's system calls, the agreement behind it (the citation), and what the layout was worth double-dummy. The verdict is settled — you never re-judge it, and you never introduce a convention, rule or agreement that is not in the citation.

Write EXACTLY ONE sentence, at most 28 words. Make it the PRINCIPLE, not the replay: name the kind of position and the habit of thought, so it transfers to other boards. Plain club-learner language, suit symbols (♠ ♥ ♦ ♣) where a suit is named, no preamble, no "remember that" padding — the sentence IS the reminder. If the learner's call matched the system, the sentence reinforces why that habit is right; if it diverged, the sentence is the habit that would have found the system's call.`;

export type TakeawayLineRejection = {
  reason: "unconfigured" | "unreachable" | "refused" | "malformed" | "empty";
};

/**
 * One sentence for the moment, or why there is none. `client` is injectable
 * so the validation is testable without a network or a key.
 */
export async function generateTakeawayLine(
  input: {
    moment: TakeawayMoment;
    /** The learner's own dealt hand, "S:KQ874 H:A3 D:K92 C:J54". */
    hand: string;
  },
  opts: { client?: Pick<Anthropic["messages"], "create">; timeoutMs?: number } = {},
): Promise<{ line: string } | TakeawayLineRejection> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!opts.client && !apiKey) return { reason: "unconfigured" };
  const messages = opts.client ?? new Anthropic({ apiKey: apiKey! }).messages;

  const m = input.moment;
  const user = [
    `The position: ${m.setting}`,
    `The learner's hand: ${input.hand}`,
    `The learner called: ${m.learnerCall}`,
    m.kind === "disagreement"
      ? `Their system calls: ${m.systemCall}`
      : `That matched their system's own call.`,
    `The agreement (citation): ${m.ruleLabel}`,
    ...(m.ddLines.length ? ["What the layout was worth:", ...m.ddLines.map((l) => `- ${l}`)] : []),
  ].join("\n");

  let reply: Anthropic.Message;
  try {
    reply = await messages.create(
      {
        model: modelId(),
        max_tokens: 8000,
        ...(supportsAdaptive(modelId())
          ? {
              thinking: { type: "adaptive" as const },
              output_config: {
                effort: "low" as const,
                format: { type: "json_schema" as const, schema: SCHEMA },
              },
            }
          : { output_config: { format: { type: "json_schema" as const, schema: SCHEMA } } }),
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      },
      { timeout: opts.timeoutMs ?? 25_000 },
    );
  } catch (err) {
    const e = err as { status?: number; message?: string };
    console.error(
      `[coach] takeaway-line call failed (status ${e?.status ?? "none"}): ${e?.message ?? err}`,
    );
    return { reason: "unreachable" };
  }

  if (reply.stop_reason === "refusal") return { reason: "refused" };

  const text = reply.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { reason: "malformed" };
  }
  return validateTakeawayLine(parsed);
}

/**
 * The gate, pure and exported. One non-empty sentence within bounds — the
 * same principle as validateHints: what the gate permits, the model
 * eventually produces, so the gate is the spec.
 */
export function validateTakeawayLine(raw: unknown): { line: string } | TakeawayLineRejection {
  if (typeof raw !== "object" || raw === null) return { reason: "malformed" };
  const line = (raw as { line?: unknown }).line;
  if (typeof line !== "string") return { reason: "malformed" };
  const t = line.trim();
  if (!t) return { reason: "empty" };
  // One sentence, one line — anything longer is rejected, not trimmed: the
  // card's whole design is a single carried thought, and the fallback line
  // is always there to take its place.
  if (t.length > 260 || /\n/.test(t)) return { reason: "malformed" };
  return { line: t };
}
