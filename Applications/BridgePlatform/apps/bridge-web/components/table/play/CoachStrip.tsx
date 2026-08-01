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

import { useState, type ReactNode } from "react";

const GOLD = "#fecd07";
const BADGE: Record<CoachNoteSource, { bg: string; label: string }> = {
  coach: { bg: "#1f5e56", label: "Coach" },
  ben: { bg: "#384bb3", label: "BEN" },
  kb: { bg: "#6b4ea8", label: "Rulebook" },
  system: { bg: "#4a4a4a", label: "Table" },
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

/** Open height of the notes list, by variant. The host needs this to reserve
 *  room for the strip, so it lives here with the styling that determines it. */
export const COACH_STRIP_H = { closed: 30, openWide: 140, openCompact: 226 };

export function CoachStrip({
  data,
  compact = false,
  open: openProp,
  onToggle,
}: Readonly<{
  data: CoachPanelData;
  /** Phone metrics: smaller type, taller open state (there's more room below). */
  compact?: boolean;
  /**
   * Controlled open state. The wide table drives this because its stage is a
   * fixed-height design that has to grow by the strip's height — it can't find
   * that out after the fact. Left out, the strip owns the state itself.
   */
  open?: boolean;
  onToggle?: (open: boolean) => void;
}>) {
  const [openSelf, setOpenSelf] = useState(Boolean(data.defaultOpen));
  const open = openProp ?? openSelf;
  const setOpen = (next: boolean) => {
    setOpenSelf(next);
    onToggle?.(next);
  };
  const notes = data.notes ?? [];
  const latest = notes[notes.length - 1];
  const maxOpen = compact ? 190 : 104;
  const font = compact ? 13 : 14;

  return (
    <div
      data-testid="coach-strip"
      style={{
        flex: "none", width: "100%", boxSizing: "border-box",
        background: "#141414", borderTop: `2px solid ${GOLD}`, color: "#fff",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? "Hide coaching" : "Show coaching"}
        style={{
          display: "flex", alignItems: "center", gap: 6, width: "100%",
          padding: compact ? "5px 8px" : "4px 10px", background: "transparent",
          border: 0, color: "#fff", textAlign: "left", cursor: "pointer",
        }}
      >
        <span style={{ flex: "none", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: GOLD }}>
          {data.title ?? "Coach"}
        </span>
        {/* Collapsed, the header IS the message: the latest headline, one line. */}
        <span style={{ flex: 1, minWidth: 0, fontSize: font, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: latest ? "#fff" : "rgba(255,255,255,.55)" }}>
          {data.busy ? "Thinking…" : (latest?.headline ?? data.placeholder ?? "No coaching yet.")}
        </span>
        {notes.length > 1 && (
          <span style={{ flex: "none", fontSize: 11, color: "rgba(255,255,255,.5)" }}>{notes.length}</span>
        )}
        <span style={{ flex: "none", fontSize: 11, color: "rgba(255,255,255,.6)" }}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div style={{ maxHeight: maxOpen, overflowY: "auto", padding: `0 ${compact ? 8 : 10}px ${compact ? 8 : 6}px`, display: "flex", flexDirection: "column", gap: 6 }}>
          {notes.length === 0 && (
            <p style={{ margin: 0, fontSize: font - 1, lineHeight: 1.4, color: "rgba(255,255,255,.6)" }}>
              {data.placeholder ?? "Your coach's notes will appear here as you play."}
            </p>
          )}
          {notes.map((note, i) => {
            const badge = BADGE[note.source];
            return (
              <div key={note.id ?? `${note.source}-${i}`} style={{ display: "flex", gap: 6 }}>
                <span style={{ flex: "none", height: 17, padding: "0 5px", background: badge.bg, borderRadius: 3, fontSize: 10, fontWeight: 700, lineHeight: "17px" }}>
                  {badge.label}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: font, lineHeight: 1.35 }}>{note.headline}</p>
                  {note.detail && (
                    <p style={{ margin: "2px 0 0", fontSize: font - 1, lineHeight: 1.4, color: "rgba(255,255,255,.78)" }}>
                      {note.detail}
                    </p>
                  )}
                  {!!note.alternatives?.length && (
                    <ul style={{ margin: "3px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 1 }}>
                      {note.alternatives.map((alt) => (
                        <li key={alt.label} style={{ fontSize: font - 2, lineHeight: 1.35, color: "rgba(255,255,255,.62)" }}>
                          <span style={{ color: "rgba(255,255,255,.85)", fontWeight: 700 }}>not {alt.label}</span>
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
                          <a key={cite.label} href={cite.href} style={{ fontSize: 10.5, padding: "1px 5px", background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.22)", borderRadius: 3, color: GOLD, textDecoration: "none" }}>
                            {cite.label}
                          </a>
                        ) : (
                          <span key={cite.label} style={{ fontSize: 10.5, padding: "1px 5px", background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.22)", borderRadius: 3, color: "rgba(255,255,255,.75)" }}>
                            {cite.label}
                          </span>
                        ),
                      )}
                    </div>
                  )}
                  {(note.about?.seat || note.about?.trick || note.at) && (
                    <p style={{ margin: "2px 0 0", fontSize: 10, color: "rgba(255,255,255,.45)" }}>
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
