// JSON-file-backed dev access store (server-side only).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { InMemoryAccessStore, type AccessStoreData } from "./index";

export class JsonFileAccessStore extends InMemoryAccessStore {
  constructor(private readonly filePath: string) {
    super(
      existsSync(filePath)
        ? { catalogues: [], ...(JSON.parse(readFileSync(filePath, "utf8")) as Partial<AccessStoreData>) }
        : { catalogues: [] },
    );
    if (!existsSync(filePath)) this.persist();
  }
  protected override persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}
