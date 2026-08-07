/**
 * Discard an unfinished board — the "don't save my progress" half of the
 * coach app's leave-the-table choice. The app navigates its embed here; the
 * WebView's own cookie session authenticates, the session is deleted, and the
 * redirect target (?discarded=1) is what tells the host the deed is done.
 *
 * A GET that mutates, deliberately: the host app can only NAVIGATE its
 * embed (an iframe src / WebView url), not POST into it. The blast radius is
 * bounded by the guards — only the session's own creator, and only while the
 * board is unfinished; a finished board is history (My Games), not clutter.
 */
import { NextResponse } from "next/server";

import { audit } from "@/lib/audit";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";

/** The externally visible origin — honors proxy headers (tunnels, Vercel),
 *  same as app/nexus/launch: behind the coach app's same-origin proxy a
 *  request-URL redirect would point at the wrong host. */
function externalOrigin(request: Request, url: URL): string {
  const first = (name: string) => (request.headers.get(name) ?? "").split(",")[0]!.trim();
  const host = first("x-forwarded-host") || url.host;
  const proto = first("x-forwarded-proto") || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse> {
  const { sessionId } = await params;
  const origin = externalOrigin(request, new URL(request.url));

  const context = await getBridgeContext();
  if (!context) return NextResponse.redirect(new URL("/welcome", origin));

  let record;
  try {
    record = await sessionService().requireSession(sessionId);
  } catch {
    // Already gone (a retried navigation) — that's the outcome the caller
    // wanted, so confirm rather than error.
    return NextResponse.redirect(new URL("/m/home?discarded=1", origin));
  }

  // Only YOUR OWN unfinished board can be discarded. Anything else lands back
  // on the table unharmed.
  if (record.createdBy !== context.nexusUserId || record.status === "completed") {
    return NextResponse.redirect(new URL(`/m/table/${encodeURIComponent(sessionId)}`, origin));
  }

  await sessionService().deleteSession(sessionId);
  await audit(context, "session.discard", "session", sessionId, { board: record.board.name });
  return NextResponse.redirect(new URL("/m/home?discarded=1", origin));
}
