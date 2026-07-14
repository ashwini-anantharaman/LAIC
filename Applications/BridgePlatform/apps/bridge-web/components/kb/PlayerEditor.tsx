// The player configuration editor (Stage E): packs pick items, settings tune
// within, policy selects how the AI chooses among matches. The settings shown
// are exactly those declared by items the enabled packs carry.

import type { CompiledKb, KbPack, KbPlayer, KbSandbox } from "@bridge/kb";
import { PlayerSettingControl } from "./PlayerSettingControl";

export function PlayerEditor({
  kbId,
  player,
  packs,
  compiled,
  sandbox,
  action,
}: Readonly<{
  kbId: string;
  player: KbPlayer | null;
  packs: KbPack[];
  compiled: CompiledKb;
  sandbox: KbSandbox | null;
  action: (formData: FormData) => Promise<void>;
}>) {
  const enabled = new Set(
    player?.enabledPackIds.length ? player.enabledPackIds : [],
  );
  const values = { ...compiled.defaults, ...(player?.settingOverrides ?? {}) };

  // Settings visible = declared by items carried by the enabled packs (all
  // settings when nothing is enabled yet, so a new player sees the surface).
  const carried = new Set(
    compiled.packs
      .filter((p) => enabled.size === 0 || enabled.has(p.packId))
      .flatMap((p) => p.itemIds),
  );
  const visibleSettings = compiled.settings.filter((s) => carried.has(s.itemId));
  const exposedKeys = sandbox ? new Set(sandbox.exposedSettingKeys) : null;
  const exposedPacks = sandbox
    ? new Set([...sandbox.basePackIds, ...sandbox.exposedPackIds])
    : null;

  const label = "mb-0.5 block text-[11px] text-neutral-500";

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="kbId" value={kbId} />
      {player && <input type="hidden" name="playerId" value={player.playerId} />}
      {sandbox && <input type="hidden" name="sandboxId" value={sandbox.sandboxId} />}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm sm:col-span-2">
          <span className={label}>Name</span>
          <input
            name="name"
            required
            defaultValue={player?.name ?? ""}
            className="w-full rounded border border-neutral-300 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className={label}>Decision policy</span>
          <select
            name="decisionPolicyId"
            defaultValue={player?.decisionPolicyId ?? "first_match"}
            className="w-full rounded border border-neutral-300 px-2 py-1.5"
          >
            <option value="first_match">first match (deterministic)</option>
            <option value="weighted_random">weighted random (variety)</option>
            <option value="level_capped">level capped (plays down)</option>
          </select>
        </label>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Capability packs</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {packs.map((pack) => {
            const locked = sandbox ? sandbox.basePackIds.includes(pack.packId) : false;
            const allowed = exposedPacks ? exposedPacks.has(pack.packId) : true;
            return (
              <label
                key={pack.packId}
                className={`flex items-start gap-2 rounded border px-3 py-2 text-sm ${
                  allowed ? "border-neutral-200" : "border-neutral-100 text-neutral-400"
                }`}
              >
                <input
                  type="checkbox"
                  name="enabledPackIds"
                  value={pack.packId}
                  defaultChecked={locked || enabled.has(pack.packId)}
                  disabled={locked || !allowed}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">{pack.name}</span>
                  {locked && <span className="ml-2 text-[10px] uppercase text-neutral-400">sandbox base</span>}
                  {!allowed && <span className="ml-2 text-[10px] uppercase text-neutral-400">not exposed</span>}
                  {pack.description && (
                    <span className="block text-xs text-neutral-500">{pack.description}</span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
        {sandbox && (
          <p className="mt-1 text-xs text-neutral-400">
            Sandbox &ldquo;{sandbox.name}&rdquo;: base packs are always on; only exposed packs and
            settings can change (enforced on the server, not just here).
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Settings</legend>
        {visibleSettings.length === 0 ? (
          <p className="text-sm text-neutral-500">The enabled packs expose no settings.</p>
        ) : (
          <div className="divide-y divide-[var(--line)] rounded-lg border border-neutral-200 bg-[var(--card)]">
            {visibleSettings.map((spec) => {
              const sandboxLocked = exposedKeys ? !exposedKeys.has(spec.key) : false;
              return (
                <div key={spec.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <div className="min-w-48">
                    <p className="text-sm font-medium">{spec.label}</p>
                    <p className="text-[11px] text-neutral-400">
                      from {spec.itemTitle}
                      {spec.role === "enable" ? " · gates its rules" : " · parameter"}
                    </p>
                  </div>
                  <div className={sandboxLocked ? "pointer-events-none opacity-40" : ""}>
                    <PlayerSettingControl spec={spec} value={values[spec.key]!} />
                  </div>
                  {sandboxLocked && (
                    <span className="text-[10px] uppercase text-neutral-400">coach-fixed</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </fieldset>

      <button
        type="submit"
        className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
      >
        {player ? "Save & revalidate" : "Create player"}
      </button>
    </form>
  );
}
