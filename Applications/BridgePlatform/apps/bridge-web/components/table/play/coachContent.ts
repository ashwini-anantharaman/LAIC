// His brain, our body — the coach's LAYERED content, expressed as the lines and
// actions OUR CoachPanel (packages/bridge-table-ui) draws.
//
// The old-path table carried the coach as a felt fab + a rising sheet with its
// own tabbed layout (CoachPrompts / CoachSheet, now deleted). Our shell reserves
// a panel under the phone-tier table that "renders whatever lines and actions it
// is handed" — so his three layers land here instead, each turned into a flat
// list of {text,color} lines plus the buttons that switch between them:
//
//   · "What am I looking at?"  — looking.ts facts, no authority in them.
//   · "Help me think"          — think.ts scaffold, deterministic, no network.
//   · "What should I play?"     — /api/bridge/play-hint, on demand (his advice).
//
// looking/think are computed SERVER-SIDE (lib/coach) and handed down as data;
// the hint is fetched when asked. All three are pure-data → lines here, so the
// panel stays presentational and the host keeps owning the content.

import type { CoachLine, CoachAction } from "@bridge/table-ui";
import type { LookingAt } from "@/lib/coach/looking";
import type { ThinkAid } from "@/lib/coach/think";

// His table palette (the CoachPanel default ink is #28312c).
const INK = "#28312c";
const MUTED = "#57573f";
const FAINT = "#7d7d66";
const TEAL = "#1f5e56"; // your system / agreement
const AMBER = "#9c5a12"; // the cards dissent
const REDINK = "#c00";

/** The three coach layers the buttons switch between. */
export type CoachLayer = "looking" | "think" | "advice";

/** The advice fetch (his "What should I play?" answer), as a plain state. */
export type CoachHint = {
  best: string[];
  source: "system" | "convention" | "solution";
  because?: string;
  corroborated?: boolean;
  contradicted?: boolean;
};
export type CoachAdvice =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; hint: CoachHint }
  | { kind: "empty"; reason: string }
  | { kind: "pending"; what: string; will: string };

/**
 * The server-computed coach payload for this board, from THIS learner's seat.
 * Serializable — no functions — so it crosses the server → client boundary as
 * data. `null` looking/think means there is nothing to reason from (a watcher).
 */
export interface CoachData {
  phase: "auction" | "play" | "other";
  /** Is this actually the learner's decision right now? */
  active: boolean;
  looking: LookingAt | null;
  think: ThinkAid | null;
}

const RED_SUITS = new Set(["♥", "♦"]);
const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

/** The engine's "DT" → "10♦", in the table's notation. */
function cardText(card: string): string {
  const rank = card.slice(1) === "T" ? "10" : card.slice(1);
  return `${rank}${SUIT_GLYPH[card[0] ?? ""] ?? card[0] ?? ""}`;
}

/** The tell button's label — his wording, by phase. */
export function tellLabel(phase: CoachData["phase"]): string {
  return phase === "auction" ? "What should I bid?" : "What should I play?";
}

/** The auction has no hint endpoint yet — his honest "not wired" message. */
export const AUCTION_ADVICE_PENDING: Extract<CoachAdvice, { kind: "pending" }> = {
  kind: "pending",
  what: "Bidding advice isn't wired yet.",
  will:
    "It will name the call your system makes here and say what it shows — the same authorities as the card advice, and the same honesty about which one answered.",
};

/** A short uppercase status for the panel header: which layer, and whose turn. */
export function coachStatus(data: CoachData, layer: CoachLayer): string {
  const which = layer === "looking" ? "Looking" : layer === "think" ? "Thinking" : "Hint";
  if (!data.looking) return "Watching";
  return data.active ? which : `${which} · waiting`;
}

/** The layer's content as CoachPanel lines. */
export function coachLines(
  data: CoachData,
  layer: CoachLayer,
  advice: CoachAdvice,
): CoachLine[] {
  if (!data.looking) return []; // watcher → the panel's honest empty state.

  if (layer === "looking") return lookingLines(data.looking);
  if (layer === "think") return thinkLines(data.think);
  return adviceLines(advice);
}

function lookingLines(looking: LookingAt): CoachLine[] {
  const out: CoachLine[] = [{ text: looking.looking, color: INK }];
  if (looking.facts.length) {
    const facts = looking.facts
      .map((f) => (f.label ? `${f.value} ${f.label}` : f.value))
      .join("  ·  ");
    out.push({ text: facts, color: MUTED });
  }
  return out;
}

function thinkLines(think: ThinkAid | null): CoachLine[] {
  if (!think) return [{ text: "Nothing to work through from here.", color: MUTED }];
  const out: CoachLine[] = [];

  if (think.known.length) {
    out.push({ text: "What you can work out", color: FAINT });
    for (const line of think.known) out.push({ text: `·  ${line}`, color: INK });
  }
  if (think.candidates.length) {
    out.push({ text: "Your realistic choices", color: FAINT });
    for (const c of think.candidates) {
      const tail = c.does ?? c.note;
      out.push({ text: tail ? `${c.label} — ${tail}` : c.label, color: INK });
    }
  }
  if (think.noChoice) out.push({ text: think.noChoice, color: MUTED });
  if (think.question) out.push({ text: think.question, color: INK });
  if (think.degraded) {
    out.push({
      text: "These are the facts. What each choice would do, and what the bidding promises, is the part still being built.",
      color: FAINT,
    });
  }
  return out;
}

function adviceLines(advice: CoachAdvice): CoachLine[] {
  switch (advice.kind) {
    case "idle":
      return [{ text: "Tap the question below and I'll give you the answer.", color: MUTED }];
    case "loading":
      return [{ text: "Working it out — a few seconds…", color: MUTED }];
    case "pending":
      return [
        { text: advice.what, color: INK },
        { text: advice.will, color: MUTED },
      ];
    case "empty":
      return [{ text: emptyText(advice.reason), color: MUTED }];
    case "done":
      return doneLines(advice.hint);
  }
}

function emptyText(reason: string): string {
  if (reason === "not your turn") return "Not your turn.";
  if (reason === "not playing") return "Only during the play.";
  if (reason === "not seated") return "Take a seat and it's yours to ask.";
  if (/^(your|no|too)/.test(reason)) return `No suggestion — ${reason}.`;
  return "No suggestion for this position.";
}

function doneLines(hint: CoachHint): CoachLine[] {
  const lead =
    hint.source === "system"
      ? "Your system plays"
      : hint.source === "convention"
        ? "Usually right here"
        : "By calculation";
  const cards = hint.best.map(cardText).join(" ");
  const cardColor = hint.best.some((c) => RED_SUITS.has(SUIT_GLYPH[c[0] ?? ""] ?? "")) ? REDINK : INK;

  const out: CoachLine[] = [{ text: `${lead}:  ${cards}`, color: cardColor }];
  if (hint.because) out.push({ text: hint.because, color: MUTED });

  // The calculation's verdict on the advice — agreement reassures, dissent is
  // the interesting case. The card it prefers is NOT named (that would make the
  // solver the adviser through the back door).
  const notes: string[] = [];
  if (hint.corroborated) notes.push("The cards agree.");
  if (hint.contradicted) notes.push("Though the cards lie badly for it here.");
  if (hint.source === "solution") notes.push("Worked out from the full deal.");
  if (notes.length) {
    out.push({ text: notes.join(" "), color: hint.contradicted ? AMBER : hint.corroborated ? TEAL : FAINT });
  }
  return out;
}

/**
 * The layer-switch buttons — his three prompts, expressed as CoachPanel actions.
 * `onLayer` selects looking/think; `onTell` fires the advice fetch. Absent when
 * there is nothing to reason from (a watcher gets no buttons, just the empty
 * state).
 */
export function coachActions(
  data: CoachData,
  handlers: { onLayer: (l: CoachLayer) => void; onTell: () => void },
): CoachAction[] {
  if (!data.looking) return [];
  return [
    { label: "What am I looking at?", on: () => handlers.onLayer("looking") },
    { label: "Help me think", on: () => handlers.onLayer("think") },
    { label: tellLabel(data.phase), on: handlers.onTell },
  ];
}
