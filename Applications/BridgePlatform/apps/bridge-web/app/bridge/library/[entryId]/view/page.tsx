// Full-screen hand record for a library entry — the HandViewer design over a
// saved deal/board/play. Read-only by construction: a saved record shows all
// four hands; playing it happens from the entry page, not here.

import type { Seat } from "@bridge/events";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { HandViewer } from "@bridge/table-ui";
import { libraryKindLabel } from "@/lib/libraryLabels";
import { requireFeature } from "@/lib/access";
import { getBridgeContext } from "@/lib/nexus";
import { libraryStore } from "@/lib/sessions";

export default async function LibraryHandViewerPage({
  params,
}: Readonly<{ params: Promise<{ entryId: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await requireFeature(context, "page.library");
  await requireFeature(context, "library.hand_viewer");
  const { entryId } = await params;
  const entry = await libraryStore().getEntry(entryId);
  if (!entry?.hands) notFound();

  const seatFallback: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };
  const names = (["N", "E", "S", "W"] as Seat[]).reduce(
    (acc, seat) => {
      const ref = entry.seats?.[seat];
      acc[seat] = ref ? (ref.human ? "you" : ref.label) : seatFallback[seat];
      return acc;
    },
    {} as Record<Seat, string>,
  );

  return (
    <div className="mx-auto w-full">
      <p className="mb-2 flex items-baseline gap-3 text-xs text-neutral-400">
        <Link href={`/bridge/library/${entry.entryId}`} className="hover:underline">
          ⟵ {entry.name}
        </Link>
        <span>
          Library / {libraryKindLabel(entry.kind)} · hand record
        </span>
      </p>
      <div className="overflow-hidden rounded-lg" style={{ height: "calc(100vh - 7.5rem)" }}>
        <HandViewer
          boardLabel={/(\d+)(?!.*\d)/.exec(entry.name)?.[1] ?? entry.name}
          dealer={entry.dealer ?? "N"}
          vul={entry.vul ?? "none"}
          hands={entry.hands}
          names={names}
          auction={entry.auction ?? []}
          highlightSeat={entry.dealer ?? null}
          info={[
            { label: `Library · ${libraryKindLabel(entry.kind)}`, value: entry.createdAt.slice(0, 10) },
            ...(entry.notes ? [{ label: entry.notes, value: "" }] : []),
          ]}
          result={[
            {
              label: entry.contractLabel ?? "No contract recorded",
              value: entry.resultLabel ?? "",
            },
          ]}
        />
      </div>
    </div>
  );
}
