"""
Wispucci SQLAlchemy ORM models.
Matches BACKEND.md SQL schema with async SQLAlchemy 2.0.
"""
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid.uuid4())


# ─── Users ───────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_uuid
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), default="")
    hashed_password: Mapped[str] = mapped_column(String(256), nullable=False)
    language: Mapped[str] = mapped_column(String(8), default="ro")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now
    )

    # Learning profile
    current_subject: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_topic: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_level: Mapped[int] = mapped_column(SmallInteger, default=1)

    # Streak / XP
    streak_days: Mapped[int] = mapped_column(Integer, default=0)
    longest_streak: Mapped[int] = mapped_column(Integer, default=0)
    last_streak_day: Mapped[date | None] = mapped_column(Date, nullable=True)
    xp_total: Mapped[int] = mapped_column(Integer, default=0)

    # Settings as JSON
    settings: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True),
        default=lambda: {
            "forceFocus": False,
            "silent": False,
            "tone": "cald",
            "pace": "normal",
            "embersIntensity": 60,
        },
    )

    # Relationships
    progress = relationship("UserProgress", back_populates="user", cascade="all, delete-orphan")
    vocab_words = relationship("VocabWord", back_populates="user", cascade="all, delete-orphan")
    conversations = relationship("TutorConversation", back_populates="user", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="user", cascade="all, delete-orphan")


# ─── Modules & Lessons ───────────────────────────────────

class Module(Base):
    __tablename__ = "modules"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_uuid
    )
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    topic: Mapped[str] = mapped_column(Text, nullable=False)
    level: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    index: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimated_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    lessons = relationship("Lesson", back_populates="module", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("subject", "topic", "level", "index", name="uq_module_order"),
    )


class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_uuid
    )
    module_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("modules.id", ondelete="CASCADE"), nullable=False
    )
    index: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    practice: Mapped[dict | None] = mapped_column(JSON(none_as_null=True), nullable=True)
    notes_template: Mapped[str | None] = mapped_column(Text, nullable=True)

    module = relationship("Module", back_populates="lessons")

    __table_args__ = (
        UniqueConstraint("module_id", "index", name="uq_lesson_order"),
    )


# ─── User Progress ───────────────────────────────────────

class UserProgress(Base):
    __tablename__ = "user_progress"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    lesson_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("lessons.id", ondelete="CASCADE"), primary_key=True
    )
    progress_pct: Mapped[int] = mapped_column(SmallInteger, default=0)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    user = relationship("User", back_populates="progress")


# ─── Vocabulary ──────────────────────────────────────────

class VocabWord(Base):
    __tablename__ = "vocab_words"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_uuid
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    word: Mapped[str] = mapped_column(Text, nullable=False)
    definition: Mapped[str] = mapped_column(Text, nullable=False)
    source_lesson_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True
    )
    code_example: Mapped[str | None] = mapped_column(Text, nullable=True)
    tag: Mapped[str] = mapped_column(String(16), default="new")
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user = relationship("User", back_populates="vocab_words")

    __table_args__ = (
        UniqueConstraint("user_id", "word", name="uq_user_word"),
    )


# ─── Tutor Conversations ─────────────────────────────────

class TutorConversation(Base):
    __tablename__ = "tutor_conversations"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_uuid
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    lesson_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now
    )

    user = relationship("User", back_populates="conversations")
    messages = relationship("TutorMessage", back_populates="conversation", cascade="all, delete-orphan")


class TutorMessage(Base):
    __tablename__ = "tutor_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tutor_conversations.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # user | assistant | system
    content: Mapped[str] = mapped_column(Text, nullable=False)
    mode: Mapped[str | None] = mapped_column(String(16), nullable=True)
    selected_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now
    )

    conversation = relationship("TutorConversation", back_populates="messages")


# ─── Events (analytics) ──────────────────────────────────

class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSON(none_as_null=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, index=True
    )

    user = relationship("User", back_populates="events")


# ─── XP Daily Tracking (for per-day breakdowns) ──────────

class XpDaily(Base):
    """Tracks XP earned per user per day."""
    __tablename__ = "xp_daily"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    xp: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        Index("idx_xp_daily_user_day", "user_id", "day"),
    )
