/**
 * Bridge Access Catalogue + custom roles — thin client over the Nexus backend,
 * mirroring the learning app's model: the catalogue is the inventory of what can
 * be permission-controlled; capability-bound roles bind ids from it; assignment
 * (who holds a role) stays in Nexus (lib/nexusPeople). http mode only.
 */
import { cookies } from "next/headers";
import { cachedNexusGet, invalidateNexusReads } from "./nexusCache";
import { nexusFetch } from "./nexusPeople";
import { NEXUS_TOKEN_COOKIE } from "./nexusToken";

// ── Catalogue shapes (mirror the backend CapabilityCatalogueDocument) ─────────
export type BridgeReservedTier = "owner" | "full_operator" | "program_admin";
export type BridgeUiSurfaceKind = "navigation" | "screen" | "component" | "action";
export interface BridgeCapability {
  id: string;
  label: string;
  description?: string;
  group: string;
  reserved?: BridgeReservedTier;
  supportsResourceConstraints?: boolean;
  resourceTypes?: string[];
}
export interface BridgeUiSurface {
  id: string;
  label: string;
  kind: BridgeUiSurfaceKind;
  group?: string;
  routeOrComponent?: string;
  requiredAnyCapabilities?: string[];
}
export interface BridgeCatalogueGroup {
  id: string;
  label: string;
  description?: string;
  order: number;
  capabilityIds?: string[];
  uiSurfaceIds?: string[];
}
export interface BridgeResourceType {
  id: string;
  label: string;
  description?: string;
}
export interface BridgeCatalogue {
  $schema?: string;
  schemaVersion?: string;
  documentType: "capability_catalogue";
  id: string;
  name: string;
  description?: string;
  provider: { kind: string; id: string };
  catalogueVersion?: string;
  capabilities: BridgeCapability[];
  uiSurfaces: BridgeUiSurface[];
  groups: BridgeCatalogueGroup[];
  resourceTypes: BridgeResourceType[];
  sampleRoleTemplates?: { id: string; name: string; description?: string; grants: { capabilityIds: string[] }[] }[];
}

export interface BridgeRole {
  id: string;
  name: string;
  capabilities: string[];
}

// ── Catalogue ────────────────────────────────────────────────────────────────
export async function getBridgeCatalogue(programId: string): Promise<BridgeCatalogue> {
  return cachedNexusGet(`catalogue:${programId}`, async () => {
    const res = await nexusFetch(`/api/platform/bridge/catalogue?program_id=${encodeURIComponent(programId)}`);
    if (!res.ok) throw new Error(`Bridge catalogue request failed: ${res.status}`);
    return (await res.json()) as BridgeCatalogue;
  });
}

export async function saveBridgeCatalogue(programId: string, doc: BridgeCatalogue): Promise<BridgeCatalogue> {
  const res = await nexusFetch(`/api/platform/bridge/catalogue?program_id=${encodeURIComponent(programId)}`, {
    method: "PUT",
    body: JSON.stringify(doc),
  });
  if (!res.ok) throw new Error(`Bridge catalogue save failed: ${res.status}`);
  invalidateNexusReads(`catalogue:${programId}`);
  return (await res.json()) as BridgeCatalogue;
}

export async function resetBridgeCatalogue(programId: string): Promise<BridgeCatalogue> {
  const res = await nexusFetch(`/api/platform/bridge/catalogue?program_id=${encodeURIComponent(programId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Bridge catalogue reset failed: ${res.status}`);
  invalidateNexusReads(`catalogue:${programId}`);
  return (await res.json()) as BridgeCatalogue;
}

/** The LIBRARY component's own provider catalogue — the single source of
 *  truth for library.* capability ids (bridge no longer embeds copies). */
export async function getLibraryCatalogue(): Promise<BridgeCatalogue> {
  return cachedNexusGet("catalogue:library-component", async () => {
    const res = await nexusFetch("/api/platform/catalogues/library");
    if (!res.ok) throw new Error(`Library catalogue request failed: ${res.status}`);
    return (await res.json()) as BridgeCatalogue;
  });
}

/** Save the library component's catalogue (platform-level document; Nexus
 *  settings-edit permission enforced server-side). */
export async function saveLibraryCatalogue(doc: BridgeCatalogue): Promise<BridgeCatalogue> {
  const res = await nexusFetch("/api/platform/catalogues/library", {
    method: "PUT",
    body: JSON.stringify(doc),
  });
  if (!res.ok) throw new Error(`Library catalogue save failed: ${res.status}`);
  invalidateNexusReads("catalogue:library-component");
  return (await res.json()) as BridgeCatalogue;
}

export async function resetLibraryCatalogue(): Promise<BridgeCatalogue> {
  const res = await nexusFetch("/api/platform/catalogues/library", { method: "DELETE" });
  if (!res.ok) throw new Error(`Library catalogue reset failed: ${res.status}`);
  invalidateNexusReads("catalogue:library-component");
  return (await res.json()) as BridgeCatalogue;
}

/** What the ROLE BUILDER offers: bridge's catalogue plus the library
 *  component's — one picker over both inventories. The server sanitizes role
 *  saves against the same pair, so picker and enforcement stay in lockstep. */
export async function getRoleBuilderCatalogue(programId: string): Promise<BridgeCatalogue> {
  const [bridge, library] = await Promise.all([
    getBridgeCatalogue(programId),
    getLibraryCatalogue().catch(() => null),
  ]);
  if (!library) return bridge;
  const maxOrder = Math.max(0, ...bridge.groups.map((g) => g.order));
  return {
    ...bridge,
    capabilities: [
      ...bridge.capabilities,
      ...library.capabilities.map((c) => ({ ...c, group: `library-${c.group}` })),
    ],
    groups: [
      ...bridge.groups,
      ...library.groups.map((g) => ({
        ...g,
        id: `library-${g.id}`,
        label: `Library · ${g.label}`,
        order: maxOrder + g.order,
        capabilityIds: g.capabilityIds,
      })),
    ],
    resourceTypes: [...bridge.resourceTypes, ...(library.resourceTypes ?? [])],
  };
}

// ── Custom roles ─────────────────────────────────────────────────────────────
export async function listBridgeRoles(programId: string): Promise<BridgeRole[]> {
  return cachedNexusGet(`roles:${programId}`, async () => {
    const res = await nexusFetch(`/api/platform/bridge/roles?program_id=${encodeURIComponent(programId)}`);
    if (!res.ok) throw new Error(`Bridge roles request failed: ${res.status}`);
    return (await res.json()) as BridgeRole[];
  });
}

export async function createBridgeRole(programId: string, input: { name: string; capabilities: string[] }): Promise<BridgeRole> {
  const res = await nexusFetch("/api/platform/bridge/roles", {
    method: "POST",
    body: JSON.stringify({ program_id: programId, name: input.name, capabilities: input.capabilities }),
  });
  if (!res.ok) throw new Error(`Create bridge role failed: ${res.status}`);
  invalidateNexusReads(`roles:${programId}`);
  return (await res.json()) as BridgeRole;
}

export async function updateBridgeRole(
  programId: string,
  roleId: string,
  patch: { name?: string; capabilities?: string[] },
): Promise<BridgeRole> {
  const res = await nexusFetch(`/api/platform/bridge/roles/${encodeURIComponent(roleId)}?program_id=${encodeURIComponent(programId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Update bridge role failed: ${res.status}`);
  invalidateNexusReads(`roles:${programId}`);
  return (await res.json()) as BridgeRole;
}

export async function deleteBridgeRole(programId: string, roleId: string): Promise<void> {
  const res = await nexusFetch(`/api/platform/bridge/roles/${encodeURIComponent(roleId)}?program_id=${encodeURIComponent(programId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Delete bridge role failed: ${res.status}`);
  invalidateNexusReads(`roles:${programId}`);
}

// ── Collection designations (roleId → collection ids) ───────────────────────
export async function getCollectionDesignations(
  programId: string,
): Promise<Record<string, string[]>> {
  const res = await nexusFetch(
    `/api/platform/bridge/collection-designations?program_id=${encodeURIComponent(programId)}`,
  );
  if (!res.ok) throw new Error(`Designations request failed: ${res.status}`);
  return (await res.json()) as Record<string, string[]>;
}

export async function setCollectionDesignations(
  programId: string,
  map: Record<string, string[]>,
): Promise<void> {
  const res = await nexusFetch(
    `/api/platform/bridge/collection-designations?program_id=${encodeURIComponent(programId)}`,
    { method: "PUT", body: JSON.stringify(map) },
  );
  if (!res.ok) throw new Error(`Designations save failed: ${res.status}`);
  invalidateNexusReads("mycols:");
}

// ── Test as (centralized dev-login) ──────────────────────────────────────────
/**
 * Swap the active Nexus session to `email` via the backend dev-login, then set
 * the session cookie so the next request re-resolves /bridge/context as that
 * person (they re-enter Bridge with their resolved role). Throws if dev-login
 * is not enabled on the target environment (404).
 */
export async function testAsPerson(email: string, orgId: string | null): Promise<void> {
  const res = await nexusFetch("/api/platform/dev/login-as", {
    method: "POST",
    body: JSON.stringify({ email, org_id: orgId ?? undefined }),
  });
  if (!res.ok) {
    throw new Error(res.status === 404 ? "Test login is not enabled on this environment" : `Test login failed: ${res.status}`);
  }
  const { access_token } = (await res.json()) as { access_token: string };
  const cookieStore = await cookies();
  // Match the launch route's cookie options (incl. secure in prod https).
  cookieStore.set(NEXUS_TOKEN_COOKIE, access_token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}
