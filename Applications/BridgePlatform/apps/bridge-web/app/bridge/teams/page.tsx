import {
  ACCESS_FEATURES,
  ALL_BRIDGE_ROLES,
  rolesFor,
  type AccessFeature,
} from "@bridge/access";
import { canAccessAdminArea, roleLabel } from "@bridge/nexus-client";
import type { BridgeRole } from "@laic/learner-contracts";
import { redirect } from "next/navigation";
import { saveCatalogueAction, resetCatalogueAction } from "./actions";
import { ConfirmButton } from "@/components/kb/ConfirmButton";
import { canEditCatalogue, getCatalogue, requireFeature } from "@/lib/access";
import { getBridgeContext, isFellowDemo } from "@/lib/nexus";
import { profileService } from "@/lib/profiles";

/** Compact column headers — the matrix is 8 roles wide. Full name in title. */
const SHORT_ROLE: Record<BridgeRole, string> = {
  bridge_program_admin: "Prog",
  bridge_org_admin: "Org",
  bridge_club_admin: "Club",
  bridge_coach: "Coach",
  bridge_reviewer: "Rev",
  bridge_fellow: "Fellow",
  bridge_learner: "Learn",
  bridge_guest: "Guest",
};

/** Feature groups, in ACCESS_FEATURES declaration order. */
function groupFeatures(): { group: string; features: AccessFeature[] }[] {
  const order: string[] = [];
  const byGroup = new Map<string, AccessFeature[]>();
  for (const f of ACCESS_FEATURES) {
    if (!byGroup.has(f.group)) {
      byGroup.set(f.group, []);
      order.push(f.group);
    }
    byGroup.get(f.group)!.push(f);
  }
  return order.map((group) => ({ group, features: byGroup.get(group)! }));
}

function differsFromDefault(
  roles: readonly BridgeRole[],
  defaults: readonly BridgeRole[],
): boolean {
  if (roles.length !== defaults.length) return true;
  const set = new Set(defaults);
  return roles.some((r) => !set.has(r));
}

/** Teams & roles (2026-08): the real access-catalogue editor. Who sees and uses
 *  each gated page/feature, per role. A checked cell = that role sees and may
 *  use the feature; unchecked = hidden in the nav AND blocked server-side. */
export default async function TeamsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ saved?: string; reset?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  // Hidden on the fellows-testing deployment.
  if (await isFellowDemo()) redirect("/bridge/table");
  if (!canAccessAdminArea(context)) redirect("/bridge/home");
  // The catalogue may hide even this page.
  await requireFeature(context, "page.teams");

  const [org, catalogue, params] = await Promise.all([
    profileService().getOrgProfile(context),
    getCatalogue(),
    searchParams,
  ]);
  const canEdit = canEditCatalogue(context);
  const groups = groupFeatures();
  const hasOverrides = Object.keys(catalogue.rules).length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Teams &amp; roles</h1>
        <p className="text-sm text-neutral-600">
          Who can see and do what across the Bridge Platform.
        </p>
      </header>

      {params.saved && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          Access catalogue saved. The navigation re-gated everywhere.
        </p>
      )}
      {params.reset && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          Access catalogue reset to the built-in defaults.
        </p>
      )}

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-2 font-medium">You</h2>
        <p className="text-sm text-neutral-600">
          <span className="font-mono text-xs">{context.nexusUserId}</span>
        </p>
        <p className="mt-2 flex flex-wrap gap-1.5">
          {context.roles.map((role) => (
            <span
              key={role}
              className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800"
            >
              {roleLabel(role)}
            </span>
          ))}
        </p>
        <p className="mt-2 text-sm text-neutral-600">
          {context.programOrganizationId
            ? `Active organization: ${context.programOrganizationId}`
            : "Program-level access"}
        </p>
      </section>

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-1 font-medium">
          Organization{context.programOrganizationId ? ` — ${context.programOrganizationId}` : ""}
        </h2>
        {!context.programOrganizationId ? (
          <p className="text-sm text-neutral-500">
            You are operating at program level (no single organization) — org profiles are
            per-organization.
          </p>
        ) : (
          <p className="text-sm text-neutral-600">
            {org
              ? `Type ${org.bridgeOrgType} · AI players ${org.allowAiPlayers ? "allowed" : "disabled"} · BEN ${org.allowBenPlayers ? "allowed" : "off"} · systems: ${org.allowedBiddingSystems.join(", ") || "all"}`
              : "No bridge org profile configured yet."}{" "}
            Manage it on the Organization page.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-neutral-200 p-4">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Access catalogue</h2>
          <p className="text-xs text-neutral-500">
            {catalogue.updatedAt ? (
              <>
                Last saved by <span className="font-mono">{catalogue.updatedBy ?? "unknown"}</span>{" "}
                on {new Date(catalogue.updatedAt).toLocaleString()}.
                {!hasOverrides && " Currently the built-in defaults."}
              </>
            ) : (
              "Currently the built-in defaults."
            )}
          </p>
        </div>
        <p className="mb-3 text-sm text-neutral-600">
          A checked cell means that role sees and may use the feature. Unchecked means it is hidden
          from the navigation <em>and</em> blocked server-side. A{" "}
          <span className="text-amber-600">±</span> marks a row that differs from the built-in
          default.
        </p>
        {!canEdit && (
          <p className="mb-3 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            Read-only — org or program admins can edit.
          </p>
        )}

        <form action={saveCatalogueAction} className="space-y-6">
          {groups.map(({ group, features }) => (
            <div key={group}>
              <h3 className="mb-1.5 text-sm font-semibold text-neutral-700">{group}</h3>
              <div className="overflow-x-auto rounded border border-neutral-200">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-500">
                      <th className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 text-left font-medium">
                        Feature
                      </th>
                      {ALL_BRIDGE_ROLES.map((role) => (
                        <th
                          key={role}
                          title={roleLabel(role)}
                          className="px-2 py-2 text-center font-medium"
                        >
                          {SHORT_ROLE[role]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {features.map((feature) => {
                      const current = rolesFor(catalogue, feature.key);
                      const differs = differsFromDefault(current, feature.defaultRoles);
                      return (
                        <tr
                          key={feature.key}
                          className="border-b border-neutral-100 last:border-b-0"
                        >
                          <td className="sticky left-0 z-10 bg-white px-3 py-2 align-top">
                            <span className="flex items-center gap-1.5 font-medium text-neutral-800">
                              {feature.label}
                              {feature.kind === "page" && (
                                <span className="rounded bg-neutral-100 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                                  page
                                </span>
                              )}
                              {differs && (
                                <span
                                  className="text-amber-600"
                                  title="Differs from the built-in default"
                                >
                                  ±
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block text-xs font-normal text-neutral-500">
                              {feature.description}
                            </span>
                          </td>
                          {ALL_BRIDGE_ROLES.map((role) => (
                            <td key={role} className="px-2 py-2 text-center align-middle">
                              <input
                                type="checkbox"
                                name={`${feature.key}::${role}`}
                                defaultChecked={current.includes(role)}
                                disabled={!canEdit}
                                aria-label={`${feature.label} — ${roleLabel(role)}`}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {canEdit && (
            <button className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
              Save catalogue
            </button>
          )}
        </form>

        {canEdit && (
          <div className="mt-3 border-t border-neutral-100 pt-3">
            <ConfirmButton
              action={resetCatalogueAction}
              hidden={{}}
              confirm="Reset the access catalogue to the built-in defaults? This clears every override."
              label="Reset to defaults"
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
            />
          </div>
        )}
      </section>
    </div>
  );
}
