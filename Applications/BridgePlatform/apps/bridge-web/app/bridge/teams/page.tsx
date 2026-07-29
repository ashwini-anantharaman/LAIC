/**
 * People — Bridge's admin surface. Layout mirrors the Nexus / org-level People
 * experience (a "People" | "Roles & Groups" tab switch as the heading; a roster
 * with a Grid / Grouped view toggle; per-person role select; role chips; a
 * static privileged pill), rendered in Bridge's own idiom: server component,
 * searchParams-driven tabs/views (no client state), server-action forms, and
 * native <details> for collapsibles. Storage is Nexus.
 *
 * Parity notes vs. Nexus MemberRoster:
 *  • Grouped (stack) view groups people by ROLE — role-as-group nodes — exactly
 *    like Nexus. Bridge has no people-group model (its catalogue "groups" are
 *    capability groups), so the "Groups" column surfaces the role-as-group chip
 *    and there is no people-group placement control here. Roles/capabilities are
 *    edited under the "Roles & Groups" tab, mirroring Nexus's second tab.
 *  • The highest authority (is_admin) renders as a static "Super Admin" pill with
 *    a "Platform-level access" note — the same treatment OrgTeam gives the owner.
 *
 * Bridge admins (Nexus membership / is_admin) only.
 */
import { canAccessAdminArea, roleLabel } from "@bridge/nexus-client";
import type { BridgeRole as BridgeRoleName } from "@laic/learner-contracts";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { getBridgeContext, isFellowDemo, nexusMode } from "@/lib/nexus";
import { listBridgePeople, nexusProgramId, type BridgePerson } from "@/lib/nexusPeople";
import { getBridgeCatalogue, listBridgeRoles, type BridgeRole } from "@/lib/nexusBridgeRoles";
import { CatalogueEditor } from "../catalogue/CatalogueEditor";
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

// ── Small presentational helpers (server-safe, Bridge styling) ───────────────
function Pill({ tone, children }: { tone: "accent" | "positive" | "warn" | "neutral"; children: React.ReactNode }) {
  const cls =
    tone === "accent"
      ? "bg-[var(--accent)] text-white"
      : tone === "positive"
        ? "bg-emerald-50 text-emerald-800"
        : tone === "warn"
          ? "bg-amber-50 text-amber-900"
          : "bg-neutral-100 text-neutral-600";
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string; who?: string; tab?: string; view?: string }>;
}) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  if (await isFellowDemo()) redirect("/bridge/table");
  if (!canAccessAdminArea(context)) redirect("/bridge/home");
  const { invited, who, tab, view } = await searchParams;

  const activeTab: "people" | "rg" | "catalog" = tab === "rg" ? "rg" : tab === "catalog" ? "catalog" : "people";
  const activeView: "grid" | "stack" = view === "stack" ? "stack" : "grid";

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

  // Links that preserve the sibling axis when switching tab/view.
  const tabHref = (t: "people" | "rg" | "catalog") => `/bridge/teams?tab=${t}&view=${activeView}`;
  const viewHref = (v: "grid" | "stack") => `/bridge/teams?tab=people&view=${v}`;

  // The role a person currently holds, as an assignable <select> value.
  const roleSelectValue = (p: BridgePerson) => {
    const isCustom = roles.some((r) => r.id === p.bridge_role);
    return isCustom || PREBUILT_ASSIGNABLE.some((r) => r.key === p.bridge_role) ? (p.bridge_role as string) : "none";
  };
  // Human label for the role chip shown in the roster's "Groups" column.
  const roleChipLabel = (p: BridgePerson): string | null => {
    if (!p.bridge_role) return null;
    const custom = roles.find((r) => r.id === p.bridge_role);
    if (custom) return custom.name;
    const prebuilt = PREBUILT_ASSIGNABLE.find((r) => r.key === p.bridge_role);
    if (prebuilt) return prebuilt.label;
    return roleLabel(p.bridge_role as BridgeRoleName);
  };

  // ── One roster row, reused by grid + each grouped section ──────────────────
  function personRow(p: BridgePerson) {
    const chip = roleChipLabel(p);
    return (
      <tr key={p.email ?? p.display_name ?? p.membership_id ?? ""} className="border-b border-[var(--line)] last:border-0">
        <td className="px-4 py-2.5">
          <span className="font-medium text-[var(--ink)]">{p.display_name ?? "—"}</span>
          <span className="block text-xs text-neutral-500">{p.email}</span>
        </td>
        {/* Role */}
        <td className="px-4 py-2.5">
          {p.is_admin ? (
            <div>
              <Pill tone="accent">Super Admin</Pill>
              <span className="mt-0.5 block text-[11px] text-neutral-500">Platform-level access</span>
            </div>
          ) : (
            <form action={assignRoleAction} className="flex items-center gap-2">
              <input type="hidden" name="email" value={p.email ?? ""} />
              <select name="role" defaultValue={roleSelectValue(p)} className="rounded-md border border-[var(--line)] bg-[var(--card)] px-2 py-1.5 text-sm">
                <option value="none">No role</option>
                <optgroup label="Custom roles">
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </optgroup>
                <optgroup label="Pre-built">
                  {PREBUILT_ASSIGNABLE.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </optgroup>
              </select>
              <button type="submit" className="rounded-md border border-[var(--line)] px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:border-emerald-400 hover:text-neutral-900">Save</button>
            </form>
          )}
        </td>
        {/* Groups — role-as-group chip (Bridge has no people-group model) */}
        <td className="px-4 py-2.5">
          {p.is_admin ? (
            <span className="text-xs text-neutral-500">—</span>
          ) : chip ? (
            <Pill tone="neutral">{chip}</Pill>
          ) : (
            <span className="text-xs text-neutral-500">—</span>
          )}
        </td>
        {/* Status */}
        <td className="px-4 py-2.5">
          <Pill tone={p.status === "active" ? "positive" : "warn"}>{p.status}</Pill>
        </td>
        {/* Actions */}
        <td className="px-4 py-2.5 text-right">
          <div className="flex items-center justify-end gap-1.5">
            {p.email ? (
              <form action={testAsAction}>
                <input type="hidden" name="email" value={p.email} />
                <button type="submit" title="Sign in as this person (test)" className="rounded-md border border-[var(--line)] px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:border-emerald-400 hover:text-neutral-900">
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
  }

  const tableHead = (
    <thead>
      <tr className="border-b border-[var(--line)] bg-[var(--paper)] text-left text-xs uppercase tracking-wide text-neutral-500">
        <th className="px-4 py-2.5 font-medium">Person</th>
        <th className="px-4 py-2.5 font-medium">Role</th>
        <th className="px-4 py-2.5 font-medium">Groups</th>
        <th className="px-4 py-2.5 font-medium">Status</th>
        <th className="px-4 py-2.5 font-medium text-right">Actions</th>
      </tr>
    </thead>
  );

  // Grouped (stack) model — role-as-group nodes, mirroring Nexus. Admins get
  // their own "Super Admin" node; then each role with members; then "No role".
  const admins = people.filter((p) => p.is_admin);
  const nonAdmins = people.filter((p) => !p.is_admin);
  const roleNodes = [
    ...roles.map((r) => ({ key: r.id, label: r.name })),
    ...PREBUILT_ASSIGNABLE.map((r) => ({ key: r.key, label: r.label })),
  ]
    .map((n) => ({ ...n, members: nonAdmins.filter((p) => p.bridge_role === n.key) }))
    .filter((n) => n.members.length > 0);
  const noRole = nonAdmins.filter((p) => !roleChipLabel(p));
  const stackEmpty = admins.length === 0 && roleNodes.length === 0 && noRole.length === 0;

  function stackSection(label: string, members: BridgePerson[], tone: "accent" | "role" | "muted") {
    return (
      <details key={label} open className="overflow-hidden rounded-lg border border-[var(--line)]">
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5">
          <span className={`text-sm font-semibold ${tone === "muted" ? "text-neutral-500" : "text-[var(--ink)]"}`}>{label}</span>
          {tone === "accent" ? <Pill tone="accent">super</Pill> : tone === "role" ? <Pill tone="neutral">role</Pill> : null}
          <span className="text-xs text-neutral-500">{members.length} {members.length === 1 ? "person" : "people"}</span>
        </summary>
        <div className="border-t border-[var(--line)]">
          <table className="w-full text-sm">{tableHead}<tbody>{members.map(personRow)}</tbody></table>
        </div>
      </details>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Heading doubles as the tab switch, like Nexus PeoplePage. */}
      <header className="space-y-3">
        <nav className="flex flex-wrap items-end gap-5 border-b border-[var(--line)] pb-2">
          <Link
            href={tabHref("people")}
            aria-current={activeTab === "people" ? "page" : undefined}
            className={activeTab === "people" ? "font-serif text-2xl font-semibold tracking-tight text-[var(--ink)]" : "text-lg font-medium text-neutral-400 hover:text-neutral-600"}
          >
            People
          </Link>
          <Link
            href={tabHref("rg")}
            aria-current={activeTab === "rg" ? "page" : undefined}
            className={activeTab === "rg" ? "font-serif text-2xl font-semibold tracking-tight text-[var(--ink)]" : "text-lg font-medium text-neutral-400 hover:text-neutral-600"}
          >
            Roles &amp; Groups
          </Link>
          <Link
            href={tabHref("catalog")}
            aria-current={activeTab === "catalog" ? "page" : undefined}
            className={activeTab === "catalog" ? "font-serif text-2xl font-semibold tracking-tight text-[var(--ink)]" : "text-lg font-medium text-neutral-400 hover:text-neutral-600"}
          >
            Access Catalog
          </Link>
        </nav>
        {activeTab !== "catalog" ? (
          <p className="text-sm text-neutral-600">
            {activeTab === "people"
              ? "Everyone in this Bridge program."
              : "Build capability-based roles from the Access Catalog."}
          </p>
        ) : null}
      </header>

      {/* You */}
      <section className="rounded-lg border border-[var(--line)] p-4">
        <h2 className="mb-2 font-medium">You</h2>
        <p className="flex flex-wrap gap-1.5">
          {context.roles.map((role) => (
            <Pill key={role} tone="positive">{roleLabel(role)}</Pill>
          ))}
          {context.is_admin ? <Pill tone="accent">Super Admin — full access</Pill> : null}
        </p>
      </section>

      {!live ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Role and catalogue management needs a live Nexus connection — launch Bridge
          from the Nexus console (http mode) to build roles and manage people.
        </p>
      ) : activeTab === "people" ? (
        <>
          {invited ? (
            <section className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-medium text-emerald-900">{who ?? "They"} — invited. Share this activation link (they set their own password and accept):</p>
              <code className="block break-all rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs text-neutral-700">{invited}</code>
            </section>
          ) : null}

          {/* Actions row: view toggle (Grid / Grouped) — like Nexus. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Link href={viewHref("grid")} aria-current={activeView === "grid" ? "page" : undefined}
                className={activeView === "grid" ? "rounded-full border border-emerald-700 bg-emerald-700 px-3 py-1 text-xs font-medium text-white" : "rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:border-emerald-500 hover:text-neutral-900"}>
                Grid
              </Link>
              <Link href={viewHref("stack")} aria-current={activeView === "stack" ? "page" : undefined}
                className={activeView === "stack" ? "rounded-full border border-emerald-700 bg-emerald-700 px-3 py-1 text-xs font-medium text-white" : "rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:border-emerald-500 hover:text-neutral-900"}>
                Grouped
              </Link>
            </div>
            <span className="text-xs text-neutral-500">{people.length} {people.length === 1 ? "person" : "people"}</span>
          </div>

          {/* Invite */}
          <section className="rounded-lg border border-[var(--line)] p-4">
            <h2 className="mb-2 font-medium">Invite a person</h2>
            <form action={inviteAction} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-neutral-500">
                Name
                <input name="displayName" placeholder="Jordan Lee" className="rounded-md border border-[var(--line)] px-2 py-1.5 text-sm text-neutral-900" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-500">
                Email
                <input name="email" type="email" required placeholder="jordan@example.org" className="rounded-md border border-[var(--line)] px-2 py-1.5 text-sm text-neutral-900" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-500">
                Role
                <select name="role" defaultValue="none" className="rounded-md border border-[var(--line)] bg-[var(--card)] px-2 py-1.5 text-sm">
                  <option value="none">None yet</option>
                  <optgroup label="Custom roles">
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </optgroup>
                  <optgroup label="Pre-built">
                    {PREBUILT_ASSIGNABLE.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </optgroup>
                </select>
              </label>
              <button type="submit" className="rounded-md border border-[var(--line)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-emerald-400 hover:text-neutral-900">
                Invite
              </button>
            </form>
          </section>

          {/* Roster */}
          {people.length === 0 ? (
            <p className="rounded-lg border border-[var(--line)] px-4 py-6 text-center text-sm text-neutral-500">No people in this program yet.</p>
          ) : activeView === "grid" ? (
            <section className="overflow-hidden rounded-lg border border-[var(--line)]">
              <table className="w-full text-sm">{tableHead}<tbody>{people.map(personRow)}</tbody></table>
            </section>
          ) : stackEmpty ? (
            <p className="rounded-lg border border-[var(--line)] px-4 py-6 text-center text-sm text-neutral-500">No one to group yet.</p>
          ) : (
            <div className="space-y-2">
              {admins.length ? stackSection("Super Admin", admins, "accent") : null}
              {roleNodes.map((n) => stackSection(n.label, n.members, "role"))}
              {noRole.length ? stackSection("No role", noRole, "muted") : null}
            </div>
          )}
        </>
      ) : activeTab === "catalog" ? (
        // ── Access Catalog tab (embedded editor) ───────────────────────────
        catalogue ? (
          <CatalogueEditor initial={catalogue} canEdit={context.is_admin ?? false} embedded />
        ) : (
          <p className="rounded-lg border border-[var(--line)] px-4 py-6 text-center text-sm text-neutral-500">Could not load the bridge catalog.</p>
        )
      ) : (
        // ── Roles & Groups tab ─────────────────────────────────────────────
        <>
          {/* Custom roles */}
          <section className="rounded-lg border border-[var(--line)] p-4">
            <h2 className="mb-3 font-medium">Roles</h2>

            <div className="space-y-2">
              {roles.map((role: BridgeRole) => {
                const held = new Set(role.capabilities);
                return (
                  <details key={role.id} className="rounded-lg border border-[var(--line)]">
                    <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="font-medium">{role.name}</span>
                      <span className="text-xs text-neutral-500">{role.capabilities.length} capabilities</span>
                    </summary>
                    <div className="border-t border-[var(--line)] p-4">
                      <form action={updateRoleAction} className="space-y-3">
                        <input type="hidden" name="roleId" value={role.id} />
                        <label className="flex flex-col gap-1 text-xs text-neutral-500">
                          Role name
                          <input name="name" defaultValue={role.name} className="max-w-xs rounded-md border border-[var(--line)] px-2 py-1.5 text-sm text-neutral-900" />
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
                          <button type="submit" className="rounded-md border border-[var(--line)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-emerald-400 hover:text-neutral-900">
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
              <div className="border-t border-[var(--line)] p-4">
                <form action={createRoleAction} className="space-y-3">
                  <label className="flex flex-col gap-1 text-xs text-neutral-500">
                    Role name
                    <input name="name" required placeholder="e.g. Deal Author" className="max-w-xs rounded-md border border-[var(--line)] px-2 py-1.5 text-sm text-neutral-900" />
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
                  <button type="submit" className="rounded-md border border-[var(--line)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-emerald-400 hover:text-neutral-900">
                    Create role
                  </button>
                </form>
              </div>
            </details>

            {/* Recommended sample roles */}
            {catalogue?.sampleRoleTemplates?.length ? (
              <div className="mt-4 border-t border-[var(--line)] pt-3">
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

          {/* Area visibility — truthful, computed from the live nav gates */}
          <section className="rounded-lg border border-[var(--line)] p-4">
            <h2 className="mb-2 font-medium">Area visibility</h2>
            <p className="mb-3 text-xs text-neutral-500">Which navigation areas each pre-built role can see.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left text-xs text-neutral-500">
                    <th className="py-1.5 pr-3 font-medium">Area</th>
                    {ALL_ROLES.map((role) => (
                      <th key={role} className="px-2 py-1.5 text-center font-medium">{roleLabel(role)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {NAV_ITEMS.map((item) => (
                    <tr key={item.href} className="border-b border-[var(--line)] last:border-b-0">
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
        </>
      )}
    </div>
  );
}
