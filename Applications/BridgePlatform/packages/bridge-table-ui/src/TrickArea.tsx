"use client";

// TrickArea — the current trick in the centre: real card faces on a wide 262px
// cross, a tight interlocking COMPASS (phone, the `cluster` variant), or compact
// pills (stacked-narrow). Lifted verbatim from PlayTable's trickCross() /
// trickPills closures. The host supplies the plays and whose turn it is; this
// leaf draws the four positions.

import type { Card, Seat } from "@bridge/events";
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { RED, GLYPH, isRed, rankText } from "./tokens";
import { FLY, GLIDE, TableMotion } from "./motion";

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
   * CLUSTER only: the card box the trick is drawn at. The phone hands over its
   * own trick metrics; omitted, the compass keeps its authored 56x80 face. The
   * face draws its OWN indexes from this box — see TrickFace.
   */
  card?: { w: number; h: number };
  /**
   * Where this seat's newest card CAME FROM, in viewport pixels — the centre of
   * the card as it sat in the hand, captured on the tap (owner, 2026-08-13:
   * "make it glide from the position of the card in the hand to the middle, not
   * just from the middle always").
   *
   * The seat-direction keyframes could only ever start a card from a fixed
   * vector, so every South card rose from the same spot however far along the
   * row it had been sitting. With an origin the card starts where your finger
   * left it. Return null for a seat whose origin is unknowable — a robot's hand
   * is face down, and it falls back to the keyframe glide.
   */
  originOf?: (seat: Seat) => { x: number; y: number } | null;
  /**
   * The seat whose card TOOK this trick — set only once the trick is complete
   * and still on the felt.
   *
   * It replaced a "tap to continue" line under the compass (owner, 2026-08-13).
   * That line was clipped by the band it sat in, and it only ever said what the
   * player would work out by tapping anyway. The winning card lifting says the
   * same thing — the trick is over, nothing is waiting on the robots — and also
   * answers the question a player actually has at that moment, which is who got
   * it. No vertical space: the lift happens inside the compass box.
   */
  winner?: Seat | null;
}

/**
 * Travel a card from where it really was to where it now is (FLIP).
 *
 * Measured in VIEWPORT space, then divided by the element's own rendered scale:
 * the whole phone stage is `transform: scale(~0.5)`, so a 30px journey on
 * screen is 60px in the element's own coordinates and a raw viewport delta
 * would land the card half way. The ratio comes off the element itself
 * (`rect.width / offsetWidth`) so it stays correct at any tier without being
 * told what the scale is — the same trick the hand's gap-closing slide uses.
 */
function useFlyFrom(origin: { x: number; y: number } | null | undefined, key: string) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !origin) return;
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const r = el.getBoundingClientRect();
    const k = el.offsetWidth > 0 ? r.width / el.offsetWidth : 1;
    const dx = (origin.x - (r.left + r.width / 2)) / (k || 1);
    const dy = (origin.y - (r.top + r.height / 2)) / (k || 1);
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    el.style.transition = "none";
    el.style.opacity = "0.4";
    el.style.transform = `translate(${dx}px, ${dy}px) scale(.94)`;
    void el.offsetWidth; // commit the start frame, then let the class animate
    el.style.transition = "";
    el.style.opacity = "1";
    el.style.transform = "none";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return ref;
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
 * Top of the W/E flanks: half a card down, on the seam the touching vertical
 * pair makes. The real-card face keeps its whole index block above 0.47h (see
 * TrickFace), so a flank starting at 0.5h clears the top card's rank AND pip
 * with no extra allowance — the 0.7h drop the old oversized index needed is
 * back to the geometric ideal.
 */
const flankTop = (h: number) => Math.round(h * 0.5);
/**
 * A SEAM between the two columns, so the flanks' outward indexes clear N and S.
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
 * A REAL playing card (owner, 2026-08-12): white face, thin neutral border, and
 * the standard TWO diagonal indexes — rank over pip tucked top-left, the same
 * pair rotated 180° bottom-right — exactly the card a deck deals. The BBO
 * skin's Face is the reference look; what it proves is that "readable" and
 * "looks like a card" are the same problem solved twice.
 *
 * The dual index RETIRES the away-facing-corner scheme. Paint order is play
 * order, so any card can cover any other, and a single index cannot be kept
 * whole on a 2x2 interlock — the previous fix moved each seat's lone index to
 * the corner facing away from the centre, which kept it readable and made every
 * card look wrong: no real card indexes its top-right. Two diagonal corners
 * make the guarantee STRUCTURAL instead: whichever way a card faces the centre,
 * one of its two indexes is on the outward side —
 *
 *      N: top-left (its top edge is the box's top edge)
 *      W: top-left (its left edge is the box's left edge)
 *      E: bottom-right, rotated (its right edge is the box's right edge)
 *      S: bottom-right, rotated (its bottom edge is the box's bottom edge)
 *
 * — and the outward side is outside the union of the other three bodies by the
 * same 2x2 arithmetic as before. The inward twin gets covered sometimes; on a
 * real table it does too.
 *
 * Index metrics are derived from the card box, not passed in: rank 0.26h and
 * pip 0.19h put the block's ink at ~0.46h, inside the half-card strip the
 * flanks leave clear (flankTop). "10" is the only two-glyph rank — bold Arial
 * digits run ~0.56em each — and it is capped so the pair stays under half the
 * card's width and can never cross its diagonal twin.
 */
function FaceCard({ card, box, seat, origin, won }: Readonly<{ card: Card; box: { w: number; h: number }; seat: Seat; origin?: { x: number; y: number } | null; won?: boolean }>) {
  const rank = rankText(card.rank);
  const colour = isRed(card.suit) ? RED : "#000";
  const rankSize = Math.round(box.h * 0.26);
  const glyphSize = Math.round(box.h * 0.19);
  const size = rank.length > 1 ? Math.min(rankSize, Math.floor((box.w * 0.48) / 1.12)) : rankSize;
  const inX = Math.round(box.w * 0.06);
  const inY = Math.round(box.h * 0.025);
  const index = (corner: CSSProperties, rotated: boolean) => (
    <span
      style={{
        position: "absolute",
        ...corner,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        lineHeight: 0.9,
        color: colour,
        fontVariantNumeric: "tabular-nums",
        transform: rotated ? "rotate(180deg)" : undefined,
      }}
    >
      <span style={{ fontSize: size, fontWeight: 700 }}>{rank}</span>
      <span style={{ fontSize: glyphSize }}>{GLYPH[card.suit]}</span>
    </span>
  );
  const flyRef = useFlyFrom(origin, `${card.suit}${card.rank}`);
  return (
    <span
      ref={flyRef}
      data-testid="trick-card"
      data-seat={seat}
      // A measured origin animates the transform itself (btu-fly); without one
      // the seat-direction keyframe is the best guess available.
      className={origin ? FLY : GLIDE[seat]}
      style={{
        position: "relative",
        display: "block",
        width: box.w,
        height: box.h,
        background: "#fff",
        border: won ? "2px solid #e8c76a" : "1px solid #737373",
        borderRadius: 4,
        // The winner rides above the pile with a warm ring; everything else
        // keeps the plain drop shadow it always had.
        boxShadow: won
          ? "0 0 0 3px rgba(232,199,106,.45), 0 8px 16px rgba(0,0,0,.5)"
          : "0 3px 7px rgba(0,0,0,.45)",
        boxSizing: "border-box",
        transition: "box-shadow 200ms ease, border-color 200ms ease",
      }}
    >
      {index({ left: inX, top: inY }, false)}
      {index({ right: inX, bottom: inY }, true)}
    </span>
  );
}


/**
 * A seat that has not played yet: space, and nothing else.
 *
 * This slot used to hold an arrow pointing outward at the seat that owed a
 * card. The owner turned it down on seeing it (2026-08-13) — at phone scale it
 * was an 8px glyph that read as a stray mark, and it was a SECOND thing to
 * decode about a seat. Whose turn it is now lights the object that already
 * names that seat: their plate, or their badge on the felt's edge.
 */
function EmptySlot({ box }: Readonly<{ box: { w: number; h: number } }>) {
  return <span style={{ display: "block", width: box.w, height: box.h }} />;
}

export function TrickArea({
  plays,
  turn,
  scale = 1,
  variant = "cross",
  card = CARD,
  originOf,
  winner = null,
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
    return (
      <div style={{ width: box.w * scale, height: box.h * scale, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <TableMotion />
        <div style={{ position: "relative", width: box.w, height: box.h, flex: "none", transform: `scale(${scale})`, transformOrigin: "center center" }}>
          {(["N", "W", "E", "S"] as Seat[]).map((seat) => {
            const order = plays.findIndex((p) => p.seat === seat);
            const play = order >= 0 ? plays[order] : undefined;
            const pos = pos4[seat];
            // z IS the play order — the last card played sits on top, the way
            // it does on a table and in BBO (owner, 2026-08-12). An empty slot
            // sits under every card so the arrow never rides over one.
            return (
              // THE LIFT RIDES THE WRAPPER, not the card. A card that glided in
              // keeps its keyframe animation with `fill: both`, and a filling
              // animation's transform beats an inline one — so a lift written
              // on the card itself was silently eaten for every seat except the
              // one whose card flew (a transition, not an animation). Measured:
              // the winner took its gold ring and stayed flat. The wrapper has
              // no animation, so it can move.
              <div
                key={seat}
                style={{
                  position: "absolute", left: pos.left, top: pos.top,
                  zIndex: winner === seat ? 9 : play ? order + 2 : 1,
                  transform: winner === seat ? "translateY(-7px) scale(1.06)" : undefined,
                  transition: "transform 200ms ease",
                }}
              >
                {play ? (
                  // Keyed on the card so a NEW card mounts (and glides in); a
                  // re-render of the same card must not replay the animation.
                  <FaceCard key={`${play.card.suit}${play.card.rank}`} card={play.card} box={card} seat={seat} origin={originOf?.(seat) ?? null} won={winner === seat} />
                ) : (
                  <EmptySlot box={card} />
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
      <TableMotion />
      <div style={{ position: "relative", width: 262, height: 262, flex: "none", transform: `scale(${k})`, transformOrigin: "center center" }}>
        {(["N", "E", "S", "W"] as Seat[]).map((seat) => {
          const order = plays.findIndex((p) => p.seat === seat);
          const play = order >= 0 ? plays[order] : undefined;
          const pos =
            seat === "N" ? { left: "50%", top: "0", tr: "translateX(-50%)" }
            : seat === "S" ? { left: "50%", top: "182px", tr: "translateX(-50%)" }
            : seat === "W" ? { left: "0", top: "50%", tr: "translateY(-50%)" }
            : { left: "206px", top: "50%", tr: "translateY(-50%)" };
          return (
            <div key={seat} style={{ position: "absolute", left: pos.left, top: pos.top, transform: pos.tr, zIndex: play ? order + 2 : 1 }}>
              {play ? (
                <FaceCard key={`${play.card.suit}${play.card.rank}`} card={play.card} box={CARD} seat={seat} />
              ) : (
                <EmptySlot box={CARD} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
