import Link from "next/link";
import { redirect } from "next/navigation";
import { DealEditor } from "@/components/library/DealEditor";
import { getBridgeContext } from "@/lib/nexus";
import { createDealAction } from "../actions";

/** Author a board by hand (2026-07-17, prototype-inspired deal editor). */
export default async function NewDealPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <p className="text-sm">
          <Link href="/bridge/library" className="text-neutral-500 underline-offset-4 hover:underline">
            Library
          </Link>{" "}
          <span className="text-neutral-400">/ new board</span>
        </p>
        <h1 className="mt-1 text-3xl font-medium">Deal editor</h1>
        <p className="mt-2 max-w-xl text-sm text-neutral-600">
          Type each hand suit by suit — duplicates are flagged as you go, and the last hand is
          one click. The saved board lands in the library, ready to deal onto a table.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <form action={createDealAction}>
        <DealEditor />
      </form>
    </div>
  );
}
