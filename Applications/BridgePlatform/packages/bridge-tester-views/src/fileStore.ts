// JSON-file-backed dev tester-views store (server-side only).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { InMemoryTesterViewStore, type TesterViewStoreData } from "./index";

export class JsonFileTesterViewStore extends InMemoryTesterViewStore {
  constructor(private readonly filePath: string) {
    super(
      existsSync(filePath)
        ? { entries: {}, ...(JSON.parse(readFileSync(filePath, "utf8")) as Partial<TesterViewStoreData>) }
        : { entries: {} },
    );
    if (!existsSync(filePath)) this.persist();
  }
  protected override persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}
