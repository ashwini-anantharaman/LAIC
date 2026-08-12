// Shared helpers for server actions and (Stage G) the rebuilt /api routes.
// Every caller derives its scope from the NexusBridgeContext; store errors
// map to honest HTTP statuses.

import type { NexusBridgeContext } from "@laic/learner-contracts";
import { NextResponse } from "next/server";
import { getBridgeContext } from "./nexus";

/** Scope/visibility failure: rendered as 404, never 403 (don't reveal existence). */
export class AccessError extends Error {}

/**
 * NO CREDENTIAL RESOLVED — rendered as 401, never 404. The 404 posture exists
 * so a denied caller can't tell a resource exists; "you are not signed in"
 * reveals nothing about any resource, and the app's bearer client refreshes
 * and retries ONLY on 401 — rendering an expired token as 404 turned every
 * hour-old session into a permanent "Not found" board (found 2026-08-12).
 * The on-demand coach routes (play-hint, ben-tell…) already answer this way.
 */
export class UnauthenticatedError extends Error {}

export async function requireContext(): Promise<NexusBridgeContext> {
  const context = await getBridgeContext();
  if (!context) throw new UnauthenticatedError("Not signed in");
  return context;
}

export function apiError(e: unknown): NextResponse {
  if (e instanceof UnauthenticatedError)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (e instanceof AccessError)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const message = e instanceof Error ? e.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Admin routes: area role gate + action permission (§21). */
export async function requireAdminContext(...permissions: string[]): Promise<NexusBridgeContext> {
  const context = await requireContext();
  const { canAccessAdminArea, requirePermission } = await import("@bridge/nexus-client");
  if (!canAccessAdminArea(context)) throw new AccessError("Not an admin");
  requirePermission(
    context,
    ...(permissions.length
      ? permissions
      : ["bridge.knowledge.review", "bridge.knowledge.edit", "bridge.program.manage"]),
  );
  return context;
}
