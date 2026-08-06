import { hasPermission } from "@bridge/nexus-client";
import { redirect } from "next/navigation";
import {
  addAffiliationAction,
  saveOrgProfileAction,
  switchActiveOrgAction,
} from "./actions";
import { requireFeature } from "@/lib/access";
import { getBridgeContext } from "@/lib/nexus";
import { profileService } from "@/lib/profiles";

const ORG_TYPES = [
  "acbl_like_partner",
  "bridge_club",
  "coach_organization",
  "independent_coach_group",
  "class_group",
  "pilot_partner",
] as const;
const SYSTEMS = ["natural", "SAYC", "2_over_1", "custom"] as const;
const AFFILIATION_TYPES = [
  "independent",
  "organization_coach",
  "club_coach",
  "class_coach",
  "reviewer",
  "fellow",
] as const;

export default async function OrgPage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await requireFeature(context, "page.org");
  const service = profileService();
  const org = await service.getOrgProfile(context);
  const affiliations = await service.listMyAffiliations(context);
  const me = await service.getUserProfile(context);
  const canManage = hasPermission(context, "bridge.org.manage");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Organization</h1>
        <p className="text-sm text-neutral-600">
          Bridge-owned settings on top of the Nexus organization (§3.4) and
          your coach affiliations (§3.5).
        </p>
      </header>

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-1 font-medium">
          Org profile{context.programOrganizationId ? ` — ${context.programOrganizationId}` : ""}
        </h2>
        {!context.programOrganizationId ? (
          <p className="text-sm text-neutral-500">
            You are operating at program level (no single organization) — org
            profiles are per-organization.
          </p>
        ) : !canManage ? (
          <p className="text-sm text-neutral-600">
            {org
              ? `Type ${org.bridgeOrgType} · AI players ${org.allowAiPlayers ? "allowed" : "disabled"} · BEN ${org.allowBenPlayers ? "allowed" : "off"} · systems: ${org.allowedBiddingSystems.join(", ") || "all"}`
              : "No bridge org profile configured yet."}{" "}
            Editing requires the bridge.org.manage permission.
          </p>
        ) : (
          <form action={saveOrgProfileAction} className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <select
                name="bridgeOrgType"
                defaultValue={org?.bridgeOrgType ?? "bridge_club"}
                className="rounded border border-neutral-300 px-2 py-1"
              >
                {ORG_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <input
                name="defaultLearnerLevel"
                defaultValue={org?.defaultLearnerLevel ?? ""}
                placeholder="default learner level (free text)"
                className="w-56 rounded border border-neutral-300 px-2 py-1"
              />
            </div>
            <p className="flex flex-wrap gap-4">
              <span className="text-neutral-500">Allowed systems (none = all):</span>
              {SYSTEMS.map((s) => (
                <label key={s} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    name="allowedBiddingSystems"
                    value={s}
                    defaultChecked={org?.allowedBiddingSystems.includes(s)}
                  />
                  {s}
                </label>
              ))}
            </p>
            <p className="flex gap-4">
              <label className="flex items-center gap-1">
                <input type="checkbox" name="allowAiPlayers" defaultChecked={org?.allowAiPlayers ?? true} />
                Allow AI players
              </label>
              <label className="flex items-center gap-1" title="BEN adapter deferred — stays off until it ships">
                <input type="checkbox" name="allowBenPlayers" defaultChecked={org?.allowBenPlayers ?? false} />
                Allow BEN players (adapter not yet deployed)
              </label>
            </p>
            <button className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
              Save org profile
            </button>
          </form>
        )}
      </section>

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-1 font-medium">My affiliations</h2>
        {affiliations.length === 0 ? (
          <p className="text-sm text-neutral-500">None declared.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {affiliations.map((a) => (
              <li key={a.coachAffiliationId} className="flex items-center justify-between rounded border border-neutral-200 px-3 py-1.5">
                <span>
                  {a.affiliationType} — {a.programOrganizationId ?? "independent"}{" "}
                  <span className={a.status === "active" ? "text-emerald-700" : "text-amber-700"}>
                    ({a.status})
                  </span>
                  {me?.activeProgramOrganizationId === a.programOrganizationId && a.programOrganizationId && (
                    <span className="ml-2 rounded bg-emerald-50 px-1.5 text-xs text-emerald-800">acting as</span>
                  )}
                </span>
                {a.status === "active" && a.programOrganizationId && (
                  <form action={switchActiveOrgAction}>
                    <input type="hidden" name="programOrganizationId" value={a.programOrganizationId} />
                    <button className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">
                      Switch to this org
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {me?.activeProgramOrganizationId && (
          <form action={switchActiveOrgAction} className="mt-2">
            <button className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">
              Clear switch (back to Nexus default)
            </button>
          </form>
        )}
        <form action={addAffiliationAction} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <select name="affiliationType" className="rounded border border-neutral-300 px-2 py-1">
            {AFFILIATION_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input
            name="programOrganizationId"
            placeholder="program organization id (blank = independent)"
            className="w-72 rounded border border-neutral-300 px-2 py-1"
          />
          <button className="rounded border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50">
            Declare affiliation
          </button>
          <span className="text-xs text-neutral-500">
            Lands pending unless you administer the target org.
          </span>
        </form>
      </section>
    </div>
  );
}
