"use client";

// CoachStrip — the coaching surface at the table, below the player's hand.
//
// UI ONLY (2026-08-01). Nothing here talks to the coach, to BEN or to a
// knowledge base: the host hands it notes and it draws them. That's deliberate
// — the contract below is the seam the coaching runtime plugs into later, and
// fixing the seam first means the runtime can be wired without touching layout
// again.
//
// The shape it expects is one flat list of NOTES, newest last, each carrying
// its own source. That covers the three things this strip has to show:
//
//   · the coach's instruction for the board ("focus on your opening lead");
//   · what BEN explains about the move it just made (the first thing being
//     wired — BEN's logic events already carry `reason`, `rejected[]` and
//     `citedSettings`, which map onto detail + citations);
//   · a knowledge base's rule, cited, when a call or card came from one.
//
// It is collapsed by default and never grows past `maxOpen`: this sits under
// the hand, and a coaching panel that pushes the cards off a phone screen is
// worse than no coaching panel.
//
// PHONE ONLY (owner decision 2026-08-01). The desktop platform's table doesn't
// show it — coaching is the app's surface — so PlayTable renders this in its
// portrait layout and nowhere else.

import { useState, type ReactNode } from "react";

// The table's own palette (PlayTable's constants): the bid tray's tan, the
// pale head of a bidding-box button, the auction box's hairline. The strip
// used to be near-black, which matched nothing else on the felt.
const TAN = "#cccc9b";
const HEAD = "#f2f2ea";
const LINE = "#8a8a6a";
const INK = "#2b2b1e";
const MUTED = "#57573f";
const BADGE: Record<CoachNoteSource, { bg: string; label: string }> = {
  coach: { bg: "#1f5e56", label: "Coach" },
  ben: { bg: "#384bb3", label: "BEN" },
  kb: { bg: "#6b4ea8", label: "Rulebook" },
  system: { bg: "#6f6f5a", label: "Table" },
};

export type CoachNoteSource = "coach" | "ben" | "kb" | "system";

/**
 * How much of the reader's attention this note deserves.
 *
 * Separate from `source`, which says who spoke. A board can produce two dozen
 * approvals and one correction — measured 34 to 6 across six real boards, with
 * one board at twenty-five approvals and nothing to fix. Giving them equal weight
 * makes the panel a scoreboard and hides the only line worth acting on.
 */
export type CoachNoteTone = "correction" | "affirmation" | "status";

export interface CoachNote {
  /** Who is speaking. Drives the badge, nothing else. */
  source: CoachNoteSource;
  /** How the strip weighs it. Corrections are shown; approvals are counted. */
  tone?: CoachNoteTone;
  /** One line, always visible when this is the latest note. */
  headline: string;
  /** The reasoning, shown when the strip is open. One line where possible. */
  detail?: string;
  /**
   * Questions the learner can ask, each with an answer the coach already holds.
   *
   * Every one is deterministic — the authored prose behind "Why?", the decider's
   * own trace behind "Why not my call?". Nothing here is generated, so nothing
   * here can contradict the verdict above it.
   *
   * This replaced an unlabelled "more" toggle, which asked the learner to guess
   * what was behind it. A question states what tapping will get you.
   */
  followUps?: readonly { q: string; a: string }[];
  /**
   * What it leaned on — a knowledge item, a source document, an anchor.
   *
   * CARRIED BUT NOT DRAWN at the table. On a real board these came out as
   * "Fourth hand wins as cheaply as possible" (a title the prose above it has
   * already explained) and "Claude (Anthropic) — platform-authored judgments —
   * slide 76" (a page of a deck the learner has no access to, credited in
   * internal vocabulary). Useful to whoever authors or reviews the rulebook;
   * noise to someone holding thirteen cards. A review surface can render them
   * from the same note.
   */
  citations?: readonly { label: string; href?: string }[];
  /**
   * What it considered and turned down — a bid engine's `rejected[]`. Half of
   * "why this bid" is "why not that one", and for a learner that half is
   * usually the more useful one.
   */
  alternatives?: readonly { label: string; why: string }[];
  /** Which seat/trick this is about, for later filtering by hand or trick. */
  about?: { seat?: string; trick?: number };
  /**
   * A way to ask for more — "Show me", on a note that is deliberately holding
   * the answer back. Without it a withheld hint is a dead end: the coach says
   * "worth a second look" and the learner has no path to the answer, however
   * much they want it. A link, because table state in this app lives in the URL.
   */
  action?: { label: string; href: string };
  /** Host-supplied timestamp; rendered as given, never parsed. */
  at?: string;
  /** Stable id so a re-render doesn't reorder or re-animate notes. */
  id?: string;
}

export interface CoachPanelData {
  /** Strip title. Defaults to "Coach". */
  title?: string;
  /** Newest last. Empty (or absent) shows `placeholder`. */
  notes?: readonly CoachNote[];
  /** What to say before there is anything to say. */
  placeholder?: string;
  /** The coach/BEN is working on an answer — shows a live hint in the header. */
  busy?: boolean;
  /** Host controls for the header, e.g. an "Explain that" button. */
  actions?: ReactNode;
  /** Open on first render. Defaults to closed. */
  defaultOpen?: boolean;
}

export function CoachStrip({
  data,
  compact = false,
}: Readonly<{
  data: CoachPanelData;
  /** Phone metrics: smaller type, taller open state (there's more room below). */
  compact?: boolean;
}>) {
  const [open, setOpen] = useState(Boolean(data.defaultOpen));
  // Which notes have had their remainder expanded. Per note, because opening one
  // long explanation should not unfold every other one on the board.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const notes = data.notes ?? [];
  const latest = notes[notes.length - 1];

  // Three groups, because they want three different amounts of space.
  // Corrections newest-first, so the top of the open list matches the one line
  // the collapsed header is already showing.
  const corrections = notes.filter((n) => (n.tone ?? "correction") === "correction").reverse();
  const approvals = notes.filter((n) => n.tone === "affirmation");
  const status = notes.filter((n) => n.tone === "status");
  const maxOpen = compact ? 190 : 120;
  const font = compact ? 13 : 14;

  return (
    <div
      data-testid="coach-strip"
      style={{
        flex: "none", width: "100%", boxSizing: "border-box",
        background: TAN, borderTop: `2px solid ${LINE}`, color: INK,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? "Hide coaching" : "Show coaching"}
        style={{
          display: "flex", alignItems: "center", gap: 6, width: "100%",
          padding: compact ? "5px 8px" : "4px 10px", background: HEAD,
          // Longhands only. `borderBottom` is a shorthand for the same values
          // borderStyle/borderColor set, and it changes with `open` — React
          // warns because the two can disagree across a re-render.
          borderWidth: 0, borderBottomWidth: open ? 1 : 0, borderStyle: "solid", borderColor: LINE,
          color: INK, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <span style={{ flex: "none", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: MUTED }}>
          {data.title ?? "Coach"}
        </span>
        {/* Collapsed, the header IS the message: the latest headline, one line. */}
        <span style={{ flex: 1, minWidth: 0, fontSize: font, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: latest ? INK : MUTED }}>
          {data.busy ? "Thinking…" : (latest?.headline ?? data.placeholder ?? "No coaching yet.")}
        </span>
        {/* A count of things to LOOK AT, not of notes. "25" told a learner
            nothing except that the panel was busy. */}
        {corrections.length > 0 && (
          <span
            style={{
              flex: "none", padding: "0 5px", borderRadius: 8,
              background: "#1f5e56", color: "#fff", fontSize: 10, fontWeight: 700,
            }}
          >
            {corrections.length} to review
          </span>
        )}
        <span style={{ flex: "none", fontSize: 11, color: MUTED }}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div style={{ maxHeight: maxOpen, overflowY: "auto", padding: compact ? "6px 8px" : "6px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
          {notes.length === 0 && (
            <p style={{ margin: 0, fontSize: font - 1, lineHeight: 1.4, color: MUTED }}>
              {data.placeholder ?? "Your coach's notes will appear here as you play."}
            </p>
          )}
          {/* CORRECTIONS — the whole point of the panel, in full. */}
          {corrections.map((note, i) => {
            const key = note.id ?? `c-${i}`;
            const badge = note.source === "coach" ? null : BADGE[note.source];
            return (
              <div key={key} style={{ display: "flex", gap: 6 }}>
                {/* No badge when the coach is speaking — the strip's own header
                    already says COACH, so a row badge on every line was the same
                    word twice, twenty-five times over. Other voices still get one. */}
                {badge && (
                  <span style={{ flex: "none", height: 17, padding: "0 5px", background: badge.bg, borderRadius: 3, color: "#fff", fontSize: 10, fontWeight: 700, lineHeight: "17px" }}>
                    {badge.label}
                  </span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: font, lineHeight: 1.35, fontWeight: 600 }}>
                    {note.headline}
                  </p>
                  {note.detail && (
                    <p style={{ margin: "2px 0 0", fontSize: font - 1, lineHeight: 1.4, color: MUTED }}>
                      {note.detail}
                    </p>
                  )}
                  {/* Ask the coach. One tap, an answer it already had. */}
                  {!!note.followUps?.length && (
                    <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
                      {note.followUps.map((up) => {
                        const id = `${key}:${up.q}`;
                        const isOpen = expanded.has(id);
                        return (
                          <div key={id}>
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              onClick={() =>
                                setExpanded((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(id)) next.delete(id);
                                  else next.add(id);
                                  return next;
                                })
                              }
                              style={{
                                padding: "1px 6px", background: HEAD,
                                borderWidth: 1, borderStyle: "solid", borderColor: LINE,
                                borderRadius: 9, color: "#1f5e56", fontSize: font - 2,
                                fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
                              }}
                            >
                              {up.q}
                            </button>
                            {isOpen && (
                              <p style={{ margin: "2px 0 0", fontSize: font - 1, lineHeight: 1.4, color: MUTED }}>
                                {up.a}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!!note.alternatives?.length && (
                    <ul style={{ margin: "3px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 1 }}>
                      {note.alternatives.map((alt) => (
                        <li key={alt.label} style={{ fontSize: font - 2, lineHeight: 1.35, color: MUTED }}>
                          <span style={{ color: INK, fontWeight: 700 }}>not {alt.label}</span>
                          {" — "}
                          {alt.why}
                        </li>
                      ))}
                    </ul>
                  )}
                  {note.action && (
                    <a
                      href={note.action.href}
                      style={{
                        display: "inline-block", marginTop: 3, padding: "1px 6px",
                        background: HEAD, border: `1px solid ${LINE}`, borderRadius: 3,
                        color: "#1f5e56", fontSize: 11, fontWeight: 700, textDecoration: "none",
                      }}
                    >
                      {note.action.label}
                    </a>
                  )}
                </div>
              </div>
            );
          })}

          {/* APPROVALS — one line, not one line each. The reassurance that the
              coach was watching survives; the wall of identical praise does not. */}
          {approvals.length > 0 && (
            <p style={{ margin: 0, fontSize: font - 1, lineHeight: 1.4, color: MUTED }}>
              <span style={{ color: "#1f5e56", fontWeight: 700 }}>
                {approvals.length} other {approvals.length === 1 ? "move" : "moves"} checked
              </span>
              {" — all as your system plays."}
            </p>
          )}

          {/* WHAT IT HEARD — last and quietest. Proof of life, not coaching. */}
          {status.map((note, i) => (
            <p
              key={note.id ?? `s-${i}`}
              style={{
                margin: 0, paddingTop: 4, fontSize: font - 2, lineHeight: 1.4, color: "#7d7d66",
                borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: LINE,
              }}
            >
              {note.headline}
              {note.detail ? ` ${note.detail}` : null}
            </p>
          ))}

          {data.actions && <div style={{ display: "flex", gap: 6, paddingTop: 2 }}>{data.actions}</div>}
        </div>
      )}
    </div>
  );
}
