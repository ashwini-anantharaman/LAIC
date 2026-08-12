// GET /api/bridge/library/collections — the caller's designated collections
// (curated program groupings; instance-wide viewers see all, others exactly
// their granted ones). The JSON twin of the /m/library page's collections
// strip: same principal, same listCollections, so grant changes show in the
// native app the moment they show on the page.

import { NextResponse } from "next/server";

import { apiError, requireContext } from "@/lib/api";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { bridgeLibrary, libraryPrincipalOf } from "@/lib/libraryComponent";

const CORS = corsHeaders("GET");

export const OPTIONS = corsOptions("GET");

export async function GET() {
  try {
    const context = await requireContext();
    const collections = await bridgeLibrary()
      .listCollections(await libraryPrincipalOf(context))
      .catch(() => []);
    return NextResponse.json(
      {
        collections: collections.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description ?? null,
          itemCount: c.itemIds.length,
        })),
      },
      { headers: CORS },
    );
  } catch (e) {
    return withCors(apiError(e), "GET");
  }
}
