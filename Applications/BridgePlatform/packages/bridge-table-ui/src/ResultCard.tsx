"use client";

// ResultCard — the board-complete card in the centre: headline, optional score,
// and a trick-count detail line. Lifted verbatim from PlayTable's resultCard
// node. The host formats the detail ("NS n · EW m").

export interface ResultCardProps {
  /** Headline; falls back to "Board complete" when empty. */
  line: string;
  /** Optional score line. */
  score: string;
  /** Detail line, e.g. "NS 7 · EW 6". */
  detail: string;
}

export function ResultCard({ line, score, detail }: Readonly<ResultCardProps>) {
  return (
    <div style={{ background: "#fff", border: "1px solid #7d7d7d", borderRadius: 4, padding: "16px 28px", textAlign: "center", boxShadow: "0 3px 10px rgba(0,0,0,.45)" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#000" }}>{line || "Board complete"}</div>
      {score && <div style={{ fontSize: 18, color: "#444", marginTop: 4 }}>{score}</div>}
      <div style={{ fontSize: 15, color: "#666", marginTop: 6 }}>{detail}</div>
    </div>
  );
}
