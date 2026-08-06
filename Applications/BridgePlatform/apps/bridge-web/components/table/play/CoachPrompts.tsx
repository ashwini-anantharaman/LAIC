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
// WHERE THE MODEL SITS (owner decision 2026-08-05): behind the ANSWER, not behind
// the reasoning.
//
// "What should I play?" calls /api/bridge/play-hint for the card, then
// /api/bridge/play-why for the reason. Two requests on purpose: the card lands
// immediately and the explanation catches up, so nothing useful waits on a model.
// The model may only explain the card an authority already chose — and it is
// never asked when the double-dummy search is the adviser, because that reason IS
// the hidden hands and no honest sentence can be written from the learner's side.
//
// "Help me think" is deterministic, end to end. No model, no network: the facts
// and the realistic choices are computed server-side in lib/coach/think.ts and
// handed down as a prop, so tapping it answers on the tick it is pressed and
// cannot fail. That is the point of it — one button that cannot be wrong, and one
// that can be explained.
//
// The auction's "What should I bid?" is still a surface only, and says so.

import { useEffect, useState } from "react";
import type { PlayExplanation } from "@/lib/coach/model";
import type { ThinkAid } from "@/lib/coach/think";

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
const RED_INK = "#c00";

/**
 * The coach's voice: one serif face for everything it SAYS, so the reason, the
 * why-not line and the tie note read as one person talking.
 *
 * They were three different faces and three different sizes — the main reason in
 * Georgia and the two lines under it in the app's Arial, which made a single
 * thought look like three unrelated remarks. Size carries the hierarchy now;
 * family and colour carry who is speaking.
 */
const SAYS = {
  margin: 0,
  fontFamily: "Georgia, 'Times New Roman', serif",
  lineHeight: 1.5,
} as const;

/** A card inside prose: "10♦", "K♠". Captured so the split keeps them. */
const CARD_IN_PROSE = /((?:10|[2-9AKQJ])[♠♥♦♣])/g;

/**
 * Prose with its suit symbols coloured — red for hearts and diamonds, black for
 * spades and clubs, as every printed hand diagram has done for a century.
 *
 * This is not decoration. At body-text size in a serif face, ♦ and ♠ are close
 * enough that a reader genuinely cannot tell which one a sentence named — a real
 * reader asked "why is it saying 9 spade?" of a sentence about a diamond. Colour
 * makes the suit unmistakable at a glance and costs nothing.
 */
function SuitText({ children }: Readonly<{ children: string }>) {
  return (
    <>
      {children.split(CARD_IN_PROSE).map((part, i) =>
        CARD_IN_PROSE.test(part) && RED.has(part.slice(-1)) ? (
          <span key={i} style={{ color: RED_INK, fontWeight: 600 }}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** "DT" → "10♦". The engine's notation, in the table's. */
function cardText(card: string): { rank: string; suit: string } {
  const rank = card.slice(1) === "T" ? "10" : card.slice(1);
  return { rank, suit: SUIT_GLYPH[card[0] ?? ""] ?? card[0] ?? "" };
}

type Hint = {
  best: string[];
  /** Which of several tied cards to play. Convention's choice, not the solver's. */
  prefer?: string;
  source: "system" | "convention" | "solution";
  because?: string;
  corroborated?: boolean;
  contradicted?: boolean;
};

type Answer =
  | { kind: "loading" }
  | { kind: "done"; hint: Hint; why?: PlayExplanation; whyPending?: boolean }
  | { kind: "empty"; reason: string }
  | { kind: "pending"; what: string; will: string }
  | { kind: "think"; aid: ThinkAid };

export type TablePhase = "auction" | "play" | "other";

export function CoachPrompts({
  sessionId,
  phase,
  active,
  aid,
}: Readonly<{
  sessionId: string;
  phase: TablePhase;
  /** Is this actually the learner's decision right now? */
  active: boolean;
  /**
   * The reasoning scaffold, computed on the server. Present means "Help me think"
   * answers with no request at all; absent means there is nothing to scaffold —
   * a watcher, or between boards.
   */
  aid?: ThinkAid | null;
}>) {
  const [answer, setAnswer] = useState<Answer | null>(null);

  const tellLabel = phase === "auction" ? "What should I bid?" : "What should I play?";

  // PREFETCH ON OPEN. The sheet mounts this component only when the learner opens
  // the coach, and opening it mid-play is the strongest signal available that a
  // question is coming. The model call is output-bound and takes seconds; nothing
  // client-side can shorten it, so the remaining lever is starting it before the
  // click. By the time a finger reaches "What should I play?", the server-side
  // cache usually holds the finished explanation and the click gets it for the
  // price of a round trip.
  //
  // WHAT THIS SPENDS, stated plainly: one model call per sheet-open on the
  // learner's turn where they never click. The server bounds the waste — the route
  // runs the solver first and only reaches the model when there is genuinely an
  // answer for this learner right now, which is the same call the click would have
  // made. A prefetch racing an actual click does NOT double-spend: the route
  // single-flights identical requests, so the click joins the prefetch's call.
  //
  // Fires once per open, deliberately not per position: the sheet covers the felt,
  // so it is closed during actual play, and re-arming on every turn would spend a
  // call per trick for a sheet someone left open.
  useEffect(() => {
    if (phase !== "play") return;
    void fetch(`/api/bridge/play-why?sessionId=${encodeURIComponent(sessionId)}`).catch(() => {
      // Warming failed; the click will simply pay the full price it always used to.
    });
  }, []); // empty on purpose: once per open — see the comment above

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
    // BOTH REQUESTS LEAVE TOGETHER. They used to be sequential — hint, then, once
    // it had rendered, the explanation — which reads naturally and wastes the
    // hint's entire round trip: `play-why` recomputes the advice server-side from
    // the session record (it trusts nothing the client learned), so it depends on
    // no part of the hint response. The model call is the long pole at several
    // seconds; starting it a round-trip earlier is the one client-side saving
    // available, and it costs nothing when the hint comes back empty — the
    // explanation of a position with no answer is `null` either way.
    //
    // The card still renders the moment IT arrives. The explanation attaches when
    // it lands, or silently doesn't — a flourish that failed to arrive, never an
    // error a learner should see.
    const whyRequest = fetch(`/api/bridge/play-why?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json() as Promise<{ explanation?: PlayExplanation | null }>)
      .catch(() => ({ explanation: null }));
    try {
      // The client sends only a session id: the seat and the hand come from the
      // session record server-side, so a crafted request cannot ask about
      // somebody else's cards.
      const res = await fetch(`/api/bridge/play-hint?sessionId=${encodeURIComponent(sessionId)}`);
      const body = (await res.json()) as { hint?: Hint | null; reason?: string };
      if (!body.hint?.best?.length) {
        setAnswer({ kind: "empty", reason: body.reason ?? "no answer" });
        return;
      }
      const hint = body.hint;
      setAnswer({ kind: "done", hint, whyPending: true });
      void whyRequest.then((why) => {
        setAnswer((prev) =>
          prev?.kind === "done" && prev.hint === hint
            ? { kind: "done", hint, whyPending: false, ...(why.explanation ? { why: why.explanation } : {}) }
            : prev,
        );
      });
    } catch {
      setAnswer({ kind: "empty", reason: "unreachable" });
    }
  }

  function think() {
    // No fetch, ever. The scaffold arrived with the page, so this answers on the
    // tick it is pressed and has no failure mode to design around.
    if (aid) return setAnswer({ kind: "think", aid });
    setAnswer({
      kind: "pending",
      what: "Nothing to work through here.",
      will: "Take a seat and wait for a decision that is yours, and this will lay the position out.",
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {answer && (
        <AnswerBlock
          answer={answer}
          {...(answer.kind === "done" && answer.why ? { why: answer.why } : {})}
          whyPending={answer.kind === "done" && Boolean(answer.whyPending)}
        />
      )}

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
function AnswerBlock({
  answer, why, whyPending,
}: Readonly<{ answer: Answer; why?: PlayExplanation; whyPending: boolean }>) {
  if (answer.kind === "loading") {
    return (
      <p style={{ margin: 0, fontSize: 13.5, color: MUTED, fontStyle: "italic" }}>
        Working it out — a few seconds…
      </p>
    );
  }

  if (answer.kind === "think") return <ThinkBlock aid={answer.aid} />;

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
        {/* ONE CHIP WHERE CONVENTION CAN CHOOSE. Three interchangeable cards is a
            true statement and useless instruction: a learner who picks the J♣ off
            the row has spent a higher card for nothing, and "take your pick" is not
            a habit anybody can carry to the next hand. Bridge already answers it —
            play the cheapest card that does the job — so the row leads with that one
            and the tie survives in the `equivalent` line underneath.

            The tie is still shown in full when convention CANNOT choose: on lead,
            where a touching sequence is led from the top, and across suits, where a
            discard is real judgement. See `preferOf` in advise.ts. */}
        {(hint.prefer ? [hint.prefer] : hint.best).map((card) => {
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
      {/* THE REASON. The model's rewrite when it arrived, the authority's own
          wording when it did not — the authority's is always true, just written
          for whoever reviews the rulebook rather than for a player. */}
      {why ? (
        <p style={{ ...SAYS, fontSize: 14, color: INK }}>
          <SuitText>{why.why}</SuitText>
        </p>
      ) : hint.because ? (
        <p style={{ ...SAYS, fontSize: 13.5, color: MUTED }}>
          <SuitText>{hint.because}</SuitText>
        </p>
      ) : null}

      {/* Why NOT the other card — beside the card it is about, rather than
          underneath the ones that survived. */}
      {why?.notThis?.map((n) => (
        <p key={n.label} style={{ ...SAYS, fontSize: 13.5, color: MUTED }}>
          <span style={{ fontWeight: 700, color: INK }}>
            not <SuitText>{n.label}</SuitText>
          </span>
          {" — "}
          <SuitText>{n.why}</SuitText>
        </p>
      ))}

      {/* The authority offered several and cannot separate them. Said plainly
          rather than left as two chips with no explanation of why there are two. */}
      {why?.equivalent && (
        <p style={{ ...SAYS, fontSize: 13, color: FAINT }}>
          <SuitText>{why.equivalent}</SuitText>
        </p>
      )}

      {whyPending && (
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: FAINT, fontStyle: "italic" }}>
          Putting that into plainer words…
        </p>
      )}
      {/* WHERE THE ANSWER CAME FROM, and whether the other authority agrees.
          Reordered along with the advice itself: the solver leads now, so the line
          reads "worked out from the full deal" first and the guideline's opinion
          second. Agreement is reassurance; disagreement is the interesting case,
          and it is the one worth reading, because a guideline that dissents is
          telling you what you could have reasoned to without seeing the deal.

          THE DISSENTING CARD IS STILL NOT SHOWN. Two answers to "what should I
          play?" is not an answer, and it is the disagreement rather than the other
          card that teaches. */}
      {(hint.corroborated || hint.contradicted || hint.source === "solution") && (
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4 }}>
          {hint.source === "solution" && (
            <span style={{ color: FAINT }}>Worked out from the full deal. </span>
          )}
          {hint.corroborated && (
            <span style={{ color: TEAL }}>
              {hint.source === "solution" ? "Your guidelines agree." : "The cards agree."}
            </span>
          )}
          {hint.contradicted && (
            <span style={{ color: AMBER }}>
              {hint.source === "solution"
                ? "Your guidelines would play something else here."
                : "Though the cards lie badly for it here."}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * The scaffold: what can be worked out, then the choices.
 *
 * Candidates render in the order given and are styled identically. That is
 * load-bearing rather than lazy — any visual or positional difference between
 * them reads as a recommendation, and a learner picks up that tell faster than
 * they pick up the position. The point of this button is that it does not answer.
 */
function ThinkBlock({ aid }: Readonly<{ aid: ThinkAid }>) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      {aid.known.length > 0 && (
        <div>
          <Head>What you can work out</Head>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
            {aid.known.map((line) => (
              <li key={line} style={{ position: "relative", paddingLeft: 13, fontSize: 13.5, lineHeight: 1.45, color: INK }}>
                <span aria-hidden style={{ position: "absolute", left: 0, top: 0, color: TEAL, fontWeight: 700 }}>
                  &middot;
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      {aid.candidates.length > 0 && (
        <div>
          <Head>Your realistic choices</Head>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
            {aid.candidates.map((c) => (
              <li key={c.label} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13.5, lineHeight: 1.45 }}>
                <span style={{ flex: "none", minWidth: 42, fontWeight: 700, color: INK }}>{c.label}</span>
                {c.note ? <span style={{ color: FAINT }}>{c.note}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {aid.noChoice && (
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, color: MUTED }}>{aid.noChoice}</p>
      )}

      {/* No model here, so nothing to apologise for and nothing to wait on. If the
          learner wants the answer rather than the position, the other button is
          right there. */}
    </div>
  );
}

function Head({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
        textTransform: "uppercase", color: FAINT, marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}
