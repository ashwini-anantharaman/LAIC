"use server";

// Table v2 server actions (Knowledge Rework §7). Humans act through the same
// single-writer controller as the AI; legality is enforced in the session
// service. Flagging a decision creates a suggestion in the KB's queue.

import type { Card, Seat, Suit, Vul } from "@bridge/events";
import { AwaitingHumanError, SessionService, type SeatConfig } from "@bridge/sessions";
import { handFromSerialized } from "@/lib/dealText";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";
import { assertAiAllowed, assertKbAllowed } from "@/lib/org";
import { libraryStore, sessionService } from "@/lib/sessions";

const SEATS: Seat[] = ["N", "E", "S", "W"];

/**
 * Play Arena (2026-07-16 rework): one click on a ladder rung seats you South
 * against three auto-provisioned house players of that strength. Fellows
 * edit the house players afterwards instead of assembling one up front.
 */
export async function arenaPlayAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  await ensureSeeds();
  const kbId = String(formData.get("kbId"));
  const packId = String(formData.get("packId"));
  const watch = formData.get("watch") === "1";
  await assertAiAllowed(context);
  await assertKbAllowed(context, kbId);
  const compiled = await kbService().liveCompile(kbId);
  if (!compiled) throw new Error("That knowledge base has no live compile yet");
  const pack = compiled.packs.find((p) => p.packId === packId);
  if (!pack) throw new Error("Pick a knowledge set");

  const { ensureHousePlayer } = await import("@/lib/arena");
  const house = await ensureHousePlayer(kbStore(), compiled, pack, context.nexusUserId);
  const ai = SessionService.seatFromPlayer(house, compiled);
  const seats = { N: ai, E: ai, S: ai, W: ai } as Record<Seat, SeatConfig>;
  if (!watch) seats.S = { kind: "human", nexusUserId: context.nexusUserId };

  const record = await sessionService().createSession({
    kbId,
    compiled,
    seats,
    seed: (Date.now() % 100_000) + 1,
    createdBy: context.nexusUserId,
  });
  await audit(context, "profile.update", "kb_session", record.sessionId, {
    kbId,
    arena: pack.packId,
  });
  redirect(`/bridge/table/${record.sessionId}`);
}

/**
 * "New board" (2026-07-17): deal a fresh default board on demand — the
 * strongest set of the given KB (or the first that compiles), you South
 * against house players. Always creates a new session, unlike the Play
 * entry which resumes an unfinished board.
 */
export async function quickPlayAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  await ensureSeeds();
  await assertAiAllowed(context);

  const { pickDefaultSet, ensureHousePlayer } = await import("@/lib/arena");
  const store = kbStore();
  const preferredKbId = String(formData.get("kbId") ?? "").trim();
  const kbs = await store.listKbs();
  const ordered = preferredKbId
    ? [...kbs].sort((a) => (a.kbId === preferredKbId ? -1 : 0))
    : kbs;

  for (const kb of ordered) {
    const compiled = await kbService().liveCompile(kb.kbId);
    if (!compiled) continue;
    const pack = pickDefaultSet(compiled);
    if (!pack) continue;
    await assertKbAllowed(context, kb.kbId);
    const house = await ensureHousePlayer(store, compiled, pack, context.nexusUserId);
    const ai = SessionService.seatFromPlayer(house, compiled);
    const seats = { N: ai, E: ai, S: ai, W: ai } as Record<Seat, SeatConfig>;
    seats.S = { kind: "human", nexusUserId: context.nexusUserId };
    const record = await sessionService().createSession({
      kbId: kb.kbId,
      compiled,
      seats,
      seed: (Date.now() % 100_000) + 1,
      createdBy: context.nexusUserId,
    });
    redirect(`/bridge/table/${record.sessionId}`);
  }
  redirect("/bridge/table");
}

/**
 * The mid-play deal editor's save: fork the session onto the edited deal
 * with the SAME seats and the SAME event prefix — the game continues right
 * where it was, on the new cards. Played cards must stay at the seat that
 * played them (the editor locks them; re-checked here). The `restart`
 * checkbox drops the prefix instead (fresh auction on the edited deal),
 * which is also forced when the board is already complete.
 */
export async function redealEditedAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const sessionId = String(formData.get("sessionId"));
  const failBack: (message: string) => never = (message) =>
    redirect(`/bridge/table/${sessionId}/edit?error=${encodeURIComponent(message)}`);

  const service = sessionService();
  const record = await service.requireSession(sessionId);
  const { validateDeal } = await import("@bridge/formats");
  const hands = {} as Record<Seat, Card[]>;
  for (const seat of SEATS) {
    const parsed = handFromSerialized(String(formData.get(`hand:${seat}`) ?? ""));
    if ("error" in parsed) failBack(`${seat}: ${parsed.error}`);
    if (parsed.length !== 13) failBack(`${seat} has ${parsed.length} cards — every hand needs 13.`);
    hands[seat] = parsed;
  }
  const invalid = validateDeal(hands);
  if (invalid) failBack(invalid);

  const fresh =
    formData.get("restart") === "on" || record.status === "completed";
  if (!fresh) {
    // Continuing replays the recorded plays onto the edited deal — every
    // played card must still sit where it was played, or the fold corrupts.
    for (const event of record.events) {
      if (event.category !== "play-event") continue;
      const { seat, card } = event as { seat: Seat; card: Card };
      if (!hands[seat].some((c) => c.suit === card.suit && c.rank === card.rank))
        failBack(
          `${seat} already played a card that moved seats — played cards are locked while continuing.`,
        );
    }
  }

  const dealer = (String(formData.get("dealer") ?? "N") || "N") as Seat;
  const vul = (String(formData.get("vul") ?? "none") || "none") as Vul;
  const boardName =
    String(formData.get("name") ?? "").trim() || `${record.board.name} (edited)`;

  const next = await service.fork(sessionId, record.seats, context.nexusUserId, {
    fresh,
    hands,
    boardName,
    // Dealer/vul only change on a restart — the kept auction depends on them.
    ...(fresh ? { dealer, vul } : {}),
  });

  if (formData.get("saveToLibrary") === "on") {
    const { newId } = await import("@bridge/kb");
    try {
      await libraryStore().putEntry({
        entryId: newId("le"),
        kind: "board",
        name: boardName,
        tags: [],
        hands,
        dealer,
        vul,
        auction: [],
        play: [],
        origin: "authored",
        sourceSessionId: sessionId,
        createdBy: context.nexusUserId,
        createdAt: new Date().toISOString(),
      });
    } catch {
      // Library backend not provisioned — the redeal itself still proceeds.
    }
  }

  await audit(context, "session.fork", "kb_session", next.sessionId, {
    kbId: record.kbId,
    editedFrom: sessionId,
  });
  redirect(`/bridge/table/${next.sessionId}`);
}

export async function createSessionAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  await ensureSeeds();
  const kbId = String(formData.get("kbId"));
  await assertAiAllowed(context);
  await assertKbAllowed(context, kbId);
  const compiled = await kbService().liveCompile(kbId);
  if (!compiled) throw new Error("That knowledge base has no live compile yet");

  const store = kbStore();
  const humanSeat = String(formData.get("humanSeat") ?? "") as Seat | "";
  const seats = {} as Record<Seat, SeatConfig>;
  for (const seat of SEATS) {
    if (seat === humanSeat) {
      seats[seat] = { kind: "human", nexusUserId: context.nexusUserId };
      continue;
    }
    const playerId = String(formData.get(`player:${seat}`) ?? "");
    const player = playerId ? await store.getPlayer(playerId) : null;
    if (!player) throw new Error(`Pick a player for seat ${seat}`);
    seats[seat] = SessionService.seatFromPlayer(player, compiled);
  }

  const record = await sessionService().createSession({
    kbId,
    compiled,
    seats,
    seed: Number(formData.get("seed") ?? 1) || 1,
    createdBy: context.nexusUserId,
  });
  await audit(context, "profile.update", "kb_session", record.sessionId, {
    kbId,
    created: true,
  });
  redirect(`/bridge/table/${record.sessionId}`);
}

export async function stepAction(formData: FormData): Promise<void> {
  await requireContext();
  const sessionId = String(formData.get("sessionId"));
  try {
    await sessionService().step(sessionId);
  } catch (e) {
    // A stale double-click on a human turn is not an error page.
    if (!(e instanceof AwaitingHumanError)) throw e;
  }
  revalidatePath(`/bridge/table/${sessionId}`);
}

export async function playToEndAction(formData: FormData): Promise<void> {
  await requireContext();
  const sessionId = String(formData.get("sessionId"));
  const service = sessionService();
  let guard = 0;
  // Runs until complete or a human seat takes over.
  for (;;) {
    const view = await service.view(sessionId);
    if (view.state.phase === "complete" || view.actingIsHuman || guard++ > 400) break;
    await service.step(sessionId);
  }
  revalidatePath(`/bridge/table/${sessionId}`);
}

export async function bidAction(formData: FormData): Promise<void> {
  await requireContext();
  const sessionId = String(formData.get("sessionId"));
  await sessionService().act(sessionId, { call: String(formData.get("call")) });
  revalidatePath(`/bridge/table/${sessionId}`);
}

export async function playCardAction(formData: FormData): Promise<void> {
  await requireContext();
  const sessionId = String(formData.get("sessionId"));
  const card: Card = {
    suit: String(formData.get("suit")) as Suit,
    rank: Number(formData.get("rank")) as Card["rank"],
  };
  await sessionService().act(sessionId, { card });
  revalidatePath(`/bridge/table/${sessionId}`);
}

export async function undoAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const sessionId = String(formData.get("sessionId"));
  await sessionService().undo(sessionId);
  await audit(context, "session.undo", "kb_session", sessionId);
  revalidatePath(`/bridge/table/${sessionId}`);
}

/**
 * Swap who sits in a seat (2026-07-16). Sessions snapshot their seats, so a
 * swap is a FORK: same board, same pinned compile, new lineup. Mid-board the
 * fork adopts the played prefix (the trace keeps attributing past decisions
 * to whoever made them); a completed board replays fresh from the deal.
 */
export async function swapSeatAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const sessionId = String(formData.get("sessionId"));
  const seat = String(formData.get("seat")) as Seat;
  const playerId = String(formData.get("playerId"));
  if (!SEATS.includes(seat)) throw new Error("Pick a seat");

  const service = sessionService();
  const record = await service.requireSession(sessionId);
  await assertKbAllowed(context, record.kbId);

  let config: SeatConfig;
  if (playerId === "me") {
    config = { kind: "human", nexusUserId: context.nexusUserId };
  } else {
    await assertAiAllowed(context);
    const player = await kbStore().getPlayer(playerId);
    if (!player || player.kbId !== record.kbId)
      throw new Error("That player doesn't belong to this knowledge base");
    const compiled = await service.compiledFor(record);
    config = SessionService.seatFromPlayer(player, compiled);
  }

  const forked = await service.fork(
    sessionId,
    { ...record.seats, [seat]: config },
    context.nexusUserId,
    { fresh: record.status === "completed" },
  );
  await audit(context, "profile.update", "kb_session", forked.sessionId, {
    kbId: record.kbId,
    swappedSeat: seat,
    playerId,
    forkedFrom: sessionId,
  });
  redirect(`/bridge/table/${forked.sessionId}`);
}

/**
 * Record the current board into the library (2026-07-16 rework). The DEAL
 * layer is always the original distribution (never the mid-play remainder);
 * `play` captures the calls and cards as they stand right now.
 */
export async function saveToLibraryAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const sessionId = String(formData.get("sessionId"));
  const kind = String(formData.get("kind")) as "deal" | "board" | "play" | "table";
  if (!["deal", "board", "play", "table"].includes(kind)) throw new Error("Pick what to save");

  const { record, state } = await sessionService().view(sessionId);
  const { seededDeal, resultLabel, scoreBoard } = await import("@bridge/engine");
  const { newId } = await import("@bridge/kb");
  const { callLabel } = await import("@bridge/events");

  const originalHands = record.board.hands ?? seededDeal(record.board.seed);
  const name =
    String(formData.get("name") ?? "").trim() ||
    `${record.board.name} · ${kind}`;
  const now = new Date().toISOString();

  const base = {
    entryId: newId("le"),
    name,
    tags: [] as string[],
    origin: "recorded" as const,
    sourceSessionId: sessionId,
    createdBy: context.nexusUserId,
    createdAt: now,
  };

  const score = scoreBoard(state);
  const entry =
    kind === "table"
      ? {
          ...base,
          kind,
          kbId: record.kbId,
          seats: Object.fromEntries(
            (Object.entries(record.seats) as [Seat, SeatConfig][]).map(([seat, c]) => [
              seat,
              c.kind === "human"
                ? { label: "you", human: true }
                : { label: c.label, playerId: c.playerId },
            ]),
          ) as Record<Seat, { label: string; playerId?: string; human?: boolean }>,
        }
      : {
          ...base,
          kind,
          hands: originalHands,
          ...(kind !== "deal" && { dealer: record.board.dealer, vul: record.board.vul }),
          ...(kind === "play" && {
            auction: state.auction.map((a) => ({ seat: a.seat, call: a.call })),
            play: state.tricks.flatMap((t) => t.plays.map((p) => ({ seat: p.seat, card: p.card }))),
            contractLabel: state.contract
              ? `${callLabel(`${state.contract.level}${state.contract.strain}`)} by ${state.contract.declarer}`
              : undefined,
            resultLabel: score ? resultLabel(score) : undefined,
          }),
        };

  try {
    await libraryStore().putEntry(entry);
  } catch {
    // Most likely: bridge_kb_library missing (migration 0015 not applied).
    redirect(
      `/bridge/table/${sessionId}?error=${encodeURIComponent(
        "Couldn't save — the library isn't provisioned on this backend yet (migration 0015_library.sql).",
      )}`,
    );
  }
  await audit(context, "profile.create", "kb_library", entry.entryId, {
    sessionId,
    kind,
  });
  redirect(`/bridge/table/${sessionId}?saved=${kind}`);
}

/** Flag a decision → a suggestion in the KB's queue (spec §7). */
export async function flagDecisionAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const sessionId = String(formData.get("sessionId"));
  const record = await sessionService().requireSession(sessionId);
  const seq = Number(formData.get("seq"));
  const itemId = String(formData.get("itemId") ?? "").trim() || undefined;
  const text = String(formData.get("text") ?? "").trim() || "Flagged from the table.";
  const suggestion = await kbService().createSuggestion({
    kbId: record.kbId,
    itemId,
    sessionId,
    decisionSeq: seq,
    text,
    createdBy: context.nexusUserId,
  });
  await audit(context, "kb.suggestion.change", "kb_suggestion", suggestion.suggestionId, {
    kbId: record.kbId,
    fromTable: true,
  });
  revalidatePath(`/bridge/table/${sessionId}`);
}

/**
 * Constrained drill (spec §5): an INCOMPLETE player may only play deals the
 * closed loop accepts — full simulation with the actual seat configs must
 * finish with zero engine-floor events. The player is never forced outside
 * its knowledge.
 */
export async function createDrillAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  await ensureSeeds();
  const kbId = String(formData.get("kbId"));
  await assertAiAllowed(context);
  await assertKbAllowed(context, kbId);
  const compiled = await kbService().liveCompile(kbId);
  if (!compiled) throw new Error("That knowledge base has no live compile yet");

  const store = kbStore();
  const playerId = String(formData.get("playerId"));
  const player = await store.getPlayer(playerId);
  if (!player) throw new Error("Pick a drill player");

  const seat = SessionService.seatFromPlayer(player, compiled);
  const humanSeat = String(formData.get("humanSeat") ?? "") as Seat | "";
  const seats = { N: seat, E: seat, S: seat, W: seat } as Record<Seat, SeatConfig>;
  if (humanSeat) seats[humanSeat] = { kind: "human", nexusUserId: context.nexusUserId };

  const { findSafeSeed } = await import("@bridge/sessions");
  const startSeed = Number(formData.get("seed") ?? 1) || 1;
  const seed = await findSafeSeed({ compiled, seats, startSeed, maxAttempts: 80 });
  if (seed === null)
    throw new Error(
      "No safe deal found in 80 attempts — this player's knowledge may be too narrow for open dealing",
    );

  const record = await sessionService().createSession({
    kbId,
    compiled,
    seats,
    seed,
    createdBy: context.nexusUserId,
  });
  await audit(context, "profile.update", "kb_session", record.sessionId, {
    kbId,
    drill: true,
    playerId,
    safeSeed: seed,
  });
  redirect(`/bridge/table/${record.sessionId}`);
}
