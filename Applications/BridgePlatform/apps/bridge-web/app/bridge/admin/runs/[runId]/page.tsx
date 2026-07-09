import Link from "next/link";
import { notFound } from "next/navigation";
import { publishGeneratedPackage } from "@/app/bridge/admin/actions";
import { knowledgeStore } from "@/lib/knowledge";
import type { RuleDiffEntry } from "@bridge/knowledge";

function DiffList({ title, entries }: Readonly<{ title: string; entries: RuleDiffEntry[] }>) {
  const style: Record<string, string> = {
    added: "text-emerald-700",
    removed: "text-red-700",
    changed: "text-amber-700",
  };
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      {entries.length ? (
        <ul className="mt-1 space-y-0.5 font-mono text-xs">
          {entries.map((e) => (
            <li key={e.id} className={style[e.change]}>
              {e.change === "added" ? "+" : e.change === "removed" ? "−" : "~"} {e.id}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-neutral-400">no changes</p>
      )}
    </div>
  );
}

export default async function RunPage({
  params,
}: Readonly<{ params: Promise<{ runId: string }> }>) {
  const { runId } = await params;
  const store = knowledgeStore();
  const run = await store.getRun(runId);
  if (!run) notFound();
  const pkg =
    run.resultPackageId && run.resultVersion
      ? await store.getPackage(run.resultPackageId, run.resultVersion)
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Run {run.runId}</h1>
        <p className="text-xs text-neutral-500">
          {run.systemFamily} · requested by {run.requestedBy} · {run.createdAt} ·{" "}
          <span className={run.status === "completed" ? "text-emerald-700" : "text-red-700"}>
            {run.status}
          </span>{" "}
          · {run.inputItems.length} input items
        </p>
      </header>

      {run.errors.length > 0 && (
        <section className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h2 className="mb-1 text-sm font-medium text-red-800">Errors</h2>
          <ul className="list-inside list-disc text-sm text-red-700">
            {run.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </section>
      )}

      {(run.warnings?.length ?? 0) > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-1 text-sm font-medium text-amber-800">Quality warnings (§19.3)</h2>
          <ul className="list-inside list-disc text-sm text-amber-700">
            {run.warnings!.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      {run.diff && (
        <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
            Diff vs {run.diff.previousVersion ?? "nothing (first version)"}
          </h2>
          <DiffList title="Bid rules" entries={run.diff.bidRules} />
          <DiffList title="Play rules" entries={run.diff.playRules} />
          <DiffList title="Settings" entries={run.diff.settings} />
        </section>
      )}

      {pkg && (
        <section className="flex items-center gap-3 rounded-lg border border-neutral-200 p-4">
          <span className="font-mono text-sm">
            {pkg.packageId}@{pkg.version}
          </span>
          <span className={pkg.status === "published" ? "text-sm text-emerald-700" : "text-sm text-amber-700"}>
            {pkg.status}
          </span>
          {pkg.status === "draft" && (
            <form action={publishGeneratedPackage}>
              <input type="hidden" name="packageId" value={pkg.packageId} />
              <input type="hidden" name="version" value={pkg.version} />
              <button type="submit" className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
                Publish {pkg.version}
              </button>
            </form>
          )}
          <span className="text-xs text-neutral-500">
            Publishing re-validates the provenance gate and freezes this version.
          </span>
        </section>
      )}

      <Link href="/bridge/admin/runs" className="text-sm text-emerald-700 hover:underline">
        ← All runs
      </Link>
    </div>
  );
}
