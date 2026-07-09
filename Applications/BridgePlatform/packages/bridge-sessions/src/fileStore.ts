// JSON-file-backed dev store (server-side only — imports node:fs).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { emptySessionData, InMemorySessionStore, type SessionStoreData } from "./store";

export class JsonFileSessionStore extends InMemorySessionStore {
  constructor(private readonly filePath: string) {
    super(
      existsSync(filePath)
        ? (JSON.parse(readFileSync(filePath, "utf8")) as SessionStoreData)
        : emptySessionData(),
    );
    if (!existsSync(filePath)) this.persist();
  }

  protected override persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}
