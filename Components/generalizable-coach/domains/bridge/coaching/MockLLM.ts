/**
 * Test/dev double for the LLM. Returns deterministic, hint-level-aware
 * strings so tests can assert the correct level was requested without a
 * network call.
 */
import type { LLMLike } from "../../../platform/llm/index.js";
import type { BuiltPrompt } from "../../../platform/llm/index.js";

export class MockLLM implements LLMLike {
  public calls: BuiltPrompt[] = [];

  async generateCoachResponse(prompt: BuiltPrompt) {
    this.calls.push(prompt);
    const match = prompt.user.match(/hint level (\d)/);
    const level = match ? match[1] : "?";
    const typeMatch = prompt.user.match(/Generate a (\w+)/);
    const type = typeMatch ? typeMatch[1] : "response";
    return {
      text: `[mock ${type} @ level ${level}]`,
      fromModel: true,
    };
  }
}
