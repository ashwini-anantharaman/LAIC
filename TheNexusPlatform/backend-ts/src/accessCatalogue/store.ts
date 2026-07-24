/**
 * Central catalogue store — one document per provider, backed by the existing
 * platform_settings key/value (keys `access_catalogue:<providerId>`). A provider
 * with no stored override falls back to its shipped default, so the service works
 * before anyone has edited anything.
 */
import * as db from "../platformDb";
import type { CapabilityCatalogueDocument, ProviderId } from "./types";
import { PROVIDER_IDS } from "./types";
import { DEFAULT_CATALOGUES } from "./defaults";
import { grantableCapabilities } from "./resolver";

const settingKey = (id: string) => `access_catalogue:${id}`;

export function isProviderId(id: string): id is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(id);
}

/** The live catalogue for a provider — stored override, else shipped default. */
export async function getCatalogue(providerId: ProviderId): Promise<CapabilityCatalogueDocument> {
  const stored = (await db.getPlatformSetting(settingKey(providerId))) as CapabilityCatalogueDocument | null;
  return stored ?? DEFAULT_CATALOGUES[providerId];
}

/** All providers with whether each has a stored (customized) catalogue. */
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
): Promise<CapabilityCatalogueDocument> {
  await db.setPlatformSetting(settingKey(providerId), doc as unknown as Record<string, unknown>);
  return doc;
}

/** Restore a provider's shipped default (drops the stored override). */
export async function resetCatalogue(providerId: ProviderId): Promise<CapabilityCatalogueDocument> {
  await db.setPlatformSetting(settingKey(providerId), DEFAULT_CATALOGUES[providerId] as unknown as Record<string, unknown>);
  return DEFAULT_CATALOGUES[providerId];
}

/** Keep only capability ids that are grantable in one of the given providers'
 *  catalogues — how a role save is sanitized against the inventory (drops
 *  unknown or reserved ids so junk/forged grants can't be stored). */
export async function validGrantsAcross(providerIds: ProviderId[], ids: string[]): Promise<string[]> {
  if (!ids?.length) return [];
  const ok = new Set<string>();
  for (const p of providerIds) {
    const doc = await getCatalogue(p);
    for (const id of grantableCapabilities(doc)) ok.add(id);
  }
  return [...new Set(ids)].filter((id) => ok.has(id));
}
