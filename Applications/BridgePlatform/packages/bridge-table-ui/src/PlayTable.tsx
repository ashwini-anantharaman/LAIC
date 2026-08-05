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
//
// 2026-08-04: the seat/centre pieces are REAL props-driven components now —
// SeatHand, SeatPlate, SeatDiagram, AuctionBox, TrickArea, ResultCard,
// SeatsPopup — each byte-identical to the closure it replaced. PlayTable still
// SHAPES the data (which cards show, whose turn, the calls row) and composes
// the leaves; the leaves stay dumb. callsRow stays here: it reads the running
// auction per seat and only ever appears interleaved with the composition, so
// it never became a standalone leaf.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { AuctionCall, Card, Seat, Suit } from "@bridge/events";
import { resolveSkin, type SkinTokens, type TableAppearance } from "@bridge/table-config";
import { BidColumns } from "./BidColumns";
import { EdgeToolbar, type ToolbarItem } from "./EdgeToolbar";
import { SettingsMenu, type SettingsItem } from "./SettingsMenu";
import { SeatHand, type SeatHandMetrics } from "./SeatHand";
import { SeatPlate } from "./SeatPlate";
import { SeatDiagram } from "./SeatDiagram";
import { AuctionBox, type AuctionBoxSizing } from "./AuctionBox";
import { TrickArea } from "./TrickArea";
import { ResultCard } from "./ResultCard";
import { SeatsPopup } from "./SeatsPopup";
import { CoachPanel, type CoachLine, type CoachAction } from "./CoachPanel";
import {
  RED, GOLD, GREY, SEAT_BADGE, GLYPH, STRAINS, ORDER, PARTNER, DISPLAY,
  isRed, callText, callColor, sideOf, rankText,
} from "./tokens";

// ---------------------------------------------------------------------------
// PlayTable-specific stage metrics. The leaf palette + text helpers live in
// ./tokens, shared byte-for-byte with every extracted component.
// ---------------------------------------------------------------------------
/** Wide stage; the mobile stack is 720 wide with a COMPUTED height. */
const BASE_WIDE = { w: 1040, h: 678 };
const MOBILE_W = 720;
/** Mobile hand-card metrics (Mobile Table.dc.html). */
const M_CARD = { w: 54, h: 128, rank: 42, glyph: 38, inset: 5, backW: 52 };

// ---------------------------------------------------------------------------
// Phone-tier band constants (Mobile Table.dc.html). The stack's content height
// is COMPUTED from these, never measured: a measured height would feed the
// scale, and the scale feeds the controls' rendered-size floors, which feed the
// height back. Constants break that loop, and they are what lets the table
// promise a SHARE of the screen rather than growing until it fills the phone.
// ---------------------------------------------------------------------------
const BAR_BASE = 52;
const TOUCH = 44;
const DUMMY_LINE = 54;
const HAND_H = { row: 172, fan: 238 };
/** The tray is three touch-floored rows plus its padding, so like the bars its
    authored height is a function of the scale, not a constant. */
const trayHeight = (k: number) => 3 * Math.max(52, Math.ceil(TOUCH / (k || 1))) + 30;
/** The centre is the flexible band: it absorbs the leftover so the table fills
    exactly its share. The floor is what a four-row auction needs INSIDE the
    inset — below it the grid scrolls internally rather than being cut. */
const CENTRE_MIN = 250;
const CENTRE_MAX = 900;
const PAD_CENTRE = 150;
/** Sub-pixel rounding across four bands lands a few px either way; the centre
    absorbs it, so this reserve guarantees the budget never UNDER-reserves (an
    over-reserve is invisible, an under-reserve clips the action bar off the
    bottom). It is a RENDERED quantity, so it divides back through the scale. */
const slackFor = (k: number) => Math.ceil(24 / (k || 1));
const GAPS = 0;
/** One knob drives the whole pad, so its height is a ratio of the cell. */
const padHeight = (cell: number) => Math.round(cell * 8.8);
/** Below this a 35-target pad stops being hittable and the level-then-strain
    tray is the better control even for someone who chose the pad. Measured
    against the RENDERED size, like every touch floor. */
const PAD_USABLE = 24;
/** SeatHand default row metrics — the pre-extraction cardRow defaults. */
const CARD_ROW: SeatHandMetrics = { w: 50, h: 71, rank: 25, glyph: 22, inset: 3 };

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
  fanSpread: 56,
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

  // ── phone-tier coach panel (Mobile Table.dc.html / CoachPanel.dc.html) ──────
  /** Reserve a coach panel below the table region on the phone tier. Default on. */
  showCoach?: boolean;
  /** The coach panel's share of the phone screen, 0–55%. Default 30. */
  coachShare?: number;
  /** Header title for the coach panel. Default "Coach". */
  coachTitle?: string;
  /** Lines the coach panel renders; empty/absent → its honest empty state. */
  coachLines?: readonly CoachLine[];
  /** Action buttons in the coach panel's footer. */
  coachActions?: readonly CoachAction[];
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
  showCoach = true,
  coachShare = 30,
  coachTitle = "Coach",
  coachLines,
  coachActions,
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

  // ── phone-tier band budget (Mobile Table.dc.html) ──────────────────────────
  // The coach panel takes its share of the phone screen; the table region gets
  // the rest, and the whole stack is priced against THAT height. A HIDDEN coach
  // still reserves its share: redistributing it lets the flexible felt band
  // balloon (a towering auction box), and the owner wants the table to keep its
  // proportions with plain white space where the panel will return.
  const coachOn = showCoach !== false;
  const coachSharePct = Math.max(0, Math.min(55, coachShare ?? 30));
  const tableSharePct = 100 - coachSharePct;

  // The dummy is a ONE-LINE suit strip unless the human must play from it — then
  // it stays a full card row (compactness must not cost the declarer controls).
  const playing = inPlay || complete;
  const decHuman = declarer ? !!seats[declarer].human : false;
  const dummyIsRow = playing && !!dummy && dummy !== "S" && decHuman;
  const dummyIsStrip = playing && !!dummy && dummy !== "S" && !dummyIsRow;

  // Only the BOX is measured (box, above); the content height is COMPUTED from
  // the band constants and iterated to a FIXED POINT. The bar/tray heights are
  // functions of the scale they help determine, so a single pass priced at the
  // width scale under-reserves whenever height binds and the toolbar falls off
  // the bottom. Each pass prices the bars at the previous pass's scale; the
  // scale only ever decreases, so this converges — the step cap terminates it.
  const padOn = columnsPad && inAuction;
  const widthScale = Math.min(1, box.w / MOBILE_W);
  const availPx = Math.max(240, box.h * (tableSharePct / 100) || 590);
  const barFor = (k: number) => {
    // The touch floor YIELDS rather than eating the layout: capped at 13% of the
    // budget, targets stay large where there is room and degrade where there is
    // honestly none, instead of two bars growing taller than the table itself.
    const want = Math.max(BAR_BASE, Math.ceil(TOUCH / (k || 1)) + 14);
    return Math.min(want, Math.max(BAR_BASE, Math.round((0.13 * availPx) / (k || 1))));
  };
  const fit = (k: number, usePad: boolean) => {
    const bar = barFor(k);
    const avail = availPx / (k || 1);
    const base =
      bar * 2 + GAPS + slackFor(k) +
      (dummyIsStrip ? DUMMY_LINE : 0) +
      (dummyIsRow ? HAND_H.row : 0) +
      (!usePad && inAuction ? trayHeight(k) : 0) +
      HAND_H[fanLayout ? "fan" : "row"];
    let cell = 0;
    let centre: number;
    if (usePad) {
      // While the pad is up it IS the interaction, so it takes the space and the
      // auction box keeps only a strip; the cell is sized from the leftover.
      cell = Math.max(30, Math.min(62, Math.floor((avail - base - PAD_CENTRE) / 8.3)));
      centre = Math.max(PAD_CENTRE, Math.round(avail - base - padHeight(cell)));
    } else {
      centre = Math.max(CENTRE_MIN, Math.min(CENTRE_MAX, Math.round(avail - base)));
    }
    const content = base + (usePad ? padHeight(cell) : 0) + centre;
    return { bar, cell, centre, content, usePad, scale: Math.min(1, widthScale, availPx / content) };
  };
  const converge = (usePad: boolean) => {
    let r = fit(widthScale, usePad);
    for (let i = 0; i < 10 && r.scale < widthScale - 0.0005; i++) {
      const next = fit(r.scale, usePad);
      if (Math.abs(next.scale - r.scale) < 0.0005) {
        r = next;
        break;
      }
      r = next;
    }
    return r;
  };
  let phoneFit = converge(padOn);
  // A pad squeezed past the point of being hittable is worse than the tray, so
  // the budget gets the final say over the preference.
  if (phoneFit.usePad && phoneFit.cell * phoneFit.scale < PAD_USABLE) phoneFit = converge(false);
  const phonePadShown = phoneFit.usePad;
  const phonePadCell = phoneFit.usePad ? phoneFit.cell : 38;
  const feltH = phoneFit.centre;

  // Wide/stacked: scale to FIT, down or up. Phone: a fixed 720-wide column at
  // the computed fixed-point scale (never up — thumb reach, not magnification).
  const genericScale = Math.min(box.w / BASE.w, box.h / BASE.h) || 1;
  const scale = phone ? phoneFit.scale : genericScale;
  const stageW = phone ? MOBILE_W : Math.max(BASE.w, box.w / genericScale);
  const stageH = phone ? phoneFit.content : Math.max(BASE.h, box.h / genericScale);
  // Rounding across four bands lands a few px either way; the stage bleeds its
  // scaled-away height back so the region packs to exactly its share.
  const stageBleed = phone ? -Math.round(phoneFit.content * (1 - phoneFit.scale)) : 0;

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
  // Each piece is a thin wrapper that SHAPES data (which cards, whose turn,
  // playability) and hands it to an extracted, byte-identical leaf. The call
  // sites in the three tiers below never changed.

  /** Per-card playability the play leaves share (the old inline `on`/`live`). */
  const canPlay = (seat: Seat) => (card: Card) =>
    myTurn && inPlay && state.turn === seat && playable.has(`${card.suit}${card.rank}`);

  /** Face-down cards — as many as the seat still HOLDS, not always 13. */
  const backs = (seat: Seat, m: { w: number; h: number } = { w: 14, h: 71 }) => (
    <SeatHand cards={state.hands[seat]} hidden metrics={CARD_ROW} layout="row" fanSpread={tok.fanSpread} fanRadius={tok.fanRadius} backColor={tok.cardBack} backMetrics={m} />
  );

  /** SeatPlate: identity strip, seat badge, name, DEALER mark, dummy tag. */
  const plate = (
    seat: Seat,
    width: number | string,
    m: { height?: number; badge?: number; font?: number; tagFont?: number } = {},
  ) => (
    <SeatPlate seat={seat} name={seats[seat].name} tag={seats[seat].tag} strip={seats[seat].strip} bg={plateBgFor(seat)} width={width} isDealer={seat === state.dealer} metrics={m} />
  );

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
  const cardRow = (seat: Seat, m: SeatHandMetrics = CARD_ROW) => (
    <SeatHand
      cards={state.hands[seat]}
      metrics={m}
      layout="row"
      fanSpread={tok.fanSpread}
      fanRadius={tok.fanRadius}
      backColor={tok.cardBack}
      isPlayable={canPlay(seat)}
      onPlay={(card) => onPlay?.(seat, card)}
    />
  );

  /** Suit-per-line panel (E/W wide; every seat in the stacked-narrow tier). */
  const suitPanel = (
    seat: Seat,
    m: { width: number | string; suitW?: number; font?: number; pad?: string; bare?: boolean; touch?: boolean } = { width: 197 },
  ) => (
    <SeatDiagram
      cards={state.hands[seat]}
      panelBg={panelBgFor(seat)}
      width={m.width}
      suitW={m.suitW}
      font={m.font}
      pad={m.pad}
      bare={m.bare}
      touch={!!m.touch && myTurn && inPlay && state.turn === seat}
      isPlayable={canPlay(seat)}
      onPlay={(card) => onPlay?.(seat, card)}
    />
  );

  /**
   * A face-up hand fanned about ONE pivot `radius` px below the top-centre
   * (SeatHand fan geometry). The reserved box is the union of every rotated
   * card's corners, so the fan never clips; the SAME spread refills as cards
   * are played, closing the fan up like a held hand. Dresses wide-tier N/S
   * and, at M_CARD metrics, the phone dummy row and your hand.
   */
  const fanHand = (seat: Seat, m?: SeatHandMetrics) => {
    const metrics: SeatHandMetrics = m ?? {
      w: tok.cardW,
      h: Math.round(tok.cardW * 1.42),
      rank: Math.round(tok.cardW * 0.46),
      glyph: Math.round(tok.cardW * 0.4),
      inset: 4,
    };
    return (
      <SeatHand
        cards={state.hands[seat]}
        metrics={metrics}
        layout="fan"
        fanSpread={tok.fanSpread}
        fanRadius={tok.fanRadius}
        backColor={tok.cardBack}
        isPlayable={canPlay(seat)}
        onPlay={(card) => onPlay?.(seat, card)}
      />
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

  const seatColumn = (seat: Seat) => (
    <div style={{ width: 197, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      {callsRow(seat)}
      {visible[seat] ? suitPanel(seat, { width: 197 }) : backs(seat)}
      {plate(seat, 197)}
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
  const auctionBox = (m: AuctionBoxSizing = { width: 356, height: 207, headFont: 25, cellFont: 21, radius: 4 }) => (
    <AuctionBox
      bg={tok.auctionBg}
      m={m}
      heads={ORDER.map((s) => ({ seat: s, vul: vulFor(s), isDealer: s === state.dealer }))}
      rows={auctionRows}
      dealerCol={dealerCol}
      emptyText={state.auction.length === 0 ? (state.dealer === mySeat ? "You deal" : `${state.dealer} deals`) : null}
    />
  );

  const currentPlays = inPlay ? (state.tricks[state.tricks.length - 1]?.plays ?? []) : [];

  /** The trick as real card faces; `k` scales the whole cross (1.6 on phones). */
  const trickCross = (k = 1) => <TrickArea plays={currentPlays} turn={state.turn} scale={k} />;

  const resultCard = (
    <ResultCard line={resultLine} score={resultScore} detail={`NS ${state.trickCount.NS} · EW ${state.trickCount.EW}`} />
  );

  /** Stacked-narrow centre: the TrickArea design's pill variant. */
  const trickPills = <TrickArea variant="pill" plays={currentPlays} turn={state.turn} />;

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
  // The contract slots are ALWAYS present, "—" until there is one — adding
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
      <SeatsPopup onClose={() => setSeatsOpen(false)}>{railExtra}</SeatsPopup>
    ) : null;

  /** Dummy as a ONE-LINE suit strip (♠AK9 ♥J7652 …) via the handText format —
      the compact form when the human is NOT playing from dummy. */
  const dummySuitSpans = (seat: Seat) =>
    DISPLAY.map((suit) => {
      const ranks = state.hands[seat]
        .filter((cd) => cd.suit === suit)
        .sort((a, b) => b.rank - a.rank)
        .map((cd) => rankText(cd.rank))
        .join("");
      return ranks ? { suit, ranks } : null;
    }).filter((x): x is { suit: Suit; ranks: string } => x != null);

  const dummyStripEl =
    dummyIsStrip && dummy ? (
      <div data-testid="dummy-strip" style={{ flex: "none", height: DUMMY_LINE, display: "flex", alignItems: "center", gap: 14, padding: "0 12px", background: "rgba(0,0,0,.16)", overflow: "hidden" }}>
        <span style={{ fontSize: 19, fontWeight: 700, color: "#dfe9e4", whiteSpace: "nowrap" }}>{SEAT_NAMES[dummy]}</span>
        {visible[dummy]
          ? dummySuitSpans(dummy).map((s) => (
              <span key={s.suit} style={{ fontSize: 26, fontWeight: 700, color: "#f2f6f4", whiteSpace: "nowrap" }}>
                <span style={{ color: isRed(s.suit) ? RED : "#111" }}>{GLYPH[s.suit]}</span>
                {s.ranks}
              </span>
            ))
          : null}
      </div>
    ) : null;

  /** Dummy as a FULL card row (or fan) — kept only when the human is declarer
      and must play from dummy, so compactness never costs them the controls. */
  const dummyRowEl =
    dummyIsRow && dummy ? (
      // paddingTop reserves headroom for a playable card's translateY(-6px) lift
      // (well within the HAND_H.row budget), so the raised top is never clipped.
      <div style={{ flex: "none", display: "flex", justifyContent: "center", padding: "10px 0 0" }}>
        {visible[dummy]
          ? fanLayout
            ? fanHand(dummy, M_CARD)
            : cardRow(dummy, M_CARD)
          : backs(dummy, { w: M_CARD.backW, h: M_CARD.h })}
      </div>
    ) : null;

  // ---- mobile stack (Mobile Table.dc.html) ----------------------------------
  // The stage is a fixed 720-wide column at the fixed-point scale; its content
  // height is the sum of the band constants (never measured), and it bleeds its
  // scaled-away height back so the table packs to exactly its screen share.
  const mobileStack = (
    <div style={{ width: MOBILE_W, minHeight: stageH, height: stageH, transform: `scale(${scale})`, transformOrigin: "top center", marginBottom: stageBleed, display: "flex", flexDirection: "column", background: "#fff" }}>
      {/* Single-pricing: the host has already priced this bar against the touch
          floor (barFor), so EdgeToolbar takes thickness − 14 and is NOT handed
          the scale — dividing twice produced a control wider than its bar. */}
      <EdgeToolbar side="top" items={infoItems} condensed thickness={phoneFit.bar} bg={tok.barBg} accent={tok.accent} />
      {/* ONE felt wrapper behind dummy line/row, centre, pad and hand. The FLAT
          skin variant, per Mobile Table.dc.html. */}
      <div style={{ flex: "none", display: "flex", flexDirection: "column", background: tok.feltFlat }}>
        {dummyStripEl}
        {dummyRowEl}
        {/* The centre is the ONE flexible band, sized to the leftover (feltH).
            NO vertical padding: feltH is the border-box height and is also what
            the auction box is handed, so vertical padding would push the box
            past feltH and overflow:hidden would eat the newest row. */}
        <div style={{ flex: "none", height: feltH, display: "flex", alignItems: "flex-start", overflow: "hidden", padding: "0 10px" }}>
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: inAuction ? "flex-start" : "center", justifyContent: "center", ...(framed ? { border: "3px solid #c9992b", borderRadius: 10, boxSizing: "border-box" } : {}) }}>
            {inAuction && auctionDisplay === "box" ? auctionBox({ width: 430, height: "100%", headFont: 26, cellFont: 24, radius: 0, cellMinH: 56 }) : null}
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
        </div>
        {/* Column pad (cell sized from the leftover) OR the level tray — one on
            screen at a time. The pad falls back to the tray when the fit could
            not keep its cells hittable (phonePadShown). */}
        {inAuction ? (
          phonePadShown ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "6px 0" }}>
              <BidColumns cell={phonePadCell} {...bidColumnsProps} />
            </div>
          ) : (
            bidBoxNarrow
          )
        ) : null}
        {/* paddingTop gives the South hand the headroom the HAND_H.row budget
            already reserves, so a playable card's translateY(-6px) lift stays
            fully visible. The 13-card row keeps its natural width (13×54−12 =
            690 in the 720 stage) — flex:none cards, centred, never stretched. */}
        <div style={{ flex: "none", display: "flex", justifyContent: "center", padding: "10px 0 0" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            {callsRow("S")}
            {visible.S
              ? fanLayout
                ? fanHand("S", M_CARD)
                : cardRow("S", M_CARD)
              : backs("S", { w: M_CARD.backW, h: M_CARD.h })}
            {/* Default plate metrics — the design keeps SeatPlate stock here,
                and the plate narrows with the hand in fan mode too. */}
            {plate("S", visible.S ? M_CARD.w + Math.max(0, state.hands.S.length - 1) * (M_CARD.w - 1) : 390)}
          </div>
        </div>
      </div>
      <EdgeToolbar side="bottom" items={actionItems(controlsExtraNarrow ?? controlsExtra)} condensed thickness={phoneFit.bar} bg={tok.barBg} accent={tok.accent} />
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
    // The phone splits into two regions (Mobile Table.dc.html): the table takes
    // tableShare of the screen, the coach panel the rest. wrapRef measures the
    // whole box; the table budget is that box's height × tableShare — a pure
    // function of a prop, so no second observer can feed the scale back.
    return (
      <div ref={wrapRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column", fontFamily: tok.font, WebkitFontSmoothing: "antialiased" }}>
        <div style={{ flex: tableSharePct, minHeight: 0, display: "flex", flexDirection: "column", background: "#fff" }}>
          {/* CSS-driven table region box; the stage scrolls inside it if the
              scaled content ever exceeds the region (align to the top). */}
          <div style={{ flex: 1, minHeight: 0, width: "100%", background: "#fff", display: "flex", justifyContent: "center", alignItems: "flex-start", overflowX: "hidden", overflowY: "auto" }}>
            {mobileStack}
          </div>
        </div>
        {coachSharePct > 0 && (
          <div style={{ flex: coachSharePct, minHeight: 0, display: "flex", background: "#fff", borderTop: "1px solid #d8ded9" }}>
            {/* Hidden coach keeps its reserved band as plain white space. */}
            {coachOn && (
              <CoachPanel title={coachTitle} accent={tok.accent} lines={coachLines} actions={coachActions} />
            )}
          </div>
        )}
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
