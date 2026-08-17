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

import { OWLEE_DISCLAIMER, WhatShouldIPlay } from "./CoachEventAsk";
import { fetchBenTell, fetchBenWhatIf, fetchCuratedOverlay, fetchHints, type BenTell } from "./coachPrefetch";
import { OwleeFace } from "./OwleeFace";

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

/**
 * What to say when BEN returns no tell.
 *
 * The ben-tell route distinguishes eleven reasons and the panel showed one
 * sentence for nearly all of them, so a SERVICE OUTAGE wore the same words as
 * a quiet position: "BEN has no answer for this one right now" reads like a
 * considered verdict about the cards. When BEN went down entirely it said
 * exactly that, at every decision, and telling the two apart took a log tail
 * and an environment read (owner report 2026-08-17).
 *
 * Unreachable is not "no answer". Say which.
 */
function benEmptyMessage(reason: string | undefined): string {
  switch (reason) {
    // The service, not the position: BEN is a remote neural player, and when
    // it is down or unconfigured nothing about the cards is being judged.
    case "unreachable":
    case "unconfigured":
      return "BEN isn't reachable right now — Owlee's read stands.";
    case "not your turn":
      return "Not your turn — BEN answers when the next decision is yours.";
    case "board still live":
      return "BEN replays a spot only once the board is over.";
    // BEN answered, but with something the engine rejects as illegal here —
    // an answer that cannot be shown, which is not the same as none.
    case "no answer":
      return "BEN's answer didn't fit this position.";
    default:
      return "BEN has no answer for this one right now.";
  }
}
/** The stacked-edge shadow behind the app's playing cards. */
const CARD_EDGE = "0 2px 0 rgba(42,5,6,.75)";
/** BEN's badge blue — the same one CoachPanel's note badges wear. */
const BEN_BLUE = "#384bb3";

/** BEN's ⓘ small print — same one line of honesty Owlee's answer carries. */
const BEN_DISCLAIMER =
  "BEN works out its own answer, and it might not be entirely accurate — weigh it against your own reading of the position.";

/**
 * BEN's long waits, with a live clock (owner pick #5, 2026-08-14): a
 * 30-second simulation behind static text reads as a hang — the difference
 * between "working" and "broken" in a user's head is whether something
 * moves. Short waits keep the plain line; only `long` earns the counter.
 */
function BenWorking({ long, verb }: Readonly<{ long: boolean; verb: string }>) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!long) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [long]);
  return (
    <p style={{ margin: 0, fontSize: 12.5, color: MUTED, fontStyle: "italic" }}>
      {long
        ? `BEN is ${verb} — ${secs}s in, it can take up to a minute…`
        : "BEN is thinking — a few seconds…"}
    </p>
  );
}

/**
 * BEN's face — a round badge with a tiny neural net, in BEN's own blue
 * (owner direction 2026-08-14: an icon beside the name, not just words).
 * The visual counterpart of Owlee's owl badge on the answer above.
 */
function BenFace({ size = 20 }: Readonly<{ size?: number }>) {
  return (
    <span
      aria-hidden
      style={{
        flex: "none", width: size, height: size, borderRadius: "50%",
        background: BEN_BLUE, display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <svg width={size * 0.64} height={size * 0.64} viewBox="0 0 24 24" style={{ display: "block" }}>
        {/* three nodes, two links — a neural net at favicon size */}
        <path d="M7 11.2 15.2 6.4 M7 12.8 15.2 17.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <circle cx="5.6" cy="12" r="2.6" fill="#fff" />
        <circle cx="17.4" cy="5.6" r="2.6" fill="#fff" />
        <circle cx="17.4" cy="18.4" r="2.6" fill="#fff" />
      </svg>
    </span>
  );
}

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

/** The ladder's CAP — the count is dynamic below it (owner direction
 *  2026-08-14): the server writes 2–5 rungs, as many as the decision needs. */
const HINT_COUNT = 5;
const HINT_MIN = 2;

/** "Hint 1", "Hint 2" …, and whichever rung is LAST is "The answer". */
const rungName = (i: number, total: number): string =>
  i === total - 1 ? "The answer" : `Hint ${i + 1}`;

type HintsState =
  | { kind: "idle" }
  | { kind: "loading" }
  /** authoredBy set = the rungs are the COACH'S, not Owlee's — the header
   *  says so ("from Coach Sarah"), because whose voice it is IS the lesson. */
  | { kind: "ready"; hints: string[]; authoredBy?: string }
  | { kind: "empty"; reason: string };

export function CoachHints({
  sessionId,
  epoch,
  active,
  curated,
}: Readonly<{
  sessionId: string;
  /** The board's current section — the prefetch cache's key for this decision. */
  epoch: string;
  /** It is the learner's decision right now — hints exist only then. */
  active: boolean;
  /** A curated session: the coach may have authored THIS decision's ladder,
   *  which replaces Owlee's whole (no model call) while on the line. */
  curated?: boolean;
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
    // The COACH'S ladder first (curated deals, owner design 2026-08-15):
    // an authored ladder for this decision replaces Owlee's whole — same
    // rungs UI, zero model calls. Off the line, or unannotated, Owlee's
    // generation proceeds as ever.
    if (curated) {
      try {
        const overlay = await fetchCuratedOverlay(sessionId, epoch);
        const authored = overlay?.onPath ? overlay.current?.hints : undefined;
        if (authored && authored.length >= HINT_MIN && authored.length <= HINT_COUNT) {
          setState({
            kind: "ready",
            hints: authored,
            authoredBy: overlay?.coachName ?? "your coach",
          });
          return;
        }
      } catch {
        // The overlay not answering must not cost the learner the ladder.
      }
    }
    try {
      const r = await fetchHints(sessionId, epoch);
      if (r.hints && r.hints.length >= HINT_MIN && r.hints.length <= HINT_COUNT) {
        setState({ kind: "ready", hints: r.hints });
      } else {
        setState({ kind: "empty", reason: r.reason ?? "no answer" });
      }
    } catch {
      setState({ kind: "empty", reason: "unreachable" });
    }
  }, [sessionId, epoch, curated]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  // Revealing never fetches any more — it only turns over the next rung. On a
  // CURATED board the FIRST rung also stamps the learner's progress (review
  // loop, owner pick #5) — fire-and-forget: a lost stamp costs a statistic.
  const reveal = () => {
    if (curated && revealed === 0) {
      void fetch("/api/bridge/curated-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    }
    setRevealed((n) => Math.min(n + 1, HINT_COUNT));
  };

  if (!active) {
    return (
      <div style={SECTION}>
        <SectionLabel>Incremental Hints</SectionLabel>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: MUTED }}>
          Hints are for a decision that&rsquo;s in front of you — they&rsquo;ll be here when
          it&rsquo;s your turn.
        </p>
      </div>
    );
  }

  return (
    <div style={SECTION}>
      <SectionLabel>
        {state.kind === "ready" && state.authoredBy
          ? `Incremental Hints · from ${state.authoredBy}`
          : "Incremental Hints"}
      </SectionLabel>
      <p style={{ margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.5, color: MUTED }}>
        {state.kind === "ready" && state.authoredBy
          ? "Your coach wrote these rungs for this exact decision — each gives away a little more."
          : "Up to five hints for this decision, each giving away a little more — a simple decision gets fewer."}{" "}
        Open them one at a time — stopping early is the win.
      </p>

      {/* the writing shimmer — five face-down rungs settling in, instead of a
          sentence about writing (owner pick #5, 2026-08-14) */}
      <style>{`.hint-shimmer{background:linear-gradient(100deg,#f3ead4 40%,#fbf5e3 50%,#f3ead4 60%);background-size:200% 100%;animation:hintShimmer 1.2s linear infinite}
@keyframes hintShimmer{from{background-position:180% 0}to{background-position:-20% 0}}
@media (prefers-reduced-motion:reduce){.hint-shimmer{animation:none!important}}`}</style>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {/* The ladder is as tall as the DECISION: once the hints land, the
            rungs are however many were written. Before they land the cap
            stands in, so the list doesn't pop taller when they arrive. */}
        {Array.from(
          { length: state.kind === "ready" ? state.hints.length : HINT_COUNT },
          (_, i) => i,
        ).map((i) => {
          const total = state.kind === "ready" ? state.hints.length : HINT_COUNT;

          // Still being written: every rung is a shimmering face-down blank,
          // staggered like a deal — no button, no sentence, just work visibly
          // underway until the real rungs replace them.
          if (state.kind === "loading" || state.kind === "idle") {
            return (
              <div
                key={i}
                className="hint-shimmer"
                aria-hidden
                style={{
                  minHeight: 38, borderRadius: 9,
                  borderWidth: 1, borderStyle: "dashed", borderColor: FELT_LINE,
                  animationDelay: `${i * 120}ms`,
                }}
              />
            );
          }

          const isOpen = state.kind === "ready" && i < revealed;
          const isNext = state.kind === "ready" && i === revealed;
          const isAnswer = i === total - 1;

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
                    {rungName(i, total)}
                  </span>
                  <span style={{ ...SAYS, display: "block", fontSize: 13.5, color: INK }}>
                    <RedSuits>{hint}</RedSuits>
                  </span>
                </span>
              </div>
            );
          }

          if (isNext) {
            // Only ever reached with the ladder READY — the writing state is
            // the shimmer above, so this button never has a disabled face.
            return (
              <button
                key={i}
                type="button"
                onClick={reveal}
                style={{
                  display: "flex", gap: 9, alignItems: "center", width: "100%",
                  minHeight: 38, padding: "8px 10px",
                  background: PAPER, borderWidth: 1, borderStyle: "dashed",
                  borderColor: FELT_MID, borderRadius: 9,
                  fontFamily: "inherit", textAlign: "left", cursor: "pointer",
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
                <span style={{ fontSize: 12.5, fontWeight: 700, color: FELT_MID }}>
                  {isAnswer ? "Show the answer" : `Reveal ${rungName(i, total).toLowerCase()}`}
                </span>
              </button>
            );
          }

          return (
            <div
              key={i}
              aria-label={`${rungName(i, total)} — locked`}
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
              <span style={{ fontSize: 12, fontWeight: 600, color: FAINT }}>{rungName(i, total)}</span>
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
   WHAT IF — BEN's read of a decision already taken (the History screen)
   ════════════════════════════════════════════════════════════════════════════ */

type WhatIfState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; tell: BenTell }
  | { kind: "empty"; reason: string };

/**
 * "What would BEN have done here?" for a PAST decision — a call once the
 * auction is over, a card once the board is. Renders inside a History row
 * (auto: the tap that opened the row was the consent) or under the bidding
 * diagram's meaning panel (a button first — selecting a call is for reading
 * its meaning, and a simulation shouldn't ride along uninvited).
 *
 * The answer is BEN's alone and is labelled as such — same badge, same
 * caveat as the TELL screen, so the two surfaces can't read as two coaches.
 */
export function BenWhatIf({
  sessionId,
  query,
  kind,
  actual,
  auto = false,
}: Readonly<{
  sessionId: string;
  /** ben-tell's addressing for the spot — "at=3" for a call, "play=6-1" for a card. */
  query: string;
  kind: "call" | "card";
  /** What was actually done there — "2♦", "8♥", "Pass" — for the agree/differ line. */
  actual?: string;
  /** Fetch on mount instead of waiting for the button. */
  auto?: boolean;
}>) {
  const [state, setState] = useState<WhatIfState>(auto ? { kind: "loading" } : { kind: "idle" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const r = await fetchBenWhatIf(sessionId, query);
      setState(r.tell ? { kind: "done", tell: r.tell } : { kind: "empty", reason: r.reason ?? "no answer" });
    } catch {
      setState({ kind: "empty", reason: "unreachable" });
    }
  }, [sessionId, query]);

  useEffect(() => {
    if (auto) void load();
  }, [auto, load]);

  const verb = kind === "call" ? "bid" : "play";

  if (state.kind === "idle") {
    return (
      <button
        type="button"
        onClick={() => void load()}
        style={{
          minHeight: 28, padding: "4px 12px",
          background: "transparent", borderWidth: 1, borderStyle: "solid",
          borderColor: BEN_BLUE, borderRadius: 14, color: BEN_BLUE,
          fontSize: 11.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
        }}
      >
        What would BEN have done?
      </button>
    );
  }

  return (
    <div
      style={{
        background: PAPER, borderWidth: 1, borderStyle: "solid", borderColor: "#e8ddc3",
        borderRadius: 9, padding: "8px 10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
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
            fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6,
            textTransform: "uppercase", color: FELT_DEEP,
          }}
        >
          What if
        </span>
      </div>

      {state.kind === "loading" && <BenWorking long={kind === "card"} verb="replaying the position" />}
      {state.kind === "empty" && (
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED, fontStyle: "italic" }}>
          {benEmptyMessage(state.reason)}
        </p>
      )}
      {state.kind === "done" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>
              BEN would have {query === "play=0-0" ? "led" : verb}
            </span>
            <span
              style={{
                ...CARD_STYLE,
                color: /[♥♦]/.test(state.tell.action) ? "#c00" : "#000",
              }}
            >
              <RedSuits>{state.tell.action}</RedSuits>
            </span>
            {typeof state.tell.score === "number" && (
              <span style={{ fontSize: 11, color: FAINT, fontVariantNumeric: "tabular-nums" }}>
                score {state.tell.score.toFixed(2)}
              </span>
            )}
            {actual && (
              <span style={{ fontSize: 12, color: actual === state.tell.action ? FELT_MID : MUTED }}>
                {actual === state.tell.action ? (
                  <b>— the same choice you made.</b>
                ) : (
                  <>
                    — you chose <b><RedSuits>{actual}</RedSuits></b>.
                  </>
                )}
              </span>
            )}
          </div>
          {state.tell.because && (
            <p style={{ ...SAYS, fontSize: 13, color: INK }}>
              <RedSuits>{state.tell.because}</RedSuits>
            </p>
          )}
          {state.tell.alternatives.length > 0 && (
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
                {state.tell.alternatives.map((alt) => (
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
          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.45, color: FAINT }}>
            BEN is a neural player, not your system — a different choice is worth thinking
            about, not automatically better.
          </p>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   TELL — the answers, side by side, each labelled with who is talking
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * A character speaking (owner ask 2026-08-15: "an avatar character displaying
 * those content"): the avatar sits beside a paper bubble with a tail pointing
 * back at it, so each answer reads as SAID by its speaker rather than filed
 * in a box. The tail is a rotated square wearing the bubble's own border on
 * its two lit edges — no SVG, no clip-path, survives any bubble height.
 */
export function SpeechBubble({
  avatar,
  children,
}: Readonly<{ avatar: React.ReactNode; children: React.ReactNode }>) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{ flex: "none", marginTop: 3 }}>{avatar}</span>
      <div
        style={{
          position: "relative", flex: 1, minWidth: 0,
          background: PAPER, borderWidth: 1, borderStyle: "solid", borderColor: "#e8ddc3",
          borderRadius: 12, padding: "10px 12px",
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute", left: -5.5, top: 15, width: 10, height: 10,
            background: PAPER,
            borderLeft: "1px solid #e8ddc3", borderBottom: "1px solid #e8ddc3",
            transform: "rotate(45deg)",
          }}
        />
        {children}
      </div>
    </div>
  );
}

/** The call named inside a hint's prose — "1♠", "1NT", "Pass" — for the chip. */
function callIn(text: string): string | null {
  const bid = /([1-7])\s?(NT|♠|♥|♦|♣)/.exec(text);
  if (bid) return `${bid[1]}${bid[2]}`;
  const word = /\b(pass|double|redouble)\b/i.exec(text);
  if (word) return word[1]!.charAt(0).toUpperCase() + word[1]!.slice(1).toLowerCase();
  return null;
}

/**
 * Owlee's answer for a BIDDING decision (owner direction 2026-08-14: "use
 * the same answer in the hint for Owlee") — the hint ladder's final rung,
 * read from the SAME prefetched ladder the Hints tab shows. One source, two
 * surfaces: Tell and Hints cannot disagree about a call, because Tell's
 * answer IS the ladder's answer. (The play has its own deterministic advice
 * — WhatShouldIPlay — and the ladder is anchored to it; the auction runs
 * the other way round.)
 */
function OwleeBids({
  sessionId,
  epoch,
}: Readonly<{ sessionId: string; epoch: string }>) {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "done"; hint: string } | { kind: "empty"; reason: string }
  >({ kind: "loading" });
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetchHints(sessionId, epoch);
        if (!alive) return;
        const last = r.hints?.[r.hints.length - 1];
        setState(last ? { kind: "done", hint: last } : { kind: "empty", reason: r.reason ?? "no answer" });
      } catch {
        if (alive) setState({ kind: "empty", reason: "unreachable" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [sessionId, epoch]);

  const call = state.kind === "done" ? callIn(state.hint) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {/* No mini-face — the speech bubble's avatar carries the identity. */}
        <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>Owlee bids</span>
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
        {call && (
          <span style={{ ...CARD_STYLE, color: /[♥♦]/.test(call) ? "#c00" : "#000" }}>
            <RedSuits>{call}</RedSuits>
          </span>
        )}
      </div>
      {state.kind === "loading" && (
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED, fontStyle: "italic" }}>
          Working it out — a few seconds…
        </p>
      )}
      {state.kind === "empty" && (
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED, fontStyle: "italic" }}>
          {state.reason === "not your turn"
            ? "Not your turn."
            : "No call to suggest for this position."}
        </p>
      )}
      {state.kind === "done" && (
        <p style={{ ...SAYS, fontSize: 13, color: INK }}>
          <RedSuits>{state.hint}</RedSuits>
        </p>
      )}

      {infoOpen && (
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

type TellState =
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
  const [ben, setBen] = useState<TellState>({ kind: "loading" });
  // The ⓘ beside BEN's name — the one line of small print.
  const [benInfoOpen, setBenInfoOpen] = useState(false);
  // "It also weighed" folded away by default (owner direction 2026-08-14:
  // the screen read as packed) — the also-rans are one tap for whoever wants
  // them, not three rows for everyone.
  const [altOpen, setAltOpen] = useState(false);

  // No button any more (owner direction 2026-08-11: "run the BEN before
  // anyone even taps"): BEN starts thinking when the decision lands (the
  // prefetch), and this screen just reads the shared promise — usually
  // resolved for a bid (~2s), often still simulating for a card. Keyed by
  // the host on the decision epoch, so a new card asks BEN afresh.
  useEffect(() => {
    if (!active) return;
    let alive = true;
    (async () => {
      try {
        const r = await fetchBenTell(sessionId, epoch);
        if (!alive) return;
        setBen(r.tell ? { kind: "done", tell: r.tell } : { kind: "empty", reason: r.reason ?? "no answer" });
      } catch {
        if (alive) setBen({ kind: "empty", reason: "unreachable" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [sessionId, epoch, active]);

  const benVerb = phase === "auction" ? "bid" : "play";

  // SPEECH BUBBLES (owner ask 2026-08-15, replacing the shared card): each
  // answer is SAID by its character — the avatar beside a tailed paper
  // bubble — so who-is-talking is a face before it is a label.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {active && (phase === "play" || phase === "auction") && (
        <SpeechBubble avatar={<OwleeFace size={38} />}>
          {phase === "play" ? (
            <WhatShouldIPlay sessionId={sessionId} epoch={epoch} />
          ) : (
            // A bidding decision: Owlee's answer is the hint ladder's
            // final rung — the same one the Hints tab reveals last.
            <OwleeBids sessionId={sessionId} epoch={epoch} />
          )}
        </SpeechBubble>
      )}
      <SpeechBubble avatar={<BenFace size={38} />}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
          <span
            style={{
              fontSize: 12, fontWeight: 700, color: FELT_DEEP,
            }}
          >
            BEN
          </span>
          <span
            style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 0.7,
              textTransform: "uppercase", color: FAINT,
            }}
          >
            Neural engine
          </span>
          <button
            type="button"
            aria-label="About BEN's answer"
            aria-expanded={benInfoOpen}
            onClick={() => setBenInfoOpen(true)}
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
        </div>
        {/* The neural-player explainer paragraph retired (owner direction
            2026-08-14); the ⓘ above carries the honest caveat instead. */}

        {!active ? (
          <p style={{ margin: 0, fontSize: 12.5, color: MUTED, fontStyle: "italic" }}>
            BEN answers when the decision is yours — come back on your turn.
          </p>
        ) : (
          <>
            {ben.kind === "loading" && <BenWorking long={phase === "play"} verb="simulating the play" />}
            {ben.kind === "empty" && (
              <p style={{ margin: 0, fontSize: 12.5, color: MUTED, fontStyle: "italic" }}>
                {benEmptyMessage(ben.reason)}
              </p>
            )}
            {ben.kind === "done" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>
                    BEN {benVerb}s
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
                    <button
                      type="button"
                      aria-expanded={altOpen}
                      onClick={() => setAltOpen((v) => !v)}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        margin: "3px 0 4px", padding: 0,
                        background: "transparent", borderWidth: 0,
                        fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6,
                        textTransform: "uppercase", color: FAINT,
                        fontFamily: "inherit", cursor: "pointer",
                      }}
                    >
                      It also weighed {ben.tell.alternatives.length}
                      <span
                        aria-hidden
                        style={{
                          fontSize: 7, color: FELT_MID,
                          transform: altOpen ? "rotate(180deg)" : undefined,
                          transition: "transform .15s ease",
                        }}
                      >
                        ▼
                      </span>
                    </button>
                    {altOpen && (
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
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </SpeechBubble>

      {/* ── BEN's ⓘ popup: the same one line of small print Owlee's carries ── */}
      {benInfoOpen && (
        <div
          role="presentation"
          onClick={() => setBenInfoOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 950,
            background: "rgba(42,5,6,.45)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 18,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="About BEN's answer"
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
                BEN
              </span>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                aria-label="Close"
                onClick={() => setBenInfoOpen(false)}
                style={{
                  flex: "none", width: 26, height: 26, borderRadius: 7,
                  background: "#f3ead4", borderWidth: 0, color: MUTED,
                  fontSize: 13, lineHeight: 1, cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
            <p style={{ ...SAYS, fontSize: 13.5, color: INK }}>{BEN_DISCLAIMER}</p>
          </div>
        </div>
      )}
    </div>
  );
}
