import { canAccessAdminArea } from "@bridge/nexus-client";
import { redirect } from "next/navigation";
import { getBridgeContext } from "@/lib/nexus";

/**
 * Role gate for the knowledge admin area. Server-side check:
 * hiding the nav item is cosmetic; this layout is the enforcement point for
 * every /bridge/admin/* route.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  if (!canAccessAdminArea(context)) redirect("/bridge/home");
  return <>{children}</>;
}
