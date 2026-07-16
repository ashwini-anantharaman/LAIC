// JSON-file-backed dev store (server-side only — imports node:fs). The
// offline-friendly STORE_BACKEND=file seam, same pattern as before the rework.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { emptyKbStoreData, InMemoryKbStore, type KbStoreData } from "./store";

export class JsonFileKbStore extends InMemoryKbStore {
  constructor(private readonly filePath: string) {
    super(
      existsSync(filePath)
        ? { ...emptyKbStoreData(), ...(JSON.parse(readFileSync(filePath, "utf8")) as Partial<KbStoreData>) }
        : emptyKbStoreData(),
    );
    if (!existsSync(filePath)) this.persist();
  }

  protected override persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}
