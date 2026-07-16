// §3.4 org policy enforcement points. The org profile is bridge-owned
// configuration on top of the Nexus organization; absent profile = defaults
// (AI allowed, BEN off, all knowledge bases).

import type { NexusBridgeContext } from "@laic/learner-contracts";
import { profileService } from "./profiles";

/** Throws when the caller's org has switched AI players off. */
export async function assertAiAllowed(context: NexusBridgeContext): Promise<void> {
  const org = await profileService().getOrgProfile(context);
  if (org && !org.allowAiPlayers)
    throw new Error(
      "Your organization has disabled AI players (org policy) — ask an org admin to enable them",
    );
}

/**
 * Throws when the org restricts knowledge bases and the KB isn't allowed
 * (allowedBiddingSystems holds kbIds post-rework; Stage G wires this at
 * session creation).
 */
export async function assertKbAllowed(
  context: NexusBridgeContext,
  kbId: string,
): Promise<void> {
  const org = await profileService().getOrgProfile(context);
  if (org && org.allowedBiddingSystems.length && !org.allowedBiddingSystems.includes(kbId))
    throw new Error(
      `Your organization allows only [${org.allowedBiddingSystems.join(", ")}] (org policy)`,
    );
}
