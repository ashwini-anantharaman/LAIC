import { redirect } from "next/navigation";
import type { LibraryConfig } from "@laic/library-ui";
import kitConfig from "@/library.config.json";
import { bridgeLibrary, canSeeProgramLibrary, libraryPrincipalOf } from "@/lib/libraryComponent";
import { getBridgeContext } from "@/lib/nexus";

/**
 * Living proof of the pluggable library: this page contains ZERO library
 * logic — it loads a config document (library.config.json at the app root),
 * asks the component for the caller's policy-filtered items, and mounts the
 * drop-in <LibraryBrowser>. Edit the JSON (labels, order, theme, features)
 * and reload: a different library, no code change. The same kit + a
 * different config is what any partner UI would ship.
 */
export default async function LibraryKitPage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");

  const principal = await libraryPrincipalOf(context);
  const view = (await canSeeProgramLibrary(context)) ? "program" : "mine";
  const items = await bridgeLibrary()
    .list(principal, { view })
    .catch(() => []);

  const { KitTenant } = await import("./KitTenant");
  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-4 rounded border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
        Config-driven tenant: this page renders <code>@laic/library-ui</code> fed by{" "}
        <code>library.config.json</code> — edit the file and reload to reshape the library
        without touching code.
      </p>
      <KitTenant config={kitConfig as LibraryConfig} items={items} />
    </div>
  );
}
