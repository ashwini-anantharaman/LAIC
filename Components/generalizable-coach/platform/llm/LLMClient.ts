/**
 * Zone 1 — Platform core: provider-aware LLM client (OpenAI or Anthropic).
 *
 * Keeps responses short for mobile (max_tokens 300). Fails gracefully: on any
 * error — or when no API key is configured — it returns a safe fallback string
 * rather than throwing, so a flaky network never blocks the coaching loop.
 *
 * Provider selection (in order of precedence):
 *   1. opts.provider
 *   2. process.env.LLM_PROVIDER ("openai" | "anthropic")
 *   3. inferred: OpenAI if OPENAI_API_KEY is set, otherwise Anthropic
 */
import type { BuiltPrompt } from "./PromptBuilder";

export type LLMProvider = "openai" | "anthropic";

export interface LLMClientOptions {
  provider?: LLMProvider;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  /** injectable for testing; defaults to global fetch */
  fetchImpl?: typeof fetch;
  fallbackMessage?: string;
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

const DEFAULT_FALLBACK =
  "Pause and think it through — what is your plan here, and which choice best serves it?";

export interface LLMResult {
  text: string;
  /** true if the model was actually called and returned text */
  fromModel: boolean;
  /** short diagnostic when fromModel is false (HTTP status, exception, …) */
  error?: string;
}

/** Browser-safe env access: process is undefined in a browser bundle. */
function env(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env?.[name] : undefined;
}

function resolveProvider(opts: LLMClientOptions): LLMProvider {
  if (opts.provider) return opts.provider;
  const fromEnv = env("LLM_PROVIDER")?.toLowerCase();
  if (fromEnv === "openai" || fromEnv === "anthropic") return fromEnv;
  if (env("OPENAI_API_KEY")) return "openai";
  return "anthropic";
}

export class LLMClient {
  private readonly provider: LLMProvider;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly fetchImpl: typeof fetch;
  private readonly fallback: string;

  constructor(opts: LLMClientOptions = {}) {
    this.provider = resolveProvider(opts);
    this.maxTokens = opts.maxTokens ?? 300;
    // Wrap rather than reference: calling a stored `fetch` as a method
    // (this.fetchImpl(...)) rebinds `this` to the client instance, which in
    // browsers throws "TypeError: Illegal invocation". Node is indifferent —
    // which is why tests pass while the browser silently falls back.
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.fallback = opts.fallbackMessage ?? DEFAULT_FALLBACK;

    if (this.provider === "openai") {
      this.apiKey = opts.apiKey ?? env("OPENAI_API_KEY") ?? "";
      this.model = opts.model ?? env("OPENAI_MODEL") ?? DEFAULT_OPENAI_MODEL;
    } else {
      this.apiKey = opts.apiKey ?? env("ANTHROPIC_API_KEY") ?? "";
      this.model =
        opts.model ?? env("ANTHROPIC_MODEL") ?? DEFAULT_ANTHROPIC_MODEL;
    }
  }

  async generateCoachResponse(prompt: BuiltPrompt): Promise<LLMResult> {
    if (!this.apiKey) {
      return { text: this.fallback, fromModel: false, error: "no API key configured" };
    }
    try {
      return this.provider === "openai"
        ? await this.callOpenAI(prompt)
        : await this.callAnthropic(prompt);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.warn(`[coach] LLM call failed (${this.provider}/${this.model}): ${error}`);
      return { text: this.fallback, fromModel: false, error };
    }
  }

  private async callOpenAI(prompt: BuiltPrompt): Promise<LLMResult> {
    const res = await this.fetchImpl(OPENAI_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error = `OpenAI HTTP ${res.status}: ${body.slice(0, 200)}`;
      console.warn(`[coach] ${error}`);
      return { text: this.fallback, fromModel: false, error };
    }
    const data: any = await res.json();
    const text: string = (data?.choices?.[0]?.message?.content ?? "").trim();
    if (!text) return { text: this.fallback, fromModel: false, error: "empty model reply" };
    return { text, fromModel: true };
  }

  private async callAnthropic(prompt: BuiltPrompt): Promise<LLMResult> {
    const res = await this.fetchImpl(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        // Required for CORS when calling the Anthropic API directly from a
        // browser (dev-harness use; in production route via a server proxy).
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error = `Anthropic HTTP ${res.status}: ${body.slice(0, 200)}`;
      console.warn(`[coach] ${error}`);
      return { text: this.fallback, fromModel: false, error };
    }
    const data: any = await res.json();
    const text: string = Array.isArray(data?.content)
      ? data.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("")
          .trim()
      : "";
    if (!text) return { text: this.fallback, fromModel: false, error: "empty model reply" };
    return { text, fromModel: true };
  }
}
