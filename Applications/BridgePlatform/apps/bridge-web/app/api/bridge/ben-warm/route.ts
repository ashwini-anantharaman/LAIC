// GET /api/bridge/ben-warm — keep BEN's models loaded.
//
// WHY. BEN's first call after an idle period costs ~13s: the function loads
// TensorFlow and about twenty Keras models before it can answer anything.
// Measured on the live service, that is the difference between 13,000ms and
// ~300ms for the identical request — by far the largest single cost anywhere in
// BEN, larger than any sampling knob in api.conf.
//
// `warmUpBen()` already exists and fires when someone ENTERS a challenge, which
// is too late: the person waiting for the warm-up is the person who triggered
// it. A cron pays that cost on a schedule instead, so the first real request of
// someone's session finds the models already in memory.
//
// It is deliberately the CHEAPEST possible request — one /bid on a fixed hand,
// with a short timeout. It is not a health check and makes no promises about
// BEN being correct; it only asks the function to exist.

import { NextResponse } from "next/server";

import { warmBen } from "@/lib/challengeBen";

/** Vercel invokes crons with `Authorization: Bearer $CRON_SECRET` when set. */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Unset: allow. The route costs one BEN call and reveals nothing, so a
  // missing secret should not silently stop the warm-up from ever running.
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Longer than the cold start it exists to absorb. warmBen() defaults to 6s,
 * which is right for the interactive warm-up (nothing should hold a page open
 * that long) and useless here: a cold start is ~13s, so a 6s budget times out
 * on precisely the case this route was written for and reports BEN unreachable
 * while leaving it just as cold. Nobody is waiting on a cron.
 */
const WARM_TIMEOUT_MS = 60_000;

/** The platform default would cut this off mid-cold-start. */
export const maxDuration = 90;

export async function GET(request: Request): Promise<NextResponse> {
  if (!authorized(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await warmBen({ timeoutMs: WARM_TIMEOUT_MS });
  // 200 EVEN WHEN BEN IS DOWN, and even when it is not configured at all. A
  // cron that goes red because an optional service is unreachable trains people
  // to ignore it; the body carries the outcome for anyone reading the logs.
  return NextResponse.json(result);
}
