// JSON-file-backed dev session store (server-side only).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { InMemorySessionStore, type SessionStoreData } from "./index";

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
