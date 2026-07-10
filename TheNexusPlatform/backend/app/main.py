from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import content, courses, game, hook, learning, offerings, platform, uploads

settings = get_settings()

app = FastAPI(title="Life in AI Center API", version="0.1.0")

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

app.include_router(content.router)
app.include_router(uploads.router)
app.include_router(courses.router)
app.include_router(learning.router)
app.include_router(platform.router)
app.include_router(game.router)
app.include_router(offerings.router)
app.include_router(hook.router)


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "claude_model": settings.claude_model,
        "supabase": settings.supabase_enabled,
    }
