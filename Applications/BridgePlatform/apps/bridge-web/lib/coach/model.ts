// Layer 2 of "Help me think": the framing, written by a model.
//
// Layer 1 (think.ts) computes what is known and what the realistic choices are,
// deterministically and unarguably. This adds the three things arithmetic cannot
// produce: what a bid PROMISES, what each choice DOES, and the question the
// position actually poses.
//
// TWO PROPERTIES HOLD THIS TOGETHER, and both are enforced in code rather than
// requested in a prompt.
//
// 1. IT CANNOT SEE THE SOLVER, AND IT CANNOT SEE THE HIDDEN HANDS. It receives a
//    VisiblePosition (visible.ts), an object with no field for either. Handing a
//    model the verdict and asking it to explain produces "don't play the King,
//    West has the Ace" — a true sentence that hands the learner a card off
//    somebody else's hand, with no error raised and excellent prose. The fix is
//    not to ask nicely; it is not to send the information.
//
// 2. ITS OUTPUT IS VALIDATED AND DISCARDED ON FAILURE. Four rules, below. A
//    response that names one choice as the answer, cites a card the learner
//    cannot see, says nothing specific about this deal, or does not end on a
//    question is thrown away and the panel keeps its deterministic half. The
//    prompt asks; the validator enforces. Only the validator is load-bearing.
//
// Degradation is never an error. No API key, unreachable, slow, malformed,
// invalid — all of it returns `null`, and the panel shows layer 1 with a line
// saying the reasoning half is missing. Same discipline as benRead: a feature
// that did not fire, not something the learner should see.

import Anthropic from "@anthropic-ai/sdk";

import type { ThinkAid } from "./think";
import { leakedCards, type VisiblePosition } from "./visible";

/** What the model adds. Every field optional except the question. */
export interface Framing {
  /** What each call in the auction promised. Auction positions only. */
  meanings?: { call: string; promises: string }[];
  /** What each candidate accomplishes, keyed to layer 1's labels. */
  does?: { label: string; does: string }[];
  /** The question the position poses. Handed back to the learner unanswered. */
  question: string;
}

export const modelConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

/**
 * Claude Opus 5 by default.
 *
 * Overridable because this call is latency-sensitive in a way most of the app is
 * not — someone is holding thirteen cards waiting for it — and a smaller model is
 * a legitimate trade to make deliberately. It is not a trade to make silently, so
 * the default is the capable one.
 */
const MODEL = process.env.COACH_MODEL ?? "claude-opus-5";

/**
 * The stable head of every request, and therefore the cached prefix.
 *
 * Byte-identical on every call, so prompt caching reads it at roughly a tenth of
 * the input price from the second request onward. Nothing per-position appears
 * here — that all rides in the user turn, after the breakpoint.
 */
const SYSTEM = `You are a bridge coach helping a learner think, mid-hand, at the table.

You are given a position exactly as the learner can see it: their own hand, dummy
if it is face up, every card already played, the auction, and their legal options.
You are NOT given the other hands, and you are NOT given any calculation of what
the right play is. This is deliberate. You do not know the answer, and you must
not pretend to.

Your job is the three things the learner cannot work out with arithmetic:

1. MEANINGS — what each call in the auction promised about the hand that made it.
   General, widely-taught meanings. Say "usually" or "normally" when a meaning is
   not universal, and never claim to know this learner's own partnership
   agreements, because you do not.

2. WHAT EACH CHOICE DOES — for each option you are given, one clause on its
   mechanical consequence. "Keeps the King guarding the suit." "Names the second
   suit and keeps partner describing their hand." Consequence, not merit.

3. THE QUESTION — one sentence naming what this position actually turns on, phrased
   as a question the learner answers themselves.

HARD RULES. A response breaking any of these is discarded entirely:

- Never say which option is right, best, safest, or recommended. Never rank them,
  hint at one, or write a longer or warmer note for the one you privately prefer —
  a learner reads that tell faster than they read the position.
- Never name a card that is not in the position you were given. If you find
  yourself reasoning about what an opponent holds, stop: you cannot see it.
- Say something specific about THIS deal — a card, a call, a suit length that is
  actually here. Generic advice is worse than nothing.
- End on a question.
- If the position genuinely has nothing to weigh, say so plainly in the question
  field: "Nothing hidden here — either card is fine. Which feels more natural?"
  Admitting a dull position beats inventing depth for it.

Keep every clause short. The learner is mid-trick, not reading an essay.`;

const SCHEMA = {
  type: "object",
  properties: {
    meanings: {
      type: "array",
      description: "What each call promised. Auction positions only; omit during the play.",
      items: {
        type: "object",
        properties: {
          call: { type: "string", description: "The call, exactly as given, e.g. \"1♦\"." },
          promises: { type: "string", description: "One clause on what it shows." },
        },
        required: ["call", "promises"],
        additionalProperties: false,
      },
    },
    does: {
      type: "array",
      description: "One entry per option, using the option's label verbatim.",
      items: {
        type: "object",
        properties: {
          label: { type: "string", description: "The option label, exactly as given." },
          does: { type: "string", description: "One clause on its consequence. Never its merit." },
        },
        required: ["label", "does"],
        additionalProperties: false,
      },
    },
    question: {
      type: "string",
      description: "One sentence, ending in a question mark, that the learner answers.",
    },
  },
  required: ["question"],
  additionalProperties: false,
} as const;

/** Words that turn a consequence into a recommendation. */
const PREFERENCE =
  /\b(best|better|safest|safer|correct|right|wrong|should|recommend|prefer|optimal|strongest|weakest|mistake|error|avoid)\b/i;

export interface FramingRejection {
  reason: "unconfigured" | "unreachable" | "refused" | "malformed" | "invalid";
  /** Which rule failed, when `invalid`. Logged, never shown to a learner. */
  detail?: string;
}

/**
 * Ask for the framing. Returns the framing, or why there isn't one.
 *
 * `client` is injectable so tests can drive the validator without a network or a
 * key — the validator is the part worth testing, and it should be testable
 * without spending a token.
 */
export async function frameThinking(
  pos: VisiblePosition,
  aid: ThinkAid,
  opts: { client?: Pick<Anthropic["messages"], "create">; timeoutMs?: number } = {},
): Promise<{ framing: Framing } | FramingRejection> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!opts.client && !apiKey) return { reason: "unconfigured" };

  const messages = opts.client ?? new Anthropic({ apiKey: apiKey! }).messages;

  const options = aid.candidates.map((c) => `- ${c.label}${c.note ? ` (${c.note})` : ""}`).join("\n");
  const user = [
    `Position (everything the learner can see):`,
    JSON.stringify(pos, null, 1),
    ``,
    `What the learner has already been shown, so don't repeat it:`,
    ...aid.known.map((k) => `- ${k}`),
    ``,
    `Their options, to be used verbatim as labels:`,
    options || "- (no choice available)",
  ].join("\n");

  let reply: Anthropic.Message;
  try {
    reply = await messages.create(
      {
        model: MODEL,
        max_tokens: 16000,
        // Adaptive rather than disabled: with thinking off, this model can write
        // a tool call into visible text or leak <thinking> tags, and `low` effort
        // already buys back the latency. See the API guidance on disabled thinking.
        thinking: { type: "adaptive" },
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      },
      { timeout: opts.timeoutMs ?? 12_000 },
    );
  } catch {
    return { reason: "unreachable" };
  }

  // Check stop_reason BEFORE reading content: on a refusal `content` is empty or
  // partial, and indexing it unconditionally is how this crashes in production.
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

  return validateFraming(parsed, pos, aid);
}

/**
 * The four rules, as a gate.
 *
 * Exported and pure, because this is the part that keeps the feature honest and
 * it should be testable without a network call. A model that drifts — and models
 * drift — fails here rather than on a learner's screen.
 */
export function validateFraming(
  raw: unknown,
  pos: VisiblePosition,
  aid: ThinkAid,
): { framing: Framing } | FramingRejection {
  if (!raw || typeof raw !== "object") return { reason: "malformed" };
  const o = raw as Partial<Framing>;
  if (typeof o.question !== "string" || !o.question.trim()) return { reason: "malformed" };

  const meanings = (o.meanings ?? []).filter(
    (m): m is { call: string; promises: string } =>
      Boolean(m) && typeof m.call === "string" && typeof m.promises === "string",
  );
  const labels = new Set(aid.candidates.map((c) => c.label));
  const does = (o.does ?? []).filter(
    (d): d is { label: string; does: string } =>
      Boolean(d) && typeof d.label === "string" && typeof d.does === "string" && labels.has(d.label),
  );
  const prose = [o.question, ...meanings.map((m) => m.promises), ...does.map((d) => d.does)].join(" ");

  // RULE 1 — nothing is named as the answer.
  if (PREFERENCE.test(prose)) return { reason: "invalid", detail: "prose ranks or recommends" };
  // Covering only one of several options is itself a recommendation.
  if (aid.candidates.length > 1 && does.length === 1) {
    return { reason: "invalid", detail: "annotated one option out of several" };
  }

  // RULE 2 — no card the learner cannot see.
  const leaked = leakedCards(prose, pos);
  if (leaked.length) return { reason: "invalid", detail: `named unseen ${leaked.join(", ")}` };

  // RULE 3 — something concrete from THIS deal. The anti-blandness guard.
  const concrete = [
    ...aid.candidates.map((c) => c.label),
    ...pos.auction.map((a) => a.call),
    ...pos.myHand.cards,
  ];
  if (!concrete.some((t) => prose.includes(t))) {
    return { reason: "invalid", detail: "nothing specific to this deal" };
  }

  // RULE 4 — it ends on a question.
  if (!o.question.trim().endsWith("?")) return { reason: "invalid", detail: "does not end on a question" };

  return {
    framing: {
      ...(meanings.length ? { meanings } : {}),
      ...(does.length ? { does } : {}),
      question: o.question.trim(),
    },
  };
}
