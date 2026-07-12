import { BEGINNER_NATURAL_PACKAGE_ID, resolveRuleProvenance } from "@bridge/knowledge";
import {
  canEditProfile,
  generateConventionCard,
  packagePresets,
  resolveProfileValues,
} from "@bridge/profiles";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { customizeProfile, updateProfile } from "@/app/bridge/players/actions";
import { knowledgeStore } from "@/lib/knowledge";
import { getBridgeContext } from "@/lib/nexus";
import { profileService } from "@/lib/profiles";
import { latestPackage } from "@/lib/sessions";

export default async function ProfilePage({
  params,
}: Readonly<{ params: Promise<{ profileId: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const { profileId } = await params;
  const profile = await (await profileService()).getProfile(profileId, context);
  if (!profile) notFound();

  const pkg = await latestPackage(BEGINNER_NATURAL_PACKAGE_ID);
  const presets = packagePresets(pkg); // §11.3: presets ship IN the package
  const { values } = resolveProfileValues(
    pkg.settings,
    profile.selectedPresetId,
    profile.valueOverrides,
    presets,
  );
  const card = generateConventionCard(pkg, values, profile.name);
  const editable = canEditProfile(profile, context);

  // "Rules this player follows": resolve every card entry to its knowledge
  // items + citations (the readable, cited rule set — locked decision 6).
  const kstore = knowledgeStore();
  const ruleDetails = new Map<string, { rule: string; citations: string[] }>();
  for (const section of card.sections) {
    for (const e of section.entries) {
      const p = await resolveRuleProvenance(kstore, pkg.packageId, pkg.version, e.ruleId);
      if (p) {
        const primary = p.items.find((i) => i.itemId === e.knowledgeItemIds[0]);
        ruleDetails.set(e.ruleId, {
          rule: primary?.humanReadableRule ?? "",
          citations: p.citations.map((c) => `${c.sourceId}: ${c.passage}`),
        });
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{profile.name}</h1>
        <p className="text-xs text-neutral-500">
          {profile.ownerType} profile · {pkg.packageId}@{pkg.version} · config{" "}
          <span className="font-mono">{profile.resolvedValueHash}</span>
          {!editable && " · read-only"}
        </p>
      </header>

      {editable ? (
        <form action={updateProfile} className="space-y-3 rounded-lg border border-neutral-200 p-4">
          <input type="hidden" name="profileId" value={profile.aiPlayerProfileId} />
          <div className="flex items-center gap-2">
            <input
              name="name"
              defaultValue={profile.name}
              className="rounded border border-neutral-300 px-2 py-1 text-sm"
            />
            <select
              name="presetId"
              defaultValue={profile.selectedPresetId}
              className="rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              {presets.map((p) => (
                <option key={p.presetId} value={p.presetId}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            {pkg.settings.map((s) => (
              <label key={s.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={`setting:${s.key}`}
                  defaultChecked={Boolean(values[s.key])}
                />
                <span>{s.label}</span>
                <span className="text-xs text-neutral-400">— {s.description}</span>
              </label>
            ))}
          </div>
          <button className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
            Save (re-resolves + re-hashes)
          </button>
        </form>
      ) : (
        <form action={customizeProfile}>
          <input type="hidden" name="profileId" value={profile.aiPlayerProfileId} />
          <button className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
            Customize (copy into my profiles)
          </button>
        </form>
      )}

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Convention card (generated from settings — derived, never hand-edited)
        </h2>
        <p className="mb-3 text-xs text-neutral-500">
          Settings: {card.settings.map((s) => `${s.label} = ${String(s.value)}`).join(" · ")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {card.sections.map((section) => (
            <div key={section.title}>
              <h3 className="mb-1 text-sm font-semibold">{section.title}</h3>
              <ul className="space-y-1 text-sm">
                {section.entries.map((e) => (
                  <li key={e.ruleId} className={e.active ? "" : "text-neutral-400 line-through"}>
                    {e.label}
                    {!e.active && <span className="ml-1 text-xs no-underline">(off)</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Rules this player follows (readable, cited)
        </h2>
        <ul className="space-y-3">
          {card.sections.flatMap((section) =>
            section.entries.map((e) => {
              const d = ruleDetails.get(e.ruleId);
              return (
                <li key={e.ruleId} className={e.active ? "" : "opacity-50"}>
                  <p className="text-sm font-medium">
                    {e.label}{" "}
                    <span className="text-xs font-normal text-neutral-400">
                      {e.active ? "" : "(inactive under this configuration)"}
                    </span>
                  </p>
                  {d?.rule && <p className="text-sm text-neutral-600">{d.rule}</p>}
                  {d?.citations.map((c, i) => (
                    <p key={i} className="text-xs text-neutral-400">
                      ↳ {c}
                    </p>
                  ))}
                </li>
              );
            }),
          )}
        </ul>
      </section>

      <Link href="/bridge/players" className="text-sm text-emerald-700 hover:underline">
        ← All profiles
      </Link>
    </div>
  );
}
