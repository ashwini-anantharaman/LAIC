/**
 * People & Roles — Bridge's own role administration (spec: roles are Bridge's
 * pre-built vocabulary; assignment happens HERE, storage stays in Nexus so
 * org-portal logins and test-as resolve identically). Program admins arrive
 * from Nexus already holding bridge_program_admin; everyone else is assigned
 * one of the pre-built roles below.
 */
import { hasAnyRole } from "@bridge/nexus-client";
import type { BridgeRole } from "@laic/learner-contracts";
import { redirect } from "next/navigation";
import { inviteBridgePersonAction, setBridgeRoleAction } from "./actions";
import { getBridgeContext, nexusMode } from "@/lib/nexus";
import { listBridgePeople, nexusProgramId } from "@/lib/nexusPeople";

const MANAGER_ROLES: readonly BridgeRole[] = [
  "bridge_program_admin",
  "bridge_org_admin",
  "bridge_club_admin",
];

const INVITER_ROLES: readonly BridgeRole[] = ["bridge_program_admin", "bridge_org_admin"];

// The simplified assignable set. Admin is NOT here — it comes from Nexus
// membership and is shown read-only. "Reviewer & Fellow" is one choice
// (stored as bridge_reviewer); the various admin roles collapse to "Admin".
const ASSIGNABLE_ROLES: { key: string; label: string }[] = [
  { key: "bridge_coach", label: "Coach" },
  { key: "bridge_reviewer", label: "Reviewer & Fellow" },
  { key: "bridge_learner", label: "Learner" },
];

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string; who?: string }>;
}) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  if (!hasAnyRole(context, MANAGER_ROLES)) redirect("/bridge/home");
  const canInvite = hasAnyRole(context, INVITER_ROLES);
  const { invited, who } = await searchParams;

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

      {invited ? (
        <section className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">
            {who ?? "They"} — invited. Share this activation link:
          </p>
          <code className="block break-all rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs text-neutral-700">
            {invited}
          </code>
          <p className="text-xs text-emerald-800">
            They set their password there, then sign in from the organization&apos;s
            portal — their Bridge role is already waiting.
          </p>
        </section>
      ) : null}

      {canInvite ? (
        <section className="rounded-lg border border-neutral-200 p-4">
          <h2 className="mb-2 font-medium">Invite a person</h2>
          <p className="mb-3 text-xs text-neutral-500">
            Creates a normal Nexus program invitation — they activate at the org
            portal. Pick a Bridge role now and it&apos;s applied the moment they join.
          </p>
          <form action={inviteBridgePersonAction} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Name
              <input
                name="displayName"
                placeholder="Jordan Lee"
                className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm text-neutral-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Email
              <input
                name="email"
                type="email"
                required
                placeholder="jordan@example.org"
                className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm text-neutral-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Bridge role
              <select
                name="role"
                defaultValue="bridge_learner"
                className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm"
              >
                <option value="none">None yet</option>
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-emerald-400 hover:text-neutral-900"
            >
              Invite
            </button>
          </form>
        </section>
      ) : null}

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
                    // Admin comes from Nexus membership (§3.5) — read-only here,
                    // and never editable (including your own row).
                    <span className="text-neutral-700">
                      Admin
                      <span className="block text-xs text-neutral-400">Program-level access</span>
                    </span>
                  ) : (
                    <form action={setBridgeRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="email" value={p.email ?? ""} />
                      <select
                        name="role"
                        defaultValue={ASSIGNABLE_ROLES.some((r) => r.key === p.bridge_role) ? (p.bridge_role as string) : "none"}
                        className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm"
                      >
                        <option value="none">No role</option>
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.label}
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
