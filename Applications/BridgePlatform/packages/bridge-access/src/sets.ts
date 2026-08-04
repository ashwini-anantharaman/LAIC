// Capability-set designer (experiment). A second, coarser way to reason about
// access: capabilities are bucketed into named SETS, roles are assigned whole
// sets, and each set unlocks a fixed list of live feature keys ("surfaces").
// This layer is pure metadata on top of the enforcement registry — it compiles
// DOWN to the flat feature->roles rules the app already enforces, so the
// designer never invents its own gating. The 13 sets partition all 37
// ACCESS_FEATURES keys: every key lives in exactly one set.

import { ALL_BRIDGE_ROLES } from "./index";
import type { BridgeRole } from "@bridge/nexus-client";

export interface CapabilitySet {
  id: string;
  name: string;
  description: string;
  /** Live enforcement feature keys this set unlocks. */
  featureKeys: readonly string[];
}

// The five roles that reach the Admin & Expert Review area — the enforcement
// registry's ADMIN default set. Inlined (not imported) so the assignment reads
// as data, mirroring index.ts.
const ADMIN: readonly BridgeRole[] = [
  "bridge_program_admin",
  "bridge_org_admin",
  "bridge_club_admin",
  "bridge_reviewer",
  "bridge_fellow",
];
const ALL = ALL_BRIDGE_ROLES;

/**
 * The 13 capability sets. Their featureKeys partition every ACCESS_FEATURES key
 * — see sets.test.ts, which asserts the partition and the defaults invariant.
 */
export const CAPABILITY_SETS: readonly CapabilitySet[] = [
  {
    id: "basics",
    name: "Basics",
    description: "The home dashboard and the how-to guide — the always-on entry surfaces.",
    featureKeys: ["page.home", "page.guide"],
  },
  {
    id: "playing",
    name: "Playing",
    description: "Sitting at a live table and its universal controls — undo, stepping, settings, the hand record, appearance, and the skins page.",
    featureKeys: [
      "page.play",
      "page.skins",
      "table.undo",
      "table.step_controls",
      "table.settings_menu",
      "table.hands_view",
      "table.skin_settings",
    ],
  },
  {
    id: "player_roster",
    name: "Player roster",
    description: "The players page: viewing the roster, creating players, and sitting one at a table.",
    featureKeys: ["page.players", "players.create", "players.try"],
  },
  {
    id: "neural_players",
    name: "Neural players",
    description: "The AI-players (BEN) tab on the roster.",
    featureKeys: ["players.ai_tab"],
  },
  {
    id: "library",
    name: "Library",
    description: "The saved-deals library: browsing, authoring, importing, resuming, deleting, and full-screen records.",
    featureKeys: [
      "page.library",
      "library.create",
      "library.import",
      "library.resume",
      "library.delete",
      "library.hand_viewer",
    ],
  },
  {
    id: "deals_workshop",
    name: "Deals workshop",
    description: "Authoring boards at the table: dealing anew, the deal editor, and saving to the library.",
    featureKeys: ["table.new_deal", "table.deal_editor", "table.save_library"],
  },
  {
    id: "analysis",
    name: "Analysis & verification",
    description: "The verification workbench and the reasoning rails: decisions, the learner/verify toggle, the workbench link.",
    featureKeys: [
      "page.workbench",
      "page.component_tester",
      "table.decisions",
      "table.learner_toggle",
      "table.workbench_link",
    ],
  },
  {
    id: "sandboxes",
    name: "Sandboxes",
    description: "Rearranging a live table: the seats panel and seating the BEN neural engine.",
    featureKeys: ["table.seats_panel", "table.ben_seat"],
  },
  {
    id: "bridge_knowledge",
    name: "Bridge knowledge",
    description: "The knowledge-base workspace and fixing an engine call in place at the table.",
    featureKeys: ["page.kb", "table.fix_at_table"],
  },
  {
    id: "player_management",
    name: "Player management",
    description: "Editing and deleting existing players.",
    featureKeys: ["players.edit", "players.delete"],
  },
  {
    id: "org_visibility",
    name: "Org visibility",
    description: "Seeing the organization page.",
    featureKeys: ["page.org"],
  },
  {
    id: "org_management",
    name: "Org management",
    description: "Editing the organization profile.",
    featureKeys: ["org.edit_profile"],
  },
  {
    id: "governance",
    name: "Governance",
    description: "Managing teams & roles and reading the audit log.",
    featureKeys: ["page.teams", "page.audit"],
  },
];

/** set id -> roles holding it. */
export type SetAssignment = Record<string, BridgeRole[]>;

/**
 * The default assignment, mirroring the live enforcement defaults: the five
 * everyone-facing sets go to all eight roles; the admin sets to the ADMIN five;
 * org visibility/management to the org-manager roles. compileAssignment of this
 * equals every feature's defaultRoles — proven in sets.test.ts.
 */
export const DEFAULT_ASSIGNMENT: SetAssignment = {
  basics: [...ALL],
  playing: [...ALL],
  player_roster: [...ALL],
  neural_players: [...ALL],
  library: [...ALL],
  deals_workshop: [...ADMIN],
  analysis: [...ADMIN],
  sandboxes: [...ADMIN],
  bridge_knowledge: [...ADMIN],
  player_management: [...ADMIN],
  org_visibility: ["bridge_coach", "bridge_org_admin", "bridge_club_admin", "bridge_program_admin"],
  org_management: ["bridge_org_admin", "bridge_club_admin", "bridge_program_admin"],
  governance: [...ADMIN],
};

/**
 * Compile a set assignment down to the flat feature rules the enforcement layer
 * consumes: every feature key in a set inherits that set's roles. Because the
 * sets partition all keys, every registry key is produced exactly once.
 */
export function compileAssignment(assignment: SetAssignment): Record<string, BridgeRole[]> {
  const rules: Record<string, BridgeRole[]> = {};
  for (const set of CAPABILITY_SETS) {
    const roles = assignment[set.id] ?? [];
    for (const key of set.featureKeys) {
      rules[key] = [...roles];
    }
  }
  return rules;
}
