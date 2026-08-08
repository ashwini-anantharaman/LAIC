// JSON-file-backed dev challenge store (server-side only). All six record
// kinds share one file, mirroring JsonFileTableConfigStore / JsonFileSessionStore.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  emptyChallengeStoreData,
  InMemoryChallengeStore,
  type ChallengeStoreData,
} from "./index";

export class JsonFileChallengeStore extends InMemoryChallengeStore {
  constructor(private readonly filePath: string) {
    super(
      existsSync(filePath)
        ? {
            ...emptyChallengeStoreData(),
            ...(JSON.parse(readFileSync(filePath, "utf8")) as Partial<ChallengeStoreData>),
          }
        : emptyChallengeStoreData(),
    );
    if (!existsSync(filePath)) this.persist();
  }
  protected override persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}
