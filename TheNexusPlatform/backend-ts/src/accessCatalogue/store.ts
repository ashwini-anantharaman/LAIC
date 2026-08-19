/**
 * Central catalogue store — one document per (provider, instance), backed by the
 * existing platform_settings key/value.
 *
 * Instance scoping (per-instance customization):
 *   • nexus-console / learning / bridge → global (no instance).
 *   • org-console  → per organization (instanceId = orgId).
 *   • program-console → per program (instanceId = programId).
 * An instance with no stored override falls back to the SHIPPED DEFAULT for its
 * provider, so a fresh org/program shows the standard dropdown until customized.
 */
import * as db from "../platformDb";
import type { CapabilityCatalogueDocument, ProviderId } from "./types";
import { PROVIDER_IDS } from "./types";
import { DEFAULT_CATALOGUES } from "./defaults";
import { grantableCapabilities } from "./resolver";

export interface CatalogueRef {
  providerId: ProviderId;
  /** Instance id (orgId / programId). Omitted for global providers. */
  instanceId?: string | null;
}

const settingKey = (providerId: string, instanceId?: string | null) =>
  instanceId ? `access_catalogue:${providerId}:${instanceId}` : `access_catalogue:${providerId}`;

export function isProviderId(id: string): id is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(id);
}

/** The live catalogue for a (provider, instance) — stored override, else the
 *  shipped default for that provider. */
export async function getCatalogue(providerId: ProviderId, instanceId?: string | null): Promise<CapabilityCatalogueDocument> {
  const stored = (await db.getPlatformSetting(settingKey(providerId, instanceId))) as CapabilityCatalogueDocument | null;
  // A stored doc must be well-formed to be trusted — a corrupted/partial save
  // (missing the capabilities/groups arrays) must never poison consumers
  // (context resolution, role builders). Fall back to the shipped default.
  if (stored && Array.isArray(stored.capabilities) && Array.isArray(stored.groups)) {
    return _withShippedAdditions(stored, DEFAULT_CATALOGUES[providerId]);
  }
  return DEFAULT_CATALOGUES[providerId];
}

/**
 * Fold capabilities the PLATFORM has since shipped into a customized catalogue.
 *
 * A stored document is a snapshot of the defaults at the moment someone first
 * pressed Save. Returning it verbatim meant that any deployment which had ever
 * customized its catalogue could never see a capability added later: the id is
 * absent, so the role builder never offers it and `validGrantsAcross` silently
 * drops it from anything that asks for it anyway. A new feature would appear to
 * ship and then simply not exist there, with nothing on screen to say why.
 *
 * ADD-ONLY, and stored entries always win. A customization — a renamed label, a
 * regrouped capability, an extra one of the org's own — is never overwritten or
 * removed; this only appends ids the stored doc has no entry for at all.
 *
 * The known cost: a capability an admin deliberately DELETED comes back. That is
 * the deliberate trade. A resurrected capability is merely grantable and shows
 * up in a builder where someone can ignore it; a missing one is a feature that
 * cannot be switched on and gives no reason. `resetCatalogue` remains the way to
 * go back to the shipped set wholesale.
 */
export function _withShippedAdditions(
  stored: CapabilityCatalogueDocument,
  shipped: CapabilityCatalogueDocument | undefined,
): CapabilityCatalogueDocument {
  if (!shipped) return stored;
  const missing = <T extends { id: string }>(mine: T[] | undefined, theirs: T[] | undefined): T[] => {
    const have = new Set((mine ?? []).map((x) => x.id));
    return (theirs ?? []).filter((x) => !have.has(x.id));
  };

  const newCaps = missing(stored.capabilities, shipped.capabilities);
  const newSurfaces = missing(stored.uiSurfaces, shipped.uiSurfaces);
  const newResources = missing(stored.resourceTypes, shipped.resourceTypes);
  const newGroups = missing(stored.groups, shipped.groups);
  // A new capability in an EXISTING group has to be listed there too, or the
  // group renders without it in builders that read groups[].capabilityIds.
  const storedGroupIds = new Set((stored.groups ?? []).map((g) => g.id));
  const groups = (stored.groups ?? []).map((g) => {
    const shippedGroup = (shipped.groups ?? []).find((x) => x.id === g.id);
    if (!shippedGroup) return g;
    const have = new Set(g.capabilityIds ?? []);
    const add = (shippedGroup.capabilityIds ?? []).filter(
      (id) => !have.has(id) && newCaps.some((c) => c.id === id),
    );
    return add.length ? { ...g, capabilityIds: [...(g.capabilityIds ?? []), ...add] } : g;
  });

  if (
    !newCaps.length && !newSurfaces.length && !newResources.length && !newGroups.length &&
    groups.every((g, i) => g === (stored.groups ?? [])[i])
  ) {
    return stored;
  }
  return {
    ...stored,
    capabilities: [...(stored.capabilities ?? []), ...newCaps],
    uiSurfaces: [...(stored.uiSurfaces ?? []), ...newSurfaces],
    resourceTypes: [...(stored.resourceTypes ?? []), ...newResources],
    groups: [...groups, ...newGroups.filter((g) => !storedGroupIds.has(g.id))],
  };
}

/** All GLOBAL providers with whether each has a stored (customized) catalogue. */
export async function listCatalogues(): Promise<
  { providerId: ProviderId; name: string; customized: boolean }[]
> {
  const out: { providerId: ProviderId; name: string; customized: boolean }[] = [];
  for (const id of PROVIDER_IDS) {
    const stored = await db.getPlatformSetting(settingKey(id));
    out.push({ providerId: id, name: DEFAULT_CATALOGUES[id].name, customized: !!stored });
  }
  return out;
}

export async function saveCatalogue(
  providerId: ProviderId,
  doc: CapabilityCatalogueDocument,
  instanceId?: string | null,
): Promise<CapabilityCatalogueDocument> {
  await db.setPlatformSetting(settingKey(providerId, instanceId), doc as unknown as Record<string, unknown>);
  return doc;
}

/** Restore a (provider, instance) to its shipped default. */
export async function resetCatalogue(providerId: ProviderId, instanceId?: string | null): Promise<CapabilityCatalogueDocument> {
  await db.setPlatformSetting(settingKey(providerId, instanceId), DEFAULT_CATALOGUES[providerId] as unknown as Record<string, unknown>);
  return DEFAULT_CATALOGUES[providerId];
}

/** Keep only capability ids grantable in one of the given (provider, instance)
 *  catalogues — sanitizes a role save against the inventory (drops unknown or
 *  reserved ids). */
export async function validGrantsAcross(refs: CatalogueRef[], ids: string[]): Promise<string[]> {
  if (!ids?.length) return [];
  const ok = new Set<string>();
  for (const ref of refs) {
    const doc = await getCatalogue(ref.providerId, ref.instanceId);
    for (const id of grantableCapabilities(doc)) ok.add(id);
  }
  return [...new Set(ids)].filter((id) => ok.has(id));
}
