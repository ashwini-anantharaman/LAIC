// The fellows' library: saved snapshots of table artifacts. Definitions
// (owner, 2026-07-16): a DEAL is a card distribution; a BOARD is a deal +
// dealer + vulnerability; an AUCTION is an ordered call sequence; a PLAY is
// an ordered card sequence. Entries layer those shapes progressively —
// a `play` entry carries the board it was played on and its auction, so any
// entry can be re-dealt to a table. `table` entries save a seat lineup
// instead. `drill`/`puzzle` are reserved kinds (no functionality yet).

import type { Call, Card, Seat, Vul } from "@bridge/events";

export type LibraryKind = "deal" | "board" | "table" | "play" | "drill" | "puzzle";

/** Instance scoping (0022): every artifact belongs to exactly one scope. */
export type ScopeLevel = "user" | "program" | "org";

/** Copy provenance (0022): content crosses scopes only by being copied. */
export interface SourceRef {
  /** How the copy arrived. `shared` = admin distribution (untracked). */
  kind: "assigned" | "shared" | "embedded" | "installed";
  /** The source entry. */
  entryId: string;
  programId?: string;
  orgId?: string;
}

/**
 * Scope filter for list reads (org scoping Phase 0; instance scoping 0022).
 * When a field is provided, only records stamped with the SAME value match —
 * legacy records without a stamp are excluded (production rows are
 * backfilled by migrations 0019/0022).
 */
export interface ScopeFilter {
  programOrganizationId?: string;
  createdBy?: string;
  scopeLevel?: ScopeLevel;
  nexusProgramId?: string;
}

export function matchesScope(
  rec: {
    programOrganizationId?: string;
    createdBy: string;
    scopeLevel?: ScopeLevel;
    nexusProgramId?: string;
  },
  filter?: ScopeFilter,
): boolean {
  if (!filter) return true;
  if (
    filter.programOrganizationId !== undefined &&
    rec.programOrganizationId !== filter.programOrganizationId
  )
    return false;
  if (filter.createdBy !== undefined && rec.createdBy !== filter.createdBy) return false;
  if (filter.scopeLevel !== undefined && rec.scopeLevel !== filter.scopeLevel) return false;
  if (filter.nexusProgramId !== undefined && rec.nexusProgramId !== filter.nexusProgramId)
    return false;
  return true;
}

export const LIBRARY_KINDS: readonly LibraryKind[] = [
  "deal",
  "board",
  "table",
  "play",
  "drill",
  "puzzle",
];

/** A saved seat for `table` entries — the lineup, not a live snapshot. */
export interface LibrarySeatRef {
  label: string;
  playerId?: string;
  human?: boolean;
}

export interface LibraryEntry {
  entryId: string;
  kind: LibraryKind;
  name: string;
  notes?: string;
  tags: string[];

  // Card layers (deal ⊂ board ⊂ play):
  hands?: Record<Seat, Card[]>;
  dealer?: Seat;
  vul?: Vul;
  auction?: { seat: Seat; call: Call }[];
  play?: { seat: Seat; card: Card }[];
  /** Display-only denormalizations for list views. */
  contractLabel?: string;
  resultLabel?: string;

  // `table` entries: which KB the lineup plays on, and who sits where.
  kbId?: string;
  seats?: Record<Seat, LibrarySeatRef>;

  // `drill` entries (bidding regression, Pillar D): the auction-so-far lives in
  // `auction`, the hand-to-test in `hands` (only the acting seat is needed), and
  // `expectedCalls` lists the acceptable engine answers. `notes` carries the
  // authoring note. Additive jsonb fields — no migration; old entries lack them.
  expectedCalls?: Call[];

  origin: "recorded" | "imported" | "authored";
  sourceSessionId?: string;
  importFileName?: string;
  createdBy: string;
  createdAt: string;
  /** Org the entry was created in (0019 scoping). Additive jsonb field. */
  programOrganizationId?: string;
  /** Which instance owns this entry (0022): the creator's personal shelf, the
   *  program's shelf, or the org's. */
  scopeLevel?: ScopeLevel;
  /** The REAL Nexus program uuid partition (0022). */
  nexusProgramId?: string;
  /** Set on copies: where this entry came from and how (0022). */
  sourceRef?: SourceRef;
}

/** A curated, mixed-kind grouping of entries (library-core "collection") —
 *  stored host-side like entries: jsonb-primary with scope columns. */
export interface LibraryCollectionRow {
  collectionId: string;
  name: string;
  description?: string;
  itemIds: string[];
  createdBy: string;
  createdAt: string;
  programOrganizationId?: string;
  nexusProgramId?: string;
  scopeLevel?: ScopeLevel;
}

export interface LibraryStoreData {
  entries: LibraryEntry[];
  collections?: LibraryCollectionRow[];
}

export interface LibraryStore {
  putEntry(entry: LibraryEntry): Promise<void>;
  getEntry(entryId: string): Promise<LibraryEntry | null>;
  listEntries(kind?: LibraryKind, filter?: ScopeFilter): Promise<LibraryEntry[]>;
  deleteEntry(entryId: string): Promise<void>;
  putCollection(row: LibraryCollectionRow): Promise<void>;
  getCollection(collectionId: string): Promise<LibraryCollectionRow | null>;
  listCollections(filter?: ScopeFilter): Promise<LibraryCollectionRow[]>;
  deleteCollection(collectionId: string): Promise<void>;
}

export class InMemoryLibraryStore implements LibraryStore {
  constructor(protected data: LibraryStoreData = { entries: [] }) {}
  protected persist(): void {}
  async putEntry(entry: LibraryEntry) {
    const i = this.data.entries.findIndex((e) => e.entryId === entry.entryId);
    if (i >= 0) this.data.entries[i] = entry;
    else this.data.entries.push(entry);
    this.persist();
  }
  async getEntry(entryId: string) {
    return this.data.entries.find((e) => e.entryId === entryId) ?? null;
  }
  async listEntries(kind?: LibraryKind, filter?: ScopeFilter) {
    return this.data.entries
      .filter((e) => (!kind || e.kind === kind) && matchesScope(e, filter))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async deleteEntry(entryId: string) {
    this.data.entries = this.data.entries.filter((e) => e.entryId !== entryId);
    this.persist();
  }
  async putCollection(row: LibraryCollectionRow) {
    const cols = (this.data.collections ??= []);
    const i = cols.findIndex((c) => c.collectionId === row.collectionId);
    if (i >= 0) cols[i] = row;
    else cols.push(row);
    this.persist();
  }
  async getCollection(collectionId: string) {
    return (this.data.collections ?? []).find((c) => c.collectionId === collectionId) ?? null;
  }
  async listCollections(filter?: ScopeFilter) {
    return (this.data.collections ?? [])
      .filter((c) => matchesScope({ ...c, createdBy: c.createdBy }, filter))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async deleteCollection(collectionId: string) {
    this.data.collections = (this.data.collections ?? []).filter(
      (c) => c.collectionId !== collectionId,
    );
    this.persist();
  }
}
