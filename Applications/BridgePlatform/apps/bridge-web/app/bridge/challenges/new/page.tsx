import { redirect } from "next/navigation";
import { CreateChallenge } from "./CreateChallenge";
import { listChallengePeople, selfPerson } from "../people";
import { requireFeature } from "@/lib/access";
import { getBridgeContext } from "@/lib/nexus";

/**
 * Create a challenge. The wizard is a client component (a live draft with a
 * pack editor in it); this page is the server half — the gate, the people
 * directory it searches, and the seed its first deals come from.
 */
export default async function NewChallengePage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await requireFeature(context, "page.challenges");
  await requireFeature(context, "challenge.create");

  const people = await listChallengePeople(context);
  // Chosen here, not in the browser: the first paint and the hydrated tree
  // must deal the same cards.
  const seedBase = Math.floor(Math.random() * 0xffffffff) >>> 0;

  return (
    <div className="mx-auto max-w-5xl">
      <CreateChallenge people={people} self={selfPerson(context)} seedBase={seedBase} />
    </div>
  );
}
