import { canAccessAdminArea } from "@bridge/nexus-client";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CurateBoardForm, CuratedExtras } from "@/components/curate/CurateBoardForm";
import { DealEditor } from "@/components/library/DealEditor";
import { getBridgeContext, getMyLearners, orgScopeOf } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";

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

  // BOARDS YOU STARTED (owner ask 2026-08-19) — the same list the app's door
  // shows, from summaries rather than sittings. Publishing clears the draft, so
  // a board that shipped leaves this list by itself.
  const started = (
    await sessionService()
      .listRecentSummaries({
        programOrganizationId: orgScopeOf(context),
        createdBy: context.nexusUserId,
        status: "active",
      })
      .catch(() => [])
  )
    .filter((x) => x.authoring?.hasDraft)
    .slice(0, 6);

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
      {started.length > 0 && (
        <div className="mb-5 rounded-lg border border-neutral-200 bg-white p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#541015]">
            Pick up where you left off
          </p>
          <ul className="flex flex-col gap-2">
            {started.map((x) => (
              <li key={x.sessionId}>
                <Link
                  href={`/bridge/table2/${encodeURIComponent(x.sessionId)}?author=1`}
                  className="flex min-h-[44px] items-center gap-3 rounded-lg border border-[#e8ddc3] bg-[#fffdf6] px-3 py-2 no-underline hover:border-emerald-600"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-neutral-900">{x.boardName}</span>
                    <span className="block text-xs text-neutral-500">
                      {x.authoring?.learnerSeat ? `learner ${x.authoring.learnerSeat} · ` : ""}
                      saved {new Date(x.authoring?.draftAt ?? x.updatedAt).toLocaleDateString()}
                    </span>
                  </span>
                  <span className="flex-none text-xs font-bold text-emerald-800">Resume →</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

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
