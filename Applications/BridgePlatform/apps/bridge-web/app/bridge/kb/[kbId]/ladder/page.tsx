import { CAPABILITY_CATEGORIES, validatePlayerStatic, type KbPlayer } from "@bridge/kb";
import Link from "next/link";
import { kbService, kbStore } from "@/lib/kb";
import { savePackAction } from "../../actions";

const NOW = () => new Date().toISOString();

/** The ladder (spec §6): the pack chain, each pack's capability coverage,
 *  and the roster editor. Effective item sets flatten the extends chain. */
export default async function LadderPage({
  params,
}: Readonly<{ params: Promise<{ kbId: string }> }>) {
  const { kbId } = await params;
  const store = kbStore();
  const [packs, items, compiled] = await Promise.all([
    store.listPacksForKb(kbId),
    store.listItemsForKb(kbId),
    kbService().liveCompile(kbId),
  ]);
  const base = `/bridge/kb/${kbId}`;
  const titleOf = new Map(items.map((i) => [i.itemId, i.title]));

  /** Coverage of a hypothetical player carrying exactly this pack. */
  const coverage = (packId: string) => {
    if (!compiled) return null;
    const probe: KbPlayer = {
      playerId: "probe",
      kbId,
      name: "probe",
      enabledPackIds: [packId],
      settingOverrides: {},
      decisionPolicyId: "first_match",
      fallbackPolicyId: "standard",
      validationStatus: "draft",
      ownerType: "system",
      version: 1,
      createdAt: NOW(),
      updatedAt: NOW(),
    };
    const report = validatePlayerStatic(compiled, probe);
    const ok = report.static.filter((r) => r.ok).length;
    return { ok, total: report.static.length, missing: report.static.filter((r) => !r.ok) };
  };

  return (
    <div className="space-y-6">
      {packs.length === 0 && (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No packs yet. Start with a &ldquo;minimal complete&rdquo; pack carrying the
          fallback items, then extend it up the ladder.
        </p>
      )}

      <ol className="space-y-4">
        {packs.map((pack) => {
          const cov = coverage(pack.packId);
          const effective = compiled?.packs.find((p) => p.packId === pack.packId);
          return (
            <li key={pack.packId} className="rounded-lg border border-neutral-200 bg-[var(--card)] p-5">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                  {pack.ordinal}
                </span>
                <h3 className="font-serif text-lg font-medium">{pack.name}</h3>
                {pack.extendsPackId && (
                  <span className="text-xs text-neutral-400">
                    extends {packs.find((p) => p.packId === pack.extendsPackId)?.name ?? pack.extendsPackId}
                  </span>
                )}
                {cov && (
                  <span
                    className={
                      cov.ok === cov.total
                        ? "ml-auto text-xs font-medium text-[color:var(--color-approved)]"
                        : "ml-auto text-xs font-medium text-[color:var(--color-draft)]"
                    }
                    title={cov.missing.map((m) => m.explanation).join("\n")}
                  >
                    {cov.ok === cov.total
                      ? "minimally complete on its own"
                      : `${cov.ok}/${cov.total} capabilities — incomplete (constrained play only)`}
                  </span>
                )}
              </div>
              {pack.description && (
                <p className="mt-1 text-sm text-neutral-600">{pack.description}</p>
              )}
              <p className="mt-2 flex flex-wrap gap-1.5">
                {(effective?.itemIds ?? pack.itemIds).map((id) => (
                  <Link
                    key={id}
                    href={`${base}/items/${id}`}
                    className={
                      pack.itemIds.includes(id)
                        ? "rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-900 hover:border-emerald-400"
                        : "rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-xs text-neutral-500 hover:border-neutral-400"
                    }
                    title={pack.itemIds.includes(id) ? "declared here" : "inherited via extends"}
                  >
                    {titleOf.get(id) ?? id}
                  </Link>
                ))}
              </p>
              {cov && cov.missing.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-neutral-500">
                    Missing capabilities ({cov.missing.length})
                  </summary>
                  <ul className="mt-1 list-inside list-disc text-xs text-neutral-600">
                    {cov.missing.map((m) => (
                      <li key={m.categoryId}>{m.explanation}</li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ol>

      <section className="rounded-lg border border-neutral-200 p-5">
        <h3 className="font-medium">New pack</h3>
        <form action={savePackAction} className="mt-3 space-y-3">
          <input type="hidden" name="kbId" value={kbId} />
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-xs text-neutral-500">Name</span>
              <input name="name" required className="w-full rounded border border-neutral-300 px-2 py-1.5" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Ladder position</span>
              <input
                name="ordinal"
                type="number"
                defaultValue={packs.length}
                className="w-full rounded border border-neutral-300 px-2 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Extends</span>
              <select name="extendsPackId" className="w-full rounded border border-neutral-300 px-2 py-1.5">
                <option value="">nothing</option>
                {packs.map((p) => (
                  <option key={p.packId} value={p.packId}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset>
            <legend className="mb-1 text-xs text-neutral-500">Items in this pack</legend>
            <div className="grid max-h-64 gap-1 overflow-y-auto rounded border border-neutral-200 p-3 sm:grid-cols-2">
              {items
                .filter((i) => i.status !== "deprecated")
                .map((i) => (
                  <label key={i.itemId} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="itemIds" value={i.itemId} />
                    {i.title}
                    <span className="text-[10px] uppercase text-neutral-400">{i.knowledgeType}</span>
                  </label>
                ))}
            </div>
          </fieldset>
          <button
            type="submit"
            className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Save pack
          </button>
        </form>
      </section>

      <p className="text-xs text-neutral-400">
        The minimum full-game capability set has {CAPABILITY_CATEGORIES.length} categories; a pack
        (with its chain) covering all of them can field a standalone player. Incomplete packs are
        drill material — they only play in constrained environments.
      </p>
    </div>
  );
}
