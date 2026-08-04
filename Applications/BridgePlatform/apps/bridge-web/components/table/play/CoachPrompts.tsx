"use client";

// The coach's two buttons — the whole coaching surface at the table.
//
// OWNER DECISION 2026-08-04: the coach is these two prompts and nothing else.
// It does not volunteer. It does not grade every card. It waits to be asked.
//
//   · "Help me think"        — the position, without the answer in it.
//   · "What should I play?"  — the answer, because you asked for it.
//
// The pair is the point. We had a hint ladder that decided FOR the learner
// whether they were ready to be told, built on thresholds picked by feel, and it
// was removed for exactly that reason (see notes.ts REVEAL_LEVEL). Two buttons
// put that choice back where it belongs: the learner says whether they want to
// be guided or told, and neither one is the coach's guess about them.
//
// Unprompted notes still exist and still work — the panel renders them, the
// evaluation panel still produces them — but they are off at the table now,
// behind `?coach=notes`. Judging every action produced 34 approvals for every 6
// corrections, and a surface that speaks 40 times a board is not read by trick
// four.
//
// WIRING STATUS. "What should I play?" is real: it calls /api/bridge/play-hint,
// which runs the assessor panel — your knowledge base first, a named guideline
// next, a double-dummy search last — and reports which of the three answered.
// "Help me think" and the auction's "What should I bid?" are surfaces only; each
// says what it will do rather than pretending to do it. Nothing here fabricates
// an answer, which matters more than either button being finished.

import { useState } from "react";

// The table's own palette, as CoachPanel uses it.
const HEAD = "#f2f2ea";
const LINE = "#8a8a6a";
const INK = "#2b2b1e";
const MUTED = "#57573f";
const FAINT = "#7d7d66";
const TEAL = "#1f5e56";
const AMBER = "#9c5a12";

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RED = new Set(["♥", "♦"]);

/** "DT" → "10♦". The engine's notation, in the table's. */
function cardText(card: string): { rank: string; suit: string } {
  const rank = card.slice(1) === "T" ? "10" : card.slice(1);
  return { rank, suit: SUIT_GLYPH[card[0] ?? ""] ?? card[0] ?? "" };
}

type Hint = {
  best: string[];
  source: "system" | "convention" | "solution";
  because?: string;
  corroborated?: boolean;
  contradicted?: boolean;
};

type Answer =
  | { kind: "loading" }
  | { kind: "done"; hint: Hint }
  | { kind: "empty"; reason: string }
  | { kind: "pending"; what: string; will: string };

export type TablePhase = "auction" | "play" | "other";

export function CoachPrompts({
  sessionId,
  phase,
  active,
}: Readonly<{
  sessionId: string;
  phase: TablePhase;
  /** Is this actually the learner's decision right now? */
  active: boolean;
}>) {
  const [answer, setAnswer] = useState<Answer | null>(null);

  const tellLabel = phase === "auction" ? "What should I bid?" : "What should I play?";

  async function tell() {
    // The auction has no hint endpoint yet. Say so rather than calling the play
    // route and rendering its "only during the play" refusal as if it were an
    // answer about bidding.
    if (phase === "auction") {
      setAnswer({
        kind: "pending",
        what: "Bidding advice isn't wired yet.",
        will:
          "It will name the call your system makes here and say what it shows — the same three authorities as the card advice, and the same honesty about which one answered.",
      });
      return;
    }
    setAnswer({ kind: "loading" });
    try {
      // The client sends only a session id: the seat and the hand come from the
      // session record server-side, so a crafted request cannot ask about
      // somebody else's cards.
      const res = await fetch(`/api/bridge/play-hint?sessionId=${encodeURIComponent(sessionId)}`);
      const body = (await res.json()) as { hint?: Hint | null; reason?: string };
      setAnswer(
        body.hint?.best?.length
          ? { kind: "done", hint: body.hint }
          : { kind: "empty", reason: body.reason ?? "no answer" },
      );
    } catch {
      setAnswer({ kind: "empty", reason: "unreachable" });
    }
  }

  function think() {
    setAnswer({
      kind: "pending",
      what: "Not wired yet.",
      will:
        phase === "auction"
          ? "It will lay out what partner's bidding has told you, what your hand is worth, and what the question in front of you actually is — without naming a call."
          : "It will lay out what's known — the cards played, what the bidding implied, what your hand can still do — and pose the question the trick turns on, without naming a card.",
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {answer && <AnswerBlock answer={answer} />}

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        <Prompt onClick={think} disabled={!active} primary>
          Help me think
        </Prompt>
        <Prompt onClick={tell} disabled={!active || answer?.kind === "loading"}>
          {tellLabel}
        </Prompt>
      </div>

      {/* Why the buttons are dead, when they are. A disabled control with no
          reason reads as a broken one. */}
      {!active && (
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, color: FAINT }}>
          {phase === "other"
            ? "Between boards — nothing to decide yet."
            : "Waiting for your turn."}
        </p>
      )}
    </div>
  );
}

function Prompt({
  children, onClick, disabled, primary = false,
}: Readonly<{ children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: "1 1 auto", minWidth: 132, minHeight: 42, padding: "10px 14px",
        background: primary && !disabled ? TEAL : HEAD,
        borderWidth: 1, borderStyle: "solid", borderColor: primary && !disabled ? TEAL : LINE,
        borderRadius: 8, color: primary && !disabled ? "#fff" : TEAL,
        fontSize: 14, fontWeight: 700, fontFamily: "inherit", lineHeight: 1.2,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

/**
 * The answer, with room to be read.
 *
 * THREE AUTHORITIES, THREE DIFFERENT CLAIMS, and the wording has to track which
 * one spoke. Your own agreement, a general maxim, and a calculation over cards
 * you cannot see are not interchangeable; collapsing them into one confident
 * phrase is how a heuristic gets presented as a fact. The calculation also
 * agrees or dissents separately — "your system says this, the cards say
 * otherwise" is worth showing rather than resolving.
 */
function AnswerBlock({ answer }: Readonly<{ answer: Answer }>) {
  if (answer.kind === "loading") {
    return (
      <p style={{ margin: 0, fontSize: 13.5, color: MUTED, fontStyle: "italic" }}>
        Working it out — a few seconds…
      </p>
    );
  }

  if (answer.kind === "pending") {
    return (
      <div style={{ borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: LINE, paddingLeft: 10 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: INK }}>{answer.what}</p>
        <p style={{ margin: "3px 0 0", fontSize: 13, lineHeight: 1.45, color: MUTED }}>{answer.will}</p>
      </div>
    );
  }

  if (answer.kind === "empty") {
    // The panel reports WHY it is silent, so the reason is passed through rather
    // than guessed at. Inventing a card would be worse than saying nothing, and
    // saying nothing without a reason reads as broken.
    const text =
      answer.reason === "not your turn"
        ? "Not your turn."
        : answer.reason === "not playing"
          ? "Only during the play."
          : /^(your|no|too)/.test(answer.reason)
            ? `No suggestion — ${answer.reason}.`
            : "No suggestion for this position.";
    return <p style={{ margin: 0, fontSize: 13.5, color: MUTED, fontStyle: "italic" }}>{text}</p>;
  }

  const { hint } = answer;
  // "Your system plays" is a fact about your agreements; "usually right" is a
  // hedge; "by calculation" says plainly that the answer came from working the
  // deal out rather than from anything you could have deduced — which is exactly
  // what a learner needs to know about it.
  const lead =
    hint.source === "system"
      ? "Your system plays"
      : hint.source === "convention"
        ? "Usually right here"
        : "By calculation";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>{lead}</span>
        {hint.best.map((card) => {
          const { rank, suit } = cardText(card);
          return (
            <span
              key={card}
              style={{
                padding: "3px 9px", background: "#fff",
                borderWidth: 1, borderStyle: "solid", borderColor: LINE, borderRadius: 4,
                fontSize: 17, fontWeight: 700, lineHeight: 1.1,
                color: RED.has(suit) ? "#c00" : "#000",
              }}
            >
              {rank}
              {suit}
            </span>
          );
        })}
      </div>
      {hint.because && (
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, color: MUTED }}>{hint.because}</p>
      )}
      {/* The calculation's verdict on the advice — agreement is reassurance,
          disagreement is the interesting case. The card it prefers is NOT shown:
          naming it would make the solver the adviser through the back door, and
          its choice is the one you could not have reasoned your way to. */}
      {(hint.corroborated || hint.contradicted || hint.source === "solution") && (
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4 }}>
          {hint.corroborated && <span style={{ color: TEAL }}>The cards agree.</span>}
          {hint.contradicted && <span style={{ color: AMBER }}>Though the cards lie badly for it here.</span>}
          {hint.source === "solution" && (
            <span style={{ color: FAINT }}>{hint.corroborated || hint.contradicted ? " " : ""}Worked out from the full deal.</span>
          )}
        </p>
      )}
    </div>
  );
}
