// JSON-file-backed dev store (server-side only — imports node:fs).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { InMemoryProfileStore, type ProfileStoreData } from "./index";

export class JsonFileProfileStore extends InMemoryProfileStore {
  constructor(private readonly filePath: string) {
    super(
      existsSync(filePath)
        ? (JSON.parse(readFileSync(filePath, "utf8")) as ProfileStoreData)
        : undefined,
    );
    if (!existsSync(filePath)) this.persist();
  }
  protected override persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}
