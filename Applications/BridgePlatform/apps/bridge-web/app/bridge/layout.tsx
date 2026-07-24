import { roleLabel, stubDisplayName } from "@bridge/nexus-client";
import { redirect } from "next/navigation";
import { clearDevUser, signOutNexus } from "@/app/actions";
import { NavLink } from "@/components/NavLink";
import { navForContext } from "@/lib/nav";
import { getBridgeContext, isEmbeddedLaunch, nexusMode } from "@/lib/nexus";

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

  const displayName =
    // Real name from the Nexus context (http mode); stub roster in dev.
    context.displayName ??
    stubDisplayName(context.nexusUserId) ??
    context.nexusUserId;



  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-[var(--line)] bg-[var(--card)] md:w-64 md:border-b-0 md:border-r">
        <div className="border-b border-[var(--line)] px-3 py-2 md:p-4">
          <p className="hidden text-[11px] tracking-[0.35em] text-neutral-500 md:block">
            ♠ <span className="text-[var(--madder)]">♥</span> ♣{" "}
            <span className="text-[var(--madder)]">♦</span>
          </p>
          <p className="font-serif text-lg font-medium tracking-tight md:mt-1 md:text-xl">
            Bridge Platform
          </p>
          <p className="hidden text-xs text-neutral-500 md:block">LAIC Bridge Program</p>
        </div>
        <nav className="flex flex-row flex-wrap gap-1 px-2 py-1.5 md:flex-1 md:flex-col md:flex-nowrap md:gap-0 md:space-y-1 md:p-3">
          {navForContext(context).map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>
        {/* Exit controls must exist on every screen size — nobody gets
            trapped in the platform. Identity details stay desktop-only. */}
        <div className="flex items-center gap-2 border-t border-[var(--line)] px-4 py-2 md:hidden">
          {showSignOut && (
            <form action={signOutNexus}>
              <button type="submit" className="text-xs font-medium text-neutral-600 underline-offset-2 hover:underline">
                Sign out
              </button>
            </form>
          )}
        </div>
        <div className="hidden space-y-1 border-t border-[var(--line)] p-4 text-sm md:block">
          {showSignOut && (
            <form action={signOutNexus} className="mb-2">
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:border-emerald-400 hover:text-neutral-900"
              >
                Sign out
              </button>
            </form>
          )}
          <p className="font-medium">{displayName}</p>
          <p className="text-xs text-neutral-500">
            {context.roles.map(roleLabel).join(", ")}
          </p>
          {context.programOrganizationId ? (
            <p className="text-xs text-neutral-500">
              Org: {context.programOrganizationId}
            </p>
          ) : (
            <p className="text-xs text-neutral-500">Program-level access</p>
          )}
          {nexusMode() === "stub" && (
            <form action={clearDevUser}>
              <button
                type="submit"
                className="text-xs text-emerald-700 underline-offset-2 hover:underline"
              >
                Switch user
              </button>
            </form>
          )}
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-3 md:p-8">{children}</main>
    </div>
  );
}
