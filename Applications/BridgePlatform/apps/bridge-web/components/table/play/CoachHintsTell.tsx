"use client";

// The coach sheet's two newest screens (owner direction 2026-08-11):
//
//   · CoachHints — HINTS: five face-down hints for the decision on the table,
//     written by the model in one request (/api/bridge/play-hints) and opened
//     one at a time. The ladder is the design: hint 1 points at the question,
//     the middle rungs walk the reasoning, and only the last names the answer
//     — so the learner chooses how much help to take, and stopping early is a
//     win, not a miss. Nothing SHOWS until they ask, but the fetch no longer
//     waits for the first tap (owner direction 2026-08-11): the ladder is
//     written the moment the decision lands, through the shared prefetch
//     cache, so revealing is instant.
//   · CoachTell — TELL: the answers, side by side. The coach's own card
//     (WhatShouldIPlay, reused from CoachEventAsk — also prefetched, shown
//     without a button) and BEN's choice for the same decision
//     (/api/bridge/ben-tell), each labelled with who is talking. Two
//     authorities disagreeing is not a bug — it is the most instructive thing
//     this screen can show. BEN stays on-demand: a 20-45 second neural
//     simulation is not a cost to pay speculatively on every card.
//
// A NEW FILE rather than a CoachPrompts variant, same reasoning as
// CoachEventAsk: CoachPrompts is mid-rework in another session, and these
// screens are self-contained.

import { useCallback, useEffect, useState } from "react";

import { WhatShouldIPlay } from "./CoachEventAsk";
import { fetchHints } from "./coachPrefetch";

// The BirdBridge palette, as CoachPanel uses it (the app's theme.ts is the
// source of truth; the felt names are kept so usages map 1:1).
const PAPER = "#ffffff";
const INK = "#1f1f1f";
const MUTED = "#7b7466";
const FAINT = "#a49d8e";
const FELT_DEEP = "#541015"; // Brand.maroon
const FELT_MID = "#105431"; // Brand.green — actions
const FELT_SOFT = "#f6ead0";
const FELT_LINE = "#e0d7c2";
/** The stacked-edge shadow behind the app's playing cards. */
const CARD_EDGE = "0 2px 0 rgba(42,5,6,.75)";
/** BEN's badge blue — the same one CoachPanel's note badges wear. */
const BEN_BLUE = "#384bb3";

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

const CARD_STYLE = {
  padding: "2px 8px", background: "#fff",
  borderWidth: 1, borderStyle: "solid", borderColor: "#d8d3bf", borderRadius: 4,
  boxShadow: CARD_EDGE,
  fontSize: 14.5, fontWeight: 700, lineHeight: 1.2,
} as const;

/** The coach's voice — one serif face for everything it says. */
const SAYS = {
  margin: 0,
  fontFamily: "Georgia, 'Times New Roman', serif",
  lineHeight: 1.5,
} as const;

const SECTION = {
  background: PAPER, borderWidth: 1, borderStyle: "solid", borderColor: "#e8ddc3",
  borderRadius: 11, padding: "10px 12px",
} as const;

function SectionLabel({ children }: Readonly<{ children: string }>) {
  return (
    <div
      style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 0.7,
        textTransform: "uppercase", color: FELT_DEEP, marginBottom: 7,
      }}
    >
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   HINTS — five rungs, opened one at a time
   ════════════════════════════════════════════════════════════════════════════ */

const HINT_COUNT = 5;

/** "Hint 1" … "Hint 4", and the last rung says what it costs to open. */
const rungName = (i: number): string => (i === HINT_COUNT - 1 ? "The answer" : `Hint ${i + 1}`);

type HintsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; hints: string[] }
  | { kind: "empty"; reason: string };

export function CoachHints({
  sessionId,
  epoch,
  active,
}: Readonly<{
  sessionId: string;
  /** The board's current section — the prefetch cache's key for this decision. */
  epoch: string;
  /** It is the learner's decision right now — hints exist only then. */
  active: boolean;
}>) {
  const [state, setState] = useState<HintsState>({ kind: "idle" });
  // How many rungs are open. The ladder only goes down: opening hint 3 means
  // hints 1-2 stay open above it, and nothing ever re-locks.
  const [revealed, setRevealed] = useState(0);

  // The ladder is usually already written (prefetched when the decision
  // landed); this mostly just reads it out of the shared cache. When the
  // prefetch didn't happen or failed, this IS the fetch — same promise, same
  // key — and the rungs show the writing state until it lands.
  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const r = await fetchHints(sessionId, epoch);
      if (r.hints?.length === HINT_COUNT) {
        setState({ kind: "ready", hints: r.hints });
      } else {
        setState({ kind: "empty", reason: r.reason ?? "no answer" });
      }
    } catch {
      setState({ kind: "empty", reason: "unreachable" });
    }
  }, [sessionId, epoch]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  // Revealing never fetches any more — it only turns over the next rung.
  const reveal = () => setRevealed((n) => Math.min(n + 1, HINT_COUNT));

  if (!active) {
    return (
      <div style={SECTION}>
        <SectionLabel>Hints</SectionLabel>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: MUTED }}>
          Hints are for a decision that&rsquo;s in front of you — they&rsquo;ll be here when
          it&rsquo;s your turn.
        </p>
      </div>
    );
  }

  return (
    <div style={SECTION}>
      <SectionLabel>Hints</SectionLabel>
      <p style={{ margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.5, color: MUTED }}>
        Five hints for this decision, each giving away a little more. Open them one at a
        time — stopping early is the win.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {Array.from({ length: HINT_COUNT }, (_, i) => {
          const isOpen = state.kind === "ready" && i < revealed;
          const isNext =
            (state.kind === "ready" && i === revealed) || (state.kind !== "ready" && i === 0);
          const isAnswer = i === HINT_COUNT - 1;

          if (isOpen) {
            const hint = (state as { hints: string[] }).hints[i] ?? "";
            return (
              <div
                key={i}
                style={{
                  display: "flex", gap: 9, alignItems: "flex-start",
                  background: FELT_SOFT, borderRadius: 9, padding: "8px 10px",
                  borderWidth: 1, borderStyle: "solid", borderColor: "#e0cfa4",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    flex: "none", width: 20, height: 20, borderRadius: "50%", marginTop: 1,
                    background: isAnswer ? FELT_DEEP : FELT_MID, color: "#fff",
                    fontSize: 11, fontWeight: 700, lineHeight: "20px", textAlign: "center",
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block", fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6,
                      textTransform: "uppercase", color: isAnswer ? FELT_DEEP : FAINT,
                    }}
                  >
                    {rungName(i)}
                  </span>
                  <span style={{ ...SAYS, display: "block", fontSize: 13.5, color: INK }}>
                    <RedSuits>{hint}</RedSuits>
                  </span>
                </span>
              </div>
            );
          }

          if (isNext && state.kind !== "empty") {
            const loading = state.kind === "loading";
            return (
              <button
                key={i}
                type="button"
                onClick={reveal}
                disabled={loading}
                style={{
                  display: "flex", gap: 9, alignItems: "center", width: "100%",
                  minHeight: 38, padding: "8px 10px",
                  background: PAPER, borderWidth: 1, borderStyle: "dashed",
                  borderColor: loading ? FELT_LINE : FELT_MID, borderRadius: 9,
                  fontFamily: "inherit", textAlign: "left",
                  cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    flex: "none", width: 20, height: 20, borderRadius: "50%",
                    background: "transparent", color: FELT_MID,
                    borderWidth: 1.5, borderStyle: "solid", borderColor: FELT_MID,
                    fontSize: 11, fontWeight: 700, lineHeight: "17px", textAlign: "center",
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: loading ? FAINT : FELT_MID }}>
                  {loading
                    ? "Writing your hints — a few seconds…"
                    : isAnswer
                      ? "Show the answer"
                      : `Reveal ${rungName(i).toLowerCase()}`}
                </span>
              </button>
            );
          }

          return (
            <div
              key={i}
              aria-label={`${rungName(i)} — locked`}
              style={{
                display: "flex", gap: 9, alignItems: "center",
                minHeight: 38, padding: "8px 10px",
                background: "transparent", borderWidth: 1, borderStyle: "dashed",
                borderColor: FELT_LINE, borderRadius: 9, opacity: 0.65,
              }}
            >
              <span
                aria-hidden
                style={{
                  flex: "none", width: 20, height: 20, borderRadius: "50%",
                  background: FELT_SOFT, color: FAINT,
                  fontSize: 11, fontWeight: 700, lineHeight: "20px", textAlign: "center",
                }}
              >
                {i + 1}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: FAINT }}>{rungName(i)}</span>
              <span style={{ flex: 1 }} />
              <span aria-hidden style={{ fontSize: 11, color: FAINT }}>
                ●●●
              </span>
            </div>
          );
        })}
      </div>

      {state.kind === "empty" && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <p style={{ margin: 0, fontSize: 12.5, color: MUTED, fontStyle: "italic" }}>
            {state.reason === "not your turn"
              ? "Not your turn — hints come back when the next decision is yours."
              : "No hints for this position right now."}
          </p>
          {state.reason !== "not your turn" && (
            <button
              type="button"
              onClick={() => void load()}
              style={{
                flex: "none", minHeight: 26, padding: "3px 11px",
                background: "transparent", borderWidth: 1, borderStyle: "solid",
                borderColor: FELT_MID, borderRadius: 13, color: FELT_MID,
                fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
              }}
            >
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   TELL — the answers, side by side, each labelled with who is talking
   ════════════════════════════════════════════════════════════════════════════ */

interface BenTell {
  kind: "call" | "card";
  action: string;
  because?: string;
  score?: number;
  alternatives: { action: string; score?: number; because?: string }[];
}

type TellState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; tell: BenTell }
  | { kind: "empty"; reason: string };

export function CoachTell({
  sessionId,
  epoch,
  phase,
  active,
}: Readonly<{
  sessionId: string;
  /** The board's current section — the prefetch cache's key for this decision. */
  epoch: string;
  phase: "auction" | "play" | "other";
  /** It is the learner's decision right now. */
  active: boolean;
}>) {
  const [ben, setBen] = useState<TellState>({ kind: "idle" });

  async function askBen() {
    if (ben.kind === "loading") return;
    setBen({ kind: "loading" });
    try {
      const res = await fetch(`/api/bridge/ben-tell?sessionId=${encodeURIComponent(sessionId)}`);
      const body = (await res.json()) as { tell?: BenTell | null; reason?: string };
      setBen(body.tell ? { kind: "done", tell: body.tell } : { kind: "empty", reason: body.reason ?? "no answer" });
    } catch {
      setBen({ kind: "empty", reason: "unreachable" });
    }
  }

  const benVerb = phase === "auction" ? "bid" : "play";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── the coach's own answer — the existing advice, reused whole ── */}
      {phase === "play" && active && (
        <div style={SECTION}>
          <SectionLabel>Your coach</SectionLabel>
          <WhatShouldIPlay sessionId={sessionId} epoch={epoch} />
        </div>
      )}

      {/* ── BEN's answer — a second opinion, labelled as one ── */}
      <div style={SECTION}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
          <span
            style={{
              display: "inline-block", height: 16, padding: "0 5px",
              background: BEN_BLUE, borderRadius: 3, color: "#fff",
              fontSize: 9.5, fontWeight: 700, lineHeight: "16px",
            }}
          >
            BEN
          </span>
          <span
            style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 0.7,
              textTransform: "uppercase", color: FELT_DEEP,
            }}
          >
            Neural engine
          </span>
        </div>
        <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.5, color: MUTED }}>
          BEN is a neural player, not your system — where it agrees with your coach is
          worth noticing, and where it doesn&rsquo;t is worth thinking about.
        </p>

        {!active ? (
          <p style={{ margin: 0, fontSize: 12.5, color: MUTED, fontStyle: "italic" }}>
            BEN answers when the decision is yours — come back on your turn.
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void askBen()}
              disabled={ben.kind === "loading"}
              style={{
                alignSelf: "flex-start", minHeight: 32, padding: "6px 14px",
                background: BEN_BLUE, borderWidth: 1, borderStyle: "solid", borderColor: BEN_BLUE,
                borderRadius: 16, color: "#fff", fontSize: 12, fontWeight: 700,
                fontFamily: "inherit", cursor: ben.kind === "loading" ? "default" : "pointer",
                opacity: ben.kind === "loading" ? 0.6 : 1,
              }}
            >
              What would BEN {benVerb}?
            </button>

            {ben.kind === "loading" && (
              <p style={{ margin: "8px 0 0", fontSize: 12.5, color: MUTED, fontStyle: "italic" }}>
                {phase === "play"
                  ? "Asking BEN — it simulates the play, so this can take up to a minute…"
                  : "Asking BEN — a few seconds…"}
              </p>
            )}
            {ben.kind === "empty" && (
              <p style={{ margin: "8px 0 0", fontSize: 12.5, color: MUTED, fontStyle: "italic" }}>
                {ben.reason === "not your turn"
                  ? "Not your turn — ask again when the next decision is yours."
                  : "BEN has no answer for this one right now."}
              </p>
            )}
            {ben.kind === "done" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>
                    BEN would {benVerb}
                  </span>
                  <span
                    style={{
                      ...CARD_STYLE,
                      color: /[♥♦]/.test(ben.tell.action) ? "#c00" : "#000",
                    }}
                  >
                    <RedSuits>{ben.tell.action}</RedSuits>
                  </span>
                  {typeof ben.tell.score === "number" && (
                    <span style={{ fontSize: 11, color: FAINT, fontVariantNumeric: "tabular-nums" }}>
                      score {ben.tell.score.toFixed(2)}
                    </span>
                  )}
                </div>
                {ben.tell.because && (
                  <p style={{ ...SAYS, fontSize: 13, color: INK }}>
                    <RedSuits>{ben.tell.because}</RedSuits>
                  </p>
                )}
                {ben.tell.alternatives.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6,
                        textTransform: "uppercase", color: FAINT, margin: "3px 0 4px",
                      }}
                    >
                      It also weighed
                    </div>
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
                      {ben.tell.alternatives.map((alt) => (
                        <li
                          key={alt.action}
                          style={{ display: "flex", alignItems: "baseline", gap: 7, fontSize: 12.5, lineHeight: 1.45 }}
                        >
                          <span style={{ flex: "none", minWidth: 40, fontWeight: 700, color: INK }}>
                            <RedSuits>{alt.action}</RedSuits>
                          </span>
                          <span style={{ color: FAINT }}>
                            {typeof alt.score === "number" ? `score ${alt.score.toFixed(2)}` : ""}
                            {alt.because ? `${typeof alt.score === "number" ? " — " : ""}${alt.because}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
