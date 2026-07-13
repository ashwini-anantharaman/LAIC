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
import { dependencyMet } from "@bridge/config";
import { ConventionCardView } from "@/components/ConventionCardView";
import { SettingControl, formatSettingValue } from "@/components/SettingControl";
import { PrintButton } from "@/components/PrintButton";
import { knowledgeStore } from "@/lib/knowledge";
import { getBridgeContext } from "@/lib/nexus";
import { profileService } from "@/lib/profiles";
import { latestPackage } from "@/lib/sessions";

export default async function ProfilePage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ profileId: string }>;
  searchParams: Promise<{ q?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const { profileId } = await params;
  const { q } = await searchParams;
  const service = await profileService();
  const profile = await service.getProfile(profileId, context);
  if (!profile) notFound();

  // The profile's PINNED package version — never silently "latest".
  const pinned = await knowledgeStore().getPackage(
    profile.packageRef.packageId,
    profile.packageRef.version,
  );
  const pkg = pinned?.pkg ?? (await latestPackage(BEGINNER_NATURAL_PACKAGE_ID));
  const sandbox = profile.sandboxId ? await service.getSandbox(profile.sandboxId, context) : null;
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
      {/* GET form for the settings search box (lives inside the save form). */}
      <form id="setting-search" method="get" />
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
          {sandbox && (
            <p className="rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              Configured inside the “{sandbox.name}” sandbox — only the settings
              your coach exposed can be changed; the rest are locked to the
              sandbox baseline (enforced server-side).
            </p>
          )}
          <p className="flex items-center gap-2">
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search settings… (press Enter)"
              className="w-72 rounded border border-neutral-300 px-2 py-1 text-sm"
              form="setting-search"
            />
            <span className="text-xs text-neutral-400">
              amber dot = differs from the preset baseline
            </span>
          </p>
          <div className="space-y-3">
            {Object.entries(
              pkg.settings
                .filter((s) => !sandbox || sandbox.exposedSettingKeys.includes(s.key))
                .filter(
                  (s) =>
                    !q ||
                    `${s.label} ${s.description} ${s.key} ${s.module}`
                      .toLowerCase()
                      .includes(q.toLowerCase()),
                )
                .reduce<Record<string, typeof pkg.settings>>((acc, s) => {
                  (acc[s.module] ??= [] as never).push(s as never);
                  return acc;
                }, {}),
            ).map(([module, settings]) => (
              <div key={module}>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
                  {module.replace(/_/g, " ")}
                </p>
                <div className="space-y-1">
                  {settings.map((s) => {
                    const presetBaseline =
                      presets.find((p) => p.presetId === profile.selectedPresetId)?.values[s.key] ??
                      s.default;
                    const modified =
                      JSON.stringify(values[s.key]) !== JSON.stringify(presetBaseline);
                    const enabled = dependencyMet(s, (k) => values[k]);
                    return (
                      <label
                        key={s.key}
                        className={`flex flex-wrap items-center gap-2 text-sm ${enabled ? "" : "opacity-50"}`}
                        title={
                          enabled
                            ? s.description
                            : `Requires ${s.depends_on?.key} — currently gated off`
                        }
                      >
                        <SettingControl setting={s} value={values[s.key]!} disabled={!enabled} />
                        <span>{s.label}</span>
                        {modified && (
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"
                            title="Differs from the preset baseline"
                          />
                        )}
                        {s.uiOnly && (
                          <span
                            className="rounded bg-neutral-100 px-1 text-[10px] text-neutral-400"
                            title="Recorded as a partnership agreement; no rule consumes it yet"
                          >
                            not yet wired
                          </span>
                        )}
                        <span className="rounded bg-neutral-100 px-1 text-[10px] text-neutral-400">
                          {s.skill_level}
                        </span>
                        <span className="text-xs text-neutral-400">— {s.description}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
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

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
            Convention card (generated from settings — derived, never hand-edited)
          </h2>
          <PrintButton />
        </div>
        <ConventionCardView
          card={card}
          defaults={Object.fromEntries(pkg.settings.map((s) => [s.key, s.default]))}
        />
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
