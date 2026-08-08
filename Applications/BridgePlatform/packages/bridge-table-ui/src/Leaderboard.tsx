"use client";

// Leaderboard - the standings, and nothing else (spec A5): rank . name . total.
// No avatars, no per-board figures, no progress bars. Lifted from the
// standings block of Challenge Page.dc.html / Challenge Table.dc.html.
//
// Three rules the design fixed and this component enforces:
//  - TIES SHARE A RANK (1, 2, 2, 4). Ranks are taken from the rows when the
//    caller has them, otherwise derived from `value` - see challengeLogic.
//  - The editor diamond and the MOD mark are small SUFFIXES after the name,
//    never a column and never a badge that outweighs the name.
//  - BEN is a HAIRLINE BENCHMARK FOOTER, below a rule, with an en-dash where a
//    rank would be. It is not in the field and it is never ranked.

import type { CSSProperties } from "react";
import { rankRows } from "./challengeLogic";
import {
  CHALLENGE_ACCENT,
  GLYPH_EDITOR,
  GLYPH_ENDASH,
  HAIRLINE,
  INK_FAINT,
  MIDDOT,
  SLATE,
  UI_FONT,
  toneColor,
  toneOf,
  type ChallengeTone,
} from "./challengeTokens";

/** The marks a row can carry, as small suffixes after the name. */
export type LeaderboardMark = "editor" | "moderator";

export interface LeaderboardRow {
  /** Rank, when the caller has already ranked the field. Ties share a rank. */
  rank?: number;
  /** Display name. Truncates. */
  name: string;
  /** The total exactly as it should read, e.g. "+14", "56.2%", "+3,120". */
  total: string;
  /** The number behind `total`. Used to derive rank + tone when needed. */
  value?: number;
  /** Small suffixes: the teal editor diamond and/or the MOD mark. */
  marks?: readonly LeaderboardMark[];
  /** The viewer's own row - tinted and bolder. */
  isYou?: boolean;
  /** Overrides the tone derived from `value` (matchpoints is not zero-centred). */
  tone?: ChallengeTone;
}

/** BEN's footer line - a benchmark, not a rival. */
export interface LeaderboardBenchRow {
  /** Defaults to "BEN". */
  label?: string;
  /** Defaults to "benchmark . unranked". */
  note?: string;
  /** The benchmark total, formatted. */
  total: string;
}

export interface LeaderboardProps {
  /** The field: completed humans only (spec A3). */
  rows: readonly LeaderboardRow[];
  /** BEN's hairline footer row. Omitted -> no footer. */
  benRow?: LeaderboardBenchRow;
  /** The unit heading over the totals column, e.g. "IMPs", "MP %", "Pts". */
  scoringLabel: string;
  /** Challenge accent. */
  accent?: string;
  /** One quiet line under the head, e.g. "5 finished . 2 still playing". */
  note?: string;
  /** One quiet line under the table, e.g. the mark legend. */
  legend?: string;
  /** Rendered when `rows` is empty. */
  emptyLabel?: string;
}

const GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "26px 1fr auto",
  alignItems: "center",
  gap: 10,
};

export function Leaderboard({
  rows,
  benRow,
  scoringLabel,
  accent = CHALLENGE_ACCENT,
  note,
  legend,
  emptyLabel = "No finished players yet.",
}: Readonly<LeaderboardProps>) {
  const ranked = rankRows(rows);

  return (
    <div style={{ fontFamily: UI_FONT, color: "#17211d" }}>
      {note && <div style={{ fontSize: 11.5, color: INK_FAINT, marginBottom: 2 }}>{note}</div>}

      {/* Column heads. */}
      <div
        style={{
          ...GRID,
          padding: "10px 8px 6px",
          fontSize: 10,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: "#a2ada7",
        }}
      >
        <span style={{ textAlign: "center" }}>#</span>
        <span>Player</span>
        <span style={{ textAlign: "right" }}>{scoringLabel}</span>
      </div>

      {ranked.length === 0 && (
        <div style={{ padding: "10px 8px", fontSize: 12.5, color: INK_FAINT }}>{emptyLabel}</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {ranked.map((r, i) => {
          const you = !!r.isYou;
          const marks = r.marks ?? [];
          const totalInk = r.tone ? toneColor(r.tone) : toneColor(toneOf(r.value));
          return (
            <div
              key={`${r.name}-${i}`}
              style={{
                ...GRID,
                padding: "9px 8px",
                borderRadius: 9,
                background: you ? "#eff7f6" : "transparent",
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  textAlign: "center",
                  color: r.rank <= 3 ? "#22302a" : "#8b9a93",
                }}
              >
                {r.rank}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 13.5,
                    fontWeight: you ? 800 : 600,
                    color: you ? accent : "#25332c",
                  }}
                >
                  {r.name}
                </span>
                {marks.includes("editor") && (
                  <span
                    role="img"
                    title="Set the boards - opened the pack editor"
                    aria-label="Set the boards"
                    style={{ flex: "none", fontSize: 10, lineHeight: 1, color: accent }}
                  >
                    {GLYPH_EDITOR}
                  </span>
                )}
                {marks.includes("moderator") && (
                  <span
                    title="Moderator - could see the standings before finishing"
                    style={{
                      flex: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      height: 14,
                      padding: "0 5px",
                      borderRadius: 7,
                      background: "#eef1f4",
                      color: SLATE,
                      fontSize: 8.5,
                      fontWeight: 800,
                      letterSpacing: ".07em",
                      lineHeight: 1,
                    }}
                  >
                    MOD
                  </span>
                )}
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, textAlign: "right", color: totalInk }}>
                {r.total}
              </span>
            </div>
          );
        })}
      </div>

      {/* BEN: hairline slate footer, outside the field, unranked. */}
      {benRow && (
        <div
          style={{
            ...GRID,
            marginTop: 7,
            padding: "11px 8px 3px",
            borderTop: `1px solid ${HAIRLINE}`,
          }}
        >
          {/* No rank: BEN is a benchmark, not a rival. */}
          <span aria-hidden style={{ textAlign: "center", fontSize: 12, color: "#9aa8b0" }}>
            {GLYPH_ENDASH}
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: SLATE }}>{benRow.label ?? "BEN"}</span>
            <span style={{ fontSize: 10.5, color: "#8a949c" }}>
              {benRow.note ?? `benchmark ${MIDDOT} unranked`}
            </span>
          </div>
          <span style={{ fontSize: 14, fontWeight: 800, textAlign: "right", color: SLATE }}>
            {benRow.total}
          </span>
        </div>
      )}

      {legend && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 12,
            paddingTop: 10,
            borderTop: `1px solid ${HAIRLINE}`,
            fontSize: 10,
            color: "#a2ada7",
            flexWrap: "wrap",
          }}
        >
          {legend}
        </div>
      )}
    </div>
  );
}
