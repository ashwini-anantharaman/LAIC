import { redirect } from "next/navigation";

/**
 * Mobile table = THE table (owner decision 2026-07-30): the design-component
 * table (/bridge/table2, <PlayTable/>) is the one table experience on every
 * screen size — its components are fluid and hold up at phone widths, and the
 * separate green-felt mobile skin diverged from the design. This route stays
 * so every existing link (library Play buttons, assignments, play-entry deep
 * links, My Games) keeps working; it simply lands on the real table. In the
 * coach app the embedded layout contributes the "‹ Library" back pill.
 */
export default async function MobileTablePage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}>) {
  const { sessionId } = await params;
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) q.set(k, v);
  const qs = q.toString();
  redirect(`/bridge/table2/${sessionId}${qs ? `?${qs}` : ""}`);
}
