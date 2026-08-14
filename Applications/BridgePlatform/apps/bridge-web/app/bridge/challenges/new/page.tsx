import { redirect } from "next/navigation";
import { libraryStore } from "@/lib/sessions";
import { normalizeDraft, type ChallengeDraft } from "../draft";
import { CreateChallenge } from "./CreateChallenge";
import { listChallengePeople, selfPerson } from "../people";
import { requireFeature } from "@/lib/access";
import { getBridgeContext } from "@/lib/nexus";

/**
 * Create a challenge. The wizard is a client component (a live draft with a
 * pack editor in it); this page is the server half — the gate, the people
 * directory it searches, and the seed its first deals come from.
 */
export default async function NewChallengePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ draft?: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await requireFeature(context, "page.challenges");
  await requireFeature(context, "challenge.create");

  /**
   * Picking up parked work. The stored draft is TEXT, and it is re-read through
   * the same normaliser a fresh draft goes through — a draft saved before a
   * field existed opens with that field defaulted rather than undefined, which
   * is the whole reason parking is worth anything. Anything unreadable, or
   * anyone else's, simply starts a blank wizard: a broken row must not lock the
   * creator out of making a challenge.
   */
  const { draft: draftEntryId } = await searchParams;
  let initialDraft: ChallengeDraft | undefined;
  if (draftEntryId) {
    try {
      const entry = await libraryStore().getEntry(draftEntryId);
      if (entry?.createdBy === context.nexusUserId && entry.challengeDraftJson)
        initialDraft = normalizeDraft(JSON.parse(entry.challengeDraftJson));
    } catch {
      initialDraft = undefined;
    }
  }

  const people = await listChallengePeople(context);
  // Chosen here, not in the browser: the first paint and the hydrated tree
  // must deal the same cards.
  const seedBase = Math.floor(Math.random() * 0xffffffff) >>> 0;

  return (
    <div className="mx-auto max-w-5xl">
      <CreateChallenge
        people={people}
        self={selfPerson(context)}
        seedBase={seedBase}
        {...(initialDraft ? { initialDraft, draftEntryId } : {})}
      />
    </div>
  );
}
