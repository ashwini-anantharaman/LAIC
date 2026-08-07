import { roleLabel, stubDisplayName } from "@bridge/nexus-client";
import { redirect } from "next/navigation";
import { BridgeNav } from "@/components/BridgeNav";
import { getCatalogue } from "@/lib/access";
import { navForContext } from "@/lib/nav";
import { getBridgeContext, isEmbeddedLaunch, isFellowDemo, nexusMode } from "@/lib/nexus";

/** Hidden on the fellows-testing deployment. */
const DEMO_HIDDEN_NAV = new Set([
  "/bridge/home",
  "/bridge/admin/audit",
  "/bridge/teams",
]);

/**
 * Bridge app shell: all bridge routes live under /bridge/* so the app slots
 * into the Nexus app shell's route ownership model later (App Shell spec:
 * Bridge owns routes matching /bridge/*).
 */
export default async function BridgeShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");

  // Embedded in a host app? The host owns the session + its own exit control,
  // so we hide Bridge's "Sign out" (signing out here would leave a confusing
  // half-signed-out state inside the host).
  const embedded = await isEmbeddedLaunch();
  const showSignOut = nexusMode() === "http" && !embedded;
  const demo = await isFellowDemo();
  const catalogue = await getCatalogue();
  const navItems = navForContext(catalogue, context).filter(
    (item) => !demo || !DEMO_HIDDEN_NAV.has(item.href),
  );

  const displayName =
    // Real name from the Nexus context (http mode); stub roster in dev.
    context.displayName ??
    stubDisplayName(context.nexusUserId) ??
    context.nexusUserId;



  return (
    // The shell owns the viewport and `main` is the scroll container, rather
    // than the window scrolling the whole shell. That's what lets a page ask
    // for the space that's actually left (h-full) — the table needs it, and on
    // a phone the nav bar's height isn't a constant anyone can subtract.
    <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
      {/* Embedded in the coach app: the host owns ALL navigation — desktop
          pages reached from the app render their content only. No in-page
          back link: the app's own header arrow returns to wherever the screen
          was pushed from (Play, Library, Assignments…), which an in-page link
          could only guess at. */}
      {!embedded && (
        <BridgeNav
          navItems={navItems.map(({ href, label }) => ({ href, label }))}
          displayName={displayName}
          // The person's actual role name (custom roles included) wins over
          // the level→prebuilt fallback in `roles`.
          roleText={context.role_name || context.roles.map(roleLabel).join(", ")}
          orgLabel={
            context.programOrganizationId
              ? `Org: ${context.programOrganizationId}`
              : "Program-level access"
          }
          showSignOut={showSignOut}
          showSwitchUser={nexusMode() === "stub" && !demo}
        />
      )}
      {/* Embedded, every pixel belongs to the content — the phone table's
          fit is priced against this height, so shell padding literally
          shrinks the cards. */}
      <main
        className={
          embedded
            ? "min-h-0 min-w-0 flex-1 overflow-y-auto"
            : "min-h-0 min-w-0 flex-1 overflow-y-auto p-3 md:p-8"
        }
      >
        {children}
      </main>
    </div>
  );
}
