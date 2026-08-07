// Q&A about one table event — "Partner bid 1♦" → "what does that show?".
//
// The learner taps an event row in the coach panel and asks a free question
// about it. A model answers, under the same discipline as the explanation
// layer (model.ts): it is handed a VisiblePosition — an object with NO FIELD
// for the concealed hands — and its answer is validated against the cards the
// learner may legitimately have seen before anyone reads it. Blindness is a
// property of the type; the validator catches drift.
//
// This file has its own position builder rather than reusing visible.ts's
// `visiblePosition` for one reason: that builder returns null whenever it is
// not the learner's decision, because an ADVICE surface has nothing to say
// then. A QUESTION surface is the opposite — "why did West lead that?" is most
// interesting precisely when it is somebody else's card. So `qaPosition`
// builds the same shape without the turn gate, and never fills `legal` from a
// hand the learner cannot see.

import Anthropic from "@anthropic-ai/sdk";
import type { GameState } from "@bridge/engine";
import { legalPlays } from "@bridge/engine";
import type { Call, Card, Seat } from "@bridge/events";

import { callLabel, cardLabel, GLYPH, partnerOf, SUITS, visibleSeats } from "./position";
import { leakedCards, type VisiblePosition } from "./visible";

export const qaConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

/** Same knob as the explanation layer, so the coach is one model, not two. */
const modelId = (): string => process.env.COACH_MODEL ?? "claude-opus-5";
const supportsAdaptive = (model: string): boolean => !/haiku/.test(model);

const relationOf = (seat: Seat, me: Seat): "you" | "partner" | "opponent" =>
  seat === me ? "you" : seat === partnerOf(me) ? "partner" : "opponent";

/** One hand, grouped the way a hand diagram prints it. */
function handOf(cards: Card[]): VisiblePosition["myHand"] {
  const suits: string[] = [];
  for (const s of SUITS) {
    const inSuit = cards.filter((c) => c.suit === s).sort((a, b) => b.rank - a.rank);
    if (inSuit.length)
      suits.push(`${GLYPH[s]} ${inSuit.map((c) => cardLabel(c).slice(0, -1)).join(" ")}`);
  }
  return { suits, cards: cards.map(cardLabel) };
}

/** The learner's original thirteen — what is left plus what they played. */
function dealt(state: GameState, seat: Seat): Card[] {
  return [
    ...state.hands[seat],
    ...state.tricks.flatMap((t) => t.plays.filter((p) => p.seat === seat).map((p) => p.card)),
  ];
}

/**
 * The position for a question, from the learner's seat. Unlike the advice
 * builder this exists whether or not it is their turn — but it holds exactly
 * the same information: their hand, dummy when face up, and the public record.
 */
export function qaPosition(state: GameState, seat: Seat | null): VisiblePosition | null {
  if (!seat) return null;
  if (state.phase !== "auction" && state.phase !== "play") return null;

  const auction = state.auction.map((a) => ({
    seat: a.seat,
    relation: relationOf(a.seat, seat),
    call: callLabel(a.call as Call),
  }));

  if (state.phase === "auction") {
    return {
      phase: "auction",
      seat,
      actor: state.turn,
      role: "bidder",
      vulnerable: state.vul,
      myHand: handOf(dealt(state, seat)),
      auction,
      tricks: [],
      // Deliberately empty off-turn: legal calls are public, but the advice
      // surface owns "what can I do" — this surface answers "what happened".
      legal: [],
    };
  }

  if (!state.contract) return null;
  const declarer = state.contract.declarer;
  const dummySeat = partnerOf(declarer);
  const role = seat === declarer ? "declarer" : seat === dummySeat ? "dummy" : "defender";

  const seen = visibleSeats(state, seat);
  const strain = state.contract.strain === "N" ? "NT" : (GLYPH[state.contract.strain] ?? "");

  // `legal` only when the choice is from a hand the learner may see: their
  // own, or dummy's while declaring. An opponent's legal cards ARE their hand.
  const controlled: Seat[] = role === "declarer" ? [seat, dummySeat] : [seat];
  const myChoice = controlled.includes(state.turn) && role !== "dummy";

  return {
    phase: "play",
    seat,
    actor: state.turn,
    role,
    vulnerable: state.vul,
    contract: `${state.contract.level}${strain} by ${state.contract.declarer}`,
    myHand: handOf(dealt(state, seat)),
    ...(seen.includes(dummySeat) && dummySeat !== seat
      ? { dummy: handOf(dealt(state, dummySeat)) }
      : {}),
    auction,
    tricks: state.tricks.map((t) => ({
      plays: t.plays.map((p) => ({
        seat: p.seat,
        relation: relationOf(p.seat, seat),
        card: cardLabel(p.card),
      })),
    })),
    legal: myChoice ? legalPlays(state, state.turn).map(cardLabel) : [],
  };
}

const SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
} as const;

const SYSTEM = `You are a bridge coach sitting beside a learner at the table. The learner has asked a question — about one event they tapped (a call in the auction or a card played to a trick), or about the position in general.

You are given only what the learner can see from their seat: their own hand, dummy when it is face up, the auction, and the tricks as played. You do not know the concealed hands. Never name, count, or place a card you were not shown, and never state an inference about hidden cards as a fact — "the auction suggests West holds spade values" is honest reading; "West has the A♠" is not.

When the event is a call and the learner's system meaning is provided, treat that meaning as the authoritative agreement and build on it. When no meaning is provided for a call, say their system notes don't cover it — do not invent an agreement.

ANSWER IN AT MOST TWO SHORT SENTENCES. One is often right. The learner is mid-hand at a table; they asked one thing, and the answer to one thing is short. Use suit symbols (♠ ♥ ♦ ♣) and plain club-learner language.

What padding looks like, so you can cut it: restating their question back to them, surveying the whole position before answering, listing options they did not ask for, "the decision is yours", "watch what happens next", closing advice of any kind. Lead with the answer itself.

If the question cannot be answered from the learner's seat — it needs the concealed hands, or the play has not revealed enough — that IS the answer, in one sentence, plus at most one more naming what would reveal it. Uncertainty is a short answer, never a long one.

Do not tell the learner which card to play or which call to make. If they ask for the answer itself, name the one consideration that decides it and stop — do not lay out every trade-off.`;

export type QaRejection = {
  reason: "unconfigured" | "unreachable" | "refused" | "malformed" | "leaked" | "empty";
};

/**
 * Answer one question about one event, or say why there is no answer.
 *
 * `client` is injectable so the validator — the part that actually protects
 * this — is testable without a network or a key.
 */
export async function answerEventQuestion(
  input: {
    pos: VisiblePosition;
    /** The event as the panel shows it — "Partner bid 1♦", "West led the A♠". */
    eventLabel: string;
    /** The call's meaning from the KB, when the system has one. */
    meaning?: string;
    question: string;
  },
  opts: { client?: Pick<Anthropic["messages"], "create">; timeoutMs?: number } = {},
): Promise<{ answer: string } | QaRejection> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!opts.client && !apiKey) return { reason: "unconfigured" };
  const messages = opts.client ?? new Anthropic({ apiKey: apiKey! }).messages;

  const user = [
    "Position (everything the learner can see):",
    JSON.stringify(input.pos, null, 1),
    "",
    `What the question is about: ${input.eventLabel}`,
    input.meaning
      ? `What that call means in the learner's system (authoritative): ${input.meaning}`
      : "",
    "",
    `The learner's question: ${input.question}`,
  ]
    .filter(Boolean)
    .join("\n");

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
      { timeout: opts.timeoutMs ?? 15_000 },
    );
  } catch (err) {
    // The status code is the whole diagnosis — 401 is a dead key, 404 a model
    // this key can't reach, undefined a network drop or a killed function.
    const e = err as { status?: number; message?: string };
    console.error(`[coach] anthropic call failed (status ${e?.status ?? "none"}): ${e?.message ?? err}`);
    return { reason: "unreachable" };
  }

  // stop_reason before content: on a refusal `content` is empty or partial.
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
  return validateAnswer(parsed, input.pos);
}

/**
 * The gate, pure and exported: an answer that names a card the learner could
 * not have seen is discarded whole. One leaked pip means the model reasoned
 * from information it should never act on, and no sentence of that answer can
 * be trusted; showing the clean half would be laundering it.
 */
export function validateAnswer(
  raw: unknown,
  pos: VisiblePosition,
): { answer: string } | QaRejection {
  if (typeof raw !== "object" || raw === null) return { reason: "malformed" };
  const answer = (raw as { answer?: unknown }).answer;
  if (typeof answer !== "string") return { reason: "malformed" };
  const trimmed = answer.trim();
  if (!trimmed) return { reason: "empty" };
  // A coach's answer, not an essay. Overlong output is usually the model
  // narrating the whole position back — cut it off rather than paraphrase it.
  // ~2 short sentences ≈ 150–260 chars in practice; 420 is generous headroom. The
  // old ceiling was 900, and answers grew to meet it — the screenshot that
  // prompted this had ~650 characters of trade-off tour under a "why not the 5♥?"
  // question. A ceiling is part of the framing: what the gate permits, the model
  // eventually produces.
  if (trimmed.length > 420) return { reason: "malformed" };
  if (leakedCards(trimmed, pos).length) return { reason: "leaked" };
  return { answer: trimmed };
}
