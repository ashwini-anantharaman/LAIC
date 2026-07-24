// The BEN Bidding Benchmark tab (Pillar B) — Nitin's objective assessment.
// BEN bids seeded deals, our compiled rules bid the SAME deals, and the FIRST
// call that differs on each unique bidding sequence is recorded. A divergence a
// human marks "system difference" counts as a success. This page clones the
// source-audit discipline: a params form creates a run; each "Run next batch"
// click plays ~25 deals and persists progress into the append-only run record;
// the page recomputes everything from that record. BenClient + the store live
// entirely in server actions / server-only libs — never a client bundle.

import Link from "next/link";
import type { SettingValue } from "@bridge/config";
import { callLabel } from "@bridge/events";
import type { KbBenchmarkDivergence, KbBenchmarkRun } from "@bridge/kb";
import { becauseClause, buildRuleIndex } from "@/components/table/decisionText";
import { benAvailable, DEFAULT_BATCH, MAX_BATCH } from "@/lib/benchmark";
import { kbService, kbStore } from "@/lib/kb";
import { dealFindingBoardAction } from "../findings/actions";
import { createSuggestionAction } from "../../actions";
import {
  createBenchmarkRunAction,
  markSystemDifferenceAction,
  runBenchmarkBatchAction,
} from "./actions";

type Search = { run?: string; batched?: string };

/** The auction prefix as call glyphs, e.g. 1♣ · P · 1♠. */
function auctionGlyphs(auction: string): string {
  if (!auction) return "(opening bid)";
  return auction.split("-").map(callLabel).join(" · ");
}

function successRate(run: KbBenchmarkRun, markedSignatures: Set<string>): number | null {
  const seq = run.stats.sequences;
  if (seq === 0) return null;
  const marked = run.divergences.filter((d) => markedSignatures.has(d.signature)).length;
  return (run.stats.matches + marked) / seq;
}

const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);

export default async function BenchmarkPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string }>;
  searchParams: Promise<Search>;
}>) {
  const { kbId } = await params;
  const { run: runId, batched } = await searchParams;
  const base = `/bridge/kb/${kbId}`;
  const store = kbStore();

  // Benchmark storage may not be migrated yet on this backend (0018) — the
  // tab should say so instead of crashing, the 0015 library precedent.
  let storageReady = true;
  const [compiled, runs, markings] = await Promise.all([
    kbService().liveCompile(kbId),
    kbService()
      .listBenchmarkRunsForKb(kbId)
      .catch(() => {
        storageReady = false;
        return [];
      }),
    kbService()
      .listBenchmarkMarkingsForKb(kbId)
      .catch(() => [] as Awaited<ReturnType<ReturnType<typeof kbService>["listBenchmarkMarkingsForKb"]>>),
  ]);
  const markedSignatures = new Set(markings.map((m) => m.signature));
  const ready = benAvailable();

  const selected = runId ? runs.find((r) => r.runId === runId) ?? null : null;
  // The run plays against its PINNED compile, not the live one.
  const runCompiled = selected ? await store.getCompile(selected.compileRef) : null;
  const ruleIndex = runCompiled ? buildRuleIndex(runCompiled) : null;

  const packOptions = compiled?.packs ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">Benchmark</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">
          An objective assessment against <b>BEN</b> (a neural bridge engine). BEN bids seeded
          deals; this knowledge base bids the same deals; the first call that differs on each
          unique bidding sequence is recorded — with the rule we applied and BEN&apos;s
          explanation. A difference a reviewer marks a <b>system difference</b> counts as a
          success, so the score reflects real defects, not style.
        </p>
      </div>

      {batched !== undefined && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Ran a batch of {batched} deal(s).{" "}
          {selected && selected.status === "complete"
            ? "The run is complete."
            : "Click again to continue where it left off."}
        </p>
      )}

      {!storageReady && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-[color:var(--color-draft)]">
          Benchmark storage isn&apos;t migrated on this backend yet — apply{" "}
          <code>db/migrations/0018_benchmark.sql</code> (Supabase SQL editor), then reload.
        </p>
      )}

      {!ready && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-[color:var(--color-draft)]">
          BEN_ENDPOINT isn&apos;t configured on this server — the benchmark can&apos;t run until
          a reachable BEN service is set (see <code>scripts/ben/README.md</code>). Existing runs
          below are still viewable, and divergences remain markable.
        </p>
      )}

      {/* ---- create a run ------------------------------------------------- */}
      <section className="rounded-lg border border-neutral-200 p-5">
        <h2 className="text-sm font-medium">New benchmark run</h2>
        <p className="mb-3 mt-0.5 max-w-2xl text-sm text-neutral-500">
          A run is pinned to the current working compile and walks seeded deals from{" "}
          <code>seed start</code>. Nitin&apos;s defaults are pre-filled.
        </p>
        <form action={createBenchmarkRunAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="kbId" value={kbId} />
          <label className="text-xs">
            <span className="mb-0.5 block text-neutral-500">Max deals</span>
            <input type="number" name="maxDeals" min={1} defaultValue={1000} className="w-24 rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs">
            <span className="mb-0.5 block text-neutral-500">Max bids</span>
            <input type="number" name="maxBids" min={1} max={40} defaultValue={4} className="w-20 rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs">
            <span className="mb-0.5 block text-neutral-500">Max unique sequences</span>
            <input type="number" name="maxUniqueSequences" min={1} defaultValue={100} className="w-28 rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs">
            <span className="mb-0.5 block text-neutral-500">Seed start</span>
            <input type="number" name="seedStart" min={0} defaultValue={0} className="w-20 rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs">
            <span className="mb-0.5 block text-neutral-500">Knowledge set</span>
            <select name="packId" className="rounded border border-neutral-300 px-2 py-1.5 text-sm">
              <option value="">Whole KB</option>
              {packOptions.map((p) => (
                <option key={p.packId} value={p.packId}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" name="competition" className="h-3.5 w-3.5" />
            <span className="text-neutral-500">Allow competition</span>
          </label>
          <button
            type="submit"
            disabled={!compiled}
            className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Create run
          </button>
        </form>
      </section>

      {/* ---- run list ----------------------------------------------------- */}
      <section>
        <h2 className="mb-2 text-sm font-medium">
          Runs <span className="text-neutral-400">({runs.length})</span>
        </h2>
        {runs.length === 0 ? (
          <p className="rounded border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-500">
            No runs yet — create one above.
          </p>
        ) : (
          <ul className="space-y-2">
            {runs.map((r) => (
              <li
                key={r.runId}
                className={`rounded-lg border px-4 py-3 ${
                  r.runId === selected?.runId ? "border-emerald-300 bg-emerald-50/40" : "border-neutral-200 bg-[var(--card)]"
                }`}
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <Link href={`${base}/benchmark?run=${r.runId}`} className="font-medium text-emerald-800 hover:underline">
                    {r.createdAt.slice(0, 16).replace("T", " ")}
                  </Link>
                  <span className={r.status === "complete" ? "text-neutral-500" : "text-[color:var(--color-draft)]"}>
                    {r.status}
                  </span>
                  <span className="text-neutral-500">
                    {r.stats.sequences} sequences · {r.stats.matches} match ·{" "}
                    {r.divergences.length} diverge
                  </span>
                  <span className="ml-auto font-medium">
                    {pct(successRate(r, markedSignatures))} success
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-neutral-400">
                  maxDeals {r.params.maxDeals} · maxBids {r.params.maxBids} · maxUniqueSequences{" "}
                  {r.params.maxUniqueSequences} · competition {r.params.competition ? "on" : "off"}
                  {r.params.packId ? " · set-scoped" : " · whole KB"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- run detail --------------------------------------------------- */}
      {selected && (
        <RunDetail
          kbId={kbId}
          run={selected}
          ruleIndex={ruleIndex}
          defaults={runCompiled?.defaults ?? {}}
          markedSignatures={markedSignatures}
          boardPackId={selected.params.packId ?? packOptions[0]?.packId}
          ready={ready}
        />
      )}

      <p className="text-xs text-neutral-500">
        Runs execute wherever <code>BEN_ENDPOINT</code> is reachable. The recommended mode is
        local dev pointed at the shared store (<code>STORE_BACKEND=postgres</code>) so results
        persist for all fellows. See <code>scripts/ben/README.md</code> to run BEN.
      </p>
    </div>
  );
}

function RunDetail({
  kbId,
  run,
  ruleIndex,
  defaults,
  markedSignatures,
  boardPackId,
  ready,
}: Readonly<{
  kbId: string;
  run: KbBenchmarkRun;
  ruleIndex: ReturnType<typeof buildRuleIndex> | null;
  defaults: Record<string, SettingValue>;
  markedSignatures: Set<string>;
  boardPackId?: string;
  ready: boolean;
}>) {
  const base = `/bridge/kb/${kbId}`;
  const marked = run.divergences.filter((d) => markedSignatures.has(d.signature));
  const unmarked = run.divergences.filter((d) => !markedSignatures.has(d.signature));
  const rate =
    run.stats.sequences === 0
      ? null
      : (run.stats.matches + marked.length) / run.stats.sequences;

  // Missing-rule bucket: our call came from fallback/floor.
  const missing = unmarked.filter((d) => d.ourKind !== "matched");

  // Top failing rules: unmarked divergences where a real rule applied, by ruleId.
  const byRule = new Map<
    string,
    { count: number; label?: string; itemId?: string; itemTitle?: string }
  >();
  for (const d of unmarked) {
    if (d.ourKind !== "matched" || !d.ourRuleId) continue;
    const e = byRule.get(d.ourRuleId) ?? {
      count: 0,
      label: d.ourRuleLabel,
      itemId: d.ourItemId,
      itemTitle: d.ourItemTitle,
    };
    e.count++;
    byRule.set(d.ourRuleId, e);
  }
  const topFailing = [...byRule.entries()].sort((a, b) => b[1].count - a[1].count);

  // Missing-rule bucket grouped by auction prefix.
  const byPrefix = new Map<string, number>();
  for (const d of missing) byPrefix.set(d.auction, (byPrefix.get(d.auction) ?? 0) + 1);
  const missingByPrefix = [...byPrefix.entries()].sort((a, b) => b[1] - a[1]);

  const remainingSeeds = Math.max(0, run.params.maxDeals - (run.cursor.nextSeed - run.params.seedStart));
  const remainingSeqs = Math.max(0, run.params.maxUniqueSequences - run.stats.sequences);
  const done = run.status === "complete";

  const stat = (value: string | number, label: string) => (
    <div className="min-w-24">
      <p className="text-2xl font-medium leading-tight">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</p>
    </div>
  );

  return (
    <section className="space-y-5 rounded-lg border border-neutral-200 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">
          Run detail{" "}
          <span className="text-neutral-400">
            {run.createdAt.slice(0, 16).replace("T", " ")} · {run.status}
          </span>
        </h2>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-lg border border-neutral-200 bg-[var(--card)] px-5 py-4">
        {stat(run.stats.sequences, "sequences tested")}
        {stat(run.stats.matches, "matches")}
        {stat(marked.length, "marked system-diff")}
        {stat(unmarked.length, "failing")}
        {stat(missing.length, "missing rule")}
        {stat(pct(rate), "success rate")}
        {stat(run.stats.dealsSkippedDup, "dup deals skipped")}
      </div>

      {/* run next batch */}
      <form action={runBenchmarkBatchAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="kbId" value={kbId} />
        <input type="hidden" name="runId" value={run.runId} />
        <label className="text-xs">
          <span className="mb-0.5 block text-neutral-500">Deals this batch (max {MAX_BATCH})</span>
          <input
            type="number"
            name="batchSize"
            min={1}
            max={MAX_BATCH}
            defaultValue={DEFAULT_BATCH}
            className="w-24 rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={!ready || done}
          className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Run next batch (~{DEFAULT_BATCH} deals)
        </button>
        <span className="text-xs text-neutral-500">
          {done
            ? "Complete — a stop condition was reached."
            : `~${remainingSeeds} deals / ${remainingSeqs} sequences left before a stop condition.`}
        </span>
      </form>

      {/* top failing rules */}
      <div>
        <h3 className="mb-1 text-sm font-medium">
          Top failing rules <span className="text-neutral-400">({topFailing.length})</span>
        </h3>
        <p className="mb-2 max-w-2xl text-xs text-neutral-500">
          Rules that fired but produced a call BEN didn&apos;t — the most likely real defects,
          grouped by the rule that applied.
        </p>
        {topFailing.length === 0 ? (
          <p className="rounded border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-500">
            None — no fired rule diverged (unmarked).
          </p>
        ) : (
          <ul className="space-y-1">
            {topFailing.map(([ruleId, e]) => (
              <li key={ruleId} className="flex items-center gap-3 text-sm">
                <span className="font-medium">{e.count}×</span>
                <span>{e.label ?? ruleId}</span>
                {e.itemId && (
                  <Link href={`${base}/items/${e.itemId}`} className="text-emerald-800 hover:underline">
                    {e.itemTitle ?? e.itemId}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* missing rules */}
      <div>
        <h3 className="mb-1 text-sm font-medium">
          Missing rules <span className="text-neutral-400">({missing.length})</span>
        </h3>
        <p className="mb-2 max-w-2xl text-xs text-neutral-500">
          Divergences where our call came from a fallback or the engine floor — the auction had
          no rule to answer it. Grouped by the auction so far.
        </p>
        {missingByPrefix.length === 0 ? (
          <p className="rounded border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-500">
            None — every divergence had a rule fire.
          </p>
        ) : (
          <ul className="space-y-1">
            {missingByPrefix.map(([prefix, count]) => (
              <li key={prefix || "(open)"} className="flex items-center gap-3 text-sm">
                <span className="font-medium">{count}×</span>
                <span className="font-mono text-xs">{auctionGlyphs(prefix)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* divergence rows */}
      <div>
        <h3 className="mb-2 text-sm font-medium">
          Divergences <span className="text-neutral-400">({run.divergences.length})</span>
        </h3>
        <ul className="space-y-3">
          {run.divergences.map((d, i) => (
            <DivergenceRow
              key={`${d.signature}-${d.dealSeed}-${i}`}
              kbId={kbId}
              runId={run.runId}
              d={d}
              ruleIndex={ruleIndex}
              defaults={defaults}
              marked={markedSignatures.has(d.signature)}
              boardPackId={boardPackId}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function DivergenceRow({
  kbId,
  runId,
  d,
  ruleIndex,
  defaults,
  marked,
  boardPackId,
}: Readonly<{
  kbId: string;
  runId: string;
  d: KbBenchmarkDivergence;
  ruleIndex: ReturnType<typeof buildRuleIndex> | null;
  defaults: Record<string, SettingValue>;
  marked: boolean;
  boardPackId?: string;
}>) {
  const info = d.ourRuleId ? ruleIndex?.get(d.ourRuleId) : undefined;
  const topCandidates = d.benCandidates.slice(0, 3);
  const suggestionText =
    `[benchmark] On ${auctionGlyphs(d.auction)} (deal ${d.dealSeed}, dealer ${d.dealer}) ` +
    `we bid ${callLabel(d.ourCall)} (${d.ourBecause}) but BEN bid ${callLabel(d.benCall)}` +
    (topCandidates[0]?.explanation ? ` — BEN: ${topCandidates[0].explanation}` : "") +
    ".";

  return (
    <li className="rounded-lg border border-neutral-200 bg-[var(--card)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono text-xs text-neutral-500">{auctionGlyphs(d.auction)}</span>
        {marked && (
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500">
            system difference
          </span>
        )}
        <span className="ml-auto text-[11px] uppercase tracking-wide text-neutral-400">
          {d.ourKind}
        </span>
      </div>

      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div className="rounded border border-neutral-200 px-3 py-2">
          <p className="text-xs text-neutral-400">Ours</p>
          <p className="text-lg font-medium">{callLabel(d.ourCall)}</p>
          <p className="text-xs text-neutral-600">
            {info ? (
              <>
                {d.ourRuleLabel ? <b>{d.ourRuleLabel}</b> : null}
                {d.ourItemTitle ? <> (from &ldquo;{d.ourItemTitle}&rdquo;)</> : null}:{" "}
                {becauseClause(info, defaults)}
              </>
            ) : (
              d.ourBecause
            )}
          </p>
        </div>
        <div className="rounded border border-neutral-200 px-3 py-2">
          <p className="text-xs text-neutral-400">
            BEN{d.benWho ? ` · ${d.benWho}` : ""}{d.benQuality ? ` · ${d.benQuality}` : ""}
          </p>
          <p className="text-lg font-medium">{callLabel(d.benCall)}</p>
          {topCandidates.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-neutral-600">
              {topCandidates.map((c, i) => (
                <li key={`${c.call}-${i}`}>
                  <span className="font-medium">{callLabel(c.call)}</span>
                  {c.insta_score !== undefined && (
                    <span className="text-neutral-400"> {Math.round(c.insta_score * 100)}%</span>
                  )}
                  {c.explanation && <> — {c.explanation}</>}
                  {c.alert && <span className="text-[color:var(--color-draft)]"> ⚠ {c.alert}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {boardPackId && (
          <form action={dealFindingBoardAction}>
            <input type="hidden" name="kbId" value={kbId} />
            <input type="hidden" name="packId" value={boardPackId} />
            <input type="hidden" name="dealSeed" value={d.dealSeed} />
            <button type="submit" className="rounded border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50">
              Deal this board
            </button>
          </form>
        )}
        <form action={createSuggestionAction}>
          <input type="hidden" name="kbId" value={kbId} />
          {d.ourItemId && <input type="hidden" name="itemId" value={d.ourItemId} />}
          <input type="hidden" name="text" value={suggestionText} />
          <button type="submit" className="rounded border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50">
            File as suggestion
          </button>
        </form>
        {!marked && (
          <form action={markSystemDifferenceAction} className="flex items-center gap-1.5">
            <input type="hidden" name="kbId" value={kbId} />
            <input type="hidden" name="runId" value={runId} />
            <input type="hidden" name="signature" value={d.signature} />
            <input
              type="text"
              name="note"
              placeholder="why it's fine (optional)"
              className="w-44 rounded border border-neutral-300 px-2 py-1 text-xs"
            />
            <button type="submit" className="rounded border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50">
              Mark as system difference
            </button>
          </form>
        )}
      </div>
    </li>
  );
}
