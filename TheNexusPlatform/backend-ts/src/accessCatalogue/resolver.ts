/**
 * Catalogue resolver — pure functions over a catalogue document. These are the
 * keystone the role builder and (later) server enforcement both use: given a
 * role's granted capability ids, produce the effective capability set and the
 * surfaces it unlocks, always validated against the catalogue. Nothing here
 * mutates state or touches the DB, so it's safe to layer in additively.
 */
import type { CapabilityCatalogueDocument } from "./types";

/** Capability ids a CUSTOM role may be granted — reserved (tier-held) excluded. */
export function grantableCapabilities(doc: CapabilityCatalogueDocument): string[] {
  return doc.capabilities.filter((c) => !c.reserved).map((c) => c.id);
}

/** Keep only ids that exist in the catalogue (and, unless includeReserved, are
 *  not reserved). This is how the server refuses grants outside the inventory. */
export function validateGrants(
  doc: CapabilityCatalogueDocument,
  ids: string[],
  includeReserved = false,
): string[] {
  const ok = new Set(
    doc.capabilities.filter((c) => includeReserved || !c.reserved).map((c) => c.id),
  );
  return [...new Set(ids)].filter((id) => ok.has(id));
}

/** Surfaces a capability set unlocks: any-of match, or empty requiredAny = always. */
export function surfacesForCapabilities(
  doc: CapabilityCatalogueDocument,
  caps: Set<string>,
): string[] {
  return doc.uiSurfaces
    .filter((s) => {
      const req = s.requiredAnyCapabilities ?? [];
      return req.length === 0 || req.some((c) => caps.has(c));
    })
    .map((s) => s.id);
}

/**
 * The authoritative capability set for a role at a provider.
 *  - A structural tier (owner / admin / program admin / full operator) bypasses
 *    the catalogue and holds EVERY capability (including reserved).
 *  - Otherwise the stored grants are validated against the catalogue (unknown or
 *    reserved ids dropped), so a forged/stale grant gains nothing.
 */
export function resolveCapabilities(
  doc: CapabilityCatalogueDocument,
  grantedIds: string[],
  opts: { structuralTier?: boolean } = {},
): Set<string> {
  if (opts.structuralTier) return new Set(doc.capabilities.map((c) => c.id));
  return new Set(validateGrants(doc, grantedIds));
}
