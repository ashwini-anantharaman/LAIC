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

export interface CoachNote {
  /** Who is speaking. Drives the badge, nothing else. */
  source: CoachNoteSource;
  /** One line, always visible when this is the latest note. */
  headline: string;
  /** The reasoning, shown when the strip is open. */
  detail?: string;
  /**
   * What it leaned on — a KB setting, a rule id, a lesson. `href` makes the
   * chip a link (e.g. into the knowledge base) when the host has somewhere to
   * point at.
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
  const notes = data.notes ?? [];
  const latest = notes[notes.length - 1];
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
          borderWidth: 0, borderBottom: open ? `1px solid ${LINE}` : 0, borderStyle: "solid", borderColor: LINE,
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
        {notes.length > 1 && (
          <span style={{ flex: "none", fontSize: 11, color: MUTED }}>{notes.length}</span>
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
          {notes.map((note, i) => {
            const badge = BADGE[note.source];
            return (
              <div key={note.id ?? `${note.source}-${i}`} style={{ display: "flex", gap: 6 }}>
                <span style={{ flex: "none", height: 17, padding: "0 5px", background: badge.bg, borderRadius: 3, color: "#fff", fontSize: 10, fontWeight: 700, lineHeight: "17px" }}>
                  {badge.label}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: font, lineHeight: 1.35 }}>{note.headline}</p>
                  {note.detail && (
                    <p style={{ margin: "2px 0 0", fontSize: font - 1, lineHeight: 1.4, color: MUTED }}>
                      {note.detail}
                    </p>
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
                  {!!note.citations?.length && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 3 }}>
                      {note.citations.map((cite) =>
                        cite.href ? (
                          <a key={cite.label} href={cite.href} style={{ fontSize: 10.5, padding: "1px 5px", background: HEAD, border: `1px solid ${LINE}`, borderRadius: 3, color: "#1f5e56", textDecoration: "none" }}>
                            {cite.label}
                          </a>
                        ) : (
                          <span key={cite.label} style={{ fontSize: 10.5, padding: "1px 5px", background: HEAD, border: `1px solid ${LINE}`, borderRadius: 3, color: MUTED }}>
                            {cite.label}
                          </span>
                        ),
                      )}
                    </div>
                  )}
                  {(note.about?.seat || note.about?.trick || note.at) && (
                    <p style={{ margin: "2px 0 0", fontSize: 10, color: MUTED }}>
                      {[note.about?.seat, note.about?.trick ? `trick ${note.about.trick}` : null, note.at]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          {data.actions && <div style={{ display: "flex", gap: 6, paddingTop: 2 }}>{data.actions}</div>}
        </div>
      )}
    </div>
  );
}
