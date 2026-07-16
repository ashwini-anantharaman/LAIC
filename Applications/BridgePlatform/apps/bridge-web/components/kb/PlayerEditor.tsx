"use client";

// The player configuration editor (Stage E): packs pick items, settings tune
// within, policy selects how the AI chooses among matches. The settings shown
// are exactly those declared by items the CHECKED packs carry — the list
// follows the checkboxes live, so the packs→settings dependency is visible
// while editing, not only after save.

import type { CompiledKb, KbPack, KbPlayer, KbSandbox } from "@bridge/kb";
import { useMemo, useState } from "react";
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
  const values = { ...compiled.defaults, ...(player?.settingOverrides ?? {}) };
  const exposedKeys = sandbox ? new Set(sandbox.exposedSettingKeys) : null;
  const exposedPacks = sandbox
    ? new Set([...sandbox.basePackIds, ...sandbox.exposedPackIds])
    : null;
  const lockedPacks = useMemo(
    () => new Set(sandbox?.basePackIds ?? []),
    [sandbox],
  );

  const [checked, setChecked] = useState<Set<string>>(
    () =>
      new Set([
        ...(player?.enabledPackIds ?? []),
        ...(sandbox?.basePackIds ?? []),
      ]),
  );
  const togglePack = (packId: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(packId)) next.delete(packId);
      else next.add(packId);
      return next;
    });

  // Settings visible = declared by items the checked packs carry (live).
  const visibleSettings = useMemo(() => {
    const carried = new Set(
      compiled.packs.filter((p) => checked.has(p.packId)).flatMap((p) => p.itemIds),
    );
    return compiled.settings.filter((s) => carried.has(s.itemId));
  }, [compiled, checked]);

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
        <p className="mb-2 text-xs text-neutral-500">
          Packs decide what the player <em>carries</em>; the settings below tune within that.
          Unchecking a pack removes its knowledge — and its settings — from this player.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {packs.map((pack) => {
            const locked = lockedPacks.has(pack.packId);
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
                  checked={locked || checked.has(pack.packId)}
                  onChange={() => togglePack(pack.packId)}
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
          <p className="text-sm text-neutral-500">
            {checked.size === 0
              ? "Enable a pack — the settings its knowledge exposes appear here."
              : "The enabled packs expose no settings."}
          </p>
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

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          name="saveAs"
          value={player ? "existing" : "new"}
          className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {player ? "Save changes" : "Create player"}
        </button>
        {player && (
          <>
            <button
              type="submit"
              name="saveAs"
              value="new"
              className="rounded border border-neutral-300 px-4 py-1.5 text-sm hover:border-emerald-400"
            >
              Save as a new player
            </button>
            <span className="text-xs text-neutral-400">
              — leaves “{player.name}” untouched
            </span>
          </>
        )}
      </div>
    </form>
  );
}
