// Shared, serializable types for the component tester. NO server-only marker
// and NO runtime values — both the server page and the client shell import
// these, so they must erase cleanly on the client.

import type { AuctionCall, Card, Seat } from "@bridge/events";
import type { GameState } from "@bridge/engine";
import type { SkinName } from "@bridge/table-config";

export type MomentId = "opening" | "midAuction" | "lead" | "midPlay" | "complete";
export type GameRole = "player" | "declarer" | "dummy" | "kibitzer" | "director";
export type Density = "comfortable" | "compact";
export type HandLayout = "row" | "fan";
export type BidPad = "grid" | "columns";
export type AxisId = "single" | "role" | "moment" | "skin" | "seat" | "platform";
export type TesterMode = "inspect" | "build";

// ── Build mode (client-only, persisted to localStorage) ──────────────────────
export type CanvasLayout = "grid" | "row" | "column";
export type HandExposure = "auto" | "faces" | "backs" | "hidden";

/** One placed component in a Build view. LAYOUT only — no deal/moment pinned. */
export interface CanvasSlot {
  component: string;
  seat?: Seat;
  span?: number;
  /** Per-slot prop overrides (visibility toggles). Deleted, never left {}. */
  props?: Record<string, unknown>;
}

/** A saved Build view — the exact localStorage shape (bridge.tester.views.v1). */
export interface TesterView {
  id: string;
  name: string;
  layout: CanvasLayout;
  cols: number;
  gap: number;
  labels: boolean;
  hideInactive: boolean;
  hands: Record<Seat, HandExposure>;
  slots: CanvasSlot[];
}

export interface MomentResult {
  line: string;
  score: string;
  detail: string;
}
export interface MomentSnapshot {
  state: GameState;
  result: MomentResult;
}

/** The 9 table feature booleans a platform role has, from the LIVE catalogue. */
export interface PlatformFeatures {
  seats_panel: boolean;
  ben_seat: boolean;
  workbench_link: boolean;
  undo: boolean;
  step_controls: boolean;
  settings_menu: boolean;
  hands_view: boolean;
  skin_settings: boolean;
  skins_page: boolean;
}

/** One platform role's computed presence + a human hint about what it lacks. */
export interface PlatformRoleInfo {
  role: string;
  label: string;
  features: PlatformFeatures;
  /** Feature labels this role lacks vs an all-on role (for the rail hint). */
  lacks: string[];
}

/** The parsed URL state — the single source of truth for the Inspect grid.
    Build's slot arrays live in localStorage; only mode + the open view id ride
    the URL (mode=build&view=<id>), so a link reopens the right tab and view. */
export interface TesterParams {
  mode: TesterMode;
  view: string;
  comp: string;
  axis: AxisId;
  role: GameRole;
  moment: MomentId;
  skin: SkinName;
  seat: Seat;
  hand: HandLayout;
  pad: BidPad;
  density: Density;
  live: boolean;
  prole: string;
}

/** Everything the server computes and hands the client shell. */
export interface TesterData {
  params: TesterParams;
  moments: Record<MomentId, MomentSnapshot>;
  platformRoles: PlatformRoleInfo[];
}

// Re-export the leaf types the registry references so it has one import site.
export type { AuctionCall, Card, Seat, GameState };
