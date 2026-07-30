import Link from "next/link";
import { redirect } from "next/navigation";
import { DealEditor } from "@/components/library/DealEditor";
import { bridgeLibrary, libraryPrincipalOf } from "@/lib/libraryComponent";
import { getBridgeContext } from "@/lib/nexus";
import { updateDealAction } from "../../actions";

/** Edit a saved deal/board in place (same editor as authoring, prefilled).
 *  Policy-gated by the library component: owners edit their own instance,
 *  program authors the program's. Envelope and provenance never change. */
export default async function EditDealPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ entryId: string }>;
  searchParams: Promise<{ error?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const { entryId } = await params;
  const { error } = await searchParams;

  const service = bridgeLibrary();
  const principal = await libraryPrincipalOf(context);
  const item = await service.get(principal, entryId).catch(() => null);
  if (!item) redirect("/bridge/library");
  if (item.kind !== "deal" && item.kind !== "board") redirect(`/bridge/library/${entryId}`);
  if (!service.can(principal, "edit", { level: item.scope.level, ownerId: item.scope.ownerId }))
    redirect(`/bridge/library/${entryId}`);
  if (!item.content.hands) redirect(`/bridge/library/${entryId}`);

  const noun = item.kind === "deal" ? "deal" : "board";

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <p className="text-sm">
          <Link href="/bridge/library" className="text-neutral-500 underline-offset-4 hover:underline">
            Library
          </Link>{" "}
          <span className="text-neutral-400">/ edit {noun}</span>
        </p>
        <h1 className="mt-1 text-3xl font-medium">Edit {noun}</h1>
        <p className="mt-2 max-w-xl text-sm text-neutral-600">
          Rearrange the cards or update the facts — saving replaces this {noun} in
          place. Copies people already received are snapshots and stay unchanged.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <form action={updateDealAction}>
        <input type="hidden" name="entryId" value={item.id} />
        <DealEditor
          initialName={item.name}
          initialDealer={item.content.dealer ?? "N"}
          initialVul={item.content.vul ?? "none"}
          initialNotes={item.notes ?? ""}
          initialHands={item.content.hands}
          hideBoardFacts={item.kind === "deal"}
          submitLabel="Save changes"
        />
      </form>
    </div>
  );
}
