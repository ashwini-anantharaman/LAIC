from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-backed configuration.

    Values come from `backend/.env` (never committed). The Anthropic key stays
    server-side only; the frontend never sees it.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    anthropic_api_key: str = ""
    # Matches the model the older LIAC app used successfully; override via env.
    claude_model: str = "claude-sonnet-4-5"

    # Supabase (service-role key -> server-side only). Optional: the DB is a
    # cache for this slice, not a hard dependency.
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    # CORS: primary frontend origin (owlwise-2 on Vercel or local dev).
    frontend_origin: str = "http://localhost:5173"
    # Comma-separated extra origins (e.g. platform_logic Vercel URL).
    extra_cors_origins: str = ""

    @property
    def supabase_enabled(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
