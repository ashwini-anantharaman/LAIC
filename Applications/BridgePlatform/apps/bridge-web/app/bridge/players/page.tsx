import Link from "next/link";
import { redirect } from "next/navigation";
import { customizeProfile, customizeScope, updateScope } from "@/app/bridge/players/actions";
import { canEditProfile } from "@bridge/profiles";
import { getBridgeContext } from "@/lib/nexus";
import { profileService } from "@/lib/profiles";

export default async function PlayersPage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const service = await profileService();
  const profiles = await service.listProfiles(context);
  const scopes = await service.listScopes(context);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Players & Configurations
      </h1>
      <p className="text-sm text-neutral-600">
        AI player profiles are a published package + preset + your overrides
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
