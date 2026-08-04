"use client";

// TrickArea — the current trick in the centre: real card faces on a cross
// (wide + phone, scalable) or compact pills (stacked-narrow). Lifted verbatim
// from PlayTable's trickCross() / trickPills closures. The host supplies the
// plays and whose turn it is; this leaf draws the four positions.

import type { Card, Seat } from "@bridge/events";
import type { CSSProperties } from "react";
import { RED, GLYPH, isRed, rankText } from "./tokens";

export interface TrickPlay {
  seat: Seat;
  card: Card;
}

export interface TrickAreaProps {
  plays: readonly TrickPlay[];
  turn: Seat;
  /** Cross scale (1, or 1.6 on phones). Ignored by the pill variant. */
  scale?: number;
  variant?: "cross" | "pill";
}

export function TrickArea({ plays, turn, scale = 1, variant = "cross" }: Readonly<TrickAreaProps>) {
  if (variant === "pill") {
    return (
      <div style={{ position: "relative", width: 300, height: 220 }}>
        {(["N", "E", "S", "W"] as Seat[]).map((seat) => {
          const play = plays.find((p) => p.seat === seat);
          const pos: CSSProperties =
            seat === "N" ? { left: "50%", top: 0, transform: "translateX(-50%)" }
            : seat === "S" ? { left: "50%", bottom: 0, transform: "translateX(-50%)" }
            : seat === "W" ? { left: 0, top: "50%", transform: "translateY(-50%)" }
            : { right: 0, top: "50%", transform: "translateY(-50%)" };
          if (!play) return null;
          return (
            <div key={seat} style={{ position: "absolute", ...pos, display: "flex", alignItems: "center", gap: 2, background: "#fff", border: "1px solid #9a9a9a", padding: "4px 10px", boxShadow: "0 2px 6px rgba(0,0,0,.45)", color: isRed(play.card.suit) ? RED : "#000" }}>
              <span style={{ fontSize: 36, lineHeight: 1 }}>{GLYPH[play.card.suit]}</span>
              <span style={{ fontSize: 36, lineHeight: 1 }}>{rankText(play.card.rank)}</span>
            </div>
          );
        })}
      </div>
    );
  }

  const k = scale;
  return (
    <div style={{ position: "relative", width: 262 * k, height: 262 * k }}>
      {(["N", "E", "S", "W"] as Seat[]).map((seat) => {
        const play = plays.find((p) => p.seat === seat);
        const pos =
          seat === "N" ? { left: "50%", top: "0", tr: "translateX(-50%)" }
          : seat === "S" ? { left: "50%", top: `${182 * k}px`, tr: "translateX(-50%)" }
          : seat === "W" ? { left: "0", top: "50%", tr: "translateY(-50%)" }
          : { left: `${206 * k}px`, top: "50%", tr: "translateY(-50%)" };
        const onTurn = seat === turn;
        return (
          <div key={seat} style={{ position: "absolute", left: pos.left, top: pos.top, transform: pos.tr, zIndex: play ? 2 : 1 }}>
            {play ? (
              <span style={{ position: "relative", display: "block", width: 56 * k, height: 80 * k, background: "#fff", border: "1px solid #6b6b6b", borderRadius: 3, boxShadow: "0 2px 5px rgba(0,0,0,.4)" }}>
                <span style={{ position: "absolute", left: 4 * k, top: 2 * k, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: isRed(play.card.suit) ? RED : "#000" }}>
                  <span style={{ fontSize: 27 * k, fontWeight: 700 }}>{rankText(play.card.rank)}</span>
                  <span style={{ fontSize: 24 * k }}>{GLYPH[play.card.suit]}</span>
                </span>
              </span>
            ) : (
              <span style={{ display: "flex", width: 56 * k, height: 80 * k, alignItems: "center", justifyContent: "center" }}>
                <span style={{ display: "block", width: onTurn ? 22 * k : 0, height: 12 * k, background: onTurn ? "#9a9a9a" : "transparent" }} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
