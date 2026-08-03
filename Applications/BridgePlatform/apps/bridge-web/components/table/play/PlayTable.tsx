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
// 2026-07-30: strips, dealer marks, per-seat bid history, confirm-bid step,
// shrinking hands. 2026-07-31: the portrait layout is Mobile Table.dc.html —
// BBO's phone view as one vertical stack (top bar, dummy row in play, a fixed
// felt with a top-left auction grid or 1.6x trick cards, the bid tray, your
// big-card hand), a fixed 720-wide stage scaled against the MEASURED stack
// height so the hand never falls below the fold.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { AuctionCall, Card, Seat, Suit } from "@bridge/events";
import { resolveSkin, type SkinTokens, type TableAppearance } from "@bridge/table-config";
import { BidColumns } from "./BidColumns";
import { EdgeToolbar, type ToolbarItem } from "./EdgeToolbar";
import { SettingsMenu, type SettingsItem } from "./SettingsMenu";

// ---------------------------------------------------------------------------
// The design's palette and metrics, lifted from the prototype verbatim.
// ---------------------------------------------------------------------------
const RED = "#cc0000";
const GOLD = "#fecd07";
const GREY = "#d3d3d3";
const DEALER_TINT = "#f2e2b8";
const DEALER_RING = "#b8901f";
const SEAT_BADGE = "#12525e";

/** Wide stage; the mobile stack is 720 wide with a MEASURED height. */
const BASE_WIDE = { w: 1040, h: 678 };
const MOBILE_W = 720;
const MOBILE_FELT_H = 430;
/** Mobile hand-card metrics (Mobile Table.dc.html). */
const M_CARD = { w: 54, h: 128, rank: 42, glyph: 38, inset: 5, backW: 52 };

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

/**
 * The fully-resolved look the table dresses itself with: a skin's tokens (five
 * colour overrides already applied by resolveSkin) plus the five layout knobs.
 * When the `appearance` prop is omitted the table falls back to DEFAULT_LOOK —
 * the bbo skin with row hands / grid pad / no frame — whose tokens are, by
 * construction, byte-identical to the pre-skin hard-coded constants above.
 */
export type ResolvedAppearance = SkinTokens &
  Pick<TableAppearance, "handLayout" | "bidPad" | "centreFrame" | "fanSpread" | "fanRadius">;

const DEFAULT_LOOK: ResolvedAppearance = {
  ...resolveSkin("bbo"),
  handLayout: "row",
  bidPad: "grid",
  centreFrame: false,
  fanSpread: 78,
  fanRadius: 0,
};

/** The centre frame's gold surround (design token, wide/stacked only). */
const CENTRE_FRAME: CSSProperties = { border: "3px solid #c9992b", borderRadius: 10, padding: 10 };

/**
 * The design's centreFit: the centre band holds whatever the phase puts there
 * (auction box, trick cross, the suit-column pad), and the CONTENT scales to
 * the band rather than the band growing — the pad at full size is taller than
 * the band and, unclamped, collides with the hands above and below it.
 * offsetWidth/Height read the unscaled layout size, so the fit never feeds
 * back into itself; the 0.005 dead-band stops resize-observer flutter.
 */
function CentreFit({ children }: Readonly<{ children: ReactNode }>) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState(1);
  useLayoutEffect(() => {
    const measure = () => {
      const band = boxRef.current;
      const inner = innerRef.current;
      if (!band || !inner) return;
      const bw = band.clientWidth;
      const bh = band.clientHeight;
      const iw = inner.offsetWidth;
      const ih = inner.offsetHeight;
      if (!bw || !bh || !iw || !ih) return;
      const k = Math.min(1, bw / iw, bh / ih);
      setFit((prev) => (Math.abs(k - prev) > 0.005 ? k : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (boxRef.current) ro.observe(boxRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    return () => ro.disconnect();
  });
  return (
    <div ref={boxRef} style={{ flex: 1, minWidth: 0, minHeight: 0, alignSelf: "stretch", position: "relative", overflow: "hidden" }}>
      <div
        ref={innerRef}
        style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%,-50%) scale(${fit})`, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        {children}
      </div>
    </div>
  );
}

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
  /** Humans get the GOLD plate (seatModel's plateBg rule). */
  human?: boolean;
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
  /** Play controls (pause / step / undo) for the wide rail. */
  controlsExtra?: ReactNode;
  /**
   * Larger-scale controls for the mobile top bar (the stage scales down, so
   * rail-sized chips would fall under thumb size). Falls back to controlsExtra.
   */
  controlsExtraNarrow?: ReactNode;
  /** Rendered into the left rail under the fixed controls (wide layout only). */
  railExtra?: ReactNode;
  /**
   * Settings rows for the ☰ menu (SettingsMenu design). Each row shows its
   * current value and navigates to apply — the caller owns the params. When
   * present (and onMenu isn't), the ☰ opens the overlay itself.
   */
  settings?: readonly SettingsItem[];
  /** Rail chip above Claim (the SideRail design's view toggle), e.g. "Hands". */
  viewHref?: { label: string; href: string };
  /**
   * The resolved skin + layout the table dresses itself with. Omit for the
   * built-in look (bbo, row hands, grid pad, no frame) — byte-identical to the
   * pre-skin table.
   */
  appearance?: ResolvedAppearance;
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
  controlsExtraNarrow,
  railExtra,
  settings,
  viewHref,
  appearance,
}: Readonly<PlayTableProps>) {
  // One skin resolve per render dresses every tier. `tok` carries the colour
  // tokens; the five layout knobs steer fan / columns / frame below.
  const tok = appearance ?? DEFAULT_LOOK;
  const fanLayout = tok.handLayout === "fan";
  const columnsPad = tok.bidPad === "columns";
  const framed = tok.centreFrame;
  const frameStyle: CSSProperties = framed ? CENTRE_FRAME : {};
  // Skin corner radius drives the bid-pad button/box corners (bbo → 5, so the
  // default look is byte-identical). Everything else keeps its authored radius.
  const skinRadius = Number.parseInt(tok.radius, 10) || 5;
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

  // The mobile stack's height changes with phase (bid tray, dummy row, hand),
  // so it is MEASURED, never estimated. offsetHeight ignores the ancestor
  // transform — getBoundingClientRect() would feed the scale it produces.
  const stackRef = useRef<HTMLDivElement | null>(null);
  const [contentH, setContentH] = useState(1100);
  useLayoutEffect(() => {
    const h = stackRef.current?.offsetHeight;
    if (h && Math.abs(h - contentH) > 1) setContentH(h);
  });

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
  // Who-sits-where moved behind the bottom bar's Seats button (SeatsPopup).
  const [seatsOpen, setSeatsOpen] = useState(false);

  // Three tiers (Device Preview.dc.html): phone-sized portrait gets the
  // Mobile Table stack; a narrow-desktop / split pane gets Play Table's
  // stacked-diagram layout; everything else is the wide table.
  const narrow = box.w / Math.max(1, box.h) < 1.25;
  const phone = narrow && box.w < 640;
  const stacked = narrow && !phone;
  const BASE = stacked ? { w: MOBILE_W, h: 1268 } : BASE_WIDE;

  // Wide/stacked: scale to FIT, down or up. Phone: a fixed 720-wide column
  // scaled by BOTH axes against the measured stack height (never up — thumb
  // reach, not magnification), so the hand stays above the fold.
  const scale = phone
    ? Math.min(1, box.w / MOBILE_W, box.h / contentH) || 1
    : Math.min(box.w / BASE.w, box.h / BASE.h) || 1;
  const stageW = phone ? MOBILE_W : Math.max(BASE.w, box.w / scale);
  const stageH = phone ? Math.max(contentH, box.h / scale) : Math.max(BASE.h, box.h / scale);

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

  // seatModel's plate rule: humans GOLD, the acting seat pale, others grey;
  // the suit panel brightens for the acting seat and the dummy.
  const plateBgFor = (seat: Seat) =>
    seats[seat].human ? GOLD : !complete && seat === state.turn ? "#e8e8c8" : GREY;
  const panelBgFor = (seat: Seat) =>
    seat === dummy || (!complete && seat === state.turn) ? "#fff" : "#b3b3b3";

  // The staged-call gate: with confirm on, a human call parks in `pending`
  // until confirmed — robots (server seats) are never staged.
  const stageCall = (call: string) => {
    if (!boxLive) return;
    if (confirmBids) setPending(call);
    else onCall?.(call);
  };
  // Shared by both bid pads (BidBox tray and BidColumns): resolve the staged
  // call, or drop it.
  const confirmPending = () => {
    if (pending == null) return;
    const p = pending;
    setPending(null);
    onCall?.(p);
  };
  const cancelPending = () => {
    setPending(null);
    setArmed(null);
  };

  // ---- pieces -------------------------------------------------------------
  /** Face-down cards — as many as the seat still HOLDS, not always 13. */
  const backs = (seat: Seat, m: { w: number; h: number } = { w: 14, h: 71 }) => (
    <div style={{ display: "flex", border: "2px solid rgba(255,255,255,.92)", borderRadius: 3, overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,.35)" }}>
      {Array.from({ length: Math.max(1, state.hands[seat].length) }, (_, i) => (
        <span key={i} style={{ display: "block", width: m.w, height: m.h, background: tok.cardBack, borderLeft: i ? "1.5px solid rgba(255,255,255,.92)" : "none" }} />
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

  /** A fanned row of face cards (N/S wide; dummy + your hand on mobile). */
  const cardRow = (
    seat: Seat,
    m: { w: number; h: number; rank: number; glyph: number; inset: number } = { w: 50, h: 71, rank: 25, glyph: 22, inset: 3 },
  ) => {
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
                position: "relative", display: "block", width: m.w, height: m.h, flex: "none",
                background: "#fff", border: "1px solid #6b6b6b",
                borderRadius: i === 0 ? "3px 0 0 3px" : "0 3px 3px 0",
                marginLeft: i === 0 ? 0 : -1, padding: 0,
                cursor: on ? "pointer" : "default",
                transform: on ? "translateY(-6px)" : "none",
                transition: "transform 120ms ease",
              }}
            >
              <span style={{ position: "absolute", left: m.inset, top: m.inset > 3 ? m.inset : 1, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: isRed(card.suit) ? RED : "#000" }}>
                <span style={{ fontSize: m.rank, fontWeight: 700 }}>{rankText(card.rank)}</span>
                <span style={{ fontSize: m.glyph }}>{GLYPH[card.suit]}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  /** Suit-per-line panel (E/W wide; every seat in the stacked-narrow tier). */
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

  /**
   * A face-up hand fanned about ONE pivot `radius` px below the top-centre
   * (SeatHand fan geometry). The reserved box is the union of every rotated
   * card's corners, so the fan never clips; the SAME spread refills as cards
   * are played, closing the fan up like a held hand. Wide-tier N/S only.
   */
  const fanHand = (seat: Seat) => {
    const hand = [...state.hands[seat]].sort(
      (a, b) => DISPLAY.indexOf(a.suit) - DISPLAY.indexOf(b.suit) || b.rank - a.rank,
    );
    const n = hand.length;
    const cw = tok.cardW;
    const ch = Math.round(cw * 1.42);
    const spread = tok.fanSpread;
    const radius = tok.fanRadius > 0 ? tok.fanRadius : Math.round(ch * 4.2);
    const angleAt = (i: number) => (n <= 1 ? 0 : -spread / 2 + i * (spread / (n - 1)));
    // Reserved box = union of every rotated card's four corners.
    let xMin = 0, xMax = 0, yMin = 0, yMax = 0;
    for (let i = 0; i < n; i++) {
      const a = (angleAt(i) * Math.PI) / 180;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      for (const dx of [-cw / 2, cw / 2]) {
        for (const dy of [-radius, -radius + ch]) {
          const x = dx * cos - dy * sin;
          const y = dx * sin + dy * cos;
          if (x < xMin) xMin = x;
          if (x > xMax) xMax = x;
          if (y < yMin) yMin = y;
          if (y > yMax) yMax = y;
        }
      }
    }
    const boxW = Math.ceil(Math.max(-xMin, xMax) * 2) + 4;
    const boxH = Math.ceil(yMax - yMin) + 4;
    const fanTop = Math.ceil(-yMin - radius) + 2;
    const rankF = Math.round(cw * 0.46);
    const glyphF = Math.round(cw * 0.4);
    return (
      <div style={{ position: "relative", width: boxW, height: boxH }}>
        {hand.map((card, i) => {
          const on = myTurn && inPlay && state.turn === seat && playable.has(`${card.suit}${card.rank}`);
          return (
            <button
              key={`${card.suit}${card.rank}`}
              type="button"
              onClick={on ? () => onPlay?.(seat, card) : undefined}
              aria-label={`Play ${rankText(card.rank)}${GLYPH[card.suit]}`}
              style={{
                position: "absolute", left: "50%", top: fanTop, width: cw, height: ch, padding: 0,
                background: "#fff", border: "1px solid #6b6b6b", borderRadius: 4,
                boxShadow: "-2px 1px 4px rgba(0,0,0,.28)",
                transform: `translateX(-50%) rotate(${angleAt(i)}deg)${on ? " translateY(-14px)" : ""}`,
                transformOrigin: `50% ${radius}px`,
                transition: "transform 120ms ease",
                cursor: on ? "pointer" : "default",
              }}
            >
              <span style={{ position: "absolute", left: 4, top: 2, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: isRed(card.suit) ? RED : "#000" }}>
                <span style={{ fontSize: rankF, fontWeight: 700 }}>{rankText(card.rank)}</span>
                <span style={{ fontSize: glyphF }}>{GLYPH[card.suit]}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  const seatRow = (seat: Seat) => {
    // Fan dresses face-up wide-tier hands only; face-down seats keep backs.
    const useFan = fanLayout && visible[seat];
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
        {callsRow(seat)}
        {visible[seat] ? (useFan ? fanHand(seat) : cardRow(seat)) : backs(seat)}
        {/* Row mode: the plate spans the fan, so it NARROWS as cards are
            played. Fan mode: a fixed 197px plate (the fan owns its own box). */}
        {plate(seat, useFan ? 197 : visible[seat] ? 50 + Math.max(0, state.hands[seat].length - 1) * 49 : 197)}
      </div>
    );
  };

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
  const auctionBox = (m: { width: number; height: number | "auto" | "100%"; headFont: number; cellFont: number; radius?: number; cellMinH?: number } = { width: 356, height: 207, headFont: 25, cellFont: 21, radius: 4 }) => (
    <div style={{ width: m.width, height: m.height, maxHeight: m.height === "auto" ? 340 : undefined, background: tok.auctionBg, borderRadius: m.radius ?? 0, boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
                <span key={j} style={{ borderRadius: 3, padding: "2px 0", minHeight: m.cellMinH ?? 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: m.cellFont, lineHeight: 1.15, background: e ? (j === dealerCol ? DEALER_TINT : GREY) : "transparent", color: e ? callColor(e.call) : "#000" }}>
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

  /** The trick as real card faces; `k` scales the whole cross (1.6 on phones). */
  const trickCross = (k = 1) => (
    <div style={{ position: "relative", width: 262 * k, height: 262 * k }}>
      {(["N", "E", "S", "W"] as Seat[]).map((seat) => {
        const play = currentPlays.find((p) => p.seat === seat);
        const pos =
          seat === "N" ? { left: "50%", top: "0", tr: "translateX(-50%)" }
          : seat === "S" ? { left: "50%", top: `${182 * k}px`, tr: "translateX(-50%)" }
          : seat === "W" ? { left: "0", top: "50%", tr: "translateY(-50%)" }
          : { left: `${206 * k}px`, top: "50%", tr: "translateY(-50%)" };
        const onTurn = seat === state.turn;
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

  const resultCard = (
    <div style={{ background: "#fff", border: "1px solid #7d7d7d", borderRadius: 4, padding: "16px 28px", textAlign: "center", boxShadow: "0 3px 10px rgba(0,0,0,.45)" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#000" }}>{resultLine || "Board complete"}</div>
      {resultScore && <div style={{ fontSize: 18, color: "#444", marginTop: 4 }}>{resultScore}</div>}
      <div style={{ fontSize: 15, color: "#666", marginTop: 6 }}>NS {state.trickCount.NS} · EW {state.trickCount.EW}</div>
    </div>
  );

  /** Stacked-narrow centre: the TrickArea design's pill variant. */
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

  // ---- bid box ------------------------------------------------------------
  const bidBtnStyle = (w: number, h: number, bg: string, border: string, live: boolean, font = 21): CSSProperties => ({
    flex: "none", width: w, height: h, border: `1px solid ${border}`, borderRadius: skinRadius,
    background: bg, color: "#fff", fontSize: font, fontWeight: 700, lineHeight: 1,
    cursor: live ? "pointer" : "default", opacity: live ? 1 : 0.42,
  });

  const confirmButtons = (h: number, font: number) => (
    <>
      <button
        type="button"
        onClick={confirmPending}
        style={bidBtnStyle(240, h, "#116710", "#0c4b0b", true, font)}
      >
        Confirm {callText(pending ?? "")}
      </button>
      <button
        type="button"
        onClick={cancelPending}
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
          style={{ flex: "none", width: w, height: h, border: "1px solid #8a8a6a", borderRadius: skinRadius, background: armed === l ? GOLD : "#f8f8f8", color: "#000", fontSize: font, lineHeight: 1, cursor: live ? "pointer" : "default", opacity: live ? 1 : 0.42 }}
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
            style={{ flex: "none", width: st === "N" ? wNT : wSuit, height: h, border: "1px solid #8a8a6a", borderRadius: skinRadius, background: "#f8f8f8", color: isRed(st) ? RED : "#000", fontSize: font, lineHeight: 1, cursor: "pointer" }}
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
          style={{ flex: "none", width: w, height: h, border: `1px solid ${d === "X" ? "#8f0000" : "#0a2170"}`, borderRadius: skinRadius, background: d === "X" ? RED : "#1034a6", color: "#fff", fontSize: font, fontWeight: 700, lineHeight: 1, cursor: "pointer" }}
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

  // Row 2 exists only when it has content: legal doubles or an armed level's
  // strains. (Wide sits in reserved space, so hiding it never shifts layout.)
  const anyLegalDouble = legalSet.has("X") || legalSet.has("XX");
  const armedStrains = armed ? STRAINS.filter((st) => legalSet.has(`${armed}${st}`)) : [];

  const bidBoxWide = (
    <div style={{ width: 581, flex: "none", background: tok.trayBg, borderRadius: 4, padding: "9px 10px", boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", gap: 7, boxSizing: "border-box" }}>
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
          {(anyLegalDouble || armedStrains.length > 0) && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ flex: "none", width: 120, display: "flex", gap: 6 }}>{doubleButtons(57, 37, 21)}</div>
              <div style={{ display: "flex", gap: 6 }}>{strainButtons(37, 23, 120, 57)}</div>
            </div>
          )}
        </>
      )}
    </div>
  );

  // Rendered-size touch floor, same reasoning as the toolbars: the phone
  // stage is scaled, so 56 authored is ~30 under the thumb.
  const touchH = Math.max(52, Math.ceil(44 / Math.max(0.05, scale)));

  /** The strain row is ALWAYS five slots tall, empty until a level is armed —
      rendering it only when armed grew the tray on the first tap and shoved
      every control under it down. The buttons must not move mid-bid. */
  const strainSlots = [0, 1, 2, 3, 4].map((i) => {
    const st = armedStrains[i];
    if (!st) return <span key={i} style={{ height: touchH, pointerEvents: "none" }} />;
    return (
      <button
        key={i}
        type="button"
        onClick={() => stageCall(`${armed}${st}`)}
        aria-label={`${armed}${st === "N" ? "NT" : st}`}
        style={{ height: touchH, border: "1px solid #8a8a6a", borderRadius: skinRadius, background: "#f8f8f8", color: isRed(st) ? RED : "#000", fontSize: 26, lineHeight: 1, cursor: "pointer" }}
      >
        {GLYPH[st]}
      </button>
    );
  });

  const bidBoxNarrow = (
    <div style={{ width: "100%", flex: "none", background: tok.trayBg, padding: "8px 10px 10px", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6, boxShadow: "0 -2px 8px rgba(0,0,0,.45)", boxSizing: "border-box" }}>
      {pending ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "8px 0" }}>
          <span style={{ fontSize: 20, color: "#3a3a20" }}>Confirm your call</span>
          <div style={{ display: "flex", gap: 10 }}>{confirmButtons(52, 28)}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6 }}>
          {/* Same 7-column grid as the levels row, so Pass ends exactly where
              the "3" ends instead of landing a few px off from a flex ratio. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5 }}>
            <button
              type="button"
              onClick={boxLive ? () => stageCall("P") : undefined}
              aria-label="Pass"
              style={{ gridColumn: "span 3", minWidth: 0, height: touchH, border: "1px solid #0c4b0b", borderRadius: skinRadius, background: boxLive ? "#116710" : "#a7b8a2", color: "#fff", fontSize: 24, fontWeight: 700, lineHeight: 1, cursor: boxLive ? "pointer" : "default", opacity: boxLive ? 1 : 0.42 }}
            >
              Pass
            </button>
            {(["X", "XX"] as const).map((d) => {
              const live = boxLive && legalSet.has(d);
              if (!live) return <span key={d} style={{ gridColumn: "span 2", minWidth: 0, height: touchH }} />;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => stageCall(d)}
                  aria-label={d === "X" ? "Double" : "Redouble"}
                  style={{ gridColumn: "span 2", minWidth: 0, height: touchH, border: `1px solid ${d === "X" ? "#8f0000" : "#0a2170"}`, borderRadius: skinRadius, background: d === "X" ? RED : "#1034a6", color: "#fff", fontSize: 24, fontWeight: 700, lineHeight: 1, cursor: "pointer" }}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5 }}>
            {[1, 2, 3, 4, 5, 6, 7].map((l) => {
              const any = STRAINS.some((st) => legalSet.has(`${l}${st}`));
              const live = boxLive && any;
              return (
                <button
                  key={l}
                  type="button"
                  onClick={live ? () => setArmed(armed === l ? null : l) : undefined}
                  aria-label={`Level ${l}`}
                  style={{ height: touchH, border: "1px solid #8a8a6a", borderRadius: skinRadius, background: armed === l ? GOLD : "#f8f8f8", color: "#000", fontSize: 26, lineHeight: 1, cursor: live ? "pointer" : "default", opacity: live ? 1 : 0.42 }}
                >
                  {l}
                </button>
              );
            })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 5 }}>{strainSlots}</div>
        </div>
      )}
    </div>
  );

  // ---- suit-column bid pad (BidColumns) -----------------------------------
  // Same intent plumbing as the tray: a legal cell fires stageCall, and the
  // staged call resolves through confirm/cancel. Wide tier drops it in the
  // centre (auction box hidden, bottom tray collapsed); narrow/phone swap it
  // in for the bidBoxNarrow band, scaled up with a touch floor.
  const bidColumnsProps = {
    legalCalls,
    live: boxLive,
    pending,
    onStage: stageCall,
    onConfirm: confirmPending,
    onCancel: cancelPending,
    radius: skinRadius,
  };
  const wideBidColumns = <BidColumns cell={46} {...bidColumnsProps} />;
  const narrowBidColumns = (
    <div style={{ width: "100%", flex: "none", background: tok.trayBg, padding: 10, display: "flex", justifyContent: "center", boxShadow: "0 -2px 8px rgba(0,0,0,.45)", boxSizing: "border-box" }}>
      <BidColumns cell={84} minCellH={touchH} {...bidColumnsProps} />
    </div>
  );

  // ---- edge toolbars (EdgeToolbar.dc.html + toolbarModel) ------------------
  const SEAT_NAMES: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };
  const vulLabel =
    state.vul === "both" || state.vul === "All" ? "Both"
    : state.vul === "none" || state.vul === "None" ? "None"
    : String(state.vul).toUpperCase();
  // The contract slots are ALWAYS present, "\u2014" until there is one — adding
  // chips mid-deal reflows the bar and shifts every control after it.
  const infoItems: ToolbarItem[] = [
    { kind: "chip", label: "Board", value: String(boardLabel) },
    { kind: "chip", label: "Dealer", value: state.dealer },
    { kind: "chip", label: "Vul", value: vulLabel, color: vulLabel === "None" ? "#eef4f1" : "#ff9c9c" },
    { kind: "divider" },
    { kind: "chip", label: "Contract", value: c ? `${c.level}${GLYPH[c.strain]}${c.doubled === 1 ? "X" : c.doubled === 2 ? "XX" : ""}` : "—", color: c && isRed(c.strain) ? "#ff8a8a" : "#eef4f1" },
    { kind: "chip", label: "By", value: c ? SEAT_NAMES[c.declarer] : "—" },
    { kind: "spacer" },
    { kind: "chip", label: "NS", value: String(state.trickCount.NS) },
    { kind: "chip", label: "EW", value: String(state.trickCount.EW) },
    { kind: "button", label: scoringLabel, title: "Scoring mode", on: onScoring ?? null },
  ];
  const actionItems = (controls: ReactNode): ToolbarItem[] => [
    ...(controls ? ([{ kind: "node", node: controls }] as ToolbarItem[]) : []),
    { kind: "divider" },
    ...(viewHref
      ? ([{ kind: "button", label: viewHref.label, title: "Four-hand record", href: viewHref.href }] as ToolbarItem[])
      : []),
    ...(railExtra
      ? ([{ kind: "button", label: "Seats", title: "Who is in each seat", on: () => setSeatsOpen(true) }] as ToolbarItem[])
      : []),
    { kind: "spacer" },
    ...(onClaim && inPlay ? ([{ kind: "button", label: "Claim", tone: "accent", on: onClaim }] as ToolbarItem[]) : []),
    ...(menuHandler
      ? ([{ kind: "icon", label: "☰", tone: "accent", title: "Table settings", ariaLabel: "Table menu", on: menuHandler }] as ToolbarItem[])
      : []),
  ];

  /** SeatsPopup.dc.html: who is in each seat, behind the Seats button. */
  const seatsPopup =
    seatsOpen && railExtra ? (
      <div onClick={() => setSeatsOpen(false)} style={{ position: "absolute", inset: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)" }}>
        {/* Without stopPropagation every click inside the card reaches the
            backdrop and dismisses the popup. */}
        <div onClick={(e) => e.stopPropagation()} style={{ width: 320, maxWidth: "calc(100% - 24px)", background: "#16211d", border: "1px solid #3a4a44", borderRadius: 9, boxShadow: "0 18px 40px rgba(0,0,0,.5)", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#eef4f1" }}>Seats</span>
            <button type="button" aria-label="Close" onClick={() => setSeatsOpen(false)} style={{ width: 28, height: 28, border: 0, borderRadius: 5, background: "#2a3a34", color: "#dfe7e3", fontSize: 15, lineHeight: 1, cursor: "pointer" }}>✕</button>
          </div>
          {railExtra}
        </div>
      </div>
    ) : null;

  /** Dummy's hand as a plate-less card row across the top (phone play view).
      Transparent — it sits on the shared felt wrapper. */
  const dummyRow =
    inPlay && dummy && dummy !== "S" ? (
      <div style={{ flex: "none", display: "flex", justifyContent: "center", padding: 0 }}>
        {visible[dummy] ? cardRow(dummy, M_CARD) : backs(dummy, { w: M_CARD.backW, h: M_CARD.h })}
      </div>
    ) : null;

  // ---- mobile stack (Mobile Table.dc.html) ----------------------------------
  const mobileStack = (
    <div style={{ width: MOBILE_W, minHeight: stageH, transform: `scale(${scale})`, transformOrigin: "top center", display: "flex", flexDirection: "column", background: "#fff" }}>
      <div ref={stackRef} style={{ display: "flex", flexDirection: "column", background: "#fff" }}>
        <EdgeToolbar side="top" items={infoItems} condensed thickness={52} scale={scale} minTouch={44} bg={tok.barBg} accent={tok.accent} />
        {/* ONE felt wrapper behind dummy row, centre, tray and hand: painting
            the radial gradient per-band restarts it, and the greens under the
            top cards visibly failed to match the felt below. */}
        <div style={{ flex: "none", display: "flex", flexDirection: "column", background: tok.felt }}>
          {dummyRow}
          <div style={{ flex: "none", height: MOBILE_FELT_H, display: "flex", alignItems: inAuction ? "flex-start" : "center", justifyContent: inAuction ? "flex-start" : "center", overflow: "hidden", padding: inAuction ? 10 : 0 }}>
            {inAuction && auctionDisplay === "box" ? auctionBox({ width: 430, height: 330, headFont: 26, cellFont: 24, radius: 0, cellMinH: 56 }) : null}
            {inAuction && auctionDisplay === "seats" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 10 }}>
                {(["N", "E", "S", "W"] as Seat[]).map((s) => (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 30, height: 30, background: SEAT_BADGE, color: "#fff", fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{s}</span>
                    {callsRow(s, 22) ?? <span style={{ fontSize: 18, color: "rgba(255,255,255,.6)" }}>—</span>}
                  </div>
                ))}
              </div>
            ) : null}
            {inPlay ? trickCross(1.6) : null}
            {complete ? resultCard : null}
          </div>
          {inAuction ? (columnsPad ? narrowBidColumns : bidBoxNarrow) : null}
          <div style={{ flex: "none", display: "flex", justifyContent: "center", padding: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              {callsRow("S")}
              {visible.S ? cardRow("S", M_CARD) : backs("S", { w: M_CARD.backW, h: M_CARD.h })}
              {/* Default plate metrics — the design keeps SeatPlate stock here. */}
              {plate("S", visible.S ? M_CARD.w + Math.max(0, state.hands.S.length - 1) * (M_CARD.w - 1) : 390)}
            </div>
          </div>
        </div>
        <EdgeToolbar side="bottom" items={actionItems(controlsExtraNarrow ?? controlsExtra)} condensed thickness={52} scale={scale} minTouch={44} bg={tok.barBg} accent={tok.accent} />
      </div>
    </div>
  );

  // ---- stacked-narrow stage (Play Table.dc.html narrow: split pane / narrow
  // desktop — 720x1268, seat diagrams around a pill trick) -------------------
  const stackedMain = (seat: Seat) => (
    <div style={{ width: 390, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 3 }}>
      {callsRow(seat, 22)}
      {plate(seat, "100%", { height: 44, badge: 44, font: 28, tagFont: 15 })}
      {visible[seat] && suitPanel(seat, { width: "100%", suitW: 38, font: 40, pad: "6px 10px 8px", bare: true })}
    </div>
  );
  const stackedSide = (seat: Seat) => (
    <div style={{ width: 168, flex: "none", display: "flex", flexDirection: "column", gap: 3 }}>
      {callsRow(seat, 22)}
      {plate(seat, "100%", { height: 44, badge: 44, font: 24, tagFont: 13 })}
      {visible[seat] && suitPanel(seat, { width: 168, suitW: 22, font: 25, pad: "5px 7px 7px", bare: true })}
    </div>
  );
  const stackedTouch = (seat: Seat) => (
    <div style={{ width: 390, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 3 }}>
      {callsRow(seat, 22)}
      {plate(seat, "100%", { height: 48, badge: 48, font: 30, tagFont: 15 })}
      {visible[seat] && suitPanel(seat, { width: "100%", suitW: 44, font: 42, pad: "6px 10px 10px", bare: true, touch: true })}
    </div>
  );

  const stackedStage = (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: tok.stageBg }}>
      <EdgeToolbar side="top" items={infoItems} scale={scale} minTouch={44} bg={tok.barBg} accent={tok.accent} />
      <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column", overflow: "hidden", background: tok.felt }}>
        <div style={{ flex: "none", display: "flex", justifyContent: "center", padding: "12px 8px 0" }}>{stackedMain("N")}</div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 8 }}>
          {stackedSide("W")}
          <div style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", ...frameStyle }}>
            {inAuction && auctionDisplay === "box" ? auctionBox({ width: 330, height: "100%", headFont: 26, cellFont: 24, radius: 0, cellMinH: 56 }) : null}
            {inPlay ? trickPills : null}
            {complete ? resultCard : null}
          </div>
          {stackedSide("E")}
        </div>
        <div style={{ flex: "none", display: "flex", justifyContent: "center", padding: "0 8px 14px" }}>{stackedTouch("S")}</div>
      </div>
      {inAuction ? (columnsPad ? narrowBidColumns : bidBoxNarrow) : null}
      <EdgeToolbar side="bottom" items={actionItems(controlsExtraNarrow ?? controlsExtra)} scale={scale} minTouch={44} bg={tok.barBg} accent={tok.accent} />
    </div>
  );

  // ---- wide stage: top info bar, felt, bottom actions bar (no side rail) ----
  const wideStage = (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "#0b1512" }}>
      <EdgeToolbar side="top" items={infoItems} scale={scale} bg={tok.barBg} accent={tok.accent} />
      <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden", background: tok.felt }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 8, padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>{seatRow("N")}</div>

          <div style={{ flex: 1, minHeight: 207, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 0" }}>
            {seatColumn("W")}
            {/* Columns pad takes the CENTRE during the auction (box hidden); the
                gold frame, when on, surrounds whatever the centre holds, and
                CentreFit scales the content to the band it actually has. */}
            <div style={{ flex: 1, minWidth: 0, alignSelf: "stretch", display: "flex", ...frameStyle }}>
              <CentreFit>
                {inAuction && columnsPad
                  ? wideBidColumns
                  : inAuction && auctionDisplay === "box"
                    ? auctionBox()
                    : null}
                {inPlay ? trickCross() : null}
                {complete ? resultCard : null}
              </CentreFit>
            </div>
            {seatColumn("E")}
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            {/* Columns pad collapses the tray slot to zero — one pad on screen. */}
            <div style={{ height: inAuction && !columnsPad ? 113 : 0, flex: "none", display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
              {inAuction && !columnsPad ? bidBoxWide : null}
            </div>
            {seatRow("S")}
          </div>
        </div>
      </div>
      <EdgeToolbar side="bottom" items={actionItems(controlsExtra)} scale={scale} bg={tok.barBg} accent={tok.accent} />
    </div>
  );

  // ---- stage --------------------------------------------------------------
  if (phone) {
    return (
      <div ref={wrapRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#fff", display: "flex", justifyContent: "center", fontFamily: tok.font, WebkitFontSmoothing: "antialiased" }}>
        {mobileStack}
        {seatsPopup}
        {menuOpen && !onMenu && (
          <SettingsMenu accent={tok.accent} items={menuItems} onClose={() => setMenuOpen(false)} />
        )}
      </div>
    );
  }
  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: tok.stageBg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: tok.font, WebkitFontSmoothing: "antialiased" }}>
      <div style={{ position: "relative", flex: "none", transformOrigin: "center center", width: stageW, height: stageH, transform: `scale(${scale})` }}>
        {stacked ? stackedStage : wideStage}
        {seatsPopup}
        {menuOpen && !onMenu && (
          <SettingsMenu accent={tok.accent} items={menuItems} onClose={() => setMenuOpen(false)} />
        )}
      </div>
    </div>
  );
}
