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
  return stored ?? DEFAULT_CATALOGUES[providerId];
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
