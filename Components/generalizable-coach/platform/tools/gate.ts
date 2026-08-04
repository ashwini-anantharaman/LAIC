/**
 * Zone 1 — Platform core: tool gating (LAIC §9/§10.5, M3/C1).
 *
 * Deterministic. Filters the host-injected registry down to the tools allowed
 * THIS turn, using each tool's policyHints plus the profile's tool allowlist.
 * A tool that is gated out is structurally absent from the returned list, so a
 * selector can never choose it (the assessment-safety guarantee).
 */
import type { CoachingPolicy } from "../../contracts/generated/index";
import type { CoachTool, ToolRegistry } from "./types";

export type CoachMode =
  | "practice"
  | "assessment"
  | "reference"
  | "planning"
  | "live"
  | "postmortem";

export interface GateContext {
  policy: CoachingPolicy;
  mode?: CoachMode;
  currentHintLevel?: number;
}

export function gateTools(registry: ToolRegistry, ctx: GateContext): CoachTool[] {
  const allowlist = ctx.policy.enabledTools ?? [];
  const level = ctx.currentHintLevel ?? 0;

  return registry.list().filter((tool) => {
    const hints = tool.policyHints ?? {};

    // The profile permits only an explicit subset of the host's tools.
    if (!allowlist.includes(tool.name)) return false;

    // Assessment mode structurally removes answer-revealing tools.
    if (ctx.mode === "assessment" && hints.revealsAnswer) return false;

    // Don't offer a tool before the learner has struggled enough.
    if (hints.minHintLevel !== undefined && level < hints.minHintLevel) return false;

    return true;
  });
}
