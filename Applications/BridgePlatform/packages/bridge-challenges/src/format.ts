// How a challenge figure PRINTS — the display half of the results view model,
// moved down here so the server-rendered results page and the embedded solo
// player format the same fact the same way.
//
// It is not decoration. Two of the decisions below are domain rules with a
// paper trail:
//
//  - a contract is compared on level/strain/doubling, and a difference from
//    BEN is reported as a DIFFERENCE, never as a mistake (owner, 2026-08-10);
//    `verdictLabel` is the only place that sentence is written.
//  - matchpoints are not zero-centred, so a tone is always chosen by mode
//    rather than by the sign of a number (`toneFor`).
//
// Pure strings and unions: no React, no store, no dates.

import type { ChallengeScoring } from "./types";
import type { ContractVerdict, ReachedContract } from "./scoring";

/**
 * How a figure reads: better, worse, or flat. Structurally the challenge
 * family's `ChallengeTone` in @bridge/table-ui — restated rather than imported
 * because the component package deliberately depends on nothing here.
 */
export type FigureTone = "pos" | "neg" | "neutral";

/** Glyphs as escapes, so nothing invisible is ever smuggled in by a paste. */
const EMDASH = "—";

// ── scored figures ──────────────────────────────────────────────────────────

/** The unit chip over the standings, e.g. "IMPs vs datum". */
export function scoringUnit(mode: ChallengeScoring): string {
  return mode === "mp" ? "Matchpoints %" : mode === "total" ? "Total points" : "IMPs vs datum";
}

/** The standings column head, e.g. "IMPs". */
export function scoringShort(mode: ChallengeScoring): string {
  return mode === "mp" ? "MP %" : mode === "total" ? "Pts" : "IMPs";
}

/** The scoring name in the header subtitle. */
export function scoringName(mode: ChallengeScoring): string {
  return mode === "mp" ? "Matchpoints" : mode === "total" ? "Total points" : "IMPs";
}

/**
 * The figure printed in a grid cell or a board square. IMPs and total points
 * are signed integers; matchpoints are a bare rounded percentage (the "%" is
 * carried by the column head — a 46px cell has no room for it).
 */
export function formatCell(mode: ChallengeScoring, value: number): string {
  const r = Math.round(value);
  if (mode === "mp") return `${r}`;
  return r > 0 ? `+${r}` : `${r}`;
}

/**
 * The number BEHIND a printed cell — what the leader highlight reads. It is
 * the rounded figure, not the raw score, so what is tinted matches what is
 * read (ADDENDUM A5).
 */
export function cellValue(value: number): number {
  const r = Math.round(value);
  return r === 0 ? 0 : r;
}

/**
 * A challenge total. Matchpoints are a session percentage to one decimal;
 * IMPs are signed integers; total points are signed and grouped.
 */
export function formatTotal(mode: ChallengeScoring, value: number): string {
  if (mode === "mp") return `${value.toFixed(1)}%`;
  const r = Math.round(value);
  if (mode === "total") return `${r >= 0 ? "+" : ""}${r.toLocaleString("en-US")}`;
  return `${r >= 0 ? "+" : ""}${r}`;
}

/**
 * How a figure reads. Matchpoints are NOT zero-centred — 50% is flat — so the
 * tone is always passed explicitly rather than derived from the sign.
 */
export function toneFor(mode: ChallengeScoring, value: number): FigureTone {
  if (mode === "mp") return value >= 55 ? "pos" : value <= 45 ? "neg" : "neutral";
  return value > 0 ? "pos" : value < 0 ? "neg" : "neutral";
}

// ── contracts, and how they stand beside BEN's ──────────────────────────────

const STRAIN_GLYPH: Record<string, string> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
  N: "NT",
};

/**
 * A contract in a 46px grid cell: "4♠S", "3NT×W", "Pass". Empty when there is
 * no line at all — a blank cell, never a zero.
 */
export function contractCell(contract: ReachedContract | undefined): string {
  if (contract === undefined) return "";
  if (contract === null) return "Pass";
  const dbl = contract.doubled === 1 ? "×" : contract.doubled === 2 ? "××" : "";
  return `${contract.level}${STRAIN_GLYPH[contract.strain] ?? contract.strain}${dbl}${contract.declarer}`;
}

/** The same contract in prose: "4♠ by S", "Passed out", or an em-dash. */
export function contractPhrase(contract: ReachedContract | undefined): string {
  if (contract === undefined) return EMDASH;
  if (contract === null) return "Passed out";
  const dbl = contract.doubled === 1 ? " ×" : contract.doubled === 2 ? " ××" : "";
  return `${contract.level}${STRAIN_GLYPH[contract.strain] ?? contract.strain}${dbl} by ${contract.declarer}`;
}

/**
 * How a board reads against BEN's auction. NEVER "wrong": BEN's bidding system
 * is not necessarily the convention a lesson teaches, so a different contract
 * is reported as a difference and toned NEUTRAL, not negative (owner,
 * 2026-08-10). Only a match is ever tinted.
 */
export function verdictLabel(verdict: ContractVerdict, sameDeclarer: boolean): string {
  if (verdict === "unrated") return "BEN has not bid this board yet";
  if (verdict === "differed") return "A different contract";
  return sameDeclarer ? "Matched BEN" : "Matched BEN, from the other side";
}

/** Matched tints; differed and unrated stay quiet. There is no negative tone. */
export function verdictTone(verdict: ContractVerdict): FigureTone {
  return verdict === "matched" ? "pos" : "neutral";
}
