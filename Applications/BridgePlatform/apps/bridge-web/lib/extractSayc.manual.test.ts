// MANUAL RUNNER (not part of the suite): drives the real SAYC extraction
// against the SHARED Supabase from local (no serverless timeout), using the
// live Claude extractor. Enable with RUN_SAYC_EXTRACTION=smoke|full.

import { chunkDocument } from "@bridge/kb";
import { PgKbStore } from "@bridge/pg-stores";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const MODE = process.env.RUN_SAYC_EXTRACTION;

describe.skipIf(!MODE)("SAYC extraction (manual)", () => {
  it("runs sections through the live extractor", { timeout: 3_600_000 }, async () => {
    const env = Object.fromEntries(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"), "utf8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
    );
    process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
    const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const store = new PgKbStore(db);
    const { KbService, runExtraction } = await import("@bridge/kb");
    const { createClaudeExtractor } = await import("./extraction");
    const service = new KbService(store);

    const kbId = "kb_mrldk80k001";
    const sourceId = "src_sayc_booklet";
    const doc = await store.getDocument(sourceId);
    const passages = await store.listPassages(sourceId);
    const { sections } = chunkDocument(doc!.text);
    const byOrdinal = new Map(passages.map((p) => [p.ordinal, p]));

    // Skip sections already extracted (re-runs stay incremental).
    const done = new Set(
      (await store.listJobsForKb(kbId))
        .filter((j) => j.status === "completed")
        .flatMap((j) => j.passageOrdinals),
    );
    let todo = sections.filter((s) => !s.passageOrdinals.every((o) => done.has(o)));
    if (MODE === "smoke") todo = todo.slice(0, 3);
    console.log(`sections total=${sections.length} todo=${todo.length} mode=${MODE}`);

    const jobs = await runExtraction(store, service, createClaudeExtractor(), {
      kbId,
      sourceId,
      requestedBy: "user_reviewer_rhea",
      sections: todo.map((s) => ({
        anchor: s.anchor,
        passages: s.passageOrdinals.map((o) => byOrdinal.get(o)!).filter(Boolean),
      })),
    });
    for (const job of jobs) {
      console.log(
        `[${job.status}] ${job.createdItemIds.length} items, ${job.failures.length} failures`,
        job.failures.map((f) => f.anchor).join("; ").slice(0, 160),
      );
    }
    expect(jobs.some((j) => j.status === "completed")).toBe(true);
  });
});
