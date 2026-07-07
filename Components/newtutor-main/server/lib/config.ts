export const config = {
  port: Number(process.env.PORT ?? 3001),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  voyageApiKey: process.env.VOYAGE_API_KEY ?? "",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  claudeModel: process.env.CLAUDE_MODEL ?? "claude-sonnet-4-5-20250929",
  voyageModel: process.env.VOYAGE_MODEL ?? "voyage-3",
  generativeManimUrl: process.env.GENERATIVE_MANIM_API_URL ?? "http://127.0.0.1:8080",
  generativeManimEngine: process.env.GENERATIVE_MANIM_ENGINE ?? "anthropic",
  generativeManimModel: process.env.GENERATIVE_MANIM_MODEL ?? "",
  generativeManimAspectRatio: process.env.GENERATIVE_MANIM_ASPECT_RATIO ?? "16:9",
  generativeManimEnabled: process.env.GENERATIVE_MANIM_ENABLED !== "false",
  transcriptApiKey: process.env.TRANSCRIPT_API_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
};

export function isGenerativeManimConfigured(): boolean {
  return config.generativeManimEnabled && Boolean(config.generativeManimUrl.trim());
}

export function assertServerConfig() {
  const missing: string[] = [];
  if (!config.anthropicApiKey) missing.push("ANTHROPIC_API_KEY");
  if (!config.voyageApiKey) missing.push("VOYAGE_API_KEY");
  if (!config.supabaseUrl) missing.push("SUPABASE_URL");
  if (!config.supabaseServiceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    console.warn(`[LAIC server] Missing env: ${missing.join(", ")} — API routes will fail until set.`);
  }
}
