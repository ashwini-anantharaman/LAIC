// The fellows' library: saved snapshots of table artifacts. Definitions
// (owner, 2026-07-16): a DEAL is a card distribution; a BOARD is a deal +
// dealer + vulnerability; an AUCTION is an ordered call sequence; a PLAY is
// an ordered card sequence. Entries layer those shapes progressively —
// a `play` entry carries the board it was played on and its auction, so any
// entry can be re-dealt to a table. `table` entries save a seat lineup
// instead. `drill`/`puzzle` are reserved kinds (no functionality yet).

import type { Call, Card, Seat, Vul } from "@bridge/events";

export type LibraryKind = "deal" | "board" | "table" | "play" | "drill" | "puzzle";

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

  origin: "recorded" | "imported" | "authored";
  sourceSessionId?: string;
  importFileName?: string;
  createdBy: string;
  createdAt: string;
}

export interface LibraryStoreData {
  entries: LibraryEntry[];
}

export interface LibraryStore {
  putEntry(entry: LibraryEntry): Promise<void>;
  getEntry(entryId: string): Promise<LibraryEntry | null>;
  listEntries(kind?: LibraryKind): Promise<LibraryEntry[]>;
  deleteEntry(entryId: string): Promise<void>;
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
  async listEntries(kind?: LibraryKind) {
    return this.data.entries
      .filter((e) => !kind || e.kind === kind)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async deleteEntry(entryId: string) {
    this.data.entries = this.data.entries.filter((e) => e.entryId !== entryId);
    this.persist();
  }
}
