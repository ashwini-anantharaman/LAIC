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
import { getBridgeCatalogue } from "@/lib/nexusBridgeRoles";
import { CatalogueEditor } from "./CatalogueEditor";

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
          console (http mode) to view and edit it.
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

  return <CatalogueEditor initial={catalogue} canEdit={context.is_admin ?? false} />;
}
