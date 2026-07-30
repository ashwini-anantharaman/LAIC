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
// action goes back out through callbacks, so the caller owns the rules.
//
// 2026-07-30 design update: seat strips (robots tellable apart), dealer ring +
// DEALER tag + tinted dealer auction column, per-seat bid HISTORY in seats
// mode, hands that shrink as cards go, an optional confirm-bid step, and the
// full NARROW/portrait layout (720×1180 stage: top bar, stacked diagrams,
// pill tricks, touch-sized ranks, full-width bid tray).

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { AuctionCall, Card, Seat, Suit } from "@bridge/events";
import { SettingsMenu, type SettingsItem } from "./SettingsMenu";

// ---------------------------------------------------------------------------
// The design's palette and metrics, lifted from the prototype verbatim.
// ---------------------------------------------------------------------------
const RED = "#cc0000";
const GOLD = "#fecd07";
const GREY = "#d3d3d3";
const DEALER_TINT = "#f2e2b8";
const DEALER_RING = "#b8901f";
const FELT = "radial-gradient(125% 115% at 33% 20%,#26805e 0%,#1c6b4f 45%,#14563f 100%)";
const RAIL_BLUE = "#384bb3";
const PANEL = "#acc5c5";
const CARD_BACK = "#0d707c";
const SEAT_BADGE = "#12525e";

/** The stages the design was drawn at; everything scales from these. */
const BASE_WIDE = { w: 1040, h: 590 };
const BASE_NARROW = { w: 720, h: 1180 };

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
  /**
   * Identity strip at the plate's left edge (SeatPlate design) — distinct
   * colors let several robots at one table be told apart at a glance.
   */
  strip?: string;
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
  /** Central auction box, or the running bid history beside each seat. */
  auctionDisplay?: "box" | "seats";
  /** Stage each human call behind a Confirm / Cancel step (BidBox design). */
  confirmBids?: boolean;
  resultLine?: string;
  resultScore?: string;

  onCall?: (call: string) => void;
  onPlay?: (seat: Seat, card: Card) => void;
  onMenu?: () => void;
  onScoring?: () => void;
  onClaim?: () => void;
  /** Play controls (pause / step / undo) — rail on wide, top bar on narrow. */
  controlsExtra?: ReactNode;
  /** Rendered into the left rail under the fixed controls (wide layout only). */
  railExtra?: ReactNode;
  /**
   * Settings rows for the ☰ menu (SettingsMenu design). Each row shows its
   * current value and navigates to apply — the caller owns the params. When
   * present (and onMenu isn't), the ☰ opens the overlay itself.
   */
  settings?: readonly { label: string; value: string; href: string }[];
  /** Rail chip above Claim (the SideRail design's view toggle), e.g. "Hands". */
  viewHref?: { label: string; href: string };
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
  confirmBids = false,
  resultLine = "",
  resultScore = "",
  onCall,
  onPlay,
  onMenu,
  onScoring,
  onClaim,
  controlsExtra,
  railExtra,
  settings,
  viewHref,
}: Readonly<PlayTableProps>) {
  // --- per-instance sizing. The prototype watched `window`; this watches the
  // element, which is what makes a second instance possible at all.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: BASE_WIDE.w, h: BASE_WIDE.h });
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth || BASE_WIDE.w, h: el.clientHeight || BASE_WIDE.h });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Armed bid level and the staged (unconfirmed) call are instance state.
  const [armed, setArmed] = useState<number | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    setArmed(null);
    setPending(null);
  }, [state.auction.length]);

  // The ☰ settings overlay is instance state too. An explicit onMenu prop
  // wins (the design's "prop handler wins" rule); otherwise the table opens
  // its own menu when settings rows were provided.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuHandler = onMenu ?? (settings ? () => setMenuOpen((v) => !v) : undefined);
  const menuItems: SettingsItem[] = [...(settings ?? [])];

  // Portrait containers get the narrow stage (the design's phone layout).
  const narrow = box.w / Math.max(1, box.h) < 1.25;
  const BASE = narrow ? BASE_NARROW : BASE_WIDE;

  // Scale to FIT — down or up. The stage is DOM text and vectors, so a
  // transform scale stays crisp, and the table should use whatever space its
  // container gives it.
  const scale = Math.min(box.w / BASE.w, box.h / BASE.h) || 1;
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
  const boxLive = myCall && !pending;

  const vulFor = (seat: Seat) => state.vul === "both" || state.vul === "All" || sideOf(seat).toLowerCase() === String(state.vul).toLowerCase();
  const dealerCol = ORDER.indexOf(state.dealer);

  const plateBgFor = (seat: Seat) =>
    seat === dummy || (!complete && seat === state.turn) ? "#fff" : "#b3b3b3";
  const panelBgFor = (seat: Seat) =>
    seat === dummy || (!complete && seat === state.turn) ? "#fff" : "#b3b3b3";

  // The staged-call gate: with confirm on, a human call parks in `pending`
  // until confirmed — robots (server seats) are never staged.
  const stageCall = (call: string) => {
    if (!boxLive) return;
    if (confirmBids) setPending(call);
    else onCall?.(call);
  };

  // ---- pieces -------------------------------------------------------------
  /** Face-down cards — as many as the seat still HOLDS, not always 13. */
  const backs = (seat: Seat) => (
    <div style={{ display: "flex", border: "2px solid rgba(255,255,255,.92)", borderRadius: 3, overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,.35)" }}>
      {Array.from({ length: Math.max(1, state.hands[seat].length) }, (_, i) => (
        <span key={i} style={{ display: "block", width: 14, height: 71, background: CARD_BACK, borderLeft: i ? "1.5px solid rgba(255,255,255,.92)" : "none" }} />
      ))}
    </div>
  );

  /** SeatPlate: identity strip, seat badge, name, DEALER mark, dummy tag. */
  const plate = (
    seat: Seat,
    width: number | string,
    m: { height?: number; badge?: number; font?: number; tagFont?: number } = {},
  ) => {
    const h = m.height ?? 22;
    const badge = m.badge ?? 20;
    const font = m.font ?? 15;
    const tagFont = m.tagFont ?? 11;
    const isDealer = seat === state.dealer;
    return (
      <div style={{ display: "flex", alignItems: "stretch", gap: 5, width, height: h, padding: "0 3px 0 0", background: plateBgFor(seat), boxShadow: "0 1px 2px rgba(0,0,0,.45)", border: `2px solid ${isDealer ? DEALER_RING : "transparent"}`, boxSizing: "border-box", overflow: "hidden" }}>
        <span style={{ flex: "none", width: 6, background: seats[seat].strip ?? "transparent" }} />
        <span style={{ flex: "none", width: badge, height: badge, alignSelf: "center", background: SEAT_BADGE, color: "#fff", fontSize: font - 1, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{seat}</span>
        <span style={{ alignSelf: "center", fontSize: font, color: "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{seats[seat].name}</span>
        {isDealer && (
          <span style={{ alignSelf: "center", flex: "none", padding: "0 2px", fontSize: tagFont, fontWeight: 700, color: "#7a5a12" }}>DEALER</span>
        )}
        <span style={{ marginLeft: "auto", alignSelf: "center", flex: "none", fontSize: tagFont, color: "#555" }}>{seats[seat].tag ?? ""}</span>
      </div>
    );
  };

  /** Seats mode shows each seat's WHOLE bid history — latest call bold. */
  const callsRow = (seat: Seat, font = 16) => {
    if (!inAuction || auctionDisplay !== "seats") return null;
    const mine = state.auction.filter((a) => a.seat === seat);
    if (!mine.length) return null;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 3 }}>
        {mine.map((a, i) => {
          const latest = i === mine.length - 1;
          return (
            <span key={i} style={{ background: latest ? "#fff" : "#e8e8e8", border: "1px solid #7d7d7d", borderRadius: 3, minWidth: 34, textAlign: "center", fontSize: font, fontWeight: latest ? 700 : 400, padding: "0 5px", color: callColor(a.call) }}>
              {callText(a.call)}
            </span>
          );
        })}
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

  /** Suit-per-line panel (E/W wide; every seat narrow). Touch seats get big rank targets. */
  const suitPanel = (
    seat: Seat,
    m: { width: number | string; suitW?: number; font?: number; pad?: string; bare?: boolean; touch?: boolean } = { width: 197 },
  ) => {
    const font = m.font ?? 19;
    const touchy = !!m.touch && myTurn && inPlay && state.turn === seat;
    return (
      <div style={{ width: m.width, background: m.bare ? panelBgFor(seat) : "#fff", border: m.bare ? 0 : "1px solid #8a8a8a", borderRadius: m.bare ? 0 : 3, padding: m.pad ?? "4px 8px", boxShadow: "0 2px 5px rgba(0,0,0,.4)", boxSizing: "border-box" }}>
        {DISPLAY.map((su) => {
          const cards = state.hands[seat].filter((x) => x.suit === su).sort((a, b) => b.rank - a.rank);
          return (
            <div key={su} style={{ display: "flex", alignItems: "center", gap: 5, lineHeight: 1.3, color: isRed(su) ? RED : "#000" }}>
              <span style={{ flex: "none", width: m.suitW ?? 16, fontSize: font }}>{GLYPH[su]}</span>
              <span style={{ display: "flex", flexWrap: "wrap", gap: touchy ? "0 4px" : "0 5px", fontSize: font }}>
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
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: touchy ? 84 : 0, minHeight: touchy ? 78 : 0, background: on ? "#d9f2d9" : "transparent", border: 0, borderRadius: touchy ? 6 : 0, padding: touchy ? "0 4px" : "0 1px", fontSize: font, fontWeight: on ? 700 : 400, color: "inherit", cursor: on ? "pointer" : "default" }}
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
  };

  const seatColumn = (seat: Seat) => (
    <div style={{ width: 197, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      {callsRow(seat)}
      {visible[seat] ? suitPanel(seat, { width: 197 }) : backs(seat)}
      {plate(seat, 197)}
    </div>
  );

  const seatRow = (seat: Seat) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      {callsRow(seat)}
      {visible[seat] ? cardRow(seat) : backs(seat)}
      {/* The plate spans the fan, so it NARROWS as cards are played. */}
      {plate(seat, visible[seat] ? 50 + Math.max(0, state.hands[seat].length - 1) * 49 : 197)}
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

  /** Vulnerable seats sit on red; the dealer's column is tinted throughout. */
  const auctionBox = (m: { width: number; height: number | "auto"; headFont: number; cellFont: number; radius?: number } = { width: 356, height: 207, headFont: 25, cellFont: 21, radius: 4 }) => (
    <div style={{ width: m.width, height: m.height, maxHeight: 340, background: PANEL, borderRadius: m.radius ?? 0, boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, padding: 2, textAlign: "center" }}>
        {ORDER.map((s) => {
          const vul = vulFor(s);
          const isDealer = s === state.dealer;
          return (
            <span key={s} style={{ padding: "2px 0", fontSize: m.headFont, fontWeight: 700, lineHeight: 1.1, background: vul ? "#cc1111" : isDealer ? DEALER_TINT : "#fff", color: vul ? "#fff" : "#000" }}>
              {s}
              {isDealer ? " •" : ""}
            </span>
          );
        })}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "3px 5px", display: "flex", flexDirection: "column", gap: 3 }}>
        {auctionRows.map((row, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, textAlign: "center" }}>
            {[0, 1, 2, 3].map((j) => {
              const e = row[j];
              return (
                <span key={j} style={{ borderRadius: 3, padding: "2px 0", fontSize: m.cellFont, lineHeight: 1.15, background: e ? (j === dealerCol ? DEALER_TINT : GREY) : "transparent", color: e ? callColor(e.call) : "#000" }}>
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

  const currentPlays = inPlay ? (state.tricks[state.tricks.length - 1]?.plays ?? []) : [];

  const trickCross = (
    <div style={{ position: "relative", width: 262, height: 262 }}>
      {(["N", "E", "S", "W"] as Seat[]).map((seat) => {
        const play = currentPlays.find((p) => p.seat === seat);
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

  /** Narrow centre: the TrickArea design's pill variant. */
  const trickPills = (
    <div style={{ position: "relative", width: 300, height: 220 }}>
      {(["N", "E", "S", "W"] as Seat[]).map((seat) => {
        const play = currentPlays.find((p) => p.seat === seat);
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

  const resultCard = (
    <div style={{ background: "#fff", border: "1px solid #7d7d7d", borderRadius: 4, padding: "16px 28px", textAlign: "center", boxShadow: "0 3px 10px rgba(0,0,0,.45)" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#000" }}>{resultLine || "Board complete"}</div>
      {resultScore && <div style={{ fontSize: 18, color: "#444", marginTop: 4 }}>{resultScore}</div>}
      <div style={{ fontSize: 15, color: "#666", marginTop: 6 }}>NS {state.trickCount.NS} · EW {state.trickCount.EW}</div>
    </div>
  );

  // ---- bid box ------------------------------------------------------------
  const bidBtnStyle = (w: number, h: number, bg: string, border: string, live: boolean, font = 21): CSSProperties => ({
    flex: "none", width: w, height: h, border: `1px solid ${border}`, borderRadius: 5,
    background: bg, color: "#fff", fontSize: font, fontWeight: 700, lineHeight: 1,
    cursor: live ? "pointer" : "default", opacity: live ? 1 : 0.42,
  });

  const confirmButtons = (h: number, font: number) => (
    <>
      <button
        type="button"
        onClick={() => {
          const p = pending!;
          setPending(null);
          onCall?.(p);
        }}
        style={bidBtnStyle(240, h, "#116710", "#0c4b0b", true, font)}
      >
        Confirm {callText(pending ?? "")}
      </button>
      <button
        type="button"
        onClick={() => {
          setPending(null);
          setArmed(null);
        }}
        style={bidBtnStyle(120, h, "#8a3030", "#5e1c1c", true, font)}
      >
        Cancel
      </button>
    </>
  );

  const levelButtons = (w: number, h: number, font: number) =>
    [1, 2, 3, 4, 5, 6, 7].map((l) => {
      const any = STRAINS.some((st) => legalSet.has(`${l}${st}`));
      const live = boxLive && any;
      return (
        <button
          key={l}
          type="button"
          onClick={live ? () => setArmed(armed === l ? null : l) : undefined}
          aria-label={`Level ${l}`}
          style={{ flex: "none", width: w, height: h, border: "1px solid #8a8a6a", borderRadius: 5, background: armed === l ? GOLD : "#f8f8f8", color: "#000", fontSize: font, lineHeight: 1, cursor: live ? "pointer" : "default", opacity: live ? 1 : 0.42 }}
        >
          {l}
        </button>
      );
    });

  const strainButtons = (h: number, font: number, wNT: number, wSuit: number) =>
    armed
      ? STRAINS.filter((st) => legalSet.has(`${armed}${st}`)).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => stageCall(`${armed}${st}`)}
            aria-label={`${armed}${st === "N" ? "NT" : st}`}
            style={{ flex: "none", width: st === "N" ? wNT : wSuit, height: h, border: "1px solid #8a8a6a", borderRadius: 5, background: "#f8f8f8", color: isRed(st) ? RED : "#000", fontSize: font, lineHeight: 1, cursor: "pointer" }}
          >
            {GLYPH[st]}
          </button>
        ))
      : null;

  const doubleButtons = (w: number, h: number, font: number) =>
    (["X", "XX"] as const).map((d) => {
      const live = boxLive && legalSet.has(d);
      if (!live) return <span key={d} style={{ width: w, height: h }} />;
      return (
        <button
          key={d}
          type="button"
          onClick={() => stageCall(d)}
          aria-label={d === "X" ? "Double" : "Redouble"}
          style={{ flex: "none", width: w, height: h, border: `1px solid ${d === "X" ? "#8f0000" : "#0a2170"}`, borderRadius: 5, background: d === "X" ? RED : "#1034a6", color: "#fff", fontSize: font, fontWeight: 700, lineHeight: 1, cursor: "pointer" }}
        >
          {d}
        </button>
      );
    });

  const passButton = (w: number, h: number, font: number) => (
    <button
      type="button"
      onClick={boxLive ? () => stageCall("P") : undefined}
      aria-label="Pass"
      style={bidBtnStyle(w, h, boxLive ? "#116710" : "#a7b8a2", "#0c4b0b", boxLive, font)}
    >
      Pass
    </button>
  );

  const bidBoxWide = (
    <div style={{ width: 581, height: 107, flex: "none", background: "#cccc9b", borderRadius: 4, padding: "9px 10px", boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", gap: 7, boxSizing: "border-box" }}>
      {pending ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 81 }}>
          <span style={{ fontSize: 19, color: "#3a3a20" }}>Confirm your call:</span>
          {confirmButtons(44, 21)}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "flex-start", gap: 6, alignItems: "center" }}>
            {passButton(120, 37, 21)}
            <div style={{ display: "flex", gap: 6 }}>{levelButtons(57, 37, 23)}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ flex: "none", width: 120, display: "flex", gap: 6 }}>{doubleButtons(57, 37, 21)}</div>
            <div style={{ display: "flex", gap: 6 }}>{strainButtons(37, 23, 120, 57)}</div>
          </div>
        </>
      )}
    </div>
  );

  const bidBoxNarrow = (
    <div style={{ width: "100%", flex: "none", background: "#cccc9b", padding: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, boxShadow: "0 -2px 8px rgba(0,0,0,.45)", boxSizing: "border-box" }}>
      {pending ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "8px 0" }}>
          <span style={{ fontSize: 26, color: "#3a3a20" }}>Confirm your call</span>
          <div style={{ display: "flex", gap: 10 }}>{confirmButtons(64, 28)}</div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 6 }}>
            {passButton(170, 84, 28)}
            {doubleButtons(84, 84, 28)}
          </div>
          <div style={{ display: "flex", gap: 6 }}>{levelButtons(80, 84, 28)}</div>
          {armed && <div style={{ display: "flex", gap: 6 }}>{strainButtons(84, 28, 166, 80)}</div>}
        </>
      )}
    </div>
  );

  // ---- rail (wide) ----------------------------------------------------------
  const menuButton = (w: number, h: number, font: number) => (
    <button type="button" onClick={menuHandler} title="Table menu and settings" aria-label="Table menu" style={{ width: w, height: h, background: RAIL_BLUE, border: "2px solid #dfe4f4", borderRadius: 7, color: "#fff", fontSize: font, lineHeight: 1, cursor: menuHandler ? "pointer" : "default" }}>☰</button>
  );

  const rail = (
    <div style={{ width: 185, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "14px 10px 18px", boxSizing: "border-box" }}>
      {menuButton(100, 46, 22)}
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
      {controlsExtra}
      {railExtra}
      <div style={{ flex: 1 }} />
      {viewHref && (
        <Link href={viewHref.href} title="Switch the view" style={{ width: 100, height: 32, background: PANEL, border: "2px solid #f2f4f4", borderRadius: 7, color: "#000", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>{viewHref.label}</Link>
      )}
      {onClaim && inPlay && (
        <button type="button" onClick={onClaim} style={{ width: 100, height: 36, background: RAIL_BLUE, border: "2px solid #dfe4f4", borderRadius: 7, color: "#fff", fontSize: 17, fontWeight: 700, cursor: "pointer" }}>Claim</button>
      )}
    </div>
  );

  // ---- narrow layout (TableTopBar + stacked diagrams + bid tray) -----------
  const topBar = (
    <div style={{ width: "100%", height: 132, flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "0 10px", background: "#000", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" onClick={onScoring} title="Scoring mode" style={{ width: 116, height: 108, background: PANEL, border: "2px solid #f2f4f4", borderRadius: 6, color: "#000", fontSize: 30, fontWeight: 400, lineHeight: 1, cursor: onScoring ? "pointer" : "default" }}>{scoringLabel}</button>
        <div title={String(boardLabel)} style={{ width: 112, height: 108, background: "#fff", border: "2px solid #7d7d7d", borderRadius: 6, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#000", borderBottom: "1px solid #9a9a9a", width: "80%", textAlign: "center" }}>{state.dealer}</span>
          <span style={{ fontSize: String(boardLabel).length > 3 ? 20 : 40, fontWeight: 700, color: vulFor("N") || vulFor("E") ? "#000" : "#000", padding: "2px 4px", overflow: "hidden", maxWidth: "100%", textAlign: "center" }}>{boardLabel}</span>
        </div>
        {c && (
          <div style={{ width: 170, height: 108, background: GREY, borderRadius: 6, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1.15 }}>
            <span style={{ fontSize: 34, fontWeight: 700, color: isRed(c.strain) ? RED : "#000" }}>
              {c.level}{GLYPH[c.strain]}{c.doubled === 1 ? "X" : c.doubled === 2 ? "XX" : ""}
            </span>
            <span style={{ fontSize: 20, color: "#000" }}>{({ N: "North", E: "East", S: "South", W: "West" } as Record<Seat, string>)[c.declarer]}</span>
            <span style={{ fontSize: 18, color: "#222" }}>NS {state.trickCount.NS} · EW {state.trickCount.EW}</span>
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {onClaim && inPlay && (
          <button type="button" onClick={onClaim} style={{ width: 120, height: 62, background: RAIL_BLUE, border: 0, borderRadius: 6, color: "#fff", fontSize: 26, fontWeight: 400, cursor: "pointer" }}>Claim</button>
        )}
        {controlsExtra}
        {menuButton(58, 108, 30)}
      </div>
    </div>
  );

  const narrowMain = (seat: Seat) => (
    <div style={{ width: 390, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 3 }}>
      {callsRow(seat, 22)}
      {plate(seat, "100%", { height: 44, badge: 40, font: 26, tagFont: 15 })}
      {visible[seat] && suitPanel(seat, { width: "100%", suitW: 38, font: 40, pad: "6px 10px 8px", bare: true })}
    </div>
  );

  const narrowTouch = (seat: Seat) => (
    <div style={{ width: 390, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 3 }}>
      {callsRow(seat, 22)}
      {plate(seat, "100%", { height: 48, badge: 44, font: 28, tagFont: 15 })}
      {visible[seat] && suitPanel(seat, { width: "100%", suitW: 44, font: 42, pad: "6px 10px 10px", bare: true, touch: true })}
    </div>
  );

  const narrowSide = (seat: Seat) => (
    <div style={{ width: 168, flex: "none", display: "flex", flexDirection: "column", gap: 3 }}>
      {callsRow(seat, 22)}
      {plate(seat, "100%", { height: 44, badge: 40, font: 22, tagFont: 13 })}
      {visible[seat] && suitPanel(seat, { width: 168, suitW: 22, font: 25, pad: "5px 7px 7px", bare: true })}
    </div>
  );

  const narrowStage = (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "#000" }}>
      {topBar}
      <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column", overflow: "hidden", background: FELT }}>
        <div style={{ flex: "none", display: "flex", justifyContent: "center", padding: "12px 8px 0" }}>{narrowMain("N")}</div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 8 }}>
          {narrowSide("W")}
          <div style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {inAuction && auctionDisplay === "box" ? auctionBox({ width: 330, height: "auto", headFont: 26, cellFont: 24, radius: 0 }) : null}
            {inPlay ? trickPills : null}
            {complete ? resultCard : null}
          </div>
          {narrowSide("E")}
        </div>
        <div style={{ flex: "none", display: "flex", justifyContent: "center", padding: "0 8px 14px" }}>{narrowTouch("S")}</div>
      </div>
      {inAuction ? bidBoxNarrow : null}
    </div>
  );

  const wideStage = (
    <div style={{ position: "absolute", inset: 0, display: "flex", background: "#000" }}>
      {rail}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", background: FELT }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "16px 16px 14px" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>{seatRow("N")}</div>

          <div style={{ flex: 1, minHeight: 207, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 0" }}>
            {seatColumn("W")}
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {inAuction && auctionDisplay === "box" ? auctionBox() : null}
              {inPlay ? trickCross : null}
              {complete ? resultCard : null}
            </div>
            {seatColumn("E")}
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ height: inAuction ? 113 : 0, flex: "none", display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
              {inAuction ? bidBoxWide : null}
            </div>
            {seatRow("S")}
          </div>
        </div>
      </div>
    </div>
  );

  // ---- stage --------------------------------------------------------------
  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, Helvetica, sans-serif", WebkitFontSmoothing: "antialiased" }}>
      <div style={{ position: "relative", flex: "none", transformOrigin: "center center", width: stageW, height: stageH, transform: `scale(${scale})` }}>
        {narrow ? narrowStage : wideStage}
        {menuOpen && !onMenu && (
          <SettingsMenu accent={RAIL_BLUE} items={menuItems} onClose={() => setMenuOpen(false)} />
        )}
      </div>
    </div>
  );
}
