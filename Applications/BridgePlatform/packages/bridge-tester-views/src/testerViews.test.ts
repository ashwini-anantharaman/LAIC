// Tester-views store behaviours: newest-first listing, put/get/delete, and
// JSON-file persistence across two instances.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { InMemoryTesterViewStore, type TesterView } from "./index";
import { JsonFileTesterViewStore } from "./fileStore";

const view = (id: string, createdAt: string): TesterView => ({
  id,
  name: `View ${id}`,
  config: { comp: "BidColumns", axis: "role", moment: "midPlay" },
  createdBy: "user_reviewer_rhea",
  createdAt,
});

describe("InMemoryTesterViewStore", () => {
  it("lists newest first and round-trips put/delete", async () => {
    const store = new InMemoryTesterViewStore();
    expect(await store.list()).toEqual([]);

    await store.put(view("tv_a", "2026-08-04T10:00:00.000Z"));
    await store.put(view("tv_b", "2026-08-04T12:00:00.000Z"));
    await store.put(view("tv_c", "2026-08-04T11:00:00.000Z"));

    expect((await store.list()).map((v) => v.id)).toEqual(["tv_b", "tv_c", "tv_a"]);

    await store.delete("tv_b");
    expect((await store.list()).map((v) => v.id)).toEqual(["tv_c", "tv_a"]);
  });

  it("put overwrites an existing id", async () => {
    const store = new InMemoryTesterViewStore();
    await store.put(view("tv_a", "2026-08-04T10:00:00.000Z"));
    await store.put({ ...view("tv_a", "2026-08-04T10:00:00.000Z"), name: "Renamed" });
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe("Renamed");
  });
});

describe("JsonFileTesterViewStore", () => {
  it("persists across two instances", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "bridge-tester-views-")), "tester-views-store.json");
    await new JsonFileTesterViewStore(file).put(view("tv_x", "2026-08-04T09:00:00.000Z"));
    const reopened = new JsonFileTesterViewStore(file);
    expect((await reopened.list()).map((v) => v.id)).toEqual(["tv_x"]);
  });
});
