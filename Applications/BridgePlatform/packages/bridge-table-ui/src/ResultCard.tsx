"use client";

// ResultCard — the board-complete card in the centre: headline, optional score,
// and a trick-count detail line. Lifted verbatim from PlayTable's resultCard
// node. The host formats the detail ("NS n · EW m").
//
// It also carries the WAY ONWARD when the host has one — a challenge board's
// "Next board", say. That belongs here and not in a band under the table:
// every control lives inside the canvas, and at completion this card is where
// the eye already is. It is a real link, so it survives a reload; and it is
// sized as a proper target, because on a finished board it is the only thing
// left to press.

export interface ResultCardAction {
  label: string;
  href: string;
}

export interface ResultCardProps {
  /** Headline; falls back to "Board complete" when empty. */
  line: string;
  /** Optional score line. */
  score: string;
  /** Detail line, e.g. "NS 7 · EW 6". */
  detail: string;
  /** The one action a finished board offers, when the host has one. */
  action?: ResultCardAction;
  /** Quiet line under the action, e.g. "3 boards left". */
  actionNote?: string;
  /** The action's fill — the table's own accent, so it wears the skin. */
  accent?: string;
}

export function ResultCard({
  line,
  score,
  detail,
  action,
  actionNote,
  accent = "#384bb3",
}: Readonly<ResultCardProps>) {
  return (
    <div style={{ background: "#fff", border: "1px solid #7d7d7d", borderRadius: 4, padding: "16px 28px", textAlign: "center", boxShadow: "0 3px 10px rgba(0,0,0,.45)" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#000" }}>{line || "Board complete"}</div>
      {score && <div style={{ fontSize: 18, color: "#444", marginTop: 4 }}>{score}</div>}
      <div style={{ fontSize: 15, color: "#666", marginTop: 6 }}>{detail}</div>
      {action && (
        <a
          href={action.href}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 48, marginTop: 14, borderRadius: 6, background: accent, color: "#fff", fontSize: 19, fontWeight: 700, lineHeight: 1, textDecoration: "none", whiteSpace: "nowrap" }}
        >
          {action.label}
        </a>
      )}
      {action && actionNote && (
        <div style={{ fontSize: 13, color: "#666", marginTop: 6 }}>{actionNote}</div>
      )}
    </div>
  );
}
