// The fellows' library: saved snapshots of table artifacts. Definitions
// (owner, 2026-07-16): a DEAL is a card distribution; a BOARD is a deal +
// dealer + vulnerability; an AUCTION is an ordered call sequence; a PLAY is
// an ordered card sequence. Entries layer those shapes progressively —
// a `play` entry carries the board it was played on and its auction, so any
// entry can be re-dealt to a table. `table` entries save a seat lineup
// instead. `drill`/`puzzle` are reserved kinds (no functionality yet).

import type { Call, Card, Seat, Vul } from "@bridge/events";

export type LibraryKind =
  | "deal"
  | "board"
  | "table"
  | "play"
  | "drill"
  | "puzzle"
  | "challenge";

/**
 * One board of a saved challenge — enough to deal it again exactly.
 *
 * Declared structurally rather than imported from `@bridge/challenges`: this
 * package has never depended on that one, and a library entry is a SNAPSHOT.
 * A challenge's own type may gain fields, change defaults, or drop them; an
 * entry saved last year must keep meaning what it meant when it was saved.
 */
export interface LibraryChallengeBoard {
  boardNo: number;
  pack: Record<Seat, Card[]>;
  dealer: Seat;
  vul: Vul;
  humanSeat: Seat;
}

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
 * When a field is provided, only records stamped with the SAME value match.
 * EXCEPTION — `nexusProgramId`: a record whose program stamp is NULL/absent is
 * pre-0022 and ORG-scoped ("null program id = scope by org only"). 0022's
 * program backfill only stamped the Life-in-AI org, so seed-org rows keep a null
 * nexus_program_id; they must still surface for a program-partitioned read
 * within their org, or a reviewer whose principal carries a real program uuid
 * would see an empty shelf. Org/owner/scopeLevel stamps ARE backfilled and match
 * exactly.
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
  if (
    filter.nexusProgramId !== undefined &&
    rec.nexusProgramId != null && // null/absent = org-scoped (pre-0022), matches any program in the org
    rec.nexusProgramId !== filter.nexusProgramId
  )
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

  // `challenge` entries: a whole challenge, kept so it can be found and run
  // again. The BOARDS are the substance — without its pack a challenge is a
  // title — and the format and scoring are what make replaying it the same
  // exercise. Additive jsonb, like every field above: an older entry has none
  // of this and is still a valid entry of some other kind.
  challengeBoards?: LibraryChallengeBoard[];
  challengeFormat?: "full" | "bidding-only";
  challengeScoring?: string;
  /** How many boards, for the shelf row — a DRAFT has seeds, not packs yet. */
  challengeBoardCount?: number;
  /**
   * When the entry last changed, for shelves that order by work rather than by
   * birth (a club's draft shelf). Additive: an entry that has never been
   * re-saved has none, and readers fall back to createdAt.
   */
  updatedAt?: string;
  /**
   * `draft` = built but not published; `published` = a live challenge exists.
   *
   * One entry spans both: a draft is promoted in place when it is published,
   * so the library holds one row for the whole life of the thing rather than a
   * row per moment in it (owner, 2026-08-14).
   */
  challengeStatus?: "draft" | "published";
  /**
   * The creator's whole work-in-progress, verbatim, as JSON.
   *
   * A string and not a typed field on purpose. The draft's shape belongs to the
   * wizard in the app, which this package cannot import and should not mirror —
   * and the app already owns a validator that tolerates older shapes ("a draft
   * that predates the format option is not an error"). Storing the text and
   * re-validating on the way out means an entry saved before a field existed
   * still opens, which is the entire point of being able to park work.
   */
  challengeDraftJson?: string;
  /** The challenge this was saved from or published into, if it still exists. */
  sourceChallengeId?: string;

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
