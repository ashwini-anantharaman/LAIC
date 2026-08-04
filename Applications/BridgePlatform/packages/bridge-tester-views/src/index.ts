// @bridge/tester-views — saved views for the component tester. A saved view is
// just a named snapshot of the tester's URL-state (the whole grid is encoded in
// the query string, so the config IS that param bag). Client-safe read model +
// types + the InMemory store; the JSON-file store lives in ./fileStore and the
// Postgres store in @bridge/pg-stores. Mirrors @bridge/table-config's seam.
//
// NO node:fs here — this module is imported by the client tester shell (it
// renders the saved-view list), so it must stay browser-safe.

/** The tester's URL-state object — the exact search-param bag the page reads. */
export type TesterViewConfig = Record<string, string>;

/** One persisted saved view. */
export interface TesterView {
  id: string;
  name: string;
  /** The URL-state the view reopens to. */
  config: TesterViewConfig;
  createdBy: string;
  createdAt: string;
}

export interface TesterViewStore {
  /** Newest first. */
  list(): Promise<TesterView[]>;
  put(view: TesterView): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface TesterViewStoreData {
  entries: Record<string, TesterView>;
}

export class InMemoryTesterViewStore implements TesterViewStore {
  constructor(protected data: TesterViewStoreData = { entries: {} }) {}
  protected persist(): void {}

  async list(): Promise<TesterView[]> {
    return Object.values(this.data.entries).sort((a, b) =>
      a.createdAt === b.createdAt ? b.id.localeCompare(a.id) : b.createdAt.localeCompare(a.createdAt),
    );
  }
  async put(view: TesterView): Promise<void> {
    this.data.entries[view.id] = view;
    this.persist();
  }
  async delete(id: string): Promise<void> {
    delete this.data.entries[id];
    this.persist();
  }
}
