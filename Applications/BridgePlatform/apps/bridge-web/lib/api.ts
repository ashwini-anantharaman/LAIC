// Shared helpers for the /api/bridge/* route handlers (Bridge plan §16.2).
// Every route derives its scope from the caller's NexusBridgeContext; store
// errors map to honest HTTP statuses.

import { AwaitingHumanError, SessionAccessError } from "@bridge/sessions";
import type { NexusBridgeContext } from "@laic/learner-contracts";
import { NextResponse } from "next/server";
import { getBridgeContext } from "./nexus";

export async function requireContext(): Promise<NexusBridgeContext> {
  const context = await getBridgeContext();
  if (!context) throw new SessionAccessError("Not signed in");
  return context;
}

export function apiError(e: unknown): NextResponse {
  if (e instanceof SessionAccessError)
    // 404, not 403: don't reveal whether a session exists outside your scope.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (e instanceof AwaitingHumanError)
    return NextResponse.json({ error: e.message, awaitingSeat: e.seat }, { status: 409 });
  const message = e instanceof Error ? e.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 400 });
}
