"use server";

// Players area actions (2026-07-16 fellows UI rework). Creation is
// prototype-simple: pick a ladder rung, get a named, validated player owned
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
  if (!pack) throw new Error("Pick a ladder rung");

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

/** One-click check: you sit South, three copies of the player fill the rest. */
export async function tryPlayerAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  await ensureSeeds();
  const playerId = String(formData.get("playerId"));
  const watch = formData.get("watch") === "1";
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
  redirect(`/bridge/table/${record.sessionId}`);
}
