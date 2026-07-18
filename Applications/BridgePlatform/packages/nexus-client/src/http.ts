import type { NexusBridgeContext } from "@laic/learner-contracts";
import { NexusContextError, type NexusClient } from "./types";

/**
 * Real Nexus adapter. Targets `GET /api/platform/bridge/context` on
 * TheNexusPlatform backend (LIVE — Nexus integration Phase 3) with a Nexus
 * session token (dev demo-auth token today, Supabase JWT once shared auth
 * lands). Nexus derives access from the caller's program-role area grant:
 * bridge:view→bridge_learner, edit→bridge_coach, comment→bridge_reviewer,
 * program/org admin→bridge_program_admin; 403 when the role doesn't grant
 * bridge or the program's bridge feature is off.
 */
export class HttpNexusClient implements NexusClient {
  constructor(
    private readonly options: {
      baseUrl: string;
      accessToken: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async getBridgeContext(): Promise<NexusBridgeContext> {
    const { baseUrl, accessToken, fetchImpl = fetch } = this.options;
    const url = `${baseUrl.replace(/\/$/, "")}/api/platform/bridge/context`;

    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
    } catch (cause) {
      throw new NexusContextError(`Failed to reach Nexus at ${url}`, cause);
    }

    if (!response.ok) {
      throw new NexusContextError(
        `Nexus context request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data: unknown = await response.json();
    assertBridgeContextShape(data);
    return data;
  }
}

function assertBridgeContextShape(
  data: unknown,
): asserts data is NexusBridgeContext {
  const d = data as Partial<NexusBridgeContext> | null;
  if (
    d == null ||
    typeof d.nexusUserId !== "string" ||
    d.programId !== "bridge_program" ||
    typeof d.appId !== "string" ||
    !Array.isArray(d.roles) ||
    !Array.isArray(d.permissions) ||
    typeof d.accessLevel !== "string"
  ) {
    throw new NexusContextError(
      "Nexus returned a response that does not match NexusBridgeContext",
    );
  }
}
