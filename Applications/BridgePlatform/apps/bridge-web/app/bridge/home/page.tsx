import { canAccessAdminArea, stubDisplayName } from "@bridge/nexus-client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getBridgeContext } from "@/lib/nexus";

function Card({
  title,
  children,
}: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section className="rounded-lg border border-neutral-200 p-5">
      <h2 className="mb-2 font-medium">{title}</h2>
      <div className="text-sm text-neutral-600">{children}</div>
    </section>
  );
}

export default async function HomePage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");

  const firstName = (
    stubDisplayName(context.nexusUserId) ?? context.nexusUserId
  ).split(" ")[0];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {firstName}
        </h1>
        <p className="text-sm text-neutral-500">
          {context.groupId
            ? `Group: ${context.groupId}`
            : "No group context for this session."}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Quick-start practice">
          Sit at a table with three AI players at your level.
          <br />
          <span className="mt-2 inline-block rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-500">
            Table arrives in Phase 5 · level-scoped dealing in Phase 6
          </span>
        </Card>

        <Card title="Recent sessions">
          No sessions yet. Played boards will appear here once persistent
          sessions land.
          <br />
          <span className="mt-2 inline-block rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-500">
            Phase 4
          </span>
        </Card>

        <Card title="Progress summary">
          Bidding and play progress signals, system familiarity, and areas to
          work on — bridge-domain only.
          <br />
          <span className="mt-2 inline-block rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-500">
            Phase 8
          </span>
        </Card>

        {canAccessAdminArea(context) && (
          <Card title="Knowledge base">
            Sources, human-readable rules, gap registry, and package
            publication.{" "}
            <Link
              href="/bridge/admin"
              className="text-emerald-700 underline-offset-2 hover:underline"
            >
              Open the admin area
            </Link>
            .
            <br />
            <span className="mt-2 inline-block rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-500">
              Phase 3
            </span>
          </Card>
        )}
      </div>
    </div>
  );
}
