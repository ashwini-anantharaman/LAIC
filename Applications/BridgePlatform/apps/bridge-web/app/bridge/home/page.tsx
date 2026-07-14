import { stubDisplayName } from "@bridge/nexus-client";
import { redirect } from "next/navigation";
import { getBridgeContext } from "@/lib/nexus";

/**
 * Rebuild notice (Knowledge Rework spec, Stage A): the knowledge, player,
 * and table surfaces are being rebuilt on the knowledge-base model. Owner
 * accepted downtime for this window (decision: hard wipe, staged delivery).
 */
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
        Rebuilding, {firstName}.
      </h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-neutral-600">
        <p>
          The platform is moving to <strong>knowledge bases</strong>: every
          rule belongs to a system (SAYC, 2/1, …), players are assembled from
          capability packs, and editing a knowledge item changes how the AI
          plays — immediately, with full provenance.
        </p>
        <p>
          The knowledge workspace, player builder, and verification table are
          being rebuilt stage by stage and will reappear here as they land.
          Organization settings and the audit log remain available.
        </p>
      </div>
    </div>
  );
}
