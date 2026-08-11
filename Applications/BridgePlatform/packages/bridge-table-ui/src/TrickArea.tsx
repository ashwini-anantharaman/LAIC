"use client";

// TrickArea — the current trick in the centre: real card faces on a wide 262px
// cross, a tight interlocking COMPASS (phone, the `cluster` variant), or compact
// pills (stacked-narrow). Lifted verbatim from PlayTable's trickCross() /
// trickPills closures. The host supplies the plays and whose turn it is; this
// leaf draws the four positions.

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
  /** Box scale (1, or clamped down to fit a squeezed band). Ignored by pills. */
  scale?: number;
  /** `cross` = the wide 262px compass, `cluster` = the phone's tight one. */
  variant?: "cross" | "cluster" | "pill";
  /**
   * CLUSTER only: the card box the trick is drawn at, and the index type that
   * goes on it. The phone hands over the metrics of the cards in the HAND, so
   * the card you played and the cards you hold are the same object at the same
   * size — a trick card larger than a hand card reads as a different deck.
   * Omitted, the compass keeps its authored 56x80 face.
   */
  card?: { w: number; h: number };
  index?: { rank: number; glyph: number };
}

/**
 * The `cluster` variant's geometry (phone tier) — a tight interlocking COMPASS,
 * not a pile (owner, 2026-08-11). Same card as the cross — the card is the one
 * metric both layouts share, which is what keeps a phone trick card and a wide
 * one recognisably the same object — but the four seats sit on a PLUS the size
 * of the trick rather than a 262px compass that spreads to the corners:
 *
 *      N top-centre        · the N/S pair holds the vertical centre line
 *   W          E           · the W/E flanks straddle that pair's midline
 *      S bottom-centre     · each pair meets on a QUARTER-card overlap
 *
 * The box is exactly the union of the four positions — two cards wide by two
 * and a half tall — so the whole compass scales as ONE unit like the cross.
 */
const CARD = { w: 56, h: 80 };
/**
 * Where the pairs meet, as a share of a card's height. A quarter is the tight
 * interlock the owner asked for; it is also, at the phone's card box, very
 * nearly the dead strip BELOW a card's rank+pip index, which is what lets the
 * paint order below bury nothing that says what a card is.
 */
const COMPASS_OVERLAP = 0.25;
/** Top of the W/E flanks: one card down, less the overlap they share with N. */
const flankTop = (h: number) => Math.round(h * (1 - COMPASS_OVERLAP));
/** The compass's box for a card box: exactly the union of the four positions. */
export function clusterBox(card: { w: number; h: number } = CARD) {
  return { w: card.w * 2, h: flankTop(card.h) * 2 + card.h };
}
export const CLUSTER = clusterBox(CARD);
/** Seat -> top-left inside the compass box. N high and centred, S low and
    centred, W/E flanking on the line halfway between them. */
const clusterPos = (card: { w: number; h: number }): Record<Seat, { left: number; top: number }> => {
  const half = Math.round(card.w / 2);
  const fy = flankTop(card.h);
  return {
    N: { left: half, top: 0 },
    W: { left: 0, top: fy },
    E: { left: card.w, top: fy },
    S: { left: half, top: fy * 2 },
  };
};
/**
 * Paint order is SPATIAL, not play order: strictly TOP TO BOTTOM (N, then the
 * W/E flanks, then S). A card therefore only ever covers the strip below the
 * card above it, and that strip is the quarter-card the compass overlaps by —
 * which at the phone's card box is the blank space under the rank+pip index, so
 * no card ever buries what another card SAYS. Layering by play order instead
 * let a later card bury an earlier one's rank, and it re-layered the pile on
 * every play; a fixed order means the compass never reshuffles under the eye.
 */
const CLUSTER_ORDER: Seat[] = ["N", "W", "E", "S"];

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
    // — the trick reads as one tight compass in the middle of the felt rather
    // than four cards pinned to the corners of a box twice their size.
    const box = clusterBox(card);
    const pos4 = clusterPos(card);
    /**
     * "10" is the only two-glyph rank, and at weight 800 Arial digits run about
     * 0.56em each — call it 1.12em for the pair. It is drawn at the SAME size as
     * every other rank (the phone's card is sized for it), and this cap only
     * bites for a caller that hands the compass a card too narrow to hold one,
     * where a clipped "10" would be worse than a small one.
     */
    const twoGlyphCap = Math.floor((card.w - 11) / 1.12);
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
                    data-seat={seat}
                    className={DEAL}
                    style={{ position: "relative", display: "block", width: card.w, height: card.h, background: "#fff", border: "1.5px solid #4a4a4a", borderRadius: 4, boxShadow: "0 3px 7px rgba(0,0,0,.45)", boxSizing: "border-box" }}
                  >
                    {/* Bold face: a heavy rank with the pip directly beneath it,
                        both pinned to the card's TOP-LEFT — the strip the paint
                        order guarantees no neighbour covers, so every card on
                        the compass still says what it is. */}
                    <span style={{ position: "absolute", left: 4, top: 2, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.88, color: isRed(play.card.suit) ? RED : "#000" }}>
                      <span style={{ fontSize: rank.length > 1 ? Math.min(index.rank, twoGlyphCap) : index.rank, fontWeight: 800, letterSpacing: "-.02em" }}>{rank}</span>
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
