// Role-based access catalogue (§7 area gating, extended). A registry of the
// pages and table/players/library/org features that may be gated, each with a
// default role set; a catalogue overrides those defaults per program. The app
// enforces against this read model — it never invents feature keys, so a rule
// for an unknown key (or a missing rule) resolves to "visible" rather than
// bricking a page for everyone.

import type { BridgeRole } from "@bridge/nexus-client";

export type AccessKind = "page" | "feature" | "control";

export interface AccessFeature {
  key: string;
  label: string;
  group: string;
  kind: AccessKind;
  description: string;
  defaultRoles: readonly BridgeRole[];
}

/** All eight bridge roles, program-admin widest to guest narrowest. */
export const ALL_BRIDGE_ROLES: readonly BridgeRole[] = [
  "bridge_program_admin",
  "bridge_org_admin",
  "bridge_club_admin",
  "bridge_coach",
  "bridge_reviewer",
  "bridge_fellow",
  "bridge_learner",
  "bridge_guest",
];

// The five roles that reach the Admin & Expert Review area (mirrors
// nexus-client ADMIN_AREA_ROLES). Inlined, not imported, so the registry's
// default sets read as data rather than a computed reference.
const ADMIN: readonly BridgeRole[] = [
  "bridge_program_admin",
  "bridge_org_admin",
  "bridge_club_admin",
  "bridge_reviewer",
  "bridge_fellow",
];
const ALL = ALL_BRIDGE_ROLES;

/**
 * The gateable surface. Keys are stable contract with the enforcement layer —
 * renaming one is a breaking change. Grouped for the (future) admin editor.
 */
export const ACCESS_FEATURES: readonly AccessFeature[] = [
  // Pages: the top-level navigable areas.
  {
    key: "page.home",
    label: "Home",
    group: "Pages",
    kind: "page",
    description: "The landing dashboard; hidden, the workspace opens elsewhere.",
    defaultRoles: ALL,
  },
  {
    key: "page.play",
    label: "Play (lobby + table)",
    group: "Pages",
    kind: "page",
    description: "The play lobby and live table; hidden, there is no way to sit down.",
    defaultRoles: ALL,
  },
  {
    key: "page.players",
    label: "Players",
    group: "Pages",
    kind: "page",
    description: "The players roster page; hidden, the roster link disappears.",
    defaultRoles: ALL,
  },
  {
    key: "page.library",
    label: "Library",
    group: "Pages",
    kind: "page",
    description: "The saved-deals library; hidden, saved boards are unreachable.",
    defaultRoles: ALL,
  },
  {
    key: "page.guide",
    label: "Guide",
    group: "Pages",
    kind: "page",
    description: "The how-to guide; hidden, the guide link disappears.",
    defaultRoles: ALL,
  },
  {
    key: "page.kb",
    label: "Knowledge bases (whole workspace)",
    group: "Pages",
    kind: "page",
    description: "The knowledge-base authoring workspace; hidden, KB editing is gone.",
    defaultRoles: ADMIN,
  },
  {
    key: "page.teams",
    label: "Teams & roles",
    group: "Pages",
    kind: "page",
    description: "The teams and role-assignment admin; hidden, roles cannot be managed here.",
    defaultRoles: ADMIN,
  },
  {
    key: "page.org",
    label: "Organization",
    group: "Pages",
    kind: "page",
    description: "The organization settings page; hidden, org profile is unreachable.",
    defaultRoles: ["bridge_coach", "bridge_org_admin", "bridge_club_admin", "bridge_program_admin"],
  },
  {
    key: "page.audit",
    label: "Audit log",
    group: "Pages",
    kind: "page",
    description: "The append-only audit trail; hidden, the log is not viewable.",
    defaultRoles: ADMIN,
  },
  {
    key: "page.workbench",
    label: "Verification workbench (legacy table)",
    group: "Pages",
    kind: "page",
    description: "The legacy verification table; hidden, the workbench page is gone.",
    defaultRoles: ADMIN,
  },
  {
    key: "page.component_tester",
    label: "Component tester",
    group: "Pages",
    kind: "page",
    description: "The table-component tester harness; hidden, the hidden tester route is gone.",
    defaultRoles: ADMIN,
  },
  {
    key: "page.skins",
    label: "Skins & appearance page",
    group: "Pages",
    kind: "page",
    description: "The table skins & appearance configurator; hidden, the appearance page is unreachable.",
    defaultRoles: ALL,
  },
  {
    key: "page.challenges",
    label: "Challenges",
    group: "Pages",
    kind: "page",
    description: "The challenges list and everything it opens; hidden, challenges are unreachable.",
    defaultRoles: ALL,
  },

  // Table: the controls and rails around a live table.
  {
    key: "table.seats_panel",
    label: "Seats panel & seat swapping",
    group: "Table",
    kind: "feature",
    description: "The seats panel for swapping who sits where; hidden, seats are fixed.",
    defaultRoles: ADMIN,
  },
  {
    key: "table.ben_seat",
    label: "BEN neural engine seating",
    group: "Table",
    kind: "feature",
    description: "Seating the BEN neural engine at the table; hidden, BEN cannot be seated.",
    defaultRoles: ADMIN,
  },
  {
    key: "table.workbench_link",
    label: "Workbench link in ☰",
    group: "Table",
    kind: "feature",
    description: "The workbench shortcut in the table menu; hidden, the link is gone.",
    defaultRoles: ADMIN,
  },
  {
    key: "table.decisions",
    label: "Decisions rail",
    group: "Table",
    kind: "feature",
    description: "The engine-decisions rail beside the table; hidden, reasoning is not shown.",
    defaultRoles: ADMIN,
  },
  {
    key: "table.save_library",
    label: "Save to library",
    group: "Table",
    kind: "feature",
    description: "Saving the current board to the library; hidden, the save control is gone.",
    defaultRoles: ADMIN,
  },
  {
    key: "table.new_deal",
    label: "Deal a new board",
    group: "Table",
    kind: "feature",
    description: "Dealing a fresh board at the table; hidden, the new-deal control is gone.",
    defaultRoles: ADMIN,
  },
  {
    key: "table.deal_editor",
    label: "Deal editor",
    group: "Table",
    kind: "feature",
    description: "The hand-by-hand deal editor; hidden, deals cannot be hand-edited.",
    defaultRoles: ADMIN,
  },
  {
    key: "table.fix_at_table",
    label: "Fix at the table",
    group: "Table",
    kind: "feature",
    description: "In-place correction of an engine call at the table; hidden, the fix control is gone.",
    defaultRoles: ADMIN,
  },
  {
    key: "table.learner_toggle",
    label: "Learner/verify view toggle",
    group: "Table",
    kind: "feature",
    description: "The learner/verify view switch; hidden, the verify view is not reachable.",
    defaultRoles: ADMIN,
  },
  {
    key: "table.undo",
    label: "Undo",
    group: "Table",
    kind: "feature",
    description: "Undoing the last action at the table; hidden, the undo control is gone.",
    defaultRoles: ALL,
  },
  {
    key: "table.step_controls",
    label: "Pause & step controls",
    group: "Table",
    kind: "feature",
    description: "Pausing and stepping the engine; hidden, play only runs continuously.",
    defaultRoles: ALL,
  },
  {
    key: "table.settings_menu",
    label: "Table settings ☰",
    group: "Table",
    kind: "feature",
    description: "The table settings menu; hidden, the settings button is gone.",
    defaultRoles: ALL,
  },
  {
    key: "table.hands_view",
    label: "Hands record view",
    group: "Table",
    kind: "feature",
    description: "The hand-record view at the table; hidden, the record view is gone.",
    defaultRoles: ALL,
  },
  {
    key: "table.skin_settings",
    label: "Appearance settings (☰)",
    group: "Table",
    kind: "control",
    description: "The skin & appearance rows in the table settings menu; hidden, appearance is fixed to the default.",
    defaultRoles: ALL,
  },
  {
    key: "table.coach",
    label: "Table coach panel",
    group: "Table",
    kind: "feature",
    description: "The coach panel under the phone-tier table (What I'm looking at / Help me think / hint); hidden, the table carries no coaching surface.",
    defaultRoles: ALL,
  },

  // Players: roster actions.
  {
    key: "players.create",
    label: "Create players",
    group: "Players",
    kind: "feature",
    description: "Creating new players; hidden, the create-player control is gone.",
    defaultRoles: ALL,
  },
  {
    key: "players.edit",
    label: "Edit players",
    group: "Players",
    kind: "feature",
    description: "Editing existing players; hidden, players are read-only.",
    defaultRoles: ADMIN,
  },
  {
    key: "players.delete",
    label: "Delete players",
    group: "Players",
    kind: "feature",
    description: "Deleting players; hidden, the delete control is gone.",
    defaultRoles: ADMIN,
  },
  {
    key: "players.try",
    label: "Play against / watch players",
    group: "Players",
    kind: "feature",
    description: "Sitting a player at a table to play or watch; hidden, the try control is gone.",
    defaultRoles: ALL,
  },
  {
    key: "players.ai_tab",
    label: "AI players tab (BEN)",
    group: "Players",
    kind: "feature",
    description: "The AI-players (BEN) tab on the roster; hidden, only human players show.",
    defaultRoles: ALL,
  },

  // Library: authoring and entry actions.
  {
    key: "library.create",
    label: "Author deals & tables",
    group: "Library",
    kind: "feature",
    description: "Authoring new deals and table lineups; hidden, the author control is gone.",
    defaultRoles: ALL,
  },
  {
    key: "library.import",
    label: "Import LIN/PBN",
    group: "Library",
    kind: "feature",
    description: "Importing LIN/PBN files into the library; hidden, the import control is gone.",
    defaultRoles: ALL,
  },
  {
    key: "library.resume",
    label: "Play / resume entries",
    group: "Library",
    kind: "feature",
    description: "Playing or resuming a saved entry; hidden, entries cannot be re-dealt.",
    defaultRoles: ALL,
  },
  {
    // deleteEntryAction is requireContext-only today, so any signed-in role may
    // delete — ALL, not ADMIN. Tighten here if the action tightens.
    key: "library.delete",
    label: "Delete entries",
    group: "Library",
    kind: "feature",
    description: "Deleting library entries; hidden, the delete control is gone.",
    defaultRoles: ALL,
  },
  {
    key: "library.hand_viewer",
    label: "Full-screen hand records",
    group: "Library",
    kind: "feature",
    description: "The full-screen hand-record viewer; hidden, records open inline only.",
    defaultRoles: ALL,
  },
  {
    // Whether the shared PROGRAM library instance is visible. Off, the caller
    // works in their own shelf and receives content by share/assign copies.
    // Mirrors the library component's programViewers (the admin area) default.
    key: "library.program_scope",
    label: "See the program library",
    group: "Library",
    kind: "feature",
    description: "Seeing the shared program library instance; hidden, only your own shelf shows.",
    defaultRoles: ADMIN,
  },
  {
    // Distributing program items into other people's own libraries (each gets
    // a copy). Mirrors the component's sharers default (coach + program admin).
    key: "library.share",
    label: "Share library items",
    group: "Library",
    kind: "feature",
    description: "Distributing program items into people's own libraries; hidden, the Share control is gone.",
    defaultRoles: ["bridge_coach", "bridge_program_admin"],
  },
  {
    // Creating library collections and designating which roles receive them.
    // Mirrors today's curation surface (coach + program admin).
    key: "library.collections",
    label: "Curate collections",
    group: "Library",
    kind: "feature",
    description: "Creating and designating library collections; hidden, the Collections surface is gone.",
    defaultRoles: ["bridge_coach", "bridge_program_admin"],
  },

  // Challenges: creating one. Playing and viewing ride on page.challenges;
  // the per-challenge controlOverrides layer is NOT a catalogue key — it is an
  // explicit exception applied after these checks, in both directions (spec §7).
  {
    key: "challenge.create",
    label: "Create challenges",
    group: "Challenges",
    kind: "feature",
    description: "Assembling and inviting to a new challenge; hidden, challenges can only be played.",
    defaultRoles: ALL,
  },

  // Organization: org-profile editing.
  {
    key: "org.edit_profile",
    label: "Edit organization profile",
    group: "Organization",
    kind: "feature",
    description: "Editing the organization profile; hidden, the org profile is read-only.",
    defaultRoles: ["bridge_org_admin", "bridge_club_admin", "bridge_program_admin"],
  },
];

/** The single program-wide catalogue's id; org-scoped overrides come later. */
export const GLOBAL_CATALOGUE_ID = "global";

export interface AccessCatalogue {
  catalogueId: string;
  /** Empty/undefined = program-wide. Org overrides come later without migration. */
  programOrganizationId?: string;
  /** feature key -> roles that may see/use it. Missing key = the feature's defaultRoles. */
  rules: Record<string, BridgeRole[]>;
  updatedBy?: string;
  updatedAt?: string;
}

/** The empty catalogue: no overrides, so every feature keeps its defaultRoles. */
export function defaultCatalogue(): AccessCatalogue {
  return { catalogueId: GLOBAL_CATALOGUE_ID, rules: {} };
}

const FEATURE_BY_KEY: ReadonlyMap<string, AccessFeature> = new Map(
  ACCESS_FEATURES.map((f) => [f.key, f]),
);

/**
 * The roles allowed at `key`: an explicit catalogue rule wins; otherwise the
 * feature's registered defaultRoles. An unknown key with no rule returns []
 * (there is nothing to gate) — canAccess reads that as "visible", never hidden.
 */
export function rolesFor(
  catalogue: AccessCatalogue | null | undefined,
  key: string,
): readonly BridgeRole[] {
  const rule = catalogue?.rules[key];
  if (rule) return rule;
  return FEATURE_BY_KEY.get(key)?.defaultRoles ?? [];
}

/**
 * Whether any of `roles` may access `key`. Unknown keys (not in the registry
 * and carrying no rule) are VISIBLE — a typo must not brick a page for everyone.
 */
export function canAccess(
  catalogue: AccessCatalogue | null | undefined,
  key: string,
  roles: readonly BridgeRole[],
): boolean {
  const isKnown = FEATURE_BY_KEY.has(key) || Boolean(catalogue?.rules[key]);
  if (!isKnown) return true;
  const allowed = rolesFor(catalogue, key);
  return roles.some((r) => allowed.includes(r));
}

export interface AccessStore {
  getCatalogue(catalogueId: string): Promise<AccessCatalogue | null>;
  putCatalogue(catalogue: AccessCatalogue): Promise<void>;
}

export interface AccessStoreData {
  catalogues: AccessCatalogue[];
}

export class InMemoryAccessStore implements AccessStore {
  constructor(protected data: AccessStoreData = { catalogues: [] }) {}
  protected persist(): void {}
  async getCatalogue(catalogueId: string) {
    return this.data.catalogues.find((c) => c.catalogueId === catalogueId) ?? null;
  }
  async putCatalogue(catalogue: AccessCatalogue) {
    const i = this.data.catalogues.findIndex((c) => c.catalogueId === catalogue.catalogueId);
    if (i >= 0) this.data.catalogues[i] = catalogue;
    else this.data.catalogues.push(catalogue);
    this.persist();
  }
}
