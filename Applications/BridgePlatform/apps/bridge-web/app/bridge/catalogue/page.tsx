/**
 * Access Catalog — consolidated into the People tab (People → Access Catalog).
 * This route now redirects there so any existing deep link still lands in the
 * right place. The editor UI lives in ./CatalogueEditor and is rendered by the
 * teams page inside its "Access Catalog" sub-tab.
 */
import { redirect } from "next/navigation";

export default function CataloguePage() {
  redirect("/bridge/teams?tab=catalog");
}
