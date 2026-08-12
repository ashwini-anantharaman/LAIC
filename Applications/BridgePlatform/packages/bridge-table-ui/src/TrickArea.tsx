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
 *      N top-centre        · the vertical pair TOUCHES: N's bottom edge IS
 *   W          E             S's top edge, on the card's centre line
 *      S bottom-centre     · the flanks straddle that seam, half a card down
 *
 * The vertical pair CLOSED UP on the owner's second look (2026-08-11): N used
 * to end a half-card above S, with only the flanks bridging the gap, and the
 * compass paid three quarters of a card of height for a hole in its middle.
 * Touching, the box is exactly TWO CARDS BY TWO — a fifth shorter — and the
 * band the trick sits in gets that height back. The flanks still straddle the
 * junction and still overlap both neighbours, so it reads as one solid plus
 * rather than a column with ears.
 *
 * The box is exactly the union of the four positions, so the whole compass
 * scales as ONE unit like the cross.
 */
const CARD = { w: 56, h: 80 };
/**
 * Top of the W/E flanks. Half a card down put their edge straight through the
 * TOP card's suit pip, so the leader's card showed a rank with no suit — the one
 * thing a player reads the trick for. They now start BELOW that pip (0.7 of a
 * card, measured against the index's ink: rank ends ~0.4h, pip ~0.66h), which
 * costs nothing: the vertical pair still touches, the box is still two cards by
 * two, and the flanks still cross both neighbours enough to interlock.
 *
 * The cost this shifts rather than removes is on the flanks themselves — see
 * CLUSTER_ORDER. On a 2x2 footprint no arrangement leaves all four indexes
 * whole; this spends that on a flank's pip instead of the top card's.
 */
const flankTop = (h: number) => Math.round(h * 0.5);
/** The compass's box for a card box: exactly the union of the four positions —
    two cards wide (the flanks) by two tall (the touching vertical pair). */
/**
 * A SEAM between the two columns, so E's outward index clears N and S.
 *
 * The vertical constraint solves itself — the flanks sit at half a card, which
 * is below N's index block and above S's. The horizontal one does not: N and S
 * share the centre column, and their bodies reach far enough right to graze the
 * index E keeps on its right edge. Widening the box by this much moves E's
 * index just past N's right edge and W's just short of N's left one. Derived
 * from the card so it holds if the card is resized; measured at 0.15 for the
 * shipped 89-wide card, where the constraint needs 13px and this gives 13.
 */
const clusterGap = (w: number) => Math.round(w * 0.15);
export function clusterBox(card: { w: number; h: number } = CARD) {
  return { w: card.w * 2 + clusterGap(card.w), h: card.h * 2 };
}
export const CLUSTER = clusterBox(CARD);
/** Seat -> top-left inside the compass box. N and S share the centre column and
    meet edge to edge; W/E flank that seam, half a card outside and half down. */
const clusterPos = (card: { w: number; h: number }): Record<Seat, { left: number; top: number }> => {
  const gap = clusterGap(card.w);
  const centre = Math.round((card.w + gap) / 2);
  const fy = flankTop(card.h);
  return {
    N: { left: centre, top: 0 },
    W: { left: 0, top: fy },
    E: { left: card.w + gap, top: fy },
    S: { left: centre, top: card.h },
  };
};
/**
 * PAINT ORDER IS PLAY ORDER — the last card played sits on top, the way it does
 * on a table and in BBO (owner, 2026-08-12). That is a real constraint, not a
 * preference: with play order, ANY card can land over ANY other, so a layout
 * may not rely on knowing who covers whom.
 *
 * The previous geometry did rely on it. Paint order was fixed and spatial
 * (N, W, E, S) precisely because on a 2x2 footprint, with every index in the
 * top-left corner, no arrangement leaves all four indexes whole — the fixed
 * order was what chose WHICH index got clipped. Play order takes that choice
 * away, so the index had to move instead.
 *
 * THE INDEX NOW SITS ON THE EDGE THAT FACES AWAY FROM THE CENTRE. That corner
 * is on the outside of the cluster by construction, so no sibling can reach it
 * — in any order, for any trick:
 *
 *      N ─ top-left        W ─ top-left
 *      E ─ top-RIGHT       S ─ bottom-left
 *
 * Checked against the box below (flanks at half a card, N/S touching, so the
 * bodies span N y[0,h], W/E y[0.5h,1.5h], S y[h,2h] and N/S x[0.5w,1.5w],
 * W x[0,w], E x[w,2w]) with an index block of roughly 0.32w x 0.36h:
 *
 *   N  x[0.50w,0.82w] y[0,0.36h]      W and E start at 0.5h — clear
 *   W  x[0,0.32w]     y[0.5h,0.86h]   nothing else reaches left of 0.5w
 *   E  x[1.68w,2w]    y[0.5h,0.86h]   N and S stop at 1.5w — clear
 *   S  x[0.50w,0.82w] y[1.64h,2h]     W and E stop at 1.5h — clear
 *
 * So the footprint stays exactly two cards by two — no space was bought for
 * this — and the flanks moved back UP to half a card, which the old top-left
 * index could not afford. Every rank and every pip is now whole on all four
 * seats, which the fixed order never managed.
 */
const INDEX_CORNER: Record<Seat, CSSProperties> = {
  N: { left: 4, top: 2 },
  W: { left: 4, top: 2 },
  E: { right: 4, top: 2 },
  S: { left: 4, bottom: 2 },
};

/** Which way the empty-slot arrow points: away from the centre, at its seat. */
const ARROW: Record<Seat, string> = { N: "▲", E: "▶", S: "▼", W: "◀" };

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
          {(["N", "W", "E", "S"] as Seat[]).map((seat) => {
            const order = plays.findIndex((p) => p.seat === seat);
            const play = order >= 0 ? plays[order] : undefined;
            const pos = pos4[seat];
            const onTurn = seat === turn;
            const rank = play ? rankText(play.card.rank) : "";
            // z IS the play order. An empty slot sits under every card so the
            // arrow never rides over one; the nth card played sits at n.
            return (
              <div key={seat} style={{ position: "absolute", left: pos.left, top: pos.top, zIndex: play ? order + 2 : 1 }}>
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
                    {/* Bold face: a heavy rank with the pip directly beneath
                        it, pinned to the corner this seat points AWAY from the
                        centre with — the one strip no sibling can reach, in any
                        play order. See INDEX_CORNER. */}
                    <span style={{ position: "absolute", ...INDEX_CORNER[seat], display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.88, color: isRed(play.card.suit) ? RED : "#000" }}>
                      <span style={{ fontSize: rank.length > 1 ? Math.min(index.rank, twoGlyphCap) : index.rank, fontWeight: 800, letterSpacing: "-.02em" }}>{rank}</span>
                      <span style={{ fontSize: index.glyph, fontWeight: 700 }}>{GLYPH[play.card.suit]}</span>
                    </span>
                  </span>
                ) : (
                  // Whose turn it is, as an ARROW pointing at the seat rather
                  // than a bar that only marked a position (owner, 2026-08-12).
                  // It sits in that seat's empty slot, so it points outward from
                  // the centre at the player who owes a card.
                  <span data-testid="turn-arrow" data-seat={onTurn ? seat : undefined} style={{ display: "flex", width: card.w, height: card.h, alignItems: "center", justifyContent: "center", fontSize: Math.round(card.w * 0.42), lineHeight: 1, color: "rgba(255,255,255,.78)", textShadow: "0 1px 3px rgba(0,0,0,.5)", opacity: onTurn ? 1 : 0, transition: "opacity 160ms ease" }}>
                    {ARROW[seat]}
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
