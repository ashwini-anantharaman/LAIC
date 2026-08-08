"use client";

// The capability-set designer, wired live. Assign whole SETS to roles (section
// 1), and the flat 43-key feature matrix the app enforces recomputes on the
// client (section 2) via the pure compileAssignment. Cells that differ from the
// live catalogue are flagged amber. Optionally the compiled matrix is written
// straight to the live catalogue.
//
// Imports are limited to the client-safe @bridge/access barrels (pure — no
// node:fs). Role labels are inlined here rather than pulled from
// @bridge/nexus-client, whose runtime import would leak node:fs into the bundle.

import { ALL_BRIDGE_ROLES } from "@bridge/access";
import { compileAssignment } from "@bridge/access/sets";
import type { BridgeRole } from "@laic/learner-contracts";
import { useMemo, useState } from "react";
import { applyCompiledAction } from "./actions";

interface SetMeta {
  id: string;
  name: string;
  description: string;
  featureKeys: string[];
}
interface FeatureMeta {
  key: string;
  label: string;
  group: string;
  kind: string;
}

/** Compact column headers, matching the teams editor. */
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
const ROLE_LABEL: Record<BridgeRole, string> = {
  bridge_program_admin: "Program admin",
  bridge_org_admin: "Organization admin",
  bridge_club_admin: "Club admin",
  bridge_coach: "Coach",
  bridge_reviewer: "Reviewer",
  bridge_fellow: "Fellow",
  bridge_learner: "Learner",
  bridge_guest: "Guest",
};

const ROLES = ALL_BRIDGE_ROLES as readonly BridgeRole[];

function sameRole(roles: readonly BridgeRole[], role: BridgeRole): boolean {
  return roles.includes(role);
}

export function TestCatalogueClient({
  sets,
  assignment: initialAssignment,
  liveRules,
  canEdit,
  features,
}: Readonly<{
  sets: SetMeta[];
  assignment: Record<string, BridgeRole[]>;
  liveRules: Record<string, BridgeRole[]>;
  canEdit: boolean;
  features: FeatureMeta[];
}>) {
  const [assignment, setAssignment] = useState<Record<string, BridgeRole[]>>(initialAssignment);

  const labelByKey = useMemo(
    () => new Map(features.map((f) => [f.key, f.label])),
    [features],
  );

  // Feature groups in declaration order, mirroring the teams editor layout.
  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, FeatureMeta[]>();
    for (const f of features) {
      if (!byGroup.has(f.group)) {
        byGroup.set(f.group, []);
        order.push(f.group);
      }
      byGroup.get(f.group)!.push(f);
    }
    return order.map((group) => ({ group, features: byGroup.get(group)! }));
  }, [features]);

  const compiled = useMemo(() => compileAssignment(assignment), [assignment]);

  // A cell (key, role) differs when the compiled matrix and the live catalogue
  // disagree on whether that role holds that key.
  const differs = useMemo(() => {
    let count = 0;
    const cell = new Set<string>();
    for (const feature of features) {
      const live = liveRules[feature.key] ?? [];
      const now = compiled[feature.key] ?? [];
      for (const role of ROLES) {
        if (sameRole(now, role) !== live.includes(role)) {
          count += 1;
          cell.add(`${feature.key}::${role}`);
        }
      }
    }
    return { count, cell };
  }, [compiled, liveRules, features]);

  function toggle(setId: string, role: BridgeRole): void {
    setAssignment((prev) => {
      const held = prev[setId] ?? [];
      const next = held.includes(role)
        ? held.filter((r) => r !== role)
        : [...held, role];
      return { ...prev, [setId]: next };
    });
  }

  function exportJson(): void {
    const payload = {
      model: { sets, assignment },
      compiled,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "test-access-catalogue.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* SECTION 1 — Capability sets. */}
      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-1 font-medium">Capability sets</h2>
        <p className="mb-3 text-sm text-neutral-600">
          A checked cell means that role holds the whole set — and therefore every capability the
          set unlocks. Expand a set to see the live feature keys it maps to.
        </p>
        <div className="overflow-x-auto rounded border border-neutral-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-500">
                <th className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 text-left font-medium">
                  Capability set
                </th>
                {ROLES.map((role) => (
                  <th
                    key={role}
                    title={ROLE_LABEL[role]}
                    className="px-2 py-2 text-center font-medium"
                  >
                    {SHORT_ROLE[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sets.map((set) => {
                const held = assignment[set.id] ?? [];
                return (
                  <tr key={set.id} className="border-b border-neutral-100 last:border-b-0">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 align-top">
                      <span className="font-medium text-neutral-800">{set.name}</span>
                      <span className="mt-0.5 block text-xs font-normal text-neutral-500">
                        {set.description}
                      </span>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-700">
                          {set.featureKeys.length} capabilit
                          {set.featureKeys.length === 1 ? "y" : "ies"}
                        </summary>
                        <ul className="mt-1 space-y-0.5">
                          {set.featureKeys.map((key) => (
                            <li key={key} className="text-xs text-neutral-600">
                              {labelByKey.get(key) ?? key}{" "}
                              <span className="font-mono text-[10px] text-neutral-400">{key}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role} className="px-2 py-2 text-center align-middle">
                        <input
                          type="checkbox"
                          checked={held.includes(role)}
                          onChange={() => toggle(set.id, role)}
                          disabled={!canEdit}
                          aria-label={`${set.name} — ${ROLE_LABEL[role]}`}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 2 — the compiled flat feature matrix. */}
      <section className="rounded-lg border border-neutral-200 p-4">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Compiles to</h2>
          <p className="text-xs text-neutral-500">
            {differs.count === 0 ? (
              <span className="text-emerald-700">Matches the live catalogue exactly.</span>
            ) : (
              <span className="text-amber-600">
                {differs.count} cell{differs.count === 1 ? "" : "s"} differ from the live catalogue
              </span>
            )}
          </p>
        </div>
        <p className="mb-3 text-sm text-neutral-600">
          The read-only 43-key feature matrix the app actually enforces, computed live from the set
          assignment above. Amber cells differ from the current live catalogue.
        </p>
        <div className="space-y-6">
          {groups.map(({ group, features: groupFeatures }) => (
            <div key={group}>
              <h3 className="mb-1.5 text-sm font-semibold text-neutral-700">{group}</h3>
              <div className="overflow-x-auto rounded border border-neutral-200">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-500">
                      <th className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 text-left font-medium">
                        Feature
                      </th>
                      {ROLES.map((role) => (
                        <th
                          key={role}
                          title={ROLE_LABEL[role]}
                          className="px-2 py-2 text-center font-medium"
                        >
                          {SHORT_ROLE[role]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groupFeatures.map((feature) => {
                      const now = compiled[feature.key] ?? [];
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
                            </span>
                          </td>
                          {ROLES.map((role) => {
                            const on = sameRole(now, role);
                            const isDiff = differs.cell.has(`${feature.key}::${role}`);
                            return (
                              <td
                                key={role}
                                className={`px-2 py-2 text-center align-middle ${
                                  isDiff ? "bg-amber-100" : ""
                                } ${on ? "text-emerald-700" : "text-neutral-300"}`}
                                title={
                                  isDiff
                                    ? `${feature.label} — ${ROLE_LABEL[role]}: differs from live`
                                    : undefined
                                }
                              >
                                {on ? "✓" : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer — reset + export + apply. */}
      <section className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setAssignment(initialAssignment)}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          Reset sets to defaults
        </button>
        <button
          type="button"
          onClick={exportJson}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          Export JSON
        </button>

        {canEdit ? (
          <form
            action={applyCompiledAction}
            onSubmit={(e) => {
              if (
                !window.confirm(
                  "Overwrites the live access catalogue for every user. Continue?",
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="rules" value={JSON.stringify(compiled)} />
            <button
              type="submit"
              className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Write compiled matrix to the LIVE catalogue
            </button>
          </form>
        ) : (
          <p className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            Read-only — org or program admins can write the compiled matrix to the live catalogue.
          </p>
        )}
      </section>
    </div>
  );
}
