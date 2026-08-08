"use client";

// ONE line's board at the scrubbed ply: its auction grid, the trick on the
// felt, and the seat's remaining cards.
//
// The trick is the production <TrickArea> leaf, unmodified — the compass
// geometry (a 262 box, 56x80 cards, the 182/206 offsets) is tuned as a single
// unit and prominence is a scale on the WHOLE box. Anything this surface adds
// on top of it (the phone's ghost card, the just-played ring) is drawn on a
// second box with the SAME geometry and the SAME scale, so the overlay can
// never drift out of register with the cards underneath.

import { TrickArea } from "@bridge/table-ui";
import type { Card, Seat } from "@bridge/events";
import type { CSSProperties, ReactNode } from "react";
import {
  DIV_ACCENT,
  FELT,
  GLYPH,
  INK_MUTED,
  callColor,
  callText,
  cardText,
  handRows,
  rankText,
  type AuctionGrid,
  type LineFrame,
} from "./compareView";

/** The TrickArea compass, verbatim, so an overlay lands on the same cross. */
const BOX = 262;
const POS: Record<Seat, { left: string; top: string; transform: string }> = {
  N: { left: "50%", top: "0", transform: "translateX(-50%)" },
  S: { left: "50%", top: "182px", transform: "translateX(-50%)" },
  W: { left: "0", top: "50%", transform: "translateY(-50%)" },
  E: { left: "206px", top: "50%", transform: "translateY(-50%)" },
};

export interface GhostCard {
  seat: Seat;
  card: Card;
  who: string;
}

export interface CompareBoardProps {
  frame: LineFrame;
  grid: AuctionGrid;
  variant: "phone" | "wide";
  accent: string;
  /** Trick-box scale — the one knob for prominence. */
  scale: number;
  gridWidth: number;
  showTally?: boolean;
  /** Phone only: the other line's card at this ply. */
  ghost?: GhostCard | null;
  ghostOpacity?: number;
  /** Phone only: both lines played the same card here. */
  ghostInSync?: boolean;
  /** "BEN is thinking…" over this board. */
  loading?: { title: string; detail: string } | null;
  note?: string | null;
}

export function CompareBoard({
  frame,
  grid,
  variant,
  accent,
  scale,
  gridWidth,
  showTally = true,
  ghost = null,
  ghostOpacity = 0.42,
  ghostInSync = false,
  loading = null,
  note = null,
}: Readonly<CompareBoardProps>) {
  const phone = variant === "phone";
  const trickPx = Math.round(BOX * scale);
  const rows = handRows(frame.remaining);

  return (
    <div
      style={{
        position: "relative",
        flex: phone ? 1 : "none",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: phone ? "transparent" : "#f7f9f8",
      }}
    >
      {loading && (
        <div
          role="status"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            background: "rgba(247,249,248,.9)",
            borderRadius: 12,
          }}
        >
          <Spinner />
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "#55636f" }}>{loading.title}</div>
          <div
            style={{
              fontSize: 11.5,
              color: INK_MUTED,
              maxWidth: 230,
              textAlign: "center",
              lineHeight: 1.45,
            }}
          >
            {loading.detail}
          </div>
        </div>
      )}

      {/* auction — one repeat(4,1fr) track over a definite width, so head and
          body columns align by construction */}
      <div
        style={{
          flex: "none",
          display: "flex",
          justifyContent: "center",
          padding: phone ? "0 0 7px" : "11px 13px 8px",
        }}
      >
        <div
          style={{
            width: gridWidth,
            border: "1px solid #dfe4e0",
            borderRadius: 8,
            overflow: "hidden",
            background: "#fff",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)" }}>
            {grid.heads.map((head) => (
              <div
                key={head.seat}
                style={{
                  height: phone ? 21 : 22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: phone ? 10.5 : 11,
                  fontWeight: 700,
                  background: head.vul ? "#cc1111" : "#fff",
                  color: head.vul ? "#fff" : "#4a5a53",
                  borderRight: "1px solid #eceeec",
                }}
              >
                {head.seat}
                {head.dealer ? " •" : ""}
              </div>
            ))}
          </div>
          {grid.rows.map((row, r) => (
            <div
              key={r}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,1fr)",
                borderTop: "1px solid #eceeec",
              }}
            >
              {row.map((cell, c) => (
                <div
                  key={c}
                  style={{
                    position: "relative",
                    height: phone ? 26 : 24,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: phone ? 13 : 12.5,
                    fontWeight: 700,
                    borderRight: "1px solid #eceeec",
                    color: cell.color,
                    // Amber means ONE thing on this surface: the lines split
                    // here. A made call is plain, the scrubbed one is ringed.
                    background: cell.divergent ? "#fbe4d1" : cell.filled ? "#f2f4f3" : "#fff",
                    boxShadow: cell.current
                      ? `inset 0 0 0 2px ${accent}`
                      : cell.divergent
                        ? `inset 0 0 0 1.5px ${DIV_ACCENT}`
                        : undefined,
                  }}
                >
                  {cell.text}
                  {cell.ghost && (
                    <span
                      style={{
                        position: "absolute",
                        right: 2,
                        bottom: 1,
                        fontSize: 9,
                        fontWeight: 800,
                        color: cell.ghost.color,
                        opacity: 0.65,
                      }}
                    >
                      {cell.ghost.text}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* felt */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 12,
          background: FELT,
          ...(phone
            ? { flex: 1, minHeight: 168, padding: "8px 6px" }
            : { flex: "none", height: trickPx + 34, margin: "2px 10px 8px" }),
        }}
      >
        {frame.phase === "auction" ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              color: "#d7ecdf",
            }}
          >
            <div
              style={{
                fontSize: 12,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                opacity: 0.85,
              }}
            >
              {frame.curCall ? "Auction in progress" : "Auction over"}
            </div>
            {frame.curCall && frame.curSeat && (
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{frame.curSeat}</span>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: phone ? 36 : 30,
                    minWidth: phone ? 46 : 38,
                    padding: "0 11px",
                    borderRadius: 8,
                    background: "#fff",
                    color: callColor(frame.curCall),
                    fontSize: phone ? 20 : 17,
                    fontWeight: 800,
                  }}
                >
                  {callText(frame.curCall)}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ position: "relative", width: trickPx, height: trickPx, flex: "none" }}>
            <TrickArea
              plays={frame.trick}
              turn={frame.turn ?? frame.just?.seat ?? "S"}
              scale={scale}
              variant="cross"
            />
            {/* the card that landed at this ply */}
            {frame.just && (
              <Compass scale={scale}>
                <span
                  style={{
                    position: "absolute",
                    left: POS[frame.just.seat].left,
                    top: POS[frame.just.seat].top,
                    transform: POS[frame.just.seat].transform,
                    display: "block",
                    width: 56,
                    height: 80,
                    borderRadius: 3,
                    outline: `3px solid ${accent}`,
                    outlineOffset: 1,
                  }}
                />
              </Compass>
            )}
            {/* the other line's card, translucent, on the same cross */}
            {ghost && (
              <Compass scale={scale}>
                <span
                  style={{
                    position: "absolute",
                    left: POS[ghost.seat].left,
                    top: POS[ghost.seat].top,
                    transform: `${POS[ghost.seat].transform} translate(16px,16px)`,
                    zIndex: 5,
                    display: "block",
                    width: 56,
                    height: 80,
                    background: "#2d3640",
                    border: "1.5px dashed #bcc5cc",
                    borderRadius: 3,
                    opacity: ghostOpacity,
                    boxShadow: "0 2px 6px rgba(0,0,0,.4)",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      left: 4,
                      top: 2,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      lineHeight: 0.95,
                      color: "#eef2f5",
                    }}
                  >
                    <span style={{ fontSize: 27, fontWeight: 700 }}>{rankText(ghost.card.rank)}</span>
                    <span style={{ fontSize: 24 }}>{GLYPH[ghost.card.suit]}</span>
                  </span>
                </span>
              </Compass>
            )}
          </div>
        )}

        {/* the phone's cross-line connector: in sync, or who played the ghost */}
        {phone && frame.phase === "play" && ghostInSync && (
          <span
            style={{
              position: "absolute",
              right: 9,
              bottom: 8,
              fontSize: 10,
              fontWeight: 700,
              color: "#d7ecdf",
              background: "rgba(0,0,0,.24)",
              borderRadius: 10,
              padding: "3px 9px",
            }}
          >
            ✓ lines in sync
          </span>
        )}
        {phone && ghost && (
          <span
            style={{
              position: "absolute",
              left: 9,
              bottom: 8,
              fontSize: 10,
              fontWeight: 700,
              color: "#fbe4d1",
              background: "rgba(122,44,12,.42)",
              borderRadius: 10,
              padding: "3px 9px",
            }}
          >
            ◆ {ghost.who} played {cardText(ghost.card)}
          </span>
        )}
      </div>

      {/* the seat's remaining cards + the running trick tally */}
      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginTop: phone ? 7 : 0,
          padding: phone ? 0 : "8px 13px 12px",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: phone ? 8 : 9, flex: 1, minWidth: 0 }}>
          {rows.map((row) => (
            <span
              key={row.suit}
              style={{ display: "flex", alignItems: "center", gap: 2, fontSize: phone ? 13 : 14 }}
            >
              <span style={{ color: row.color, fontWeight: 700 }}>{row.glyph}</span>
              <span style={{ color: "#26332e", letterSpacing: ".03em" }}>{row.text}</span>
            </span>
          ))}
        </div>
        {showTally && frame.phase === "play" && (
          <span style={{ flex: "none", display: "flex", gap: 3 }}>
            <Tally label="NS" value={frame.tally.ns} />
            <Tally label="EW" value={frame.tally.ew} />
          </span>
        )}
      </div>

      {note && (
        <div style={{ flex: "none", padding: phone ? "6px 0 0" : "0 13px 11px" }}>
          <span
            style={{
              display: "inline-block",
              fontSize: 11,
              lineHeight: 1.4,
              color: "#7a4a1c",
              background: "#fdf3e8",
              borderRadius: 7,
              padding: "6px 10px",
            }}
          >
            {note}
          </span>
        </div>
      )}
    </div>
  );
}

/** A second 262-box on the same cross, at the same scale, for overlays. */
function Compass({ scale, children }: Readonly<{ scale: number; children: ReactNode }>) {
  const style: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: BOX,
    height: BOX,
    transform: `translate(-50%,-50%) scale(${scale})`,
    transformOrigin: "center center",
    pointerEvents: "none",
  };
  return <div style={style}>{children}</div>;
}

function Tally({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <span
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 7,
        background: "#eef1ef",
      }}
    >
      <span style={{ fontSize: 8.5, letterSpacing: ".06em", color: INK_MUTED }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: "#1b2a26" }}>{value}</span>
    </span>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        border: "3px solid #dfe4e8",
        borderTopColor: "#55636f",
        display: "block",
        animation: "compare-spin 900ms linear infinite",
      }}
    />
  );
}
