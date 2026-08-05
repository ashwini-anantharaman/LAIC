// AccessStore over 0019 (jsonb-primary).

import type { AccessCatalogue, AccessStore } from "@bridge/access";
import type { SupabaseClient } from "@supabase/supabase-js";
import { check } from "./client";

/* eslint-disable @typescript-eslint/no-explicit-any */

export class PgAccessStore implements AccessStore {
  constructor(private readonly db: SupabaseClient) {}

  async getCatalogue(catalogueId: string) {
    const rows = check(
      await this.db
        .from("bridge_access_catalogue")
        .select("catalogue")
        .eq("catalogue_id", catalogueId),
      "access.get",
    );
    return rows.length ? ((rows[0] as any).catalogue as AccessCatalogue) : null;
  }
  async putCatalogue(catalogue: AccessCatalogue) {
    check(
      await this.db.from("bridge_access_catalogue").upsert(
        {
          catalogue_id: catalogue.catalogueId,
          program_organization_id: catalogue.programOrganizationId ?? null,
          catalogue,
          updated_by: catalogue.updatedBy ?? null,
          updated_at: catalogue.updatedAt ?? new Date().toISOString(),
        },
        { onConflict: "catalogue_id" },
      ),
      "access.put",
    );
  }
}
