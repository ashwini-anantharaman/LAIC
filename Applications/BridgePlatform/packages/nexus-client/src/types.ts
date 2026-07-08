import type { NexusBridgeContext } from "@laic/learner-contracts";

/** The single seam every bridge feature uses to obtain user/org/role context. */
export interface NexusClient {
  getBridgeContext(): Promise<NexusBridgeContext>;
}

/** Raised when a context cannot be resolved (unknown user, bad token, Nexus error). */
export class NexusContextError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "NexusContextError";
  }
}

export type NexusClientConfig =
  | { mode: "stub"; devUserId: string }
  | { mode: "http"; baseUrl: string; accessToken: string; fetchImpl?: typeof fetch };
