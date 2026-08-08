"use client";

// Scorecard - the board-by-board grid: boards x players, with BEN as a COLUMN
// (Challenge Page.dc.html; spec A5/A6). Two behaviours are the whole point of
// this component and both live in challengeLogic so they can be tested:
//
//  1. BOARD LEADER. In each board row the best score is tinted and bolder, and
//     it is computed on the DISPLAYED figure so what is tinted matches what is
//     read. Ties ALL highlight. BEN's column takes part - it is the benchmark
//     everyone is measured against, so it can lead a board.
//
//  2. COMPARE BY PICKING TWO CELLS. A left-aligned Compare button above the
//     grid enters selection mode. The first click picks a (board, player)
//     cell; the second MUST be in the same board row - every other row dims and
//     goes inert, with a one-line hint saying which row you started on.
//     Clicking a pick again de-selects it. Cancel is always visible while
//     selecting. On a confirmed pair, `onCompare({boardNo, a, b})` fires and
//     the grid returns to idle. Because BEN is a column, comparing against BEN
//     needs no separate control.
//
// The grid scrolls horizontally on a phone (46px cells, 46px row label); the
// control row above it is a fixed height and the hint sits on its own two-line
// row, so changing selection state never reflows the grid under a finger.

import { useReducer } from "react";
import type { CSSProperties } from "react";
import {
  COMPARE_IDLE,
  compareReduce,
  comparePair,
  comparePicked,
  compareRowInert,
  leaderFlags,
} from "./challengeLogic";
import {
  CHALLENGE_ACCENT,
  GLYPH_CLOSE,
  GLYPH_COMPARE,
  GLYPH_EMDASH,
  MIDDOT,
  SLATE,
  UI_FONT,
  toneColor,
  toneOf,
  type ChallengeTone,
} from "./challengeTokens";

/** One column: a player of the field, or BEN. */
export interface ScorecardColumn {
  /** Stable id used in `onCompare` - a userId, or "BEN". */
  key: string;
  /** The short code in the header, e.g. "MO", "You", "BEN". */
  label: string;
  /** Full name for titles and screen readers. Defaults to `label`. */
  name?: string;
  /** The viewer's own column - tinted. */
  isYou?: boolean;
  /** BEN's column - slate, and never ranked anywhere else. */
  isBenchmark?: boolean;
}

/** One figure in the grid. */
export interface ScorecardCell {
  /** The figure exactly as it should read, e.g. "+3", "55", "-2". */
  text: string;
  /** The number behind it. Absent -> parsed from `text` for the leader math. */
  value?: number;
  /** Overrides the tone derived from `value`. */
  tone?: ChallengeTone;
}

/** One board row: as many cells as there are columns, in the same order. */
export interface ScorecardRow {
  boardNo: number;
  /** Row label. Defaults to "Bd n". */
  label?: string;
  cells: readonly ScorecardCell[];
}

export interface ScorecardProps {
  /** Columns, left to right. BEN belongs here, flagged `isBenchmark`. */
  columns: readonly ScorecardColumn[];
  /** Board rows, top to bottom. */
  rows: readonly ScorecardRow[];
  /** Optional totals footer, one entry per column. */
  totals?: readonly ScorecardCell[];
  /**
   * Fires with a confirmed pair. Omit it and the Compare control is not
   * rendered at all - the grid is then read-only.
   */
  onCompare?: (selection: { boardNo: number; a: string; b: string }) => void;
  /** Challenge accent. */
  accent?: string;
  /** The quiet line under the grid. A default explains the tint. */
  legend?: string;
  /** Phone tier (default true): 46px cells instead of 54px. */
  viewportPhone?: boolean;
}

const DEFAULT_LEGEND =
  "Tinted cell = best score on that board (ties share it). BEN is a benchmark column and is never ranked.";

const LABEL_W = 46;

export function Scorecard({
  columns,
  rows,
  totals,
  onCompare,
  accent = CHALLENGE_ACCENT,
  legend = DEFAULT_LEGEND,
  viewportPhone = true,
}: Readonly<ScorecardProps>) {
  const [cmp, dispatch] = useReducer(compareReduce, COMPARE_IDLE);

  const canCompare = typeof onCompare === "function";
  const selecting = canCompare && cmp.active;
  const pair = comparePair(cmp);
  const cellW = viewportPhone ? 46 : 54;
  const minWidth = LABEL_W + columns.length * (cellW + 4) + 8;

  const nameOf = (key: string) => {
    const col = columns.find((c) => c.key === key);
    return col ? (col.name ?? col.label) : key;
  };

  const first = cmp.picks[0];
  const hint = !selecting
    ? "Pick two cells on the same board to compare those two lines."
    : !first
      ? "Pick two players on the same board."
      : pair
        ? `Board ${pair.boardNo} ${MIDDOT} ${nameOf(pair.a)} vs ${nameOf(pair.b)}`
        : `Board ${first.boardNo}: ${nameOf(first.key)} picked ${GLYPH_EMDASH} now pick a second player in that row.`;
  const hintStyle: CSSProperties = {
    marginTop: 6,
    minHeight: 34,
    lineHeight: 1.45,
    fontSize: pair ? 12 : 11.5,
    fontWeight: pair ? 800 : selecting && first ? 700 : 600,
    color: pair ? "#22302a" : selecting ? (first ? accent : "#5f6f68") : "#9aa8a1",
  };

  const openComparison = () => {
    if (!pair || !onCompare) return;
    onCompare(pair);
    dispatch({ type: "cancel" });
  };

  const headStyle = (col: ScorecardColumn): CSSProperties => ({
    width: cellW,
    flex: "none",
    textAlign: "center",
    padding: "5px 2px",
    borderRadius: "7px 7px 0 0",
    fontSize: 10.5,
    fontWeight: 800,
    background: col.isBenchmark ? "#eef1f4" : col.isYou ? "#eff7f6" : "#f7faf8",
    color: col.isBenchmark ? SLATE : col.isYou ? accent : "#5a6a63",
  });

  return (
    <div style={{ fontFamily: UI_FONT, color: "#17211d" }}>
      {/* Compare control: buttons on one row, hint on its own, so switching
          state never reflows the grid mid-selection. */}
      {canCompare && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", minHeight: 32 }}>
            {!selecting && (
              <button
                type="button"
                onClick={() => dispatch({ type: "start" })}
                style={{
                  flex: "none",
                  height: 32,
                  padding: "0 13px",
                  border: "1px solid #cfe1de",
                  borderRadius: 9,
                  background: "#eff7f6",
                  color: accent,
                  fontFamily: "inherit",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {`${GLYPH_COMPARE} Compare`}
              </button>
            )}
            {selecting && (
              <button
                type="button"
                onClick={() => dispatch({ type: "cancel" })}
                title="Leave selection mode"
                style={{
                  flex: "none",
                  height: 32,
                  padding: "0 12px",
                  border: "1px solid #e0e6e2",
                  borderRadius: 9,
                  background: "#fff",
                  color: "#7d8a83",
                  fontFamily: "inherit",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {`${GLYPH_CLOSE} Cancel`}
              </button>
            )}
            {selecting && pair && (
              <button
                type="button"
                onClick={openComparison}
                style={{
                  flex: "none",
                  height: 32,
                  padding: "0 14px",
                  border: 0,
                  borderRadius: 9,
                  background: accent,
                  color: "#fff",
                  fontFamily: "inherit",
                  fontSize: 12.5,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Open comparison
              </button>
            )}
          </div>
          <div style={hintStyle} aria-live="polite">
            {hint}
          </div>
        </div>
      )}

      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ minWidth }}>
          {/* Column heads. */}
          <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
            <span style={{ width: LABEL_W, flex: "none" }} />
            {columns.map((c) => (
              <span key={c.key} style={headStyle(c)} title={c.name ?? c.label}>
                {c.label}
              </span>
            ))}
          </div>

          {/* Board rows. */}
          {rows.map((row) => {
            const flags = leaderFlags(row.cells);
            const rowInert = compareRowInert(cmp, row.boardNo);
            return (
              <div
                key={row.boardNo}
                style={{ display: "flex", gap: 4, marginBottom: 3, alignItems: "stretch" }}
              >
                <span
                  style={{
                    width: LABEL_W,
                    flex: "none",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 7px",
                    borderRadius: 7,
                    background: "#f7faf8",
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#3f4f48",
                    opacity: rowInert ? 0.32 : 1,
                  }}
                >
                  {row.label ?? `Bd ${row.boardNo}`}
                </span>
                {columns.map((col, i) => {
                  const cell = row.cells[i];
                  const text = cell?.text ?? "";
                  const leader = !!flags[i];
                  const picked = comparePicked(cmp, row.boardNo, col.key);
                  const pickable = selecting && !rowInert;
                  const full = col.name ?? col.label;

                  const bg = picked
                    ? "#d9efeb"
                    : leader
                      ? "#e4f2ef"
                      : col.isBenchmark
                        ? "#f6f8f9"
                        : col.isYou
                          ? "#f3faf9"
                          : "#fff";
                  const border = picked
                    ? `2px solid ${accent}`
                    : pickable
                      ? "1px dashed #b3d2ce"
                      : leader
                        ? "1px solid #a9d3cd"
                        : col.isYou
                          ? "1px solid #dcefec"
                          : col.isBenchmark
                            ? "1px solid #dde3e7"
                            : "1px solid #eef2ef";

                  const title = !selecting
                    ? leader
                      ? `Best on Board ${row.boardNo}`
                      : ""
                    : rowInert
                      ? `Not this row - both picks must be on Board ${first ? first.boardNo : row.boardNo}`
                      : picked
                        ? "Click again to deselect"
                        : `Pick ${full} on Board ${row.boardNo}`;

                  return (
                    <button
                      key={col.key}
                      type="button"
                      // Idle and inert cells are disabled: they are not tab
                      // stops, so a read-only grid adds nothing to the tab
                      // order and a dimmed row cannot be reached by keyboard.
                      disabled={!pickable}
                      aria-pressed={pickable ? picked : undefined}
                      aria-label={`${full}, board ${row.boardNo}${text ? `: ${text}` : ""}${leader ? ", best on this board" : ""}`}
                      title={title}
                      onClick={() => dispatch({ type: "pick", boardNo: row.boardNo, key: col.key })}
                      style={{
                        width: cellW,
                        flex: "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 6,
                        padding: picked ? "5px 1px" : "6px 2px",
                        background: bg,
                        border,
                        fontFamily: "inherit",
                        fontSize: 11.5,
                        fontWeight: leader ? 800 : col.isYou || col.isBenchmark ? 700 : 600,
                        color: cell?.tone ? toneColor(cell.tone) : toneColor(toneOf(cell?.value)),
                        opacity: rowInert ? 0.32 : 1,
                        cursor: !selecting ? "default" : rowInert ? "not-allowed" : "pointer",
                      }}
                    >
                      {text}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* Totals footer. */}
          {totals && totals.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 4,
                marginTop: 6,
                paddingTop: 6,
                borderTop: "2px solid #eef2ef",
                alignItems: "stretch",
              }}
            >
              <span
                style={{
                  width: LABEL_W,
                  flex: "none",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 7px",
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: ".04em",
                  textTransform: "uppercase",
                  color: "#8b9a93",
                }}
              >
                Total
              </span>
              {columns.map((col, i) => {
                const t = totals[i];
                return (
                  <span
                    key={col.key}
                    style={{
                      width: cellW,
                      flex: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "6px 2px",
                      borderRadius: 6,
                      background: col.isBenchmark ? "#eef1f4" : col.isYou ? "#eff7f6" : "#f7faf8",
                      fontSize: 11,
                      fontWeight: 800,
                      color: col.isBenchmark
                        ? SLATE
                        : t?.tone
                          ? toneColor(t.tone)
                          : toneColor(toneOf(t?.value)),
                    }}
                  >
                    {t?.text ?? ""}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {legend && (
        <div style={{ fontSize: 10.5, lineHeight: 1.5, color: "#9aa8a1", marginTop: 8 }}>{legend}</div>
      )}
    </div>
  );
}
