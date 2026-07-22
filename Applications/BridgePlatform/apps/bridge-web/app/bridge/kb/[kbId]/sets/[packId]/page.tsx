import { validatePlayerStatic, type KbPlayer, type KnowledgeItem } from "@bridge/kb";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ValidityBadge } from "@/components/kb/badges";
import { SetItemPicker } from "@/components/kb/SetItemPicker";
import { kbService, kbStore } from "@/lib/kb";
import { whenRoles } from "@/lib/whenFacet";
import { deletePackAction, restorePackVersionAction, savePackAction } from "../../../actions";

const NOW = () => new Date().toISOString();

/** Executable rules an item carries (0 = teaching prose) — mirrors the Master
 *  viewer's ruleCount so the picker's "most rules" sort agrees with it. */
function ruleCount(item: KnowledgeItem): number {
  const p = item.payload;
  switch (p.kind) {
    case "auction_rules":
    case "forcing_rules":
    case "play_rules":
      return p.rules.length;
    case "lead_rules":
      return p.leads.length;
    case "signals":
    case "fallback":
      return 1;
    default:
      return 0;
  }
}

/** One knowledge set: edit it, see whether it's complete (only if it's meant
 *  to be), see every player that uses it, and step through its history. */
export default async function SetDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string; packId: string }>;
  searchParams: Promise<{ saved?: string; restored?: string; dropped?: string; error?: string }>;
}>) {
  const { kbId, packId } = await params;
  const { saved, restored, dropped, error } = await searchParams;
  const store = kbStore();
  const pack = await store.getPack(packId);
  if (!pack || pack.kbId !== kbId) notFound();

  const [kb, packs, items, compiled, versions, refs] = await Promise.all([
    store.getKb(kbId),
    store.listPacksForKb(kbId),
    store.listItemsForKb(kbId),
    kbService().liveCompile(kbId),
    kbService().listPackVersions(packId),
    kbService().packReferences(kbId, packId),
  ]);
  const base = `/bridge/kb/${kbId}`;
  // Deprecated items already in this set stay pickable (with a muted badge);
  // deprecated items outside it are hidden but their count is surfaced.
  const hiddenDeprecatedCount = items.filter(
    (i) => i.status === "deprecated" && !pack.itemIds.includes(i.itemId),
  ).length;
  const pickerItems = items
    .filter((i) => i.status !== "deprecated" || pack.itemIds.includes(i.itemId))
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((i) => ({
      itemId: i.itemId,
      title: i.title,
      knowledgeType: i.knowledgeType,
      roles: [...whenRoles(i)],
      phase: i.phase,
      ruleCount: ruleCount(i),
      deprecated: i.status === "deprecated",
    }));

  // Completeness checklist — only when the fellow says this set is meant to
  // be complete, and only against a compile that actually contains it.
  const compiledHasSet = compiled?.packs.some((p) => p.packId === packId) ?? false;
  let checklist: { ok: boolean; explanation: string; categoryId: string }[] | null = null;
  if (pack.intendedComplete && compiled && compiledHasSet && !kb?.lastCompileError) {
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
    checklist = validatePlayerStatic(compiled, probe).static;
  }
  const okCount = checklist?.filter((c) => c.ok).length ?? 0;

  const blockers =
    refs.players.length + refs.extendedBy.length + refs.sandboxes.length > 0;
  const latestVersion = versions[0]?.versionNumber;

  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm">
        <Link href={`${base}/sets`} className="text-neutral-500 underline-offset-4 hover:underline">
          Knowledge sets
        </Link>{" "}
        <span className="text-neutral-400">/ {pack.name}</span>
        {latestVersion && (
          <span className="ml-2 text-xs text-neutral-400">v{latestVersion}</span>
        )}
      </p>

      {saved && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Saved.
        </p>
      )}
      {restored && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Restored v{restored}
          {dropped && Number(dropped) > 0
            ? ` — ${dropped} reference${Number(dropped) === 1 ? "" : "s"} no longer exist${Number(dropped) === 1 ? "s" : ""} and stayed dropped.`
            : "."}
        </p>
      )}
      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {/* Edit */}
      <form action={savePackAction} className="space-y-4">
        <input type="hidden" name="kbId" value={kbId} />
        <input type="hidden" name="packId" value={packId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Name</span>
            <input
              name="name"
              required
              defaultValue={pack.name}
              className="w-full rounded border border-neutral-300 px-2 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Description (optional)</span>
            <input
              name="description"
              defaultValue={pack.description ?? ""}
              className="w-full rounded border border-neutral-300 px-2 py-1.5"
            />
          </label>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="intendedComplete"
            defaultChecked={pack.intendedComplete ?? false}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Intended to be complete</span>
            <span className="block text-xs text-neutral-500">
              Check this when the set (with anything it includes) should cover a full game on
              its own — the completeness checklist below appears only then.
            </span>
          </span>
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Knowledge items in this set</legend>
          <SetItemPicker
            items={pickerItems}
            packs={packs}
            currentPackId={packId}
            initialSelected={pack.itemIds}
            initialIncludeId={pack.extendsPackId}
            hiddenDeprecatedCount={hiddenDeprecatedCount}
          />
        </fieldset>

        <button
          type="submit"
          className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Save set
        </button>
      </form>

      {/* Completeness — opt-in via the checkbox */}
      {pack.intendedComplete && (
        <section className="rounded-lg border border-neutral-200 p-4">
          <h3 className="text-sm font-medium">
            Completeness{" "}
            {checklist && (
              <span
                className={
                  okCount === checklist.length
                    ? "text-[color:var(--color-approved)]"
                    : "text-[color:var(--color-draft)]"
                }
              >
                · {okCount}/{checklist.length}
              </span>
            )}
          </h3>
          {checklist ? (
            <ul className="mt-2 space-y-1 text-sm">
              {checklist.map((c) => (
                <li key={c.categoryId} className="flex items-baseline gap-2">
                  <span
                    aria-hidden
                    className={
                      c.ok
                        ? "text-[color:var(--color-approved)]"
                        : "text-[color:var(--color-invalid)]"
                    }
                  >
                    {c.ok ? "✓" : "✗"}
                  </span>
                  <span className={c.ok ? "text-neutral-600" : "text-neutral-800"}>
                    {c.explanation}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-neutral-500">
              The checklist reflects the last good compile, which doesn&apos;t contain this
              set yet — save the set (and fix any compile error shown in the header) to see it.
            </p>
          )}
        </section>
      )}

      {/* Players using this set */}
      <section className="rounded-lg border border-neutral-200 p-4">
        <h3 className="text-sm font-medium">Players using this set</h3>
        {refs.players.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No players carry it yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--line)]">
            {refs.players.map(({ player, via }) => (
              <li key={player.playerId} className="flex items-center gap-3 py-2 text-sm">
                <Link
                  href={`${base}/players/${player.playerId}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {player.name}
                </Link>
                {via && (
                  <span className="rounded-full border border-neutral-200 px-2 py-0.5 text-[10px] text-neutral-500">
                    via {via.name}
                  </span>
                )}
                <span className="ml-auto">
                  <ValidityBadge status={player.validationStatus} />
                </span>
              </li>
            ))}
          </ul>
        )}
        {refs.extendedBy.length > 0 && (
          <p className="mt-3 text-xs text-neutral-500">
            Included by:{" "}
            {refs.extendedBy.map((p, i) => (
              <span key={p.packId}>
                {i > 0 && ", "}
                <Link
                  href={`${base}/sets/${p.packId}`}
                  className="underline-offset-2 hover:underline"
                >
                  {p.name}
                </Link>
              </span>
            ))}
          </p>
        )}
      </section>

      {/* History */}
      <section className="rounded-lg border border-neutral-200 p-4">
        <h3 className="flex items-baseline text-sm font-medium">
          History
          <Link
            href="/bridge/guide#versions"
            className="ml-auto text-[11px] font-normal text-neutral-400 underline-offset-2 hover:text-emerald-700 hover:underline"
          >
            how versions work →
          </Link>
        </h3>
        <p className="mt-0.5 text-xs text-neutral-500">
          Every save is kept. Restoring an older state saves it as the newest version —
          nothing is ever overwritten.
        </p>
        {versions.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No saves recorded yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--line)]">
            {versions.map((v, idx) => (
              <li key={v.versionNumber} className="flex items-center gap-3 py-2 text-sm">
                <span className="font-mono text-xs">v{v.versionNumber}</span>
                <span className="text-neutral-600">{v.name}</span>
                <span className="text-xs text-neutral-400">
                  {v.itemIds.length} item{v.itemIds.length === 1 ? "" : "s"}
                  {v.extendsPackId && " · includes"}
                  {v.intendedComplete && " · intended complete"}
                </span>
                <span className="ml-auto text-xs text-neutral-400">
                  {v.savedAt.slice(0, 16).replace("T", " ")}
                </span>
                {idx === 0 ? (
                  <span className="text-[10px] uppercase tracking-wide text-emerald-700">
                    current
                  </span>
                ) : (
                  <form action={restorePackVersionAction}>
                    <input type="hidden" name="kbId" value={kbId} />
                    <input type="hidden" name="packId" value={packId} />
                    <input type="hidden" name="versionNumber" value={v.versionNumber} />
                    <button
                      type="submit"
                      className="rounded border border-neutral-300 px-2 py-0.5 text-xs hover:border-emerald-400"
                    >
                      Restore
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Danger zone */}
      <details className="rounded-lg border border-red-200">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-red-800 hover:bg-red-50/50">
          Delete this set…
        </summary>
        <div className="border-t border-red-100 px-4 py-3">
          {blockers ? (
            <p className="text-sm text-neutral-600">
              This set can&apos;t be deleted while it&apos;s in use —{" "}
              {refs.players.length > 0 &&
                `${refs.players.length} player${refs.players.length === 1 ? "" : "s"} carry it`}
              {refs.extendedBy.length > 0 &&
                `${refs.players.length ? ", " : ""}${refs.extendedBy.length} set${refs.extendedBy.length === 1 ? "" : "s"} include it`}
              {refs.sandboxes.length > 0 &&
                `${refs.players.length + refs.extendedBy.length ? ", " : ""}${refs.sandboxes.length} sandbox${refs.sandboxes.length === 1 ? "" : "es"} expose it`}
              . Repoint or delete those first.
            </p>
          ) : (
            <form action={deletePackAction} className="flex items-center gap-3">
              <input type="hidden" name="kbId" value={kbId} />
              <input type="hidden" name="packId" value={packId} />
              <p className="text-sm text-neutral-600">
                Removes the set and its history. Knowledge items stay in the Master list.
              </p>
              <button
                type="submit"
                className="ml-auto rounded border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100"
              >
                Delete set
              </button>
            </form>
          )}
        </div>
      </details>
    </div>
  );
}
