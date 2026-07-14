import { notFound } from "next/navigation";
import { PlayerEditor } from "@/components/kb/PlayerEditor";
import { kbService, kbStore } from "@/lib/kb";
import { savePlayerAction } from "../../../actions";

export default async function NewPlayerPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string }>;
  searchParams: Promise<{ sandbox?: string }>;
}>) {
  const { kbId } = await params;
  const { sandbox: sandboxId } = await searchParams;
  const store = kbStore();
  const [packs, compiled] = await Promise.all([
    store.listPacksForKb(kbId),
    kbService().liveCompile(kbId),
  ]);
  if (!compiled) notFound();
  const sandbox = sandboxId ? await store.getSandbox(sandboxId) : null;

  return (
    <div className="max-w-3xl">
      <h2 className="mb-1 text-2xl font-medium">New player</h2>
      <p className="mb-6 text-sm text-neutral-600">
        Pick the packs this player carries; the settings those packs expose appear below.
        Validation runs on save.
      </p>
      <PlayerEditor
        kbId={kbId}
        player={null}
        packs={packs}
        compiled={compiled}
        sandbox={sandbox}
        action={savePlayerAction}
      />
    </div>
  );
}
