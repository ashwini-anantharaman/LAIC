import { describe, it, expect, vi } from "vitest";
import { LLMClient } from "./LLMClient";
import type { BuiltPrompt } from "./PromptBuilder";

const prompt: BuiltPrompt = { system: "sys", user: "usr" };

function mockFetch(url: string, body: any) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("LLMClient — OpenAI provider", () => {
  it("calls the OpenAI endpoint and parses choices[0].message.content", async () => {
    const calls: any[] = [];
    const fetchImpl = vi.fn(async (url: any, opts: any) => {
      calls.push({ url, opts });
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: "Play the Queen." } }] }),
      };
    }) as unknown as typeof fetch;

    const client = new LLMClient({
      provider: "openai",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      fetchImpl,
    });
    const res = await client.generateCoachResponse(prompt);

    expect(res.fromModel).toBe(true);
    expect(res.text).toBe("Play the Queen.");
    expect(calls[0].url).toContain("openai.com");
    expect(calls[0].opts.headers.authorization).toBe("Bearer sk-test");
    const sent = JSON.parse(calls[0].opts.body);
    expect(sent.model).toBe("gpt-4o-mini");
    expect(sent.messages[0]).toEqual({ role: "system", content: "sys" });
    expect(sent.messages[1]).toEqual({ role: "user", content: "usr" });
  });

  it("falls back gracefully on a non-OK OpenAI response", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    const client = new LLMClient({ provider: "openai", apiKey: "sk-test", fetchImpl });
    const res = await client.generateCoachResponse(prompt);
    expect(res.fromModel).toBe(false);
    expect(res.text.length).toBeGreaterThan(0);
  });
});

describe("LLMClient — Anthropic provider", () => {
  it("calls the Anthropic endpoint and parses content blocks", async () => {
    const calls: any[] = [];
    const fetchImpl = vi.fn(async (url: any, opts: any) => {
      calls.push({ url, opts });
      return {
        ok: true,
        json: async () => ({ content: [{ type: "text", text: "Duck the trick." }] }),
      };
    }) as unknown as typeof fetch;

    const client = new LLMClient({ provider: "anthropic", apiKey: "ak-test", fetchImpl });
    const res = await client.generateCoachResponse(prompt);

    expect(res.text).toBe("Duck the trick.");
    expect(calls[0].url).toContain("anthropic.com");
    expect(calls[0].opts.headers["x-api-key"]).toBe("ak-test");
  });
});

describe("LLMClient — no key", () => {
  it("returns the fallback without calling fetch", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const client = new LLMClient({ provider: "openai", apiKey: "", fetchImpl });
    const res = await client.generateCoachResponse(prompt);
    expect(res.fromModel).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
