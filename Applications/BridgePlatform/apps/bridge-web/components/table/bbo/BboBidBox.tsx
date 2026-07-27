"use client";

// BBO-view bidding box (rebuilt against a real BBO screenshot): the two-click
// flow BBO uses by default. One row: the big green Pass, red X / blue XX when
// legal, then ONLY the legal level numbers (after 3NT you see just 4 5 6 7,
// like BBO). Tapping a level swaps the numbers for that level's legal strains
// (‹ backs out). Legality is the engine's real `legalCalls` set passed from
// the server; every concrete call posts the same `bidAction` the classic
// BiddingBox posts.
//
// FIXED SIZE (2026-07-24): the buttons are fixed pixels and never scale with
// the window — they only wrap to a second row when the felt is very narrow.
// When it isn't your turn the box stays present but disabled, so the bidding
// options are ALWAYS visible during the auction and nothing shifts.

import { useState } from "react";
import type { Suit } from "@bridge/events";
import { bidAction } from "@/app/bridge/table/actions";

const STRAINS = ["C", "D", "H", "S", "N"] as const;
const GLYPH: Record<Suit | "N", string> = { C: "♣", D: "♦", H: "♥", S: "♠", N: "NT" };
const isRed = (s: string) => s === "H" || s === "D";
const RED = "#CC0000";
const SANS = "Arial, Helvetica, sans-serif";

// Fixed metrics — the whole point of this box is that it does not resize.
const BTN: React.CSSProperties = {
  fontFamily: SANS,
  background: "#fff",
  color: "#000",
  border: "1px solid #8a8a6a",
  borderRadius: 6,
  padding: "7px 0",
  width: 42,
  fontWeight: 700,
  fontSize: 19,
  lineHeight: 1.1,
  cursor: "pointer",
  flex: "none",
};
const disabledStyle: React.CSSProperties = {
  opacity: 0.4,
  cursor: "default",
  background: "#eee",
};

export function BboBidBox({
  sessionId,
  legal,
  active,
}: Readonly<{ sessionId: string; legal: string[]; active: boolean }>) {
  const [armed, setArmed] = useState<number | null>(null);
  const legalSet = new Set(legal);

  const callForm = (
    value: string,
    label: React.ReactNode,
    style: React.CSSProperties,
    aria: string,
  ) => (
    <form key={value} action={bidAction} className="contents">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="call" value={value} />
      <button type="submit" aria-label={aria} style={style}>
        {label}
      </button>
    </form>
  );

  const passStyle = {
    ...BTN,
    width: 88,
    background: "#1E7B32",
    color: "#fff",
    border: "1px solid #155A24",
  };

  // ---- Inactive: the full ladder, disabled, so the box stays put -----------
  if (!active) {
    return (
      <div
        className="flex flex-wrap items-center justify-center gap-1.5"
        style={{ fontFamily: SANS }}
        aria-hidden
      >
        <span style={{ ...passStyle, ...disabledStyle, background: "#cfe0d3" }}>Pass</span>
        {[1, 2, 3, 4, 5, 6, 7].map((l) => (
          <span key={l} style={{ ...BTN, ...disabledStyle }}>
            {l}
          </span>
        ))}
      </div>
    );
  }

  const legalLevels = [1, 2, 3, 4, 5, 6, 7].filter((l) =>
    STRAINS.some((s) => legalSet.has(`${l}${s}`)),
  );

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5" style={{ fontFamily: SANS }}>
      {/* Pass — BBO's wide green button, always first. */}
      {legalSet.has("P")
        ? callForm("P", "Pass", passStyle, "Pass")
        : null}
      {legalSet.has("X") &&
        callForm(
          "X",
          "X",
          { ...BTN, width: 52, background: RED, color: "#fff", border: "1px solid #8F0000" },
          "Double",
        )}
      {legalSet.has("XX") &&
        callForm(
          "XX",
          "XX",
          { ...BTN, width: 56, background: "#1034A6", color: "#fff", border: "1px solid #0A2170" },
          "Redouble",
        )}

      {armed === null ? (
        // Only the LEGAL levels appear — BBO shows "4 5 6 7" after 3NT.
        legalLevels.map((l) => (
          <button
            key={l}
            type="button"
            aria-label={`Level ${l}`}
            style={BTN}
            onClick={() => setArmed(l)}
          >
            {l}
          </button>
        ))
      ) : (
        <>
          <button
            type="button"
            aria-label="Back to levels"
            style={{ ...BTN, width: 34, fontSize: 16 }}
            onClick={() => setArmed(null)}
          >
            ‹
          </button>
          {STRAINS.filter((s) => legalSet.has(`${armed}${s}`)).map((s) =>
            callForm(
              `${armed}${s}`,
              <span style={{ color: isRed(s) ? RED : "#000" }}>
                {armed}
                {GLYPH[s]}
              </span>,
              { ...BTN, width: s === "N" ? 60 : 52 },
              `Bid ${armed}${GLYPH[s]}`,
            ),
          )}
        </>
      )}
    </div>
  );
}
