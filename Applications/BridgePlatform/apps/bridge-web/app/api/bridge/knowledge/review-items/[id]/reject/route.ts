import { NextResponse } from "next/server";

/** 410: removed by deviation 6 — provenance over approval. Items are usable
 *  the moment they exist; edit or deprecate via PATCH readable-items/:id. */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Gone: the approval workflow was removed (deviation 6 — provenance over approval). Use PATCH /api/bridge/knowledge/readable-items/:id to edit or set status.",
    },
    { status: 410 },
  );
}
