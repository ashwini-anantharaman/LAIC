import { canAccessAdminArea, roleLabel } from "@bridge/nexus-client";
import type { BridgeRole } from "@laic/learner-contracts";
import { redirect } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { getBridgeContext, isFellowDemo } from "@/lib/nexus";
import { profileService } from "@/lib/profiles";

/** Every Bridge role, in rank order — columns of the visibility table. */
const ALL_ROLES: readonly BridgeRole[] = [
  "bridge_program_admin",
  "bridge_org_admin",
  "bridge_club_admin",
  "bridge_coach",
  "bridge_reviewer",
  "bridge_fellow",
  "bridge_learner",
  "bridge_guest",
];

const MOCK_PERMISSIONS = [
  "Edit knowledge",
  "Review suggestions",
  "Manage players",
  "Manage organization",
] as const;

/** Teams & roles (2026-07-22): a truthful preview. The "you" card and the
 *  area-visibility table reflect real context and real nav gates; the
 *  per-role permission matrix is a mock of what's planned. */
export default async function TeamsPage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  // Hidden on the fellows-testing deployment.
  if (await isFellowDemo()) redirect("/bridge/table");
  if (!canAccessAdminArea(context)) redirect("/bridge/home");
  const org = await profileService().getOrgProfile(context);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Teams & roles</h1>
        <p className="text-sm text-neutral-600">
          Who can see and do what across the Bridge Platform.
        </p>
      </header>

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Team management is coming soon — this shows what exists today and a mock of what&apos;s
        planned.
      </p>

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
        {context.permissions.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
            {context.permissions.map((p) => (
              <li key={p} className="font-mono">
                {p}
              </li>
            ))}
          </ul>
        )}
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
        <h2 className="mb-2 font-medium">Area visibility</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Which navigation areas each role can see today — computed from the live nav gates.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <th className="py-1.5 pr-3 font-medium">Area</th>
                {ALL_ROLES.map((role) => (
                  <th key={role} className="px-2 py-1.5 text-center font-medium">
                    {roleLabel(role)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NAV_ITEMS.map((item) => (
                <tr key={item.href} className="border-b border-neutral-100 last:border-b-0">
                  <td className="py-1.5 pr-3 font-medium">{item.label}</td>
                  {ALL_ROLES.map((role) => (
                    <td key={role} className="px-2 py-1.5 text-center">
                      {!item.requiresRoles || item.requiresRoles.includes(role) ? (
                        <span className="text-emerald-700">✓</span>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-2 flex items-center gap-2 font-medium">
          Per-role permissions
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Mock — not yet functional
          </span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <th className="py-1.5 pr-3 font-medium">Permission</th>
                {ALL_ROLES.map((role) => (
                  <th key={role} className="px-2 py-1.5 text-center font-medium">
                    {roleLabel(role)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_PERMISSIONS.map((permission) => (
                <tr key={permission} className="border-b border-neutral-100 last:border-b-0">
                  <td className="py-1.5 pr-3 font-medium">{permission}</td>
                  {ALL_ROLES.map((role) => (
                    <td key={role} className="px-2 py-1.5 text-center">
                      <input type="checkbox" disabled />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
