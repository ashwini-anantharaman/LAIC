"use client";

// ChallengeStrip - the one thin band of challenge chrome that sits ABOVE the
// table's top toolbar (Challenge Table.dc.html, block 1; spec A4).
//
// It is a SIBLING of PlayTable, never a PlayTable prop and never a fork: the
// table below owns every table control, so the strip says only three things -
// what challenge this is, where you are in it, and the one way to the
// standings. No back arrow, no menu, no avatars.
//
// Two spec rules are load-bearing here:
//  - the Results button is ABSENT when `showResults` is false, not greyed
//    (spec A4): a disabled control advertises a thing you cannot have.
//  - the bottom border IS the progress rule: a 2px line filled to the boards
//    already behind you.
//
// Phone metrics are the canvas's, verified at 390x844: 40px tall, 12px side
// padding, 8px gap, 26px button.

import type { CSSProperties } from "react";
import { CHALLENGE_ACCENT, STRIP_BG, UI_FONT } from "./challengeTokens";

/** The strip's phone height - the first band of the table's 844px budget. */
export const CHALLENGE_STRIP_HEIGHT = 40;

export interface ChallengeStripProps {
  /** Challenge title. Truncates with an ellipsis; never wraps the band open. */
  title: string;
  /** The board being played, 1-based. */
  boardNo: number;
  /** How many boards the challenge holds. */
  boardsTotal: number;
  /**
   * `resultsUnlocked` from spec A3
   * (viewerHasFinished || viewerIsModerator || standingsVisibility === "always").
   * False renders NO button at all.
   */
  showResults: boolean;
  /** Opens the results overlay. Never navigates - the attempt must survive. */
  onResults: () => void;
  /** Challenge accent; tints the progress fill. */
  accent?: string;
  /** Band height, when the host's budget wants something other than 40. */
  height?: number;
}

export function ChallengeStrip({
  title,
  boardNo,
  boardsTotal,
  showResults,
  onResults,
  accent = CHALLENGE_ACCENT,
  height = CHALLENGE_STRIP_HEIGHT,
}: Readonly<ChallengeStripProps>) {
  const total = Math.max(0, Math.round(boardsTotal));
  const no = Math.max(1, Math.round(boardNo));
  const done = Math.max(0, Math.min(total, no - 1));
  const donePct = total > 0 ? Math.round((done / total) * 100) : 0;

  const shell: CSSProperties = {
    position: "relative",
    flex: "none",
    display: "flex",
    alignItems: "center",
    gap: 8,
    height,
    padding: "0 12px",
    background: STRIP_BG,
    fontFamily: UI_FONT,
  };

  return (
    <div style={shell} role="group" aria-label="Challenge">
      <span
        title={title}
        style={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: 12.5,
          fontWeight: 700,
          letterSpacing: ".005em",
          color: "#eaf1ef",
        }}
      >
        {title}
      </span>

      <span
        style={{
          flex: "none",
          padding: "2px 8px",
          borderRadius: 6,
          background: "rgba(255,255,255,.06)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: ".03em",
          color: "#93aaa7",
          whiteSpace: "nowrap",
        }}
      >
        {`Board ${no} of ${total}`}
      </span>

      <span style={{ flex: 1, minWidth: 8 }} />

      {/* Absent, not disabled, when the results are locked (spec A4). */}
      {showResults && (
        <button
          type="button"
          onClick={onResults}
          title="Standings for this challenge"
          style={{
            flex: "none",
            height: 26,
            padding: "0 12px",
            border: "1px solid rgba(255,255,255,.22)",
            borderRadius: 7,
            background: "rgba(255,255,255,.06)",
            color: "#dbe8e6",
            fontFamily: "inherit",
            fontSize: 11.5,
            fontWeight: 700,
            lineHeight: 1,
            whiteSpace: "nowrap",
            cursor: "pointer",
          }}
        >
          Results
        </button>
      )}

      {/* The bottom border doubles as the progress rule. */}
      <span
        role="progressbar"
        aria-label="Challenge progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done} of ${total} boards done`}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 2,
          background: "rgba(255,255,255,.10)",
          display: "block",
        }}
      >
        <span style={{ display: "block", height: "100%", width: `${donePct}%`, background: accent }} />
      </span>
    </div>
  );
}
