"use client";

// The challenge chrome around an UNFORKED table (spec ADDENDUM A4).
//
// Two things live here and nothing else:
//
//  - THE BAND BUDGET. The strip is a sibling above the table, not a PlayTable
//    prop: this box is a column, the strip takes its 40px as `flex: none`, and
//    the table gets `flex: 1` of what is left. PlayTable measures its own box
//    and prices its bands against THAT, so handing it a 40px-shorter box IS how
//    the strip enters the budget — there is no second height to keep in sync
//    and nothing can overflow the frame.
//
//  - THE OVERLAY'S OFFSET PARENT. ChallengeResultsOverlay is absolutely
//    positioned and portal-free, so it needs a `position: relative` ancestor.
//    That ancestor is this whole box (strip included), which is why the sheet
//    rises from the bottom of the frame exactly as the canvas has it. Results
//    are an overlay over the felt, NEVER a navigation: a challenge board is a
//    one-attempt session, so opening the standings must not unmount the table,
//    and closing returns to the exact same trick.

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CHALLENGE_STRIP_HEIGHT,
  ChallengeDoneBar,
  ChallengeResultsOverlay,
  ChallengeStrip,
  type ChallengeBoardCell,
  type ChallengeStripProps,
  type LeaderboardProps,
  type OnwardStep,
} from "@bridge/table-ui";

export interface ChallengeTableChromeProps {
  /** Title / board k of N / whether the Results button exists at all. */
  strip: Omit<ChallengeStripProps, "onResults">;
  standings: LeaderboardProps;
  boards: readonly ChallengeBoardCell[];
  subtitle?: string;
  /** The board has finished: the done bar takes a band under the table. */
  done?: boolean;
  /** Where the done bar sends you. Required once `done`. */
  onward?: OnwardStep;
  /** How the board finished, for the done bar's line. */
  resultLine?: string;
  resultScore?: string;
  /**
   * A PUZZLE board's brief — what to solve for — shown as its own thin band
   * under the strip for the whole attempt. Like the strip, it takes its height
   * as flex:none, so PlayTable prices its bands against what is left.
   */
  puzzleBrief?: string;
  /** The authored ANSWER paragraph, revealed only once the board is done. */
  puzzleExplanation?: string;
  /** The table itself, rendered on the server and slotted in untouched. */
  children: ReactNode;
}

export function ChallengeTableChrome({
  strip,
  standings,
  boards,
  subtitle,
  done = false,
  onward,
  resultLine,
  resultScore,
  puzzleBrief,
  puzzleExplanation,
  children,
}: Readonly<ChallengeTableChromeProps>) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  // Which tier the sheet dresses as. Measured from the box with PlayTable's own
  // rule, so the overlay and the table below it never disagree about the tier.
  const [phone, setPhone] = useState(true);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const read = () => {
      const w = el.clientWidth || 390;
      const h = el.clientHeight || 844;
      setPhone(w / Math.max(1, h) < 1.25 && w < 640);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A locked challenge renders no Results button, so it can never be open.
  const showing = open && strip.showResults;

  return (
    <div
      ref={boxRef}
      style={{
        position: "relative",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <ChallengeStrip
        {...strip}
        height={CHALLENGE_STRIP_HEIGHT}
        onResults={() => setOpen(true)}
      />
      {/* The puzzle's brief: what to solve for, in the column's own voice. Its
          band comes out of the table's budget the same way the strip's does. */}
      {puzzleBrief && (
        <div
          style={{
            flex: "none",
            padding: "6px 12px",
            font: "500 12.5px/1.45 system-ui, sans-serif",
            background: "#fdf6e3",
            color: "#5b4a1f",
            borderBottom: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          🧩 {puzzleBrief}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>{children}</div>
      {/* THE ANSWER, only once the board is done — a puzzle that explains
          itself early is not a puzzle. Scrolls within its own band so a long
          explanation never squeezes the felt out of the frame. */}
      {done && puzzleExplanation && (
        <div
          style={{
            flex: "none",
            maxHeight: 140,
            overflowY: "auto",
            padding: "8px 12px",
            font: "400 12.5px/1.5 system-ui, sans-serif",
            background: "#f7f7f4",
            color: "#333",
            borderTop: "1px solid rgba(0,0,0,0.08)",
            whiteSpace: "pre-wrap",
          }}
        >
          <strong>Answer.</strong> {puzzleExplanation}
        </div>
      )}
      {/* Only once the board is over — the band it takes comes straight out of
          the table's budget, so it must not exist a trick early. */}
      {done && onward && (
        <ChallengeDoneBar
          onward={onward}
          resultLine={resultLine}
          resultScore={resultScore}
        />
      )}
      <ChallengeResultsOverlay
        open={showing}
        onClose={() => setOpen(false)}
        standings={standings}
        boards={boards}
        viewportPhone={phone}
        subtitle={subtitle}
      />
    </div>
  );
}
