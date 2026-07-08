/**
 * @bridge/nexus-client
 *
 * Adapter between the Bridge Platform and the Nexus Platform. Bridge receives
 * a bridge-scoped context object from Nexus (Bridge plan §3.3) and keys
 * everything off `nexusUserId`. Bridge must not create its own generic user
 * system (Shared Data Model §17).
 *
 * Phase 0: interface + contracts wiring only.
 * Phase 1 adds `StubNexusClient` (seeded dev data) and `HttpNexusClient`
 * (targets `GET /api/platform/bridge/context`, built in Phase 10), selected
 * by environment variable. See laicdocs/Bridge_Workstream_Execution_Plan_v1.md.
 */

import type { NexusBridgeContext } from "@laic/learner-contracts";

export type { NexusBridgeContext };

/** The single seam every bridge feature uses to obtain user/org/role context. */
export interface NexusClient {
  getBridgeContext(): Promise<NexusBridgeContext>;
}

export const PACKAGE_NAME = "@bridge/nexus-client" as const;
