# Use the OS (Windows) certificate store for TLS verification. Required on
# networks/machines that intercept HTTPS (school proxies, AV SSL scanning),
# where Python's bundled CA set can't verify Supabase's re-signed certificate.
try:
    import truststore

    truststore.inject_into_ssl()
except ImportError:
    pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import bridge_context, platform

settings = get_settings()

app = FastAPI(title="The Nexus Platform API", version="0.1.0")

_extra_origins = [
    o.strip()
    for o in (settings.extra_cors_origins or "").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, *_extra_origins],
    # Local dev ports + any Vercel preview/production deployment.
    allow_origin_regex=r"(https://.*\.vercel\.app|http://(localhost|127\.0\.0\.1):\d+)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(platform.router)
app.include_router(bridge_context.router)


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "claude_model": settings.claude_model,
        "supabase": settings.supabase_enabled,
    }
