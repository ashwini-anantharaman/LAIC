import { ItemEditor } from "@/components/kb/ItemEditor";
import { createItemAction } from "../../../actions";

/** Hand-author a knowledge item (cited to the Claude source until a fellow
 *  attaches document passages). */
export default async function NewItemPage({
  params,
}: Readonly<{ params: Promise<{ kbId: string }> }>) {
  const { kbId } = await params;
  return (
    <div className="max-w-3xl">
      <h2 className="mb-1 text-2xl font-medium">New capability</h2>
      <p className="mb-6 text-sm text-neutral-600">
        Hand-authored items cite the Claude source by default — attach real
        passages by editing after upload, or prefer extraction for anything
        the system document covers.
      </p>
      <ItemEditor kbId={kbId} item={null} action={createItemAction} />
    </div>
  );
}
