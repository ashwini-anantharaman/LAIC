"use client";

// BoardSquares - the BBO-minimal numbered-square grid (Challenge Page.dc.html,
// the Boards tab). Deliberately the least decorated surface in the family: it
// exists to pick a board, and nothing else.
//
// Four looks, one per state:
//   "todo"     not played  - dimmed, a plain number
//   "current"  in progress - a teal accent ring, the number in the accent
//   "done"     played      - filled; when the results are unlocked the SCORE
//                            sits in the middle with the board number in the
//                            corner, otherwise the number stays centred
//   selected               - a 2px accent ring on a done square being reviewed
//
// 50px squares, 11px radius, 8px gaps, auto-filled from the left: the canvas's
// metrics, which fit 6 across a 390 phone.

import type { CSSProperties } from "react";
import { CHALLENGE_ACCENT, UI_FONT, toneColor, toneOf, type ChallengeTone } from "./challengeTokens";

/** Where a board stands for THIS viewer. */
export type BoardSquareState = "todo" | "current" | "done";

export interface BoardSquare {
  boardNo: number;
  state: BoardSquareState;
  /** The score inside a done square. Omitted while the results are locked. */
  score?: string;
  /** The number behind `score`, when the tone should follow the sign. */
  value?: number;
  /** Overrides the tone derived from `value`. */
  tone?: ChallengeTone;
  /** The square currently being reviewed. */
  selected?: boolean;
  /** Refuses selection (e.g. a board that is not yours to open yet). */
  disabled?: boolean;
}

export interface BoardSquaresProps {
  squares: readonly BoardSquare[];
  /** Tapping a square. Omit it and the grid is a read-only diagram. */
  onSelect?: (boardNo: number) => void;
  /** Challenge accent. */
  accent?: string;
  /** Square edge in px. Defaults to the canvas's 50. */
  size?: number;
  /** Gap between squares. Defaults to 8. */
  gap?: number;
  /** Optional caption above the grid. */
  caption?: string;
}

export function BoardSquares({
  squares,
  onSelect,
  accent = CHALLENGE_ACCENT,
  size = 50,
  gap = 8,
  caption,
}: Readonly<BoardSquaresProps>) {
  return (
    <div style={{ fontFamily: UI_FONT, display: "flex", flexDirection: "column", gap: 14 }}>
      {caption && <div style={{ flex: "none", fontSize: 12.5, color: "#8b9a93" }}>{caption}</div>}
      <div
        style={{
          flex: "none",
          display: "grid",
          gridTemplateColumns: `repeat(auto-fill,${size}px)`,
          gap,
          justifyContent: "start",
        }}
      >
        {squares.map((sq) => {
          const showScore = sq.state === "done" && !!sq.score;
          const current = sq.state === "current";
          const selected = !!sq.selected;

          let background: string;
          let border: string;
          let numColor: string;
          if (current) {
            background = "#f0faf9";
            border = `2px solid ${accent}`;
            numColor = accent;
          } else if (showScore) {
            background = selected ? "#eef7f5" : "#f5f8f6";
            border = selected ? `2px solid ${accent}` : "1px solid #dfe7e2";
            numColor = "#5a6a63";
          } else if (sq.state === "done") {
            background = "#e9f1ee";
            border = selected ? `2px solid ${accent}` : "1px solid #e0ece7";
            numColor = accent;
          } else {
            background = "#f1f4f2";
            border = "1px solid #f1f4f2";
            numColor = "#9aa8a1";
          }

          const style: CSSProperties = {
            position: "relative",
            width: size,
            height: size,
            padding: 0,
            borderRadius: 11,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background,
            border,
            fontFamily: "inherit",
            cursor: onSelect && !sq.disabled ? "pointer" : "default",
          };

          const stateWord =
            sq.state === "current" ? "in progress" : sq.state === "done" ? "played" : "not played";
          const label = `Board ${sq.boardNo}, ${stateWord}${sq.score ? `, ${sq.score}` : ""}`;

          return (
            <button
              key={sq.boardNo}
              type="button"
              disabled={!onSelect || sq.disabled}
              aria-label={label}
              aria-current={current ? "step" : undefined}
              aria-pressed={selected || undefined}
              title={label}
              onClick={onSelect ? () => onSelect(sq.boardNo) : undefined}
              style={style}
            >
              {showScore ? (
                <>
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: 4,
                      left: 6,
                      fontSize: 8.5,
                      fontWeight: 700,
                      lineHeight: 1,
                      color: "#9aa8a1",
                    }}
                  >
                    {sq.boardNo}
                  </span>
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 800,
                      lineHeight: 1,
                      color: sq.tone ? toneColor(sq.tone) : toneColor(toneOf(sq.value)),
                    }}
                  >
                    {sq.score}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 14, fontWeight: 800, lineHeight: 1, color: numColor }}>
                  {sq.boardNo}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
