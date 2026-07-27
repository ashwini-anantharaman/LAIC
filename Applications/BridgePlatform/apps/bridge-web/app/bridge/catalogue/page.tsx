/**
 * Access Catalogue (read view) — the inventory of what Bridge can
 * permission-control: capabilities + UI surfaces, grouped. Roles (Teams &
 * roles) bind these capability ids. Managed centrally in Nexus; shown here so
 * admins can see what roles are able to grant. Bridge admins only.
 */
import { canAccessAdminArea } from "@bridge/nexus-client";
import { redirect } from "next/navigation";
import { getBridgeContext, isFellowDemo, nexusMode } from "@/lib/nexus";
import { nexusProgramId } from "@/lib/nexusPeople";
import { getBridgeCatalogue } from "@/lib/nexusBridgeRoles";

export default async function CataloguePage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  if (await isFellowDemo()) redirect("/bridge/table");
  if (!canAccessAdminArea(context)) redirect("/bridge/home");

  const programId = nexusProgramId(context);
  if (nexusMode() !== "http" || !programId) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Access Catalogue</h1>
        <p className="text-sm text-neutral-600">
          The catalogue needs a live Nexus connection — launch Bridge from the Nexus
          console (http mode) to view it.
        </p>
      </div>
    );
  }

  const catalogue = await getBridgeCatalogue(programId).catch(() => null);
  if (!catalogue) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Access Catalogue</h1>
        <p className="text-sm text-red-600">Could not load the bridge catalogue.</p>
      </div>
    );
  }

  const groupsSorted = [...catalogue.groups].sort((a, b) => a.order - b.order);
  const capsIn = (gid: string) => catalogue.capabilities.filter((c) => c.group === gid);
  const surfsIn = (gid: string) => catalogue.uiSurfaces.filter((s) => s.group === gid);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Access Catalogue</h1>
        <p className="text-sm text-neutral-600">
          The capabilities and screens Bridge can grant. Roles (Teams &amp; roles) bind these
          capability ids. Managed centrally in Nexus — read-only here.
        </p>
        <p className="flex flex-wrap gap-2 pt-1 text-xs text-neutral-500">
          <span className="rounded-full bg-neutral-100 px-2.5 py-0.5">{catalogue.provider.kind}/{catalogue.provider.id}</span>
          {catalogue.catalogueVersion ? <span className="rounded-full bg-neutral-100 px-2.5 py-0.5">v{catalogue.catalogueVersion}</span> : null}
          <span>{catalogue.groups.length} groups · {catalogue.capabilities.length} capabilities · {catalogue.uiSurfaces.length} surfaces</span>
        </p>
      </header>

      <div className="space-y-3">
        {groupsSorted.map((g) => {
          const caps = capsIn(g.id);
          const surfs = surfsIn(g.id);
          return (
            <section key={g.id} className="rounded-lg border border-neutral-200 p-4">
              <h2 className="font-medium">{g.label}</h2>
              {g.description ? <p className="mb-2 text-xs text-neutral-500">{g.description}</p> : null}

              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Capabilities</p>
              {caps.length ? (
                <ul className="mt-1 space-y-1">
                  {caps.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                      <span className="text-neutral-800">{c.label}</span>
                      <span className="font-mono text-xs text-neutral-400">{c.id}</span>
                      {c.reserved ? <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">reserved · {c.reserved}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-neutral-400">None.</p>}

              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Surfaces</p>
              {surfs.length ? (
                <ul className="mt-1 space-y-1">
                  {surfs.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                      <span className="text-neutral-800">{s.label}</span>
                      <span className="font-mono text-xs text-neutral-400">{s.id}</span>
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">{s.kind}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-neutral-400">None.</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
