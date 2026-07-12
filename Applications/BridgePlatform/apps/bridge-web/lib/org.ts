// §3.4 org policy enforcement points. The org profile is bridge-owned
// configuration on top of the Nexus organization; absent profile = defaults
// (AI allowed, BEN off, all systems).

import type { BridgeRulePackage } from "@bridge/engine";
import type { NexusBridgeContext } from "@laic/learner-contracts";
import { profileService } from "./profiles";

/** Throws when the caller's org has switched AI players off. */
export async function assertAiAllowed(context: NexusBridgeContext): Promise<void> {
  const org = await (await profileService()).getOrgProfile(context);
  if (org && !org.allowAiPlayers)
    throw new Error(
      "Your organization has disabled AI players (org policy) — ask an org admin to enable them",
    );
}

/** Throws when the org restricts bidding systems and the package isn't allowed. */
export async function assertPackageAllowed(
  context: NexusBridgeContext,
  pkg: BridgeRulePackage,
): Promise<void> {
  const org = await (await profileService()).getOrgProfile(context);
  if (
    org &&
    org.allowedBiddingSystems.length &&
    !org.allowedBiddingSystems.includes(pkg.systemFamily)
  )
    throw new Error(
      `Your organization allows only [${org.allowedBiddingSystems.join(", ")}] bidding systems (org policy)`,
    );
}
