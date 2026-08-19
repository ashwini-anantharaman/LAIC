import { canAccessAdminArea } from "@bridge/nexus-client";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CurateBoardForm, CuratedExtras } from "@/components/curate/CurateBoardForm";
import { DealEditor } from "@/components/library/DealEditor";
import { getBridgeContext, getMyLearners } from "@/lib/nexus";

/**
 * The studio's front door on the web (curated v2, owner design 2026-08-18) —
 * the same picker the app mounts, in the web shell, opening onto table2.
 */
export default async function CurateNewPage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const coaches =
    canAccessAdminArea(context) ||
    (await getMyLearners()
      .then((l) => l.length > 0)
      .catch(() => false));
  if (!coaches) redirect("/bridge");

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/bridge/library" className="text-sm font-semibold text-emerald-900 hover:underline">
        ← Library
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Build a curated deal</h1>
      <p className="mt-2 mb-5 text-sm text-neutral-600">
        Build the board — by hand, or prefilled from LIN/PBN — seat your learner, and open
        the studio: you bid every hand, then play theirs against the robots, and that sitting
        becomes the line they follow.
      </p>
      {/* THE LIBRARY'S OWN BOARD EDITOR (boss direction 2026-08-18: one board
          creation screen everywhere), with the curated extras in its footer
          and the studio as its submit. */}
      <CurateBoardForm tableBase="/bridge/table2/">
        <DealEditor
          submitLabel="Open the studio — you bid every hand, then play theirs"
          footer={<CuratedExtras />}
        />
      </CurateBoardForm>
    </main>
  );
}
