import { defaultSettingValues } from "@bridge/config";
import type { Seat } from "@bridge/events";
import { generateConventionCard } from "@bridge/profiles";
import { SessionAccessError } from "@bridge/sessions";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConventionCardView } from "@/components/ConventionCardView";
import { PrintButton } from "@/components/PrintButton";
import { knowledgeStore } from "@/lib/knowledge";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";

/**
 * The convention card a seat is playing by at THIS table — generated from
 * the session's pinned package version and the seat's effective values
 * (its own configuration when it has one, the table default otherwise).
 */
export default async function SeatCardPage({
  params,
}: Readonly<{ params: Promise<{ sessionId: string; seat: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const { sessionId, seat: seatParam } = await params;
  const seat = seatParam.toUpperCase() as Seat;
  if (!["N", "E", "S", "W"].includes(seat)) notFound();

  let record;
  try {
    record = (await sessionService().getSession(sessionId, context)).record;
  } catch (e) {
    if (e instanceof SessionAccessError) notFound();
    throw e;
  }
  const pkgRecord = await knowledgeStore().getPackage(
    record.packageRef.packageId,
    record.packageRef.version,
  );
  if (!pkgRecord) notFound();

  const values = record.seatValues?.[seat] ?? record.resolvedValues;
  const sharedBy = (["N", "E", "S", "W"] as Seat[]).filter((s) =>
    JSON.stringify(record.seatValues?.[s] ?? record.resolvedValues) === JSON.stringify(values),
  );
  const who = record.seats[seat].label ?? (record.seats[seat].playerKind === "human" ? "human" : "AI");
  const card = generateConventionCard(pkgRecord.pkg, values, `${who} (${seat})`);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Convention card — {seat}</h1>
          <p className="text-sm text-neutral-500">
            {record.board.name} · played by seat{sharedBy.length > 1 ? "s" : ""}{" "}
            {sharedBy.join(", ")}
          </p>
        </div>
        <PrintButton />
      </header>

      <ConventionCardView
        card={card}
        defaults={defaultSettingValues(pkgRecord.pkg.settings)}
        subtitle={`${record.board.name} · seats ${sharedBy.join(", ")}`}
      />

      <p className="print:hidden">
        <Link
          href={`/bridge/play/${sessionId}`}
          className="text-sm text-emerald-700 hover:underline"
        >
          ← Back to the table
        </Link>
      </p>
    </div>
  );
}
