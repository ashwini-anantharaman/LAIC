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

import { useLayoutEffect, useRef, useState } from "react";
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
  /** Gold plate — the seat on turn, or the declarer on a finished record. */
  highlightSeat?: Seat | null;
  /** Bottom-left panel: table context (who plays whom, tricks so far…). */
  info?: readonly { label: string; value: string }[];
  /** Bottom-right panel: contract and score. */
  result?: readonly { label: string; value: string }[];
}

export function HandViewer({
  boardLabel,
  dealer,
  vul,
  hands,
  names,
  visible,
  auction = [],
  highlightSeat = null,
  info = [],
  result = [],
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

  const sideVul = (seat: Seat) => {
    const v = vul.toLowerCase();
    const side = seat === "N" || seat === "S" ? "ns" : "ew";
    return v === "both" || v === "all" || v === side;
  };

  // ---- vul/board card: the classic cross — arms red for vulnerable sides,
  // the dealer's arm marked gold, the board number in the middle.
  const arm = 57;
  const mid = 145;
  const vulArm = (seat: Seat) => {
    const v = sideVul(seat);
    const isDealer = seat === dealer;
    return (
      <div style={{ background: isDealer ? GOLD : v ? RED : "#fff", color: v && !isDealer ? "#fff" : "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700 }}>
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
      <div title={String(boardLabel)} style={{ background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: String(boardLabel).length > 8 ? 24 : String(boardLabel).length > 3 ? 40 : 104, fontWeight: 700, color: "#000", overflow: "hidden", padding: "0 4px", textAlign: "center", lineHeight: 1.05, wordBreak: "break-all" }}>{boardLabel}</div>
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
        <div style={{ display: "flex", alignItems: "center", height: 70, background: seat === highlightSeat ? GOLD : "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.35)" }}>
          <span style={{ flex: "none", width: 70, height: 70, background: BADGE, color: "#fff", fontSize: 52, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{seat}</span>
          <span style={{ padding: "0 14px", fontSize: 52, color: "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{names[seat]}</span>
          {!see && <span style={{ marginLeft: "auto", paddingRight: 14, fontSize: 24, color: "#666" }}>hidden</span>}
        </div>
        <div style={{ flex: 1, background: PANEL_BG, padding: "4px 14px 10px" }}>
          {DISPLAY.map((su) => {
            const cards = [...hands[seat]].filter((x) => x.suit === su).sort((a, b) => b.rank - a.rank);
            return (
              <div key={su} style={{ display: "flex", alignItems: "baseline", gap: 10, lineHeight: 1.35, fontSize: 58, color: isRed(su) ? RED : "#000" }}>
                <span style={{ flex: "none", width: 58 }}>{GLYPH[su]}</span>
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
    <div style={{ width: "100%", height: 374, background: AQUA, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }}>
      <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, padding: 2, textAlign: "center" }}>
        {ORDER.map((s) => (
          <span key={s} style={{ padding: "2px 0", fontSize: 42, fontWeight: 700, lineHeight: 1.15, background: sideVul(s) ? RED : "#fff", color: sideVul(s) ? "#fff" : "#000" }}>{s}</span>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px" }}>
        {auctionRows.map((row, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", textAlign: "center" }}>
            {[0, 1, 2, 3].map((j) => (
              <span key={j} style={{ fontSize: 42, lineHeight: 1.25, color: "#000" }}>
                {row[j] ? callCell(row[j]!.call) : ""}
              </span>
            ))}
          </div>
        ))}
        {auction.length === 0 && (
          <div style={{ textAlign: "center", fontSize: 32, color: "#1e4747", paddingTop: 10 }}>No calls yet</div>
        )}
      </div>
    </div>
  );

  const infoPanel = (lines: readonly { label: string; value: string }[]) => (
    <div style={{ width: "100%", alignSelf: "end", background: AQUA, padding: "10px 16px", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }}>
      {lines.map((line, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 40, lineHeight: 1.3, color: "#000" }}>
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line.label}</span>
          <span style={{ flex: "none", fontWeight: 700 }}>{line.value}</span>
        </div>
      ))}
    </div>
  );

  // ---- stage ----------------------------------------------------------------
  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, Helvetica, sans-serif", WebkitFontSmoothing: "antialiased" }}>
      <div style={{ flex: "none", transformOrigin: "center center", width: BASE.w, height: BASE.h, transform: `scale(${scale})` }}>
        <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(3, ${COL}px)`, gridTemplateRows: `repeat(3, ${ROW}px)`, gap: GAP, padding: PAD, background: GREEN }}>
          <div style={{ justifySelf: "start", alignSelf: "start" }}>{vulBoardCard}</div>
          {seatPanel("N")}
          <div style={{ alignSelf: "start", width: "100%" }}>{auctionBox}</div>

          {seatPanel("W")}
          <div />
          {seatPanel("E")}

          <div style={{ display: "flex", alignItems: "end" }}>{infoPanel(info)}</div>
          {seatPanel("S")}
          <div style={{ display: "flex", alignItems: "end" }}>{infoPanel(result)}</div>
        </div>
      </div>
    </div>
  );
}
