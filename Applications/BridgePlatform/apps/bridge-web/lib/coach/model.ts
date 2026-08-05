// The explanation layer: a model puts the answer into words a learner can reuse.
//
// An authority decides WHAT to play. This says WHY, and it exists because the
// authorities are bad writers. The guidelines hand back their own hardcoded
// sentence — which explains the card they REJECTED, not the ones they offered —
// and the solver hands back nothing at all. Neither was written for the person
// holding the cards.
//
// THREE THINGS IT IS NOT ALLOWED TO DO, all enforced in code rather than asked
// for in the prompt.
//
// 1. IT CANNOT SEE THE OTHER HANDS. It receives a VisiblePosition (visible.ts),
//    an object with no field for them. Hand a model the full deal and ask why a
//    card is right and it writes "because West has the Ace" — true, fluent, no
//    error raised, and the learner has been given a card off somebody else's
//    hand. There is no prompt that reliably prevents that. There is only not
//    sending it.
//
// 2. IT CANNOT CHANGE THE ANSWER. It is told which cards the authority chose and
//    may only explain those. Naming a different legal card as the play is a
//    validation failure, because a fluent second opinion silently overriding a
//    checked one is the worst outcome available here.
//
// 3. IT CANNOT EXPLAIN THE SOLVER. When the double-dummy search is the adviser,
//    its reasoning IS the hidden hands — so the model is never asked. The panel
//    keeps saying "worked out from the full deal", which is the honest answer to
//    "why" when the reason is something the learner could not have seen.
//
// Every failure degrades: no key, unreachable, refused, malformed, invalid — the
// panel keeps the authority's own wording. A missing explanation is a flourish
// that did not arrive, never an error a learner should see.

import Anthropic from "@anthropic-ai/sdk";

import { leakedCards, type VisiblePosition } from "./visible";

export interface PlayExplanation {
  /** One or two sentences on why this card, written for a player. */
  why: string;
  /**
   * Why a card the authority ruled out is ruled out. The guidelines know this —
   * their own prose is about the rejected card — but they put it in the wrong
   * place, under the cards they kept.
   */
  notThis?: { label: string; why: string }[];
  /**
   * Set when the authority offered several cards it cannot separate. It explains
   * the tie; it never breaks it. Breaking it would be the model advising, and
   * nothing checks the model.
   */
  equivalent?: string;
}

export const modelConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

/**
 * Claude Opus 5 by default, overridable.
 *
 * This call sits behind a button someone is waiting on, so a smaller model is a
 * legitimate trade — but a deliberate one, which is why the default is the
 * capable model and the lever is an environment variable.
 */
const MODEL = process.env.COACH_MODEL ?? "claude-opus-5";

/** How long an explanation may be. It is a sentence at a card table, not an essay. */
const MAX_WHY = 320;

/**
 * The stable head of every request, and so the cached prefix — byte-identical on
 * every call, read at roughly a tenth of input price from the second request on.
 * Everything per-position rides in the user turn, after the breakpoint.
 */
const SYSTEM = `You put a bridge coach's answer into words a learner can reuse next time.

You are given a position exactly as the learner can see it — their own hand, dummy
if it is face up, every card already played, the auction — and the card or cards a
checked authority has already chosen. You are NOT given the other hands.

Your only job is to say WHY that card, in terms the learner could have reasoned to
themselves from what they can see.

HARD RULES. A response breaking any of these is discarded entirely:

- Do not change the answer. You may only explain the cards you were given. Never
  name a different legal card as the play, never hedge about whether the answer is
  right, never offer an alternative.
- Never mention a card that is not in the position you were given. If your
  explanation needs to know what an opponent holds, you do not have an
  explanation — say what CAN be seen instead.
- Always write cards with their suit symbol: 6♦, K♠, 10♥. Never as a bare run
  like Q97 or J10 or AK.
- If you were given several cards, the authority could not separate them. Say so
  in the "equivalent" field. Do NOT pick one.
- Explain the reason, not the rule's name. "A small card was led, so your honour
  isn't needed to win the trick" beats "second hand low applies here".
- Two sentences at most. The learner is mid-trick.

If a card the authority REJECTED was given to you, put one clause on why in
"notThis" — that is often the most useful thing on the screen, but it belongs
beside the rejected card and not underneath the chosen one.`;

const SCHEMA = {
  type: "object",
  properties: {
    why: {
      type: "string",
      description: "One or two sentences on why this card, from what the learner can see.",
    },
    notThis: {
      type: "array",
      description: "Rejected cards, if any were given. One clause each.",
      items: {
        type: "object",
        properties: {
          label: { type: "string", description: "The rejected card, exactly as given." },
          why: { type: "string", description: "One clause on why it is worse." },
        },
        required: ["label", "why"],
        additionalProperties: false,
      },
    },
    equivalent: {
      type: "string",
      description: "Only when several cards were given: one clause saying they are interchangeable here.",
    },
  },
  required: ["why"],
  additionalProperties: false,
} as const;

/** Language that hedges about, or argues with, the answer it was given. */
const SECOND_GUESSING =
  /\b(instead|rather than|however|but you could|alternatively|might be better|would be better|arguably|actually the)\b/i;

/**
 * A holding written without suit symbols — "Q97", "J10", "AK", "KQJ".
 *
 * A rank LETTER followed by more ranks, and not followed by a suit glyph. Both
 * halves are load-bearing. The first version was `[AKQJT2-9]{2,}` and missed the
 * exact notation that shipped once: "J10" is J, 1, 0 — and neither 1 nor 0 is in
 * that class, so it matched one character and fell straight through. Widening to
 * all digits instead flags "13" in "trick 1 of 13", so the anchor has to be the
 * letter. The lookahead is what keeps correctly-written "10♦" and "K♠" from
 * tripping it.
 */
const BARE_HOLDING = /\b[AKQJT][AKQJT0-9]+(?![♠♥♦♣])/;

export interface ExplanationRejection {
  reason: "unconfigured" | "not-explainable" | "unreachable" | "refused" | "malformed" | "invalid";
  /** Which rule failed. Logged, never shown to a learner. */
  detail?: string;
}

export interface ExplainInput {
  pos: VisiblePosition;
  /** The cards the authority chose, as labels. */
  best: string[];
  /** Which authority chose them. */
  source: "system" | "convention" | "solution";
  /** The authority's own wording, where it has any. Raw material, not the answer. */
  authorityBecause?: string;
  /** Legal cards the authority ruled out, so the model can say why. */
  rejected?: string[];
}

/**
 * Explain the play, or say why there is no explanation.
 *
 * `client` is injectable so the validator — the part that actually protects this —
 * is testable without a network or a key.
 */
export async function explainPlay(
  input: ExplainInput,
  opts: { client?: Pick<Anthropic["messages"], "create">; timeoutMs?: number } = {},
): Promise<{ explanation: PlayExplanation } | ExplanationRejection> {
  // RULE 3, and it is a hard gate rather than a prompt instruction: the solver's
  // reason is the hidden hands, so there is nothing here that can honestly be put
  // into words. The panel's "worked out from the full deal" is the true answer.
  if (input.source === "solution") return { reason: "not-explainable" };
  if (!input.best.length) return { reason: "not-explainable" };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!opts.client && !apiKey) return { reason: "unconfigured" };
  const messages = opts.client ?? new Anthropic({ apiKey: apiKey! }).messages;

  const user = [
    "Position (everything the learner can see):",
    JSON.stringify(input.pos, null, 1),
    "",
    `The answer to explain: ${input.best.join(" or ")}`,
    input.best.length > 1
      ? "The authority offered all of these and cannot separate them."
      : "",
    input.rejected?.length ? `Cards it ruled out: ${input.rejected.join(", ")}` : "",
    input.authorityBecause
      ? `The authority's own wording, which is written for a rulebook reader rather than a player — rewrite it, don't quote it:\n${input.authorityBecause}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  let reply: Anthropic.Message;
  try {
    reply = await messages.create(
      {
        model: MODEL,
        max_tokens: 16000,
        // Adaptive at low effort rather than disabled: with thinking off this
        // model can write a tool call into visible text or leak internal tags,
        // and low effort already buys the latency back.
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
  return validateExplanation(parsed, input);
}

/**
 * The gate. Exported and pure, because models drift and a drifted explanation
 * should fail in a test rather than on a learner's screen.
 */
export function validateExplanation(
  raw: unknown,
  input: ExplainInput,
): { explanation: PlayExplanation } | ExplanationRejection {
  if (!raw || typeof raw !== "object") return { reason: "malformed" };
  const o = raw as Partial<PlayExplanation>;
  if (typeof o.why !== "string" || !o.why.trim()) return { reason: "malformed" };

  const rejected = new Set(input.rejected ?? []);
  const notThis = (o.notThis ?? []).filter(
    (n): n is { label: string; why: string } =>
      Boolean(n) && typeof n.label === "string" && typeof n.why === "string" && rejected.has(n.label),
  );
  const equivalent = typeof o.equivalent === "string" ? o.equivalent.trim() : "";
  const why = o.why.trim();
  const prose = [why, equivalent, ...notThis.map((n) => n.why)].join(" ");

  // Length: it appears under a card at a table.
  if (why.length > MAX_WHY) return { reason: "invalid", detail: `why is ${why.length} chars` };

  // RULE 1 — no card the learner cannot see, and no bare holdings that would slip
  // past the glyph check. A model that writes "Q97" instead of "Q♦ 9♦ 7♦" is not
  // caught by a suit-symbol scan, which is exactly how an unseen holding gets
  // through: the notation, not the content, defeats the guard.
  if (BARE_HOLDING.test(prose)) {
    return { reason: "invalid", detail: `wrote a bare holding: ${BARE_HOLDING.exec(prose)?.[0]}` };
  }
  const leaked = leakedCards(prose, input.pos);
  if (leaked.length) return { reason: "invalid", detail: `named unseen ${leaked.join(", ")}` };

  // RULE 2 — it may not change the answer.
  //
  // Note what this does NOT check. Merely naming a card outside the answer is
  // fine and often the best part of the explanation — "the J♦ would be wasted
  // here" is exactly what a learner needs. An earlier version rejected any
  // non-chosen card and would have killed that sentence.
  //
  // What is actually forbidden is TELLING the learner to play one. And the
  // displayed answer is not in the model's output at all — the panel draws the
  // chips from the authority's `best` — so the model cannot change the answer,
  // only contradict it in prose. These two checks catch that.
  const best = new Set(input.best);
  // A card label is a rank plus a suit glyph — no regex metacharacters in either,
  // so it needs no escaping. Building the pattern from the label directly keeps
  // this readable; if labels ever gain punctuation this needs an escape step.
  const directed = (input.pos.legal ?? []).filter(
    (c) => !best.has(c) && new RegExp(`\\b(?:play|lead|use|choose)\\s+(?:the\\s+)?${c}`, "i").test(why),
  );
  if (directed.length) {
    return { reason: "invalid", detail: `told the learner to play ${directed.join(", ")}` };
  }
  if (SECOND_GUESSING.test(why)) return { reason: "invalid", detail: "hedges about the answer" };

  // RULE 3 — say something from THIS deal. The anti-blandness guard.
  const concrete = [...input.best, ...(input.rejected ?? []), ...input.pos.auction.map((a) => a.call)];
  if (!concrete.some((t) => prose.includes(t))) {
    return { reason: "invalid", detail: "nothing specific to this deal" };
  }

  return {
    explanation: {
      why,
      ...(notThis.length ? { notThis } : {}),
      // Only meaningful when the authority really did offer several.
      ...(equivalent && input.best.length > 1 ? { equivalent } : {}),
    },
  };
}
