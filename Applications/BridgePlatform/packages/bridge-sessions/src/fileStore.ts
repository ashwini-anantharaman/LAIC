// JSON-file-backed dev session + library stores (server-side only).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { InMemorySessionStore, type SessionStoreData } from "./index";
import { InMemoryLibraryStore, type LibraryStoreData } from "./library";

export class JsonFileSessionStore extends InMemorySessionStore {
  constructor(private readonly filePath: string) {
    super(
      existsSync(filePath)
        ? { sessions: [], ...(JSON.parse(readFileSync(filePath, "utf8")) as Partial<SessionStoreData>) }
        : { sessions: [] },
    );
    if (!existsSync(filePath)) this.persist();
  }
  protected override persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}

export class JsonFileLibraryStore extends InMemoryLibraryStore {
  constructor(private readonly filePath: string) {
    super(
      existsSync(filePath)
        ? { entries: [], ...(JSON.parse(readFileSync(filePath, "utf8")) as Partial<LibraryStoreData>) }
        : { entries: [] },
    );
    if (!existsSync(filePath)) this.persist();
  }
  protected override persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}
