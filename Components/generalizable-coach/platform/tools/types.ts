/**
 * Zone 2 — Domain Contracts: the tool-calling layer shape (LAIC §10, M3/C1).
 *
 * The Coach defines only the ABSTRACT capability — a tool has a name, a
 * description, an input schema, a handler, and policy hints. The HOST injects
 * its own registry via the domain plugin; the Coach never knows a tool exists
 * until told, and never runs a tool's logic itself.
 */
export interface ToolContext {
  learnerId: string;
  domainId: string;
}

/** A cleared tool call the Coach proposes (§10.6). `callId` correlates the result. */
export interface ToolCall {
  callId: string;
  tool: string;
  input: unknown;
}

export interface ToolResult {
  callId?: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolPolicyHints {
  /** block this tool during assessment mode — it would reveal the answer */
  revealsAnswer?: boolean;
  category?: "practice" | "assessment" | "reference" | "planning";
  /** don't offer until the learner has struggled to at least this hint level */
  minHintLevel?: number;
}

export interface CoachTool {
  name: string;
  /** shown to the selector (rule in M3, LLM later) to choose the tool */
  description: string;
  /** JSON Schema for the tool's input */
  inputSchema: object;
  /**
   * The HOST's code. In-process it is called directly; when the Coach runs as a
   * separate service the same `name` keys a host-side dispatcher instead.
   */
  handler: (input: unknown, ctx: ToolContext) => Promise<ToolResult>;
  policyHints?: ToolPolicyHints;
}

export interface ToolRegistry {
  list(): CoachTool[];
}

/** Convenience: build a registry from a fixed array of tools. */
export function toolRegistry(tools: CoachTool[]): ToolRegistry {
  return { list: () => tools };
}
