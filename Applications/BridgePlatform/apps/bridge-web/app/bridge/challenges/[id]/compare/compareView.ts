// The comparison view model (docs/design/challenges/Play Comparison.dc.html,
// spec §6 "Comparison", ADDENDUM A5).
//
// TWO frozen lines of the SAME deal, read through ONE shared timeline. Every
// derivation the surface needs — where the lines split, what each line is doing
// at a scrubbed ply, which cards are still in the seat's hand, what the auction
// grid looks like — lives here as a pure function over plain data, so the
// renderers hold nothing but interaction state and the rules are unit-testable
// without a DOM.
//
// CLIENT-SAFE ON PURPOSE: types only from @bridge/events, no engine, no store,
// no node built-ins. The server (lineModel.ts) does the bridge law — contract,
// declarer, trick winners — once per line and hands the results down as data.
//
// THE PLY. One index over both lines: the auction plies first, then the cards.
// Because two lines may bid a different number of times, the shared auction
// band is as long as the LONGER auction; a line whose auction ended earlier
// simply has nothing to show at those plies. Play plies are card-for-card.

import type { Call, Card, Seat, Suit } from "@bridge/events";

// ── palette (canvas-verbatim) ───────────────────────────────────────────────

export const MINE_ACCENT = "#0d707c";
export const CMP_ACCENT = "#55636f";
export const DIV_ACCENT = "#e07a3a";
export const FELT = "#1d6b4f";
export const PAGE_BG = "#eaeeec";
export const INK = "#1b2a26";
export const INK_MUTED = "#6a766f";
export const INK_FAINT = "#8a958f";
export const HAIRLINE = "#d7ddd9";
export const LINE = "#dde3df";
export const WARN_BG = "#fdf3e8";
export const WARN_BORDER = "#f0d9bc";
export const WARN_INK = "#7a4a1c";
export const SUIT_RED = "#c0201f";
export const GOOD = "#1a7a4b";
export const BAD = "#b3402f";

/**
 * How a line's RESULT reads. Made is good news and down is bad, but a board
 * that ended with its auction is NEITHER: the contract reached is the whole
 * result, and this format has no negative tone at all (owner, 2026-08-10 — the
 * same rule the results view's `verdictTone` keeps).
 */
export type ResultTone = "good" | "bad" | "neutral";
export const TONE_INK: Record<ResultTone, string> = {
  good: GOOD,
  bad: BAD,
  neutral: INK_MUTED,
};

export const GLYPH: Record<string, string> = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" };
export const SEAT_NAME: Record<Seat, string> = {
  N: "North",
  E: "East",
  S: "South",
  W: "West",
};
/** Auction-grid column order, matching @bridge/table-ui tokens.ORDER. */
export const COLUMN_ORDER: readonly Seat[] = ["W", "N", "E", "S"];

export const isRedSuit = (s: string): boolean => s === "H" || s === "D";
export const rankText = (r: number): string =>
  (({ 11: "J", 12: "Q", 13: "K", 14: "A" }) as Record<number, string>)[r] ?? String(r);
export const callText = (c: Call): string =>
  /^[1-7][CDHSN]$/.test(c) ? `${c[0]}${GLYPH[c[1] as string]}` : c;
export const callColor = (c: Call): string =>
  /^[1-7][CDHSN]$/.test(c) && isRedSuit(c[1] ?? "") ? SUIT_RED : "#16231e";
export const cardText = (card: Card): string => `${rankText(card.rank)}${GLYPH[card.suit]}`;

// ── the lines ───────────────────────────────────────────────────────────────

/** Which of the four things a compared line can be. */
export type LineKind = "user" | "full_ben" | "your_contract" | "from_point";

/**
 * What a line's `result` reads when the AUCTION WAS THE BOARD. There is no
 * made/down to report and no score to print; the contract beside it is the end
 * state, and this says why nothing follows it.
 */
export const BIDDING_ONLY_RESULT = "Bidding only";

/** A frozen line, already stripped of bridge law by the server. */
export interface CompareLine {
  /** The `a`/`b` query key this line travels under. */
  key: string;
  kind: LineKind;
  /** Full label — "BEN in your contract", "Devan Rao", "You". */
  who: string;
  /** Short label for the phone toggle and the sync spine — "BEN", "You". */
  short: string;
  /** The panel badge — "YOUR LINE", "BEN", "PLAYER", "BEN · FROM HERE". */
  badge: string;
  /** The `◆ set the boards` mark (spec §3). */
  editor: boolean;
  /** True when this line is the viewer's own play. */
  isViewer: boolean;
  contract: string;
  contractRed: boolean;
  /** "by You" / "by North" — who declared. */
  byLine: string;
  declarer: Seat | null;
  /** "Down 1" / "Made 4" / "Passed out" / "Bidding only". */
  result: string;
  made: boolean;
  /** The ink `result` reads in — neutral where there is no made/down at all. */
  resultTone: ResultTone;
  /** The duplicate raw score from the human seat's side, signed. */
  rawText: string;
  auction: readonly { seat: Seat; call: Call }[];
  play: readonly { seat: Seat; card: Card }[];
  /** The human seat's thirteen cards as dealt. */
  seatCards: readonly Card[];
  /** Winner of each COMPLETED trick, in order. */
  trickWinners: readonly Seat[];
}

/** A line that is not renderable yet, and why — never an empty page. */
export interface PendingLine {
  key: string;
  kind: LineKind;
  who: string;
  short: string;
  badge: string;
  /**
   * `pending` — BEN is still playing it (keep asking).
   * `failed` — BEN could not (offer a retry).
   * `unfinished` — a human has not completed this board (nothing to compute).
   */
  status: "pending" | "failed" | "unfinished";
  note?: string;
}

export type LineSlot = { ready: true; line: CompareLine } | { ready: false; pending: PendingLine };

/** What a client asks the server to compute, and what it gets back. */
export interface EnsureLineRequest {
  challengeId: string;
  boardNo: number;
  kind: "full_ben" | "your_contract" | "from_point";
  /** `your_contract` / `from_point` — whose line. */
  userId?: string;
  /** `from_point` — an index into THAT user's own call-then-card timeline. */
  ply?: number;
}

export interface EnsureLineResult {
  status: "ready" | "pending" | "failed";
  line?: CompareLine;
  note?: string;
  /** True when the budget ran out mid-board: ask again to continue. */
  resumable?: boolean;
  /** Actions BEN settled in this round — the honest progress signal. */
  actions?: number;
}

// ── the shared timeline ─────────────────────────────────────────────────────

export interface CompareTimeline {
  /** Auction plies in the shared band — the LONGER of the two auctions. */
  aucLen: number;
  /** Card plies — the longer of the two plays. */
  playLen: number;
  /** Highest valid ply index (0-based). Never negative. */
  maxPly: number;
}

export function timelineOf(
  a: Pick<CompareLine, "auction" | "play">,
  b: Pick<CompareLine, "auction" | "play">,
): CompareTimeline {
  const aucLen = Math.max(a.auction.length, b.auction.length);
  const playLen = Math.max(a.play.length, b.play.length);
  return { aucLen, playLen, maxPly: Math.max(0, aucLen + playLen - 1) };
}

export const clampPly = (n: number, t: CompareTimeline): number =>
  Math.max(0, Math.min(t.maxPly, Math.round(n)));

/**
 * The first shared ply at which the two lines are not doing the same thing —
 * a different call, or a different card by a different seat. Null when they are
 * the same line all the way down (which happens: BEN's board can match a
 * player's card for card, and then the swing was the bidding).
 */
export function divergePly(
  a: Pick<CompareLine, "auction" | "play">,
  b: Pick<CompareLine, "auction" | "play">,
  t: CompareTimeline = timelineOf(a, b),
): number | null {
  for (let i = 0; i < t.aucLen; i++) {
    const x = a.auction[i];
    const y = b.auction[i];
    if (!x || !y) return i;
    if (x.call !== y.call || x.seat !== y.seat) return i;
  }
  for (let j = 0; j < t.playLen; j++) {
    const x = a.play[j];
    const y = b.play[j];
    if (!x || !y) return t.aucLen + j;
    if (x.seat !== y.seat || x.card.suit !== y.card.suit || x.card.rank !== y.card.rank)
      return t.aucLen + j;
  }
  return null;
}

/** EVERY ply the lines differ at — the amber ticks along the shared track. */
export function divergentPlies(
  a: Pick<CompareLine, "auction" | "play">,
  b: Pick<CompareLine, "auction" | "play">,
  t: CompareTimeline = timelineOf(a, b),
): number[] {
  const out: number[] = [];
  for (let i = 0; i < t.aucLen; i++) {
    const x = a.auction[i];
    const y = b.auction[i];
    if (!x || !y || x.call !== y.call || x.seat !== y.seat) out.push(i);
  }
  for (let j = 0; j < t.playLen; j++) {
    const x = a.play[j];
    const y = b.play[j];
    if (!x || !y || x.seat !== y.seat || x.card.suit !== y.card.suit || x.card.rank !== y.card.rank)
      out.push(t.aucLen + j);
  }
  return out;
}

/**
 * The ply of a line's OWN call-then-card timeline that the shared ply points
 * at — what `ensureFromPointBaseline` means by `ply`: how many of this line's
 * own actions are kept before BEN takes over.
 */
export function ownPly(
  line: Pick<CompareLine, "auction" | "play">,
  ply: number,
  t: CompareTimeline,
): number {
  const own = line.auction.length + line.play.length;
  if (ply < t.aucLen) return Math.min(ply, line.auction.length);
  return Math.min(line.auction.length + (ply - t.aucLen), own);
}

// ── one line at one ply ─────────────────────────────────────────────────────

export interface LineFrame {
  phase: "auction" | "play";
  /** Auction: how many of THIS line's calls are revealed. */
  reveal: number;
  /** Auction: the call landing at this ply (null once this auction has ended). */
  curSeat: Seat | null;
  curCall: Call | null;
  /** Play: 1-based trick number. */
  trickNo: number;
  /** Play: the cards face-up on the table right now. */
  trick: { seat: Seat; card: Card }[];
  /** Play: the card that landed at this ply (null past the end of this line). */
  just: { seat: Seat; card: Card } | null;
  /** Play: whoever plays next, for the empty-seat marker. */
  turn: Seat | null;
  tally: { ns: number; ew: number };
  /** The human seat's cards still in hand. */
  remaining: Card[];
  /** This line has no more actions at or past this ply. */
  ended: boolean;
}

const sameCard = (a: Card, b: Card): boolean => a.suit === b.suit && a.rank === b.rank;
const isNS = (seat: Seat): boolean => seat === "N" || seat === "S";

export function frameAt(
  line: CompareLine,
  ply: number,
  t: CompareTimeline,
  humanSeat: Seat,
): LineFrame {
  const remainingAfter = (playedTo: number): Card[] => {
    const gone = line.play
      .slice(0, playedTo)
      .filter((p) => p.seat === humanSeat)
      .map((p) => p.card);
    return line.seatCards.filter((c) => !gone.some((g) => sameCard(g, c)));
  };

  if (ply < t.aucLen) {
    const cur = line.auction[ply] ?? null;
    return {
      phase: "auction",
      reveal: Math.min(ply + 1, line.auction.length),
      curSeat: cur?.seat ?? null,
      curCall: cur?.call ?? null,
      trickNo: 0,
      trick: [],
      just: null,
      turn: null,
      tally: { ns: 0, ew: 0 },
      remaining: [...line.seatCards],
      ended: ply >= line.auction.length,
    };
  }

  const j = ply - t.aucLen;
  const ended = j >= line.play.length;
  // Past the end of a short line we hold its last position rather than blanking
  // the board — the reader is still scrubbing the OTHER line.
  const at = Math.min(j, line.play.length - 1);
  if (at < 0)
    return {
      phase: "play",
      reveal: line.auction.length,
      curSeat: null,
      curCall: null,
      trickNo: 0,
      trick: [],
      just: null,
      turn: null,
      tally: { ns: 0, ew: 0 },
      remaining: [...line.seatCards],
      ended: true,
    };

  const trickIndex = Math.floor(at / 4);
  const posInTrick = at % 4;
  const trick = line.play.slice(trickIndex * 4, trickIndex * 4 + posInTrick + 1).map((p) => ({
    seat: p.seat,
    card: p.card,
  }));
  // A trick counts once its fourth card is down, so the tally the reader sees
  // always matches the cards on the table.
  const resolved = posInTrick === 3 ? trickIndex + 1 : trickIndex;
  let ns = 0;
  for (let i = 0; i < Math.min(resolved, line.trickWinners.length); i++)
    if (isNS(line.trickWinners[i] as Seat)) ns++;
  const next = line.play[at + 1];

  return {
    phase: "play",
    reveal: line.auction.length,
    curSeat: null,
    curCall: null,
    trickNo: trickIndex + 1,
    trick,
    just: ended ? null : { seat: line.play[at]!.seat, card: line.play[at]!.card },
    turn: next?.seat ?? null,
    tally: { ns, ew: Math.max(0, resolved - ns) },
    remaining: remainingAfter(at + 1),
    ended,
  };
}

// ── the cross-line readout ──────────────────────────────────────────────────

export interface SyncCell {
  text: string;
  color: string;
}

export interface SyncReadout {
  /** `auction` while either line is still bidding, else card vs card. */
  mode: "auction" | "play";
  differ: boolean;
  /** Who acted (play mode) — "South played …". */
  seatName: string;
  mine: SyncCell;
  cmp: SyncCell;
}

/** What the two lines are doing AT this ply — derived, never asserted. */
export function syncAt(
  mine: CompareLine,
  cmp: CompareLine,
  ply: number,
  t: CompareTimeline,
  humanSeat: Seat,
): SyncReadout {
  const mf = frameAt(mine, ply, t, humanSeat);
  const cf = frameAt(cmp, ply, t, humanSeat);
  const dash: SyncCell = { text: "—", color: INK_FAINT };

  if (mf.phase === "auction" || cf.phase === "auction") {
    const m: SyncCell = mf.curCall
      ? { text: callText(mf.curCall), color: callColor(mf.curCall) }
      : dash;
    const c: SyncCell = cf.curCall
      ? { text: callText(cf.curCall), color: callColor(cf.curCall) }
      : dash;
    return {
      mode: "auction",
      differ: (mf.curCall ?? null) !== (cf.curCall ?? null),
      seatName: mf.curSeat ? SEAT_NAME[mf.curSeat] : "",
      mine: m,
      cmp: c,
    };
  }

  const m: SyncCell = mf.just
    ? { text: cardText(mf.just.card), color: isRedSuit(mf.just.card.suit) ? SUIT_RED : "#16231e" }
    : dash;
  const c: SyncCell = cf.just
    ? { text: cardText(cf.just.card), color: isRedSuit(cf.just.card.suit) ? SUIT_RED : "#16231e" }
    : dash;
  const differ =
    !mf.just ||
    !cf.just ||
    mf.just.seat !== cf.just.seat ||
    !sameCard(mf.just.card, cf.just.card);
  return {
    mode: "play",
    differ,
    seatName: mf.just ? SEAT_NAME[mf.just.seat] : cf.just ? SEAT_NAME[cf.just.seat] : "",
    mine: m,
    cmp: c,
  };
}

// ── labels ──────────────────────────────────────────────────────────────────

export interface PositionLabel {
  label: string;
  sub: string;
}

export function positionLabel(
  ply: number,
  t: CompareTimeline,
  mine: CompareLine,
): PositionLabel {
  if (ply < t.aucLen) {
    const call = mine.auction[ply];
    return {
      label: call
        ? `Auction · ${SEAT_NAME[call.seat]} ${callText(call.call)}`
        : "Auction · complete",
      sub: `Bidding · ply ${ply + 1} of ${t.aucLen}`,
    };
  }
  const j = ply - t.aucLen;
  return {
    label: `Trick ${Math.floor(j / 4) + 1}`,
    sub: `Card ${(j % 4) + 1} of 4 · play ply ${j + 1} of ${t.playLen}`,
  };
}

/** "Lines diverge in the auction" / "Lines diverged here · Trick 7". */
export function divergenceLabel(dvp: number | null, t: CompareTimeline): string {
  // No cards on either line — a bidding-only board, or two pass-outs. The
  // agreement to report is the AUCTION, because that is all there was.
  if (dvp === null)
    return t.playLen === 0 ? "Both lines bid the same auction" : "Both lines played the same cards";
  if (dvp < t.aucLen) return "Lines diverge in the auction";
  return `Lines diverged here · Trick ${Math.floor((dvp - t.aucLen) / 4) + 1}`;
}

/** Where a from-point fork was taken, for the "BEN is thinking…" copy. */
export function forkLabel(ply: number, t: CompareTimeline): string {
  return ply < t.aucLen ? "the auction" : `trick ${Math.floor((ply - t.aucLen) / 4) + 1}`;
}

// ── the auction grid ────────────────────────────────────────────────────────

export interface AuctionCell {
  /** Empty string for a pad cell or an unrevealed call. */
  text: string;
  color: string;
  /** A call this line actually made and the scrubber has reached. */
  filled: boolean;
  /** The ply the scrubber is sitting on. */
  current: boolean;
  /** The first ply the two auctions differ at. */
  divergent: boolean;
  dealerCol: boolean;
  /** The other line's call in this slot, when it differs (phone ghost). */
  ghost?: { text: string; color: string };
}

export interface AuctionGrid {
  heads: { seat: Seat; vul: boolean; dealer: boolean }[];
  rows: AuctionCell[][];
  dealerCol: number;
}

export function auctionGrid(input: {
  line: CompareLine;
  ghostLine?: CompareLine | null;
  dealer: Seat;
  vul: "none" | "ns" | "ew" | "both";
  /** Calls revealed so far — the frame's `reveal`. */
  reveal: number;
  /** Shared ply, so the ring lands on the scrubbed call. */
  ply: number;
  /** The auction ply the lines first differ at, or null. */
  divergeAt: number | null;
}): AuctionGrid {
  const { line, ghostLine, dealer, vul, reveal, ply, divergeAt } = input;
  const dealerCol = COLUMN_ORDER.indexOf(dealer);
  const heads = COLUMN_ORDER.map((seat) => ({
    seat,
    vul: vul === "both" || (vul === "ns" ? isNS(seat) : vul === "ew" ? !isNS(seat) : false),
    dealer: seat === dealer,
  }));

  const total = dealerCol + line.auction.length;
  const rows: AuctionCell[][] = [];
  for (let r = 0; r * 4 < Math.max(total, 4); r++) {
    const cells: AuctionCell[] = [];
    for (let c = 0; c < 4; c++) {
      const idx = r * 4 + c;
      const i = idx - dealerCol;
      const isDealerCol = c === dealerCol;
      const call = i >= 0 ? line.auction[i] : undefined;
      if (!call || i >= reveal) {
        cells.push({
          text: "",
          color: "#16231e",
          filled: false,
          current: false,
          divergent: false,
          dealerCol: isDealerCol,
        });
        continue;
      }
      const ghostCall = ghostLine?.auction[i];
      const ghostDiffers = !!ghostCall && ghostCall.call !== call.call;
      cells.push({
        text: callText(call.call),
        color: callColor(call.call),
        filled: true,
        current: i === ply,
        divergent: divergeAt !== null && i === divergeAt,
        dealerCol: isDealerCol,
        ghost: ghostDiffers
          ? { text: callText(ghostCall.call), color: callColor(ghostCall.call) }
          : undefined,
      });
    }
    rows.push(cells);
  }
  return { heads, rows, dealerCol };
}

// ── the hand strip ──────────────────────────────────────────────────────────

export interface HandRow {
  suit: Suit;
  glyph: string;
  color: string;
  text: string;
}

/** The four suit rows the canvas reads as a hand ("♠ AKQ4"). */
export function handRows(cards: readonly Card[]): HandRow[] {
  return (["S", "H", "C", "D"] as Suit[]).map((suit) => {
    const ranks = cards
      .filter((c) => c.suit === suit)
      .sort((a, b) => b.rank - a.rank)
      .map((c) => rankText(c.rank))
      .join("");
    return {
      suit,
      glyph: GLYPH[suit] as string,
      color: isRedSuit(suit) ? SUIT_RED : "#16231e",
      text: ranks || "—",
    };
  });
}

// ── the source picker ───────────────────────────────────────────────────────

/** The query key a BEN line travels under, so a comparison is a shareable URL. */
export const BEN_KEY = "BEN";
export const YOUR_CONTRACT_KEY = "BEN.contract";

export interface SourceOption {
  key: string;
  kind: LineKind;
  /** "BEN's board" / "BEN in your contract" / "Devan Rao". */
  name: string;
  /** "4♥ by you · Down 1", or why it is not available. */
  sub: string;
  initials: string;
  editor: boolean;
  /** The line's result figure, when there is one. */
  res: string;
  resMade: boolean;
  active: boolean;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return (parts[0] as string).slice(0, 2).toUpperCase();
  return `${(parts[0] as string)[0]}${(parts[parts.length - 1] as string)[0]}`.toUpperCase();
}
