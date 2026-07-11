import "dotenv/config";

/**
 * Environment-backed configuration.
 *
 * Values come from `backend-ts/.env` (never committed). The Anthropic key stays
 * server-side only; the frontend never sees it. Env var names match the Python
 * backend so an existing `.env` works unchanged.
 */
export interface Settings {
  anthropicApiKey: string;
  // Matches the model the older LIAC app used successfully; override via env.
  claudeModel: string;

  // Supabase (service-role key -> server-side only). Optional: the DB is a
  // cache for this slice, not a hard dependency.
  supabaseUrl: string;
  supabaseServiceRoleKey: string;

  // Direct Postgres connection string for the Drizzle data path (v0.4).
  // e.g. postgresql://user:pass@host:5432/db  (Supabase or any Postgres).
  databaseUrl: string;

  // CORS: primary frontend origin (owlwise-2 on Vercel or local dev).
  frontendOrigin: string;
  // Comma-separated extra origins (e.g. platform_logic Vercel URL).
  extraCorsOrigins: string;

  // Signup-hook abuse throttle: max requests per app per minute.
  hookRateLimitPerMin: number;

  readonly supabaseEnabled: boolean;
}

let _settings: Settings | null = null;

export function getSettings(): Settings {
  if (_settings) return _settings;
  const env = process.env;
  _settings = {
    anthropicApiKey: env.ANTHROPIC_API_KEY ?? "",
    claudeModel: env.CLAUDE_MODEL || "claude-sonnet-4-5",

    supabaseUrl: env.SUPABASE_URL ?? "",
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",

    databaseUrl: env.DATABASE_URL ?? env.SUPABASE_DB_URL ?? "",

    frontendOrigin: env.FRONTEND_ORIGIN || "http://localhost:5173",
    extraCorsOrigins: env.EXTRA_CORS_ORIGINS ?? "",

    hookRateLimitPerMin: Number(env.HOOK_RATE_LIMIT_PER_MIN ?? "120"),

    get supabaseEnabled(): boolean {
      return Boolean(this.supabaseUrl && this.supabaseServiceRoleKey);
    },
  };
  return _settings;
}
