"use client";

// BBO-view bidding box (rebuilt against a real BBO screenshot): the two-click
// flow BBO uses by default. One row: the big green Pass, red X / blue XX when
// legal, then ONLY the legal level numbers (after 3NT you see just 4 5 6 7,
// like BBO). Tapping a level swaps the numbers for that level's legal strains
// (‹ backs out). Legality is the engine's real `legalCalls` set passed from
// the server; every concrete call posts the same `bidAction` the classic
// BiddingBox posts. The only client state is the armed level.

import { useState } from "react";
import type { Suit } from "@bridge/events";
import { bidAction } from "@/app/bridge/table/actions";

const STRAINS = ["C", "D", "H", "S", "N"] as const;
const GLYPH: Record<Suit | "N", string> = { C: "♣", D: "♦", H: "♥", S: "♠", N: "NT" };
const isRed = (s: string) => s === "H" || s === "D";
const RED = "#CC0000";
const SANS = "Arial, Helvetica, sans-serif";

const whiteBtn: React.CSSProperties = {
  fontFamily: SANS,
  background: "#fff",
  color: "#000",
  border: "1px solid #8a8a6a",
  borderRadius: 6,
  padding: "clamp(4px, 0.8cqw, 9px) 0",
  width: "clamp(36px, 6cqw, 60px)",
  fontWeight: 700,
  fontSize: "clamp(15px, 2.6cqw, 26px)",
  cursor: "pointer",
  lineHeight: 1.1,
};

export function BboBidBox({
  sessionId,
  legal,
}: Readonly<{ sessionId: string; legal: string[] }>) {
  const [armed, setArmed] = useState<number | null>(null);
  const legalSet = new Set(legal);

  const legalLevels = [1, 2, 3, 4, 5, 6, 7].filter((l) =>
    STRAINS.some((s) => legalSet.has(`${l}${s}`)),
  );

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

  return (
    <div className="flex flex-wrap items-center gap-1.5" style={{ fontFamily: SANS }}>
      {/* Pass — BBO's wide green button, always first. */}
      {legalSet.has("P") &&
        callForm(
          "P",
          "Pass",
          {
            ...whiteBtn,
            width: "clamp(72px, 12.5cqw, 124px)",
            background: "#1E7B32",
            color: "#fff",
            border: "1px solid #155A24",
          },
          "Pass",
        )}
      {legalSet.has("X") &&
        callForm(
          "X",
          "X",
          { ...whiteBtn, width: "clamp(40px, 6.8cqw, 68px)", background: RED, color: "#fff", border: "1px solid #8F0000" },
          "Double",
        )}
      {legalSet.has("XX") &&
        callForm(
          "XX",
          "XX",
          {
            ...whiteBtn,
            width: "clamp(44px, 7.2cqw, 72px)",
            background: "#1034A6",
            color: "#fff",
            border: "1px solid #0A2170",
          },
          "Redouble",
        )}

      {armed === null ? (
        // Only the LEGAL levels appear — BBO shows "4 5 6 7" after 3NT.
        legalLevels.map((l) => (
          <button
            key={l}
            type="button"
            aria-label={`Level ${l}`}
            style={whiteBtn}
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
            style={{ ...whiteBtn, width: "clamp(28px, 4.6cqw, 46px)", fontSize: "clamp(13px, 2.1cqw, 21px)" }}
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
              { ...whiteBtn, width: s === "N" ? "clamp(50px, 8.4cqw, 84px)" : "clamp(44px, 7.2cqw, 72px)" },
              `Bid ${armed}${GLYPH[s]}`,
            ),
          )}
        </>
      )}
    </div>
  );
}
