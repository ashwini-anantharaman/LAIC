import { stubDisplayName } from "@bridge/nexus-client";
import { redirect } from "next/navigation";
import { getBridgeContext, isFellowDemo } from "@/lib/nexus";

/** Home: the knowledge-base platform, post-rework. */
export default async function HomePage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  // Hidden on the fellows-testing deployment.
  if (await isFellowDemo()) redirect("/bridge/table");

  const firstName = (
    stubDisplayName(context.nexusUserId) ?? context.nexusUserId
  ).split(" ")[0];

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">
        Bridge Platform
      </p>
      <h1 className="mt-2 font-serif text-3xl font-medium">
        Welcome back, {firstName}.
      </h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-neutral-600">
        <p>
          Every rule here belongs to a <strong>knowledge base</strong> (SAYC,
          2/1, …). Players are assembled from knowledge sets; every AI
          decision at the table traces to the rule, the knowledge item, and
          the source passage that produced it — and editing a knowledge item
          changes how the AI plays, immediately.
        </p>
        <p>
          Jump into <strong>Play</strong> — pick a knowledge set and the house
          players are provisioned for you. <strong>Players</strong> collects
          everyone&apos;s configured players (one click per knowledge set to
          make your own); the <strong>Library</strong> keeps the deals,
          boards, lineups and plays worth returning to, and imports LIN/PBN.
          The <strong>Knowledge bases</strong> workspace remains where you
          upload a system document and shape what the players know.
        </p>
      </div>
    </div>
  );
}
