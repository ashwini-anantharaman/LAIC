// GET /api/bridge/library/collections/[collectionId] — one designated
// collection with its items, for the native collection screen. Being granted
// the collection IS the permission (no copies involved); denial reads as 404,
// exactly like the /m/collection page's redirect — existence is never leaked.

import { NextResponse } from "next/server";

import { AccessError, apiError, requireContext } from "@/lib/api";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { bridgeLibrary, libraryPrincipalOf } from "@/lib/libraryComponent";

const CORS = corsHeaders("GET");

export const OPTIONS = corsOptions("GET");

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ collectionId: string }> },
) {
  try {
    const context = await requireContext();
    const { collectionId } = await params;

    const principal = await libraryPrincipalOf(context);
    let result: Awaited<ReturnType<ReturnType<typeof bridgeLibrary>["getCollectionWithItems"]>>;
    try {
      result = await bridgeLibrary().getCollectionWithItems(principal, collectionId);
    } catch {
      throw new AccessError("Not granted");
    }
    if (!result) throw new AccessError("No such collection");

    return NextResponse.json(
      {
        collection: {
          id: collectionId,
          name: result.collection.name,
          description: result.collection.description ?? null,
        },
        // The component's generic item envelope — consumers never learn
        // bridge's storage shapes.
        items: result.items,
      },
      { headers: CORS },
    );
  } catch (e) {
    return withCors(apiError(e), "GET");
  }
}
