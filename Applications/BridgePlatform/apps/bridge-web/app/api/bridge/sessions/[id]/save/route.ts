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
import type { CuratedAt } from "@/lib/curated";
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
      /** REVISE IN PLACE (curated v2, owner design 2026-08-18): land this
       *  publish on an existing entry — same entryId, new line and words —
       *  so future assignments get the revision. Owner-gated below. */
      updateEntryId?: string;
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

    // REVISE IN PLACE (curated v2): a curated publish may land on the entry
    // it revises — same entryId and shelf identity, new line and words. Only
    // that entry's own coach (or an admin) holds the pen, only a curated
    // "play" target qualifies, and a refused target publishes NOTHING rather
    // than quietly shelving a duplicate the coach didn't ask for.
    const revising =
      kind === "play" && typeof body.updateEntryId === "string" && body.updateEntryId
        ? await libraryStore().getEntry(body.updateEntryId)
        : null;
    if (body.updateEntryId) {
      const { canAccessAdminArea } = await import("@bridge/nexus-client");
      if (
        !revising?.curatedJson ||
        (revising.createdBy !== context.nexusUserId && !canAccessAdminArea(context))
      ) {
        return NextResponse.json(
          { error: "That curated deal can't be revised from here." },
          { status: 409, headers: CORS },
        );
      }
    }

    const base = {
      entryId: revising ? revising.entryId : newId("le"),
      name,
      ...(notes && { notes }),
      tags: revising ? revising.tags : ([] as string[]),
      origin: "recorded" as const,
      sourceSessionId: id,
      // A revision keeps the entry's identity — its coach, its shelf, its
      // birthday — and only the recording changes hands.
      createdBy: revising ? revising.createdBy : context.nexusUserId,
      programOrganizationId: revising
        ? revising.programOrganizationId
        : orgScopeOf(context),
      nexusProgramId: revising
        ? revising.nexusProgramId
        : ((await nexusProgramIdOf()) ?? undefined),
      scopeLevel: revising ? revising.scopeLevel : authoredScope(context),
      createdAt: revising ? revising.createdAt : now,
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
                  : // BEN and the solver are engines, not roster entries — they
                    // have a label and nothing to point a playerId at.
                    c.kind === "ben" || c.kind === "dd"
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
                    const parsed = parseCurated(body.curatedJson);
                    /**
                     * ONLY POSITIONS THE LINE ACTUALLY VISITS survive.
                     *
                     * The guard exists because authoring is undoable: undo an
                     * action and any annotation written at it is orphaned, and
                     * publishing must not ship a ghost that no learner can
                     * ever reach.
                     *
                     * It used to also require the annotation to sit at the
                     * author's (later the learner's) OWN decision. That was
                     * too narrow — the line records what the other three seats
                     * did too, and a partner's 2NT or an opponent's overcall
                     * is teaching material the coach should be able to speak
                     * to (owner, 2026-08-18). Those are shown to the learner
                     * when the board comes back to them; see actionsSince.
                     */
                    const flatPlays = state.tricks.flatMap((t) => t.plays);
                    const onTheLine = (a: { at: CuratedAt }) =>
                      a.at.kind === "call"
                        ? !!state.auction[a.at.auctionIndex]
                        : !!flatPlays[a.at.trickIndex * 4 + a.at.playIndex];
                    const kept = parsed.annotations.filter(onTheLine);
                    // A v2 payload ships even with zero surviving annotations
                    // — the constraint, intro/debrief and pin are the coach's
                    // voice too, and the curated stamp keys on this field.
                    return kept.length || parsed.v === 2
                      ? { curatedJson: serializeCurated({ ...parsed, annotations: kept }) }
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
