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
// BBO's phone view as one vertical stack (top bar, dummy row in play, felt with
// a top-left auction grid or the trick cross, the bid tray, your big-card
// hand), a fixed 720-wide stage scaled against the MEASURED stack height so the
// hand never falls below the fold. 2026-08-01: that stack now FILLS the phone —
// the felt takes the leftover height (the stack is width-limited, so there was
// always some), the trick and the auction grid grow into it, and a W·N·E strip
// carries the identity the wide layout keeps on its seat plates. The wide stage
// stops stretching at MAX_STRETCH so short, wide containers letterbox instead
// of flinging the seats to the edges.

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { AuctionCall, Card, Seat, Suit } from "@bridge/events";
import { CoachStrip, type CoachPanelData } from "./CoachStrip";
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

/** The wide stage is a fixed design scaled to fit; the phone layout is fluid. */
const BASE_WIDE = { w: 1040, h: 590 };
/** How far the wide stage may stretch past the design before extra container
 *  space becomes margin instead of empty felt. */
const MAX_STRETCH = 1.18;

/**
 * Phone metrics, in REAL pixels, derived from the container.
 *
 * The portrait layout is not a scaled-down desktop: a 720-wide design squeezed
 * into a 390-wide phone renders everything at 54%, which is how you get 30px
 * cards and 11px labels. So nothing here is scaled — the hand FANS instead,
 * overlapping so that 13 cards always span the screen exactly while each card
 * keeps a full-size corner index.
 */
function phoneMetrics(w: number, cards: number) {
  const pad = 6;
  const avail = Math.max(240, w - pad * 2);
  // Your hand: the biggest card that leaves room for a readable corner on each
  // of the others. `step` is the visible sliver; the last card shows in full.
  const cardW = Math.round(Math.min(60, Math.max(38, avail / 6.4)));
  const cardH = Math.round(cardW * 1.44);
  const n = Math.max(1, cards);
  const step = n > 1 ? Math.max(16, Math.min(cardW, (avail - cardW) / (n - 1))) : cardW;
  const rank = Math.round(Math.min(cardH * 0.3, step * 0.86));
  return {
    pad,
    avail,
    barH: Math.round(Math.min(58, Math.max(44, w * 0.13))),
    chip: 30,
    hand: { w: cardW, h: cardH, step, rank, glyph: Math.round(rank * 0.82) },
    // North's row is reference, not a control: two thirds the size.
    north: { w: Math.round(cardW * 0.7), h: Math.round(cardH * 0.6), rank: Math.round(rank * 0.72) },
    /** East and West sit in columns beside the trick, as on the wide table.
     *  Kept lean: what they take, the trick can't have. */
    colW: Math.max(62, Math.min(100, Math.round(avail * 0.23))),
    plateH: 24,
  };
}

/**
 * The trick on a phone, as big as the felt it landed in allows.
 *
 * It measures itself rather than being told: the felt is a flex row whose
 * height is whatever the bar, the dummy, the tray and the hand didn't take, and
 * that isn't known until layout. Measuring here can't feed back into the size
 * (the box is stretched by flex, not by its content), so there's no loop.
 */
function PhoneTrick({ render }: Readonly<{ render: (w: number, h: number) => ReactNode }>) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ alignSelf: "stretch", flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {box.w > 0 ? render(box.w, box.h) : null}
    </div>
  );
}

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
  settings?: readonly { label: string; value: string; href: string }[];
  /** Rail chip above Claim (the SideRail design's view toggle), e.g. "Hands". */
  viewHref?: { label: string; href: string };
  /**
   * call → what it means in the system this table plays, for THIS point in the
   * auction. Hovering a call in the bid box shows it (BBO shows the same thing
   * beside its box); on touch, where there is no hover, it shows for the call
   * you've staged with `confirmBids`. Omit and no panel appears.
   */
  bidMeanings?: Readonly<Record<string, { label: string; shows?: string }>>;
  /**
   * What each call ALREADY IN the auction meant when it was made, by index.
   * Tapping a cell in the bidding table explains it — BBO's behavior, and the
   * one that works on a phone, where there is no pointer to hover with.
   */
  auctionMeanings?: readonly ({ label: string; shows?: string } | undefined)[];
  /**
   * The coaching strip below the player's hand (CoachStrip). Presentational:
   * the host owns the notes, so the coaching runtime — and BEN's explanation of
   * the move it just made — plugs in here without touching this layout. Omit
   * and the table draws no strip at all.
   */
  coach?: CoachPanelData;
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
  bidMeanings,
  auctionMeanings,
  coach,
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
  // The call the pointer is over, for the meaning panel. Touch has no hover —
  // there, a TAPPED call in the bidding table (`picked`) is what gets explained.
  const [hover, setHover] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => {
    setArmed(null);
    setPending(null);
    setHover(null);
    setPicked(null);
  }, [state.auction.length]);

  // The ☰ settings overlay is instance state too. An explicit onMenu prop
  // wins (the design's "prop handler wins" rule); otherwise the table opens
  // its own menu — always on a phone, where the ☰ is the only way to reach
  // what the wide rail shows, and on the wide table when there are rows.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuItems: SettingsItem[] = [...(settings ?? [])];

  /**
   * Phone layout or wide table?
   *
   * PORTRAIT gets the phone layout — a vertical stack needs height for the bar,
   * a hand at each end and the felt between them, which a landscape box hasn't
   * got (measured: at 700x520 the stack has nowhere to put the hand while the
   * wide design still fits, so this is a ratio question, not a width one).
   *
   * The exception is a landscape box too narrow for the 1040-wide design: below
   * ~700 the wide table scales down past readability, and the fluid phone
   * layout — which sizes to whatever it's given — does better.
   *
   * The threshold used to be ratio < 1.25, which was wrong on a desktop: with
   * the platform's 256px sidebar a 1351x892 window leaves the table 1031x828,
   * i.e. 1.245, so the whole platform flipped to the phone layout (reported
   * 2026-08-01). Real desktop windows sit between 1.2 and 2.0; portrait devices
   * sit below 0.8. Splitting at 1.0 leaves both a wide margin.
   */
  const narrow = box.w / Math.max(1, box.h) < 1.0 || box.w < 700;

  const menuHandler =
    onMenu ?? (settings || narrow ? () => setMenuOpen((v) => !v) : undefined);

  // The wide stage is the fixed design, scaled to fit (down or up).
  const scale = narrow ? 1 : Math.min(box.w / BASE_WIDE.w, box.h / BASE_WIDE.h) || 1;
  // The stage may grow past the design to soak up an odd container ratio, but
  // only so far: unbounded growth spreads the seats to the far edges and
  // leaves a lake of empty felt in the middle (visible in embedded/short
  // windows). Past the cap the extra space becomes margin — the stage is
  // centred by its flex parent — which keeps the table compact and readable.
  const stageW = Math.min(Math.max(BASE_WIDE.w, box.w / scale), BASE_WIDE.w * MAX_STRETCH);
  const stageH = Math.min(Math.max(BASE_WIDE.h, box.h / scale), BASE_WIDE.h * MAX_STRETCH);

  // Phone sizes, in real pixels. Cheap, and every phone piece below reads them.
  const ph = phoneMetrics(box.w, state.hands.S.length);
  /** Overlap for THIS seat's fan: a hand of 5 spreads out, a hand of 13 tightens. */
  const fanStep = (seat: Seat, cardW: number) => {
    const n = Math.max(1, state.hands[seat].length);
    return n > 1 ? Math.max(12, Math.min(cardW, (ph.avail - cardW) / (n - 1))) : cardW;
  };

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

  // The staged-call gate: with confirm on, a human call parks in `pending`
  // until confirmed — robots (server seats) are never staged.
  const stageCall = (call: string) => {
    if (!boxLive) return;
    if (confirmBids) setPending(call);
    else onCall?.(call);
  };

  // ---- pieces -------------------------------------------------------------
  /** Face-down cards — as many as the seat still HOLDS, not always 13. */
  const backs = (seat: Seat, m: { w: number; h: number } = { w: 14, h: 71 }) => (
    <div style={{ display: "flex", border: "2px solid rgba(255,255,255,.92)", borderRadius: 3, overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,.35)" }}>
      {Array.from({ length: Math.max(1, state.hands[seat].length) }, (_, i) => (
        <span key={i} style={{ display: "block", width: m.w, height: m.h, background: CARD_BACK, borderLeft: i ? "1.5px solid rgba(255,255,255,.92)" : "none" }} />
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

  /**
   * A fanned hand for the phone: cards overlap by `step` so the whole hand
   * spans the screen at full card size. Each card's corner index sits in its
   * own visible sliver, which is why the fan reads at a glance and why the
   * cards can be big enough to tap without a scaled-down stage.
   */
  const fanRow = (
    seat: Seat,
    m: { w: number; h: number; step: number; rank: number; glyph: number },
  ) => {
    const hand = [...state.hands[seat]].sort(
      (a, b) => DISPLAY.indexOf(a.suit) - DISPLAY.indexOf(b.suit) || b.rank - a.rank,
    );
    // This rule alone decides what can be tapped — there is deliberately no
    // per-row "interactive" switch. One existed and was set false for the
    // dummy's row, which stopped every board where you are declarer.
    const live = (card: Card) =>
      myTurn && inPlay && state.turn === seat && playable.has(`${card.suit}${card.rank}`);
    return (
      <div style={{ display: "flex", filter: "drop-shadow(0 2px 4px rgba(0,0,0,.45))" }}>
        {hand.map((card, i) => {
          const on = live(card);
          return (
            <button
              key={`${card.suit}${card.rank}`}
              type="button"
              onClick={on ? () => onPlay?.(seat, card) : undefined}
              aria-label={`Play ${rankText(card.rank)}${GLYPH[card.suit]}`}
              style={{
                position: "relative", zIndex: i, flex: "none", display: "block",
                width: m.w, height: m.h, marginLeft: i ? m.step - m.w : 0, padding: 0,
                background: "#fff", border: "1px solid #6b6b6b", borderRadius: 4,
                cursor: on ? "pointer" : "default",
                transform: on ? "translateY(-8px)" : "none",
                transition: "transform 120ms ease",
              }}
            >
              <span style={{ position: "absolute", left: 2, top: 1, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.92, color: isRed(card.suit) ? RED : "#000" }}>
                <span style={{ fontSize: m.rank, fontWeight: 700 }}>{rankText(card.rank)}</span>
                <span style={{ fontSize: m.glyph }}>{GLYPH[card.suit]}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  /** The same fan, face down — a hidden hand still shows how many cards are left. */
  const fanBacks = (seat: Seat, m: { w: number; h: number; step: number }) => (
    <div style={{ display: "flex", filter: "drop-shadow(0 2px 4px rgba(0,0,0,.45))" }}>
      {Array.from({ length: Math.max(1, state.hands[seat].length) }, (_, i) => (
        <span
          key={i}
          style={{
            position: "relative", zIndex: i, flex: "none", display: "block",
            width: m.w, height: m.h, marginLeft: i ? m.step - m.w : 0,
            background: CARD_BACK, border: "1px solid rgba(255,255,255,.92)", borderRadius: 4,
          }}
        />
      ))}
    </div>
  );

  /** E/W wide: a compact suit-per-line panel. */
  const suitPanel = (seat: Seat) => (
    <div style={{ width: 197, background: "#fff", border: "1px solid #8a8a8a", borderRadius: 3, padding: "4px 8px", boxShadow: "0 2px 5px rgba(0,0,0,.35)", boxSizing: "border-box" }}>
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
      {callsRow(seat)}
      {visible[seat] ? suitPanel(seat) : backs(seat)}
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
  // Cells carry their auction index: tapping one has to know WHICH call it is,
  // and the grid is padded to the dealer's column so position alone won't say.
  type AuctionCell = { entry: AuctionCall; idx: number } | null;
  const auctionRows: AuctionCell[][] = [];
  {
    const padded: AuctionCell[] = [
      ...Array.from({ length: ORDER.indexOf(state.dealer) }, () => null),
      ...state.auction.map((entry, idx) => ({ entry, idx })),
    ];
    for (let i = 0; i < padded.length; i += 4) auctionRows.push(padded.slice(i, i + 4));
  }

  /** Vulnerable seats sit on red; the dealer's column is tinted throughout. */
  const auctionBox = (m: { width: number; height: number | "auto"; headFont: number; cellFont: number; radius?: number; cellMinH?: number; maxH?: number } = { width: 356, height: 207, headFont: 25, cellFont: 21, radius: 4 }) => (
    <div style={{ width: m.width, height: m.height, maxHeight: m.height === "auto" ? (m.maxH ?? 340) : undefined, background: PANEL, borderRadius: m.radius ?? 0, boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
              const cell = row[j];
              const e = cell?.entry;
              // Explainable calls are buttons — this is the tap target that
              // replaces hover on a phone. The rest stay inert spans.
              const explainable = cell && auctionMeanings?.[cell.idx];
              const on = cell !== null && cell !== undefined && picked === cell.idx;
              const style: CSSProperties = {
                borderRadius: 3, padding: "2px 0", minHeight: m.cellMinH ?? 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: m.cellFont, lineHeight: 1.15, fontFamily: "inherit",
                background: e ? (j === dealerCol ? DEALER_TINT : GREY) : "transparent",
                color: e ? callColor(e.call) : "#000",
                border: 0, boxShadow: on ? `0 0 0 2px ${GOLD}` : undefined,
              };
              if (!explainable || !cell || !e) {
                return <span key={j} style={style}>{e ? callText(e.call) : ""}</span>;
              }
              return (
                <button
                  key={j}
                  type="button"
                  onClick={() => setPicked((p) => (p === cell.idx ? null : cell.idx))}
                  title={`What ${callText(e.call)} meant`}
                  style={{ ...style, cursor: "pointer" }}
                >
                  {callText(e.call)}
                </button>
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

  // ---- bid box ------------------------------------------------------------
  /**
   * Hover/focus handlers that explain a call. Spread onto any button that IS a
   * call — a level on its own isn't one (1 could be 1♣ through 1NT), which is
   * why BBO also waits for the strain.
   */
  const explains = (call: string) =>
    bidMeanings?.[call]
      ? {
          onMouseEnter: () => setHover(call),
          onMouseLeave: () => setHover((c) => (c === call ? null : c)),
          onFocus: () => setHover(call),
          onBlur: () => setHover((c) => (c === call ? null : c)),
        }
      : {};

  /**
   * What the panel is explaining, in priority order: a call you TAPPED in the
   * bidding table, then one you've staged, then one you're hovering. Tap wins
   * because it's deliberate — and on a phone it's the only one of the three
   * that exists.
   */
  const pickedCall = picked !== null ? state.auction[picked] : undefined;
  const pickedMeaning = picked !== null ? auctionMeanings?.[picked] : undefined;
  const explained = pickedCall ? pickedCall.call : (pending ?? hover);
  const meaning = pickedCall ? pickedMeaning : explained ? bidMeanings?.[explained] : undefined;

  /**
   * Every explainable call at the armed level — the phone's answer to hover.
   *
   * A finger has no hover state, and tapping a strain bids it, so there is no
   * moment at which a phone could show one call's meaning the way a pointer
   * does. Arming a level IS that moment: you have said "level 4" and not yet
   * said which suit, so this is exactly when "what would 4♥ mean here" is the
   * question. Calls the knowledge base has no agreement for are left out
   * rather than listed as blanks.
   */
  const armedMeanings =
    armed && bidMeanings
      ? STRAINS.flatMap((st) => {
          const call = `${armed}${st}`;
          const m = legalSet.has(call) ? bidMeanings[call] : undefined;
          return m ? [{ call, ...m }] : [];
        })
      : [];

  /**
   * The explanation card — BBO's, in this table's colours.
   *
   * It reads as part of the felt furniture rather than a dev tooltip: the tan
   * of the bid tray for the body, the pale head of a bidding-box button for
   * the call itself, the auction box's border and shadow. (It was near-black,
   * which belonged to nothing else on the table.)
   *
   * Wide it stands beside the bidding grid as a column, the way BBO does it;
   * on a phone there's no room beside, so it lies under the grid as a row.
   */
  const CARD_BODY = "#cccc9b"; // the bid tray's tan
  const CARD_HEAD = "#f2f2ea";
  const CARD_LINE = "#7d7d7d";
  const CARD_INK = "#2b2b1e";

  const explainCard = (
    head: ReactNode,
    body: ReactNode,
    o: { compact: boolean; width?: number; testId: string; onClose?: () => void },
  ) => (
    <div
      data-testid={o.testId}
      style={{
        width: o.width, maxWidth: "100%", boxSizing: "border-box",
        display: "flex", flexDirection: o.compact ? "row" : "column",
        alignItems: o.compact ? "stretch" : undefined,
        background: CARD_BODY, border: `1px solid ${CARD_LINE}`, borderRadius: 4,
        boxShadow: "0 3px 8px rgba(0,0,0,.4)", overflow: "hidden", textAlign: "left",
      }}
    >
      <div
        style={{
          flex: "none", display: "flex", alignItems: "center", gap: 6,
          background: CARD_HEAD,
          borderRight: o.compact ? `1px solid ${CARD_LINE}` : undefined,
          borderBottom: o.compact ? undefined : `1px solid ${CARD_LINE}`,
          padding: o.compact ? "0 8px" : "1px 8px",
          fontSize: o.compact ? 18 : 24, fontWeight: 700, lineHeight: 1.25,
        }}
      >
        {head}
        {o.onClose && (
          <button
            type="button"
            onClick={o.onClose}
            aria-label="Close"
            style={{ marginLeft: "auto", flex: "none", width: 18, height: 18, background: "transparent", border: `1px solid ${CARD_LINE}`, borderRadius: 3, color: CARD_INK, fontSize: 11, lineHeight: 1, cursor: "pointer" }}
          >
            ✕
          </button>
        )}
      </div>
      <div
        style={{
          flex: 1, minWidth: 0, minHeight: 0, overflowY: "auto",
          padding: o.compact ? "4px 8px" : "6px 8px",
          fontSize: o.compact ? 12.5 : 14, lineHeight: 1.35, color: CARD_INK,
        }}
      >
        {body}
      </div>
    </div>
  );

  /** The armed level's calls: the panel for a bid you're ABOUT to make. */
  const candidatesPanel = (compact: boolean, width?: number) =>
    armedMeanings.length > 0
      ? explainCard(
          <span style={{ color: CARD_INK, fontSize: compact ? 14 : 17 }}>Level {armed}</span>,
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {armedMeanings.map((m) => (
              <div key={m.call}>
                <span style={{ fontWeight: 700, color: isRed(m.call[1] ?? "") ? RED : "#000" }}>
                  {callText(m.call)}
                </span>{" "}
                {m.label}
                {m.shows ? <span style={{ color: "#57573f" }}> — {m.shows}</span> : null}
              </div>
            ))}
          </div>,
          { compact, width, testId: "bid-candidates" },
        )
      : null;

  /** One call: what it is, what it shows. */
  const meaningPanel = (compact: boolean, width?: number) =>
    meaning && explained
      ? explainCard(
          <span style={{ color: isBid(explained) && isRed(explained[1] ?? "") ? RED : "#000" }}>
            {pickedCall ? (
              <span style={{ fontSize: compact ? 13 : 15, fontWeight: 400, color: "#57573f" }}>
                {pickedCall.seat}{" "}
              </span>
            ) : null}
            {callText(explained)}
          </span>,
          <>
            {meaning.label}
            {meaning.shows ? <span style={{ color: "#57573f" }}> — {meaning.shows}</span> : null}
          </>,
          { compact, width, testId: "bid-meaning", onClose: pickedCall ? () => setPicked(null) : undefined },
        )
      : null;

  const bidBtnStyle = (w: number, h: number, bg: string, border: string, live: boolean, font = 21): CSSProperties => ({
    flex: "none", width: w, height: h, border: `1px solid ${border}`, borderRadius: 5,
    background: bg, color: "#fff", fontSize: font, fontWeight: 700, lineHeight: 1,
    cursor: live ? "pointer" : "default", opacity: live ? 1 : 0.42,
  });

  const confirmButtons = (h: number, font: number, wYes = 240, wNo = 120) => (
    <>
      <button
        type="button"
        onClick={() => {
          const p = pending!;
          setPending(null);
          onCall?.(p);
        }}
        style={bidBtnStyle(wYes, h, "#116710", "#0c4b0b", true, font)}
      >
        Confirm {callText(pending ?? "")}
      </button>
      <button
        type="button"
        onClick={() => {
          setPending(null);
          setArmed(null);
        }}
        style={bidBtnStyle(wNo, h, "#8a3030", "#5e1c1c", true, font)}
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
          onClick={
            live
              ? () => {
                  setArmed(armed === l ? null : l);
                  // Arming is a new intent: stop explaining the call you
                  // tapped in the grid and explain what you could bid now.
                  setPicked(null);
                }
              : undefined
          }
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
            {...explains(`${armed}${st}`)}
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
          {...explains(d)}
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
      {...explains("P")}
      aria-label="Pass"
      style={bidBtnStyle(w, h, boxLive ? "#116710" : "#a7b8a2", "#0c4b0b", boxLive, font)}
    >
      Pass
    </button>
  );

  const bidBoxWide = (
    <div style={{ position: "relative", width: 581, height: 107, flex: "none", background: "#cccc9b", borderRadius: 4, padding: "9px 10px", boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", gap: 7, boxSizing: "border-box" }}>
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

  /** The phone tray: every row sized off the container so nothing clips. */
  const bidBoxNarrow = (() => {
    const gap = 4;
    const avail = ph.avail;
    const lvl = Math.floor((avail - gap * 6) / 7); // seven levels across
    const h = Math.max(38, Math.min(52, lvl + 4));
    const pass = Math.round(avail * 0.34);
    const dbl = Math.floor((avail - pass - gap * 2) / 2);
    const suit = Math.floor((avail - gap * 4) / 6); // NT takes a double slot
    return (
      <div style={{ flex: "none", background: "#cccc9b", padding: `6px ${ph.pad}px`, display: "flex", flexDirection: "column", alignItems: "center", gap, boxShadow: "0 -2px 8px rgba(0,0,0,.45)", boxSizing: "border-box" }}>
        {pending ? (
          <div style={{ display: "flex", alignItems: "center", gap, padding: "2px 0", flexWrap: "wrap", justifyContent: "center" }}>
            <span style={{ width: "100%", textAlign: "center", fontSize: 14, color: "#3a3a20" }}>Confirm your call</span>
            <div style={{ display: "flex", gap }}>
              {confirmButtons(h, 16, Math.round(avail * 0.6), Math.round(avail * 0.36))}
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap }}>
              {passButton(pass, h, 18)}
              {doubleButtons(dbl, h, 18)}
            </div>
            <div style={{ display: "flex", gap }}>{levelButtons(lvl, h, 20)}</div>
            {armed && <div style={{ display: "flex", gap }}>{strainButtons(h, 20, suit * 2 + gap, suit)}</div>}
          </>
        )}
      </div>
    );
  })();

  // ---- rail (wide) ----------------------------------------------------------
  const menuButton = (w: number, h: number, font: number, m: { border?: string; radius?: number } = {}) => (
    <button type="button" onClick={menuHandler} title="Table menu and settings" aria-label="Table menu" style={{ width: w, height: h, background: RAIL_BLUE, border: m.border ?? "2px solid #dfe4f4", borderRadius: m.radius ?? 7, color: "#fff", fontSize: font, lineHeight: 1, cursor: menuHandler ? "pointer" : "default" }}>☰</button>
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

  // ---- phone layout (fluid, 1:1 — nothing here is scaled) -------------------

  /** Compact black bar: scoring, board, contract, host controls, ☰. */
  const phoneTopBar = (
    <div style={{ flex: "none", height: ph.barH, display: "flex", alignItems: "center", gap: 5, padding: `0 ${ph.pad}px`, background: "#000", boxSizing: "border-box", overflow: "hidden" }}>
      {/* The chips YIELD: on a 320px phone the host's play controls and the ☰
          must survive intact, so this group shrinks (and clips its rightmost
          chip) rather than pushing the menu off the screen. */}
      <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
        {/* Dealer over board number; the number turns red when N/S are vul. Long
            board names (library boards carry their title here) ellipsise rather
            than spilling out of the chip. */}
        <div title={String(boardLabel)} style={{ flex: "none", width: 48, height: ph.barH - 10, background: "#fff", border: "1px solid #7d7d7d", borderRadius: 5, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", boxSizing: "border-box", overflow: "hidden" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#000", lineHeight: 1.1 }}>{state.dealer}</span>
          <span style={{ maxWidth: "100%", padding: "0 3px", fontSize: String(boardLabel).length > 4 ? 10 : 16, fontWeight: 700, background: vulFor("N") ? "#c62828" : "#fff", color: vulFor("N") ? "#fff" : "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{boardLabel}</span>
        </div>
        {c && (
          <div style={{ flex: "0 1 auto", minWidth: 0, height: ph.barH - 10, padding: "0 5px", background: GREY, borderRadius: 5, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1.1, overflow: "hidden" }}>
            <span style={{ whiteSpace: "nowrap", fontSize: 16, fontWeight: 700, color: isRed(c.strain) ? RED : "#000" }}>
              {c.level}{GLYPH[c.strain]}{c.doubled === 1 ? "X" : c.doubled === 2 ? "XX" : ""}
              <span style={{ fontSize: 11, fontWeight: 400, color: "#333" }}> {c.declarer}</span>
            </span>
            <span title="Tricks: NS · EW" style={{ whiteSpace: "nowrap", fontSize: 11, color: "#222" }}>
              {state.trickCount.NS} · {state.trickCount.EW}
            </span>
          </div>
        )}
      </div>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 5 }}>
        {controlsExtraNarrow ?? controlsExtra}
        {menuButton(40, ph.barH - 10, 20, { border: "0", radius: 5 })}
      </div>
    </div>
  );

  /**
   * The other three seats as one strip across the top of the felt, left to
   * right in table order (W · N · E). The wide layout carries identity on each
   * seat's own plate; portrait has no room for three plates, but "who is that
   * and is it their turn" is not optional information — the trick cross alone
   * only nudges a grey stub at the seat on lead.
   */
  const seatChip = (seat: Seat) => {
    const onTurn = !complete && seat === state.turn;
    // In the auction the useful number is what they just said; in play it's how
    // many cards they still hold (13 for everyone during the auction is noise).
    const last = [...state.auction].reverse().find((a) => a.seat === seat);
    const note = seat === dummy ? "dummy" : inAuction ? (last ? callText(last.call) : "") : String(state.hands[seat].length);
    return (
      <div
        key={seat}
        style={{
          flex: "1 1 0", minWidth: 0, height: ph.chip, display: "flex", alignItems: "stretch", gap: 4,
          padding: "0 4px 0 0", background: seat === dummy ? "#fff" : "#b3b3b3",
          border: `1px solid ${seat === state.dealer ? DEALER_RING : "transparent"}`,
          boxShadow: onTurn ? `0 0 0 2px ${GOLD}` : "0 1px 2px rgba(0,0,0,.4)",
          boxSizing: "border-box",
        }}
      >
        <span style={{ flex: "none", width: 4, background: seats[seat].strip ?? "transparent" }} />
        <span style={{ flex: "none", width: 20, height: 20, alignSelf: "center", background: SEAT_BADGE, color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{seat}</span>
        <span style={{ alignSelf: "center", fontSize: 13, color: "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{seats[seat].name}</span>
        <span style={{ marginLeft: "auto", alignSelf: "center", flex: "none", fontSize: 12, fontWeight: inAuction ? 700 : 400, color: "#555" }}>
          {note}
        </span>
      </div>
    );
  };

  const phoneSeatStrip = (
    <div style={{ flex: "none", display: "flex", gap: 4, padding: `4px ${ph.pad}px 0` }}>
      {(["W", "N", "E"] as Seat[]).map(seatChip)}
    </div>
  );

  /** A phone plate: the seat on turn gets a gold ring (white alone reads as dummy). */
  const phonePlate = (seat: Seat, width: number | string) => (
    <div style={{ width, boxShadow: !complete && seat === state.turn ? `0 0 0 2px ${GOLD}` : undefined }}>
      {plate(seat, "100%", { height: ph.plateH, badge: 18, font: 13, tagFont: 10 })}
    </div>
  );

  /**
   * North's hand fanned across the top. TAPPABLE, and it has to be: the engine
   * plays the dummy's cards through the declarer's controller, so when you are
   * declarer and dummy is on lead the table is waiting for you to play from
   * this row. Rendering it inert (as this did until 2026-08-01) stops the board
   * dead with no way to continue. `fanRow`'s own rule still decides what's
   * live — your turn, in play, this seat, a legal card — so nothing here is
   * playable when it isn't yours to play.
   */
  const phoneNorthRow = (
    <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: `3px ${ph.pad}px 0`, background: "#000" }}>
      {visible.N
        ? fanRow("N", { ...ph.north, step: fanStep("N", ph.north.w), glyph: Math.round(ph.north.rank * 0.82) })
        : fanBacks("N", { w: ph.north.w, h: ph.north.h, step: fanStep("N", ph.north.w) })}
      {phonePlate("N", Math.min(ph.avail, ph.north.w + Math.max(0, state.hands.N.length - 1) * fanStep("N", ph.north.w)))}
    </div>
  );

  /**
   * East and West beside the trick, as on the wide table — suit-per-line when
   * the hand is face-up, a counted card back when it isn't. Without these the
   * phone could only ever show two of the four hands, which is no use for
   * reviewing a board or teaching from one.
   */
  const phoneSideHand = (seat: Seat) => (
    <div style={{ width: ph.colW, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      {visible[seat] ? (
        <div style={{ width: "100%", background: "#fff", border: "1px solid #8a8a8a", borderRadius: 3, padding: "2px 4px", boxSizing: "border-box", boxShadow: "0 2px 4px rgba(0,0,0,.35)" }}>
          {DISPLAY.map((su) => {
            const cards = state.hands[seat].filter((x) => x.suit === su).sort((a, b) => b.rank - a.rank);
            return (
              <div key={su} style={{ display: "flex", alignItems: "baseline", gap: 3, lineHeight: 1.25, color: isRed(su) ? RED : "#000" }}>
                <span style={{ flex: "none", width: 11, fontSize: 12 }}>{GLYPH[su]}</span>
                <span style={{ display: "flex", flexWrap: "wrap", gap: "0 3px", fontSize: 12.5 }}>
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
                          style={{ background: on ? "#d9f2d9" : "transparent", border: 0, padding: 0, fontSize: 12.5, fontWeight: on ? 700 : 400, color: "inherit", cursor: on ? "pointer" : "default" }}
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
      ) : (
        <div style={{ width: "100%", height: 54, background: CARD_BACK, border: "2px solid rgba(255,255,255,.92)", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", color: "#fff", fontSize: 17, fontWeight: 700, boxShadow: "0 2px 4px rgba(0,0,0,.35)" }}>
          {state.hands[seat].length}
        </div>
      )}
      {phonePlate(seat, "100%")}
    </div>
  );

  /**
   * The trick on a phone: four slots in a tight diamond, sized to the felt.
   *
   * The wide layout's cross is a 262px grid with the cards at its extremes —
   * scaled onto a phone that reads as four small cards adrift in green. Here
   * the cards nearly touch, so the trick reads as one pile, and the empty seats
   * keep a dashed slot: it says where each player's card lands and (in gold)
   * who the table is waiting for.
   */
  const phoneTrickPile = (w: number, h: number) => {
    // Three cards across (W · N/S · E) and two down: the tightest diamond in
    // which no card can cover another's corner index. An earlier version
    // overlapped by half a card and hid the rank of whatever was underneath.
    const gap = 5;
    const cardW = Math.round(Math.max(30, Math.min((w - gap * 2) / 3, ((h - gap) / 2) / 1.42, 92)));
    const cardH = Math.round(cardW * 1.42);
    const boxW = cardW * 3 + gap * 2;
    const boxH = cardH * 2 + gap;
    const at: Record<Seat, { left: number; top: number }> = {
      N: { left: cardW + gap, top: 0 },
      S: { left: cardW + gap, top: cardH + gap },
      W: { left: 0, top: (boxH - cardH) / 2 },
      E: { left: (cardW + gap) * 2, top: (boxH - cardH) / 2 },
    };
    return (
      <div style={{ position: "relative", width: boxW, height: boxH }}>
        {(["N", "E", "S", "W"] as Seat[]).map((seat) => {
          const play = currentPlays.find((p) => p.seat === seat);
          const onTurn = seat === state.turn;
          return (
            <div key={seat} style={{ position: "absolute", left: at[seat].left, top: at[seat].top, width: cardW, height: cardH, zIndex: play ? 2 : 1 }}>
              {play ? (
                <div style={{ position: "relative", width: "100%", height: "100%", background: "#fff", border: "1px solid #6b6b6b", borderRadius: 4, boxShadow: "0 2px 6px rgba(0,0,0,.45)" }}>
                  <span style={{ position: "absolute", left: Math.round(cardW * 0.07), top: Math.round(cardH * 0.03), display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.9, color: isRed(play.card.suit) ? RED : "#000" }}>
                    <span style={{ fontSize: Math.round(cardW * 0.5), fontWeight: 700 }}>{rankText(play.card.rank)}</span>
                    <span style={{ fontSize: Math.round(cardW * 0.44) }}>{GLYPH[play.card.suit]}</span>
                  </span>
                </div>
              ) : (
                // Table markings, not wireframe: a faint slot per seat, gold
                // for the one the table is waiting on.
                <div style={{ width: "100%", height: "100%", borderRadius: 4, boxSizing: "border-box", border: onTurn ? `2px solid ${GOLD}` : "1px solid rgba(255,255,255,.14)", background: onTurn ? "rgba(254,205,7,.10)" : "rgba(255,255,255,.045)" }}>
                  <span style={{ display: "block", paddingTop: 2, textAlign: "center", fontSize: Math.round(cardW * 0.2), fontWeight: 700, color: onTurn ? GOLD : "rgba(255,255,255,.3)" }}>{seat}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  /**
   * Everything the wide rail offers, as menu rows. The phone bar keeps only
   * what you touch mid-trick (board, contract, play controls); the rest —
   * scoring mode, the hands view, Claim — lives behind the ☰, and the seat/AI
   * chooser rides in as the menu's `extra`.
   */
  const phoneMenuItems: SettingsItem[] = [
    ...(onScoring ? [{ label: "Scoring", value: scoringLabel, on: onScoring }] : []),
    ...menuItems,
    ...(viewHref ? [{ label: "View", value: viewHref.label, href: viewHref.href }] : []),
    ...(onClaim && inPlay ? [{ label: "Claim the rest", value: "Claim", on: onClaim }] : []),
  ];

  /** Your hand: the biggest thing on the screen, because it's the control. */
  const phoneHand = (
    <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: `2px ${ph.pad}px 4px`, background: FELT }}>
      {callsRow("S", 14)}
      {visible.S
        ? fanRow("S", { ...ph.hand, step: fanStep("S", ph.hand.w) })
        : fanBacks("S", { w: ph.hand.w, h: ph.hand.h, step: fanStep("S", ph.hand.w) })}
      {phonePlate("S", ph.avail)}
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
              {/* Grid and explanation side by side, BBO's arrangement. The
                  centre is ~409 wide, so the grid gives up its design 356 for
                  250 and the card takes 150 — the pair still reads as centred,
                  and the card's slot is always there so nothing shifts when an
                  explanation appears. */}
              {inAuction && auctionDisplay === "box" ? (
                <div style={{ display: "flex", alignItems: "stretch", gap: 8, height: 207 }}>
                  {auctionBox({ width: 250, height: 207, headFont: 22, cellFont: 19, radius: 4 })}
                  <div style={{ width: 150, flex: "none", display: "flex" }}>
                    {meaning ? meaningPanel(false, 150) : candidatesPanel(false, 150)}
                  </div>
                </div>
              ) : null}
              {inPlay ? trickCross() : null}
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
  // Phone: a flex column at real size. The felt is the only flexible row, so
  // the bar, the dummy, the tray and your hand always get the space they need
  // and whatever is left over is table — no scaling, no measuring, no scroll.
  if (narrow) {
    // Four hands only while cards are being played: during the auction the
    // width belongs to the auction grid (and the seat strip carries identity),
    // and on a finished board it belongs to the result.
    const sides = inPlay;
    return (
      <div ref={wrapRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#000", display: "flex", flexDirection: "column", fontFamily: "Arial, Helvetica, sans-serif", WebkitFontSmoothing: "antialiased" }}>
        {phoneTopBar}
        {inPlay ? phoneNorthRow : null}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", background: FELT }}>
          {/* Seats-mode auction already lists all four seats on the felt. */}
          {!complete && !sides && !(inAuction && auctionDisplay === "seats") ? phoneSeatStrip : null}
          <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, overflow: "hidden", padding: 4 }}>
            {sides ? phoneSideHand("W") : null}
            {/* The bidding table and its explanation, as one block: BBO puts
                the panel beside the grid, and a phone's version of beside is
                under. Everything explainable lands here — a call you tapped in
                the grid, and the calls you could make at the armed level. */}
            {inAuction && auctionDisplay === "box" ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 4, maxWidth: "100%" }}>
                {auctionBox({
                  width: Math.min(ph.avail, 420),
                  // Content-sized, and free to use the felt it has: a fixed
                  // height is either a half-empty slab at "1♠ pass" or a
                  // scrollbar by the fourth round.
                  height: "auto",
                  maxH: 9999,
                  headFont: 17,
                  cellFont: 16,
                  radius: 3,
                  cellMinH: 26,
                })}
                {meaning ? meaningPanel(true) : candidatesPanel(true)}
              </div>
            ) : null}
            {inAuction && auctionDisplay === "seats" ? (
              <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", justifyContent: "center", gap: 6, padding: 6 }}>
                {(["N", "E", "S", "W"] as Seat[]).map((s) => (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ flex: "none", width: 22, height: 22, background: SEAT_BADGE, color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{s}</span>
                    {callsRow(s, 14) ?? <span style={{ fontSize: 13, color: "rgba(255,255,255,.6)" }}>—</span>}
                  </div>
                ))}
              </div>
            ) : null}
            {/* The trick sizes itself to the felt it was given. */}
            {inPlay ? <PhoneTrick render={phoneTrickPile} /> : null}
            {complete ? resultCard : null}
            {sides ? phoneSideHand("E") : null}
          </div>
        </div>
        {inAuction ? bidBoxNarrow : null}
        {phoneHand}
        {/* Below the player, as specified — collapsed, so it costs one line of
            the screen until there's something worth opening. PHONE ONLY (owner
            decision 2026-08-01): the desktop platform's table doesn't carry a
            coaching strip; coaching is the app's surface. */}
        {coach ? <CoachStrip data={coach} compact /> : null}
        {menuOpen && !onMenu && (
          // The phone has no rail, so the ☰ carries everything the rail does:
          // the scoring toggle, the hands view, Claim, and — passed through as
          // `extra` — the seat/AI chooser.
          <SettingsMenu accent={RAIL_BLUE} items={phoneMenuItems} extra={railExtra} onClose={() => setMenuOpen(false)} />
        )}
      </div>
    );
  }
  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, Helvetica, sans-serif", WebkitFontSmoothing: "antialiased" }}>
      <div style={{ position: "relative", flex: "none", transformOrigin: "center center", width: stageW, height: stageH, transform: `scale(${scale})` }}>
        {wideStage}
        {menuOpen && !onMenu && (
          <SettingsMenu accent={RAIL_BLUE} items={menuItems} onClose={() => setMenuOpen(false)} />
        )}
      </div>
    </div>
  );
}
