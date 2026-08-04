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

/** The parsed URL state — the single source of truth for the grid. */
export interface TesterParams {
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
  savedViews: { id: string; name: string; config: Record<string, string> }[];
}

// Re-export the leaf types the registry references so it has one import site.
export type { AuctionCall, Card, Seat, GameState };
