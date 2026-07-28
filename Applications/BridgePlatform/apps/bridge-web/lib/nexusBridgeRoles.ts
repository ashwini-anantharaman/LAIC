/**
 * Bridge Access Catalogue + custom roles — thin client over the Nexus backend,
 * mirroring the learning app's model: the catalogue is the inventory of what can
 * be permission-controlled; capability-bound roles bind ids from it; assignment
 * (who holds a role) stays in Nexus (lib/nexusPeople). http mode only.
 */
import { cookies } from "next/headers";
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
  const res = await nexusFetch(`/api/platform/bridge/catalogue?program_id=${encodeURIComponent(programId)}`);
  if (!res.ok) throw new Error(`Bridge catalogue request failed: ${res.status}`);
  return (await res.json()) as BridgeCatalogue;
}

export async function saveBridgeCatalogue(programId: string, doc: BridgeCatalogue): Promise<BridgeCatalogue> {
  const res = await nexusFetch(`/api/platform/bridge/catalogue?program_id=${encodeURIComponent(programId)}`, {
    method: "PUT",
    body: JSON.stringify(doc),
  });
  if (!res.ok) throw new Error(`Bridge catalogue save failed: ${res.status}`);
  return (await res.json()) as BridgeCatalogue;
}

export async function resetBridgeCatalogue(programId: string): Promise<BridgeCatalogue> {
  const res = await nexusFetch(`/api/platform/bridge/catalogue?program_id=${encodeURIComponent(programId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Bridge catalogue reset failed: ${res.status}`);
  return (await res.json()) as BridgeCatalogue;
}

// ── Custom roles ─────────────────────────────────────────────────────────────
export async function listBridgeRoles(programId: string): Promise<BridgeRole[]> {
  const res = await nexusFetch(`/api/platform/bridge/roles?program_id=${encodeURIComponent(programId)}`);
  if (!res.ok) throw new Error(`Bridge roles request failed: ${res.status}`);
  return (await res.json()) as BridgeRole[];
}

export async function createBridgeRole(programId: string, input: { name: string; capabilities: string[] }): Promise<BridgeRole> {
  const res = await nexusFetch("/api/platform/bridge/roles", {
    method: "POST",
    body: JSON.stringify({ program_id: programId, name: input.name, capabilities: input.capabilities }),
  });
  if (!res.ok) throw new Error(`Create bridge role failed: ${res.status}`);
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
  return (await res.json()) as BridgeRole;
}

export async function deleteBridgeRole(programId: string, roleId: string): Promise<void> {
  const res = await nexusFetch(`/api/platform/bridge/roles/${encodeURIComponent(roleId)}?program_id=${encodeURIComponent(programId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Delete bridge role failed: ${res.status}`);
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
