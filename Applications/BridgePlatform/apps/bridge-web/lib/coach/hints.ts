// Up to five hints for the decision on the table — a ladder, not an answer.
//
// The coach panel's HINTS screen (owner direction 2026-08-11) shows five
// face-down hints for the current decision. Each one the learner opens gives
// away a little more: the first points at the right question, the middle rungs
// walk the reasoning, and only the fifth names the action itself. The learner
// decides how much help to take — which is the whole point of a ladder over a
// single answer.
//
// Same discipline as the Q&A layer (eventQa.ts): the model is handed a
// VisiblePosition — an object with NO FIELD for the concealed hands — and its
// hints are validated against the cards the learner may legitimately have seen
// before anyone reads them. One leaked pip discards the whole set.
//
// THE TARGET. During the play the caller passes the advice layer's own answer
// (advisePlay's best cards), so the ladder CONVERGES on the card the coach
// would actually recommend — five hints that walk you to a different card than
// "What should I play?" would be two coaches arguing. In the auction there is
// no single deterministic authority wired here yet, so the model reasons to
// its own conclusion; the ladder is the value, not the verdict.

import Anthropic from "@anthropic-ai/sdk";

import { leakedCards, type VisiblePosition } from "./visible";

export const hintsConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

/** Same knob as the explanation and Q&A layers — the coach is one model. */
const modelId = (): string => process.env.COACH_MODEL ?? "claude-opus-5";
const supportsAdaptive = (model: string): boolean => !/haiku/.test(model);

/** The ladder's CAP. Dynamic below it (owner direction 2026-08-14): a
 *  routine decision earns two or three rungs, only a layered one earns five. */
export const HINT_COUNT = 5;
/** The floor: one rung that isn't the answer, then the answer. Anything
 *  shorter is not a ladder, it's a tell wearing the wrong label. */
export const HINT_MIN = 2;

// NO minItems/maxItems: structured outputs rejects maxItems outright and
// minItems above 1 (400 "invalid schema"), so the five-ness is enforced by
// the prompt and by validateHints below — not by the wire schema. This is
// what broke the feature on day one; the constraint looks harmless and isn't.
const SCHEMA = {
  type: "object",
  properties: {
    hints: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["hints"],
  additionalProperties: false,
} as const;

const SYSTEM = `You are a bridge coach beside a learner who is deciding what to do right now — a call in the auction or a card to a trick. Write BETWEEN TWO AND FIVE hints they can open one at a time — as many as this decision actually needs, and no more. A routine decision (a forced card, one clearly right call, a textbook response) deserves two or three; only a genuinely layered problem earns all five. Padding a simple decision to five rungs is a fault, not thoroughness.

Each hint reveals a little more than the one before. Build the ladder from these rungs, dropping the middle ones a simple decision doesn't need:

- First: point at the right QUESTION — what kind of problem this is, what to look at first. Do not evaluate anything yet.
- Then, as needed: one concrete OBSERVATION from what they can see (a count, a shape, a feature of the auction or the trick); the key INFERENCE or principle that applies; a NARROWING — the suit, the direction of the plan, the family of actions — without naming the final call or card.
- Last: the answer itself, named plainly, with the one reason that decides it. Only the last hint ever names it.

You are given only what the learner can see from their seat: their own hand, dummy when it is face up, the auction, and the tricks as played. You do not know the concealed hands. Never name, count, or place a card you were not shown, and never state an inference about hidden cards as a fact.

When a recommended action is provided, it is authoritative: every hint must walk toward it and the LAST hint must name it. When none is provided, reason to your own best conclusion and keep every hint consistent with it.

EACH HINT IS ONE SHORT SENTENCE. No preamble, no "consider" padding, no restating the position. Use suit symbols (♠ ♥ ♦ ♣) and plain club-learner language. Every hint before the last must not name the final call or card.`;

export type HintsRejection = {
  reason: "unconfigured" | "unreachable" | "refused" | "malformed" | "leaked" | "empty" | "off-target";
};

/**
 * Does this rung name the target action? Tolerant of the ways a coach
 * actually writes a card — "10♦", "♦10", "T♦" — because the guarantee must
 * not fail on notation. A non-card target (a call, once the auction is
 * anchored too) matches as plain text.
 */
function namesTarget(hint: string, target: string): boolean {
  const h = hint.toUpperCase();
  const card = /^(A|K|Q|J|10|[2-9])([♠♥♦♣])$/.exec(target.toUpperCase());
  const variants = card
    ? [
        `${card[1]}${card[2]}`,
        `${card[2]}${card[1]}`,
        ...(card[1] === "10" ? [`T${card[2]}`, `${card[2]}T`] : []),
      ]
    : [target.toUpperCase()];
  return variants.some((v) => h.includes(v));
}

/**
 * Two to five hints for the current decision — as many as it needs — or why
 * there are none.
 *
 * `client` is injectable so the validator — the part that actually protects
 * this — is testable without a network or a key.
 */
export async function generateHints(
  input: {
    pos: VisiblePosition;
    /** The advice layer's answer, when it has one — "10♦", or "1♥" for a call. */
    target?: string;
  },
  opts: { client?: Pick<Anthropic["messages"], "create">; timeoutMs?: number } = {},
): Promise<{ hints: string[] } | HintsRejection> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!opts.client && !apiKey) return { reason: "unconfigured" };
  const messages = opts.client ?? new Anthropic({ apiKey: apiKey! }).messages;

  const user = [
    "Position (everything the learner can see):",
    JSON.stringify(input.pos, null, 1),
    "",
    input.target
      ? `Recommended action (authoritative — hint 5 must name it): ${input.target}`
      : "No recommended action is provided — reason to your own conclusion.",
  ].join("\n");

  let reply: Anthropic.Message;
  try {
    reply = await messages.create(
      {
        model: modelId(),
        max_tokens: 16000,
        // Adaptive at low effort rather than disabled, for the same reasons as
        // model.ts: with thinking off these models can write a tool call into
        // visible text or leak internal tags. Haiku rejects both knobs.
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
      { timeout: opts.timeoutMs ?? 30_000 },
    );
  } catch (err) {
    const e = err as { status?: number; message?: string };
    console.error(`[coach] hints call failed (status ${e?.status ?? "none"}): ${e?.message ?? err}`);
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
  return validateHints(parsed, input.pos, input.target);
}

/**
 * The gate, pure and exported. Two to five non-empty, short hints (the count
 * is the model's read of the decision's depth; the bounds are ours), none of
 * which names a card the learner could not have seen. One leaked pip means the
 * model reasoned from information it should never act on, and the whole ladder
 * is discarded — showing the clean rungs would be laundering it.
 */
export function validateHints(
  raw: unknown,
  pos: VisiblePosition,
  /** When the advice layer anchored the ladder, the LAST rung must name this
   *  — the GUARANTEE that Hints and Owlee's Tell can never disagree (owner
   *  direction 2026-08-14). Prompt-only enforcement drifted; the gate doesn't. */
  target?: string,
): { hints: string[] } | HintsRejection {
  if (typeof raw !== "object" || raw === null) return { reason: "malformed" };
  const hints = (raw as { hints?: unknown }).hints;
  if (!Array.isArray(hints) || hints.length < HINT_MIN || hints.length > HINT_COUNT)
    return { reason: "malformed" };
  const trimmed: string[] = [];
  for (const h of hints) {
    if (typeof h !== "string") return { reason: "malformed" };
    const t = h.trim();
    if (!t) return { reason: "empty" };
    // One short sentence each. The Q&A ceiling is 420 for two sentences; a
    // rung of the ladder gets half that, and the same reasoning applies: what
    // the gate permits, the model eventually produces.
    if (t.length > 220) return { reason: "malformed" };
    trimmed.push(t);
  }
  if (leakedCards(trimmed.join("\n"), pos).length) return { reason: "leaked" };
  // The convergence gate: an anchored ladder that walks to a different answer
  // than the one Tell shows is rejected whole, same as a leak — two coaches
  // arguing is worse than no ladder.
  if (target && !namesTarget(trimmed[trimmed.length - 1]!, target)) {
    return { reason: "off-target" };
  }
  return { hints: trimmed };
}
