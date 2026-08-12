// PlayTable — bridge-table-ui/src/PlayTable.tsx ported 1:1 to RN, PHONE TIER
// (owner direction 2026-08-12: the web table pasted and rewired — the app is
// always the embedded phone tier, so the wide and stacked stages never mount
// here; every constant, band and colour below is the web file's own).
//
// The stack: [top bar unless hideTopBar] → ONE felt wrapper (dummy row,
// centre band with the dummy RAIL beside it, the bid tray or columns pad,
// your hand + plate) → [bottom bar] — a fixed 720-wide stage at the
// fixed-point scale, bleeding its scaled-away height back so the coach band
// below starts exactly under the plate.
//
// Translation notes (the fixed dictionary only):
//   · `transform-origin: top center` → translateY(-(1−k)·H/2) before scale
//     (RN's transformOrigin is unreliable on react-native-web);
//   · CSS grid tray rows → flex with the same fr ratios and 5px gaps;
//   · the stage wrapper clips (overflow hidden) — the web page's own
//     overflow-hidden shell did this; without it the unscaled 720 box
//     scrolls the app sideways.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import {
  sideOf,
  type Card,
  type GameState,
  type Seat,
} from "../../lib/vendor/table-kernel/table-kernel";
import { AuctionBox, auctionRowsBoxH } from "./auction-box";
import { BidColumns } from "./bid-columns";
import { EdgeToolbar, type ToolbarItem } from "./edge-toolbar";
import { ResultCard, type ResultCardAction } from "./result-card";
import { SeatHand, type SeatHandMetrics } from "./seat-hand";
import { SeatPlate } from "./seat-plate";
import { SeatsPopup } from "./seats-popup";
import { SettingsMenu, type SettingsItem } from "./settings-menu";
import {
  DISPLAY,
  GLYPH,
  GOLD,
  GREY,
  ORDER,
  PARTNER,
  RED,
  STRAINS,
  callColor,
  callText,
  flatColor,
  isRed,
  rankText,
} from "./table-tokens";
import { TrickArea, clusterBox } from "./trick-area";

/** Mobile stage width; content height is COMPUTED from the band constants. */
const MOBILE_W = 720;
/** Mobile hand-card metrics (Mobile Table.dc.html): narrow, overlapped, bold. */
const M_CARD: SeatHandMetrics & { backW: number } = {
  w: 56, h: 96, rank: 38, glyph: 36, inset: 5, overlap: 8, backW: 52,
};
/** Pitch of the mobile row: what one more card adds to the hand's width. */
const M_PITCH = M_CARD.w - (M_CARD.overlap ?? 1);
/** The trick's cards ARE the hand's cards — same box, same index type. */
const M_TRICK_CARD = { w: M_CARD.w, h: M_CARD.h };
const M_TRICK_INDEX = { rank: M_CARD.rank, glyph: M_CARD.glyph };
const M_TRICK_BOX = clusterBox(M_TRICK_CARD);
/** The phone plate's floor — a badge, a name and a tag at the phone's type. */
const M_PLATE_MIN = 260;

// Phone-tier band constants (Mobile Table.dc.html), verbatim.
const BAR_BASE = 52;
const TOUCH = 44;
const DUMMY_LINE = 54;
const DUMMY_RAIL_W = 136;
const HAND_LIFT_PAD = 10;
const HAND_PLATE = 22;
const HAND_H = { row: HAND_LIFT_PAD + M_CARD.h + 3 + HAND_PLATE + 9, fan: 238 };
const TRAY_ROWS = 2;
const TRAY_ROW_MIN = 40;
const TRAY_TOUCH = 36;
const TRAY_PAD = 19;
const TRAY_MAX_SHARE = 0.22;
const AUCTION_ROWS = 4;
const AUCTION_CELL = 52;
const AUCTION_HEAD = 37;
const AUCTION_BOX_H = AUCTION_HEAD + auctionRowsBoxH(AUCTION_ROWS, AUCTION_CELL);
const CENTRE_MIN_AUCTION = AUCTION_HEAD + auctionRowsBoxH(2, AUCTION_CELL);
const CENTRE_MIN_PLAY = Math.round(M_TRICK_BOX.h * 0.7) + 16;
const CENTRE_MIN_RESULT = 200;
const CENTRE_MAX = 900;
const CENTRE_IDEAL_AUCTION = AUCTION_BOX_H;
const CENTRE_IDEAL_PLAY = M_TRICK_BOX.h + 16;
const CENTRE_IDEAL_RESULT = 300;
const PAD_CENTRE = 150;
/** Rounding reserve across four bands — a RENDERED quantity. */
const slackFor = (k: number) => Math.ceil(24 / (k || 1));
const GAPS = 0;
/** One knob drives the whole columns pad. */
const padHeight = (cell: number) => Math.round(cell * 8.8);
/** Below this a 35-target pad stops being hittable — the tray is better. */
const PAD_USABLE = 24;

export interface PlayTableSeat {
  name: string;
  tag?: string;
  strip?: string;
  human?: boolean;
}

export interface PlayTableProps {
  state: GameState & { dealer: Seat; vul: string };
  seats: Record<Seat, PlayTableSeat>;
  visible: Record<Seat, boolean>;
  mySeat?: Seat | null;
  legalCalls?: readonly string[];
  legalPlays?: readonly Card[];
  myTurn?: boolean;
  boardLabel?: string | number;
  scoringLabel?: string;
  auctionDisplay?: "box" | "seats";
  confirmBids?: boolean;
  resultLine?: string;
  resultScore?: string;
  resultDetail?: string;
  completedAction?: ResultCardAction;
  completedNote?: string;
  onCall?: (call: string) => void;
  onPlay?: (seat: Seat, card: Card) => void;
  /** Play controls (pause / step / undo) for the bottom bar. */
  controlsExtraNarrow?: ReactNode;
  /** The seats panel body (SeatsPanel) — present means the Seats button is. */
  railExtra?: ReactNode;
  /** Settings rows for the ☰ menu; when present the ☰ opens the overlay. */
  settings?: readonly SettingsItem[];
  /** The Hands button (the four-hand record) — an onPress here, an href on the web. */
  viewAction?: { label: string; on: () => void };
  /** Resolved skin tokens + the layout knobs (resolveSkin + appearance). */
  tok: Record<string, string>;
  handLayout: "row" | "fan";
  bidPad: "grid" | "columns";
  centreFrame: boolean;
  fanSpread: number;
  fanRadius: number;
  /** Hide the top info bar — the embedded coach app's rule (always, here). */
  hideTopBar?: boolean;
  showToolbars?: boolean;
  showCoach?: boolean;
  coachShare?: number;
  /** The coach band's body (CoachDock). */
  coachContent?: ReactNode;
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
  completedAction,
  completedNote,
  resultLine = "",
  resultScore = "",
  resultDetail,
  onCall,
  onPlay,
  controlsExtraNarrow,
  railExtra,
  settings,
  viewAction,
  tok,
  handLayout,
  bidPad,
  centreFrame,
  fanSpread,
  fanRadius,
  hideTopBar = true,
  showToolbars = true,
  showCoach = true,
  coachShare = 30,
  coachContent,
}: PlayTableProps) {
  const fanLayout = handLayout === "fan";
  const columnsPad = bidPad === "columns";
  const framed = centreFrame;
  const skinRadius = Number.parseInt(tok.radius ?? "5", 10) || 5;
  const feltFlat = flatColor(tok.feltFlat, "#1c6b4f");
  const trayBg = flatColor(tok.trayBg, "#cccc9b");
  const auctionBg = flatColor(tok.auctionBg, "#acc5c5");
  const barBg = tok.barBg ?? "rgba(9,22,17,.90)";
  const accent = tok.accent ?? "#384bb3";
  const cardBack = flatColor(tok.cardBack, "#0d707c");

  // Per-instance sizing: the wrapper is measured (onLayout, the RN
  // ResizeObserver), and nothing paints until it is (bootNeutral).
  const [box, setBox] = useState({ w: 0, h: 0 });
  const measured = box.w > 0 && box.h > 0;

  // Armed bid level and the staged (unconfirmed) call are instance state.
  const [armed, setArmed] = useState<number | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    setArmed(null);
    setPending(null);
  }, [state.auction.length]);

  // The ☰ settings overlay is instance state; Seats sits behind its button.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuHandler = settings ? () => setMenuOpen((v) => !v) : undefined;
  const [seatsOpen, setSeatsOpen] = useState(false);

  const c = state.contract;
  const declarer = c?.declarer ?? null;
  const dummy = declarer && state.phase !== "auction" ? PARTNER[declarer] : null;
  const inAuction = state.phase === "auction";
  const inPlay = state.phase === "play";
  const complete = state.phase === "complete";
  const legalSet = useMemo(() => new Set(legalCalls), [legalCalls]);
  const playable = useMemo(
    () => new Set(legalPlays.map((p) => `${p.suit}${p.rank}`)),
    [legalPlays],
  );
  const myCall = inAuction && myTurn;
  const boxLive = myCall && !pending;

  const vul = String(state.vul).toLowerCase();
  const vulFor = (seat: Seat) => vul === "both" || vul === "all" || sideOf(seat).toLowerCase() === vul;
  const dealerCol = ORDER.indexOf(state.dealer);

  // ── phone-tier band budget (Mobile Table.dc.html), verbatim ────────────────
  const coachOn = showCoach !== false && !!coachContent;
  const coachSharePct = Math.max(0, Math.min(55, coachShare ?? 30));
  const tableSharePct = coachOn ? 100 - coachSharePct : 100;

  // The dummy is a SIDE RAIL of suit lines unless the human must play from it.
  const playing = inPlay || complete;
  const decHuman = declarer ? !!seats[declarer].human : false;
  // The SECOND hand on screen beside the viewer's own — dummy, unless the
  // viewer took over the declarer's chair, when it is the declarer's.
  const sideSeat: Seat | null = !playing
    ? null
    : dummy === "S" && declarer && declarer !== "S" && decHuman
      ? declarer
      : dummy && dummy !== "S"
        ? dummy
        : null;
  const dummyIsRow = !!sideSeat && decHuman;
  const dummyIsStrip = !!sideSeat && !dummyIsRow;

  const phoneBottomOn = Boolean(controlsExtraNarrow || viewAction || railExtra || menuHandler);

  const padOn = columnsPad && inAuction;
  const widthScale = Math.min(1, box.w / MOBILE_W);
  const availPx = Math.max(240, box.h * (tableSharePct / 100) || 590);
  const barFor = (k: number) => {
    const want = Math.max(BAR_BASE, Math.ceil(TOUCH / (k || 1)) + 14);
    return Math.min(want, Math.max(BAR_BASE, Math.round((0.13 * availPx) / (k || 1))));
  };
  const trayRowFor = (k: number) => {
    const want = Math.max(TRAY_ROW_MIN, Math.ceil(TRAY_TOUCH / (k || 1)));
    const room = (TRAY_MAX_SHARE * availPx) / (k || 1) - TRAY_PAD;
    return Math.min(want, Math.max(TRAY_ROW_MIN, Math.floor(room / TRAY_ROWS)));
  };
  const trayFor = (k: number) => TRAY_ROWS * trayRowFor(k) + TRAY_PAD;
  const centreMin = complete ? CENTRE_MIN_RESULT : inAuction ? CENTRE_MIN_AUCTION : CENTRE_MIN_PLAY;
  const centreIdeal = complete
    ? CENTRE_IDEAL_RESULT
    : inAuction
      ? CENTRE_IDEAL_AUCTION
      : CENTRE_IDEAL_PLAY;
  const centreCap = coachOn && coachSharePct > 0 ? centreIdeal : CENTRE_MAX;
  const fit = (k: number, usePad: boolean) => {
    const avail = availPx / (k || 1);
    const others =
      GAPS +
      slackFor(k) +
      (dummyIsStrip ? DUMMY_LINE : 0) +
      (dummyIsRow ? HAND_H.row : 0) +
      (!usePad && inAuction ? trayFor(k) : 0) +
      HAND_H[fanLayout ? "fan" : "row"];
    // The bars are reserved WHETHER OR NOT they are drawn; hidden ones are
    // subtracted from `content` at the end, handing their height to the coach.
    const want = barFor(k);
    const deficit = usePad ? 0 : others + 2 * want + centreMin - avail;
    const bar = deficit > 0 ? Math.max(BAR_BASE, want - Math.ceil(deficit / 2)) : want;
    const base = others + 2 * bar;
    let cell = 0;
    let centre: number;
    if (usePad) {
      cell = Math.max(30, Math.min(62, Math.floor((avail - base - PAD_CENTRE) / 8.3)));
      centre = Math.max(PAD_CENTRE, Math.round(avail - base - padHeight(cell)));
    } else {
      centre = Math.max(centreMin, Math.min(centreCap, Math.round(avail - base)));
    }
    const topBarOn = showToolbars && !hideTopBar ? 1 : 0;
    const bottomBarOn = showToolbars && phoneBottomOn ? 1 : 0;
    const content =
      base +
      (usePad ? padHeight(cell) : 0) +
      centre -
      (2 - topBarOn - bottomBarOn) * bar -
      (dummyIsStrip ? DUMMY_LINE : 0);
    return {
      bar,
      cell,
      centre,
      content,
      usePad,
      trayRow: trayRowFor(k),
      scale: Math.min(1, widthScale, availPx / content),
    };
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
  // A pad squeezed past the point of being hittable is worse than the tray.
  if (phoneFit.usePad && phoneFit.cell * phoneFit.scale < PAD_USABLE) phoneFit = converge(false);
  const phonePadShown = phoneFit.usePad;
  const phonePadCell = phoneFit.usePad ? phoneFit.cell : 38;
  const feltH = phoneFit.centre;
  /** The compass, clamped to the band it is given — ceiling 1, floor .7. */
  const trickK = Math.max(0.7, Math.min(1, (feltH - 16) / M_TRICK_BOX.h));
  const scale = phoneFit.scale;
  const stageH = phoneFit.content;
  const stageBleed = -Math.round(stageH * (1 - scale) + slackFor(scale) * scale);

  const plateBgFor = (seat: Seat) =>
    seats[seat].human ? GOLD : !complete && seat === state.turn ? "#e8e8c8" : GREY;

  // The staged-call gate: with confirm on, a human call parks in `pending`.
  const stageCall = (call: string) => {
    if (!boxLive) return;
    if (confirmBids) setPending(call);
    else onCall?.(call);
  };
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

  // ---- pieces ---------------------------------------------------------------
  const canPlay = (seat: Seat) => (card: Card) =>
    myTurn && inPlay && state.turn === seat && playable.has(`${card.suit}${card.rank}`);

  const backs = (seat: Seat, m: { w: number; h: number }) => (
    <SeatHand
      cards={state.hands[seat]}
      hidden
      metrics={M_CARD}
      layout="row"
      fanSpread={fanSpread}
      fanRadius={fanRadius}
      backColor={cardBack}
      backMetrics={m}
    />
  );

  const plate = (seat: Seat, width: number, m: { weight?: number } = {}) => (
    <SeatPlate
      seat={seat}
      name={seats[seat].name}
      {...(seats[seat].tag ? { tag: seats[seat].tag } : {})}
      {...(seats[seat].strip ? { strip: seats[seat].strip } : {})}
      bg={plateBgFor(seat)}
      width={width}
      isDealer={seat === state.dealer}
      metrics={m}
    />
  );

  /** Seats mode shows each seat's WHOLE bid history — latest call bold. */
  const callsRow = (seat: Seat, font = 16) => {
    if (!inAuction || auctionDisplay !== "seats") return null;
    const mine = state.auction.filter((a) => a.seat === seat);
    if (!mine.length) return null;
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 3 }}>
        {mine.map((a, i) => {
          const latest = i === mine.length - 1;
          return (
            <View
              key={i}
              style={{
                backgroundColor: latest ? "#fff" : "#e8e8e8",
                borderWidth: 1,
                borderColor: "#7d7d7d",
                borderRadius: 3,
                minWidth: 34,
                alignItems: "center",
                paddingHorizontal: 5,
              }}
            >
              <Text style={{ fontSize: font, fontWeight: latest ? "700" : "400", color: callColor(a.call) }}>
                {callText(a.call)}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  const cardRow = (seat: Seat) => (
    <SeatHand
      cards={state.hands[seat]}
      metrics={M_CARD}
      layout="row"
      fanSpread={fanSpread}
      fanRadius={fanRadius}
      backColor={cardBack}
      isPlayable={canPlay(seat)}
      onPlay={(card) => onPlay?.(seat, card)}
    />
  );

  const fanHand = (seat: Seat) => (
    <SeatHand
      cards={state.hands[seat]}
      metrics={M_CARD}
      layout="fan"
      fanSpread={fanSpread}
      fanRadius={fanRadius}
      backColor={cardBack}
      isPlayable={canPlay(seat)}
      onPlay={(card) => onPlay?.(seat, card)}
    />
  );

  // ---- centre ---------------------------------------------------------------
  const auctionRows: ({ call: string } | null)[][] = [];
  {
    const padded: ({ call: string } | null)[] = [
      ...Array.from({ length: ORDER.indexOf(state.dealer) }, () => null),
      ...state.auction.map((a) => ({ call: a.call })),
    ];
    for (let i = 0; i < padded.length; i += 4) auctionRows.push(padded.slice(i, i + 4));
  }

  const currentPlays = inPlay ? (state.tricks[state.tricks.length - 1]?.plays ?? []) : [];

  // ---- toolbars (EdgeToolbar + toolbarModel) --------------------------------
  const SEAT_NAMES: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };
  const vulLabel =
    vul === "both" || vul === "all" ? "Both" : vul === "none" ? "None" : String(state.vul).toUpperCase();
  const infoItems: ToolbarItem[] = [
    { kind: "chip", label: "Board", value: String(boardLabel) },
    { kind: "chip", label: "Dealer", value: state.dealer },
    { kind: "chip", label: "Vul", value: vulLabel, color: vulLabel === "None" ? "#eef4f1" : "#ff9c9c" },
    { kind: "divider" },
    {
      kind: "chip",
      label: "Contract",
      value: c ? `${c.level}${GLYPH[c.strain]}${c.doubled === 1 ? "X" : c.doubled === 2 ? "XX" : ""}` : "—",
      color: c && isRed(c.strain) ? "#ff8a8a" : "#eef4f1",
    },
    { kind: "chip", label: "By", value: c ? SEAT_NAMES[c.declarer] : "—" },
    { kind: "spacer" },
    { kind: "chip", label: "NS", value: String(state.trickCount.NS) },
    { kind: "chip", label: "EW", value: String(state.trickCount.EW) },
    { kind: "button", label: scoringLabel, on: null },
  ];
  const actionItems: ToolbarItem[] = [
    ...(controlsExtraNarrow ? ([{ kind: "node", node: controlsExtraNarrow }] as ToolbarItem[]) : []),
    { kind: "divider" },
    ...(viewAction ? ([{ kind: "button", label: viewAction.label, on: viewAction.on }] as ToolbarItem[]) : []),
    ...(railExtra
      ? ([{ kind: "button", label: "Seats", on: () => setSeatsOpen(true) }] as ToolbarItem[])
      : []),
    { kind: "spacer" },
    ...(menuHandler
      ? ([{ kind: "icon", label: "☰", tone: "accent", on: menuHandler }] as ToolbarItem[])
      : []),
  ];

  /** Dummy's hand in bridge notation — the rail beside the centre band. */
  const dummySuitSpans = (seat: Seat): { suit: string; ranks: string[] }[] =>
    DISPLAY.map((suit) => {
      const ranks = state.hands[seat]
        .filter((cd) => cd.suit === suit)
        .sort((a, b) => b.rank - a.rank)
        .map((cd) => rankText(cd.rank));
      return ranks.length ? { suit: suit as string, ranks } : null;
    }).filter((x): x is { suit: string; ranks: string[] } => x != null);

  /** East rails right (the RHO's side); North and West rail left. */
  const dummyRailSide: "left" | "right" = dummy === "E" ? "right" : "left";

  const dummyRailEl =
    dummyIsStrip && sideSeat ? (
      <View
        style={{
          width: DUMMY_RAIL_W,
          alignSelf: "stretch",
          gap: 8,
          paddingVertical: 8,
          paddingHorizontal: 6,
          backgroundColor: "rgba(0,0,0,.16)",
          overflow: "hidden",
        }}
      >
        <Text numberOfLines={1} style={{ fontSize: 19, fontWeight: "700", color: "#dfe9e4" }}>
          {SEAT_NAMES[sideSeat]}
        </Text>
        {visible[sideSeat]
          ? dummySuitSpans(sideSeat).map((s) => (
              <View key={s.suit} style={{ flexDirection: "row", alignItems: "flex-start", gap: 3 }}>
                <Text
                  style={{
                    fontSize: 24,
                    lineHeight: 27,
                    fontWeight: "700",
                    color: isRed(s.suit) ? RED : "#111",
                  }}
                >
                  {GLYPH[s.suit]}
                </Text>
                {/* Wrapping row of nowrap ranks — a "10" never splits. */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", flexShrink: 1 }}>
                  {s.ranks.map((r, i) => (
                    <Text
                      key={`${r}-${i}`}
                      style={{ fontSize: 24, lineHeight: 27, fontWeight: "700", color: "#f2f6f4" }}
                    >
                      {r}
                    </Text>
                  ))}
                </View>
              </View>
            ))
          : null}
      </View>
    ) : null;

  /** Dummy as a FULL card row — only when the human plays from it. */
  const dummyRowEl =
    dummyIsRow && sideSeat ? (
      <View style={{ alignItems: "center", paddingTop: 10 }}>
        {visible[sideSeat]
          ? fanLayout
            ? fanHand(sideSeat)
            : cardRow(sideSeat)
          : backs(sideSeat, { w: M_CARD.backW, h: M_CARD.h })}
      </View>
    ) : null;

  /** Your hand's rendered width on the phone — the plate spans it. */
  const phoneHandN = Math.max(1, state.hands.S.length);
  const phoneHandW = visible.S
    ? M_CARD.w + (phoneHandN - 1) * M_PITCH
    : Math.round(M_CARD.backW * phoneHandN + 1.5 * (phoneHandN - 1)) + 4;

  // ---- bid tray (BBO's phone bid box), verbatim -----------------------------
  const touchH = phoneFit.trayRow;
  const anyLegalDouble = legalSet.has("X") || legalSet.has("XX");
  const armedStrains = armed ? STRAINS.filter((st) => legalSet.has(`${armed}${st}`)) : [];
  const trayBtnText = (label: string, font: number, color: string) => (
    <Text style={{ fontSize: font, lineHeight: Math.round(font * 1.05), fontWeight: "800", color }}>
      {label}
    </Text>
  );
  const trayCellStyle = (extra: object) => ({
    minWidth: 0,
    height: touchH,
    borderWidth: 1,
    borderColor: "#8a8a6a",
    borderRadius: skinRadius,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    ...extra,
  });
  const confirmButtons = (h: number, font: number) => (
    <>
      <Pressable
        onPress={confirmPending}
        style={{
          width: 240,
          height: h,
          borderWidth: 1,
          borderColor: "#0c4b0b",
          borderRadius: skinRadius,
          backgroundColor: "#116710",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "#fff", fontSize: font, fontWeight: "700" }}>
          Confirm {callText(pending ?? "")}
        </Text>
      </Pressable>
      <Pressable
        onPress={cancelPending}
        style={{
          width: 120,
          height: h,
          borderWidth: 1,
          borderColor: "#5e1c1c",
          borderRadius: skinRadius,
          backgroundColor: "#8a3030",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "#fff", fontSize: font, fontWeight: "700" }}>Cancel</Text>
      </Pressable>
    </>
  );

  // TWO ROWS: Pass │ 1..7 over ♣ ♦ ♥ ♠ │ NT │ X XX. Every slot is ALWAYS
  // rendered (empty until legal/armed) — the buttons must not move mid-bid.
  const strainSlots = STRAINS.map((st) => {
    const live = !!armed && armedStrains.includes(st);
    const fr = st === "N" ? 1.75 : 1;
    if (!live) return <View key={st} style={{ flex: fr, minWidth: 0, height: touchH }} />;
    return (
      <View key={st} style={{ flex: fr, minWidth: 0 }}>
        <Pressable
          onPress={() => stageCall(`${armed}${st}`)}
          accessibilityLabel={`${armed}${st === "N" ? "NT" : st}`}
          style={trayCellStyle({ backgroundColor: "#f8f8f8" })}
        >
          {trayBtnText(GLYPH[st]!, st === "N" ? 28 : 38, isRed(st) ? RED : "#000")}
        </Pressable>
      </View>
    );
  });

  const doubleSlots = !anyLegalDouble
    ? null
    : (["X", "XX"] as const).map((d) => {
        const live = boxLive && legalSet.has(d);
        if (!live) return <View key={d} style={{ flex: 1, minWidth: 0, height: touchH }} />;
        return (
          <View key={d} style={{ flex: 1, minWidth: 0 }}>
            <Pressable
              onPress={() => stageCall(d)}
              accessibilityLabel={d === "X" ? "Double" : "Redouble"}
              style={trayCellStyle({
                borderColor: d === "X" ? "#8f0000" : "#0a2170",
                backgroundColor: d === "X" ? RED : "#1034a6",
              })}
            >
              {trayBtnText(d, 28, "#fff")}
            </Pressable>
          </View>
        );
      });

  const bidBoxNarrow = (
    <View
      style={{
        width: "100%",
        backgroundColor: trayBg,
        paddingTop: 6,
        paddingHorizontal: 8,
        paddingBottom: 8,
        gap: 5,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.45,
        shadowRadius: 8,
        elevation: 6,
      }}
    >
      {pending ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            height: TRAY_ROWS * touchH + 5,
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: "700", color: "#3a3a20" }}>Confirm your call</Text>
          {confirmButtons(touchH, 26)}
        </View>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 5 }}>
            <View style={{ flex: 1.75, minWidth: 0 }}>
              <Pressable
                onPress={boxLive ? () => stageCall("P") : undefined}
                disabled={!boxLive}
                accessibilityLabel="Pass"
                style={trayCellStyle({
                  borderColor: "#0c4b0b",
                  backgroundColor: boxLive ? "#116710" : "#a7b8a2",
                  opacity: boxLive ? 1 : 0.42,
                })}
              >
                {trayBtnText("Pass", 28, "#fff")}
              </Pressable>
            </View>
            {[1, 2, 3, 4, 5, 6, 7].map((l) => {
              const any = STRAINS.some((st) => legalSet.has(`${l}${st}`));
              const live = boxLive && any;
              return (
                <View key={l} style={{ flex: 1, minWidth: 0 }}>
                  <Pressable
                    onPress={live ? () => setArmed(armed === l ? null : l) : undefined}
                    disabled={!live}
                    accessibilityLabel={`Level ${l}`}
                    style={trayCellStyle({
                      backgroundColor: armed === l ? GOLD : "#f8f8f8",
                      opacity: live ? 1 : 0.42,
                    })}
                  >
                    {trayBtnText(String(l), 30, "#000")}
                  </Pressable>
                </View>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", gap: 5 }}>
            {strainSlots}
            {doubleSlots}
          </View>
        </>
      )}
    </View>
  );

  const bidColumnsProps = {
    legalCalls,
    live: boxLive,
    pending,
    onStage: stageCall,
    onConfirm: confirmPending,
    onCancel: cancelPending,
    radius: skinRadius,
  };

  // ---- mobile stack (Mobile Table.dc.html) ----------------------------------
  // A fixed 720-wide column at the fixed-point scale; content height is the
  // sum of the band constants; the scaled-away height bleeds back so the
  // coach band starts exactly under the plate.
  return (
    <View
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={{ flex: 1, backgroundColor: measured ? "#fff" : "#fff4d7", overflow: "hidden" }}
    >
      {measured && (
        <>
          <View
            style={{
              width: MOBILE_W,
              minHeight: stageH,
              alignSelf: "center",
              // transform-origin "top center": scale about the centre, then
              // lift by the height the top half gained.
              transform: [{ translateY: -Math.round((stageH * (1 - scale)) / 2) }, { scale }],
              marginBottom: stageBleed,
              backgroundColor: "#fff",
            }}
          >
            {showToolbars && !hideTopBar && (
              <EdgeToolbar side="top" items={infoItems} condensed thickness={phoneFit.bar} bg={barBg} accent={accent} />
            )}
            {/* ONE felt wrapper behind the dummy row, centre, pad and hand —
                the FLAT skin variant; the felt ENDS at the hand's plate. */}
            <View style={{ backgroundColor: feltFlat }}>
              {dummyRowEl}
              {/* The centre is the ONE flexible band, a ROW: the dummy rail on
                  its own side, the felt centring what phase put there. */}
              <View
                style={{
                  height: feltH,
                  flexDirection: "row",
                  alignItems: "flex-start",
                  overflow: "hidden",
                  paddingHorizontal: 10,
                }}
              >
                {dummyRailSide === "left" ? dummyRailEl : null}
                <View
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: "100%",
                    alignItems: "center",
                    justifyContent: inAuction ? "flex-start" : "center",
                    ...(framed
                      ? { borderWidth: 3, borderColor: "#c9992b", borderRadius: 10 }
                      : {}),
                  }}
                >
                  {inAuction && auctionDisplay === "box" ? (
                    <AuctionBox
                      bg={auctionBg}
                      m={{
                        width: 430,
                        headFont: 26,
                        cellFont: 24,
                        radius: 0,
                        cellMinH: AUCTION_CELL,
                        rowsVisible: AUCTION_ROWS,
                        maxH: feltH,
                      }}
                      heads={ORDER.map((s) => ({ seat: s, vul: vulFor(s), isDealer: s === state.dealer }))}
                      rows={auctionRows}
                      dealerCol={dealerCol}
                      emptyText={
                        state.auction.length === 0
                          ? state.dealer === mySeat
                            ? "You deal"
                            : `${state.dealer} deals`
                          : null
                      }
                    />
                  ) : null}
                  {inAuction && auctionDisplay === "seats" ? (
                    <View style={{ gap: 10, padding: 10 }}>
                      {(["N", "E", "S", "W"] as Seat[]).map((s) => (
                        <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <View
                            style={{
                              width: 30,
                              height: 30,
                              backgroundColor: "#12525e",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700" }}>{s}</Text>
                          </View>
                          {callsRow(s, 22) ?? (
                            <Text style={{ fontSize: 18, color: "rgba(255,255,255,.6)" }}>—</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {inPlay ? (
                    <TrickArea plays={currentPlays} turn={state.turn} scale={trickK} card={M_TRICK_CARD} index={M_TRICK_INDEX} />
                  ) : null}
                  {complete ? (
                    <ResultCard
                      line={resultLine}
                      score={resultScore}
                      detail={resultDetail ?? `NS ${state.trickCount.NS} · EW ${state.trickCount.EW}`}
                      {...(completedAction ? { action: completedAction } : {})}
                      {...(completedNote ? { actionNote: completedNote } : {})}
                      accent={accent}
                    />
                  ) : null}
                </View>
                {dummyRailSide === "right" ? dummyRailEl : null}
              </View>
              {/* Columns pad OR the level tray — one on screen at a time. */}
              {inAuction ? (
                phonePadShown ? (
                  <View style={{ alignItems: "center", paddingVertical: 6 }}>
                    <BidColumns cell={phonePadCell} minCellH={touchH} {...bidColumnsProps} />
                  </View>
                ) : (
                  bidBoxNarrow
                )
              ) : null}
              {/* Your hand: lift headroom, the 13-card row at natural width,
                  the plate spanning the hand it labels. */}
              <View style={{ alignItems: "center", paddingTop: 10 }}>
                <View style={{ alignItems: "center", gap: 3 }}>
                  {callsRow("S")}
                  {visible.S
                    ? fanLayout
                      ? fanHand("S")
                      : cardRow("S")
                    : backs("S", { w: M_CARD.backW, h: M_CARD.h })}
                  {plate("S", Math.max(M_PLATE_MIN, phoneHandW), { weight: 700 })}
                </View>
              </View>
            </View>
            {showToolbars && phoneBottomOn && (
              <EdgeToolbar side="bottom" items={actionItems} condensed thickness={phoneFit.bar} bg={barBg} accent={accent} />
            )}
          </View>
          {/* The coach band takes every remaining pixel — its share is a MINIMUM. */}
          {coachOn ? (
            <View
              style={{
                flex: 1,
                minHeight: `${coachSharePct}%`,
                backgroundColor: "#fff",
                borderTopWidth: 1,
                borderTopColor: "#d8ded9",
              }}
            >
              {coachContent}
            </View>
          ) : null}
          {/* ── overlays: the ☰ menu and the Seats popup ── */}
          {menuOpen && settings && (
            <SettingsMenu accent={accent} items={settings} onClose={() => setMenuOpen(false)} />
          )}
          {seatsOpen && railExtra && <SeatsPopup onClose={() => setSeatsOpen(false)}>{railExtra}</SeatsPopup>}
        </>
      )}
    </View>
  );
}
