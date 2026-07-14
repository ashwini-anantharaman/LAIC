import { playerIsValid, validatePlayerStatic } from "@bridge/kb";
import { ValidityBadge } from "@/components/kb/badges";
import { kbService, kbStore } from "@/lib/kb";

/** Players on this KB. The builder/wizard arrives with the players stage of
 *  the rework; existing players already validate against the live compile. */
export default async function KbPlayersPage({
  params,
}: Readonly<{ params: Promise<{ kbId: string }> }>) {
  const { kbId } = await params;
  const [players, compiled] = await Promise.all([
    kbStore().listPlayersForKb(kbId),
    kbService().liveCompile(kbId),
  ]);

  return (
    <div className="max-w-3xl">
      {players.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No players built from this knowledge base yet. The player builder —
          with suggested minimal-incomplete and minimal-complete players — is
          the next stage of the rework.
        </p>
      ) : (
        <ul className="space-y-2">
          {players.map((p) => {
            const report = compiled ? validatePlayerStatic(compiled, p) : null;
            const status = report
              ? playerIsValid(report)
                ? "valid"
                : "invalid"
              : p.validationStatus;
            return (
              <li
                key={p.playerId}
                className="flex flex-wrap items-baseline gap-3 rounded-lg border border-neutral-200 bg-[var(--card)] px-4 py-3"
              >
                <span className="font-serif font-medium">{p.name}</span>
                <ValidityBadge status={status as never} />
                <span className="text-xs text-neutral-500">
                  {p.enabledPackIds.length} pack(s) · {Object.keys(p.settingOverrides).length}{" "}
                  override(s) · {p.decisionPolicyId}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
