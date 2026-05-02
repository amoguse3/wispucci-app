"""
Wispucci backend — configuration.
All settings come from environment variables with sensible defaults.
"""
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class Settings:
    # Core
    APP_NAME: str = "wispucci"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "change-me-in-production-use-a-real-secret")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = 24

    # Database — defaults to SQLite for zero-setup dev; set DATABASE_URL for Postgres
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        f"sqlite+aiosqlite:///{Path(__file__).parent / 'wispucci.db'}",
    )
    DB_ECHO: bool = DEBUG

    # AI Tutor (OpenAI-compatible API)
    AI_API_KEY: Optional[str] = os.getenv("AI_API_KEY", None)
    AI_BASE_URL: str = os.getenv("AI_BASE_URL", "https://api.openai.com/v1")
    AI_MODEL: str = os.getenv("AI_MODEL", "gpt-4o-mini")
    AI_TUTOR_TEMPERATURE: float = 0.7
    AI_TUTOR_MAX_TOKENS: int = 512

    # Rate limits
    TUTOR_RATE_LIMIT_PER_HOUR: int = 30  # AI calls are expensive

    # CORS
    CORS_ORIGINS: list[str] = field(default_factory=lambda: os.getenv(
        "CORS_ORIGINS", "http://localhost:*"
    ).split(","))

    # XP / streak constants
    XP_PER_LESSON_COMPLETE: int = 47
    XP_PER_CORRECT_ANSWER: int = 12
    STREAK_DAILY_DEADLINE_HOURS: int = 26  # grace period for timezone differences

    # Spaced repetition (FSRS-like, simplified)
    SPACED_INTERVALS_MINUTES: list[int] = field(
        default_factory=lambda: [1, 10, 60, 360, 1440, 4320, 10080]
    )  # 1m, 10m, 1h, 6h, 1d, 3d, 7d


settings = Settings()
