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

  // Bridge Platform origin (Phase 5 launch handoff). When set, the program's
  // bridge-platform registered app gets launch_url = `${origin}/nexus/launch`,
  // and "Launch Bridge Platform" hands off with a single-use launch token.
  bridgePlatformUrl: string;

  // Object storage (S3-compatible). When s3Bucket is set the S3 adapter is used;
  // otherwise a local-filesystem fallback (dev) writes under storageDir.
  s3Bucket: string;
  s3Endpoint: string;
  s3Region: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  storageDir: string;

  readonly storageS3Enabled: boolean;

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

    bridgePlatformUrl: (env.BRIDGE_PLATFORM_URL ?? "").replace(/\/+$/, ""),

    s3Bucket: env.S3_BUCKET ?? "",
    s3Endpoint: env.S3_ENDPOINT ?? "",
    s3Region: env.S3_REGION ?? "us-east-1",
    s3AccessKeyId: env.S3_ACCESS_KEY_ID ?? "",
    s3SecretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "",
    storageDir: env.STORAGE_DIR ?? (env.LOCAL_DATA_DIR ? `${env.LOCAL_DATA_DIR}/storage` : ".local_data/storage"),

    get storageS3Enabled(): boolean {
      return Boolean(this.s3Bucket);
    },

    get supabaseEnabled(): boolean {
      return Boolean(this.supabaseUrl && this.supabaseServiceRoleKey);
    },
  };
  return _settings;
}
