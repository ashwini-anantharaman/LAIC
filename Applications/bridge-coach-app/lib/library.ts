// The Library — native client for the bridge platform's library routes
// (M3c of the webview→native migration). Shelves + designated collections
// arrive as ONE cached read model (they render together); playing an entry
// and authoring a deal are actions returning what the screen navigates on.
//
// Items come in the library component's GENERIC envelope — the app, like
// every other consumer, never learns bridge's storage shapes beyond the
// content fields it renders.

import { bridgeRequest } from "./bridge-api";
import { createBridgeCache } from "./bridge-cache";
import type { Seat } from "./plays";

export type LibraryShelfKind = "board" | "deal" | "table" | "play" | "drill" | "puzzle";

/** The content fields the app renders — a subset of the bridge content kind. */
export type LibraryItemContent = {
  hands?: unknown;
  dealer?: string;
  vul?: string;
  auction?: unknown[];
  play?: unknown[];
  contractLabel?: string;
  resultLabel?: string;
  kbId?: string;
  seats?: Partial<Record<Seat, { label?: string; human?: boolean }>>;
};

export type LibraryItem = {
  id: string;
  kind: string;
  name: string;
  notes?: string;
  createdAt: string;
  content: LibraryItemContent;
};

export type LibraryCollectionRef = {
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
};

export type LibraryModel = {
  items: LibraryItem[];
  collections: LibraryCollectionRef[];
};

// ── The shelves + collections read model, cached ────────────────────────────

const library = createBridgeCache<LibraryModel>();

function libraryKey(token: string, programId: string, view: string): string {
  return `${token}::${programId}::library::${view}`;
}

export function peekLibrary(
  token: string,
  programId: string,
  view: "mine" | "program",
): LibraryModel | null {
  return library.peek(libraryKey(token, programId, view));
}

export function refreshLibrary(
  token: string,
  programId: string,
  view: "mine" | "program",
): Promise<LibraryModel> {
  return library.refresh(libraryKey(token, programId, view), async () => {
    const [shelves, collections] = await Promise.all([
      bridgeRequest<{ items: LibraryItem[] }>(`/api/library?view=${view}`, {
        token,
        programId,
      }),
      bridgeRequest<{ collections: LibraryCollectionRef[] }>(
        "/api/bridge/library/collections",
        { token, programId },
      ).catch(() => ({ collections: [] as LibraryCollectionRef[] })),
    ]);
    return { items: shelves.items, collections: collections.collections };
  });
}

export function subscribeToLibrary(notify: (value: LibraryModel) => void): () => void {
  return library.subscribe((_key, value) => notify(value));
}

// ── One collection ───────────────────────────────────────────────────────────

export type CollectionDetail = {
  collection: { id: string; name: string; description: string | null };
  items: LibraryItem[];
};

const collectionCache = createBridgeCache<CollectionDetail>();

export function peekCollection(
  token: string,
  programId: string,
  collectionId: string,
): CollectionDetail | null {
  return collectionCache.peek(`${token}::${programId}::col::${collectionId}`);
}

export function refreshCollection(
  token: string,
  programId: string,
  collectionId: string,
): Promise<CollectionDetail> {
  return collectionCache.refresh(`${token}::${programId}::col::${collectionId}`, () =>
    bridgeRequest<CollectionDetail>(
      `/api/bridge/library/collections/${encodeURIComponent(collectionId)}`,
      { token, programId },
    ),
  );
}

// ── Actions ──────────────────────────────────────────────────────────────────

/** Put a saved entry on a table. Mode mirrors the row's verb: Play a board/
 *  pack, Resume a saved play, Start a table lineup. → the session to open. */
export function playLibraryEntry(
  token: string,
  programId: string,
  entryId: string,
  mode: "play" | "resume" | "table",
): Promise<{ sessionId: string }> {
  return bridgeRequest(
    `/api/bridge/library/entries/${encodeURIComponent(entryId)}/play`,
    { token, programId, method: "POST", body: { mode } },
  );
}

/** Deal a fresh board immediately — you South against the house lineup —
 *  and get back the session to open. 409 `no_lineup` means no knowledge base
 *  compiles yet: the caller sends the player to the library, exactly as the
 *  old /m/quick-play redirect did. */
export function quickPlay(
  token: string,
  programId: string,
  dealer?: Seat,
): Promise<{ sessionId: string }> {
  return bridgeRequest("/api/bridge/quick-play", {
    token,
    programId,
    method: "POST",
    body: dealer ? { dealer } : {},
  });
}

/** The deal editor's save. Hands travel in the editor's serialized form
 *  (♠.♥.♦.♣ dot-joined, e.g. "AKQ2.987.T4.QJ32"); the server re-validates
 *  authoritatively and answers with the action's exact copy on failure. */
export function createDeal(
  token: string,
  programId: string,
  input: {
    kind: "board" | "deal";
    name?: string;
    dealer?: Seat;
    vul?: string;
    notes?: string;
    hands: Record<Seat, string>;
  },
): Promise<{ entryId: string }> {
  return bridgeRequest("/api/bridge/library/deals", {
    token,
    programId,
    method: "POST",
    body: input,
  });
}
