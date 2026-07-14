import { roleLabel, stubDisplayName } from "@bridge/nexus-client";
import { redirect } from "next/navigation";
import { clearDevUser } from "@/app/actions";
import { NavLink } from "@/components/NavLink";
import { navForContext } from "@/lib/nav";
import { getBridgeContext, nexusMode } from "@/lib/nexus";

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

  const displayName =
    stubDisplayName(context.nexusUserId) ?? context.nexusUserId;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-[var(--line)] bg-[var(--card)] md:w-64 md:border-b-0 md:border-r">
        <div className="border-b border-[var(--line)] p-4">
          <p className="text-[11px] tracking-[0.35em] text-neutral-500">
            ♠ <span className="text-[var(--madder)]">♥</span> ♣{" "}
            <span className="text-[var(--madder)]">♦</span>
          </p>
          <p className="mt-1 font-serif text-xl font-medium tracking-tight">
            Bridge Platform
          </p>
          <p className="text-xs text-neutral-500">LAIC Bridge Program</p>
        </div>
        <nav className="flex flex-row flex-wrap gap-1 p-3 md:flex-1 md:flex-col md:flex-nowrap md:gap-0 md:space-y-1">
          {navForContext(context).map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>
        <div className="space-y-1 border-t border-[var(--line)] p-4 text-sm">
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
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
