import { canAccessAdminArea, stubDisplayName } from "@bridge/nexus-client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getBridgeContext } from "@/lib/nexus";
import { progressService } from "@/lib/progress";
import { sessionService } from "@/lib/sessions";

function Card({
  title,
  href,
  cta,
  children,
}: Readonly<{
  title: string;
  href: string;
  cta: string;
  children: React.ReactNode;
}>) {
  return (
    <section className="flex flex-col rounded-lg border border-neutral-200 p-5 shadow-sm">
      <h2 className="mb-2 text-lg font-medium">{title}</h2>
      <div className="flex-1 text-sm text-neutral-600">{children}</div>
      <p className="mt-4">
        <Link
          href={href}
          className="text-sm font-medium text-emerald-700 underline-offset-4 hover:underline"
        >
          {cta} →
        </Link>
      </p>
    </section>
  );
}

export default async function HomePage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");

  const firstName = (
    stubDisplayName(context.nexusUserId) ?? context.nexusUserId
  ).split(" ")[0];

  const sessions = (await sessionService().listSessions(context))
    .slice()
    .reverse();
  const active = sessions.filter((s) => s.status === "active");
  const completed = sessions.filter((s) => s.status === "completed");
  const recent = sessions.slice(0, 3);

  let signalCount = 0;
  try {
    signalCount = (
      await (await progressService()).getSummary(
        context.nexusUserId,
        context,
        "bridge",
      )
    ).recentSignals.length;
  } catch {
    // No signals yet — the card copy handles it.
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-[0.25em] text-emerald-700">
          ♠ ♥ ♣ ♦
        </p>
        <h1 className="text-3xl font-medium tracking-tight">
          Welcome back, {firstName}
        </h1>
        <p className="text-sm text-neutral-500">
          {context.groupId
            ? `Playing with ${context.groupId}`
            : context.programOrganizationId
              ? `Acting for ${context.programOrganizationId}`
              : "Program-level session"}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Deal a board" href="/bridge/play" cta="Play & practice">
          Sit at a table with three AI players who bid and play by an open,
          cited rulebook — click any of their decisions to see exactly where
          it came from.
        </Card>

        <Card
          title={active.length ? "Pick up where you left off" : "Recent boards"}
          href="/bridge/play"
          cta="All sessions"
        >
          {recent.length === 0 ? (
            "Nothing played yet — your boards will collect here."
          ) : (
            <ul className="space-y-1.5">
              {recent.map((s) => (
                <li key={s.bridgeSessionId}>
                  <Link
                    href={`/bridge/play/${s.bridgeSessionId}`}
                    className="group flex items-baseline justify-between gap-3"
                  >
                    <span className="font-medium text-neutral-800 underline-offset-4 group-hover:underline">
                      {s.board.name}
                    </span>
                    <span
                      className={
                        s.status === "completed"
                          ? "text-xs text-emerald-700"
                          : "text-xs text-amber-700"
                      }
                    >
                      {s.status === "completed" ? "completed" : "in play"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Your progress" href="/bridge/progress" cta="See progress">
          {signalCount
            ? `${completed.length} board${completed.length === 1 ? "" : "s"} completed · ${signalCount} recent signal${signalCount === 1 ? "" : "s"} from your own bids and plays — never invented, always rebuildable from events.`
            : "Play a board with a human seat and your bids and plays become progress signals, judged against the same cited rules the AI follows."}
        </Card>

        {canAccessAdminArea(context) ? (
          <Card title="Knowledge base" href="/bridge/admin" cta="Open admin">
            Sources, human-readable rules, gap registry, generation runs —
            the rulebook the players run on, with every rule tracing back to
            a passage.
          </Card>
        ) : (
          <Card
            title="Boards & deals"
            href="/bridge/boards"
            cta="Open library"
          >
            Import a PBN or LIN board, keep favourites in your library, and
            share deals with a link.
          </Card>
        )}
      </div>
    </div>
  );
}
