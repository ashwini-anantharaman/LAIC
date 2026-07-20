/**
 * People & Roles — Bridge's own role administration (spec: roles are Bridge's
 * pre-built vocabulary; assignment happens HERE, storage stays in Nexus so
 * org-portal logins and test-as resolve identically). Program admins arrive
 * from Nexus already holding bridge_program_admin; everyone else is assigned
 * one of the pre-built roles below.
 */
import { hasAnyRole, roleLabel } from "@bridge/nexus-client";
import type { BridgeRole } from "@laic/learner-contracts";
import { redirect } from "next/navigation";
import { setBridgeRoleAction } from "./actions";
import { getBridgeContext, nexusMode } from "@/lib/nexus";
import { listBridgePeople, nexusProgramId } from "@/lib/nexusPeople";

const MANAGER_ROLES: readonly BridgeRole[] = [
  "bridge_program_admin",
  "bridge_org_admin",
  "bridge_club_admin",
];

const ASSIGNABLE_ROLES: readonly BridgeRole[] = [
  "bridge_org_admin",
  "bridge_club_admin",
  "bridge_coach",
  "bridge_reviewer",
  "bridge_fellow",
  "bridge_learner",
  "bridge_guest",
];

export default async function PeoplePage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  if (!hasAnyRole(context, MANAGER_ROLES)) redirect("/bridge/home");

  const programId = nexusProgramId(context);

  if (nexusMode() === "stub" || !programId) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">People &amp; Roles</h1>
        <p className="text-sm text-neutral-600">
          Role assignment needs a live Nexus connection — launch Bridge from the
          Nexus console (http mode) to manage who holds which role. In stub mode
          the seeded personas already carry their roles.
        </p>
      </div>
    );
  }

  const people = await listBridgePeople(programId);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">People &amp; Roles</h1>
        <p className="text-sm text-neutral-600">
          Everyone in this program, and the Bridge role they hold. Roles are
          Bridge&apos;s pre-built set; assignments are stored in Nexus, so the same
          person signs in with the same access from their organization&apos;s portal.
        </p>
      </header>

      <section className="overflow-hidden rounded-lg border border-neutral-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-2.5 font-medium">Person</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Bridge role</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.email ?? p.display_name ?? Math.random()} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2.5">
                  <span className="font-medium">{p.display_name ?? "—"}</span>
                  <span className="block text-xs text-neutral-500">{p.email}</span>
                </td>
                <td className="px-4 py-2.5 text-neutral-600">{p.status}</td>
                <td className="px-4 py-2.5">
                  {p.is_admin ? (
                    <span className="text-neutral-700">
                      {roleLabel("bridge_program_admin")}{" "}
                      <span className="text-xs text-neutral-400">(via Nexus admin)</span>
                    </span>
                  ) : (
                    <form action={setBridgeRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="email" value={p.email ?? ""} />
                      <select
                        name="role"
                        defaultValue={p.bridge_role ?? "none"}
                        className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm"
                      >
                        <option value="none">No Bridge role</option>
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {roleLabel(r)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:border-emerald-400 hover:text-neutral-900"
                      >
                        Save
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {people.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-sm text-neutral-500">
                  No people in this program yet — invite them from the Nexus console.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-neutral-400">
        Program administrators hold Program Admin through their Nexus role and
        are managed from the Nexus console, not here.
      </p>
    </div>
  );
}
