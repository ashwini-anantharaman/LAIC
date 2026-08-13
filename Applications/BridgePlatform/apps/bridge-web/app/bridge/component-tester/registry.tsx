"use client";

// The component registry — the tester's whole reason to exist. Each entry names
// a REAL @bridge/table-ui component, its group/label/size, the minimum cell body
// it needs, and a two-line `mount(ctx)` that SHAPES one cell's data from the
// live session and hands it to the production component. Adding a component is
// one entry + one mount; nothing else in the harness changes.
//
// `mount` gets a CellCtx built client-side (functions can't cross the server
// boundary): the real GameState, the game-role visibility recipe, the resolved
// skin tokens, density, layout, live/read-only, and the platform-role feature
// booleans. Read-only cells pass isPlayable={() => false} (per ADDENDUM A a
// null onPlay alone leaves cards lifted-but-inert); enabled handlers only ever
// append to the cell's intent log — they never mutate a session.

import type { ReactNode } from "react";
import { legalCalls, legalPlays } from "@bridge/engine";
import type { SkinTokens } from "@bridge/table-config";
import {
  AuctionBox,
  BidColumns,
  EdgeToolbar,
  HandViewer,
  PlayTable,
  ResultCard,
  SeatDiagram,
  SeatHand,
  SeatPlate,
  SeatsPopup,
  SettingsMenu,
  TrickArea,
  type SeatHandMetrics,
  type SettingsItem,
  type ToolbarItem,
} from "@bridge/table-ui";
import type {
  AuctionCall,
  BidPad,
  Card,
  Density,
  GameRole,
  GameState,
  HandLayout,
  MomentResult,
  PlatformFeatures,
  Seat,
} from "./types";

// ── shared shaping helpers (mirror PlayTable's internal composition) ─────────
const ORDER: Seat[] = ["W", "N", "E", "S"];
const PARTNER: Record<Seat, Seat> = { N: "S", S: "N", E: "W", W: "E" };
const SEAT_NAMES: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };
const GLYPH: Record<string, string> = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" };
const GREY = "#d3d3d3";

const rankText = (r: number) =>
  (({ 11: "J", 12: "Q", 13: "K", 14: "A" }) as Record<number, string>)[r] ?? String(r);
const cardLabel = (c: Card) => `${GLYPH[c.suit] ?? c.suit}${rankText(c.rank)}`;

const METRICS: Record<Density, SeatHandMetrics> = {
  comfortable: { w: 50, h: 71, rank: 26, glyph: 22, inset: 3 },
  compact: { w: 38, h: 54, rank: 20, glyph: 17, inset: 3 },
};

const vulFor = (state: GameState, seat: Seat) => {
  const v = String(state.vul).toLowerCase();
  const side = seat === "N" || seat === "S" ? "ns" : "ew";
  return v === "both" || v === "all" || v === side;
};

/** Auction cells padded to the dealer's column, chunked into rows of four. */
function auctionRows(state: GameState): (AuctionCall | null)[][] {
  const padded: (AuctionCall | null)[] = [
    ...Array.from({ length: ORDER.indexOf(state.dealer) }, () => null),
    ...state.auction,
  ];
  const rows: (AuctionCall | null)[][] = [];
  for (let i = 0; i < padded.length; i += 4) rows.push(padded.slice(i, i + 4));
  return rows;
}

// ── the cell context every mount receives ────────────────────────────────────
export interface CellCtx {
  state: GameState;
  result: MomentResult;
  role: GameRole;
  seat: Seat;
  mySeat: Seat | null;
  dummy: Seat | null;
  canSee: (seat: Seat) => boolean;
  onTurn: boolean;
  skin: SkinTokens;
  density: Density;
  hand: HandLayout;
  pad: BidPad;
  live: boolean;
  features: PlatformFeatures;
  intent: (line: string) => void;
}

export interface RegistryEntry {
  group: string;
  label: string;
  note: string;
  /** Size tag shown right-aligned in the left rail. */
  size: string;
  /** Minimum cell body [w, h]. */
  pad: [number, number];
  /** True when the component consumes platform-role feature booleans; the
      Platform axis annotates the others "no role-gated controls". */
  platformGated?: boolean;
  mount: (ctx: CellCtx) => ReactNode;
}

/** Per-card playability for a play-phase seat when the cell is Live. */
function playSet(ctx: CellCtx, seat: Seat): Set<string> {
  if (!ctx.live || ctx.state.phase !== "play" || ctx.state.turn !== seat) return new Set();
  return new Set(legalPlays(ctx.state, seat).map((c) => `${c.suit}${c.rank}`));
}

// ── the registry (v1: real extracted components only; no BidBox tray) ─────────
export const REGISTRY: RegistryEntry[] = [
  // Seats -------------------------------------------------------------------
  {
    group: "Seats",
    label: "SeatHand",
    note: "Row / fan card hand, face-down backs when hidden",
    size: "leaf",
    pad: [360, 130],
    mount: (c) => {
      const visible = c.canSee(c.seat);
      const legal = playSet(c, c.seat);
      return (
        <SeatHand
          cards={c.state.hands[c.seat]}
          metrics={METRICS[c.density]}
          layout={c.hand}
          hidden={!visible}
          fanSpread={78}
          fanRadius={0}
          backColor={c.skin.cardBack}
          isPlayable={c.live ? (card) => legal.has(`${card.suit}${card.rank}`) : () => false}
          onPlay={c.live ? (card) => c.intent(`play:card ${cardLabel(card)}`) : undefined}
        />
      );
    },
  },
  {
    group: "Seats",
    label: "SeatPlate",
    note: "Identity strip, seat badge, dealer mark, dummy tag",
    size: "leaf",
    pad: [220, 60],
    mount: (c) => (
      <SeatPlate
        seat={c.seat}
        name={SEAT_NAMES[c.seat]}
        tag={c.seat === c.dummy ? "dummy" : undefined}
        bg={c.state.phase !== "complete" && c.seat === c.state.turn ? "#e8e8c8" : GREY}
        width={200}
        isDealer={c.seat === c.state.dealer}
      />
    ),
  },
  {
    group: "Seats",
    label: "SeatDiagram",
    note: "Suit-per-line panel (hidden seats show a blank panel)",
    size: "leaf",
    pad: [220, 150],
    mount: (c) => {
      const visible = c.canSee(c.seat);
      const legal = playSet(c, c.seat);
      return (
        <SeatDiagram
          cards={visible ? c.state.hands[c.seat] : []}
          panelBg={visible ? "#fff" : "#b3b3b3"}
          width={210}
          isPlayable={c.live ? (card) => legal.has(`${card.suit}${card.rank}`) : () => false}
          onPlay={c.live ? (card) => c.intent(`play:card ${cardLabel(card)}`) : undefined}
        />
      );
    },
  },
  {
    group: "Seats",
    label: "HandViewer",
    note: "Whole four-hand record with auction + result",
    size: "big",
    pad: [640, 420],
    mount: (c) => (
      <HandViewer
        boardLabel={7}
        dealer={c.state.dealer}
        vul={c.state.vul}
        hands={c.state.hands}
        names={SEAT_NAMES}
        visible={{ N: c.canSee("N"), E: c.canSee("E"), S: c.canSee("S"), W: c.canSee("W") }}
        auction={c.state.auction}
        highlightSeat={c.state.phase === "complete" ? (c.state.contract?.declarer ?? null) : c.state.turn}
        info={[
          { label: "NS tricks", value: String(c.state.trickCount.NS) },
          { label: "EW tricks", value: String(c.state.trickCount.EW) },
        ]}
        result={[{ label: c.result.line, value: c.result.score }]}
      />
    ),
  },

  // Bidding -----------------------------------------------------------------
  {
    group: "Bidding",
    label: "BidColumns",
    note: "Suit-column bid pad (legal calls over the running auction)",
    size: "leaf",
    pad: [320, 260],
    mount: (c) => {
      const inAuction = c.state.phase === "auction";
      const legal = inAuction ? [...legalCalls(c.state.auction, c.state.turn)] : [];
      return (
        <BidColumns
          legalCalls={legal}
          live={c.live && inAuction}
          pending={null}
          onStage={(call) => c.intent(`bid:call ${call}`)}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      );
    },
  },
  {
    group: "Bidding",
    label: "AuctionBox",
    note: "Central auction grid, dealer column tinted, vul on red",
    size: "leaf",
    pad: [360, 210],
    mount: (c) => (
      <AuctionBox
        bg={c.skin.auctionBg}
        heads={ORDER.map((s) => ({ seat: s, vul: vulFor(c.state, s), isDealer: s === c.state.dealer }))}
        rows={auctionRows(c.state)}
        dealerCol={ORDER.indexOf(c.state.dealer)}
        emptyText={c.state.auction.length === 0 ? `${c.state.dealer} deals` : null}
      />
    ),
  },

  // Centre ------------------------------------------------------------------
  {
    group: "Centre",
    label: "TrickArea",
    note: "The current trick as real card faces (empty off play)",
    size: "leaf",
    pad: [260, 240],
    mount: (c) => {
      const plays = c.state.phase === "play" ? (c.state.tricks[c.state.tricks.length - 1]?.plays ?? []) : [];
      return <TrickArea plays={plays} turn={c.state.turn} />;
    },
  },
  {
    group: "Centre",
    label: "ResultCard",
    note: "Contract, score and trick split at board's end",
    size: "leaf",
    pad: [260, 150],
    mount: (c) => <ResultCard line={c.result.line} score={c.result.score} detail={c.result.detail} />,
  },

  // Chrome ------------------------------------------------------------------
  {
    group: "Chrome",
    label: "EdgeToolbar",
    note: "Edge info + action bar; buttons appear per the role's catalogue",
    size: "chrome",
    pad: [560, 60],
    platformGated: true,
    mount: (c) => {
      const f = c.features;
      const cc = c.state.contract;
      const items: ToolbarItem[] = [
        { kind: "chip", label: "Board", value: "7" },
        { kind: "chip", label: "Dealer", value: c.state.dealer },
        { kind: "chip", label: "Vul", value: "None" },
        { kind: "divider" },
        { kind: "chip", label: "Contract", value: cc ? `${cc.level}${GLYPH[cc.strain]} ${cc.declarer}` : "—" },
        { kind: "spacer" },
        ...(f.hands_view ? ([{ kind: "button", label: "Hands", on: () => c.intent("open:hands") }] as ToolbarItem[]) : []),
        ...(f.seats_panel ? ([{ kind: "button", label: "Seats", on: () => c.intent("open:seats") }] as ToolbarItem[]) : []),
        ...(f.undo ? ([{ kind: "button", label: "↩ Undo", on: () => c.intent("undo") }] as ToolbarItem[]) : []),
        ...(f.settings_menu ? ([{ kind: "icon", label: "☰", tone: "accent", ariaLabel: "Table menu", on: () => c.intent("open:menu") }] as ToolbarItem[]) : []),
      ];
      return <EdgeToolbar side="top" items={items} bg="#161b1f" accent="#12909f" />;
    },
  },

  // Overlays ----------------------------------------------------------------
  {
    group: "Overlays",
    label: "SeatsPopup",
    note: "Who-is-in-each-seat overlay (fills the cell body)",
    size: "overlay",
    pad: [340, 260],
    mount: (c) => (
      <div style={{ position: "relative", width: 340, height: 240 }}>
        <SeatsPopup onClose={() => c.intent("close:seats")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(["N", "E", "S", "W"] as Seat[]).map((s) => (
              <div key={s} style={{ display: "flex", justifyContent: "space-between", color: "#dfe7e3", fontSize: 14 }}>
                <span>{SEAT_NAMES[s]}</span>
                <span style={{ color: "#9daab2" }}>{s === c.dummy ? "dummy" : "robot"}</span>
              </div>
            ))}
          </div>
        </SeatsPopup>
      </div>
    ),
  },
  {
    group: "Overlays",
    label: "SettingsMenu",
    note: "Table settings overlay; appearance rows appear per the role",
    size: "overlay",
    pad: [320, 360],
    platformGated: true,
    mount: (c) => {
      const f = c.features;
      const items: SettingsItem[] = [
        { label: "Show all four hands", value: "Off", on: () => c.intent("set:hands all") },
        { label: "Auction display", value: "Centre box", on: () => c.intent("set:auction") },
        { label: "Robot speed", value: "Normal", on: () => c.intent("set:speed") },
        ...(f.skin_settings
          ? [
              { label: "Skin", value: "Green baize", on: () => c.intent("set:skin") },
              { label: "Hand layout", value: "Row", on: () => c.intent("set:layout") },
              { label: "Bid pad", value: "Level grid", on: () => c.intent("set:pad") },
            ]
          : []),
        ...(f.skins_page ? [{ label: "Appearance", value: "→", on: () => c.intent("open:skins") }] : []),
        ...(f.workbench_link ? [{ label: "Verification workbench", value: "→", on: () => c.intent("open:workbench") }] : []),
      ];
      return (
        <div style={{ position: "relative", width: 300, height: 340 }}>
          <SettingsMenu accent="#12909f" items={items} onClose={() => c.intent("close:menu")} />
        </div>
      );
    },
  },

  // Whole table -------------------------------------------------------------
  {
    group: "Whole table",
    label: "PlayTable",
    note: "The whole table (fixed 900×560 box; Single axis only)",
    size: "table",
    pad: [900, 560],
    platformGated: true,
    mount: (c) => {
      const f = c.features;
      return (
        <div style={{ width: 900, height: 560 }}>
          <PlayTable
            state={{
              hands: c.state.hands,
              auction: c.state.auction,
              tricks: c.state.tricks,
              phase: c.state.phase,
              turn: c.state.turn,
              contract: c.state.contract,
              trickCount: c.state.trickCount,
              dealer: c.state.dealer,
              vul: c.state.vul,
            }}
            seats={{
              N: { name: SEAT_NAMES.N, tag: c.dummy === "N" ? "dummy" : "" },
              E: { name: SEAT_NAMES.E, tag: c.dummy === "E" ? "dummy" : "" },
              S: { name: SEAT_NAMES.S, tag: c.dummy === "S" ? "dummy" : "" },
              W: { name: SEAT_NAMES.W, tag: c.dummy === "W" ? "dummy" : "" },
            }}
            visible={{ N: c.canSee("N"), E: c.canSee("E"), S: c.canSee("S"), W: c.canSee("W") }}
            mySeat={c.mySeat}
            myTurn={false}
            boardLabel={7}
            appearance={{ ...c.skin, handLayout: c.hand, bidPad: c.pad, centreFrame: false, fanSpread: 78, fanRadius: 0, suitGroups: false }}
            settings={f.settings_menu ? [{ label: "Show all four hands", value: "Off", href: "#" }] : undefined}
            railExtra={f.seats_panel ? <div style={{ color: "#dfe7e3", fontSize: 13 }}>Seat roster</div> : undefined}
            viewHref={f.hands_view ? { label: "Hands", href: "#" } : undefined}
          />
        </div>
      );
    },
  },
];

export const REGISTRY_BY_LABEL: Record<string, RegistryEntry> = Object.fromEntries(
  REGISTRY.map((e) => [e.label, e]),
);

/** Left-rail groups in declaration order, each with its entries. */
export function registryGroups(): { group: string; entries: RegistryEntry[] }[] {
  const groups: { group: string; entries: RegistryEntry[] }[] = [];
  for (const entry of REGISTRY) {
    let g = groups.find((x) => x.group === entry.group);
    if (!g) {
      g = { group: entry.group, entries: [] };
      groups.push(g);
    }
    g.entries.push(entry);
  }
  return groups;
}
