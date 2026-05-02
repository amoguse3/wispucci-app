"""
Wispucci Backend — FastAPI application.
Entry point: `uvicorn backend.main:app --reload`
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.database import close_db, init_db
from backend.routers import (
    auth,
    events,
    lessons,
    settings as settings_router,
    streak,
    tutor,
    vocab,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    await close_db()


app = FastAPI(
    title="Wispucci API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow frontend to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(lessons.router, prefix="/api", tags=["Lessons"])
app.include_router(vocab.router, prefix="/api/vocab", tags=["Vocab"])
app.include_router(tutor.router, prefix="/api/tutor", tags=["AI Tutor"])
app.include_router(settings_router.router, prefix="/api/me", tags=["Settings"])
app.include_router(streak.router, prefix="/api/me", tags=["Streak & XP"])
app.include_router(events.router, prefix="/api", tags=["Events"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
