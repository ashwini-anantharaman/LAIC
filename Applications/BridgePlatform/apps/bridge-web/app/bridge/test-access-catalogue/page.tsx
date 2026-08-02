import { ACCESS_FEATURES, rolesFor } from "@bridge/access";
import { CAPABILITY_SETS, DEFAULT_ASSIGNMENT } from "@bridge/access/sets";
import type { BridgeRole } from "@laic/learner-contracts";
import Link from "next/link";
import { redirect } from "next/navigation";
import { canEditCatalogue, getCatalogue, requireFeature } from "@/lib/access";
import { getBridgeContext, isFellowDemo } from "@/lib/nexus";
import { TestCatalogueClient } from "./TestCatalogueClient";

/** Test access catalogue (experiment): the capability-set designer wired to the
 *  live enforced catalogue. Assign SETS to roles, watch it compile to the real
 *  34-key matrix, optionally write it to the live catalogue. Gated behind the
 *  governance page (page.teams) — it's a teams/roles experiment. */
export default async function TestAccessCataloguePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ applied?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  // Hidden on the fellows-testing deployment, exactly like the teams page.
  if (await isFellowDemo()) redirect("/bridge/table");
  await requireFeature(context, "page.teams");

  const [catalogue, params] = await Promise.all([getCatalogue(), searchParams]);
  const canEdit = canEditCatalogue(context);

  // The live rules per key, resolved through the current catalogue (explicit
  // override or the feature default) — the target the compiled matrix is
  // compared against.
  const liveRules: Record<string, BridgeRole[]> = {};
  for (const feature of ACCESS_FEATURES) {
    liveRules[feature.key] = [...rolesFor(catalogue, feature.key)];
  }

  const sets = CAPABILITY_SETS.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    featureKeys: [...s.featureKeys],
  }));
  const features = ACCESS_FEATURES.map((f) => ({
    key: f.key,
    label: f.label,
    group: f.group,
    kind: f.kind,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Test access catalogue</h1>
          <Link
            href="/bridge/teams"
            className="text-sm text-emerald-700 hover:text-emerald-800 hover:underline"
          >
            ← Teams &amp; roles
          </Link>
        </div>
        <p className="text-sm text-neutral-600">
          An experiment combining the capability-set designer with the live enforced catalogue:
          assign whole <em>sets</em> to roles, watch the assignment compile down to the real
          34-key feature matrix the app enforces, and — if you can edit — write that compiled
          matrix straight to the live catalogue.
        </p>
      </header>

      {params.applied && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          Compiled matrix written to the live access catalogue. The navigation re-gated everywhere.
        </p>
      )}

      <TestCatalogueClient
        sets={sets}
        assignment={DEFAULT_ASSIGNMENT}
        liveRules={liveRules}
        canEdit={canEdit}
        features={features}
      />
    </div>
  );
}
