"use server";

// Library actions (2026-07-16 fellows UI rework): LIN/PBN import, deal an
// entry back onto a table, start a saved table lineup, delete. Recording
// FROM a live board lives in the table actions (it reads session state).

import type { Seat } from "@bridge/events";
import { parseLinToContexts, parsePbn, validateDeal, type GameContext } from "@bridge/formats";
import { newId } from "@bridge/kb";
import { SessionService, type LibraryEntry, type SeatConfig } from "@bridge/sessions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/api";
import { ensureHousePlayer, ladderRungs } from "@/lib/arena";
import { audit } from "@/lib/audit";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";
import { assertAiAllowed, assertKbAllowed } from "@/lib/org";
import { libraryStore, sessionService } from "@/lib/sessions";

const MAX_IMPORT_BYTES = 1_000_000;

function fail(message: string): never {
  redirect(`/bridge/library?error=${encodeURIComponent(message)}`);
}

/** Upload a .lin or .pbn file → one library entry per complete board. */
export async function importFileAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) fail("Choose a .lin or .pbn file first.");
  if (file.size > MAX_IMPORT_BYTES) fail("That file is over 1 MB — export single sessions.");

  const text = await file.text();
  const looksLin = /(^|\|)md\|/.test(text) || file.name.toLowerCase().endsWith(".lin");
  const result = looksLin ? parseLinToContexts(text) : parsePbn(text);
  if (!result.ok) fail(result.error);

  const lib = libraryStore();
  const now = new Date().toISOString();
  let saved = 0;
  let firstKind = "board";
  for (const ctx of result.contexts) {
    const invalid = validateDeal(ctx.hands);
    if (invalid) continue;
    const entry: LibraryEntry = {
      entryId: newId("le"),
      kind: ctx.play?.length || ctx.auction.length ? "play" : "board",
      name: ctx.name || `${file.name} board ${saved + 1}`,
      tags: [],
      hands: ctx.hands,
      dealer: ctx.dealer,
      vul: ctx.vul,
      auction: ctx.auction.map((a) => ({ seat: a.seat, call: a.call })),
      play: (ctx.play ?? []).map((p) => ({ seat: p.seat, card: p.card })),
      contractLabel: contractText(ctx),
      origin: "imported",
      importFileName: file.name,
      createdBy: context.nexusUserId,
      createdAt: now,
    };
    try {
      await lib.putEntry(entry);
    } catch {
      fail(
        "Couldn't import — the library isn't provisioned on this backend yet (migration 0015_library.sql).",
      );
    }
    if (saved === 0) firstKind = entry.kind;
    saved++;
  }
  if (!saved) fail("No complete boards in that file.");
  await audit(context, "profile.create", "kb_library", `import:${file.name}`, { saved });
  revalidatePath("/bridge/library");
  redirect(`/bridge/library?kind=${firstKind}&imported=${saved}`);
}

function contractText(ctx: GameContext): string | undefined {
  if (!ctx.contract) return undefined;
  const strain = ctx.contract.strain === "N" ? "NT" : ctx.contract.strain;
  const dbl = ctx.contract.doubled === 1 ? "X" : ctx.contract.doubled === 2 ? "XX" : "";
  return `${ctx.contract.level}${strain}${dbl} by ${ctx.contract.declarer}`;
}

/** Deal a saved deal/board/play onto a fresh table vs. house players. */
export async function playEntryAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  await ensureSeeds();
  await assertAiAllowed(context);
  const entryId = String(formData.get("entryId"));
  const entry = await libraryStore().getEntry(entryId);
  if (!entry?.hands) throw new Error("This entry has no deal to play");

  // The lineup: a saved `table` entry names its KB; card entries play against
  // the house lineup of the requested (or first compiled) knowledge base.
  const store = kbStore();
  const requestedKb = String(formData.get("kbId") ?? "").trim();
  let kbId = requestedKb || entry.kbId || "";
  if (!kbId) {
    for (const kb of await store.listKbs()) {
      if (await kbService().liveCompile(kb.kbId)) {
        kbId = kb.kbId;
        break;
      }
    }
  }
  if (!kbId) throw new Error("No knowledge base has a live compile yet");
  await assertKbAllowed(context, kbId);
  const compiled = await kbService().liveCompile(kbId);
  if (!compiled) throw new Error("This knowledge base has no live compile yet");

  const rungs = ladderRungs(compiled);
  const top = rungs[rungs.length - 1];
  if (!top) throw new Error("This knowledge base has no ladder packs yet");
  const house = await ensureHousePlayer(store, compiled, top, context.nexusUserId);
  const ai = SessionService.seatFromPlayer(house, compiled);
  const seats = { N: ai, E: ai, S: ai, W: ai } as Record<Seat, SeatConfig>;
  seats.S = { kind: "human", nexusUserId: context.nexusUserId };

  const record = await sessionService().createSession({
    kbId,
    compiled,
    seats,
    seed: 1,
    hands: entry.hands,
    dealer: entry.dealer ?? "N",
    vul: entry.vul ?? "none",
    boardName: entry.name,
    createdBy: context.nexusUserId,
  });
  await audit(context, "profile.update", "kb_session", record.sessionId, {
    kbId,
    fromLibrary: entryId,
  });
  redirect(`/bridge/table/${record.sessionId}`);
}

/** Start a saved table lineup on a fresh deal. */
export async function startTableEntryAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  await ensureSeeds();
  await assertAiAllowed(context);
  const entryId = String(formData.get("entryId"));
  const entry = await libraryStore().getEntry(entryId);
  if (entry?.kind !== "table" || !entry.kbId || !entry.seats)
    throw new Error("This entry is not a table lineup");
  await assertKbAllowed(context, entry.kbId);
  const compiled = await kbService().liveCompile(entry.kbId);
  if (!compiled) throw new Error("This knowledge base has no live compile yet");

  const store = kbStore();
  const seats = {} as Record<Seat, SeatConfig>;
  for (const seat of ["N", "E", "S", "W"] as Seat[]) {
    const ref = entry.seats[seat];
    if (ref.human || !ref.playerId) {
      seats[seat] = { kind: "human", nexusUserId: context.nexusUserId };
      continue;
    }
    const player = await store.getPlayer(ref.playerId);
    if (!player) throw new Error(`Saved player for seat ${seat} no longer exists`);
    seats[seat] = SessionService.seatFromPlayer(player, compiled);
  }

  const record = await sessionService().createSession({
    kbId: entry.kbId,
    compiled,
    seats,
    seed: (Date.now() % 100_000) + 1,
    boardName: `${entry.name} — fresh deal`,
    createdBy: context.nexusUserId,
  });
  await audit(context, "profile.update", "kb_session", record.sessionId, {
    kbId: entry.kbId,
    fromTableEntry: entryId,
  });
  redirect(`/bridge/table/${record.sessionId}`);
}

export async function deleteEntryAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const entryId = String(formData.get("entryId"));
  const entry = await libraryStore().getEntry(entryId);
  if (entry) {
    await libraryStore().deleteEntry(entryId);
    await audit(context, "profile.update", "kb_library", entryId, { deleted: true });
  }
  revalidatePath("/bridge/library");
  redirect(`/bridge/library?kind=${entry?.kind ?? "board"}`);
}
