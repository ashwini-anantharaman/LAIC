import { BridgeContext, fetchBridgeContext } from "./nexus";

export type { BridgeContext } from "./nexus";

// Session-scoped cache of the caller's bridge access (coach vs learner).
// Keyed by TOKEN: an in-flight fetch from a previous session that resolves
// after sign-out must never leak its role into the next session.

let cached: { token: string; value: BridgeContext | null } | null = null;

export async function getBridgeContextCached(
  token: string,
): Promise<BridgeContext | null> {
  if (cached && cached.token === token) return cached.value;
  let value: BridgeContext | null;
  try {
    value = await fetchBridgeContext(token);
  } catch {
    value = null; // 403 = no bridge grant; the app treats them as a learner
  }
  cached = { token, value };
  return value;
}

export function isCoach(context: BridgeContext | null): boolean {
  if (!context) return false;
  return (
    context.is_admin ||
    context.accessLevel === "coach" ||
    context.accessLevel === "admin" ||
    context.roles.includes("bridge_coach") ||
    context.roles.includes("bridge_program_admin")
  );
}

export function clearBridgeRoleCache(): void {
  cached = null;
}
