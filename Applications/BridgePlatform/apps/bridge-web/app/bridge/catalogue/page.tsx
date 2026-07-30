/**
 * Access Catalogue — the inventory of what Bridge can permission-control
 * (capabilities + UI surfaces + groups + resource types + sample roles). Roles
 * (Teams & roles) bind these capability ids. A bridge admin can edit it here;
 * everyone with admin-area access sees a read-only view. Editing persists to
 * Nexus (the shared bridge catalogue). Parity with the console/learning editor.
 */
import { canAccessAdminArea } from "@bridge/nexus-client";
import { redirect } from "next/navigation";
import { getBridgeContext, isFellowDemo, nexusMode } from "@/lib/nexus";
import { nexusProgramId } from "@/lib/nexusPeople";
import Link from "next/link";
import { getBridgeCatalogue, getLibraryCatalogue } from "@/lib/nexusBridgeRoles";
import { CatalogueEditor } from "./CatalogueEditor";

export default async function CataloguePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ provider?: string }> }>) {
  const provider = (await searchParams).provider === "library" ? "library" : "bridge";
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
          console (http mode) to view and edit it.
        </p>
      </div>
    );
  }

  const catalogue =
    provider === "library"
      ? await getLibraryCatalogue().catch(() => null)
      : await getBridgeCatalogue(programId).catch(() => null);
  if (!catalogue) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Access Catalogue</h1>
        <p className="text-sm text-red-600">Could not load the bridge catalogue.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* Provider switcher: bridge's own document vs the LIBRARY component's
          (platform-level — the single source of truth for library.* ids). */}
      <div className="flex gap-2">
        {(
          [
            { id: "bridge", label: "Bridge" },
            { id: "library", label: "Library (component)" },
          ] as const
        ).map((p) => (
          <Link
            key={p.id}
            href={p.id === "bridge" ? "/bridge/catalogue" : "/bridge/catalogue?provider=library"}
            className={
              p.id === provider
                ? "rounded-full bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white"
                : "rounded-full border border-neutral-300 px-4 py-1.5 text-sm text-neutral-700 hover:border-neutral-400"
            }
          >
            {p.label}
          </Link>
        ))}
      </div>
      {provider === "library" && (
        <p className="rounded border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
          This is the library <b>component&apos;s own</b> catalogue — shared by every host
          platform. Edits here affect anyone binding library capabilities, and saving
          requires platform-settings access on Nexus.
        </p>
      )}
      <CatalogueEditor
        key={provider}
        initial={catalogue}
        canEdit={context.is_admin ?? false}
        provider={provider}
      />
    </div>
  );
}
