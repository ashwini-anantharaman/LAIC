// The challenge components' real logic, kept OUT of the .tsx files so it is
// plain, testable TypeScript: shared-rank ties (spec A5), the board-row leader
// computed on the DISPLAYED figure (spec A5), and the two-cell compare
// selection state machine (spec A6 / A5's "Compare by picking two cells").
//
// Nothing here touches React, the DOM or any challenge data package - the
// components take plain props, and so does this.

// ---------------------------------------------------------------------------
// Shared ranks
// ---------------------------------------------------------------------------

/** Anything the ranker can order: a given rank, or a numeric total to sort on. */
export interface Rankable {
  /** Rank supplied by the caller. When every row has one, it is used as-is. */
  rank?: number;
  /** The numeric total behind the displayed figure; ranks are derived from it. */
  value?: number;
}

/**
 * Standings order with SHARED ranks for ties (1, 2, 2, 4 - never 1, 2, 2, 3).
 *
 * If every row already carries a `rank` the caller's order is left alone; that
 * is the case where the store has ranked the field already. Otherwise the rows
 * are sorted by `value` descending (stable, so equal values keep the caller's
 * order) and competition ranks are assigned.
 */
export function rankRows<T extends Rankable>(rows: readonly T[]): (T & { rank: number })[] {
  const allRanked = rows.length > 0 && rows.every((r) => typeof r.rank === "number");
  if (allRanked) return rows.map((r) => ({ ...r, rank: r.rank as number }));

  const keyed = rows.map((r, i) => ({ r, i }));
  keyed.sort((a, b) => {
    const av = typeof a.r.value === "number" ? a.r.value : Number.NEGATIVE_INFINITY;
    const bv = typeof b.r.value === "number" ? b.r.value : Number.NEGATIVE_INFINITY;
    return bv === av ? a.i - b.i : bv - av;
  });

  let rank = 0;
  let seen = 0;
  let prev: number | null = null;
  return keyed.map(({ r }) => {
    seen += 1;
    const v = typeof r.value === "number" ? r.value : Number.NEGATIVE_INFINITY;
    if (prev === null || v !== prev) {
      rank = seen;
      prev = v;
    }
    return { ...r, rank };
  });
}

// ---------------------------------------------------------------------------
// Board-row leader
// ---------------------------------------------------------------------------

/** A scorecard figure: what is printed, and optionally the number behind it. */
export interface DisplayedFigure {
  /** The figure exactly as it is printed, e.g. "+3", "55", "-1,430". */
  text?: string;
  /** The number behind it. Absent -> parsed back out of `text`. */
  value?: number;
}

/**
 * The number a reader actually sees. `value` wins when given; otherwise the
 * printed text is parsed (leading sign, thousands separators and a trailing %
 * are all tolerated). NaN when there is nothing to read.
 */
export function displayedValue(cell: DisplayedFigure | undefined): number {
  if (!cell) return Number.NaN;
  if (typeof cell.value === "number" && Number.isFinite(cell.value)) return cell.value;
  const raw = (cell.text ?? "").replace(/,/g, "").replace(/%/g, "").trim();
  if (!raw) return Number.NaN;
  const n = Number(raw.replace(/^\+/, ""));
  return Number.isFinite(n) ? n : Number.NaN;
}

/**
 * Which cells in one board row are the leader - the BEST score on that board.
 * Computed on the DISPLAYED figure so what is tinted matches what is read
 * (spec A5), and TIES ALL HIGHLIGHT. A row with no readable figure has no
 * leader at all.
 */
export function leaderFlags(cells: readonly (DisplayedFigure | undefined)[]): boolean[] {
  const vals = cells.map(displayedValue);
  let best = Number.NEGATIVE_INFINITY;
  for (const v of vals) if (Number.isFinite(v) && v > best) best = v;
  if (!Number.isFinite(best)) return vals.map(() => false);
  return vals.map((v) => Number.isFinite(v) && v === best);
}

// ---------------------------------------------------------------------------
// Compare selection (two cells, same board row)
// ---------------------------------------------------------------------------

/** One picked cell: a board row and the column key of a player (or BEN). */
export interface ComparePick {
  boardNo: number;
  key: string;
}

/** Selection mode plus the picks made so far (never more than two). */
export interface CompareState {
  active: boolean;
  picks: readonly ComparePick[];
}

export type CompareAction =
  | { type: "start" }
  | { type: "cancel" }
  | { type: "pick"; boardNo: number; key: string };

/** Idle: not selecting, nothing picked. */
export const COMPARE_IDLE: CompareState = { active: false, picks: [] };

/**
 * The whole selection contract in one reducer:
 *
 *  - `start`  enters selection mode with an empty pair.
 *  - `cancel` leaves it and drops the picks.
 *  - `pick`   is IGNORED unless selecting; picking the SAME cell again
 *             de-selects it; a cell in another board row is refused (that row
 *             is inert in the UI); a third pick is refused.
 *
 * Every rejection returns the state object unchanged, so a component can use
 * referential equality to tell "nothing happened" from "something did".
 */
export function compareReduce(state: CompareState, action: CompareAction): CompareState {
  switch (action.type) {
    case "start":
      return { active: true, picks: [] };
    case "cancel":
      return COMPARE_IDLE;
    case "pick": {
      if (!state.active) return state;
      const { boardNo, key } = action;
      const already = state.picks.some((p) => p.boardNo === boardNo && p.key === key);
      if (already) {
        return {
          active: true,
          picks: state.picks.filter((p) => !(p.boardNo === boardNo && p.key === key)),
        };
      }
      const first = state.picks[0];
      if (first && first.boardNo !== boardNo) return state;
      if (state.picks.length >= 2) return state;
      return { active: true, picks: [...state.picks, { boardNo, key }] };
    }
    default:
      return state;
  }
}

/** The confirmed pair, or null while the selection is incomplete. */
export function comparePair(state: CompareState): { boardNo: number; a: string; b: string } | null {
  const [a, b] = state.picks;
  if (!a || !b) return null;
  return { boardNo: a.boardNo, a: a.key, b: b.key };
}

/** True when a board row must dim and go inert (selection started elsewhere). */
export function compareRowInert(state: CompareState, boardNo: number): boolean {
  const first = state.picks[0];
  return state.active && !!first && first.boardNo !== boardNo;
}

/** True when this exact cell is one of the picks. */
export function comparePicked(state: CompareState, boardNo: number, key: string): boolean {
  return state.picks.some((p) => p.boardNo === boardNo && p.key === key);
}
