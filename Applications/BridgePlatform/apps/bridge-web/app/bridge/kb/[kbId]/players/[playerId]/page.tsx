import { CATEGORY_BY_ID, effectiveAgreements } from "@bridge/kb";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ValidityBadge } from "@/components/kb/badges";
import { PlayerEditor } from "@/components/kb/PlayerEditor";
import { formatSettingValue } from "@/components/kb/PlayerSettingControl";
import { kbService, kbStore } from "@/lib/kb";
import { savePlayerAction, simulatePlayerAction } from "../../../actions";

/** Player detail (Stage E): configuration, the validation report a fellow
 *  reads, the self-play simulation, and the agreements-in-force card. */
export default async function PlayerPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string; playerId: string }>;
  searchParams: Promise<{ saved?: string }>;
}>) {
  const { kbId, playerId } = await params;
  const { saved } = await searchParams;
  const store = kbStore();
  const [player, packs, compiled] = await Promise.all([
    store.getPlayer(playerId),
    store.listPacksForKb(kbId),
    kbService().liveCompile(kbId),
  ]);
  if (!player || !compiled) notFound();
  const sandbox = player.sandboxId ? await store.getSandbox(player.sandboxId) : null;
  const report = player.validationReport;
  const base = `/bridge/kb/${kbId}`;
  const card = effectiveAgreements(compiled, player);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div>
        <p className="mb-2 text-xs text-neutral-400">
          <Link href={`${base}/players`} className="hover:underline">
            Players
          </Link>{" "}
          / {player.playerId} · v{player.version}
        </p>
        {saved && (
          <p className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Saved and revalidated against compile v{compiled.version}.
          </p>
        )}
        <div className="mb-1 flex items-center gap-3">
          <h2 className="text-2xl font-medium">{player.name}</h2>
          <ValidityBadge status={player.validationStatus} />
        </div>
        {player.description && (
          <p className="mb-4 text-sm text-neutral-600">{player.description}</p>
        )}

        <PlayerEditor
          kbId={kbId}
          player={player}
          packs={packs}
          compiled={compiled}
          sandbox={sandbox}
          action={savePlayerAction}
        />
      </div>

      <aside className="space-y-6">
        <section className="rounded-lg border border-neutral-200 p-4">
          <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
            Validation
          </h3>
          {!report ? (
            <p className="text-sm text-neutral-500">Save to validate.</p>
          ) : (
            <>
              <ul className="space-y-1 text-sm">
                {report.static
                  .filter((r) => !r.ok)
                  .map((r) => (
                    <li key={r.categoryId} className="text-[color:var(--color-invalid)]">
                      ✕ {CATEGORY_BY_ID.get(r.categoryId)?.name ?? r.categoryId}
                    </li>
                  ))}
                {report.static.every((r) => r.ok) && (
                  <li className="text-[color:var(--color-approved)]">
                    ✓ all {report.static.length} capabilities covered
                  </li>
                )}
                {report.conflicts.map((c, i) => (
                  <li key={i} className="text-[color:var(--color-invalid)]">
                    ✕ conflict: {c.aItemId} ↔ {c.bItemId}
                  </li>
                ))}
                {report.missingRequires.map((m, i) => (
                  <li key={i} className="text-[color:var(--color-invalid)]">
                    ✕ {m.itemId} requires {m.requiresItemId}
                  </li>
                ))}
              </ul>
              {player.validationStatus === "invalid" && (
                <p className="mt-2 text-xs text-neutral-500">
                  Invalid players are drill material: they only play in constrained environments
                  where deals never leave their knowledge.
                </p>
              )}
            </>
          )}
        </section>

        <section className="rounded-lg border border-neutral-200 p-4">
          <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
            Self-play simulation
          </h3>
          {report?.simulation ? (
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-neutral-500">Deals completed</dt>
              <dd>
                {report.simulation.completed}/{report.simulation.deals}
              </dd>
              <dt className="text-neutral-500">Engine-floor events</dt>
              <dd
                className={
                  report.simulation.engineFloorEvents > 0
                    ? "font-medium text-[color:var(--color-invalid)]"
                    : "text-[color:var(--color-approved)]"
                }
              >
                {report.simulation.engineFloorEvents}
              </dd>
              <dt className="text-neutral-500">Fallback-item uses</dt>
              <dd>{Object.values(report.simulation.fallbackUsage).reduce((a, b) => a + b, 0)}</dd>
            </dl>
          ) : (
            <p className="text-sm text-neutral-500">Not simulated yet.</p>
          )}
          <form action={simulatePlayerAction} className="mt-3">
            <input type="hidden" name="kbId" value={kbId} />
            <input type="hidden" name="playerId" value={playerId} />
            <button
              type="submit"
              className="rounded border border-neutral-300 px-3 py-1 text-sm hover:border-emerald-400"
            >
              Run 24 seeded deals
            </button>
          </form>
        </section>

        <section className="rounded-lg border-2 border-emerald-900/60 bg-[var(--card)] p-4 print:border-black">
          <h3 className="mb-1 font-serif text-lg font-medium">Agreements in force</h3>
          <p className="mb-3 text-xs text-neutral-400">
            Generated from the configuration — never hand-edited. Amber values differ from the KB
            defaults.
          </p>
          {card.sections.map((section) => (
            <div key={section.title} className="mb-3">
              <h4 className="border-b border-neutral-200 pb-0.5 text-sm font-medium text-emerald-900">
                {section.title}
              </h4>
              <ul className="mt-1 space-y-0.5 text-[13px]">
                {section.entries.map((e) => (
                  <li key={e.ruleId} className="flex items-baseline justify-between gap-2">
                    <Link href={`${base}/items/${e.itemId}`} className="hover:underline">
                      {e.label}
                    </Link>
                    <span className="shrink-0 text-[10px] text-neutral-400">{e.itemTitle}</span>
                  </li>
                ))}
                {section.entries.length === 0 && (
                  <li className="text-neutral-400">none in force</li>
                )}
              </ul>
            </div>
          ))}
          {card.settings.length > 0 && (
            <p className="flex flex-wrap gap-x-3 gap-y-1 border-t border-dashed border-neutral-300 pt-2 text-xs">
              {card.settings.map((s) => (
                <span
                  key={s.key}
                  className={
                    s.offDefault
                      ? "rounded bg-amber-50 px-1.5 py-0.5 text-[color:var(--color-draft)]"
                      : "text-neutral-600"
                  }
                >
                  {s.label}: <span className="font-medium">{formatSettingValue(s.value)}</span>
                </span>
              ))}
            </p>
          )}
        </section>
      </aside>
    </div>
  );
}
