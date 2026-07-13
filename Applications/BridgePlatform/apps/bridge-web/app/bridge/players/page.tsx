import { BEGINNER_NATURAL_PACKAGE_ID } from "@bridge/knowledge";
import { packagePresets } from "@bridge/profiles";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  configureFromSandboxAction,
  createSandboxAction,
  customizeProfile,
  customizeScope,
  updateScope,
} from "@/app/bridge/players/actions";
import { canEditProfile } from "@bridge/profiles";
import { getBridgeContext } from "@/lib/nexus";
import { profileService } from "@/lib/profiles";
import { latestPackage } from "@/lib/sessions";

export default async function PlayersPage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const service = await profileService();
  const profiles = await service.listProfiles(context);
  const scopes = await service.listScopes(context);
  const sandboxes = await service.listSandboxes(context);
  const pkg = await latestPackage(BEGINNER_NATURAL_PACKAGE_ID);
  const presets = packagePresets(pkg);
  const canCoach = ["coach", "reviewer", "admin"].includes(context.accessLevel);
  const settingLabel = (key: string) => pkg.settings.find((s) => s.key === key)?.label ?? key;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Players & Configurations
      </h1>
      <p className="text-sm text-neutral-600">
        AI player profiles are a generated package version + preset + your overrides
        (hashed for replay stability). System profiles are read-only —
        customize to make your own copy.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {profiles.map((p) => (
          <li key={p.aiPlayerProfileId} className="rounded-lg border border-neutral-200 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <Link
                href={`/bridge/players/${p.aiPlayerProfileId}`}
                className="font-medium text-emerald-800 hover:underline"
              >
                {p.name}
              </Link>
              <span className="shrink-0 rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                {p.ownerType}
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              {p.packageRef.packageId}@{p.packageRef.version} · config{" "}
              <span className="font-mono">{p.resolvedValueHash}</span>
            </p>
            {p.description && <p className="mt-1 text-sm text-neutral-600">{p.description}</p>}
            <form action={customizeProfile} className="mt-2">
              <input type="hidden" name="profileId" value={p.aiPlayerProfileId} />
              <button className="text-xs text-emerald-700 underline-offset-2 hover:underline">
                Customize (copy into my profiles)
              </button>
            </form>
          </li>
        ))}
      </ul>
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
          Sandboxes — configure a player the easy way
        </h2>
        <p className="text-sm text-neutral-600">
          A coach picks which settings are on the table; you flip just those
          toggles and get your own player. Everything else stays locked to the
          coach’s baseline — enforced, not just hidden.
        </p>
        {sandboxes.length === 0 && (
          <p className="text-sm text-neutral-500">
            No sandboxes yet{canCoach ? " — create one below." : " — ask your coach to publish one."}
          </p>
        )}
        <ul className="space-y-3">
          {sandboxes.map((sb) => (
            <li key={sb.sandboxId} className="rounded-lg border border-emerald-200 bg-[#fffefb] p-4 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{sb.name}</p>
                <p className="text-xs text-neutral-400">
                  base: {presets.find((p) => p.presetId === sb.basePresetId)?.name ?? "package defaults"} ·{" "}
                  {sb.packageRef.packageId}@{sb.packageRef.version}
                </p>
              </div>
              {sb.description && <p className="mt-0.5 text-sm text-neutral-600">{sb.description}</p>}
              <form action={configureFromSandboxAction} className="mt-2 space-y-2">
                <input type="hidden" name="sandboxId" value={sb.sandboxId} />
                <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                  {sb.exposedSettingKeys.map((key) => {
                    const setting = pkg.settings.find((s) => s.key === key);
                    const baseline = Boolean(
                      sb.baseOverrides[key] ??
                        presets.find((p) => p.presetId === sb.basePresetId)?.values[key] ??
                        setting?.default,
                    );
                    return (
                      <label key={key} className="flex items-center gap-1.5 text-sm" title={setting?.description}>
                        <input type="checkbox" name={`setting:${key}`} defaultChecked={baseline} />
                        {settingLabel(key)}
                      </label>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    name="name"
                    placeholder={`My ${sb.name} player`}
                    className="w-64 rounded border border-neutral-300 px-2 py-1 text-sm"
                  />
                  <button className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-800">
                    Create my player
                  </button>
                </div>
              </form>
            </li>
          ))}
        </ul>
        {canCoach && (
          <details className="rounded-lg border border-neutral-200 p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Create a sandbox (coach) — choose what your learners may touch
            </summary>
            <form action={createSandboxAction} className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                <input
                  name="name"
                  required
                  placeholder="Sandbox name (e.g. Week 3 — the 1NT toolkit)"
                  className="w-80 rounded border border-neutral-300 px-2 py-1 text-sm"
                />
                <select name="basePresetId" className="rounded border border-neutral-300 px-2 py-1 text-sm">
                  {presets.map((p) => (
                    <option key={p.presetId} value={p.presetId}>
                      base: {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <input
                name="description"
                placeholder="What this week is about (optional)"
                className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
              />
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Exposed settings — learners may flip ONLY these
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                {pkg.settings.map((s) => (
                  <label key={s.key} className="flex items-center gap-1.5 text-sm" title={s.description}>
                    <input type="checkbox" name="exposed" value={s.key} />
                    {s.label}
                    <span className="text-[10px] text-neutral-400">{s.module}</span>
                  </label>
                ))}
              </div>
              <button className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-800">
                Publish sandbox
              </button>
            </form>
          </details>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
          Teaching scopes (your levels, your judgment)
        </h2>
        <p className="text-sm text-neutral-600">
          There is no objective "Level 1" — system entries are fellow-suggested
          defaults. Customize one to define what a level means for your
          learners; practice dealing follows your scope.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {scopes.map((s) => {
            const editable = canEditProfile(s, context);
            return (
              <li key={s.teachingScopeId} className="rounded-lg border border-neutral-200 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{s.name}</span>
                  <span className="shrink-0 rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                    {s.ownerType === "system" ? "suggested default" : s.ownerType}
                  </span>
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  dealer must:{" "}
                  {s.evaluatorFilter.requireSystemicActionIn?.join(" / ") ?? "—"}
                  {s.evaluatorFilter.rejectIfSystemicActionIn?.length
                    ? ` · never: ${s.evaluatorFilter.rejectIfSystemicActionIn.join(" / ")}`
                    : ""}
                  {s.derivedFromItemId ? ` · suggested by ${s.derivedFromItemId}` : ""}
                </p>
                {editable ? (
                  <form action={updateScope} className="mt-2 space-y-1">
                    <input type="hidden" name="scopeId" value={s.teachingScopeId} />
                    <input name="name" defaultValue={s.name} className="w-full rounded border border-neutral-300 px-2 py-1 text-xs" />
                    <input name="requireIn" defaultValue={s.evaluatorFilter.requireSystemicActionIn?.join(",") ?? ""} placeholder="dealer action in (e.g. 1C,1D,1H,1S)" className="w-full rounded border border-neutral-300 px-2 py-1 text-xs" />
                    <input name="rejectIn" defaultValue={s.evaluatorFilter.rejectIfSystemicActionIn?.join(",") ?? ""} placeholder="never (e.g. 1N)" className="w-full rounded border border-neutral-300 px-2 py-1 text-xs" />
                    <button className="rounded bg-neutral-800 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-900">Save my level</button>
                  </form>
                ) : (
                  <form action={customizeScope} className="mt-2">
                    <input type="hidden" name="scopeId" value={s.teachingScopeId} />
                    <button className="text-xs text-emerald-700 underline-offset-2 hover:underline">
                      Customize (make this my judgment)
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
