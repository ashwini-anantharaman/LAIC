"use server";

// Drill actions (Pillar D): save a decision point as a bidding regression
// drill, and seed the fellows' named cases. A drill is a LibraryEntry of kind
// "drill" scoped to a KB via `kbId`; the acting seat's hand + auction-so-far +
// expected call(s) fully specify a decideBid check. Additive jsonb fields, so
// no migration — the library store round-trips the whole entry.

import type { Card, Seat, Vul } from "@bridge/events";
import { newId } from "@bridge/kb";
import type { LibraryEntry } from "@bridge/sessions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/api";
import { nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { audit } from "@/lib/audit";
import { ensureSeeds } from "@/lib/kb";
import { EXPERT_SEEDS, parseExpectedCalls } from "@/lib/drills";
import { libraryStore } from "@/lib/sessions";
import { parseAuction, parseHand } from "@/lib/testBench";

const drillsPath = (kbId: string, q = "") => `/bridge/kb/${kbId}/drills${q}`;

/**
 * Build a drill entry from an auction + a single hand (the acting seat's) +
 * expected calls. Returns the entry, or throws with a friendly parse error.
 */
function buildDrill(input: {
  kbId: string;
  name: string;
  handText: string;
  auctionText: string;
  dealer: Seat;
  vul: Vul;
  expectedText: string;
  note?: string;
  createdBy: string;
  programOrganizationId: string;
  nexusProgramId?: string;
}): LibraryEntry {
  const auctionParsed = parseAuction(input.auctionText, input.dealer);
  if ("error" in auctionParsed) throw new Error(`Auction: ${auctionParsed.error}`);
  const handParsed = parseHand(input.handText);
  if ("error" in handParsed) throw new Error(`Hand: ${handParsed.error}`);
  const expectedCalls = parseExpectedCalls(input.expectedText);
  if (expectedCalls.length === 0) throw new Error("Give at least one expected call.");

  const { auction, toAct } = auctionParsed;
  const hands: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
  hands[toAct] = handParsed.hand;

  return {
    entryId: newId("le"),
    kind: "drill",
    name: input.name.trim() || `${input.auctionText || "opening"} — ${input.dealer}`,
    tags: ["drill"],
    kbId: input.kbId,
    dealer: input.dealer,
    vul: input.vul,
    auction: auction.map((c) => ({ seat: c.seat, call: c.call })),
    hands,
    expectedCalls,
    ...(input.note?.trim() ? { notes: input.note.trim() } : {}),
    origin: "authored",
    createdBy: input.createdBy,
    programOrganizationId: input.programOrganizationId,
    nexusProgramId: input.nexusProgramId,
    // Drills are knowledge-base regression content — program instance.
    scopeLevel: "program",
    createdAt: new Date().toISOString(),
  };
}

/** Save a single decision point as a drill (from the explorer / test bench). */
export async function saveDrillAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  await ensureSeeds();
  const kbId = String(formData.get("kbId"));
  const dealer = (String(formData.get("dealer") ?? "N") || "N") as Seat;
  const vul = (String(formData.get("vul") ?? "none") || "none") as Vul;

  let entry: LibraryEntry;
  try {
    entry = buildDrill({
      kbId,
      name: String(formData.get("name") ?? ""),
      handText: String(formData.get("hand") ?? ""),
      auctionText: String(formData.get("auction") ?? ""),
      dealer,
      vul,
      expectedText: String(formData.get("expected") ?? ""),
      note: String(formData.get("note") ?? ""),
      createdBy: context.nexusUserId,
      programOrganizationId: orgScopeOf(context),
      nexusProgramId: (await nexusProgramIdOf()) ?? undefined,
    });
  } catch (err) {
    redirect(drillsPath(kbId, `?error=${encodeURIComponent(err instanceof Error ? err.message : String(err))}`));
  }

  try {
    await libraryStore().putEntry(entry);
  } catch {
    redirect(
      drillsPath(kbId, `?error=${encodeURIComponent("The library isn't provisioned on this backend yet (migration 0015_library.sql).")}`),
    );
  }
  await audit(context, "profile.create", "kb_library", entry.entryId, { kbId, drill: true });
  revalidatePath(drillsPath(kbId));
  redirect(drillsPath(kbId, "?saved=1"));
}

/** Delete a drill from the runner page. */
export async function deleteDrillAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const kbId = String(formData.get("kbId"));
  const entryId = String(formData.get("entryId"));
  await libraryStore().deleteEntry(entryId);
  await audit(context, "profile.update", "kb_library", entryId, { kbId, drillDeleted: true });
  revalidatePath(drillsPath(kbId));
  redirect(drillsPath(kbId, "?deleted=1"));
}

// ---------------------------------------------------------------------------
// Expert seed drills (Nitin's named cases). Each drill's EXPECTED call is the
// bridge-correct TARGET — today's knowledge may well produce a different call,
// and that is intentional: the drill documents the goal until the content is
// rebuilt (its note says so). Auctions/hands parse through the same bench
// parsers, so they are guaranteed well-formed.
// ---------------------------------------------------------------------------



/** Idempotently seed the expert drills for this KB (skip ones already present). */
export async function seedExpertDrillsAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  await ensureSeeds();
  const kbId = String(formData.get("kbId"));

  const lib = libraryStore();
  let existing: LibraryEntry[] = [];
  try {
    existing = (await lib.listEntries("drill")).filter((e) => e.kbId === kbId);
  } catch {
    redirect(
      drillsPath(kbId, `?error=${encodeURIComponent("The library isn't provisioned on this backend yet (migration 0015_library.sql).")}`),
    );
  }
  const have = new Set(existing.map((e) => e.name));

  let seeded = 0;
  for (const spec of EXPERT_SEEDS) {
    if (have.has(spec.name)) continue;
    const entry = buildDrill({
      kbId,
      name: spec.name,
      handText: spec.hand,
      auctionText: spec.auction,
      dealer: spec.dealer,
      vul: "none",
      expectedText: spec.expected,
      note: spec.note,
      createdBy: context.nexusUserId,
      programOrganizationId: orgScopeOf(context),
      nexusProgramId: (await nexusProgramIdOf()) ?? undefined,
    });
    await lib.putEntry(entry);
    seeded++;
  }

  await audit(context, "profile.create", "kb_library", `seed:${kbId}`, { kbId, seededDrills: seeded });
  revalidatePath(drillsPath(kbId));
  redirect(drillsPath(kbId, `?seeded=${seeded}`));
}
