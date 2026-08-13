// What an ORG provisioned for a program is the CEILING on what that program's
// roles can grant. Roles distribute authority within the ceiling; they cannot
// raise it.
//
// This rule was already implemented, once, privately, inside offerings.ts as
// `_clampCapsToProvisioning` — and it was applied only where the console AUTHORS a
// role. Nothing applied it at request time, so a role created before its club's
// provisioning narrowed (or written by any path that skips the clamp) kept granting
// capabilities the org never gave. It lives here now so the authoring path and the
// runtime path cannot drift: one rule, two callers.
//
// TWO SIGNALS, AND THEY MEAN DIFFERENT THINGS
//
//   1. `features[key] === false` — the platform is OFF. A hard denial: no
//      capability of that platform survives, whatever any role says.
//   2. `feature_access[key].capabilities` — the "Partial" envelope. Present and
//      non-empty means "only these"; ABSENT means no restriction was recorded.
//
// ABSENT IS NOT DENIAL. This is the distinction that has already cost this codebase
// a bug: reading an empty club-app set as "denied" took the `+` button away from
// every B2F3 mentor. The API cannot even store an empty envelope —
// `_sanitizeFeatureAccess` does `if (caps.length)` and drops the key otherwise, so
// "Full" and "No access" both arrive here with the key missing, and the two are
// distinguished by signal 1, not by an empty list. An empty array is nevertheless
// treated as absent below, because `[]` is truthy in JS and a single stray writer
// storing one would otherwise silently revoke a whole club's access. Denial has a
// dedicated channel; it does not need this one.
//
// Org-level provisioning intersects program-level: a capability must survive both.

import * as db from "../platformDb";
import { normalizeProgramFeatures } from "../schemas";
import { grantableCapabilities } from "./resolver";
import { getCatalogue } from "./store";

/** feature_access key → the catalogue that defines its capability ids. */
export const FEATURE_ACCESS_PROVIDER: Record<string, "learning" | "bridge" | "club-app"> = {
  learning: "learning",
  bridge: "bridge",
  clubapp: "club-app",
};

type CapsEntry = { capabilities?: string[] } | undefined;

/** An envelope that restricts nothing — see "ABSENT IS NOT DENIAL" above. */
function envelope(entry: CapsEntry): string[] | null {
  const caps = entry?.capabilities;
  return caps && caps.length ? caps : null;
}

/**
 * Filter `capabilities` to those the program's org actually provisioned.
 *
 * Non-platform capability ids (console, org) pass through untouched: this
 * function only has an opinion about the three platform catalogues.
 */
export async function clampCapsToProvisioning(
  program: Record<string, unknown>,
  capabilities: string[],
): Promise<string[]> {
  const featureAccess = (program.feature_access as Record<string, { capabilities?: string[] }> | null) ?? {};
  const enabled = normalizeProgramFeatures(program.features as Record<string, unknown>);
  const orgCaps = await db.getOrgCapabilities(program.org_id as string).catch(() => null);
  const orgAccess = (orgCaps?.featureAccess as Record<string, { capabilities?: string[] }> | undefined) ?? {};

  // program ∩ org, where either being absent imposes no restriction from that
  // level. null = unrestricted.
  const allowedFor = (key: string): Set<string> | null => {
    const prog = envelope(featureAccess[key]);
    const org = envelope(orgAccess[key]);
    if (prog && org) return new Set(prog.filter((c) => org.includes(c)));
    if (prog) return new Set(prog);
    if (org) return new Set(org);
    return null;
  };

  const platformCapSets: Record<string, Set<string>> = {};
  const platformAllowed: Record<string, Set<string> | null> = {};
  for (const key of Object.keys(FEATURE_ACCESS_PROVIDER)) {
    platformCapSets[key] = new Set(grantableCapabilities(await getCatalogue(FEATURE_ACCESS_PROVIDER[key])));
    platformAllowed[key] = allowedFor(key);
  }

  return capabilities.filter((id) => {
    for (const key of Object.keys(FEATURE_ACCESS_PROVIDER)) {
      if (platformCapSets[key].has(id)) {
        // A DISABLED platform grants nothing, regardless of any stale caps sent.
        if (enabled[key as keyof typeof enabled] === false) return false;
        const allowed = platformAllowed[key];
        return allowed ? allowed.has(id) : true;
      }
    }
    return true; // not a platform capability → unaffected
  });
}

/**
 * The same clamp, for a caller that holds only a program id.
 *
 * A program that cannot be loaded imposes NO restriction. That is deliberate: this
 * runs on every capability resolution, and a transient database hiccup must not
 * read as "the org provisioned nothing" and lock a club out of its own app. The
 * capabilities being filtered were already earned from a role; provisioning narrows
 * them, and an unknown ceiling narrows nothing.
 */
export async function clampCapsForProgram(
  programId: string,
  capabilities: string[],
): Promise<string[]> {
  if (!capabilities.length) return capabilities;
  const program = await db.getProgram(programId).catch(() => null);
  if (!program) return capabilities;
  return clampCapsToProvisioning(program as Record<string, unknown>, capabilities);
}

/**
 * The club-app CEILING for one program, in a form a client can enforce.
 *
 * The server clamps every capability set it resolves (appAccessFor), but the app
 * does not gate purely on that set: `can()` lets a structural admin through before
 * consulting capabilities, and reads an EMPTY set as "no fine roles configured" and
 * falls back to coarse behaviour. Both are deliberate — the second is why B2F3's
 * mentors have a `+` at all. Neither can be removed without regressing those cases,
 * and neither can be allowed to exceed provisioning.
 *
 * So the ceiling travels to the client as its own fact and is applied as its own
 * filter, ahead of all role logic: a capability the org did not provision is denied
 * to everyone, admin or not, while everything WITHIN the ceiling still follows the
 * existing rules. Two questions, kept apart:
 *
 *   "did the org give this club the feature?"  → this
 *   "does this person's role grant it?"        → appAccessFor / can()
 *
 * `capabilities: null` means UNRESTRICTED, not empty — see "ABSENT IS NOT DENIAL".
 */
export async function appProvisioning(
  programId: string,
): Promise<{ enabled: boolean; capabilities: string[] | null }> {
  const program = await db.getProgram(programId).catch(() => null);
  // Unknown program → no ceiling. A database hiccup must not read as a revocation.
  if (!program) return { enabled: true, capabilities: null };
  const enabled = normalizeProgramFeatures(program.features as Record<string, unknown>).clubapp !== false;
  const featureAccess = (program.feature_access as Record<string, { capabilities?: string[] }> | null) ?? {};
  return { enabled, capabilities: envelope(featureAccess.clubapp) };
}
