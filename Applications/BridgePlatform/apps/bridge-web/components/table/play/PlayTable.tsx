"use client";

// PlayTable — the "Play Table" design (Claude Design project 8bcef4b8), built as
// a REUSABLE COMPONENT so several tables can live on one page at once.
//
// The prototype was a single-instance page: `position:fixed;inset:0`, a global
// `window.resize` listener, and a stage scaled against the viewport. All three
// break the moment you mount a second one. This version:
//
//   · fills its OWN container (position:relative) rather than the viewport;
//   · measures that container with a per-instance ResizeObserver;
//   · keeps every id, timer and piece of state inside the instance.
//
// It is otherwise presentational: the board comes in through props and every
// action goes back out through callbacks, so the caller owns the rules. That is
// what lets the demo page run three independent tables side by side.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { AuctionCall, Card, Seat, Suit } from "@bridge/events";
import { SettingsMenu, type SettingsItem } from "./SettingsMenu";

// ---------------------------------------------------------------------------
// The design's palette and metrics, lifted from the prototype verbatim.
// ---------------------------------------------------------------------------
const RED = "#cc0000";
const GOLD = "#fecd07";
const GREY = "#d3d3d3";
const FELT = "radial-gradient(125% 115% at 33% 20%,#26805e 0%,#1c6b4f 45%,#14563f 100%)";
const RAIL_BLUE = "#384bb3";
const PANEL = "#acc5c5";
const CARD_BACK = "#0d707c";
const SEAT_BADGE = "#12525e";

/** The stage the design was drawn at; everything scales from here. */
const BASE = { w: 1040, h: 590 };

const GLYPH: Record<string, string> = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" };
const STRAINS = ["C", "D", "H", "S", "N"] as const;
const ORDER: Seat[] = ["W", "N", "E", "S"];
const DISPLAY: Suit[] = ["S", "H", "C", "D"];
const PARTNER: Record<Seat, Seat> = { N: "S", S: "N", E: "W", W: "E" };

const isRed = (s: string) => s === "H" || s === "D";
const rankText = (r: number) => (({ 11: "J", 12: "Q", 13: "K", 14: "A" }) as Record<number, string>)[r] ?? String(r);
const isBid = (c: string) => /^[1-7][CDHSN]$/.test(c);
const callText = (c: string) =>
  c === "P" ? "Pass" : c === "X" ? "X" : c === "XX" ? "XX" : `${c[0]}${GLYPH[c[1] ?? ""] ?? ""}`;
const callColor = (c: string) => (isBid(c) && isRed(c[1] ?? "") ? RED : "#000");
const sideOf = (s: Seat) => (s === "N" || s === "S" ? "NS" : "EW");

// ---------------------------------------------------------------------------

export interface PlayTableSeat {
  /** Name on the plate, e.g. "you" or "House · Full SAYC". */
  name: string;
  /** Small right-aligned note, e.g. "dummy". */
  tag?: string;
}

export interface PlayTableProps {
  /** The board. Only the fields the table draws are required. */
  state: {
    hands: Record<Seat, Card[]>;
    auction: AuctionCall[];
    tricks: { plays: { seat: Seat; card: Card }[] }[];
    phase: string;
    turn: Seat;
    contract: { level: number; strain: string; declarer: Seat; doubled?: number } | null;
    trickCount: { NS: number; EW: number };
    dealer: Seat;
    vul: string;
  };
  seats: Record<Seat, PlayTableSeat>;
  /** Which hands are face-up. */
  visible: Record<Seat, boolean>;
  /** The viewer's seat, if they are sitting in. */
  mySeat?: Seat | null;
  /** Calls that are legal right now — omit or empty to render the box inert. */
  legalCalls?: readonly string[];
  /** Cards that are legal right now, for the seat on turn. */
  legalPlays?: readonly Card[];
  /** True when the human controls the seat on turn. */
  myTurn?: boolean;
  boardLabel?: string | number;
  scoringLabel?: string;
  /** Central auction box, or a call bubble beside each seat. */
  auctionDisplay?: "box" | "seats";
  resultLine?: string;
  resultScore?: string;

  onCall?: (call: string) => void;
  onPlay?: (seat: Seat, card: Card) => void;
  onMenu?: () => void;
  onScoring?: () => void;
  onClaim?: () => void;
  onNewDeal?: () => void;
  /** Rendered into the left rail under the fixed controls. */
  railExtra?: ReactNode;
  /**
   * Settings rows for the ☰ menu (SettingsMenu design). Each row shows its
   * current value and navigates to apply — the caller owns the params. When
   * present (and onMenu isn't), the ☰ opens the overlay itself.
   */
  settings?: readonly { label: string; value: string; href: string }[];
}

export function PlayTable({
  state,
  seats,
  visible,
  mySeat = null,
  legalCalls = [],
  legalPlays = [],
  myTurn = false,
  boardLabel = "1",
  scoringLabel = "IMPs",
  auctionDisplay = "box",
  resultLine = "",
  resultScore = "",
  onCall,
  onPlay,
  onMenu,
  onScoring,
  onClaim,
  onNewDeal,
  railExtra,
  settings,
}: Readonly<PlayTableProps>) {
  // --- per-instance sizing. The prototype watched `window`; this watches the
  // element, which is what makes a second instance possible at all.
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

  // Armed bid level (the two-step bid box) is instance state.
  const [armed, setArmed] = useState<number | null>(null);
  useEffect(() => setArmed(null), [state.auction.length]);

  // The ☰ settings overlay is instance state too. An explicit onMenu prop
  // wins (the design's "prop handler wins" rule); otherwise the table opens
  // its own menu when settings rows were provided.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuHandler = onMenu ?? (settings ? () => setMenuOpen((v) => !v) : undefined);
  const menuItems: SettingsItem[] = [
    ...(settings ?? []),
    ...(onNewDeal
      ? [{ label: "New board", value: "→", on: () => { setMenuOpen(false); onNewDeal(); } }]
      : []),
  ];

  // Scale DOWN to fit, never up: the design is pixel-drawn at 1040x590 and
  // magnifying it past that only coarsens it.
  const scale = Math.min(1, Math.min(box.w / BASE.w, box.h / BASE.h) || 1);
  const stageW = Math.max(BASE.w, box.w / scale);
  const stageH = Math.max(BASE.h, box.h / scale);

  const c = state.contract;
  const declarer = c?.declarer ?? null;
  const dummy = declarer && state.phase !== "auction" ? PARTNER[declarer] : null;
  const inAuction = state.phase === "auction";
  const inPlay = state.phase === "play";
  const complete = state.phase === "complete";
  const legalSet = new Set(legalCalls);
  const playable = new Set(legalPlays.map((p) => `${p.suit}${p.rank}`));
  const myCall = inAuction && myTurn;

  const vulFor = (seat: Seat) => state.vul === "both" || state.vul === "All" || sideOf(seat).toLowerCase() === String(state.vul).toLowerCase();

  const plateBg = (seat: Seat) =>
    seat === dummy || (!complete && seat === state.turn) ? "#fff" : "#b3b3b3";

  const lastCallAt = (seat: Seat) =>
    inAuction && auctionDisplay === "seats"
      ? [...state.auction].reverse().find((a) => a.seat === seat)?.call
      : undefined;

  // ---- pieces -------------------------------------------------------------
  const backs = (
    <div style={{ display: "flex", border: "2px solid rgba(255,255,255,.92)", borderRadius: 3, overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,.35)" }}>
      {Array.from({ length: 13 }, (_, i) => (
        <span key={i} style={{ display: "block", width: 14, height: 71, background: CARD_BACK, borderLeft: i ? "1.5px solid rgba(255,255,255,.92)" : "none" }} />
      ))}
    </div>
  );

  const plate = (seat: Seat, width: number | string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 5, width, height: 22, padding: "0 3px", background: plateBg(seat), boxShadow: "0 1px 2px rgba(0,0,0,.4)" }}>
      <span style={{ flex: "none", width: 20, height: 20, background: SEAT_BADGE, color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{seat}</span>
      <span style={{ fontSize: 15, color: "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{seats[seat].name}</span>
      <span style={{ marginLeft: "auto", flex: "none", fontSize: 11, color: "#555" }}>{seats[seat].tag ?? ""}</span>
    </div>
  );

  const bubble = (seat: Seat) => {
    const call = lastCallAt(seat);
    if (!call) return null;
    return (
      <div style={{ background: "#fff", border: "1px solid #7d7d7d", borderRadius: 3, minWidth: 62, textAlign: "center", fontSize: 17, fontWeight: 700, padding: "1px 6px", color: callColor(call) }}>
        {callText(call)}
      </div>
    );
  };

  /** N/S: a fanned row of face cards. */
  const cardRow = (seat: Seat) => {
    const hand = [...state.hands[seat]].sort(
      (a, b) => DISPLAY.indexOf(a.suit) - DISPLAY.indexOf(b.suit) || b.rank - a.rank,
    );
    const live = (card: Card) => myTurn && inPlay && state.turn === seat && playable.has(`${card.suit}${card.rank}`);
    return (
      <div style={{ display: "flex", boxShadow: "0 2px 5px rgba(0,0,0,.35)" }}>
        {hand.map((card, i) => {
          const on = live(card);
          return (
            <button
              key={`${card.suit}${card.rank}`}
              type="button"
              onClick={on ? () => onPlay?.(seat, card) : undefined}
              aria-label={`Play ${rankText(card.rank)}${GLYPH[card.suit]}`}
              style={{
                position: "relative", display: "block", width: 50, height: 71, flex: "none",
                background: "#fff", border: "1px solid #6b6b6b",
                borderRadius: i === 0 ? "3px 0 0 3px" : "0 3px 3px 0",
                marginLeft: i === 0 ? 0 : -1, padding: 0,
                cursor: on ? "pointer" : "default",
                transform: on ? "translateY(-6px)" : "none",
                transition: "transform 120ms ease",
              }}
            >
              <span style={{ position: "absolute", left: 3, top: 1, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: isRed(card.suit) ? RED : "#000" }}>
                <span style={{ fontSize: 25, fontWeight: 700 }}>{rankText(card.rank)}</span>
                <span style={{ fontSize: 22 }}>{GLYPH[card.suit]}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  /** E/W: a compact suit-per-line panel. */
  const suitPanel = (seat: Seat) => (
    <div style={{ width: 197, background: "#fff", border: "1px solid #8a8a8a", borderRadius: 3, padding: "4px 8px", boxShadow: "0 2px 5px rgba(0,0,0,.35)" }}>
      {DISPLAY.map((su) => {
        const cards = state.hands[seat].filter((x) => x.suit === su).sort((a, b) => b.rank - a.rank);
        return (
          <div key={su} style={{ display: "flex", alignItems: "baseline", gap: 5, lineHeight: 1.3, color: isRed(su) ? RED : "#000" }}>
            <span style={{ flex: "none", width: 16, fontSize: 19 }}>{GLYPH[su]}</span>
            <span style={{ display: "flex", flexWrap: "wrap", gap: "0 5px", fontSize: 19 }}>
              {cards.length === 0 ? (
                <span>—</span>
              ) : (
                cards.map((card) => {
                  const on = myTurn && inPlay && state.turn === seat && playable.has(`${card.suit}${card.rank}`);
                  return (
                    <button
                      key={card.rank}
                      type="button"
                      onClick={on ? () => onPlay?.(seat, card) : undefined}
                      aria-label={`Play ${rankText(card.rank)}${GLYPH[su]}`}
                      style={{ background: on ? "#d9f2d9" : "transparent", border: 0, padding: "0 1px", fontSize: 19, fontWeight: on ? 700 : 400, color: "inherit", cursor: on ? "pointer" : "default" }}
                    >
                      {rankText(card.rank)}
                    </button>
                  );
                })
              )}
            </span>
          </div>
        );
      })}
    </div>
  );

  const seatColumn = (seat: Seat) => (
    <div style={{ width: 197, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      {bubble(seat)}
      {visible[seat] ? suitPanel(seat) : backs}
      {plate(seat, 197)}
    </div>
  );

  const seatRow = (seat: Seat) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      {bubble(seat)}
      {visible[seat] ? cardRow(seat) : backs}
      {plate(seat, visible[seat] ? 50 + 12 * 49 : 197)}
    </div>
  );

  // ---- centre -------------------------------------------------------------
  const auctionRows: (AuctionCall | null)[][] = [];
  {
    const padded: (AuctionCall | null)[] = [
      ...Array.from({ length: ORDER.indexOf(state.dealer) }, () => null),
      ...state.auction,
    ];
    for (let i = 0; i < padded.length; i += 4) auctionRows.push(padded.slice(i, i + 4));
  }

  const auctionBox = (
    <div style={{ width: 356, height: 207, background: PANEL, borderRadius: 4, boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(4,1fr)", background: "#fff", textAlign: "center" }}>
        {ORDER.map((s) => (
          <span key={s} style={{ padding: "2px 0", fontSize: 25, fontWeight: 700, lineHeight: 1.1, color: vulFor(s) ? RED : "#000" }}>{s}</span>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "3px 5px", display: "flex", flexDirection: "column", gap: 3 }}>
        {auctionRows.map((row, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, textAlign: "center" }}>
            {[0, 1, 2, 3].map((j) => {
              const e = row[j];
              return (
                <span key={j} style={{ borderRadius: 3, padding: "2px 0", fontSize: 21, lineHeight: 1.15, background: e ? GREY : "transparent", color: e ? callColor(e.call) : "#000" }}>
                  {e ? callText(e.call) : ""}
                </span>
              );
            })}
          </div>
        ))}
        {state.auction.length === 0 && (
          <div style={{ textAlign: "center", fontSize: 17, color: "#3c4c4c", paddingTop: 6 }}>
            {state.dealer === mySeat ? "You deal" : `${state.dealer} deals`}
          </div>
        )}
      </div>
    </div>
  );

  const trickCross = (
    <div style={{ position: "relative", width: 262, height: 262 }}>
      {(["N", "E", "S", "W"] as Seat[]).map((seat) => {
        const play = inPlay ? state.tricks[state.tricks.length - 1]?.plays.find((p) => p.seat === seat) : undefined;
        const pos =
          seat === "N" ? { left: "50%", top: "0", tr: "translateX(-50%)" }
          : seat === "S" ? { left: "50%", top: "182px", tr: "translateX(-50%)" }
          : seat === "W" ? { left: "0", top: "50%", tr: "translateY(-50%)" }
          : { left: "206px", top: "50%", tr: "translateY(-50%)" };
        const onTurn = seat === state.turn;
        return (
          <div key={seat} style={{ position: "absolute", left: pos.left, top: pos.top, transform: pos.tr, zIndex: play ? 2 : 1 }}>
            {play ? (
              <span style={{ position: "relative", display: "block", width: 56, height: 80, background: "#fff", border: "1px solid #6b6b6b", borderRadius: 3, boxShadow: "0 2px 5px rgba(0,0,0,.4)" }}>
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
  );

  const resultCard = (
    <div style={{ background: "#fff", border: "1px solid #7d7d7d", borderRadius: 4, padding: "16px 28px", textAlign: "center", boxShadow: "0 3px 10px rgba(0,0,0,.45)" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#000" }}>{resultLine || "Board complete"}</div>
      {resultScore && <div style={{ fontSize: 18, color: "#444", marginTop: 4 }}>{resultScore}</div>}
      <div style={{ fontSize: 15, color: "#666", marginTop: 6 }}>NS {state.trickCount.NS} · EW {state.trickCount.EW}</div>
      {onNewDeal && (
        <button type="button" onClick={onNewDeal} style={{ marginTop: 12, background: RAIL_BLUE, border: 0, borderRadius: 5, color: "#fff", fontSize: 16, fontWeight: 700, padding: "7px 18px", cursor: "pointer" }}>
          Next board
        </button>
      )}
    </div>
  );

  // ---- bid box ------------------------------------------------------------
  const bidBox = (
    <div style={{ width: 581, height: 107, flex: "none", background: "#cccc9b", borderRadius: 4, padding: "9px 10px", boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", justifyContent: "flex-start", gap: 6, alignItems: "center" }}>
        <button
          type="button"
          onClick={myCall ? () => onCall?.("P") : undefined}
          aria-label="Pass"
          style={{ flex: "none", width: 120, height: 37, border: "1px solid #0c4b0b", borderRadius: 5, background: myCall ? "#116710" : "#a7b8a2", color: "#fff", fontSize: 21, fontWeight: 700, lineHeight: 1, cursor: myCall ? "pointer" : "default", opacity: myCall ? 1 : 0.42 }}
        >
          Pass
        </button>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,57px)", gap: 6 }}>
          {[1, 2, 3, 4, 5, 6, 7].map((l) => {
            const any = STRAINS.some((st) => legalSet.has(`${l}${st}`));
            const live = myCall && any;
            return (
              <button
                key={l}
                type="button"
                onClick={live ? () => setArmed(armed === l ? null : l) : undefined}
                aria-label={`Level ${l}`}
                style={{ height: 37, border: "1px solid #8a8a6a", borderRadius: 5, background: armed === l ? GOLD : "#f8f8f8", color: "#000", fontSize: 23, lineHeight: 1, cursor: live ? "pointer" : "default", opacity: live ? 1 : 0.42 }}
              >
                {l}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ flex: "none", width: 120, display: "flex", gap: 6 }}>
          {(["X", "XX"] as const).map((d) => {
            const live = myCall && legalSet.has(d);
            if (!live) return <span key={d} style={{ width: 57, height: 37 }} />;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onCall?.(d)}
                aria-label={d === "X" ? "Double" : "Redouble"}
                style={{ width: 57, height: 37, border: `1px solid ${d === "X" ? "#8f0000" : "#0a2170"}`, borderRadius: 5, background: d === "X" ? RED : "#1034a6", color: "#fff", fontSize: 21, fontWeight: 700, lineHeight: 1, cursor: "pointer" }}
              >
                {d}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {armed
            ? STRAINS.filter((st) => legalSet.has(`${armed}${st}`)).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => onCall?.(`${armed}${st}`)}
                  aria-label={`${armed}${st === "N" ? "NT" : st}`}
                  style={{ flex: "none", width: st === "N" ? 120 : 57, height: 37, border: "1px solid #8a8a6a", borderRadius: 5, background: "#f8f8f8", color: isRed(st) ? RED : "#000", fontSize: 23, lineHeight: 1, cursor: "pointer" }}
                >
                  {GLYPH[st]}
                </button>
              ))
            : null}
        </div>
      </div>
    </div>
  );

  // ---- rail ---------------------------------------------------------------
  const rail = (
    <div style={{ width: 185, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "14px 10px 18px" }}>
      <button type="button" onClick={menuHandler} title="Table menu and settings" aria-label="Table menu" style={{ width: 100, height: 46, background: RAIL_BLUE, border: "2px solid #dfe4f4", borderRadius: 7, color: "#fff", fontSize: 22, lineHeight: 1, cursor: menuHandler ? "pointer" : "default" }}>☰</button>
      <button type="button" onClick={onScoring} title="Scoring mode" style={{ width: 100, height: 32, background: PANEL, border: "2px solid #f2f4f4", borderRadius: 7, color: "#000", fontSize: 19, fontWeight: 700, lineHeight: 1, cursor: onScoring ? "pointer" : "default" }}>{scoringLabel}</button>
      <div style={{ width: 92, background: "#fff", border: "2px solid #7d7d7d", borderRadius: 3, padding: "2px 6px 8px", textAlign: "center", boxShadow: "0 1px 2px rgba(0,0,0,.5)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#000", lineHeight: 1.2, borderBottom: "1px solid #9a9a9a", marginBottom: 4 }}>{state.dealer}</div>
        <div title={String(boardLabel)} style={{ height: 56, background: PANEL, border: "1px solid #6f8a8a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: String(boardLabel).length > 3 ? 17 : 34, fontWeight: 700, color: "#000", overflow: "hidden", padding: "0 2px", textAlign: "center", lineHeight: 1.05, wordBreak: "break-all" }}>{boardLabel}</div>
      </div>
      {c && (
        <div style={{ width: 92, background: CARD_BACK, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, padding: 2, boxShadow: "0 1px 2px rgba(0,0,0,.5)" }}>
          <div style={{ gridColumn: "span 2", display: "grid", gridTemplateColumns: "34px 1fr" }}>
            <div style={{ background: CARD_BACK }} />
            <div style={{ background: GREY, textAlign: "center", padding: "2px 0", lineHeight: 1.1 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: isRed(c.strain) ? RED : "#000" }}>
                {c.level}{GLYPH[c.strain]}{c.doubled === 1 ? "X" : c.doubled === 2 ? "XX" : ""}
              </div>
              <div style={{ fontSize: 13, color: "#000" }}>{({ N: "North", E: "East", S: "South", W: "West" } as Record<Seat, string>)[c.declarer]}</div>
            </div>
          </div>
          <div style={{ background: CARD_BACK, color: "#fff", textAlign: "center", fontSize: 19, fontWeight: 700, padding: "3px 0" }}>{state.trickCount.NS}</div>
          <div style={{ background: CARD_BACK, color: "#fff", textAlign: "center", fontSize: 19, fontWeight: 700, padding: "3px 0" }}>{state.trickCount.EW}</div>
        </div>
      )}
      {railExtra}
      <div style={{ flex: 1 }} />
      {onClaim && inPlay && (
        <button type="button" onClick={onClaim} style={{ width: 100, height: 36, background: RAIL_BLUE, border: "2px solid #dfe4f4", borderRadius: 7, color: "#fff", fontSize: 17, fontWeight: 700, cursor: "pointer" }}>Claim</button>
      )}
    </div>
  );

  // ---- stage --------------------------------------------------------------
  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, Helvetica, sans-serif", WebkitFontSmoothing: "antialiased" }}>
      <div style={{ position: "relative", flex: "none", transformOrigin: "center center", width: stageW, height: stageH, transform: `scale(${scale})` }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", background: "#000" }}>
          {rail}
          <div style={{ flex: 1, position: "relative", overflow: "hidden", background: FELT }}>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "16px 16px 14px" }}>
              <div style={{ display: "flex", justifyContent: "center" }}>{seatRow("N")}</div>

              <div style={{ flex: 1, minHeight: 207, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 0" }}>
                {seatColumn("W")}
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {inAuction && auctionDisplay === "box" ? auctionBox : null}
                  {inPlay ? trickCross : null}
                  {complete ? resultCard : null}
                </div>
                {seatColumn("E")}
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ height: inAuction ? 113 : 0, flex: "none", display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
                  {inAuction ? bidBox : null}
                </div>
                {seatRow("S")}
              </div>
            </div>
          </div>
        </div>
        {menuOpen && !onMenu && (
          <SettingsMenu accent={RAIL_BLUE} items={menuItems} onClose={() => setMenuOpen(false)} />
        )}
      </div>
    </div>
  );
}
