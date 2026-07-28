"use server";

// Players area actions (2026-07-16 fellows UI rework). Creation is
// prototype-simple: pick a knowledge set, get a named, validated player owned
// by you — refine it afterwards on the player page. "Try" seats you South
// against three copies so a fellow can check behavior in one click.

import type { Seat } from "@bridge/events";
import { playerIsValid, validatePlayerStatic, newId } from "@bridge/kb";
import { SessionService, type SeatConfig } from "@bridge/sessions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";
import { assertAiAllowed, assertKbAllowed } from "@/lib/org";
import { sessionService } from "@/lib/sessions";

import { stubDisplayName } from "@bridge/nexus-client";

export async function createRungPlayerAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  await ensureSeeds();
  const kbId = String(formData.get("kbId"));
  const packId = String(formData.get("packId"));
  await assertKbAllowed(context, kbId);

  const compiled = await kbService().liveCompile(kbId);
  if (!compiled) throw new Error("This knowledge base has no live compile yet");
  const pack = compiled.packs.find((p) => p.packId === packId);
  if (!pack) throw new Error("Pick a knowledge set");

  const store = kbStore();
  const firstName = (stubDisplayName(context.nexusUserId) ?? context.nexusUserId).split(" ")[0];
  const base = `${pack.name} — ${firstName}`;
  const existing = await store.listPlayersForKb(kbId);
  let name = base;
  for (let n = 2; existing.some((p) => p.name === name); n++) name = `${base} (${n})`;

  const now = new Date().toISOString();
  const player = {
    playerId: newId("pl"),
    kbId,
    name,
    description: `Created from the “${pack.name}” rung.`,
    levelId: pack.levelId,
    enabledPackIds: [pack.packId],
    settingOverrides: {},
    decisionPolicyId: "first_match" as const,
    fallbackPolicyId: "standard" as const,
    validationStatus: "draft" as const,
    ownerType: "coach" as const,
    ownerId: context.nexusUserId,
    programOrganizationId: context.programOrganizationId,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  const report = validatePlayerStatic(compiled, player);
  await store.putPlayer({
    ...player,
    validationStatus: playerIsValid(report) ? "valid" : "invalid",
    validationReport: report,
  });
  await audit(context, "profile.create", "kb_player", player.playerId, { kbId, rung: packId });
  revalidatePath("/bridge/players");
  redirect(`/bridge/kb/${kbId}/players/${player.playerId}?saved=1`);
}

/**
 * Delete a player. Safe by construction: sessions SNAPSHOT the player into
 * their seats at creation, so boards already dealt keep playing; the arena
 * re-provisions house players on demand. Admin-gated like all player edits.
 */
export async function deletePlayerAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const { requireAdminContext } = await import("@/lib/api");
  await requireAdminContext("bridge.knowledge.edit");
  const playerId = String(formData.get("playerId"));
  const store = kbStore();
  const player = await store.getPlayer(playerId);
  if (!player) redirect("/bridge/players?deleted=1");
  await store.deletePlayer(playerId);
  await audit(context, "profile.delete", "kb_player", playerId, {
    kbId: player!.kbId,
    name: player!.name,
  });
  revalidatePath("/bridge/players");
  revalidatePath(`/bridge/kb/${player!.kbId}`, "layout");
  const returnTo = String(formData.get("returnTo") ?? "");
  redirect(
    returnTo.startsWith("/bridge/")
      ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}deleted=1`
      : "/bridge/players?deleted=1",
  );
}

/**
 * One-click BEN table: you sit South against three BENs — or watch four play
 * each other with watch=1. A session still lives inside a knowledge base (the
 * trace vocabulary and BEN's degrade fallback come from it), so this uses the
 * posted kbId or falls back to the first live KB.
 */
export async function tryBenAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  await ensureSeeds();
  const watch = formData.get("watch") === "1";
  const tableBase = formData.get("mobile") === "1" ? "/m/table/" : "/bridge/table/";
  await assertAiAllowed(context);
  const { benAvailable, BEN_SEAT_LABEL } = await import("@/lib/benSeat");
  if (!benAvailable()) throw new Error("BEN isn't configured on this server (BEN_ENDPOINT)");

  const store = kbStore();
  const kbParam = String(formData.get("kbId") ?? "");
  const kbs = (await store.listKbs()).filter((k) => !k.archived);
  const kb = kbs.find((k) => k.kbId === kbParam) ?? kbs[0];
  if (!kb) throw new Error("Create a knowledge base first — boards are dealt inside one");
  const compiled = await kbService().liveCompile(kb.kbId);
  if (!compiled) throw new Error("This knowledge base has no live compile yet");

  const ben: SeatConfig = { kind: "ben", label: BEN_SEAT_LABEL };
  const seats = { N: ben, E: ben, S: ben, W: ben } as Record<Seat, SeatConfig>;
  if (!watch) seats.S = { kind: "human", nexusUserId: context.nexusUserId };

  const record = await sessionService().createSession({
    kbId: kb.kbId,
    compiled,
    seats,
    seed: (Date.now() % 100_000) + 1,
    createdBy: context.nexusUserId,
  });
  await audit(context, "profile.update", "kb_session", record.sessionId, {
    kbId: kb.kbId,
    tryPlayer: "ben",
  });
  redirect(`${tableBase}${record.sessionId}`);
}

/** One-click check: you sit South, three copies of the player fill the rest. */
export async function tryPlayerAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  await ensureSeeds();
  const playerId = String(formData.get("playerId"));
  const watch = formData.get("watch") === "1";
  // Additive, inert by default: the mobile UI posts mobile=1 to open the
  // resulting board in the /m/table chrome.
  const tableBase = formData.get("mobile") === "1" ? "/m/table/" : "/bridge/table/";
  await assertAiAllowed(context);

  const store = kbStore();
  const player = await store.getPlayer(playerId);
  if (!player) throw new Error("No such player");
  await assertKbAllowed(context, player.kbId);
  const compiled = await kbService().liveCompile(player.kbId);
  if (!compiled) throw new Error("This knowledge base has no live compile yet");

  const ai = SessionService.seatFromPlayer(player, compiled);
  const seats = { N: ai, E: ai, S: ai, W: ai } as Record<Seat, SeatConfig>;
  if (!watch) seats.S = { kind: "human", nexusUserId: context.nexusUserId };

  const record = await sessionService().createSession({
    kbId: player.kbId,
    compiled,
    seats,
    seed: (Date.now() % 100_000) + 1,
    createdBy: context.nexusUserId,
  });
  await audit(context, "profile.update", "kb_session", record.sessionId, {
    kbId: player.kbId,
    tryPlayer: playerId,
  });
  redirect(`${tableBase}${record.sessionId}`);
}
