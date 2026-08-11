"use client";

// ChallengeResultsOverlay - the standings AS AN OVERLAY OVER THE FELT, never a
// navigation (spec A4; Challenge Table.dc.html, block 3).
//
// The reason is the attempt: a challenge board is a one-attempt, resume-only
// session, so tapping Results must not unmount the table. Scrim + sheet sit on
// top, the felt stays visible underneath - which IS the visual argument that
// nothing was destroyed - and closing returns to the exact same trick with the
// exact same cards gone.
//
// The host mounts this inside the table's own `position:relative` container
// (or wraps it in a portal): everything here is absolutely positioned to its
// offset parent, and it renders nothing at all when closed.
//
// Phone = bottom sheet with a grabber, capped at 78% of the frame so the felt
// it does not need stays visible. Wide = a centred 540px card, no grabber.

import { useEffect } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Leaderboard, type LeaderboardProps } from "./Leaderboard";
import {
  CHALLENGE_ACCENT,
  GLYPH_CLOSE,
  INK,
  INK_FAINT,
  UI_FONT,
  toneColor,
  toneOf,
  type ChallengeTone,
} from "./challengeTokens";

/** One cell of the compact board-by-board strip: the viewer's own line. */
export interface ChallengeBoardCell {
  boardNo: number;
  /** The figure exactly as it should read, e.g. "+3". Empty when not played. */
  text: string;
  /** The number behind it, when the tone should follow the sign. */
  value?: number;
  /** Overrides the tone derived from `value`. */
  tone?: ChallengeTone;
  /** The board open at the table behind this sheet - outlined in the accent. */
  current?: boolean;
}

export interface ChallengeResultsOverlayProps {
  /** Renders nothing when false. */
  open: boolean;
  /** Scrim tap, close button, grabber and Escape all call this. */
  onClose: () => void;
  /**
   * The standings, handed straight to <Leaderboard>.
   *
   * OMITTED WHEN THERE IS NO FIELD. A solo challenge is played against BEN
   * alone, so there is nobody to rank: it passes `children` instead and the
   * sheet shows the comparison where the table of players would have been. An
   * empty leaderboard would be a promise of a field that does not exist.
   */
  standings?: LeaderboardProps;
  /** Rendered in the standings' place (or under them, when both are given). */
  children?: ReactNode;
  /** The viewer's board-by-board line, as a compact scrolling strip. */
  boards: readonly ChallengeBoardCell[];
  /** Phone tier (default true): bottom sheet + grabber. False: centred card. */
  viewportPhone?: boolean;
  /** Sheet heading. Defaults to "Results". */
  heading?: string;
  /** The quiet line under it, e.g. "Tuesday Night Teams . IMPs". */
  subtitle?: string;
  /** Heading over the board strip. Defaults to "Board by board". */
  boardsHeading?: string;
  /** Challenge accent. */
  accent?: string;
}

export function ChallengeResultsOverlay({
  open,
  onClose,
  standings,
  children,
  boards,
  viewportPhone = true,
  heading = "Results",
  subtitle,
  boardsHeading = "Board by board",
  accent = CHALLENGE_ACCENT,
}: Readonly<ChallengeResultsOverlayProps>) {
  // Escape closes. Bound only while open, so a closed overlay owns no listener.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const phone = viewportPhone;
  const sheet: CSSProperties = phone
    ? {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 41,
        maxHeight: "78%",
        display: "flex",
        flexDirection: "column",
        background: "#fff",
        borderRadius: "20px 20px 0 0",
        overflow: "hidden",
        boxShadow: "0 -14px 44px rgba(0,0,0,.42)",
        fontFamily: UI_FONT,
        color: INK,
      }
    : {
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%,-50%)",
        zIndex: 41,
        width: 540,
        maxWidth: "calc(100% - 32px)",
        maxHeight: "82%",
        display: "flex",
        flexDirection: "column",
        background: "#fff",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 22px 60px rgba(0,0,0,.46)",
        fontFamily: UI_FONT,
        color: INK,
      };

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        style={{ position: "absolute", inset: 0, zIndex: 40, background: "rgba(6,14,11,.52)" }}
      />
      <div role="dialog" aria-modal="true" aria-label={heading} style={sheet}>
        {phone && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close results"
            style={{
              flex: "none",
              display: "flex",
              justifyContent: "center",
              padding: "9px 0 3px",
              border: 0,
              background: "transparent",
              cursor: "pointer",
            }}
          >
            <span style={{ display: "block", width: 38, height: 4, borderRadius: 2, background: "#d3dbd6" }} />
          </button>
        )}

        <div
          style={{
            flex: "none",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: phone ? "6px 18px 12px" : "18px 20px 12px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#16201c", lineHeight: 1.2 }}>{heading}</div>
            {subtitle && (
              <div
                style={{
                  marginTop: 3,
                  fontSize: 11.5,
                  color: INK_FAINT,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to the board"
            title="Back to the board"
            style={{
              flex: "none",
              height: 28,
              width: 28,
              border: "1px solid #e4e9e5",
              borderRadius: 9,
              background: "#fff",
              color: "#93a199",
              fontFamily: "inherit",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {GLYPH_CLOSE}
          </button>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: phone ? "0 18px 22px" : "0 20px 20px",
          }}
        >
          {standings && <Leaderboard {...standings} accent={standings.accent ?? accent} />}
          {children}

          {boards.length > 0 && (
            <>
              <div
                style={{
                  marginTop: 14,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "#8b9a93",
                }}
              >
                {boardsHeading}
              </div>
              <div style={{ display: "flex", gap: 5, marginTop: 8, overflowX: "auto", paddingBottom: 4 }}>
                {boards.map((b) => {
                  const here = !!b.current;
                  const ink = b.tone ? toneColor(b.tone) : toneColor(toneOf(b.value));
                  return (
                    <div
                      key={b.boardNo}
                      title={`Board ${b.boardNo}${here ? " - open at the table behind this sheet" : ""}`}
                      style={{
                        flex: "none",
                        width: phone ? 38 : 48,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 2,
                        padding: "6px 2px",
                        borderRadius: 8,
                        background: here ? "#eff7f6" : "#f7faf8",
                        border: `1px solid ${here ? accent : "#e8eeea"}`,
                      }}
                    >
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: here ? accent : "#a2ada7" }}>
                        {b.boardNo}
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: ink }}>{b.text}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
