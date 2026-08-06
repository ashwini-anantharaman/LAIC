import { redirect } from "next/navigation";
import { getAppearance } from "@/lib/appearance";
import { requireFeature } from "@/lib/access";
import { getBridgeContext } from "@/lib/nexus";
import { saveAppearanceAction } from "./actions";
import { SkinsClient } from "./SkinsClient";

/**
 * Skins & appearance (2026-08): the full configurator. Gated by page.skins;
 * loads the signed-in user's saved appearance and hands it to the client as the
 * initial STAGED look. Presets, the skin gallery, layout toggles, colour
 * overrides and a live preview all mutate that staged copy; Save persists it.
 */
export default async function SkinsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ saved?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await requireFeature(context, "page.skins");

  const [saved, params] = await Promise.all([
    getAppearance(context.nexusUserId),
    searchParams,
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Skins &amp; appearance</h1>
        <p className="text-sm text-neutral-600">
          Dress your table: pick a skin, a preset, or fine-tune the felt, bidding pad and hand
          layout. Changes preview live and save to your account.
        </p>
      </header>

      {params.saved && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          Appearance saved. Your next table dresses itself with this look.
        </p>
      )}

      <SkinsClient initial={saved} save={saveAppearanceAction} />
    </div>
  );
}
