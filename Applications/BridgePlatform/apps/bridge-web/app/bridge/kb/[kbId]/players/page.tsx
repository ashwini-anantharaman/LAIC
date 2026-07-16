import Link from "next/link";
import { ValidityBadge } from "@/components/kb/badges";
import { kbService, kbStore } from "@/lib/kb";
import { createSandboxAction, suggestPlayersAction } from "../../actions";

/** Players tab (Stage E): the wizard, the roster, and coach sandboxes. */
export default async function KbPlayersPage({
  params,
}: Readonly<{ params: Promise<{ kbId: string }> }>) {
  const { kbId } = await params;
  const store = kbStore();
  const [players, sandboxes, packs, compiled] = await Promise.all([
    store.listPlayersForKb(kbId),
    store.listSandboxesForKb(kbId),
    store.listPacksForKb(kbId),
    kbService().liveCompile(kbId),
  ]);
  const base = `/bridge/kb/${kbId}`;
  const packName = new Map(packs.map((p) => [p.packId, p.name]));

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 p-4">
        <p className="text-sm text-neutral-600">
          Suggest players from the ladder: a <strong>minimal incomplete</strong> drill player and
          the lowest <strong>minimal complete</strong> player the packs support.
        </p>
        <form action={suggestPlayersAction}>
          <input type="hidden" name="kbId" value={kbId} />
          <button
            type="submit"
            className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
            disabled={!compiled}
          >
            Suggest minimal players
          </button>
        </form>
      </section>

      {players.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No players yet — use the wizard above, or build one by hand below.
        </p>
      ) : (
        <ul className="space-y-2">
          {players.map((p) => (
            <li key={p.playerId}>
              <Link
                href={`${base}/players/${p.playerId}`}
                className="flex flex-wrap items-baseline gap-3 rounded-lg border border-neutral-200 bg-[var(--card)] px-4 py-3 hover:border-emerald-400"
              >
                <span className="font-serif font-medium">{p.name}</span>
                <ValidityBadge status={p.validationStatus} />
                <span className="text-xs text-neutral-500">
                  {p.enabledPackIds.map((id) => packName.get(id) ?? id).join(" + ") || "all packs"}
                </span>
                <span className="text-xs text-neutral-400">
                  {Object.keys(p.settingOverrides).length} override(s) · {p.decisionPolicyId}
                  {p.sandboxId && " · sandboxed"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p>
        <Link
          href={`${base}/players/new`}
          className="text-sm font-medium text-emerald-700 underline-offset-4 hover:underline"
        >
          Build a player by hand →
        </Link>
      </p>

      <section className="rounded-lg border border-neutral-200 p-5">
        <h3 className="font-medium">Sandboxes</h3>
        <p className="mt-1 text-sm text-neutral-600">
          A sandbox is what a coach hands a learner: base packs every sandbox player carries,
          plus exactly the packs and settings the learner may touch. Enforced server-side on
          every save.
        </p>
        {sandboxes.length > 0 && (
          <ul className="mt-3 space-y-2">
            {sandboxes.map((sb) => (
              <li key={sb.sandboxId} className="rounded border border-neutral-200 px-3 py-2 text-sm">
                <span className="font-medium">{sb.name}</span>
                <span className="ml-3 text-xs text-neutral-500">
                  base: {sb.basePackIds.map((id) => packName.get(id) ?? id).join(", ") || "none"} ·
                  exposed packs: {sb.exposedPackIds.map((id) => packName.get(id) ?? id).join(", ") || "none"} ·
                  exposed settings: {sb.exposedSettingKeys.join(", ") || "none"}
                </span>
              </li>
            ))}
          </ul>
        )}
        <form action={createSandboxAction} className="mt-4 space-y-3">
          <input type="hidden" name="kbId" value={kbId} />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Name</span>
              <input name="name" required placeholder="Notrump week" className="w-full rounded border border-neutral-300 px-2 py-1.5" />
            </label>
            <fieldset className="text-sm">
              <legend className="mb-1 text-xs text-neutral-500">Base packs (always on)</legend>
              {packs.map((p) => (
                <label key={p.packId} className="mr-3 inline-flex items-center gap-1">
                  <input type="checkbox" name="basePackIds" value={p.packId} /> {p.name}
                </label>
              ))}
            </fieldset>
            <fieldset className="text-sm">
              <legend className="mb-1 text-xs text-neutral-500">Exposed packs (learner may toggle)</legend>
              {packs.map((p) => (
                <label key={p.packId} className="mr-3 inline-flex items-center gap-1">
                  <input type="checkbox" name="exposedPackIds" value={p.packId} /> {p.name}
                </label>
              ))}
            </fieldset>
          </div>
          <fieldset className="text-sm">
            <legend className="mb-1 text-xs text-neutral-500">Exposed settings (learner may change)</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {(compiled?.settings ?? []).map((s) => (
                <label key={s.key} className="inline-flex items-center gap-1">
                  <input type="checkbox" name="exposedSettingKeys" value={s.key} /> {s.label}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:border-emerald-400">
            Create sandbox
          </button>
        </form>
      </section>
    </div>
  );
}
