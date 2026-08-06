import { redirect } from "next/navigation";
import { canUse } from "@/lib/access";
import { getBridgeContext } from "@/lib/nexus";

/**
 * Access gate for the audit area. Server-side check:
 * hiding the nav item is cosmetic; this layout is the enforcement point for
 * every /bridge/admin/* route.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  if (!(await canUse(context, "page.audit"))) redirect("/bridge/home");
  return <>{children}</>;
}
