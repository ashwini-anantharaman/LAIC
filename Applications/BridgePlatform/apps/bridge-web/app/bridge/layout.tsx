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
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50">
        <div className="border-b border-neutral-200 p-4">
          <p className="font-semibold tracking-tight">Bridge Platform</p>
          <p className="text-xs text-neutral-500">LAIC Bridge Program</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navForContext(context).map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>
        <div className="space-y-2 border-t border-neutral-200 p-4 text-sm">
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
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
