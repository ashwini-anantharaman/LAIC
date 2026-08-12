// GET /api/bridge/library/entries/[entryId] — one library entry in the
// component's generic item envelope, policy-checked through the caller's
// principal (never store-direct: what you can't see reads as 404).
// The native assign screen and board previews read this.

import { NextResponse } from "next/server";

import { AccessError, apiError, requireContext } from "@/lib/api";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { bridgeLibrary, libraryPrincipalOf } from "@/lib/libraryComponent";

const CORS = corsHeaders("GET");

export const OPTIONS = corsOptions("GET");

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ entryId: string }> },
) {
  try {
    const context = await requireContext();
    const { entryId } = await params;
    const item = await bridgeLibrary()
      .get(await libraryPrincipalOf(context), entryId)
      .catch(() => null);
    if (!item) throw new AccessError("No such entry");
    return NextResponse.json({ item }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "GET");
  }
}
