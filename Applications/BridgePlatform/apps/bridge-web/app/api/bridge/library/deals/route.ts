// POST /api/bridge/library/deals — the deal editor's save, as JSON: four
// hand-authored hands → one deal/board entry, returning { entryId }. The lift
// of createDealAction minus the redirects; validation failures come back as
// 400 { error } with the action's exact copy.
//
// Body: { kind: "board"|"deal", name?, dealer?, vul?, notes?,
//         hands: { N, E, S, W } }  — hands in the editor's serialized form
// (lib/dealText), same as the form fields the action read.

import type { Card, Seat, Vul } from "@bridge/events";
import { validateDeal } from "@bridge/formats";
import { newId } from "@bridge/kb";
import type { LibraryEntry } from "@bridge/sessions";
import { NextResponse, type NextRequest } from "next/server";

import { requireFeature } from "@/lib/access";
import { apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { handFromSerialized } from "@/lib/dealText";
import { authoredScope, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { libraryStore } from "@/lib/sessions";

const CORS = corsHeaders("POST");

export const OPTIONS = corsOptions("POST");

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400, headers: CORS });
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireContext();
    await requireFeature(context, "library.create");

    const body = (await request.json().catch(() => ({}))) as {
      kind?: string;
      name?: string;
      dealer?: string;
      vul?: string;
      notes?: string;
      hands?: Partial<Record<Seat, string>>;
    };
    const kind = body.kind === "deal" ? "deal" : "board";

    const hands = {} as Record<Seat, Card[]>;
    for (const seat of ["N", "E", "S", "W"] as Seat[]) {
      const parsed = handFromSerialized(String(body.hands?.[seat] ?? ""));
      if ("error" in parsed) return bad(`${seat}: ${parsed.error}`);
      if (parsed.length !== 13)
        return bad(`${seat} has ${parsed.length} cards — every hand needs 13.`);
      hands[seat] = parsed;
    }
    const invalid = validateDeal(hands);
    if (invalid) return bad(invalid);

    const dealer = (String(body.dealer ?? "N") || "N") as Seat;
    const vul = (String(body.vul ?? "none") || "none") as Vul;
    const notes = String(body.notes ?? "").trim();
    const entry: LibraryEntry = {
      entryId: newId("le"),
      kind,
      name:
        String(body.name ?? "").trim() ||
        (kind === "deal" ? "Authored pack" : "Authored board"),
      tags: [],
      hands,
      // A bare deal is just the card distribution — board facts stay off it.
      ...(kind === "board" ? { dealer, vul } : {}),
      ...(notes ? { notes } : {}),
      auction: [],
      play: [],
      origin: "authored",
      createdBy: context.nexusUserId,
      programOrganizationId: orgScopeOf(context),
      nexusProgramId: (await nexusProgramIdOf()) ?? undefined,
      // Staff author into the program instance; everyone else into their own.
      scopeLevel: authoredScope(context),
      createdAt: new Date().toISOString(),
    };
    try {
      await libraryStore().putEntry(entry);
    } catch {
      return bad(
        "Couldn't save — the library isn't provisioned on this backend yet (migration 0015_library.sql).",
      );
    }
    await audit(context, "profile.create", "kb_library", entry.entryId, { authored: true });
    return NextResponse.json({ entryId: entry.entryId }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}
