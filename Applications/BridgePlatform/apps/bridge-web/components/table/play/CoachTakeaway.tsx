"use client";

// The end-of-board takeaway — the NOW screen once the board is over (owner
// decision 2026-08-13, the takeaway design review).
//
// Three sections, strict rules for each:
//   · YOUR CALLS — one verdict chip per learner call, judged against the
//     partnership's own system. A call the rulebook was silent on is drawn
//     UNMARKED — not a grey "unknown"; a rulebook with no agreement has not
//     been contradicted. Tapping a chip jumps to that call in HISTORY.
//   · THE MOMENT THAT MATTERED — exactly one decision, picked server-side:
//     the worst disagreement, or on a clean board the best call, framed as
//     praise. The system's call wears its rule citation; the solver's cost
//     lines say what the layout made of it; BEN's read arrives as a quiet
//     one-liner (ben-tell?at=), labelled as the outside opinion it is.
//   · ONE THING TO REMEMBER — a single sentence. The model's phrasing
//     (takeaway-line) when it answers, the deterministic fallback when it
//     doesn't — the card never shows a spinner as its conclusion.
//
// Everything judged here was computed in lib/coach/takeaway.ts; this file
// only draws, fetches the two on-demand voices, and hands taps back to the
// sheet. Same self-contained-file discipline as CoachHintsTell.

import { useEffect, useState } from "react";

import type { BoardTakeaway, TakeawayChip } from "@/lib/coach/takeaway";

import { CoachEventAsk } from "./CoachEventAsk";

// The BirdBridge palette, as CoachPanel uses it (the app's theme.ts is the
// source of truth; the felt names are kept so usages map 1:1).
const PAPER = "#ffffff";
const INK = "#1f1f1f";
const MUTED = "#7b7466";
const FAINT = "#a49d8e";
const FELT_DEEP = "#541015"; // Brand.maroon
const FELT_MID = "#105431"; // Brand.green — agreement, actions
const FELT_SOFT = "#f6ead0";
const AMBER = "#9c5a12"; // "reasonable alternative"
const REDINK = "#b91c1c"; // disagreement
/** The stacked-edge shadow behind the app's playing cards. */
const CARD_EDGE = "0 2px 0 rgba(42,5,6,.75)";
/** BEN's badge blue — the same one CoachPanel's note badges wear. */
const BEN_BLUE = "#384bb3";

const SECTION = {
  background: PAPER, borderWidth: 1, borderStyle: "solid", borderColor: "#e8ddc3",
  borderRadius: 11, padding: "10px 12px",
} as const;

/** The coach's voice — one serif face for everything it says. */
const SAYS = {
  margin: 0,
  fontFamily: "Georgia, 'Times New Roman', serif",
  lineHeight: 1.5,
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

/** How each verdict is drawn: the mark, its colour, its word. */
const VERDICT_MARK: Record<
  NonNullable<TakeawayChip["verdict"]>,
  { mark: string; color: string; word: string }
> = {
  correct: { mark: "✓", color: FELT_MID, word: "agreed" },
  acceptable: { mark: "≈", color: AMBER, word: "reasonable" },
  incorrect: { mark: "✗", color: REDINK, word: "" }, // the word is the system's call
};

/** One learner call as a tappable chip — card face, verdict mark, one word. */
function CallChip({
  chip, onShow,
}: Readonly<{ chip: TakeawayChip; onShow?: (() => void) | undefined }>) {
  const v = chip.verdict ? VERDICT_MARK[chip.verdict] : null;
  const under =
    !v ? "" : chip.verdict === "incorrect" && chip.systemCall ? `system: ${chip.systemCall}` : v.word;
  return (
    <button
      type="button"
      onClick={onShow}
      aria-label={
        `${chip.label}${v ? ` — ${chip.verdict === "incorrect" ? `the system called ${chip.systemCall}` : v.word}` : ""}` +
        (onShow ? ". Show it in the auction." : "")
      }
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
        padding: 0, background: "transparent", borderWidth: 0,
        fontFamily: "inherit", cursor: onShow ? "pointer" : "default",
      }}
    >
      <span style={{ position: "relative", display: "inline-block" }}>
        <span
          style={{
            display: "inline-block", minWidth: 40, padding: "5px 8px",
            background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: "#d8d3bf",
            borderRadius: 6, boxShadow: CARD_EDGE, textAlign: "center",
            fontSize: 14.5, fontWeight: 700, lineHeight: 1.2,
            color: /[♥♦]/.test(chip.label) ? "#c00" : "#20201a",
          }}
        >
          {chip.label}
        </span>
        {v && (
          <span
            aria-hidden
            style={{
              position: "absolute", top: -6, right: -7,
              width: 16, height: 16, borderRadius: "50%",
              background: v.color, color: "#fff",
              fontSize: 10, fontWeight: 700, lineHeight: "16px", textAlign: "center",
            }}
          >
            {v.mark}
          </span>
        )}
      </span>
      <span style={{ fontSize: 9.5, fontWeight: 600, color: v ? v.color : "transparent", lineHeight: 1.2 }}>
        <RedSuits>{under || "·"}</RedSuits>
      </span>
    </button>
  );
}

/* ── the two on-demand voices ─────────────────────────────────────────────── */

type LineState =
  | { kind: "loading" }
  | { kind: "done"; line: string }
  | { kind: "fallback" };

type BenState =
  | { kind: "idle" }
  | { kind: "done"; action: string; score?: number }
  | { kind: "none" };

/**
 * The takeaway card. `sessionId` powers the on-demand voices (the model's
 * line, BEN's read, the ask box); without it the card is fully static and
 * still complete. `onShowCall` is the sheet's jump-to-history.
 */
export function CoachTakeaway({
  takeaway, sessionId, onShowCall,
}: Readonly<{
  takeaway: BoardTakeaway;
  sessionId?: string | undefined;
  onShowCall?: ((eventId: string) => void) | undefined;
}>) {
  const m = takeaway.moment;

  const [line, setLine] = useState<LineState>(sessionId ? { kind: "loading" } : { kind: "fallback" });
  const [ben, setBen] = useState<BenState>({ kind: "idle" });

  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/bridge/takeaway-line?sessionId=${encodeURIComponent(sessionId)}`);
        const body = (await res.json()) as { line?: string | null };
        if (!alive) return;
        setLine(body.line ? { kind: "done", line: body.line } : { kind: "fallback" });
      } catch {
        if (alive) setLine({ kind: "fallback" });
      }
    })();
    (async () => {
      try {
        const res = await fetch(
          `/api/bridge/ben-tell?sessionId=${encodeURIComponent(sessionId)}&at=${m.auctionIndex}`,
        );
        const body = (await res.json()) as {
          tell?: { action: string; score?: number } | null;
        };
        if (!alive) return;
        setBen(body.tell ? { kind: "done", action: body.tell.action, ...(body.tell.score !== undefined ? { score: body.tell.score } : {}) } : { kind: "none" });
      } catch {
        if (alive) setBen({ kind: "none" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [sessionId, m.auctionIndex]);

  const disagreement = m.kind === "disagreement";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── your calls, judged ── */}
      <div style={SECTION}>
        <SectionLabel>Your calls</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "3px 1px 0" }}>
          {takeaway.chips.map((chip) => (
            <CallChip
              key={chip.eventId}
              chip={chip}
              onShow={onShowCall ? () => onShowCall(chip.eventId) : undefined}
            />
          ))}
        </div>
        {takeaway.chips.some((c) => !c.verdict) && (
          <p style={{ margin: "8px 0 0", fontSize: 11, lineHeight: 1.45, color: FAINT }}>
            An unmarked call is one your system has no agreement for — nothing to hold you to.
          </p>
        )}
      </div>

      {/* ── the moment that mattered ── */}
      <div style={SECTION}>
        <SectionLabel>{disagreement ? "The moment that mattered" : "Your best call"}</SectionLabel>
        <p style={{ ...SAYS, fontSize: 13.5, color: MUTED }}>
          <RedSuits>{m.setting}</RedSuits>
        </p>
        <p style={{ ...SAYS, marginTop: 6, fontSize: 14.5, color: INK }}>
          {disagreement ? (
            <>
              You called <b><RedSuits>{m.learnerCall}</RedSuits></b> — your system calls{" "}
              <b style={{ color: FELT_MID }}>
                <RedSuits>{m.systemCall}</RedSuits>
              </b>{" "}
              (<i><RedSuits>{m.ruleLabel}</RedSuits></i>).
            </>
          ) : (
            <>
              You called <b style={{ color: FELT_MID }}><RedSuits>{m.learnerCall}</RedSuits></b>, and
              that is exactly the system's call (<i><RedSuits>{m.ruleLabel}</RedSuits></i>).
            </>
          )}
        </p>
        {m.ddLines.length > 0 && (
          <div style={{ marginTop: 7 }}>
            {m.ddLines.map((l) => (
              <p key={l} style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: MUTED }}>
                <RedSuits>{l}</RedSuits>
              </p>
            ))}
          </div>
        )}
        {ben.kind === "done" && (
          <p style={{ margin: "7px 0 0", fontSize: 12, lineHeight: 1.5, color: MUTED }}>
            <span
              style={{
                display: "inline-block", marginRight: 6, height: 15, padding: "0 5px",
                background: BEN_BLUE, borderRadius: 3, color: "#fff",
                fontSize: 9, fontWeight: 700, lineHeight: "15px", verticalAlign: "text-bottom",
              }}
            >
              BEN
            </span>
            The neural player would call <b><RedSuits>{ben.action}</RedSuits></b>
            {typeof ben.score === "number" ? ` (score ${ben.score.toFixed(2)})` : ""} — a
            different kind of player, not your system.
          </p>
        )}
        {sessionId && (
          <div style={{ marginTop: 9 }}>
            <CoachEventAsk
              key={m.eventId}
              sessionId={sessionId}
              eventId={m.eventId}
              eventLabel={m.askLabel}
              flush
            />
          </div>
        )}
      </div>

      {/* ── one thing to remember ── */}
      <div
        style={{
          ...SECTION,
          background: FELT_SOFT, borderColor: "#e0cfa4",
        }}
      >
        <SectionLabel>One thing to remember</SectionLabel>
        {line.kind === "loading" ? (
          <p style={{ ...SAYS, fontSize: 14, color: FAINT }}>Writing it down — a moment…</p>
        ) : (
          <p style={{ ...SAYS, fontSize: 14.5, color: FELT_DEEP }}>
            <RedSuits>{line.kind === "done" ? line.line : takeaway.fallbackLine}</RedSuits>
          </p>
        )}
      </div>
    </div>
  );
}
