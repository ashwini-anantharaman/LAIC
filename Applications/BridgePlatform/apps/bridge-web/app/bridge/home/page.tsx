import { stubDisplayName } from "@bridge/nexus-client";
import { redirect } from "next/navigation";
import { getBridgeContext } from "@/lib/nexus";

/** Home: the knowledge-base platform, post-rework. */
export default async function HomePage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");

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
          2/1, …). Players are assembled from capability packs; every AI
          decision at the table traces to the rule, the knowledge item, and
          the source passage that produced it — and editing an item changes
          how the AI plays, immediately.
        </p>
        <p>
          Head to the <strong>Table</strong> to play, or the{" "}
          <strong>Knowledge bases</strong> workspace to upload a system
          document, review extracted items, build the pack ladder, and
          assemble players.
        </p>
      </div>
    </div>
  );
}
