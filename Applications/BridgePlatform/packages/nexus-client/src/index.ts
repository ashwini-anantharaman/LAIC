/**
 * @bridge/nexus-client
 *
 * Adapter between the Bridge Platform and the Nexus Platform. Bridge receives
 * a bridge-scoped context object from Nexus (Bridge plan §3.3) and keys
 * everything off `nexusUserId`. Bridge must not create its own generic user
 * system (Shared Data Model §17).
 *
 * Two implementations behind one interface:
 *  - StubNexusClient: seeded dev world (Bridge plan Sequence 1 allows a
 *    stubbed Nexus context).
 *  - HttpNexusClient: real adapter targeting TheNexusPlatform backend's
 *    GET /api/platform/bridge/context (endpoint lands in Phase 10).
 *
 * This package is framework-free: no Next.js/React imports. The app layer
 * decides where auth material (dev-user cookie, Supabase JWT) comes from.
 */

import { HttpNexusClient } from "./http";
import { StubNexusClient } from "./stub";
import type { NexusClient, NexusClientConfig } from "./types";

export type { BridgeRole, NexusBridgeContext } from "@laic/learner-contracts";
export {
  ADMIN_AREA_ROLES,
  canAccessAdminArea,
  hasAnyRole,
  hasAnyCapability,
  hasPermission,
  PermissionError,
  requirePermission,
  roleLabel,
} from "./access";
export { HttpNexusClient } from "./http";
export {
  findStubUser,
  STUB_APP_ID,
  STUB_GROUP_ID,
  STUB_LAIC_ORG_ID,
  STUB_PROGRAM_ORG_ID,
  STUB_USERS,
  StubNexusClient,
  stubDisplayName,
  type StubUser,
} from "./stub";
export {
  NexusContextError,
  type NexusClient,
  type NexusClientConfig,
} from "./types";

export function createNexusClient(config: NexusClientConfig): NexusClient {
  switch (config.mode) {
    case "stub":
      return new StubNexusClient(config.devUserId);
    case "http":
      return new HttpNexusClient(config);
  }
}
