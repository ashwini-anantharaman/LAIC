// Bridge's adapter onto the platform library component (@laic/library-core).
//
// The component owns semantics — instance scoping, access policy, copy-with-
// provenance; this file owns the bridge specifics: mapping LibraryEntry rows
// (jsonb stores, unchanged) to the generic item envelope, mapping the Nexus
// bridge context to a principal, registering the bridge content kinds, and
// binding the default policy to bridge role names. Other hosts (the learning
// platform, the coach app) write their own adapter against the same core.

import { newId } from "@bridge/kb";
import {
  ADMIN_AREA_ROLES,
  type NexusBridgeContext,
} from "@bridge/nexus-client";
import type { LibraryEntry, LibraryKind, LibraryStore } from "@bridge/sessions";
import {
  defaultLibraryPolicy,
  LIBRARY_CAPABILITIES,
  LibraryService,
  type ContentKindSpec,
  type LibraryBackend,
  type LibraryCollection,
  type LibraryItem,
  type LibraryPrincipal,
} from "@laic/library-core";
import { canUse } from "./access";
import { authoredScope, getMyCollectionGrants, nexusProgramIdOf, orgScopeOf } from "./nexus";
import { libraryStore } from "./sessions";

// ── Content kinds ─────────────────────────────────────────────────────────────

/** The card layers + table specifics — everything on an entry that is BRIDGE
 *  content rather than library envelope. */
export type BridgeLibraryContent = Pick<
  LibraryEntry,
  | "hands"
  | "dealer"
  | "vul"
  | "auction"
  | "play"
  | "contractLabel"
  | "resultLabel"
  | "kbId"
  | "seats"
  | "expectedCalls"
  | "sourceSessionId"
  | "importFileName"
>;

export const BRIDGE_LIBRARY_KINDS: readonly ContentKindSpec[] = [
  { id: "deal", label: "Deals", description: "a card distribution" },
  { id: "board", label: "Boards", description: "deal + dealer + vulnerability" },
  { id: "table", label: "Tables", description: "a saved seat lineup" },
  { id: "play", label: "Plays", description: "board + calls + cards, as recorded" },
  { id: "drill", label: "Drills", description: "bidding regression checks" },
  { id: "puzzle", label: "Puzzles", description: "reserved" },
];

// ── Envelope mapping (LibraryEntry ↔ LibraryItem) ────────────────────────────

export function entryToItem(e: LibraryEntry): LibraryItem<BridgeLibraryContent> {
  const level = e.scopeLevel ?? "user";
  return {
    id: e.entryId,
    kind: e.kind,
    name: e.name,
    ...(e.notes ? { notes: e.notes } : {}),
    tags: e.tags,
    origin: e.origin,
    createdBy: e.createdBy,
    createdAt: e.createdAt,
    scope: {
      level,
      ...(level === "user" ? { ownerId: e.createdBy } : {}),
      ...(e.programOrganizationId ? { orgId: e.programOrganizationId } : {}),
      ...(e.nexusProgramId ? { programId: e.nexusProgramId } : {}),
    },
    ...(e.sourceRef ? { provenance: e.sourceRef } : {}),
    content: {
      ...(e.hands ? { hands: e.hands } : {}),
      ...(e.dealer ? { dealer: e.dealer } : {}),
      ...(e.vul ? { vul: e.vul } : {}),
      ...(e.auction ? { auction: e.auction } : {}),
      ...(e.play ? { play: e.play } : {}),
      ...(e.contractLabel ? { contractLabel: e.contractLabel } : {}),
      ...(e.resultLabel ? { resultLabel: e.resultLabel } : {}),
      ...(e.kbId ? { kbId: e.kbId } : {}),
      ...(e.seats ? { seats: e.seats } : {}),
      ...(e.expectedCalls ? { expectedCalls: e.expectedCalls } : {}),
      ...(e.sourceSessionId ? { sourceSessionId: e.sourceSessionId } : {}),
      ...(e.importFileName ? { importFileName: e.importFileName } : {}),
    },
  };
}

export function itemToEntry(item: LibraryItem<BridgeLibraryContent>): LibraryEntry {
  return {
    entryId: item.id,
    kind: item.kind as LibraryKind,
    name: item.name,
    ...(item.notes ? { notes: item.notes } : {}),
    tags: item.tags,
    origin: item.origin,
    createdBy: item.createdBy,
    createdAt: item.createdAt,
    ...(item.scope.orgId ? { programOrganizationId: item.scope.orgId } : {}),
    ...(item.scope.programId ? { nexusProgramId: item.scope.programId } : {}),
    scopeLevel: item.scope.level,
    ...(item.provenance ? { sourceRef: item.provenance } : {}),
    ...item.content,
  };
}

// ── Storage port over the existing jsonb stores ──────────────────────────────

class BridgeLibraryBackend implements LibraryBackend<BridgeLibraryContent> {
  constructor(private readonly store: LibraryStore) {}
  async put(item: LibraryItem<BridgeLibraryContent>): Promise<void> {
    await this.store.putEntry(itemToEntry(item));
  }
  async get(id: string): Promise<LibraryItem<BridgeLibraryContent> | null> {
    const e = await this.store.getEntry(id);
    return e ? entryToItem(e) : null;
  }
  async list(query: {
    kind?: string;
    scopeLevel?: "user" | "program" | "org";
    ownerId?: string;
    orgId?: string;
    programId?: string;
  }): Promise<LibraryItem<BridgeLibraryContent>[]> {
    const entries = await this.store.listEntries(query.kind as LibraryKind | undefined, {
      ...(query.orgId ? { programOrganizationId: query.orgId } : {}),
      ...(query.programId ? { nexusProgramId: query.programId } : {}),
      ...(query.scopeLevel ? { scopeLevel: query.scopeLevel } : {}),
      ...(query.ownerId ? { createdBy: query.ownerId } : {}),
    });
    return entries.map(entryToItem);
  }
  async delete(id: string): Promise<void> {
    await this.store.deleteEntry(id);
  }

  // Collections: stored host-side as rows shaped like the core type.
  async putCollection(c: LibraryCollection): Promise<void> {
    await this.store.putCollection({
      collectionId: c.id,
      name: c.name,
      ...(c.description ? { description: c.description } : {}),
      itemIds: c.itemIds,
      createdBy: c.createdBy,
      createdAt: c.createdAt,
      ...(c.scope.orgId ? { programOrganizationId: c.scope.orgId } : {}),
      ...(c.scope.programId ? { nexusProgramId: c.scope.programId } : {}),
      scopeLevel: c.scope.level,
    });
  }
  async getCollection(id: string): Promise<LibraryCollection | null> {
    const r = await this.store.getCollection(id);
    return r ? rowToCollection(r) : null;
  }
  async listCollections(query: {
    scopeLevel?: "user" | "program" | "org";
    ownerId?: string;
    orgId?: string;
    programId?: string;
  }): Promise<LibraryCollection[]> {
    const rows = await this.store.listCollections({
      ...(query.orgId ? { programOrganizationId: query.orgId } : {}),
      ...(query.programId ? { nexusProgramId: query.programId } : {}),
      ...(query.scopeLevel ? { scopeLevel: query.scopeLevel } : {}),
      ...(query.ownerId ? { createdBy: query.ownerId } : {}),
    });
    return rows.map(rowToCollection);
  }
  async deleteCollection(id: string): Promise<void> {
    await this.store.deleteCollection(id);
  }
}

function rowToCollection(r: import("@bridge/sessions").LibraryCollectionRow): LibraryCollection {
  const level = r.scopeLevel ?? "program";
  return {
    id: r.collectionId,
    name: r.name,
    ...(r.description ? { description: r.description } : {}),
    itemIds: r.itemIds,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    scope: {
      level,
      ...(level === "user" ? { ownerId: r.createdBy } : {}),
      ...(r.programOrganizationId ? { orgId: r.programOrganizationId } : {}),
      ...(r.nexusProgramId ? { programId: r.nexusProgramId } : {}),
    },
  };
}

// ── Policy + principal ────────────────────────────────────────────────────────

/** Default policy bound to bridge role names (owner decision 2026-07-29):
 *  ONLY admins see the program instance — everyone else works in their own
 *  library and receives content by distribution (share/assign copies).
 *  Coaches keep the assign surface for their own items; the catalogue
 *  capabilities remain the configurable path on top of all of this. */
const bridgeLibraryPolicy = defaultLibraryPolicy({
  programViewers: [...ADMIN_AREA_ROLES],
  programAuthors: [...ADMIN_AREA_ROLES],
  // LEARNERS DON'T AUTHOR (owner decision 2026-07-30): staff and coaches
  // create boards/deals/tables as before; the prebuilt learner (and guest)
  // roles receive content instead — assigned, shared, or via a designated
  // collection. A program can still opt a role back in by granting
  // `library.author.own` in the Access Catalogue.
  ownAuthors: [...ADMIN_AREA_ROLES, "bridge_coach"],
  sharers: ["bridge_coach", "bridge_program_admin"],
});

export async function libraryPrincipalOf(
  context: NexusBridgeContext,
): Promise<LibraryPrincipal> {
  return {
    userId: context.nexusUserId,
    orgId: orgScopeOf(context),
    programId: (await nexusProgramIdOf()) ?? undefined,
    isAdmin: context.is_admin === true,
    roles: context.roles,
    // ONE access model at runtime: the live @bridge/access catalogue is the
    // sole gate. We translate the caller's catalogue grants into the component's
    // own capability ids and hand them to the principal, so the component's
    // policy (which reads anyCapability) agrees with the catalogue — the
    // exported helpers below and the service enforcement can never diverge.
    capabilities: [
      ...(context.capabilities ?? []),
      ...(await catalogueLibraryCapabilities(context)),
    ],
    // Role-designated collections (later: + subscriptions/packages) — the
    // component enforces, whoever issued the grant.
    collectionGrants: await getMyCollectionGrants().catch(() => []),
  };
}

/**
 * The library-component capability ids the caller holds by virtue of the live
 * access catalogue. This is the adapter seam: @laic/library-core stays
 * untouched (it already honors anyCapability grants), while the catalogue keys
 * — library.program_scope / library.create / library.share / library.collections
 * — become the single source of truth an admin can edit.
 */
async function catalogueLibraryCapabilities(context: NexusBridgeContext): Promise<string[]> {
  const [seeProgram, create, share, curate] = await Promise.all([
    canUse(context, "library.program_scope"),
    canUse(context, "library.create"),
    canUse(context, "library.share"),
    canUse(context, "library.collections"),
  ]);
  const caps: string[] = [];
  if (seeProgram) caps.push(LIBRARY_CAPABILITIES.viewProgram);
  if (create) {
    caps.push(LIBRARY_CAPABILITIES.authorOwn);
    // Staff author into the PROGRAM instance (authoredScope); grant the
    // program-author capability so their create lands where it always did.
    if (authoredScope(context) === "program") caps.push(LIBRARY_CAPABILITIES.authorProgram);
  }
  if (share) caps.push(LIBRARY_CAPABILITIES.assign);
  // Curating collections is an EDIT on the program instance — the component's
  // program-author capability covers collection save/delete. Item authoring
  // stays routed by authoredScope, so this does not let non-staff author
  // program ITEMS through the UI.
  if (curate) caps.push(LIBRARY_CAPABILITIES.authorProgram);
  return caps;
}

// ── Service ───────────────────────────────────────────────────────────────────

/** Constructed per call — the service is stateless (the libraryStore()
 *  singleton underneath holds the connections), and NOT caching it means
 *  policy changes take effect on dev hot-reload instead of being pinned. */
export function bridgeLibrary(): LibraryService<BridgeLibraryContent> {
  return new LibraryService<BridgeLibraryContent>({
    backend: new BridgeLibraryBackend(libraryStore()),
    policy: bridgeLibraryPolicy,
    kinds: BRIDGE_LIBRARY_KINDS,
    newId: () => newId("le"),
  });
}

// ── Page-facing conveniences (pages keep rendering LibraryEntry) ─────────────

/** List an instance ("mine" | "program" | "org") as LibraryEntry rows. */
export async function listLibraryFor(
  context: NexusBridgeContext,
  view: "mine" | "program" | "org",
  kind?: LibraryKind,
): Promise<LibraryEntry[]> {
  const principal = programReadPrincipal(await libraryPrincipalOf(context), context, view);
  const items = await bridgeLibrary().list(principal, { view, kind });
  return items.map(itemToEntry);
}

/**
 * A program/org-shelf reader who sits ABOVE any single club — a reviewer,
 * fellow or program admin whose context carries no `programOrganizationId`, so
 * `orgScopeOf` fell back to the parent laic org — reads the shared shelf
 * PROGRAM-WIDE, not partitioned to that fallback org. The program library's
 * items are stamped with whichever club org they were authored in; without this
 * the very tiers meant to curate the shelf (who hold `library.program_scope`)
 * see nothing, because their fallback org matches no item. Club-scoped callers
 * (a club admin/coach with a real `programOrganizationId`) stay partitioned to
 * their org, and `mine` reads are always owner-scoped. This mirrors the KB,
 * whose reads are program-wide; the `nexus_program_id` partition, when present
 * (http mode), still isolates one program from another within the org.
 */
export function programReadPrincipal(
  principal: LibraryPrincipal,
  context: NexusBridgeContext,
  view: "mine" | "program" | "org",
): LibraryPrincipal {
  if (view === "mine" || context.programOrganizationId) return principal;
  return { ...principal, orgId: undefined };
}

/**
 * Whether the shared PROGRAM library instance is visible to this caller — the
 * page decides program-vs-personal scope on it. Now catalogue-driven
 * (`library.program_scope`, default = the admin tier, mirroring the component's
 * historic programViewers) so an admin can grant program visibility to any role
 * without a code change. This fixes the post-merge regression where entries
 * that live in the program instance were invisible to the tiers that saw them
 * before: those tiers hold `library.program_scope` by default.
 */
export async function canSeeProgramLibrary(context: NexusBridgeContext): Promise<boolean> {
  return canUse(context, "library.program_scope");
}

/**
 * May this caller CREATE in the instance their authored content lands in?
 * (`authoredScope`: staff → program, everyone else → their own shelf.) The
 * create surfaces gate on this, and the create paths assert it. Catalogue-driven
 * (`library.create`) — the same key the desktop create button and actions
 * already enforce, so there is ONE create gate across desktop and mobile.
 */
export async function canCreateInLibrary(context: NexusBridgeContext): Promise<boolean> {
  return canUse(context, "library.create");
}

/** Throws unless the caller may create — for the create server actions. */
export async function assertCanCreateInLibrary(context: NexusBridgeContext): Promise<void> {
  if (!(await canCreateInLibrary(context))) {
    throw new Error("Your role doesn't include creating library content");
  }
}

/**
 * May this caller distribute program items into other people's instances?
 * Catalogue-driven (`library.share`, default = coach + program admin, mirroring
 * the component's historic sharers).
 */
export async function canShareLibrary(context: NexusBridgeContext): Promise<boolean> {
  return canUse(context, "library.share");
}

/**
 * May this caller create/designate library collections? Catalogue-driven
 * (`library.collections`). The curation surfaces gate on this; the injected
 * program-author capability lets the service's collection writes succeed.
 */
export async function canCurateCollections(context: NexusBridgeContext): Promise<boolean> {
  return canUse(context, "library.collections");
}
