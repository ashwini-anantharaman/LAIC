import type { NexusBridgeContext } from "@laic/learner-contracts";
import { NexusContextError, type NexusClient } from "./types";

/**
 * Real Nexus adapter. Targets `GET /api/platform/bridge/context` on
 * TheNexusPlatform backend (endpoint lands in Phase 10) with a Supabase JWT.
 *
 * Skeleton status: request/response wiring is real; the endpoint does not
 * exist yet. Do not enable `NEXUS_CLIENT_MODE=http` before Phase 10.
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
