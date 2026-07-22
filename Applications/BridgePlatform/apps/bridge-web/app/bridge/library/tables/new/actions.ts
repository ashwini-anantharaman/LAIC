"use server";

// New-table actions (2026-07-22): saving a seat lineup from the table builder
// as a library `table` entry. Dealing the lineup straight onto a board goes
// through the table actions (createSessionAction) instead.

import type { Seat } from "@bridge/events";
import { newId } from "@bridge/kb";
import type { LibraryEntry, LibrarySeatRef } from "@bridge/sessions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { kbStore } from "@/lib/kb";
import { libraryStore } from "@/lib/sessions";

/** "Save lineup to library": the custom-table form's second submit — the same
 *  seats that would deal a board become a reusable `table` entry instead. */
export async function createTableEntryAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const store = kbStore();
  const kbId = String(formData.get("kbId"));
  const kb = await store.getKb(kbId);
  if (!kb) throw new Error("Knowledge base not found");

  const humanSeat = String(formData.get("humanSeat") ?? "").trim();
  const seats = {} as Record<Seat, LibrarySeatRef>;
  for (const seat of ["N", "E", "S", "W"] as Seat[]) {
    if (seat === humanSeat) {
      seats[seat] = { label: "you", human: true };
      continue;
    }
    const playerId = String(formData.get(`player:${seat}`) ?? "");
    const player = playerId ? await store.getPlayer(playerId) : null;
    if (!player) throw new Error(`Pick a player for seat ${seat} before saving`);
    seats[seat] = { label: player.name, playerId: player.playerId };
  }

  const name = String(formData.get("name") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const entry: LibraryEntry = {
    entryId: newId("le"),
    kind: "table",
    name: name || `${kb.name} lineup`,
    ...(notes ? { notes } : {}),
    tags: [],
    kbId,
    seats,
    origin: "authored",
    createdBy: context.nexusUserId,
    createdAt: new Date().toISOString(),
  };
  try {
    await libraryStore().putEntry(entry);
  } catch {
    redirect(
      `/bridge/library?error=${encodeURIComponent(
        "Couldn't save — the library isn't provisioned on this backend yet (migration 0015_library.sql).",
      )}`,
    );
  }
  await audit(context, "profile.create", "kb_library", entry.entryId, { table: true, kbId });
  revalidatePath("/bridge/library");
  redirect(`/bridge/library/${entry.entryId}`);
}
