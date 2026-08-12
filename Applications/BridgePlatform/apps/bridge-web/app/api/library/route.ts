// Library HTTP facade — the component's front door for OTHER UIs.
//
// GET /api/library?view=mine|program|org&kind=board → { items: LibraryItem[] }
//
// Everything the pages get in-process, any client gets as JSON: the SAME
// LibraryService, the SAME policy enforced server-side. Auth: the bridge
// session cookie (embedded WebViews/iframes already carry it) or a bearer
// token + x-program-id (the native app — resolved by the same
// getBridgeContext). The response uses the component's generic item
// envelope, so consumers never learn bridge's storage shapes.

import { NextResponse, type NextRequest } from "next/server";
import { LibraryAccessError } from "@laic/library-core";
import { corsHeaders, corsOptions } from "@/lib/cors";
import { bridgeLibrary, libraryPrincipalOf, programReadPrincipal } from "@/lib/libraryComponent";
import { getBridgeContext } from "@/lib/nexus";

const CORS = corsHeaders("GET");

export const OPTIONS = corsOptions("GET");

export async function GET(req: NextRequest): Promise<NextResponse> {
  const context = await getBridgeContext();
  if (!context)
    return NextResponse.json({ detail: "Not signed in" }, { status: 401, headers: CORS });

  const view = req.nextUrl.searchParams.get("view") ?? "mine";
  if (view !== "mine" && view !== "program" && view !== "org") {
    return NextResponse.json(
      { detail: "view must be mine|program|org" },
      { status: 400, headers: CORS },
    );
  }
  const kind = req.nextUrl.searchParams.get("kind") ?? undefined;

  try {
    const principal = programReadPrincipal(await libraryPrincipalOf(context), context, view);
    // The service already returns the generic item envelope — consumers
    // never learn bridge's storage shapes.
    const items = await bridgeLibrary().list(principal, { view, kind });
    return NextResponse.json({ items }, { headers: CORS });
  } catch (err) {
    if (err instanceof LibraryAccessError) {
      return NextResponse.json({ detail: err.message }, { status: 403, headers: CORS });
    }
    throw err;
  }
}
