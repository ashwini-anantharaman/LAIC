"use client";

// TrickArea — the current trick in the centre: real card faces on a cross
// (wide, scalable), a tight overlapping CLUSTER (phone), or compact pills
// (stacked-narrow). Lifted verbatim from PlayTable's trickCross() / trickPills
// closures. The host supplies the plays and whose turn it is; this leaf draws
// the four positions.

import type { Card, Seat } from "@bridge/events";
import type { CSSProperties } from "react";
import { RED, GLYPH, isRed, rankText } from "./tokens";
import { DEAL, TableMotion } from "./motion";

export interface TrickPlay {
  seat: Seat;
  card: Card;
}

export interface TrickAreaProps {
  plays: readonly TrickPlay[];
  turn: Seat;
  /** Box scale (1, or up to CLUSTER_MAX_K on phones). Ignored by the pill variant. */
  scale?: number;
  variant?: "cross" | "cluster" | "pill";
  /**
   * CLUSTER only: the card box the trick is drawn at, and the index type that
   * goes on it. The phone hands over the metrics of the cards in the HAND, so
   * the card you played and the cards you hold are the same object at the same
   * size — a trick card larger than a hand card reads as a different deck.
   * Omitted, the cluster keeps its authored 56x80 face.
   */
  card?: { w: number; h: number };
  index?: { rank: number; glyph: number };
}

/**
 * The CLUSTER geometry (phone tier). Same 56x80 card as the cross — the card is
 * the one metric both layouts share, which is what keeps a phone trick card and
 * a wide one recognisably the same object — but the four seats sit on a tight
 * diamond that OVERLAPS instead of a 262px compass that spreads to the corners.
 * dx/dy are the seat offsets; the box is exactly their union, so the whole
 * cluster is `CLUSTER.w x CLUSTER.h` and scales as ONE unit like the cross.
 */
const CARD = { w: 56, h: 80 };
const CLUSTER_DX = 34;
const CLUSTER_DY = 19;
/** The offsets are the authored card's PROPORTIONS, so a cluster drawn at some
    other card size (the phone hands it the hand's card) keeps the same pile. */
const dxFor = (w: number) => Math.round((w * CLUSTER_DX) / CARD.w);
const dyFor = (h: number) => Math.round((h * CLUSTER_DY) / CARD.h);
/** The cluster's box for a card box: exactly the union of the four positions. */
export function clusterBox(card: { w: number; h: number } = CARD) {
  return { w: dxFor(card.w) * 2 + card.w, h: dyFor(card.h) * 2 + card.h };
}
export const CLUSTER = clusterBox(CARD);
/** Seat -> top-left inside the cluster box. N sits high, S low, W/E flank. */
const clusterPos = (card: { w: number; h: number }): Record<Seat, { left: number; top: number }> => {
  const dx = dxFor(card.w);
  const dy = dyFor(card.h);
  return {
    N: { left: dx, top: 0 },
    W: { left: 0, top: dy },
    E: { left: dx * 2, top: dy },
    S: { left: dx, top: dy * 2 },
  };
};
/**
 * Paint order is SPATIAL, not play order: left-to-right, top-to-bottom, so
 * every card keeps its leftmost CLUSTER_DX px — the strip its index sits in —
 * uncovered. Layering by play order instead let a later card land to the LEFT
 * of an earlier one and bury the earlier one's rank, and it re-layered the pile
 * on every play. Fixed order means the fan never reshuffles under the eye.
 */
const CLUSTER_ORDER: Seat[] = ["W", "N", "S", "E"];

export function TrickArea({
  plays,
  turn,
  scale = 1,
  variant = "cross",
  card = CARD,
  index = { rank: 38, glyph: 30 },
}: Readonly<TrickAreaProps>) {
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

  if (variant === "cluster") {
    // Phone tier. Same ONE-BOX SCALE contract as the cross: the card metrics
    // and the seat offsets are fixed integers and the WHOLE box is transformed,
    // so the four cards can never desync in size. What changes is the geometry
    // — the trick reads as one object in the middle of the felt rather than
    // four cards pinned to the corners of a compass twice its size.
    const box = clusterBox(card);
    const pos4 = clusterPos(card);
    return (
      <div style={{ width: box.w * scale, height: box.h * scale, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <TableMotion />
        <div style={{ position: "relative", width: box.w, height: box.h, flex: "none", transform: `scale(${scale})`, transformOrigin: "center center" }}>
          {CLUSTER_ORDER.map((seat, z) => {
            const play = plays.find((p) => p.seat === seat);
            const pos = pos4[seat];
            const onTurn = seat === turn;
            const rank = play ? rankText(play.card.rank) : "";
            return (
              <div key={seat} style={{ position: "absolute", left: pos.left, top: pos.top, zIndex: z + 1 }}>
                {play ? (
                  // Keyed on the card so a NEW card mounts (and deals in); a
                  // re-render of the same card must not replay the animation.
                  <span
                    key={`${play.card.suit}${play.card.rank}`}
                    data-testid="trick-card"
                    className={DEAL}
                    style={{ position: "relative", display: "block", width: card.w, height: card.h, background: "#fff", border: "1.5px solid #4a4a4a", borderRadius: 4, boxShadow: "0 3px 7px rgba(0,0,0,.45)", boxSizing: "border-box" }}
                  >
                    {/* Bold face: a heavy rank with the pip directly beneath it,
                        both pinned to the card's TOP-LEFT — that strip is the
                        one the neighbouring card never covers, so every card in
                        the pile still says what it is. "10" is the only
                        two-glyph rank and takes the narrower size. */}
                    <span style={{ position: "absolute", left: 4, top: 2, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.88, color: isRed(play.card.suit) ? RED : "#000" }}>
                      <span style={{ fontSize: rank.length > 1 ? Math.round(index.rank * 0.68) : index.rank, fontWeight: 800, letterSpacing: "-.02em" }}>{rank}</span>
                      <span style={{ fontSize: index.glyph, fontWeight: 700 }}>{GLYPH[play.card.suit]}</span>
                    </span>
                  </span>
                ) : (
                  <span style={{ display: "flex", width: card.w, height: card.h, alignItems: "center", justifyContent: "center" }}>
                    <span style={{ display: "block", width: onTurn ? 24 : 0, height: 5, borderRadius: 3, background: onTurn ? "rgba(255,255,255,.62)" : "transparent" }} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ONE-BOX SCALE (TrickArea.dc.html). The compass geometry — the 262px box, the
  // 56×80 cards, the 182/206 offsets — is tuned as a single unit, so PROMINENCE
  // is a transform:scale on the WHOLE box (origin centre), never per-card sizes.
  // Scaling every metric/offset/font individually (the previous model) let the
  // browser round each element independently, so the four cards desynced in size
  // and the scaled rank font overflowed its scaled card box and clipped. The box
  // is fixed and integer; the outer flex is sized to the scaled box so the
  // transform (which does not affect layout) claims the right footprint and the
  // whole thing centres in the felt.
  const k = scale;
  return (
    <div style={{ width: 262 * k, height: 262 * k, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "relative", width: 262, height: 262, flex: "none", transform: `scale(${k})`, transformOrigin: "center center" }}>
        {(["N", "E", "S", "W"] as Seat[]).map((seat) => {
          const play = plays.find((p) => p.seat === seat);
          const pos =
            seat === "N" ? { left: "50%", top: "0", tr: "translateX(-50%)" }
            : seat === "S" ? { left: "50%", top: "182px", tr: "translateX(-50%)" }
            : seat === "W" ? { left: "0", top: "50%", tr: "translateY(-50%)" }
            : { left: "206px", top: "50%", tr: "translateY(-50%)" };
          const onTurn = seat === turn;
          return (
            <div key={seat} style={{ position: "absolute", left: pos.left, top: pos.top, transform: pos.tr, zIndex: play ? 2 : 1 }}>
              {play ? (
                <span data-testid="trick-card" style={{ position: "relative", display: "block", width: 56, height: 80, background: "#fff", border: "1px solid #6b6b6b", borderRadius: 3, boxShadow: "0 2px 5px rgba(0,0,0,.4)" }}>
                  <span style={{ position: "absolute", left: 4, top: 2, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: isRed(play.card.suit) ? RED : "#000" }}>
                    <span style={{ fontSize: 27, fontWeight: 700 }}>{rankText(play.card.rank)}</span>
                    <span style={{ fontSize: 24 }}>{GLYPH[play.card.suit]}</span>
                  </span>
                </span>
              ) : (
                <span style={{ display: "flex", width: 56, height: 80, alignItems: "center", justifyContent: "center" }}>
                  <span style={{ display: "block", width: onTurn ? 22 : 0, height: 12, background: onTurn ? "#9a9a9a" : "transparent" }} />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
