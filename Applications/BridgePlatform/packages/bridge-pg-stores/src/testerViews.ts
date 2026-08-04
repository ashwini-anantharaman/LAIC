// TesterViewStore over 0021 (jsonb-primary): one row per saved view, the whole
// TesterView in `view`. Mirrors PgTableConfigStore's shape.

import type { TesterView, TesterViewStore } from "@bridge/tester-views";
import type { SupabaseClient } from "@supabase/supabase-js";
import { check } from "./client";

/* eslint-disable @typescript-eslint/no-explicit-any */

export class PgTesterViewStore implements TesterViewStore {
  constructor(private readonly db: SupabaseClient) {}

  async list(): Promise<TesterView[]> {
    const rows = check(
      await this.db
        .from("bridge_tester_views")
        .select("view")
        .order("created_at", { ascending: false }),
      "testerViews.list",
    );
    return (rows as any[]).map((r) => r.view as TesterView);
  }
  async put(view: TesterView): Promise<void> {
    check(
      await this.db.from("bridge_tester_views").upsert(
        { id: view.id, view, created_at: view.createdAt },
        { onConflict: "id" },
      ),
      "testerViews.put",
    );
  }
  async delete(id: string): Promise<void> {
    check(
      await this.db.from("bridge_tester_views").delete().eq("id", id),
      "testerViews.delete",
    );
  }
}
