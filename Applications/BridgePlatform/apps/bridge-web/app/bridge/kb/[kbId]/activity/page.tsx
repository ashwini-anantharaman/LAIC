import { kbStore } from "@/lib/kb";

/** Compile history: what changed, when, and what's live. */
export default async function ActivityPage({
  params,
}: Readonly<{ params: Promise<{ kbId: string }> }>) {
  const { kbId } = await params;
  const store = kbStore();
  const [kb, compiles] = await Promise.all([
    store.getKb(kbId),
    store.listCompilesForKb(kbId, 30),
  ]);

  return (
    <div className="max-w-3xl">
      <ul className="space-y-2">
        {compiles.map((c) => (
          <li
            key={c.compileId}
            className="flex flex-wrap items-baseline gap-3 rounded-lg border border-neutral-200 bg-[var(--card)] px-4 py-3 text-sm"
          >
            <span className="font-medium">v{c.version}</span>
            {kb?.liveCompileId === c.compileId && (
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--color-approved)]">
                live
              </span>
            )}
            <span className="text-neutral-500">
              {c.auctionRules.length} auction · {c.leadRules.length} lead · {c.playRules.length} play
              · {c.settings.length} settings · {c.packs.length} packs
            </span>
            <span className="ml-auto text-xs text-neutral-400">
              {c.compiledAt.slice(0, 19).replace("T", " ")}
            </span>
          </li>
        ))}
        {compiles.length === 0 && (
          <li className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            No compiles yet — the first item save produces v1.
          </li>
        )}
      </ul>
    </div>
  );
}
