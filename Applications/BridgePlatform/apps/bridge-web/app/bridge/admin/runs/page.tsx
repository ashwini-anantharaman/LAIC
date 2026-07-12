import Link from "next/link";
import { triggerGeneration } from "@/app/bridge/admin/actions";
import { knowledgeStore } from "@/lib/knowledge";

export default async function RunsPage() {
  const store = knowledgeStore();
  const runs = (await store.listRuns()).slice().reverse();
  const packages = await store.listPackages();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Generation runs & packages
      </h1>

      <form action={triggerGeneration} className="flex items-center gap-2 rounded-lg border border-neutral-200 p-4">
        <select name="systemFamily" className="rounded border border-neutral-300 px-2 py-1 text-sm">
          <option value="natural">natural</option>
          <option value="SAYC">SAYC</option>
          <option value="2_over_1">2_over_1</option>
          <option value="custom">custom</option>
        </select>
        <select name="bump" className="rounded border border-neutral-300 px-2 py-1 text-sm">
          <option value="minor">minor</option>
          <option value="patch">patch</option>
          <option value="major">major</option>
        </select>
        <button type="submit" className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
          Run generation
        </button>
        <span className="text-xs text-neutral-500">
          Assembles active items into a validated, immediately usable package
          version + diff.
        </span>
      </form>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Packages</h2>
        <ul className="space-y-1">
          {packages.map((p) => (
            <li key={`${p.packageId}@${p.version}`} className="rounded border border-neutral-200 px-3 py-2 text-sm">
              <span className="font-mono">{p.packageId}@{p.version}</span>{" "}
              <span className={p.status === "deprecated" ? "text-red-700" : "text-emerald-700"}>
                {p.status}
              </span>
              {p.baseline && (
                <span className="text-xs text-neutral-500">
                  {" "}· baseline: {p.baseline.boards} boards, fallback bid{" "}
                  {(p.baseline.bidFallbackRate * 100).toFixed(1)}% / play{" "}
                  {(p.baseline.playFallbackRate * 100).toFixed(1)}%
                </span>
              )}
              {p.baseline && (
                <span className="text-xs text-neutral-500">
                  {" "}· baseline: {p.baseline.boards} boards, fallback bid{" "}
                  {(p.baseline.bidFallbackRate * 100).toFixed(1)}% / play{" "}
                  {(p.baseline.playFallbackRate * 100).toFixed(1)}%
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Runs</h2>
        <ul className="space-y-1">
          {runs.map((r) => (
            <li key={r.runId}>
              <Link
                href={`/bridge/admin/runs/${r.runId}`}
                className="block rounded border border-neutral-200 px-3 py-2 text-sm hover:border-emerald-400"
              >
                <span className="font-mono">{r.runId}</span> · {r.systemFamily} ·{" "}
                <span className={r.status === "completed" ? "text-emerald-700" : "text-red-700"}>
                  {r.status}
                </span>
                {r.resultVersion && <span> → {r.resultPackageId}@{r.resultVersion}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
