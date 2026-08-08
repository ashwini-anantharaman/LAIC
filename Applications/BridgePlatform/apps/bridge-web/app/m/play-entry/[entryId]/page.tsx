import { redirect } from "next/navigation";
import { resolveEntryLineup } from "@/app/bridge/library/actions";
import { audit } from "@/lib/audit";
import { ensureSeeds } from "@/lib/kb";
import { getBridgeContext, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { assertAiAllowed } from "@/lib/org";
import { libraryStore, sessionService } from "@/lib/sessions";

/**
 * Learn↔Play deep link: GET this URL and the library entry is dealt onto a
 * fresh mobile table — the "Play this board" button inside a lesson lands
 * here. It's a GET twin of playEntryAction because the caller is a plain
 * link from ANOTHER platform (the LP), not a form on ours.
 *
 * Access note: lessons embed program boards as snapshots; the reader holds
 * the entryId from that snapshot. Possession of the id from published
 * teaching content is the grant — the entry is read directly, then the
 * SESSION created is the caller's own (their instance, their game).
 */
export default async function PlayEntryDeepLink({
  params,
}: Readonly<{ params: Promise<{ entryId: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await ensureSeeds();
  await assertAiAllowed(context);

  const { entryId } = await params;
  const entry = await libraryStore().getEntry(entryId);
  if (!entry?.hands) redirect("/m/library");

  const { kbId, compiled, seats } = await resolveEntryLineup(entry, "", context);
  const record = await sessionService().createSession({
    kbId,
    compiled,
    seats,
    seed: 1,
    hands: entry.hands,
    dealer: entry.dealer ?? "N",
    vul: entry.vul ?? "none",
    boardName: entry.name,
    createdBy: context.nexusUserId,
    programOrganizationId: orgScopeOf(context),
    nexusProgramId: (await nexusProgramIdOf()) ?? undefined,
  });
  await audit(context, "profile.update", "kb_session", record.sessionId, {
    kbId,
    fromLibrary: entryId,
    viaLesson: true,
  });
  // Straight to the table page — /m/table/[id] is itself only a redirect to
  // it, and each hop is a serverless invocation the player waits on.
  redirect(`/bridge/table2/${record.sessionId}`);
}
