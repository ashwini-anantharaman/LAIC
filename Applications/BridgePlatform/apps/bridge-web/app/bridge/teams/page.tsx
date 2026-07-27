/**
 * Teams & roles — Bridge's admin surface, at parity with the learning app:
 *  • Roles: capability-bound custom roles built from the bridge Access
 *    Catalogue (create / edit / delete), plus the catalogue's recommended
 *    sample roles as read-only starters.
 *  • People: the program roster with role assignment, invite, remove, and
 *    "Test as" (sign in as a person to see their resolved access).
 * Bridge admins (Nexus membership / is_admin) only. Storage is Nexus.
 */
import { canAccessAdminArea, roleLabel } from "@bridge/nexus-client";
import type { BridgeRole as BridgeRoleName } from "@laic/learner-contracts";
import { redirect } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { getBridgeContext, isFellowDemo, nexusMode } from "@/lib/nexus";
import { listBridgePeople, nexusProgramId } from "@/lib/nexusPeople";
import { getBridgeCatalogue, listBridgeRoles } from "@/lib/nexusBridgeRoles";
import {
  assignRoleAction,
  createRoleAction,
  deleteRoleAction,
  inviteAction,
  removePersonAction,
  testAsAction,
  updateRoleAction,
} from "./actions";

/** Every Bridge role, in rank order — columns of the visibility table. */
const ALL_ROLES: readonly BridgeRoleName[] = [
  "bridge_program_admin",
  "bridge_org_admin",
  "bridge_club_admin",
  "bridge_coach",
  "bridge_reviewer",
  "bridge_fellow",
  "bridge_learner",
  "bridge_guest",
];

/** Pre-built roles an admin can assign directly (admin comes from Nexus). */
const PREBUILT_ASSIGNABLE: { key: string; label: string }[] = [
  { key: "bridge_coach", label: "Coach" },
  { key: "bridge_reviewer", label: "Reviewer & Fellow" },
  { key: "bridge_learner", label: "Learner" },
];

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string; who?: string }>;
}) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  if (await isFellowDemo()) redirect("/bridge/table");
  if (!canAccessAdminArea(context)) redirect("/bridge/home");
  const { invited, who } = await searchParams;

  const programId = nexusProgramId(context);
  const live = nexusMode() === "http" && !!programId;

  // Management data (http mode only). Catalogue drives the role builder.
  const [catalogue, roles, people] = live
    ? await Promise.all([
        getBridgeCatalogue(programId!).catch(() => null),
        listBridgeRoles(programId!).catch(() => []),
        listBridgePeople(programId!).catch(() => []),
      ])
    : [null, [], []];

  const groupsSorted = catalogue ? [...catalogue.groups].sort((a, b) => a.order - b.order) : [];
  const grantable = (gid: string) => (catalogue?.capabilities ?? []).filter((c) => c.group === gid && !c.reserved);
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">People</h1>
        <p className="text-sm text-neutral-600">
          Build capability-based roles from the Access Catalogue, assign them to
          people, and preview anyone&apos;s access. Roles and assignments are stored in
          Nexus, so the same person signs in with the same access from their portal.
        </p>
      </header>

      {/* You */}
      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-2 font-medium">You</h2>
        <p className="flex flex-wrap gap-1.5">
          {context.roles.map((role) => (
            <span key={role} className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
              {roleLabel(role)}
            </span>
          ))}
          {context.is_admin ? (
            <span className="rounded-full bg-neutral-900 px-2.5 py-0.5 text-xs font-medium text-white">Admin — full access</span>
          ) : null}
        </p>
      </section>

      {!live ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Role and catalogue management needs a live Nexus connection — launch Bridge
          from the Nexus console (http mode) to build roles and manage people.
        </p>
      ) : (
        <>
          {invited ? (
            <section className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-medium text-emerald-900">{who ?? "They"} — invited. Share this activation link (they set their own password and accept):</p>
              <code className="block break-all rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs text-neutral-700">{invited}</code>
            </section>
          ) : null}

          {/* Custom roles */}
          <section className="rounded-lg border border-neutral-200 p-4">
            <h2 className="mb-1 font-medium">Roles</h2>
            <p className="mb-3 text-xs text-neutral-500">
              Each role grants a set of capabilities from the Access Catalogue. People holding a
              role can do exactly what its capabilities allow; admins can do everything.
            </p>

            <div className="space-y-2">
              {roles.map((role) => {
                const held = new Set(role.capabilities);
                return (
                  <details key={role.id} className="rounded-lg border border-neutral-200">
                    <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="font-medium">{role.name}</span>
                      <span className="text-xs text-neutral-500">{role.capabilities.length} capabilities</span>
                    </summary>
                    <div className="border-t border-neutral-100 p-4">
                      <form action={updateRoleAction} className="space-y-3">
                        <input type="hidden" name="roleId" value={role.id} />
                        <label className="flex flex-col gap-1 text-xs text-neutral-500">
                          Role name
                          <input name="name" defaultValue={role.name} className="max-w-xs rounded-md border border-neutral-200 px-2 py-1.5 text-sm text-neutral-900" />
                        </label>
                        {groupsSorted.map((g) => {
                          const caps = grantable(g.id);
                          if (!caps.length) return null;
                          return (
                            <fieldset key={g.id} className="space-y-1">
                              <legend className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{g.label}</legend>
                              <div className="flex flex-wrap gap-x-4 gap-y-1">
                                {caps.map((c) => (
                                  <label key={c.id} className="flex items-center gap-1.5 text-sm text-neutral-700">
                                    <input type="checkbox" name="cap" value={c.id} defaultChecked={held.has(c.id)} />
                                    {c.label}
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                          );
                        })}
                        <div className="flex items-center gap-2">
                          <button type="submit" className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-emerald-400 hover:text-neutral-900">
                            Save role
                          </button>
                        </div>
                      </form>
                      <form action={deleteRoleAction} className="mt-2">
                        <input type="hidden" name="roleId" value={role.id} />
                        <button type="submit" className="text-xs font-medium text-red-600 hover:underline">Delete role</button>
                      </form>
                    </div>
                  </details>
                );
              })}
              {roles.length === 0 ? <p className="text-sm text-neutral-500">No custom roles yet — create one below.</p> : null}
            </div>

            {/* New role */}
            <details className="mt-3 rounded-lg border border-dashed border-neutral-300">
              <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-emerald-700">+ New role</summary>
              <div className="border-t border-neutral-100 p-4">
                <form action={createRoleAction} className="space-y-3">
                  <label className="flex flex-col gap-1 text-xs text-neutral-500">
                    Role name
                    <input name="name" required placeholder="e.g. Deal Author" className="max-w-xs rounded-md border border-neutral-200 px-2 py-1.5 text-sm text-neutral-900" />
                  </label>
                  {groupsSorted.map((g) => {
                    const caps = grantable(g.id);
                    if (!caps.length) return null;
                    return (
                      <fieldset key={g.id} className="space-y-1">
                        <legend className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{g.label}</legend>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {caps.map((c) => (
                            <label key={c.id} className="flex items-center gap-1.5 text-sm text-neutral-700">
                              <input type="checkbox" name="cap" value={c.id} />
                              {c.label}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    );
                  })}
                  <button type="submit" className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-emerald-400 hover:text-neutral-900">
                    Create role
                  </button>
                </form>
              </div>
            </details>

            {/* Recommended sample roles */}
            {catalogue?.sampleRoleTemplates?.length ? (
              <div className="mt-4 border-t border-neutral-100 pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Recommended starters (from the catalogue)</p>
                <ul className="flex flex-wrap gap-2">
                  {catalogue.sampleRoleTemplates.map((s) => (
                    <li key={s.id} className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600">
                      {s.name} · {new Set(s.grants.flatMap((g) => g.capabilityIds)).size} caps
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {/* Invite */}
          <section className="rounded-lg border border-neutral-200 p-4">
            <h2 className="mb-2 font-medium">Invite a person</h2>
            <form action={inviteAction} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-neutral-500">
                Name
                <input name="displayName" placeholder="Jordan Lee" className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm text-neutral-900" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-500">
                Email
                <input name="email" type="email" required placeholder="jordan@example.org" className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm text-neutral-900" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-500">
                Role
                <select name="role" defaultValue="none" className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm">
                  <option value="none">None yet</option>
                  <optgroup label="Custom roles">
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </optgroup>
                  <optgroup label="Pre-built">
                    {PREBUILT_ASSIGNABLE.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </optgroup>
                </select>
              </label>
              <button type="submit" className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-emerald-400 hover:text-neutral-900">
                Invite
              </button>
            </form>
          </section>

          {/* People */}
          <section className="overflow-hidden rounded-lg border border-neutral-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-2.5 font-medium">Person</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const isCustom = roles.some((r) => r.id === p.bridge_role);
                  const currentValue = isCustom || PREBUILT_ASSIGNABLE.some((r) => r.key === p.bridge_role) ? (p.bridge_role as string) : "none";
                  return (
                    <tr key={p.email ?? p.display_name ?? p.membership_id ?? ""} className="border-b border-neutral-100 last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="font-medium">{p.display_name ?? "—"}</span>
                        <span className="block text-xs text-neutral-500">{p.email}</span>
                      </td>
                      <td className="px-4 py-2.5 text-neutral-600">{p.status}</td>
                      <td className="px-4 py-2.5">
                        {p.is_admin ? (
                          <span className="text-neutral-700">Admin<span className="block text-xs text-neutral-400">Program-level access</span></span>
                        ) : (
                          <form action={assignRoleAction} className="flex items-center gap-2">
                            <input type="hidden" name="email" value={p.email ?? ""} />
                            <select name="role" defaultValue={currentValue} className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm">
                              <option value="none">No role</option>
                              <optgroup label="Custom roles">
                                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                              </optgroup>
                              <optgroup label="Pre-built">
                                {PREBUILT_ASSIGNABLE.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                              </optgroup>
                            </select>
                            <button type="submit" className="rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:border-emerald-400 hover:text-neutral-900">Save</button>
                          </form>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {p.email ? (
                            <form action={testAsAction}>
                              <input type="hidden" name="email" value={p.email} />
                              <button type="submit" title="Sign in as this person (test)" className="rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:border-emerald-400 hover:text-neutral-900">
                                Test as
                              </button>
                            </form>
                          ) : null}
                          {p.is_admin ? null : (
                            <form action={removePersonAction}>
                              <input type="hidden" name="email" value={p.email ?? ""} />
                              <button type="submit" title="Remove from program" aria-label="Remove from program" className="inline-grid size-7 place-items-center rounded-md text-neutral-400 hover:bg-red-50 hover:text-red-600">
                                &#x1F5D1;
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {people.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-neutral-500">No people in this program yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </>
      )}

      {/* Area visibility — truthful, computed from the live nav gates */}
      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-2 font-medium">Area visibility</h2>
        <p className="mb-3 text-xs text-neutral-500">Which navigation areas each pre-built role can see today — computed from the live nav gates.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <th className="py-1.5 pr-3 font-medium">Area</th>
                {ALL_ROLES.map((role) => (
                  <th key={role} className="px-2 py-1.5 text-center font-medium">{roleLabel(role)}</th>
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
    </div>
  );
}
