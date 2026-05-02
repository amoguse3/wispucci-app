"""
Wispucci Pydantic schemas for request/response validation.
"""
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


# ─── Auth ────────────────────────────────────────────────

class SignUpRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    name: str = Field(default="", max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    token: str
    user: "UserResponse"


# ─── User ────────────────────────────────────────────────

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    language: str
    created_at: datetime
    current_subject: Optional[str] = None
    current_topic: Optional[str] = None
    current_level: int = 1
    streak_days: int = 0
    longest_streak: int = 0
    last_streak_day: Optional[date] = None
    xp_total: int = 0
    settings: dict = Field(default_factory=dict)

    model_config = {"from_attributes": True}


class UserSettingsUpdate(BaseModel):
    forceFocus: Optional[bool] = None
    silent: Optional[bool] = None
    tone: Optional[str] = None
    pace: Optional[str] = None
    embersIntensity: Optional[int] = Field(default=None, ge=0, le=100)


class UserSettingsResponse(BaseModel):
    settings: dict


# ─── Modules & Lessons ───────────────────────────────────

class LessonBrief(BaseModel):
    id: str
    index: int
    title: str
    model_config = {"from_attributes": True}


class ModuleResponse(BaseModel):
    id: str
    subject: str
    topic: str
    level: int
    index: int
    title: str
    summary: Optional[str] = None
    estimated_minutes: Optional[int] = None
    lessons: list[LessonBrief] = []

    model_config = {"from_attributes": True}


class LessonResponse(BaseModel):
    id: str
    module_id: str
    index: int
    title: str
    body: Optional[str] = None
    practice: Optional[dict] = None
    notes_template: Optional[str] = None
    progress: Optional["ProgressBrief"] = None

    model_config = {"from_attributes": True}


class ProgressBrief(BaseModel):
    progress_pct: int = 0
    completed_at: Optional[datetime] = None
    attempts: int = 0

    model_config = {"from_attributes": True}


class ProgressUpdate(BaseModel):
    progress_pct: int = Field(..., ge=0, le=100)


class LessonCompleteResponse(BaseModel):
    progress: ProgressBrief
    xp_gained: int
    new_streak: int


class CheckAnswerRequest(BaseModel):
    answers: dict = Field(default_factory=dict)


class CheckAnswerResponse(BaseModel):
    correct: bool
    hint: Optional[str] = None
    feedback: Optional[str] = None


# ─── Vocabulary ──────────────────────────────────────────

class VocabWordCreate(BaseModel):
    word: str = Field(..., min_length=1, max_length=256)
    definition: str = Field(..., min_length=1)
    source_lesson_id: Optional[str] = None
    code_example: Optional[str] = None
    tag: str = Field(default="new", pattern="^(new|known|review)$")


class VocabWordUpdate(BaseModel):
    tag: Optional[str] = Field(default=None, pattern="^(new|known|review)$")
    definition: Optional[str] = None


class VocabWordResponse(BaseModel):
    id: str
    word: str
    definition: str
    source_lesson_id: Optional[str] = None
    code_example: Optional[str] = None
    tag: str
    added_at: datetime
    last_seen_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── Streak / XP ─────────────────────────────────────────

class StreakResponse(BaseModel):
    streak_days: int
    longest_streak: int
    last_streak_day: Optional[date] = None


class XpWeekResponse(BaseModel):
    xp_today: int
    xp_week: int
    xp_total: int
    by_day: list[dict] = Field(default_factory=list)  # [{day, xp}]


# ─── AI Tutor ────────────────────────────────────────────

class TutorExplainRequest(BaseModel):
    selected_text: str = Field(..., min_length=1)
    mode: str = Field(default="simple", pattern="^(simple|example|tehnic)$")
    lesson_id: Optional[str] = None
    conversation_id: Optional[str] = None


class TutorBuildLessonRequest(BaseModel):
    subject: str = Field(..., min_length=1)
    topic: str = Field(..., min_length=1)
    level: int = Field(default=1, ge=0, le=3)
    user_focus_areas: list[str] = Field(default_factory=list)


# ─── Events ──────────────────────────────────────────────

class EventCreate(BaseModel):
    type: str
    payload: Optional[dict] = None


# ─── Generic ─────────────────────────────────────────────

class OkResponse(BaseModel):
    ok: bool = True
