import { redirect } from "next/navigation";

/**
 * The web door to a curated deal's editor (curated v2). The editor itself
 * lives at /m/curated/[entryId] — one implementation, both shells, the same
 * decision /m/table takes for the table. The /m chrome renders fine in a
 * desktop browser, and a second copy of the form would only drift.
 */
export default async function CuratedEditWebPage({
  params,
}: Readonly<{ params: Promise<{ entryId: string }> }>) {
  const { entryId } = await params;
  redirect(`/m/curated/${encodeURIComponent(entryId)}`);
}
