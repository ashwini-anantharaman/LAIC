"use client";

// CoachPanel — the slot under the table on the phone tier (CoachPanel.dc.html).
// Deliberately a SHELL: the brief reserves the space before deciding what fills
// it, so this renders whatever `lines` and `actions` it is handed and says so
// plainly when it is handed none. The phone tier reserves `coachShare` of the
// screen for it; PlayTable threads its lines/actions through. Nothing here
// decides content — that stays with the host.

import type { CSSProperties } from "react";

const DEFAULT_ACCENT = "#384bb3";

/** A body line: a bare string (default ink) or an inked line. */
export type CoachLine = string | { text: string; color?: string };

/** A footer action — a bordered button that fires `on`. */
export interface CoachAction {
  label: string;
  on?: (() => void) | null;
}

export interface CoachPanelProps {
  /** Header title beside the roundel. */
  title?: string;
  /** Small uppercase status at the header's right edge. */
  status?: string;
  /** Roundel fill (a skin's accent tints it). */
  accent?: string;
  /** Body lines. Empty (or absent) → the honest empty-state line. */
  lines?: readonly CoachLine[];
  /** Footer action buttons. Absent/empty → no footer. */
  actions?: readonly CoachAction[];
}

const shell: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  minHeight: 0,
  background: "#f4f6f4",
  fontFamily: "Arial, Helvetica, sans-serif",
};

export function CoachPanel({
  title = "Coach",
  status = "",
  accent = DEFAULT_ACCENT,
  lines,
  actions,
}: Readonly<CoachPanelProps>) {
  const body: { text: string; color: string }[] = (lines && lines.length ? lines : []).map((l) =>
    typeof l === "string"
      ? { text: l, color: "#28312c" }
      : { text: l.text ?? "", color: l.color ?? "#28312c" },
  );
  const empty = body.length === 0;
  const acts = actions && actions.length ? actions : [];

  return (
    <div style={shell}>
      {/* Header: accent roundel · title · status. */}
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: "1px solid #dde2dd" }}>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, flex: "none", borderRadius: 11, background: accent, color: "#fff", fontSize: 12, fontWeight: 700 }}>C</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#1d2421" }}>{title}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: "#6b7570" }}>{status}</span>
      </div>

      {/* Body: the handed lines, or the honest empty-state line. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
        {body.map((l, i) => (
          <div key={i} style={{ fontSize: 14, lineHeight: 1.45, color: l.color }}>
            {l.text}
          </div>
        ))}
        {empty && (
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "#6b7570" }}>
            Coach commentary appears here as the deal goes on.
          </div>
        )}
      </div>

      {/* Footer: only when actions were handed. */}
      {acts.length > 0 && (
        <div style={{ flex: "none", display: "flex", flexWrap: "wrap", gap: 6, padding: "0 14px 11px" }}>
          {acts.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={a.on ?? undefined}
              style={{ height: 34, padding: "0 13px", border: "1px solid #c6cec8", borderRadius: 6, background: "#fff", color: "#1d2421", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: a.on ? "pointer" : "default" }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
