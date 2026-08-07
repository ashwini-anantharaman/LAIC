"use client";

// HandViewer — the "Hand Viewer" design (Claude Design project 8bcef4b8,
// Hand Viewer.dc.html): a full hand-record view of one board. A 3×3 grid on
// BBO-green — vul/board card, North, auction; West, table space, East; info
// panel, South, contract/score panel. Everything is a record, nothing is a
// control: it shows a deal (live or saved), it doesn't play one.
//
// Reusable like PlayTable: fills its own container and scales the fixed
// design stage to fit — up as well as down, since a viewer's job is to be
// big and readable.
//
// PHONE TIER (2026-08-06). Scaling a 1992px stage into a 360px WebView made
// every figure eyestrain-small, so like PlayTable the tier decision is
// geometric: under 640px of width the viewer stops scaling the 3×3 stage and
// STACKS the record instead — hands, auction, the play, the panels — at
// phone-native sizes, with the page scrolling vertically. Same palette, same
// panels, different arrangement.

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { AuctionCall, Card, Seat, Suit } from "@bridge/events";

// The design's palette and metrics, lifted verbatim.
const GOLD = "#ffce04";
const RED = "#cb0200";
const GREEN = "#016700";
const PANEL_BG = "#cbcbcb";
const AQUA = "#99cccc";
const BADGE = "#336799";

const COL = 648;
const ROW = 400;
const GAP = 8;
const PAD = 8;
/** 3 columns + gaps + padding — the stage everything scales from. */
const BASE = { w: PAD * 2 + COL * 3 + GAP * 2, h: PAD * 2 + ROW * 3 + GAP * 2 };

const GLYPH: Record<string, string> = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" };
const ORDER: Seat[] = ["W", "N", "E", "S"];
const DISPLAY: Suit[] = ["S", "H", "D", "C"];

const isRed = (s: string) => s === "H" || s === "D";
const isBid = (c: string) => /^[1-7][CDHSN]$/.test(c);
const rankText = (r: number) => (({ 11: "J", 12: "Q", 13: "K", 14: "A" }) as Record<number, string>)[r] ?? String(r);

/** One trick as the record shows it — the engine's Trick, structurally. */
export interface TrickLine {
  leader: Seat;
  plays: readonly { seat: Seat; card: Card }[];
  winner?: Seat | undefined;
}

export interface HandViewerProps {
  boardLabel: string | number;
  dealer: Seat;
  /** Engine vul ("none"|"ns"|"ew"|"both") or record style ("NS"|"EW"|"All"). */
  vul: string;
  hands: Record<Seat, Card[]>;
  names: Record<Seat, string>;
  /** Face-down seats render suit dashes — a live viewer must not leak. */
  visible?: Record<Seat, boolean>;
  auction?: readonly AuctionCall[];
  /**
   * The play, trick by trick, for the centre cell — the one part of a full
   * hand record the grid didn't carry. Lead underlined, winner's card on
   * gold: the two marks a printed deal analysis uses.
   */
  tricks?: readonly TrickLine[];
  /** Gold plate — the seat on turn, or the declarer on a finished record. */
  highlightSeat?: Seat | null;
  /** Bottom-left panel: table context (who plays whom, tricks so far…). */
  info?: readonly { label: string; value: string }[];
  /** Bottom-right panel: contract and score. */
  result?: readonly { label: string; value: string }[];
  /** Controls rendered inside the canvas, under the vul/board card. */
  nav?: ReactNode;
}

export function HandViewer({
  boardLabel,
  dealer,
  vul,
  hands,
  names,
  visible,
  auction = [],
  tricks,
  highlightSeat = null,
  info = [],
  result = [],
  nav,
}: Readonly<HandViewerProps>) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: BASE.w, h: BASE.h });
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth || BASE.w, h: el.clientHeight || BASE.h });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = Math.min(box.w / BASE.w, box.h / BASE.h) || 1;

  // The tier switch, and the metric that carries it: every figure below is a
  // design-stage size passed through px(). On the stage k is 1 and the design
  // numbers hold verbatim; on the phone tier the panels are drawn at a fixed
  // comfortable fraction and laid out in a column instead of being scaled.
  const phone = box.w < 640;
  const k = phone ? 0.36 : 1;
  const px = (v: number) => Math.max(1, Math.round(v * k));

  const sideVul = (seat: Seat) => {
    const v = vul.toLowerCase();
    const side = seat === "N" || seat === "S" ? "ns" : "ew";
    return v === "both" || v === "all" || v === side;
  };

  // ---- vul/board card: the classic cross — arms red for vulnerable sides,
  // the dealer's arm marked gold, the board number in the middle.
  const arm = px(57);
  const mid = px(145);
  const vulArm = (seat: Seat) => {
    const v = sideVul(seat);
    const isDealer = seat === dealer;
    return (
      <div style={{ background: isDealer ? GOLD : v ? RED : "#fff", color: v && !isDealer ? "#fff" : "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: px(30), fontWeight: 700 }}>
        {seat}
      </div>
    );
  };
  const vulBoardCard = (
    <div style={{ width: arm * 2 + mid + 4, display: "grid", gridTemplateColumns: `${arm}px ${mid}px ${arm}px`, gridTemplateRows: `${arm}px ${mid}px ${arm}px`, gap: 2, padding: 2, background: "#000", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }}>
      <div style={{ background: "#000" }} />
      {vulArm("N")}
      <div style={{ background: "#000" }} />
      {vulArm("W")}
      <div title={String(boardLabel)} style={{ background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: px(String(boardLabel).length > 8 ? 24 : String(boardLabel).length > 3 ? 40 : 104), fontWeight: 700, color: "#000", overflow: "hidden", padding: "0 4px", textAlign: "center", lineHeight: 1.05, wordBreak: "break-all" }}>{boardLabel}</div>
      {vulArm("E")}
      <div style={{ background: "#000" }} />
      {vulArm("S")}
      <div style={{ background: "#000" }} />
    </div>
  );

  // ---- one seat: 70px plate (gold when highlighted) over a grey suit panel.
  const seatPanel = (seat: Seat) => {
    const see = visible?.[seat] ?? true;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignSelf: "stretch" }}>
        <div style={{ display: "flex", alignItems: "center", height: px(70), background: seat === highlightSeat ? GOLD : "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.35)" }}>
          <span style={{ flex: "none", width: px(70), height: px(70), background: BADGE, color: "#fff", fontSize: px(52), fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{seat}</span>
          <span style={{ padding: `0 ${px(14)}px`, fontSize: px(52), color: "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{names[seat]}</span>
          {!see && <span style={{ marginLeft: "auto", paddingRight: px(14), fontSize: px(24), color: "#666" }}>hidden</span>}
        </div>
        <div style={{ flex: 1, background: PANEL_BG, padding: `${px(4)}px ${px(14)}px ${px(10)}px` }}>
          {DISPLAY.map((su) => {
            const cards = [...hands[seat]].filter((x) => x.suit === su).sort((a, b) => b.rank - a.rank);
            return (
              <div key={su} style={{ display: "flex", alignItems: "baseline", gap: px(10), lineHeight: 1.35, fontSize: px(58), color: isRed(su) ? RED : "#000" }}>
                <span style={{ flex: "none", width: px(58) }}>{GLYPH[su]}</span>
                <span style={{ color: "#000", letterSpacing: 1, whiteSpace: "nowrap", overflow: "hidden" }}>
                  {see ? (cards.length ? cards.map((x) => rankText(x.rank)).join("") : "—") : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ---- the full auction, dealer-aligned, vulnerable seats red in the head.
  const auctionRows: (AuctionCall | null)[][] = [];
  {
    const padded: (AuctionCall | null)[] = [
      ...Array.from({ length: ORDER.indexOf(dealer) }, () => null),
      ...auction,
    ];
    for (let i = 0; i < padded.length; i += 4) auctionRows.push(padded.slice(i, i + 4));
  }
  const callCell = (call: string) =>
    isBid(call) ? (
      <>
        {call[0]}
        <span style={{ color: isRed(call[1] ?? "") ? RED : "#000" }}>{GLYPH[call[1] ?? ""]}</span>
      </>
    ) : call === "P" ? "P" : call;
  const auctionBox = (
    <div style={{ width: "100%", height: phone ? "auto" : 374, background: AQUA, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }}>
      <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, padding: 2, textAlign: "center" }}>
        {ORDER.map((s) => (
          <span key={s} style={{ padding: "2px 0", fontSize: px(42), fontWeight: 700, lineHeight: 1.15, background: sideVul(s) ? RED : "#fff", color: sideVul(s) ? "#fff" : "#000" }}>{s}</span>
        ))}
      </div>
      <div style={{ flex: phone ? "none" : 1, minHeight: 0, overflowY: phone ? "visible" : "auto", padding: "2px 8px" }}>
        {auctionRows.map((row, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", textAlign: "center" }}>
            {[0, 1, 2, 3].map((j) => (
              <span key={j} style={{ fontSize: px(42), lineHeight: 1.25, color: "#000" }}>
                {row[j] ? callCell(row[j]!.call) : ""}
              </span>
            ))}
          </div>
        ))}
        {auction.length === 0 && (
          <div style={{ textAlign: "center", fontSize: px(32), color: "#1e4747", padding: `${px(10)}px 0` }}>No calls yet</div>
        )}
      </div>
    </div>
  );

  // ---- the play, trick by trick: seat columns like the auction box, one row
  // per trick. The lead is underlined, the winner's card sits on gold.
  const playedTricks = (tricks ?? []).filter((t) => t.plays.length > 0);
  const cardText = (card: Card) => (
    <>
      {rankText(card.rank)}
      <span style={{ color: isRed(card.suit) ? RED : "#000" }}>{GLYPH[card.suit]}</span>
    </>
  );
  const tricksBox = tricks && (
    <div style={{ width: "100%", height: phone ? "auto" : "100%", background: AQUA, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }}>
      <div style={{ flex: "none", display: "grid", gridTemplateColumns: `${px(64)}px repeat(4,1fr)`, gap: 2, padding: 2, textAlign: "center" }}>
        <span style={{ padding: "2px 0", fontSize: px(34), fontWeight: 700, lineHeight: 1.15, background: "#fff", color: "#666" }}>#</span>
        {ORDER.map((s) => (
          <span key={s} style={{ padding: "2px 0", fontSize: px(34), fontWeight: 700, lineHeight: 1.15, background: "#fff", color: "#000" }}>{s}</span>
        ))}
      </div>
      <div style={{ flex: phone ? "none" : 1, minHeight: 0, overflowY: phone ? "visible" : "auto", padding: "2px 8px" }}>
        {playedTricks.map((t, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: `${px(64)}px repeat(4,1fr)`, textAlign: "center", alignItems: "baseline" }}>
            <span style={{ fontSize: px(28), lineHeight: 1.3, color: "#1e4747" }}>{i + 1}</span>
            {ORDER.map((s) => {
              const card = t.plays.find((p) => p.seat === s)?.card;
              return (
                <span
                  key={s}
                  style={{
                    fontSize: px(34), lineHeight: 1.3, color: "#000",
                    background: card && t.winner === s ? GOLD : undefined,
                    textDecoration: card && t.leader === s ? "underline" : undefined,
                    textUnderlineOffset: px(4),
                  }}
                >
                  {card ? cardText(card) : ""}
                </span>
              );
            })}
          </div>
        ))}
        {playedTricks.length === 0 && (
          <div style={{ textAlign: "center", fontSize: px(32), color: "#1e4747", padding: `${px(10)}px 0` }}>No cards played yet</div>
        )}
      </div>
    </div>
  );

  const infoPanel = (lines: readonly { label: string; value: string }[]) => (
    <div style={{ width: "100%", alignSelf: "end", background: AQUA, padding: `${px(10)}px ${px(16)}px`, boxShadow: "0 2px 6px rgba(0,0,0,.4)" }}>
      {lines.map((line, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: px(16), fontSize: px(40), lineHeight: 1.3, color: "#000" }}>
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line.label}</span>
          <span style={{ flex: "none", fontWeight: 700 }}>{line.value}</span>
        </div>
      ))}
    </div>
  );

  // ---- phone: the record as a column, at native sizes, scrolling ------------
  if (phone) {
    return (
      <div ref={wrapRef} style={{ position: "relative", width: "100%", height: "100%", overflowY: "auto", background: GREEN, fontFamily: "Arial, Helvetica, sans-serif", WebkitFontSmoothing: "antialiased" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            {vulBoardCard}
            {nav}
          </div>
          {seatPanel("N")}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>{seatPanel("W")}</div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>{seatPanel("E")}</div>
          </div>
          {seatPanel("S")}
          {auctionBox}
          {tricksBox}
          {infoPanel(info)}
          {infoPanel(result)}
        </div>
      </div>
    );
  }

  // ---- stage ----------------------------------------------------------------
  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, Helvetica, sans-serif", WebkitFontSmoothing: "antialiased" }}>
      <div style={{ flex: "none", transformOrigin: "center center", width: BASE.w, height: BASE.h, transform: `scale(${scale})` }}>
        <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(3, ${COL}px)`, gridTemplateRows: `repeat(3, ${ROW}px)`, gap: GAP, padding: PAD, background: GREEN }}>
          {/* Card and nav sit SIDE BY SIDE: the rows are fixed 400px, and a
              stacked column overflows into West's cell below. */}
          <div style={{ justifySelf: "start", alignSelf: "start", display: "flex", gap: 24, alignItems: "flex-start", maxHeight: ROW, overflow: "hidden" }}>
            {vulBoardCard}
            {nav}
          </div>
          {seatPanel("N")}
          <div style={{ alignSelf: "start", width: "100%" }}>{auctionBox}</div>

          {seatPanel("W")}
          {tricksBox || <div />}
          {seatPanel("E")}

          <div style={{ display: "flex", alignItems: "end" }}>{infoPanel(info)}</div>
          {seatPanel("S")}
          <div style={{ display: "flex", alignItems: "end" }}>{infoPanel(result)}</div>
        </div>
      </div>
    </div>
  );
}
