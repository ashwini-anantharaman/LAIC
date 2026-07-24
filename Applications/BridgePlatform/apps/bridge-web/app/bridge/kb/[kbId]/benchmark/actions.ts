"use server";

// BEN Bidding Benchmark actions (Pillar B). Discipline mirrors source-audit:
// one click = one serverless invocation. A benchmark RUN is created against
// the KB's live compile (pinned as compileRef); each "Run next batch" click
// plays ~25 deals through BEN + our decider, then PERSISTS the cursor +
// appended divergences + stats. Resumability comes entirely from the run
// record — the page recomputes "remaining" from cursor vs params. Markings are
// a separate mutable entity. BenClient + the store never touch a client bundle.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import {
  benAvailable,
  createBenClient,
  DEFAULT_BATCH,
  MAX_BATCH,
  runBenchmarkBatch,
} from "@/lib/benchmark";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";

const kbPath = (kbId: string, rest = "") => `/bridge/kb/${kbId}${rest}`;

/** Nitin's defaults. */
const DEFAULTS = { maxDeals: 1000, maxBids: 4, competition: false, maxUniqueSequences: 100 };

const clampInt = (value: FormDataEntryValue | null, fallback: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.floor(Number(value) || fallback)));

export async function createBenchmarkRunAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  await ensureSeeds();
  const kbId = String(formData.get("kbId"));

  const compiled = await kbService().liveCompile(kbId);
  if (!compiled) throw new Error("That knowledge base has no live compile yet");

  const packId = String(formData.get("packId") ?? "").trim() || undefined;
  const params = {
    maxDeals: clampInt(formData.get("maxDeals"), DEFAULTS.maxDeals, 1, 100_000),
    maxBids: clampInt(formData.get("maxBids"), DEFAULTS.maxBids, 1, 40),
    competition: formData.get("competition") === "on",
    maxUniqueSequences: clampInt(
      formData.get("maxUniqueSequences"),
      DEFAULTS.maxUniqueSequences,
      1,
      100_000,
    ),
    packId,
    seedStart: clampInt(formData.get("seedStart"), 0, 0, 1_000_000),
  };

  const run = await kbService().createBenchmarkRun({
    kbId,
    params,
    compileRef: compiled.compileId,
    createdBy: context.nexusUserId,
  });
  await audit(context, "kb.extraction.run", "kb", kbId, {
    benchmark: "create",
    runId: run.runId,
    params,
  });
  revalidatePath(kbPath(kbId), "layout");
  redirect(kbPath(kbId, `/benchmark?run=${run.runId}`));
}

export async function runBenchmarkBatchAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  await ensureSeeds();
  const kbId = String(formData.get("kbId"));
  const runId = String(formData.get("runId"));
  if (!benAvailable())
    throw new Error("BEN benchmark needs BEN_ENDPOINT configured on the server");

  const batchSize = clampInt(formData.get("batchSize"), DEFAULT_BATCH, 1, MAX_BATCH);

  const run = await kbService().getBenchmarkRun(runId);
  if (!run) throw new Error(`No benchmark run ${runId}`);
  if (run.status === "complete")
    redirect(kbPath(kbId, `/benchmark?run=${runId}`));

  // The run is pinned to a compile — always play against THAT artifact.
  const compiled = await kbStore().getCompile(run.compileRef);
  if (!compiled) throw new Error("The compile this run was pinned to is gone");

  const client = createBenClient();
  const result = await runBenchmarkBatch({ run, compiled, client, batchSize });
  await kbService().advanceBenchmarkRun({
    runId,
    cursor: result.cursor,
    appendDivergences: result.appendDivergences,
    stats: result.stats,
    complete: result.complete,
  });
  await audit(context, "kb.extraction.run", "kb", kbId, {
    benchmark: "batch",
    runId,
    dealsThisBatch: result.dealsThisBatch,
    divergences: result.appendDivergences.length,
  });
  revalidatePath(kbPath(kbId), "layout");
  redirect(kbPath(kbId, `/benchmark?run=${runId}&batched=${result.dealsThisBatch}`));
}

export async function markSystemDifferenceAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.review");
  const kbId = String(formData.get("kbId"));
  const signature = String(formData.get("signature"));
  const note = String(formData.get("note") ?? "").trim() || undefined;
  const runId = String(formData.get("runId") ?? "").trim();
  const marking = await kbService().putBenchmarkMarking({
    kbId,
    signature,
    note,
    createdBy: context.nexusUserId,
  });
  await audit(context, "kb.suggestion.change", "kb_benchmark_marking", marking.markingId, {
    kbId,
    signature,
    verdict: "system_difference",
  });
  revalidatePath(kbPath(kbId, "/benchmark"));
  if (runId) redirect(kbPath(kbId, `/benchmark?run=${runId}`));
}
