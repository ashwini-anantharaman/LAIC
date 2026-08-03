/**
 * Zone 1 — Platform core: tool execution (LAIC §10.6, M3/C5).
 *
 * The Coach *proposes* a ToolCall; something on the HOST side *executes* it and
 * returns a ToolResult (Variant B). This interface is that seam. In a real
 * separate-service deployment the executor is an HTTP/MCP client to the host;
 * here `InProcessToolExecutor` runs the registry's handlers directly, which
 * both serves co-located deployments and stands in for a mock host in tests.
 */
import type { CoachTool, ToolCall, ToolContext, ToolRegistry, ToolResult } from "./types";

export interface ToolExecutor {
  execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult>;
}

/** Runs a registry's handlers in-process. Also the "mock host" for tests. */
export class InProcessToolExecutor implements ToolExecutor {
  private readonly byName: Map<string, CoachTool>;

  constructor(registry: ToolRegistry) {
    this.byName = new Map(registry.list().map((t) => [t.name, t]));
  }

  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.byName.get(call.tool);
    if (!tool) return { callId: call.callId, ok: false, error: `unknown tool: ${call.tool}` };
    try {
      const result = await tool.handler(call.input, ctx);
      return { ...result, callId: call.callId };
    } catch (e) {
      return { callId: call.callId, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
