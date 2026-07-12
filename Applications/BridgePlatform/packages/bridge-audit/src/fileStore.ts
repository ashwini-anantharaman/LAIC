// JSON-file-backed dev store (server-side only — imports node:fs).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { InMemoryAuditStore, type AuditStoreData } from "./index";

export class JsonFileAuditStore extends InMemoryAuditStore {
  constructor(private readonly filePath: string) {
    super(
      existsSync(filePath)
        ? (JSON.parse(readFileSync(filePath, "utf8")) as AuditStoreData)
        : undefined,
    );
    if (!existsSync(filePath)) this.persist();
  }
  protected override persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}
