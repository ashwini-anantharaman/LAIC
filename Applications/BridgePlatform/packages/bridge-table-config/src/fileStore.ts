// JSON-file-backed dev table-config store (server-side only).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { InMemoryTableConfigStore, type TableConfigStoreData } from "./index";

export class JsonFileTableConfigStore extends InMemoryTableConfigStore {
  constructor(private readonly filePath: string) {
    super(
      existsSync(filePath)
        ? { entries: {}, ...(JSON.parse(readFileSync(filePath, "utf8")) as Partial<TableConfigStoreData>) }
        : { entries: {} },
    );
    if (!existsSync(filePath)) this.persist();
  }
  protected override persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}
