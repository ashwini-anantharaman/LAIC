// Drills runner (Pillar D): a bidding regression ratchet. Each drill is one
// decideBid — hundreds run in milliseconds — so the whole suite runs server-
// side on every load. The table shows pass/fail against the live compile, with
// the item link and, on a miss, the engine's actual call and the because-
// English. Seed the fellows' named cases with one idempotent button.

import { callLabel } from "@bridge/events";
import type { LibraryEntry } from "@bridge/sessions";
import Link from "next/link";
import { ConfirmButton } from "@/components/kb/ConfirmButton";
import { drillPlayerConfig, runDrills, type DrillResult } from "@/lib/drills";
import { kbService } from "@/lib/kb";
import { libraryStore } from "@/lib/sessions";
import { deleteDrillAction, seedExpertDrillsAction } from "./actions";

type Search = { set?: string; seeded?: string; saved?: string; deleted?: string; error?: string };

/** The auction so far, rendered compactly for a row. */
function auctionGlyphs(drill: LibraryEntry): string {
  const calls = (drill.auction ?? []).map((c) => callLabel(c.call));
  return calls.length ? calls.join(" ") : "(opening)";
}

export default async function DrillsPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string }>;
  searchParams: Promise<Search>;
}>) {
  const { kbId } = await params;
  const sp = await searchParams;
  const base = `/bridge/kb/${kbId}`;
  const setSel = sp.set ?? "all";

  const compiled = await kbService().liveCompile(kbId);

  let drills: LibraryEntry[] = [];
  let storeMissing = false;
  try {
    drills = (await libraryStore().listEntries("drill")).filter((e) => e.kbId === kbId);
  } catch {
    storeMissing = true;
  }

  const byId = new Map(drills.map((d) => [d.entryId, d]));
  const config = drillPlayerConfig(setSel === "all" ? undefined : setSel);
  const run = compiled
    ? await runDrills(drills, compiled, config)
    : { results: [] as DrillResult[], passed: 0, failed: 0, errored: 0 };
  const total = drills.length;
  const rate = total - run.errored > 0 ? Math.round((run.passed / (total - run.errored)) * 100) : 0;

  const packs = compiled?.packs ?? [];

  const stat = (value: string | number, label: string) => (
    <div className="min-w-24">
      <p className="text-2xl font-medium leading-tight">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">Drills</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">
          Bidding regression drills — saved decision points, each with an expected call. The whole
          suite runs against the live compile on every load, so fixes stay fixed. Save new drills
          from the{" "}
          <Link href={`${base}/auction-rules`} className="underline underline-offset-4">
            Auction rules
          </Link>{" "}
          explorer.
        </p>
      </div>

      {sp.saved && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Drill saved.
        </p>
      )}
      {sp.deleted && (
        <p className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
          Drill deleted.
        </p>
      )}
      {sp.seeded !== undefined && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {Number(sp.seeded) === 0
            ? "Expert drills already seeded — nothing to add."
            : `Seeded ${sp.seeded} expert drill(s). Some are expected to FAIL today — they document the target the content rebuild aims for.`}
        </p>
      )}
      {sp.error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{sp.error}</p>
      )}
      {storeMissing && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The library&apos;s database table isn&apos;t provisioned yet — apply migration
          0015_library.sql to this backend and reload.
        </p>
      )}
      {!compiled && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-[color:var(--color-draft)]">
          This knowledge base has no working compile yet — add some items first. Drills can be
          seeded, but can&apos;t run until there is a compile.
        </p>
      )}

      <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-lg border border-neutral-200 bg-[var(--card)] px-5 py-4">
        {stat(total, "drills")}
        {stat(run.passed, "passing")}
        {stat(run.failed, "failing")}
        {stat(run.errored, "not runnable")}
        {stat(`${rate}%`, "pass rate")}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <form method="get" className="flex items-end gap-2">
          <label className="text-xs">
            <span className="mb-0.5 block text-neutral-500">Knowledge set</span>
            <select
              name="set"
              defaultValue={setSel}
              className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
            >
              <option value="all">Full knowledge (all sets)</option>
              {packs.map((p) => (
                <option key={p.packId} value={p.packId}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:border-emerald-400"
          >
            Run against this set
          </button>
        </form>
        <form action={seedExpertDrillsAction}>
          <input type="hidden" name="kbId" value={kbId} />
          <button
            type="submit"
            className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Seed expert drills
          </button>
        </form>
      </div>

      {total === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
          No drills for this knowledge base yet. Seed the expert cases above, or save a decision
          point from the Auction rules explorer.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-100/70 text-left text-[11px] uppercase tracking-wide text-neutral-500">
                <th className="px-3 py-2 font-medium">Result</th>
                <th className="px-3 py-2 font-medium">Drill</th>
                <th className="px-3 py-2 font-medium">Auction → seat</th>
                <th className="px-3 py-2 font-medium">Expected</th>
                <th className="px-3 py-2 font-medium">Engine</th>
                <th className="px-3 py-2 font-medium">Why / item</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {run.results.map((r) => (
                <DrillRow
                  key={r.entryId}
                  r={r}
                  drill={byId.get(r.entryId)}
                  kbId={kbId}
                  base={base}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DrillRow({
  r,
  drill,
  kbId,
  base,
}: Readonly<{ r: DrillResult; drill?: LibraryEntry; kbId: string; base: string }>) {
  const badge = r.errored ? (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
      n/a
    </span>
  ) : r.pass ? (
    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
      pass
    </span>
  ) : (
    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-800">
      fail
    </span>
  );

  return (
    <tr className={r.pass ? "" : r.errored ? "bg-amber-50/40" : "bg-red-50/40"}>
      <td className="px-3 py-2 align-top">{badge}</td>
      <td className="px-3 py-2 align-top">
        <p className="font-medium text-neutral-800">{r.name}</p>
        {r.note && <p className="mt-0.5 max-w-sm text-xs text-neutral-500">{r.note}</p>}
      </td>
      <td className="px-3 py-2 align-top font-mono text-xs text-neutral-600">
        {drill ? auctionGlyphs(drill) : ""} <span className="text-neutral-400">→ {r.toAct}</span>
      </td>
      <td className="px-3 py-2 align-top font-mono text-xs">{r.expected.join(" / ") || "—"}</td>
      <td className="px-3 py-2 align-top font-mono text-xs">
        {r.errored ? <span className="text-amber-700">{r.error}</span> : r.gotLabel}
        {r.fallback && !r.errored && <span className="ml-1 text-[10px] text-neutral-400">(fallback)</span>}
      </td>
      <td className="px-3 py-2 align-top text-xs text-neutral-600">
        {!r.errored && !r.pass && r.because && <p className="max-w-xs">{r.because}</p>}
        {r.itemId && (
          <Link href={`${base}/items/${r.itemId}?mode=edit`} className="text-emerald-700 hover:underline">
            open item →
          </Link>
        )}
      </td>
      <td className="px-3 py-2 align-top text-right">
        <ConfirmButton
          action={deleteDrillAction}
          hidden={{ kbId, entryId: r.entryId }}
          confirm={`Delete drill "${r.name}"?`}
          label="Delete"
          title="Delete this drill"
          className="rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-400 hover:border-red-300 hover:text-red-700"
        />
      </td>
    </tr>
  );
}
