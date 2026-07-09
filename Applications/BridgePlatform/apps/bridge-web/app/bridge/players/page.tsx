import Link from "next/link";
import { redirect } from "next/navigation";
import { customizeProfile } from "@/app/bridge/players/actions";
import { getBridgeContext } from "@/lib/nexus";
import { profileService } from "@/lib/profiles";

export default async function PlayersPage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const profiles = await (await profileService()).listProfiles(context);

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
    </div>
  );
}
