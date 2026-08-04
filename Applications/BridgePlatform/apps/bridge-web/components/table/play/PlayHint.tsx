"use client";

// "What should I play?" — the coach's one proactive affordance.
//
// Everything else the coach says is retrospective: you act, it judges. This is
// the other direction, and it exists because a learner mid-trick does not want a
// verdict later, they want to know now.
//
// It is a BUTTON and not automatic, for a measured reason: the double-dummy
// search behind it costs ~400ms at six cards a hand and ~3s at seven, growing
// about sevenfold per card. It cannot run on every render, and it cannot answer
// at all early in a hand — so the honest shape is "ask and wait", with a plain
// answer when the position is too deep to see.
//
// It gives away the answer, which is the opposite of the hint ladder's whole
// discipline. That is fine BECAUSE the learner asked: a ladder governs what the
// coach volunteers, not what it will tell you when you request it outright.
//
// THREE AUTHORITIES, THREE DIFFERENT CLAIMS, and the wording has to track which
// one spoke. Your own agreement, a general maxim, and a calculation over cards
// you cannot see are not interchangeable; collapsing them into one confident
// phrase is how a heuristic gets presented as a fact. The calculation also
// agrees or dissents separately — "your system says this, the cards say
// otherwise" is worth showing rather than resolving.

import { useState } from "react";

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RED = new Set(["♥", "♦"]);

/** "DT" → "10♦". The engine's notation, in the table's. */
function cardText(card: string): { rank: string; suit: string } {
  const rank = card.slice(1) === "T" ? "10" : card.slice(1);
  return { rank, suit: SUIT_GLYPH[card[0] ?? ""] ?? card[0] ?? "" };
}

export function PlayHint({ sessionId }: Readonly<{ sessionId: string }>) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | {
        kind: "done";
        best: string[];
        source: "system" | "convention" | "solution";
        because?: string;
        corroborated?: boolean;
        contradicted?: boolean;
      }
    | { kind: "empty"; reason: string }
  >({ kind: "idle" });

  async function ask() {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/bridge/play-hint?sessionId=${encodeURIComponent(sessionId)}`);
      const body = (await res.json()) as {
        hint?: {
          best: string[];
          source: "system" | "convention" | "solution";
          because?: string;
          corroborated?: boolean;
          contradicted?: boolean;
        } | null;
        reason?: string;
      };
      setState(
        body.hint?.best?.length
          ? { kind: "done", ...body.hint }
          : { kind: "empty", reason: body.reason ?? "no answer" },
      );
    } catch {
      setState({ kind: "empty", reason: "unreachable" });
    }
  }

  const chip = {
    padding: "1px 6px",
    background: "#f2f2ea",
    borderWidth: 1,
    borderStyle: "solid" as const,
    borderColor: "#8a8a6a",
    borderRadius: 3,
    fontSize: 11,
    fontWeight: 700,
  };

  if (state.kind === "idle") {
    return (
      <button type="button" onClick={ask} style={{ ...chip, color: "#1f5e56", cursor: "pointer", fontFamily: "inherit" }}>
        What should I play?
      </button>
    );
  }

  if (state.kind === "loading") {
    return (
      <span style={{ fontSize: 11, color: "#57573f", fontStyle: "italic" }}>
        Working it out — a few seconds…
      </span>
    );
  }

  if (state.kind === "empty") {
    return (
      <span style={{ fontSize: 11, color: "#57573f", fontStyle: "italic" }}>
        {/* The panel reports WHY it is silent, so the reason is passed through
            rather than guessed at. Inventing a card would be worse than saying
            nothing, and saying nothing without a reason reads as broken. */}
        {state.reason === "not your turn"
          ? "Not your turn."
          : state.reason === "not playing"
            ? "Only during the play."
            : /^(your|no|too)/.test(state.reason)
              ? // The panel's own reason, capitalised. Prefixed so it reads as a
                // reply to the question that was just asked rather than as a
                // remark about the note above it.
                `No suggestion — ${state.reason}.`
              : "No suggestion for this position."}
      </span>
    );
  }

  // Each authority gets its own words. "Your system plays" is a fact about your
  // agreements; "usually right" is a hedge; "by calculation" says plainly that
  // the answer came from working the deal out rather than from anything you could
  // have deduced — which is exactly what a learner needs to know about it.
  const lead =
    state.source === "system"
      ? "Your system plays:"
      : state.source === "convention"
        ? "Usually right here:"
        : "By calculation:";

  return (
    <span style={{ fontSize: 11, color: "#2b2b1e", display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      {lead}
      {state.best.map((card) => {
        const { rank, suit } = cardText(card);
        return (
          <span key={card} style={{ ...chip, color: RED.has(suit) ? "#c00" : "#000" }}>
            {rank}
            {suit}
          </span>
        );
      })}
      {state.because && (
        <span style={{ color: "#57573f", fontStyle: "italic" }}>{trim(state.because)}</span>
      )}
      {/* The calculation's verdict on the advice — agreement is reassurance,
          disagreement is the interesting case. The card it prefers is NOT shown:
          naming it would make the solver the adviser through the back door, and
          its choice is the one you could not have reasoned your way to. */}
      {state.corroborated && (
        <span style={{ color: "#1f5e56" }}>· the cards agree</span>
      )}
      {state.contradicted && (
        <span style={{ color: "#9c5a12" }}>· though the cards lie badly for it here</span>
      )}
      {state.source === "solution" && (
        <span style={{ color: "#8a8a6a" }}>· worked out from the full deal</span>
      )}
    </span>
  );
}

/** The strip is one line; an authored paragraph has to be cut to fit it. */
function trim(text: string): string {
  const clean = text.trim();
  if (clean.length <= 90) return clean;
  const cut = clean.slice(0, 90);
  const stop = cut.lastIndexOf(" ");
  return `${(stop > 40 ? cut.slice(0, stop) : cut).trimEnd()}…`;
}
