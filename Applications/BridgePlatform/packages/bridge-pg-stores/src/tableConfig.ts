// TableConfigStore over 0020 (jsonb-primary): one row per user, the full
// TableAppearance in `config`.

import type { TableAppearance, TableConfigStore } from "@bridge/table-config";
import type { SupabaseClient } from "@supabase/supabase-js";
import { check } from "./client";

/* eslint-disable @typescript-eslint/no-explicit-any */

export class PgTableConfigStore implements TableConfigStore {
  constructor(private readonly db: SupabaseClient) {}

  async getForUser(userId: string) {
    const rows = check(
      await this.db.from("bridge_table_config").select("config").eq("user_id", userId),
      "tableConfig.get",
    );
    return rows.length ? ((rows[0] as any).config as TableAppearance) : null;
  }
  async putForUser(userId: string, appearance: TableAppearance) {
    check(
      await this.db.from("bridge_table_config").upsert(
        {
          user_id: userId,
          config: appearance,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      ),
      "tableConfig.put",
    );
  }
}
