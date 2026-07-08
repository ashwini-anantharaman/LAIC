// JSON-file-backed dev store (server-side only — imports node:fs). Used by
// bridge-web's admin area until the Postgres store lands. Mirrors
// TheNexusPlatform backend's local-store fallback pattern.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { emptyStoreData, InMemoryKnowledgeStore, type KnowledgeStoreData } from "./store";

export class JsonFileKnowledgeStore extends InMemoryKnowledgeStore {
  constructor(
    private readonly filePath: string,
    seed?: Partial<KnowledgeStoreData>,
  ) {
    super(
      existsSync(filePath)
        ? (JSON.parse(readFileSync(filePath, "utf8")) as KnowledgeStoreData)
        : { ...emptyStoreData(), ...seed },
    );
    if (!existsSync(filePath)) this.persist();
  }

  protected override persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}
