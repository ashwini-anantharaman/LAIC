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
import { resolveSkin, type PlayMode, type SkinTokens, type TableAppearance } from "@bridge/table-config";
import { BidColumns } from "./BidColumns";
import { EdgeToolbar, type ToolbarItem } from "./EdgeToolbar";
import { SettingsMenu, type SettingsItem } from "./SettingsMenu";
import { SeatHand, type SeatHandMetrics } from "./SeatHand";
import { SeatPlate } from "./SeatPlate";
import { SeatDiagram } from "./SeatDiagram";
import { AuctionBox, auctionRowsBoxH, type AuctionBoxSizing } from "./AuctionBox";
import { TrickArea, clusterBox } from "./TrickArea";
import { ResultCard, type ResultCardAction } from "./ResultCard";
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
/**
 * Mobile hand-card metrics (Mobile Table.dc.html). Narrow, heavily overlapped
 * and BOLD: thirteen cards at a 48px pitch read as one held hand rather than a
 * strip spanning the whole stage, and the index is heavy enough to be read
 * through the stage scale. `overlap` only ever applies to the row layout.
 *
 * The two numbers the owner corrected on 2026-08-11:
 *  · `rank` was 44, sized for the twelve ONE-glyph ranks; "10" came out 49px
 *    wide against 54px of card between the borders and its second digit sat
 *    hard on the edge (the widest face on the felt is a red 10). At 38 a "10"
 *    is 42px and every rank has room to breathe.
 *  · `h` was 128 against a face — rank over pip — that ended 85px down, so a
 *    third of every card was blank space. At the smaller index the face ends
 *    at 75, and 96 ends the card shortly after the pip, in a still card-shaped
 *    1:1.71 box.
 */
const M_CARD: SeatHandMetrics & { backW: number } = {
  w: 56, h: 96, rank: 38, glyph: 36, inset: 5, overlap: 8, weight: 800, backW: 52,
};
/** Pitch of the mobile row: what one more card adds to the hand's width. */
const M_PITCH = M_CARD.w - (M_CARD.overlap ?? 1);
/**
 * The trick card is LARGER than a hand card — 1.3x on height (owner,
 * 2026-08-12), reversing the 2026-08-11 instruction that the two match. At hand
 * size the played cards receded: the trick is the one thing everybody at the
 * table is looking at, and it read as four more cards rather than as the trick.
 * The band has the room — the compass uses roughly 192 of about 565 units.
 *
 * THE RATIO CHANGES TOO, and that matters more than the scale. A hand card is
 * 56x96, a 1:1.71 box, and it is that tall-and-narrow ON PURPOSE: cards in the
 * hand overlap by 8, so all anyone ever sees of one is the index strip down its
 * left edge. A trick card is seen WHOLE, so it takes a real card's 1:1.4 —
 * scaling the hand's 1:1.71 instead produced a card so narrow that a two-glyph
 * "10" spanned nearly its full width and spilled out of the corner the layout
 * had promised to keep clear.
 *
 * The index is sized against the CARD, not against the hand's index, for the
 * same reason: the hand's rank fills its card because that is all you can see
 * of it, whereas on a whole card an index that deep looks like a printing
 * error. The face derives its own indexes from the box (TrickArea's FaceCard),
 * so the only metric handed over is the card itself.
 */
/** The beat before your hand arms — long enough that the played card is well
    clear of it, short enough that it never feels like lag. */
const ARM_DELAY_MS = 300;

const M_TRICK_H = Math.round(M_CARD.h * 1.3);
const M_TRICK_CARD = { w: Math.round(M_TRICK_H / 1.4), h: M_TRICK_H };
const M_TRICK_BOX = clusterBox(M_TRICK_CARD);
/** How many cards a hand is dealt — what the plate is sized against. */
const M_HAND_FULL = 13;

// ---------------------------------------------------------------------------
// Phone-tier band constants (Mobile Table.dc.html). The stack's content height
// is COMPUTED from these, never measured: a measured height would feed the
// scale, and the scale feeds the controls' rendered-size floors, which feed the
// height back. Constants break that loop, and they are what lets the table
// promise a SHARE of the screen rather than growing until it fills the phone.
// ---------------------------------------------------------------------------
const BAR_BASE = 52;
const TOUCH = 44;
/**
 * What the dummy's spread USED to cost: a horizontal band across the top of the
 * felt. It is a vertical RAIL beside the centre now (owner, 2026-08-11) — a
 * defender must see dummy, but not at the price of a band — so the spread buys
 * no height at all. The number stays because the budget still PRICES it: the
 * centre band keeps exactly the felt it had, and the 54 is subtracted from the
 * stack at the end, exactly as a hidden toolbar's thickness is. The freed height
 * therefore leaves the table (it goes to the coach panel below) instead of being
 * handed back to the felt as more green.
 */
const DUMMY_LINE = 54;
/**
 * The rail's width. Wide enough for a suit in bridge notation at the strip's old
 * rank type (♠ plus about six ranks before the line wraps) and for the seat name
 * to stay horizontal — at 136 of a 720 stage there is no need to rotate it —
 * and narrow enough that the trick compass keeps the middle of the felt.
 */
const DUMMY_RAIL_W = 136;
/** The hand band: the lift headroom the row is given (paddingTop), the card
    itself, the 3px gap and the seat plate — plus a few px of rounding reserve.
    Derived from M_CARD.h so shortening the card SHORTENS THE TABLE instead of
    leaving white space where the card used to end. */
const HAND_LIFT_PAD = 10;
const HAND_PLATE = 22;
const HAND_H = { row: HAND_LIFT_PAD + M_CARD.h + 3 + HAND_PLATE + 9, fan: 238 };
/**
 * The tray is TWO touch-floored rows plus its padding (BBO's phone bid box:
 * `Pass 1 2 3 4 5 6 7` over `♣ ♦ ♥ ♠ NT` + the doubles), so like the bars its
 * authored height is a function of the scale, not a constant. It used to be
 * THREE rows and ate 28% of the table; folding Pass up into the levels row is
 * the single biggest compactness win the phone tier had available.
 */
const TRAY_ROWS = 2;
const TRAY_ROW_MIN = 40;
/**
 * The tray's OWN touch floor, in rendered px, lower than the bars' 44. A bid
 * button is pressed from a hand already resting on the tray and it sits in a
 * fixed 8-cell grid the thumb learns, where a toolbar chip is hunted for once;
 * the reference tray runs 34-40px and is comfortable. 36 is the floor, and it
 * is a FLOOR — the rows only ever grow from here, never shrink past it, so no
 * bid button is ever smaller than 36 rendered px until TRAY_MAX_SHARE bites,
 * which cannot take it below TRAY_ROW_MIN authored (~32 rendered) either.
 */
const TRAY_TOUCH = 36;
/** Row gap + the tray's own padding: 6/8 top/bottom and one 5px gap. */
const TRAY_PAD = 19;
/** The tray's ceiling as a share of the table budget. Two rows at the touch
    floor land at ~14% of the reference phone (390x844), so this does not bind
    there — it only bites in a box shorter than the design's, which is exactly
    where the unyielding version took a third of the table and left the auction
    shorter than itself. */
const TRAY_MAX_SHARE = 0.22;
/** The auction grid, phone tier: four reserved call rows over the head, ALWAYS.
    The head's height is font metrics (26px over 1.1 line-height plus the grid's
    own padding), so it is a constant here and a measured fact in AuctionBox. */
const AUCTION_ROWS = 4;
const AUCTION_CELL = 52;
const AUCTION_HEAD = 37;
const AUCTION_BOX_H = AUCTION_HEAD + auctionRowsBoxH(AUCTION_ROWS, AUCTION_CELL);
/**
 * The centre is the flexible band: it absorbs the leftover so the table fills
 * exactly its share. Its FLOOR is what the band's content needs before it has
 * to start scrolling or scaling itself — the auction grid down to two rows, the
 * trick compass down to 0.7, the result card whole. It is deliberately far
 * below what the reference phone gives the band: the floor is the point where
 * vertical pressure stops being absorbed HERE and starts narrowing the whole
 * 720-wide stage, and the owner would rather the auction scroll than the table
 * lose width (2026-08-11).
 */
const CENTRE_MIN_AUCTION = AUCTION_HEAD + auctionRowsBoxH(2, AUCTION_CELL);
const CENTRE_MIN_PLAY = Math.round(M_TRICK_BOX.h * 0.7) + 16;
const CENTRE_MIN_RESULT = 200;
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
  Pick<
    TableAppearance,
    "handLayout" | "bidPad" | "centreFrame" | "fanSpread" | "fanRadius" | "suitGroups"
  >;

const DEFAULT_LOOK: ResolvedAppearance = {
  ...resolveSkin("bbo"),
  handLayout: "row",
  bidPad: "grid",
  centreFrame: false,
  fanSpread: 56,
  fanRadius: 0,
  // Off in the fallback look, which is the pre-skin table byte for byte; the
  // owner's default (on) arrives with a real appearance from the store.
  suitGroups: false,
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
  /**
   * How a tap on one of your own cards resolves (owner, 2026-08-12).
   *
   * `"off"` plays it. `"raise"` lifts it and wants a second tap on the SAME
   * card — the default, because a finger on a thirteen-card row is imprecise
   * and a mis-tap costs a trick. `"suit"` replaces the hand with the legal
   * cards of the suit tapped, drawn larger, and plays on the second tap.
   *
   * Omitted, the table plays on one tap: every existing caller — the demo, the
   * component tester, the embed — keeps the behaviour it was written against.
   */
  playMode?: PlayMode;
  /**
   * The finished trick has been gathered — draw the centre EMPTY.
   *
   * The engine keeps a completed trick as the last one until a card is played
   * into the next, which is right for the model and wrong for the felt: once
   * you have let the trick go, the cards should be off the table, the way they
   * are at a real one. This is display only, deliberately — the state the table
   * REASONS with is untouched, so following suit is still judged against the
   * trick that was actually led.
   */
  trickCleared?: boolean;
  /**
   * Who took the trick now on the felt — display only, and supplied by the
   * HOST rather than read off the state.
   *
   * `GameState` carries a `winner` on a completed trick, but the session store
   * does not persist it: a trick the robots finished arrives with the field
   * absent, so a table that trusted it lit the winner only when the human
   * happened to play the fourth card. Working it out here would mean a copy of
   * trick law in a presentational package, which is exactly the copy that
   * drifts — so the host, which already has the engine, works it out.
   */
  trickWinner?: Seat | null;
  boardLabel?: string | number;
  scoringLabel?: string;
  /** Central auction box, or the running bid history beside each seat. */
  auctionDisplay?: "box" | "seats";
  /** Stage each human call behind a Confirm / Cancel step (BidBox design). */
  confirmBids?: boolean;
  resultLine?: string;
  resultScore?: string;
  /**
   * Replaces the trick tally under the result line. A board that ended before
   * anyone played a card — a bidding-only challenge board, where the auction
   * IS the board — has no tricks to count, and "NS 0 · EW 0" would read as a
   * board played badly rather than a board never played.
   */
  resultDetail?: string;
  /**
   * The one action a FINISHED board offers, drawn on the result card in the
   * centre — a challenge's "Next board", say. It lives on the canvas rather
   * than in a band the host stacks around the table: every control belongs
   * inside the design, and at completion the card is where the eye already is.
   */
  completedAction?: ResultCardAction;
  /** Quiet line under that action, e.g. "3 boards left". */
  completedNote?: string;

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
  /**
   * Hide the top/bottom edge toolbars. A LOOK, not a lockdown — every control
   * they carry is still reachable elsewhere (the ☰ menu, the host's own chrome),
   * so this is for embedding the felt somewhere that supplies its own frame, and
   * for judging the table's proportions without them. The band budget stops
   * reserving their height too, so the felt actually grows into the space.
   */
  showToolbars?: boolean;
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
  playMode = "off",
  trickCleared = false,
  trickWinner = null,
  boardLabel = "1",
  scoringLabel = "IMPs",
  auctionDisplay = "box",
  confirmBids = false,
  completedAction,
  completedNote,
  resultLine = "",
  resultScore = "",
  resultDetail,
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
  showToolbars = true,
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
  /**
   * The card lifted and waiting for its second tap ("S14"), or the suit the
   * hand has been narrowed to. Both are the same idea — a tap that has been
   * READ but not yet acted on — so they share one slot and one escape.
   */
  const [held, setHeld] = useState<string | null>(null);
  const [openSuit, setOpenSuit] = useState<Suit | null>(null);
  /**
   * Your cards do not arm the instant the turn arrives — they wait a beat
   * (owner, 2026-08-13: "so that it looks planned and not on accident").
   *
   * The lift used to appear in the same frame the played card was still
   * travelling, so twelve cards twitched upward while one was mid-flight and it
   * read as a glitch. The delay is on the STATE, not the CSS: the lift shares
   * `transform` with the hand's FLIP slide, so a transition-delay would have
   * held the gap-closing slide back too. Gating playability also means no card
   * can be tapped while the previous one is still moving, which is a second
   * small mercy.
   */
  const [handArmed, setHandArmed] = useState(false);
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

  // The dummy is a SIDE RAIL of suit lines unless the human must play from it —
  // then it stays a full card row (compactness must not cost the declarer
  // controls). Either way the hand is on screen: a defender sees dummy.
  const playing = inPlay || complete;
  const decHuman = declarer ? !!seats[declarer].human : false;
  /**
   * The SECOND hand on screen beside the viewer's own.
   *
   * Normally that is dummy: a defender is entitled to see it, and a human
   * declarer has to play from it. But a viewer who took over the declarer's
   * chair — their partner won the contract and a robot would otherwise have
   * played both hands — IS the dummy, and their own cards are already at the
   * bottom of the phone. The hand with nowhere to go is then the declarer's,
   * and without this they would be asked to play from a hand they cannot see.
   */
  const sideSeat: Seat | null =
    !playing
      ? null
      : dummy === "S" && declarer && declarer !== "S" && decHuman
        ? declarer
        : dummy && dummy !== "S"
          ? dummy
          : null;
  const dummyIsRow = !!sideSeat && decHuman;
  const dummyIsStrip = !!sideSeat && !dummyIsRow;

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
  // The tray gets the bars' bargain: a touch floor that YIELDS. Its TRAY_ROWS
  // rows are floored at TRAY_TOUCH rendered px, but capped together at a share
  // of the budget — so they shrink as one (nothing moves mid-bid) instead of the
  // tray holding its physical size while the felt scales away beneath it.
  // Uncapped, a short box spent a third of the table on the tray and pinned the
  // auction it feeds to CENTRE_MIN, where the newest row was clipped.
  const trayRowFor = (k: number) => {
    const want = Math.max(TRAY_ROW_MIN, Math.ceil(TRAY_TOUCH / (k || 1)));
    const room = (TRAY_MAX_SHARE * availPx) / (k || 1) - TRAY_PAD;
    return Math.min(want, Math.max(TRAY_ROW_MIN, Math.floor(room / TRAY_ROWS)));
  };
  const trayFor = (k: number) => TRAY_ROWS * trayRowFor(k) + TRAY_PAD;
  /** What the centre band's content needs before it starts scrolling/scaling. */
  const centreMin = complete ? CENTRE_MIN_RESULT : inAuction ? CENTRE_MIN_AUCTION : CENTRE_MIN_PLAY;
  const fit = (k: number, usePad: boolean) => {
    const avail = availPx / (k || 1);
    const others =
      GAPS + slackFor(k) +
      (dummyIsStrip ? DUMMY_LINE : 0) +
      (dummyIsRow ? HAND_H.row : 0) +
      (!usePad && inAuction ? trayFor(k) : 0) +
      HAND_H[fanLayout ? "fan" : "row"];
    // The bars are reserved WHETHER OR NOT they are drawn: hiding them must make
    // the whole stack shorter (the freed height goes to the coach panel below),
    // not hand the felt two toolbars' worth of extra green — owner, 2026-08-11.
    // So they are priced into the budget here and subtracted from `content` at
    // the end; every other band is then identical with the bars on or off.
    //
    // Vertical pressure is absorbed by SQUEEZING the bars back towards their
    // base, in the order the touch floors are willing to yield: a toolbar chip
    // is hunted for once, so its target degrades before the felt narrows. Only
    // when even the squeezed stack cannot hold the centre's floor does `scale`
    // fall below widthScale — which is the one thing that narrows the table.
    const want = barFor(k);
    // (The columns pad prices its own floor below and is left alone here.)
    const deficit = usePad ? 0 : others + 2 * want + centreMin - avail;
    const bar = deficit > 0 ? Math.max(BAR_BASE, want - Math.ceil(deficit / 2)) : want;
    const base = others + 2 * bar;
    let cell = 0;
    let centre: number;
    if (usePad) {
      // While the pad is up it IS the interaction, so it takes the space and the
      // auction box keeps only a strip; the cell is sized from the leftover.
      cell = Math.max(30, Math.min(62, Math.floor((avail - base - PAD_CENTRE) / 8.3)));
      centre = Math.max(PAD_CENTRE, Math.round(avail - base - padHeight(cell)));
    } else {
      centre = Math.max(centreMin, Math.min(CENTRE_MAX, Math.round(avail - base)));
    }
    // The dummy strip gets the same treatment for the same reason: it is priced
    // above so the centre band is sized to exactly the felt it had, and then
    // taken back off here because the rail that replaced it stands BESIDE that
    // band and occupies no height. Netting it out of `others` instead would have
    // handed the felt a strip's worth of extra green and left the stack exactly
    // as tall as before — and the phone table compacts VERTICALLY.
    const content =
      base + (usePad ? padHeight(cell) : 0) + centre -
      (showToolbars ? 0 : 2 * bar) -
      (dummyIsStrip ? DUMMY_LINE : 0);
    return { bar, cell, centre, content, usePad, trayRow: trayRowFor(k), scale: Math.min(1, widthScale, availPx / content) };
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
  /** The COMPASS, CLAMPED to the band it is actually given. Prominence is a
   *  scale on the WHOLE box, so clamping keeps the four cards identical — it
   *  just makes the trick fit. The ceiling is now 1: the compass is already
   *  drawn at the HAND's card size, and magnifying it past that is exactly the
   *  "cards in the middle are bigger than the cards in my hand" the owner
   *  rejected. Below 1 the trick shrinks with the band rather than being cut. */
  const trickK = Math.max(0.7, Math.min(1, (feltH - 16) / M_TRICK_BOX.h));

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
    myTurn && inPlay && handArmed && state.turn === seat && playable.has(`${card.suit}${card.rank}`);

  const cardId = (c: Card) => `${c.suit}${c.rank}`;

  /**
   * Where each seat's last played card was sitting when it was tapped.
   *
   * Captured HERE, in the handler, because this is the last moment the card
   * still exists in the DOM: the play is optimistic, so by the time the trick
   * renders the card has already left the hand. The lookup is by the aria-label
   * the hand leaves on every card — a deal holds each card exactly once, so it
   * cannot match the wrong one.
   *
   * Only the human's own taps have an origin. A robot's hand is face down and
   * its cards have no position to fly from, so those seats stay null and fall
   * back to the seat-direction glide.
   */
  const origins = useRef<Partial<Record<Seat, { x: number; y: number } | null>>>({});
  const captureOrigin = (seat: Seat, card: Card) => {
    if (typeof document === "undefined") return;
    const el = document.querySelector(
      `button[aria-label="Play ${rankText(card.rank)}${GLYPH[card.suit]}"]`,
    );
    const r = el?.getBoundingClientRect();
    origins.current[seat] =
      r && r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  };

  /**
   * What a tap on a playable card DOES — the one place the play modes live, so
   * every leaf that shows a hand gets the same rule without knowing about it.
   *
   * `off` posts the card. `raise` posts only the card already lifted, and a tap
   * on any other lifts that one instead — so no first tap can ever play. `suit`
   * narrows the hand to the tapped card's suit first; once narrowed, everything
   * on screen is legal and a tap posts.
   */
  const tapCard = (seat: Seat, card: Card) => {
    const post = () => {
      captureOrigin(seat, card);
      onPlay?.(seat, card);
    };
    if (playMode === "off") return post();
    if (playMode === "suit" && openSuit == null) return setOpenSuit(card.suit);
    if (playMode === "suit") {
      setOpenSuit(null);
      return post();
    }
    if (held === cardId(card)) {
      setHeld(null);
      return post();
    }
    setHeld(cardId(card));
  };

  /** Is this the card lifted and waiting for its second tap? */
  const isHeld = (card: Card) => playMode === "raise" && held === cardId(card);

  // A tap that has been read but not acted on belongs to THIS turn. When the
  // turn moves — you played, or the board advanced under you — the lift and the
  // narrowed suit are stale, and leaving them up would arm a card you never
  // chose on the next trick.
  useEffect(() => {
    setHeld(null);
    setOpenSuit(null);
  }, [state.turn, state.phase]);

  // Re-armed on every turn change, so the beat lands once per card rather than
  // once per board.
  useEffect(() => {
    if (!(myTurn && inPlay)) {
      setHandArmed(false);
      return;
    }
    const t = setTimeout(() => setHandArmed(true), ARM_DELAY_MS);
    return () => clearTimeout(t);
  }, [myTurn, inPlay, state.turn, state.tricks.length]);

  /** Face-down cards — as many as the seat still HOLDS, not always 13. */
  const backs = (seat: Seat, m: { w: number; h: number } = { w: 14, h: 71 }) => (
    <SeatHand cards={state.hands[seat]} hidden metrics={CARD_ROW} layout="row" fanSpread={tok.fanSpread} fanRadius={tok.fanRadius} backColor={tok.cardBack} backMetrics={m} />
  );

  /** SeatPlate: identity strip, seat badge, name, DEALER mark, dummy tag. */
  const plate = (
    seat: Seat,
    width: number | string,
    m: { height?: number; badge?: number; font?: number; tagFont?: number; weight?: number } = {},
  ) => (
    <SeatPlate seat={seat} name={seats[seat].name} tag={seats[seat].tag} strip={seats[seat].strip} bg={plateBgFor(seat)} width={width} isDealer={seat === state.dealer} onTurn={state.turn === seat && (inPlay || inAuction)} metrics={m} />
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
      // The seams are a property of the LOOK, so they ride the metrics bag
      // rather than becoming a second prop every caller has to thread.
      metrics={{ ...m, suitGaps: tok.suitGroups }}
      layout="row"
      fanSpread={tok.fanSpread}
      fanRadius={tok.fanRadius}
      backColor={tok.cardBack}
      isPlayable={canPlay(seat)}
      isHeld={isHeld}
      // In `suit` mode the hand IS the narrowed suit while one is open — the
      // point of the mode is that the cards get bigger, which they cannot do
      // while twelve others are still on the row.
      only={openSuit && canPlay(seat) !== undefined ? openSuit : null}
      onPlay={(card) => tapCard(seat, card)}
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
      onPlay={(card) => tapCard(seat, card)}
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

  const currentPlays =
    inPlay && !trickCleared ? (state.tricks[state.tricks.length - 1]?.plays ?? []) : [];

  /** The trick as real card faces; `k` scales the whole box. Wide keeps the
      262px compass that spreads to the corners; the phone gets a tight
      interlocking one the size of the trick itself. */
  const trickCross = (k = 1) => <TrickArea plays={currentPlays} turn={state.turn} scale={k} />;
  const trickCluster = (k: number) => (
    <TrickArea
      variant="cluster"
      plays={currentPlays}
      turn={state.turn}
      scale={k}
      card={M_TRICK_CARD}
      originOf={(seat) => origins.current[seat] ?? null}
      winner={currentPlays.length === 4 ? trickWinner : null}
    />
  );

  const resultCard = (
    <ResultCard
      line={resultLine}
      score={resultScore}
      detail={resultDetail ?? `NS ${state.trickCount.NS} · EW ${state.trickCount.EW}`}
      action={completedAction}
      actionNote={completedNote}
      accent={tok.accent}
    />
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
  // stage is scaled, so 56 authored is ~30 under the thumb. On the phone the
  // row height is whatever the BUDGET reserved (trayRowFor) — the two must be
  // the same number or the tray overflows the band it was priced into.
  const touchH = phone
    ? phoneFit.trayRow
    : Math.max(52, Math.ceil(44 / Math.max(0.05, scale)));

  /**
   * TWO ROWS (BBO's phone bid box):
   *
   *     Pass │ 1 2 3 4 5 6 7
   *     ♣ ♦ ♥ ♠ │ NT │ X XX
   *
   * Pass folds up beside the levels — it was a full-width row of its own, and
   * the third row is what made the tray a third of the table. Both rows are
   * grids of the SAME fr total (8.75), so the two rows line up down the tray
   * even though one has eight cells and the other seven.
   *
   * Every slot is ALWAYS rendered, empty until it is legal or a level is armed:
   * rendering the strains only when armed grew the tray on the first tap and
   * shoved every control under it down. The buttons must not move mid-bid.
   */
  const TRAY_R1 = "1.75fr repeat(7,1fr)";
  // Doubles get their two cells only when a double is legal — and legality is
  // fixed for the whole of your turn, so this can never move a button MID-bid.
  // Reserving them unconditionally left a quarter of the strain row permanently
  // blank, which read as a row that had failed to render.
  const TRAY_R2 = anyLegalDouble ? "repeat(4,1fr) 1.75fr 1fr 1fr" : "repeat(4,1fr) 1.75fr";
  const trayCell = (extra: CSSProperties): CSSProperties => ({
    minWidth: 0, height: touchH, border: "1px solid #8a8a6a", borderRadius: skinRadius,
    fontWeight: 800, lineHeight: 1, padding: 0, ...extra,
  });

  const strainSlots = STRAINS.map((st) => {
    const live = !!armed && armedStrains.includes(st);
    if (!live) return <span key={st} style={{ minWidth: 0, height: touchH, pointerEvents: "none" }} />;
    return (
      <button
        key={st}
        type="button"
        onClick={() => stageCall(`${armed}${st}`)}
        aria-label={`${armed}${st === "N" ? "NT" : st}`}
        style={trayCell({ background: "#f8f8f8", color: isRed(st) ? RED : "#000", fontSize: st === "N" ? 28 : 38, cursor: "pointer" })}
      >
        {GLYPH[st]}
      </button>
    );
  });

  const doubleSlots = !anyLegalDouble ? null : (["X", "XX"] as const).map((d) => {
    const live = boxLive && legalSet.has(d);
    if (!live) return <span key={d} style={{ minWidth: 0, height: touchH }} />;
    return (
      <button
        key={d}
        type="button"
        onClick={() => stageCall(d)}
        aria-label={d === "X" ? "Double" : "Redouble"}
        style={trayCell({ border: `1px solid ${d === "X" ? "#8f0000" : "#0a2170"}`, background: d === "X" ? RED : "#1034a6", color: "#fff", fontSize: 28, cursor: "pointer" })}
      >
        {d}
      </button>
    );
  });

  const bidBoxNarrow = (
    <div data-testid="bid-tray" style={{ width: "100%", flex: "none", background: tok.trayBg, padding: "6px 8px 8px", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 5, boxShadow: "0 -2px 8px rgba(0,0,0,.45)", boxSizing: "border-box" }}>
      {pending ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: TRAY_ROWS * touchH + 5 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#3a3a20" }}>Confirm your call</span>
          {confirmButtons(touchH, 26)}
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: TRAY_R1, gap: 5 }}>
            <button
              type="button"
              onClick={boxLive ? () => stageCall("P") : undefined}
              aria-label="Pass"
              style={trayCell({ border: "1px solid #0c4b0b", background: boxLive ? "#116710" : "#a7b8a2", color: "#fff", fontSize: 28, cursor: boxLive ? "pointer" : "default", opacity: boxLive ? 1 : 0.42 })}
            >
              Pass
            </button>
            {[1, 2, 3, 4, 5, 6, 7].map((l) => {
              const any = STRAINS.some((st) => legalSet.has(`${l}${st}`));
              const live = boxLive && any;
              return (
                <button
                  key={l}
                  type="button"
                  onClick={live ? () => setArmed(armed === l ? null : l) : undefined}
                  aria-label={`Level ${l}`}
                  style={trayCell({ background: armed === l ? GOLD : "#f8f8f8", color: "#000", fontSize: 30, cursor: live ? "pointer" : "default", opacity: live ? 1 : 0.42 })}
                >
                  {l}
                </button>
              );
            })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: TRAY_R2, gap: 5 }}>
            {strainSlots}
            {doubleSlots}
          </div>
        </>
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

  /** Dummy's hand in bridge notation, one entry per suit HELD — the compact
      form when the human is NOT playing from dummy. The ranks stay a LIST and
      are joined by the layout: the rail wraps a long suit onto a second line,
      and a joined string would break "10" across it. */
  const dummySuitSpans = (seat: Seat) =>
    DISPLAY.map((suit) => {
      const ranks = state.hands[seat]
        .filter((cd) => cd.suit === suit)
        .sort((a, b) => b.rank - a.rank)
        .map((cd) => rankText(cd.rank));
      return ranks.length ? { suit, ranks } : null;
    }).filter((x): x is { suit: Suit; ranks: string[] } => x != null);

  /**
   * Which side of the felt the rail hangs on. East is the right-hand opponent
   * and West the left, so the rail sits where the seat itself does and the
   * player never has to ask whose hand it is.
   *
   * North is the awkward one: it is the seat OPPOSITE, belonging to neither
   * side, and it only ever reaches the rail when South is not the human (a
   * declaring South gets the full card row instead). It goes LEFT. The right
   * edge of a phone is the thumb's — Claim and ☰ sit at that end of the action
   * bar — so a rail that is read and never touched keeps out of its way, and
   * leaving the right to East alone keeps "the rail on my right is my RHO" true
   * every time it appears there.
   */
  const dummyRailSide: "left" | "right" = dummy === "E" ? "right" : "left";

  /**
   * The dummy rail: a vertical strip beside the centre band rather than a band
   * across the top of the felt (owner, 2026-08-11). The seat NAME is what
   * labels it — never the player's — and the cards below it are gated on
   * `visible[dummy]`, which the host only opens after the opening lead. Before
   * the lead the rail is a name and nothing else: dummy spreads on the lead, and
   * that is bridge law, not a layout preference.
   */
  const dummyRailEl =
    dummyIsStrip && sideSeat ? (
      <div data-testid="dummy-strip" style={{ flex: "none", width: DUMMY_RAIL_W, alignSelf: "stretch", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "8px 5px", background: "rgba(0,0,0,.16)", overflow: "hidden" }}>
        <span style={{ fontSize: 19, fontWeight: 700, color: "#dfe9e4", whiteSpace: "nowrap" }}>{SEAT_NAMES[sideSeat]}</span>
        {!visible[sideSeat] ? (
          /* BEFORE THE LEAD dummy is face down, and the rail used to be a name
             over an empty column. The cards exist — they are simply not spread
             yet, which is bridge law, not a layout state — so the rail shows
             the BACKS. Same stack, same pitch, so nothing jumps when they turn
             over on the lead. */
          (() => {
            const n = state.hands[sideSeat].length;
            const w = DUMMY_RAIL_W - 18;
            const h = Math.round(w * 0.42);
            const pitch = n > 1 ? Math.min(h + 3, Math.max(16, Math.round(340 / n))) : h;
            return (
              <div style={{ position: "relative", width: w, height: pitch * Math.max(0, n - 1) + h, flex: "none" }}>
                {Array.from({ length: n }, (_, i) => (
                  <span
                    key={i}
                    style={{
                      position: "absolute", left: 0, top: i * pitch, width: w, height: h,
                      boxSizing: "border-box", background: tok.cardBack,
                      border: "1px solid rgba(255,255,255,.55)", borderRadius: 4,
                      boxShadow: "0 2px 4px rgba(0,0,0,.4)", zIndex: i + 1,
                    }}
                  />
                ))}
              </div>
            );
          })()
        ) : (
          /* CARDS, not a list of ranks (owner, 2026-08-13). The rail used to
             print "♦ A" as text, which read as a scoreboard rather than a hand
             and left most of a tall strip empty; a leaning stack of real card
             shapes says "this is a hand" at a glance, and each card still shows
             its own rank and pip. Overlapped so thirteen fit the band's height
             — the pitch is derived from what is actually left, so a hand that
             has been played down spreads out instead of clumping. */
          (() => {
            const cards = [...state.hands[sideSeat]].sort(
              (a, b) => DISPLAY.indexOf(a.suit) - DISPLAY.indexOf(b.suit) || b.rank - a.rank,
            );
            const w = DUMMY_RAIL_W - 18;
            const h = Math.round(w * 0.42);
            // Fill the strip: the more cards are gone, the less they overlap.
            const pitch = cards.length > 1 ? Math.min(h + 3, Math.max(16, Math.round(340 / cards.length))) : h;
            return (
              <div style={{ position: "relative", width: w, height: pitch * (cards.length - 1) + h, flex: "none" }}>
                {cards.map((cd, i) => (
                  <span
                    key={`${cd.suit}${cd.rank}`}
                    style={{
                      position: "absolute", left: 0, top: i * pitch, width: w, height: h,
                      boxSizing: "border-box", background: "#fff",
                      border: "1px solid #6f6f6f", borderRadius: 4,
                      boxShadow: "0 2px 4px rgba(0,0,0,.4)",
                      display: "flex", alignItems: "center", gap: 4,
                      paddingLeft: 6, zIndex: i + 1,
                      color: isRed(cd.suit) ? RED : "#111",
                    }}
                  >
                    <span style={{ fontSize: Math.round(h * 0.62), fontWeight: 800, lineHeight: 1 }}>{rankText(cd.rank)}</span>
                    <span style={{ fontSize: Math.round(h * 0.54), fontWeight: 700, lineHeight: 1 }}>{GLYPH[cd.suit]}</span>
                  </span>
                ))}
              </div>
            );
          })()
        )}
      </div>
    ) : null;

  /**
   * A side opponent, as a small badge on the edge of the felt (owner,
   * 2026-08-13: the play band "looks completely empty" at the sides).
   *
   * On the phone an opponent's hand is not drawn at all, so West and East had
   * no presence whatsoever — the felt read as a table with two players at it.
   * The badge is deliberately more than decoration: it carries the seat, the
   * name, and how many cards that opponent still holds, which is a thing a
   * player actually tracks and otherwise has to count tricks to know.
   *
   * It brightens on that seat's turn, so the two of them also answer "who is
   * thinking?" — the same question the compass arrow answers, from the edge.
   */
  const sideAvatar = (seat: Seat) => {
    const onTurn = inPlay && state.turn === seat;
    return (
      <div
        key={seat}
        data-testid="side-avatar"
        data-seat={seat}
        style={{ flex: "none", width: 62, alignSelf: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, opacity: onTurn ? 1 : 0.62, transition: "opacity 240ms ease" }}
      >
        <span style={{ width: 42, height: 42, borderRadius: "50%", boxSizing: "border-box", background: onTurn ? SEAT_BADGE : "rgba(0,0,0,.28)", border: onTurn ? "2px solid #f0d78a" : "2px solid rgba(255,255,255,.28)", color: "#fff", fontSize: 21, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {seat}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#dfe9e4", whiteSpace: "nowrap" }}>{SEAT_NAMES[seat]}</span>
        <span style={{ fontSize: 12, color: "rgba(233,241,237,.75)", whiteSpace: "nowrap" }}>
          {state.hands[seat].length} left
        </span>
      </div>
    );
  };

  /** Dummy as a FULL card row (or fan) — kept only when the human is declarer
      and must play from dummy, so compactness never costs them the controls. */
  const dummyRowEl =
    dummyIsRow && sideSeat ? (
      // paddingTop reserves headroom for a playable card's translateY(-6px) lift
      // (well within the HAND_H.row budget), so the raised top is never clipped.
      <div style={{ flex: "none", display: "flex", justifyContent: "center", padding: "10px 0 0" }}>
        {visible[sideSeat]
          ? fanLayout
            ? fanHand(sideSeat, M_CARD)
            : cardRow(sideSeat, M_CARD)
          : backs(sideSeat, { w: M_CARD.backW, h: M_CARD.h })}
      </div>
    ) : null;

  /** Your hand's rendered width on the phone: an overlapping row of faces, or
      the butted strip of backs (SeatHand's 1.5px separators + its 2px frame). */
  /**
   * The plate's width, and it does NOT move (owner, 2026-08-13: "why does the
   * nameplate shrink with the cards. it should be the same size").
   *
   * It used to span the hand's ACTUAL width, which narrows by a pitch on every
   * card played — so the label under your hand crept inward all board and ended
   * as a stub. A floor was added first and was the wrong shape of fix: it only
   * moved where the shrinking stopped. The plate is sized against a FULL hand
   * instead, so it is the same object on trick one and trick thirteen.
   *
   * Computed with the hand's own geometry rather than a literal, so a change to
   * the card, the overlap or the seams keeps the two agreeing.
   */
  const phoneHandW = visible.S
    ? M_CARD.w + (M_HAND_FULL - 1) * M_PITCH + (tok.suitGroups ? 3 * (M_CARD.overlap ?? 0) : 0)
    : Math.round(M_CARD.backW * M_HAND_FULL + 1.5 * (M_HAND_FULL - 1)) + 4;

  // ---- mobile stack (Mobile Table.dc.html) ----------------------------------
  // The stage is a fixed 720-wide column at the fixed-point scale; its content
  // height is the sum of the band constants (never measured), and it bleeds its
  // scaled-away height back so the table packs to exactly its screen share.
  //
  // `flex: none` is load-bearing. The stage is a flex ITEM in the region below,
  // and a 720-wide item in a 366-wide box shrinks to its widest child unless it
  // is told not to. That child is your hand — so the whole table narrowed by a
  // card's pitch every time one was played, and by more again when the dummy
  // strip went short. The stage is a fixed 720 and the scale alone decides how
  // wide it renders: the board compacts VERTICALLY, never horizontally.
  const mobileStack = (
    <div
      data-testid="phone-stage"
      // THE ESCAPE. A tap anywhere that is not a card puts a lifted card down
      // and re-opens a narrowed hand (owner: "tap felt to cancel"). It sits on
      // the stage rather than on the felt so the whole board is the target,
      // and it fires on the way DOWN through the tree — a tap that lands on a
      // card stops at the card's own handler, which runs first.
      onClick={held != null || openSuit != null ? () => { setHeld(null); setOpenSuit(null); } : undefined}
      style={{ flex: "none", width: MOBILE_W, minHeight: stageH, height: stageH, transform: `scale(${scale})`, transformOrigin: "top center", marginBottom: stageBleed, display: "flex", flexDirection: "column", background: "#fff" }}
    >
      {/* Single-pricing: the host has already priced this bar against the touch
          floor (barFor), so EdgeToolbar takes thickness − 14 and is NOT handed
          the scale — dividing twice produced a control wider than its bar. */}
      {showToolbars && <EdgeToolbar side="top" items={infoItems} condensed thickness={phoneFit.bar} bg={tok.barBg} accent={tok.accent} />}
      {/* ONE felt wrapper behind the dummy row, centre (with its rail), pad and
          hand. The FLAT skin variant, per Mobile Table.dc.html. */}
      <div style={{ flex: "none", display: "flex", flexDirection: "column", background: tok.feltFlat }}>
        {dummyRowEl}
        {/* The centre is the ONE flexible band, sized to the leftover (feltH).
            NO vertical padding: feltH is the border-box height and is also what
            the auction box is handed, so vertical padding would push the box
            past feltH and overflow:hidden would eat the newest row.
            It is a ROW now: the dummy rail on its own side, then the felt. The
            rail is `flex: none` and the felt `flex: 1`, so the band's height is
            untouched by the hand hanging beside it and the compass simply
            centres in what is left. */}
        <div data-testid="centre-band" style={{ flex: "none", height: feltH, display: "flex", alignItems: "flex-start", overflow: "hidden", padding: "0 10px" }}>
          {dummyRailSide === "left" ? dummyRailEl : null}
          {/* The badge stands in for a seat the phone cannot draw a hand for, so
              it yields to the dummy rail on that side rather than crowding it,
              and never appears for the seat whose cards are already on screen. */}
          {inPlay && !(dummyRailSide === "left" && dummyRailEl) && sideSeat !== "W" ? sideAvatar("W") : null}
          <div style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: inAuction ? "flex-start" : "center", justifyContent: "center", ...(framed ? { border: "3px solid #c9992b", borderRadius: 10, boxSizing: "border-box" } : {}) }}>
            {/* FOUR reserved call rows, whatever the auction holds: the grid is
                one fixed object from "You deal" to the last pass, and the fifth
                row scrolls the first off the top. A grid that grew with the
                auction moved the felt under the reader on every call. maxH is
                the safety net for a band squeezed below even that. */}
            {inAuction && auctionDisplay === "box" ? auctionBox({ width: 430, height: "auto", maxH: feltH, headFont: 26, cellFont: 24, radius: 0, cellMinH: AUCTION_CELL, rowsVisible: AUCTION_ROWS }) : null}
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
            {inPlay ? trickCluster(trickK) : null}
            {complete ? resultCard : null}
          </div>
          {inPlay && !(dummyRailSide === "right" && dummyRailEl) && sideSeat !== "E" ? sideAvatar("E") : null}
          {dummyRailSide === "right" ? dummyRailEl : null}
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
            {/* The plate spans a FULL hand, not the hand as it stands — see
                phoneHandW. Bold name/tag: it reads through the stage scale. */}
            {plate("S", phoneHandW, { weight: 700 })}
          </div>
        </div>
      </div>
      {showToolbars && <EdgeToolbar side="bottom" items={actionItems(controlsExtraNarrow ?? controlsExtra)} condensed thickness={phoneFit.bar} bg={tok.barBg} accent={tok.accent} />}
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
      {showToolbars && <EdgeToolbar side="top" items={infoItems} scale={scale} minTouch={44} bg={tok.barBg} accent={tok.accent} />}
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
      {showToolbars && <EdgeToolbar side="bottom" items={actionItems(controlsExtraNarrow ?? controlsExtra)} scale={scale} minTouch={44} bg={tok.barBg} accent={tok.accent} />}
    </div>
  );

  // ---- wide stage: top info bar, felt, bottom actions bar (no side rail) ----
  const wideStage = (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "#0b1512" }}>
      {showToolbars && <EdgeToolbar side="top" items={infoItems} scale={scale} bg={tok.barBg} accent={tok.accent} />}
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
      {showToolbars && <EdgeToolbar side="bottom" items={actionItems(controlsExtra)} scale={scale} bg={tok.barBg} accent={tok.accent} />}
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
        {/* The table region is CONTENT-SIZED, capped at its share. Its share is
            what the budget prices the stack against, so ordinarily it lands on
            exactly tableSharePct — but a stack that comes out shorter (hidden
            toolbars) hands the difference DOWN to the coach panel instead of
            inflating the felt to fill a fixed 70% box. */}
        <div style={{ flex: "none", maxHeight: `${tableSharePct}%`, minHeight: 0, display: "flex", flexDirection: "column", background: "#fff" }}>
          {/* CSS-driven table region box; the stage scrolls inside it if the
              scaled content ever exceeds the region (align to the top). */}
          <div style={{ flex: 1, minHeight: 0, width: "100%", background: "#fff", display: "flex", justifyContent: "center", alignItems: "flex-start", overflowX: "hidden", overflowY: "auto" }}>
            {mobileStack}
          </div>
        </div>
        {coachSharePct > 0 && (
          <div style={{ flex: "1 1 auto", minHeight: `${coachSharePct}%`, display: "flex", background: "#fff", borderTop: "1px solid #d8ded9" }}>
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
