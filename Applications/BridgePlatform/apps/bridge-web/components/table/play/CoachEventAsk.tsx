"use client";

// The coach panel's two interaction pieces (owner direction 2026-08-05):
//
//   · CoachEventAsk — the QUESTION BOX behind an event's "Ask" toggle. Free
//     text about that one event, answered by the model through
//     /api/bridge/event-qa. The server rebuilds everything from the session —
//     the client sends only ids and the question — and the model answers
//     blind to the concealed hands (lib/coach/eventQa.ts). Questions only:
//     the advice button is NOT in here, because an event row is something
//     that already happened and advice is about what happens next.
//   · WhatShouldIPlay — the advice for the CURRENT decision. No button any
//     more (owner direction 2026-08-11): the answer is prefetched the moment
//     the decision lands (coachPrefetch.ts) and this just shows it, so the
//     TELL screen opens onto the answer instead of onto a wait. Same two
//     endpoints as ever (play-hint for the card, play-why for the reason),
//     read through the shared client cache.
//
// A NEW FILE rather than a CoachPrompts variant, on purpose: CoachPrompts is
// mid-rework in another session, and this rendering is deliberately simpler —
// a chip and a sentence, not the full answer block. When CoachPrompts
// settles, the fetch plumbing here should fold into it.

import { useEffect, useState } from "react";

import { fetchPlayAdvice, type PlayHint } from "./coachPrefetch";

// The BirdBridge palette, as CoachPanel uses it (the app's theme.ts is the
// source of truth; the felt names are kept so usages map 1:1).
const PAPER = "#ffffff";
const INK = "#1f1f1f";
const MUTED = "#7b7466";
const FAINT = "#a49d8e";
const TEAL = "#105431"; // Brand.green
const FELT_DEEP = "#541015"; // Brand.maroon
const FELT_MID = "#105431"; // Brand.green — actions
const FELT_LINE = "#e0d7c2";
/** The stacked-edge shadow behind the app's playing cards. */
const CARD_EDGE = "0 2px 0 rgba(42,5,6,.75)";

/** The coach's voice — one serif face for everything it says. */
const SAYS = {
  margin: 0,
  fontFamily: "Georgia, 'Times New Roman', serif",
  lineHeight: 1.5,
} as const;

/** Text with ♥ and ♦ in red, as printed hand diagrams have them. */
function RedSuits({ children }: Readonly<{ children: string }>) {
  return (
    <>
      {children.split(/([♥♦])/).map((part, i) =>
        part === "♥" || part === "♦" ? (
          <span key={i} style={{ color: "#c00" }}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

type PlayAnswer =
  | { kind: "loading" }
  | { kind: "done"; hint: PlayHint; why?: string }
  | { kind: "empty"; reason: string };

/** "DT" → "10♦" in the table's notation. */
function cardText(card: string): string {
  const glyph: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
  const rank = card.slice(1) === "T" ? "10" : card.slice(1);
  return `${rank}${glyph[card[0] ?? ""] ?? card[0] ?? ""}`;
}

export function CoachEventAsk({
  sessionId,
  eventId,
  eventLabel,
  flush = false,
}: Readonly<{
  sessionId: string;
  eventId: string;
  /** "West led the A♠" — echoed as the placeholder so the box names its subject. */
  eventLabel: string;
  /** Drop the ledger-row indent — for hosts that already frame this box. */
  flush?: boolean;
}>) {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [qa, setQa] = useState<{ q: string; a: string } | { q: string; failed: true } | null>(null);

  async function ask() {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setQa(null);
    try {
      const res = await fetch("/api/bridge/event-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, eventId, question: q }),
      });
      const body = (await res.json()) as { answer?: string | null };
      setQa(body.answer ? { q, a: body.answer } : { q, failed: true });
    } catch {
      setQa({ q, failed: true });
    } finally {
      setAsking(false);
      setQuestion("");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: flush ? "2px 0 9px" : "2px 0 9px 29px" }}>
      {/* ── ask about this event ── */}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void ask();
          }}
          placeholder={`Ask about "${eventLabel}"…`}
          maxLength={300}
          style={{
            flex: 1, minWidth: 0, minHeight: 34, padding: "6px 10px",
            background: PAPER, borderWidth: 1, borderStyle: "solid", borderColor: FELT_LINE,
            borderRadius: 8, fontSize: 12.5, fontFamily: "inherit", color: INK,
          }}
        />
        <button
          type="button"
          onClick={() => void ask()}
          disabled={asking || !question.trim()}
          style={{
            flex: "none", minHeight: 34, padding: "6px 13px",
            background: asking || !question.trim() ? PAPER : FELT_MID,
            borderWidth: 1, borderStyle: "solid",
            borderColor: asking || !question.trim() ? FELT_LINE : FELT_MID,
            borderRadius: 8, color: asking || !question.trim() ? FAINT : "#fff",
            fontSize: 12.5, fontWeight: 700, fontFamily: "inherit",
            cursor: asking || !question.trim() ? "default" : "pointer",
          }}
        >
          Ask
        </button>
      </div>

      {asking && (
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED, fontStyle: "italic" }}>
          Thinking about it…
        </p>
      )}
      {qa && "a" in qa && (
        <div>
          <p style={{ margin: "0 0 3px", fontSize: 11.5, fontWeight: 700, color: FAINT }}>
            <RedSuits>{qa.q}</RedSuits>
          </p>
          <p
            style={{
              ...SAYS, fontSize: 13.5, color: MUTED, paddingLeft: 10,
              borderLeftWidth: 2, borderLeftStyle: "solid", borderLeftColor: FELT_LINE,
            }}
          >
            <RedSuits>{qa.a}</RedSuits>
          </p>
        </div>
      )}
      {qa && "failed" in qa && (
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED, fontStyle: "italic" }}>
          No answer for that one — try asking it another way.
        </p>
      )}
    </div>
  );
}

/**
 * The panel's chat: general questions about the position, no event required.
 * Same endpoint and same blindness as the per-event ask — each question is
 * answered independently against the current position (the coach holds no
 * conversation memory yet), but the exchanges stack up so the surface reads
 * as a conversation.
 */
export function CoachChat({
  sessionId,
  suggestions,
  chapter,
}: Readonly<{
  sessionId: string;
  /** Tap-to-ask starters (owner pick #3, 2026-08-14): a blank box paralyzes
   *  a learner who doesn't know what's askable. Shown until the first
   *  exchange — after that the conversation itself is the prompt. */
  suggestions?: readonly string[];
  /** Where the board is right now — "The auction", "Trick 4". The thread
   *  keeps the WHOLE board (owner pick #6, 2026-08-14: "as I asked
   *  earlier…" must work), and each exchange is stamped with its chapter so
   *  a quiet divider marks where one trick's questions end and the next
   *  begin. */
  chapter?: string;
}>) {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [exchanges, setExchanges] = useState<{ q: string; a: string | null; chapter?: string }[]>([]);

  async function ask(text?: string) {
    const q = (text ?? question).trim();
    if (!q || asking) return;
    setAsking(true);
    if (!text) setQuestion("");
    const stamp = chapter;
    try {
      const res = await fetch("/api/bridge/event-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, question: q }),
      });
      const body = (await res.json()) as { answer?: string | null };
      setExchanges((prev) => [...prev, { q, a: body.answer ?? null, ...(stamp ? { chapter: stamp } : {}) }]);
    } catch {
      setExchanges((prev) => [...prev, { q, a: null, ...(stamp ? { chapter: stamp } : {}) }]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {exchanges.map((x, i) => (
        <div key={i}>
          {i > 0 && x.chapter && x.chapter !== exchanges[i - 1]?.chapter && (
            <p
              style={{
                margin: "2px 0 7px", textAlign: "center",
                fontSize: 9.5, fontWeight: 700, letterSpacing: ".08em",
                textTransform: "uppercase", color: FAINT,
              }}
            >
              — {x.chapter} —
            </p>
          )}
          <p style={{ margin: "0 0 3px", fontSize: 11.5, fontWeight: 700, color: FAINT }}>
            <RedSuits>{x.q}</RedSuits>
          </p>
          <p
            style={{
              ...SAYS, fontSize: 13.5, paddingLeft: 10,
              color: x.a ? MUTED : FAINT,
              fontStyle: x.a ? undefined : "italic",
              borderLeftWidth: 2, borderLeftStyle: "solid", borderLeftColor: FELT_LINE,
            }}
          >
            {x.a ? <RedSuits>{x.a}</RedSuits> : "No answer for that one — try asking it another way."}
          </p>
        </div>
      ))}
      {asking && (
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED, fontStyle: "italic" }}>
          Thinking about it…
        </p>
      )}
      {exchanges.length === 0 && !asking && !!suggestions?.length && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void ask(s)}
              style={{
                minHeight: 30, padding: "5px 11px",
                background: PAPER, borderWidth: 1, borderStyle: "solid", borderColor: FELT_LINE,
                borderRadius: 15, color: FELT_DEEP,
                fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                cursor: "pointer", textAlign: "left",
              }}
            >
              <RedSuits>{s}</RedSuits>
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void ask();
          }}
          placeholder="Ask Owlee about this position…"
          maxLength={300}
          style={{
            flex: 1, minWidth: 0, minHeight: 36, padding: "6px 10px",
            background: PAPER, borderWidth: 1, borderStyle: "solid", borderColor: FELT_LINE,
            borderRadius: 8, fontSize: 12.5, fontFamily: "inherit", color: INK,
          }}
        />
        <button
          type="button"
          onClick={() => void ask()}
          disabled={asking || !question.trim()}
          style={{
            flex: "none", minHeight: 36, padding: "6px 14px",
            background: asking || !question.trim() ? PAPER : FELT_MID,
            borderWidth: 1, borderStyle: "solid",
            borderColor: asking || !question.trim() ? FELT_LINE : FELT_MID,
            borderRadius: 8, color: asking || !question.trim() ? FAINT : "#fff",
            fontSize: 12.5, fontWeight: 700, fontFamily: "inherit",
            cursor: asking || !question.trim() ? "default" : "pointer",
          }}
        >
          Ask
        </button>
      </div>
    </div>
  );
}

/**
 * The ⓘ popup's one honest line (owner direction 2026-08-14: no anatomy of
 * solvers or "by calculation" — the answer is OWLEE'S, spoken as Owlee, and
 * the small print is simply that an agent can be wrong).
 */
export const OWLEE_DISCLAIMER =
  "Owlee works this out for you, but its answer might not be entirely accurate — weigh it against your own reading of the position.";

/**
 * The advice for the decision ON the table — shown while it is the learner's
 * turn and BEFORE their card is played. Not part of any event row: a played
 * card is history, and "what should I play?" is a question about the future.
 *
 * Loads itself on mount, through the prefetch cache — the fetch usually
 * started when the decision landed, so mounting this mostly just reads the
 * answer. Keyed by the host on the board's epoch, so a new trick shows a
 * fresh answer, never last trick's.
 */
export function WhatShouldIPlay({
  sessionId,
  epoch = "now",
}: Readonly<{ sessionId: string; epoch?: string }>) {
  const [play, setPlay] = useState<PlayAnswer>({ kind: "loading" });
  // The ⓘ beside the answer's source line — where this came from, and why it
  // can differ from the realistic-choices scaffold above it.
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const advice = await fetchPlayAdvice(sessionId, epoch);
        if (!alive) return;
        setPlay(
          advice.hint
            ? { kind: "done", hint: advice.hint, ...(advice.why ? { why: advice.why } : {}) }
            : { kind: "empty", reason: advice.reason ?? "no answer" },
        );
      } catch {
        if (alive) setPlay({ kind: "empty", reason: "unreachable" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [sessionId, epoch]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {play.kind === "loading" && (
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED, fontStyle: "italic" }}>
          Working it out — a few seconds…
        </p>
      )}
      {play.kind === "empty" && (
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED, fontStyle: "italic" }}>
          {play.reason === "not your turn" ? "Not your turn." : "No suggestion for this position."}
        </p>
      )}
      {play.kind === "done" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {/* No mini-face here any more — in the Tell screen this whole
                answer sits inside Owlee's SPEECH BUBBLE (owner ask
                2026-08-15), and the avatar beside the bubble is the face. */}
            <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>
              Owlee plays
            </span>
            <button
              type="button"
              aria-label="About Owlee's answer"
              aria-expanded={infoOpen}
              onClick={() => setInfoOpen(true)}
              style={{
                flex: "none", width: 17, height: 17, padding: 0, borderRadius: "50%",
                background: "transparent", borderWidth: 1, borderStyle: "solid", borderColor: FELT_LINE,
                color: FELT_DEEP, fontSize: 10.5, fontWeight: 700, lineHeight: 1,
                fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic",
                cursor: "pointer",
              }}
            >
              i
            </button>
            {(play.hint.prefer ? [play.hint.prefer] : play.hint.best).map((card) => {
              const label = cardText(card);
              return (
                <span
                  key={card}
                  style={{
                    padding: "2px 8px", background: "#fff",
                    borderWidth: 1, borderStyle: "solid", borderColor: "#d8d3bf", borderRadius: 4,
                    boxShadow: CARD_EDGE,
                    fontSize: 14.5, fontWeight: 700, lineHeight: 1.2,
                    color: /[♥♦]/.test(label) ? "#c00" : "#000",
                  }}
                >
                  {label}
                </span>
              );
            })}
          </div>
          {(play.why ?? play.hint.because) && (
            <p style={{ ...SAYS, fontSize: 13, color: play.why ? INK : MUTED }}>
              <RedSuits>{play.why ?? play.hint.because ?? ""}</RedSuits>
            </p>
          )}
          {/* No "worked out from the full deal" small print any more — the
              same owner direction that retired "By calculation": the answer
              is Owlee's, and the ⓘ carries the honest caveat. */}
        </div>
      )}

      {/* ── the ⓘ popup: one line of honest small print ── */}
      {infoOpen && play.kind === "done" && (
        <div
          role="presentation"
          onClick={() => setInfoOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 950,
            background: "rgba(42,5,6,.45)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 18,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="About Owlee's answer"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 340, maxHeight: "80%", overflowY: "auto",
              background: PAPER, borderRadius: 12, padding: "13px 15px 15px",
              boxShadow: "0 8px 26px rgba(0,0,0,.35)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <span
                style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.7,
                  textTransform: "uppercase", color: FELT_DEEP,
                }}
              >
                Owlee
              </span>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                aria-label="Close"
                onClick={() => setInfoOpen(false)}
                style={{
                  flex: "none", width: 26, height: 26, borderRadius: 7,
                  background: "#f3ead4", borderWidth: 0, color: MUTED,
                  fontSize: 13, lineHeight: 1, cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
            <p style={{ ...SAYS, fontSize: 13.5, color: INK }}>{OWLEE_DISCLAIMER}</p>
          </div>
        </div>
      )}
    </div>
  );
}
