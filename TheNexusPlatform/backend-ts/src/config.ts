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

  // --- Bridge Program integration surface. Program-level roles are
  // config-seeded until a proper grant UI exists. These are mutable so tests
  // can override them (mirrors the pydantic Settings object).
  laicOrgId: string;
  bridgeProgramAdminEmails: string;
  bridgeReviewerEmails: string;

  // CORS: primary frontend origin (owlwise-2 on Vercel or local dev).
  frontendOrigin: string;
  // Comma-separated extra origins (e.g. platform_logic Vercel URL).
  extraCorsOrigins: string;

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

    laicOrgId: env.LAIC_ORG_ID || "org_laic",
    bridgeProgramAdminEmails: env.BRIDGE_PROGRAM_ADMIN_EMAILS ?? "",
    bridgeReviewerEmails: env.BRIDGE_REVIEWER_EMAILS ?? "",

    frontendOrigin: env.FRONTEND_ORIGIN || "http://localhost:5173",
    extraCorsOrigins: env.EXTRA_CORS_ORIGINS ?? "",

    get supabaseEnabled(): boolean {
      return Boolean(this.supabaseUrl && this.supabaseServiceRoleKey);
    },
  };
  return _settings;
}
