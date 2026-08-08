"use client";

// ChallengeDoneBar - the way onward from a finished challenge board.
//
// A challenge board freezes the moment its last trick resolves, and the pointer
// moves on server-side; until this bar existed nothing on screen said so, and
// the only way to the next board was to walk back out to the challenge list.
// The board is over, so taking a band from the table below is the right trade -
// PlayTable re-prices its bands against the shorter box, and the table visibly
// settling is itself the signal that this deal is done.
//
// It is a SIBLING of the table, like the strip: no PlayTable prop, no fork. A
// real 44px target, never a 26px chip - this is the one control that has to be
// hit, and it is a link, so it survives a reload and can be opened in a tab.

import type { CSSProperties } from "react";
import { CHALLENGE_ACCENT, GLYPH_ARROW, INK_FAINT, STRIP_BG, UI_FONT } from "./challengeTokens";
import type { OnwardStep } from "./challengeLogic";

export interface ChallengeDoneBarProps {
  /** How the board finished, e.g. "4S by South, made 4" - may be empty. */
  resultLine?: string;
  /** The board's figure as it should read, e.g. "+620". */
  resultScore?: string;
  /** Label / href / note, from `onwardFromBoard`. */
  onward: OnwardStep;
  accent?: string;
  height?: number;
}

/** The bar's phone height: a 44px target plus its padding. */
export const CHALLENGE_DONE_BAR_HEIGHT = 60;

export function ChallengeDoneBar({
  resultLine,
  resultScore,
  onward,
  accent = CHALLENGE_ACCENT,
  height = CHALLENGE_DONE_BAR_HEIGHT,
}: Readonly<ChallengeDoneBarProps>) {
  const shell: CSSProperties = {
    flex: "none",
    display: "flex",
    alignItems: "center",
    gap: 10,
    height,
    padding: "0 12px",
    background: STRIP_BG,
    borderTop: "1px solid rgba(255,255,255,.10)",
    fontFamily: UI_FONT,
  };

  return (
    <div style={shell} role="group" aria-label="Board complete">
      <span style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 13,
            fontWeight: 700,
            color: "#eaf1ef",
          }}
        >
          {resultLine || "Board complete"}
          {resultScore ? <span style={{ color: accent }}>{`  ${resultScore}`}</span> : null}
        </span>
        <span style={{ fontSize: 11, color: INK_FAINT, whiteSpace: "nowrap" }}>{onward.note}</span>
      </span>

      <a
        href={onward.href}
        style={{
          flex: "none",
          display: "inline-flex",
          alignItems: "center",
          height: 44,
          padding: "0 18px",
          borderRadius: 9,
          background: accent,
          color: "#fff",
          fontFamily: "inherit",
          fontSize: 14,
          fontWeight: 800,
          lineHeight: 1,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        {`${onward.label} ${GLYPH_ARROW}`}
      </a>
    </div>
  );
}
