// POST /api/bridge/sessions/:id/save — record the board into the library.
// The lift of saveToLibraryAction: same kinds, same name handling (peel the
// auto-appended kind suffixes before adding a fresh one), same scoping.
// Body: { kind: "deal"|"board"|"play"|"table", name?, notes? } → { entryId }.

import type { Card, Seat } from "@bridge/events";
import type { SeatConfig } from "@bridge/sessions";
import { NextResponse, type NextRequest } from "next/server";

import { canUse } from "@/lib/access";
import { AccessError, apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import * as curatedLib from "@/lib/curated";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { libraryKindLabel } from "@/lib/libraryLabels";
import { authoredScope, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { libraryStore, sessionService } from "@/lib/sessions";

const CORS = corsHeaders("POST");

export const OPTIONS = corsOptions("POST");

/** Peel stacked " · pack"/" · board"/… tails before appending a fresh one —
 *  save→resume→save cycles otherwise grow "Board 1 · deal · deal · pack". */
function stripKindSuffixes(name: string): string {
  let out = name.trim();
  for (;;) {
    const stripped = out.replace(/\s*·\s*(pack|deal|board|play|table)$/, "").trimEnd();
    if (stripped === out) return out;
    out = stripped;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    // Saving needs table.save_library — EXCEPT a curated publish (owner
    // design 2026-08-15), where being a coach IS the permission: curating is
    // a coaching act, and the roster check is the same gate the assignment
    // flow trusts. Checked lazily so an ordinary save costs no Nexus call.
    if (!(await canUse(context, "table.save_library"))) {
      const wantsCurated =
        typeof (await request.clone().json().catch(() => ({}) as { curatedJson?: unknown }))
          .curatedJson === "string";
      const coaches = wantsCurated
        ? await (async () => {
            try {
              const { getMyLearners } = await import("@/lib/nexus");
              return (await getMyLearners()).length > 0;
            } catch {
              return false;
            }
          })()
        : false;
      if (!coaches) throw new AccessError("No saving");
    }
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      kind?: string;
      name?: string;
      notes?: string;
      /** A curated deal's coaching overlay (owner design 2026-08-15) — only
       *  meaningful with kind "play", whose auction/play layers ARE the
       *  coach's recorded line the annotations anchor to. */
      curatedJson?: string;
    };
    const kind = body.kind as "deal" | "board" | "play" | "table";
    if (!["deal", "board", "play", "table"].includes(kind)) {
      return NextResponse.json(
        { error: "Pick what to save." },
        { status: 400, headers: CORS },
      );
    }

    const { record, state } = await sessionService().view(id);
    const { seededDeal, resultLabel, scoreBoard } = await import("@bridge/engine");
    const { newId } = await import("@bridge/kb");
    const { callLabel } = await import("@bridge/events");

    const originalHands = record.board.hands ?? seededDeal(record.board.seed);
    const name =
      String(body.name ?? "").trim() ||
      `${stripKindSuffixes(record.board.name)} · ${libraryKindLabel(kind)}`;
    const notes = String(body.notes ?? "").trim();
    const now = new Date().toISOString();

    const base = {
      entryId: newId("le"),
      name,
      ...(notes && { notes }),
      tags: [] as string[],
      origin: "recorded" as const,
      sourceSessionId: id,
      createdBy: context.nexusUserId,
      programOrganizationId: orgScopeOf(context),
      nexusProgramId: (await nexusProgramIdOf()) ?? undefined,
      // Recordings land in the recorder's ONE library: admins curate the
      // program instance, everyone else records into their own.
      scopeLevel: authoredScope(context),
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
                  : c.kind === "ben"
                    ? { label: c.label }
                    : { label: c.label, playerId: c.playerId },
              ]),
            ) as Record<Seat, { label: string; playerId?: string; human?: boolean }>,
          }
        : {
            ...base,
            kind,
            hands: originalHands as Record<Seat, Card[]>,
            ...(kind !== "deal" && { dealer: record.board.dealer, vul: record.board.vul }),
            ...(kind === "play" && {
              auction: state.auction.map((a) => ({ seat: a.seat, call: a.call })),
              play: state.tricks.flatMap((t) =>
                t.plays.map((p) => ({ seat: p.seat, card: p.card })),
              ),
              contractLabel: state.contract
                ? `${callLabel(`${state.contract.level}${state.contract.strain}`)} by ${state.contract.declarer}`
                : undefined,
              resultLabel: score ? resultLabel(score) : undefined,
              // The coaching overlay, re-validated against THIS session's
              // line: annotations at positions that don't exist on the line,
              // or at decisions that weren't the author's own, are dropped
              // alone (an undo during authoring orphans positions — publish
              // must not carry ghosts). Assignment is the coach gate; a
              // non-coach publishing to their own shelf harms nobody.
              ...(body.curatedJson
                ? (() => {
                    const { parseCurated, serializeCurated } = curatedLib;
                    const humanSeat = (
                      Object.entries(record.seats) as [
                        Seat,
                        (typeof record.seats)["N"],
                      ][]
                    ).find(
                      (e) => e[1].kind === "human" && e[1].nexusUserId === context.nexusUserId,
                    )?.[0];
                    const dummySeat = state.contract
                      ? (({ N: "S", S: "N", E: "W", W: "E" }) as const)[state.contract.declarer]
                      : null;
                    const flatPlays = state.tricks.flatMap((t) => t.plays);
                    const ownDecision = (a: { at: import("@/lib/curated").CuratedAt }) => {
                      if (!humanSeat) return false;
                      if (a.at.kind === "call") {
                        const call = state.auction[a.at.auctionIndex];
                        return !!call && call.seat === humanSeat;
                      }
                      const p = flatPlays[a.at.trickIndex * 4 + a.at.playIndex];
                      if (!p) return false;
                      return (
                        (p.seat === humanSeat && humanSeat !== dummySeat) ||
                        (state.contract?.declarer === humanSeat && p.seat === dummySeat)
                      );
                    };
                    const parsed = parseCurated(body.curatedJson);
                    const kept = parsed.annotations.filter(ownDecision);
                    return kept.length
                      ? { curatedJson: serializeCurated({ annotations: kept }) }
                      : {};
                  })()
                : {}),
            }),
          };

    try {
      await libraryStore().putEntry(entry);
    } catch {
      return NextResponse.json(
        {
          error:
            "Couldn't save — the library isn't provisioned on this backend yet (migration 0015_library.sql).",
        },
        { status: 400, headers: CORS },
      );
    }
    await audit(context, "profile.create", "kb_library", entry.entryId, {
      sessionId: id,
      kind,
    });
    return NextResponse.json({ entryId: entry.entryId, kind }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}
