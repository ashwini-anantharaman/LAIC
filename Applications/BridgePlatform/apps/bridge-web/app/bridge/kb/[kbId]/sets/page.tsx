import { validatePlayerStatic, type KbPack, type KbPlayer } from "@bridge/kb";
import Link from "next/link";
import { kbService, kbStore } from "@/lib/kb";
import { createB2F3CollectionsAction } from "../../actions";
import { isB2f3Collection } from "@/lib/b2f3";

const NOW = () => new Date().toISOString();

/** Knowledge sets: named groups of knowledge items. No ladder — a set may
 *  optionally include another set, nothing is assumed. Click a set to edit
 *  it, see who uses it, and step through its history. */
export default async function SetsPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string }>;
  searchParams: Promise<{ deleted?: string; error?: string; b2f3created?: string }>;
}>) {
  const { kbId } = await params;
  const { deleted, error, b2f3created } = await searchParams;
  const store = kbStore();
  const [packs, players, compiled] = await Promise.all([
    store.listPacksForKb(kbId),
    store.listPlayersForKb(kbId),
    kbService().liveCompile(kbId),
  ]);
  const base = `/bridge/kb/${kbId}`;
  const sets = [...packs].sort((a, b) => a.name.localeCompare(b.name));
  const byId = new Map(packs.map((p) => [p.packId, p]));
  const b2f3Sets = sets.filter((s) => isB2f3Collection(s.name));
  const hasB2f3 = b2f3Sets.length > 0;

  /** All set ids reachable from `packId` down its Includes chain (incl. itself). */
  const chainOf = (packId: string): Set<string> => {
    const chain = new Set<string>();
    let cursor: string | undefined = packId;
    while (cursor && !chain.has(cursor)) {
      chain.add(cursor);
      cursor = byId.get(cursor)?.extendsPackId;
    }
    return chain;
  };
  const usedBy = (packId: string) =>
    players.filter((p) => p.enabledPackIds.some((id) => chainOf(id).has(packId))).length;

  /** Completeness of a probe player carrying exactly this set (chain included). */
  const coverage = (packId: string) => {
    if (!compiled || !compiled.packs.some((p) => p.packId === packId)) return null;
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
    return { ok, total: report.static.length };
  };

  const completenessBadge = (set: KbPack) => {
    if (!set.intendedComplete) return null;
    const cov = coverage(set.packId);
    if (!cov) return null;
    return cov.ok === cov.total ? (
      <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--color-approved)]">
        complete
      </span>
    ) : (
      <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--color-draft)]">
        incomplete · {cov.ok}/{cov.total}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {deleted && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          The set was deleted.
        </p>
      )}
      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {b2f3created && b2f3Sets.length > 0 && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <p className="font-medium">B2F3 collections drafted.</p>
          <p className="mt-1 text-emerald-800">
            Three teaching sets are ready to review and edit:{" "}
            {b2f3Sets.map((s, i) => (
              <span key={s.packId}>
                {i > 0 && ", "}
                <Link href={`${base}/sets/${s.packId}`} className="font-medium underline">
                  {s.name}
                </Link>
              </span>
            ))}
            . Membership is a draft from a standard teaching progression — adjust it below.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-neutral-200 bg-[var(--card)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h3 className="font-serif text-lg font-medium">B2F3 curriculum collections</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Draft three teachable sets — <strong>B2F3 Beginner</strong> (openings,
              responses, raises, basic rebids, card-play fundamentals),{" "}
              <strong>B2F3 Advanced Beginner</strong> (adds basic competition and Stayman),
              and <strong>B2F3 Intermediate</strong> (adds transfers, the strong 2♣, slam
              conventions and advanced competition) — each including the one below it. A
              deterministic classifier drafts the membership from each item&rsquo;s content;
              you then adjust every set in the builder like any other.
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {hasB2f3
                ? "Re-running regenerates the same three sets from the classifier (it never duplicates them). Your edits to these sets are replaced, but every save is version-snapshotted, so the prior state is recoverable from a set’s history."
                : "Sets are matched by name, so this is safe to re-run. The three sets are drafts — nothing is published and no player changes until you build one."}
            </p>
          </div>
          <form action={createB2F3CollectionsAction} className="shrink-0">
            <input type="hidden" name="kbId" value={kbId} />
            <button
              type="submit"
              className="rounded border border-emerald-700 px-4 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
            >
              {hasB2f3 ? "Regenerate B2F3 collections (draft)" : "Create B2F3 collections (draft)"}
            </button>
          </form>
        </div>
        {hasB2f3 && (
          <p className="mt-2 text-xs text-neutral-500">
            Present: {b2f3Sets.map((s) => s.name).join(" · ")}.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-600">
          A knowledge set groups knowledge items; players carry one or more sets.
        </p>
        <Link
          href={`${base}/sets/new`}
          className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
        >
          New knowledge set
        </Link>
      </div>

      {sets.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No knowledge sets yet — group knowledge items into a set, then build
          players from it.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {sets.map((set) => {
            const effective = compiled?.packs.find((p) => p.packId === set.packId);
            const includedCount = effective
              ? effective.itemIds.length - set.itemIds.length
              : 0;
            const playerCount = usedBy(set.packId);
            return (
              <li key={set.packId}>
                <Link
                  href={`${base}/sets/${set.packId}`}
                  className="flex h-full flex-col rounded-lg border border-neutral-200 bg-[var(--card)] p-4 transition-colors hover:border-emerald-400"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-serif text-lg font-medium">{set.name}</h3>
                    {completenessBadge(set)}
                    {set.extendsPackId && (
                      <span className="text-xs text-neutral-400">
                        includes {byId.get(set.extendsPackId)?.name ?? set.extendsPackId}
                      </span>
                    )}
                  </div>
                  {set.description && (
                    <p className="mt-1 text-sm text-neutral-600">{set.description}</p>
                  )}
                  <p className="mt-2 flex-1 text-xs text-neutral-500">
                    {set.itemIds.length} knowledge item{set.itemIds.length === 1 ? "" : "s"}
                    {includedCount > 0 && <> · {includedCount} more via includes</>}
                    {" · "}
                    {playerCount} player{playerCount === 1 ? "" : "s"} use{playerCount === 1 ? "s" : ""} it
                  </p>
                  <p className="mt-2 text-[11px] text-neutral-400">
                    updated {set.updatedAt.slice(0, 10)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
