// JSON-file-backed dev store (server-side only — imports node:fs).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { InMemoryProgressStore, type ProgressStoreData } from "./index";

export class JsonFileProgressStore extends InMemoryProgressStore {
  constructor(private readonly filePath: string) {
    super(
      existsSync(filePath)
        ? (JSON.parse(readFileSync(filePath, "utf8")) as ProgressStoreData)
        : undefined,
    );
    if (!existsSync(filePath)) this.persist();
  }
  protected override persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}
