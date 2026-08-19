// The Position states' bid inference — by Claude alone, NO knowledge base
// (boss direction 2026-08-15: "fully use Claude … not use anything from the
// knowledge base at all when it is inferring the information of the bids").
//
// This REPLACES the KB-meaning parsing (lib/coach/states.ts, now unwired)
// as the source of the My partner / Partnership / Theirs cards. The model
// is handed exactly what the learner can see — the auction, their own hand,
// the vulnerability — and reads it by standard, widely played methods,
// including the inference regexes never could: passes cap hands, failures
// to raise deny support, a new suit forces. It consults no system notes.
//
// THE GATES, because a model's read must not wear arithmetic's authority:
//  · structured claims only (JSON schema) — never free prose as a card;
//  · every number is sanity-bounded (points 0–40, suit lengths 1–13,
//    min ≤ max) and a claim that fails its bounds is dropped ALONE;
//  · every card's back carries the model's one-line "because", so the
//    learner can always see it is a read, not a count.
//
// The deterministic cards ("X bid 1♠" from the raw auction, the combined
// points arithmetic, the fit count) are composed HERE from the validated
// claims plus the learner's own hand — the model states ranges, the
// arithmetic on top of them stays ours.

import Anthropic from "@anthropic-ai/sdk";

import { hcp } from "@bridge/engine";
import type { Call, Card, Seat, Suit } from "@bridge/events";

import { callLabel, cardLabel, GLYPH, partnerOf, Relative, step, SUIT_WORD, SUITS } from "./position";
import type { KnownCard } from "./think";

export const stateReadsConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

/** Same knob as every other coach layer — the coach is one model. */
const modelId = (): string => process.env.COACH_MODEL ?? "claude-opus-5";
const supportsAdaptive = (model: string): boolean => !/haiku/.test(model);

/** One seat's read, as the model states it. */
interface SeatRead {
  points?: { min?: number; max?: number };
  suits?: { suit: string; min: number }[];
  because?: string;
}

/**
 * One inference the learner could have made THEMSELVES (owner direction
 * 2026-08-15): the observed clue, the deduction, and the reasoning. Drawn
 * as an envelope whose SEAL is the clue — the learner finishes the thought
 * before opening.
 */
export interface Inference {
  clue: string;
  conclusion: string;
  because?: string;
  pane: "partner" | "theirs" | "advanced";
}

interface Reads {
  partner?: SeatRead;
  opponents?: { seat: string; read: SeatRead }[];
  inferences?: Inference[];
}

// NO minItems/maxItems/enums — structured outputs rejects them (the hints
// layer learned this the hard way); bounds are enforced by validateReads.
const SCHEMA = {
  type: "object",
  properties: {
    partner: {
      type: "object",
      properties: {
        points: {
          type: "object",
          properties: { min: { type: "number" }, max: { type: "number" } },
          additionalProperties: false,
        },
        suits: {
          type: "array",
          items: {
            type: "object",
            properties: { suit: { type: "string" }, min: { type: "number" } },
            required: ["suit", "min"],
            additionalProperties: false,
          },
        },
        because: { type: "string" },
      },
      additionalProperties: false,
    },
    opponents: {
      type: "array",
      items: {
        type: "object",
        properties: {
          seat: { type: "string" },
          points: {
            type: "object",
            properties: { min: { type: "number" }, max: { type: "number" } },
            additionalProperties: false,
          },
          suits: {
            type: "array",
            items: {
              type: "object",
              properties: { suit: { type: "string" }, min: { type: "number" } },
              required: ["suit", "min"],
              additionalProperties: false,
            },
          },
          because: { type: "string" },
        },
        required: ["seat"],
        additionalProperties: false,
      },
    },
    inferences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          clue: { type: "string" },
          conclusion: { type: "string" },
          because: { type: "string" },
          pane: { type: "string" },
        },
        required: ["clue", "conclusion", "pane"],
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

const SYSTEM = `You are a bridge coach reading the table for a learner. Using ONLY standard, widely played natural methods — you have no partnership system notes — state what each OTHER player's calls (and, when play is under way, their PLAYS) have shown about their hand. Suits are S/H/D/C.

Rules of the read:
- Be conservative: state what the bidding and play PROMISE or strongly imply, not what they might hide. Ranges wide before narrow.
- NEGATIVE inference counts: an original pass caps a hand around 11 points; a pass over partner's opening caps around 5; failing to raise partner's suit denies the support a raise would show; failing to act over an opening usually caps strength.
- During the play, UPDATE the reads from the cards: showing out proves a void; the honours a player has produced count toward their promised points; an opening lead suggests length or a sequence; discards suggest weakness in the suit thrown.
- Every claim gets ONE short "because" sentence in plain club-learner language.
- A seat whose calls genuinely say nothing yet is OMITTED — never invent.
- Points are high-card-point estimates 0-40. Suit claims are minimum lengths 4-13 (only state a suit when the bidding really shows it).
- The learner's own hand is given for context only — never state claims about the learner's hand.

ALSO: up to FOUR "inferences" (at most two per pane) — deductions the learner could make THEMSELVES right now. Each has:
- "clue": the observation, TELEGRAPHIC — six words or fewer, ending with an ellipsis. "West passed over 1♠…", "Dummy came down flat…", "East showed out of hearts…". Never a full sentence; the clue is a nudge, not a report.
- "conclusion": what follows, FOUR words or fewer — "at most 6 points", "no hearts left".
- "because": one sentence connecting them.
- "pane": where it files — "partner" (about partner), "theirs" (about an opponent), "advanced" (cross-table counting).
Do NOT restate the point ranges and suit claims from above as inferences, and do NOT state shown-out voids (a player failing to follow suit) — the panel already proves those itself. An inference is an ADDITIONAL observation, especially from passes, skipped bids, and the play. Fewer, sharper inferences beat filler; none is a fine answer early on.`;

export type ReadsRejection = { reason: "unconfigured" | "unreachable" | "refused" | "malformed" };

/**
 * Ask the model for the reads, then validate. `client` injectable so the
 * validator and the composer are testable without a network or a key.
 */
export async function generateStateReads(
  input: {
    dealer: Seat;
    vul: string;
    auction: readonly { seat: Seat; call: Call }[];
    seat: Seat;
    hand: readonly Card[];
    /** Present once the play is under way — COMPLETED tricks only (the read
     *  refreshes at trick boundaries), plus dummy's hand, which is public. */
    play?: {
      contractLabel: string;
      declarer: Seat;
      dummy: Seat;
      dummyHand?: readonly Card[];
      tricks: readonly { plays: readonly { seat: Seat; card: Card }[]; winner?: Seat | null }[];
    };
  },
  opts: { client?: Pick<Anthropic["messages"], "create">; timeoutMs?: number } = {},
): Promise<{ reads: Reads } | ReadsRejection> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!opts.client && !apiKey) return { reason: "unconfigured" };
  const messages = opts.client ?? new Anthropic({ apiKey: apiKey! }).messages;

  const partner = partnerOf(input.seat);
  const line = (a: { seat: Seat; call: Call }) => {
    const who =
      a.seat === input.seat ? "You" : a.seat === partner ? "Partner" : Relative(a.seat, input.seat);
    return `${a.seat} (${who}): ${a.call === "P" ? "Pass" : callLabel(a.call)}`;
  };
  const handText = (cards: readonly Card[]) =>
    SUITS.map(
      (s) =>
        `${s}: ${[...cards]
          .filter((c) => c.suit === s)
          .sort((a, b) => b.rank - a.rank)
          .map((c) => "23456789TJQKA"[c.rank - 2])
          .join("") || "-"}`,
    ).join("  ");

  const play = input.play;
  const user = [
    `Dealer ${input.dealer}, vulnerability ${input.vul}.`,
    `The learner sits ${input.seat}; partner is ${partner}; opponents are ${step(input.seat, 1)} and ${step(input.seat, 3)}.`,
    `Learner's hand (context only): ${handText(input.hand)} (${hcp([...input.hand])} HCP)`,
    "",
    "The auction, in order:",
    ...input.auction.map(line),
    ...(play
      ? [
          "",
          `The contract is ${play.contractLabel}; ${play.declarer} declares, ${play.dummy} is dummy.`,
          ...(play.dummyHand ? [`Dummy's hand (public): ${handText(play.dummyHand)}`] : []),
          ...(play.tricks.length
            ? [
                "The play so far (completed tricks):",
                ...play.tricks.map(
                  (t, i) =>
                    `Trick ${i + 1}: ${t.plays
                      .map((p) => `${p.seat} ${cardLabel(p.card)}`)
                      .join(", ")}${t.winner ? ` — won by ${t.winner}` : ""}`,
                ),
              ]
            : []),
        ]
      : []),
    "",
    "State the reads for partner and for each opponent whose calls (and plays) say something, plus the inferences.",
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
    console.error(`[coach] state-reads call failed (status ${e?.status ?? "none"}): ${e?.message ?? err}`);
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
  return { reads: validateReads(parsed) };
}

/**
 * The gate, pure and exported: keep only claims that pass their bounds.
 * A bad claim is dropped ALONE — one silly number must not cost the whole
 * read the way a leak costs a hint ladder, because nothing here is secret;
 * it is only more or less sane.
 */
export function validateReads(raw: unknown): Reads {
  const out: Reads = {};
  if (typeof raw !== "object" || raw === null) return out;
  const r = raw as { partner?: unknown; opponents?: unknown };

  const seatRead = (v: unknown): SeatRead | undefined => {
    if (typeof v !== "object" || v === null) return undefined;
    const o = v as SeatRead;
    const read: SeatRead = {};
    const min = o.points?.min;
    const max = o.points?.max;
    const okN = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
    if (o.points && (okN(min) || okN(max))) {
      const lo = okN(min) ? Math.max(0, Math.round(min)) : undefined;
      const hi = okN(max) ? Math.min(40, Math.round(max)) : undefined;
      if ((lo === undefined || hi === undefined || lo <= hi) && (lo !== undefined || hi !== undefined)) {
        read.points = { ...(lo !== undefined ? { min: lo } : {}), ...(hi !== undefined ? { max: hi } : {}) };
      }
    }
    if (Array.isArray(o.suits)) {
      const suits = o.suits
        .filter(
          (s): s is { suit: string; min: number } =>
            typeof s === "object" && s !== null &&
            typeof (s as { suit?: unknown }).suit === "string" &&
            okN((s as { min?: unknown }).min),
        )
        .map((s) => ({ suit: s.suit.toUpperCase().trim(), min: Math.round(s.min) }))
        .filter((s) => (SUITS as readonly string[]).includes(s.suit) && s.min >= 4 && s.min <= 13)
        .slice(0, 4);
      if (suits.length) read.suits = suits;
    }
    if (typeof o.because === "string" && o.because.trim()) {
      read.because = o.because.trim().slice(0, 260);
    }
    return read.points || read.suits ? read : undefined;
  };

  const partner = seatRead(r.partner);
  if (partner) out.partner = partner;

  if (Array.isArray(r.opponents)) {
    const opps = r.opponents
      .map((o) => {
        if (typeof o !== "object" || o === null) return null;
        const seat = String((o as { seat?: unknown }).seat ?? "").toUpperCase().trim();
        if (!["N", "E", "S", "W"].includes(seat)) return null;
        const read = seatRead(o);
        return read ? { seat, read } : null;
      })
      .filter((o): o is { seat: string; read: SeatRead } => o !== null);
    if (opps.length) out.opponents = opps;
  }

  // Inferences: strings trimmed and capped, the pane must be real, and the
  // whole list is bounded — four total, two per pane — so a chatty answer
  // can't crowd the panes it files into.
  const inf = (raw as { inferences?: unknown }).inferences;
  if (Array.isArray(inf)) {
    const perPane: Record<string, number> = {};
    const kept: Inference[] = [];
    for (const i of inf) {
      if (kept.length >= 4) break;
      if (typeof i !== "object" || i === null) continue;
      const o = i as { clue?: unknown; conclusion?: unknown; because?: unknown; pane?: unknown };
      const pane = String(o.pane ?? "").toLowerCase().trim();
      if (pane !== "partner" && pane !== "theirs" && pane !== "advanced") continue;
      const clue = typeof o.clue === "string" ? o.clue.trim().slice(0, 56) : "";
      const conclusion = typeof o.conclusion === "string" ? o.conclusion.trim().slice(0, 32) : "";
      if (!clue || !conclusion) continue;
      if ((perPane[pane] ?? 0) >= 2) continue;
      perPane[pane] = (perPane[pane] ?? 0) + 1;
      kept.push({
        clue,
        conclusion,
        pane,
        ...(typeof o.because === "string" && o.because.trim()
          ? { because: o.because.trim().slice(0, 260) }
          : {}),
      });
    }
    if (kept.length) out.inferences = kept;
  }
  return out;
}

const OWLEE_READ = "Owlee's read of the auction — standard methods, no system notes.";

const rangeText = (p: { min?: number; max?: number }): string =>
  p.min !== undefined && p.max !== undefined
    ? p.min === p.max
      ? String(p.min)
      : `${p.min}–${p.max}`
    : p.min !== undefined
      ? `${p.min}+`
      : `≤${p.max}`;

/**
 * The validated reads, composed into Position cards — plus the deterministic
 * cards that need no model at all: each seat's LAST BID (raw auction fact),
 * the partnership's combined points (my hand + partner's read), and the fit
 * (partner's promised length + my own). Groups match the Position panes.
 */
export function readsToCards(
  reads: Reads,
  input: {
    auction: readonly { seat: Seat; call: Call }[];
    seat: Seat;
    hand: readonly Card[];
  },
): KnownCard[] {
  const out: KnownCard[] = [];
  const partner = partnerOf(input.seat);
  const lastBidOf = (s: Seat) =>
    [...input.auction].reverse().find((a) => a.seat === s && a.call !== "P");

  // ── partner ──────────────────────────────────────────────────────────────
  const pBid = lastBidOf(partner);
  if (pBid) {
    out.push({
      group: "partner",
      title: "Partner bid",
      value: callLabel(pBid.call),
      detail: reads.partner?.because ?? OWLEE_READ,
    });
  }
  if (reads.partner?.points) {
    out.push({
      group: "partner",
      title: "Partner's points",
      value: rangeText(reads.partner.points),
      detail: `${reads.partner.because ?? OWLEE_READ}`,
    });
  }
  if (reads.partner?.suits?.length) {
    out.push({
      group: "partner",
      title: "Partner's suits",
      value: reads.partner.suits.map((s) => `${s.min}+ ${GLYPH[s.suit as Suit]}`).join("  "),
      detail: reads.partner.because ?? OWLEE_READ,
    });
  }

  // ── partnership: OUR arithmetic on top of the model's partner range ─────
  const mine = hcp([...input.hand]);
  if (reads.partner?.points?.min !== undefined) {
    const max = reads.partner.points.max;
    out.push({
      group: "partnership",
      title: "Together",
      value: `${mine + reads.partner.points.min}${max !== undefined ? `–${mine + max}` : "+"}`,
      detail: `Your ${mine} plus partner's read of ${rangeText(reads.partner.points)}.`,
    });
  }
  let fit: { suit: Suit; count: number } | null = null;
  for (const s of reads.partner?.suits ?? []) {
    const together = s.min + input.hand.filter((c) => c.suit === s.suit).length;
    if (together >= 8 && (!fit || together > fit.count)) fit = { suit: s.suit as Suit, count: together };
  }
  if (fit) {
    out.push({
      group: "partnership",
      title: "A fit",
      value: `${fit.count}+ ${GLYPH[fit.suit]}`,
      detail: `Partner's read length plus your own ${SUIT_WORD[fit.suit]}s make at least ${fit.count} — eight together is the usual bar.`,
    });
  }

  // ── the opponents ────────────────────────────────────────────────────────
  for (const opp of [step(input.seat, 1), step(input.seat, 3)]) {
    const who = Relative(opp, input.seat);
    const read = reads.opponents?.find((o) => o.seat === opp)?.read;
    const oBid = lastBidOf(opp);
    if (oBid) {
      out.push({
        group: "theirs",
        title: `${who} bid`,
        value: callLabel(oBid.call),
        detail: read?.because ?? OWLEE_READ,
      });
    }
    if (read?.points) {
      out.push({
        group: "theirs",
        title: `${who}'s points`,
        value: rangeText(read.points),
        detail: read.because ?? OWLEE_READ,
      });
    }
    if (read?.suits?.length) {
      out.push({
        group: "theirs",
        title: `${who}'s suits`,
        value: read.suits.map((s) => `${s.min}+ ${GLYPH[s.suit as Suit]}`).join("  "),
        detail: read.because ?? OWLEE_READ,
      });
    }
  }

  // ── the inferences: the CLUE is the seal, the CONCLUSION is inside ──────
  // (owner direction 2026-08-15: the learner should get to finish the
  // thought before opening — the envelope mechanism already does exactly
  // that with title-on-the-seal, value-inside.)
  for (const inf of reads.inferences ?? []) {
    out.push({
      group: inf.pane,
      title: inf.clue,
      value: inf.conclusion,
      detail: inf.because ?? OWLEE_READ,
    });
  }

  return out;
}
