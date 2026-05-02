"""
Lessons router — modules, lessons, progress tracking.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from fastapi import APIRouter, Depends, HTTPException, Query, status

from backend.auth_utils import get_current_user
from backend.config import settings
from backend.database import get_db
from backend.models import Lesson, Module, User, UserProgress
from backend.schemas import (
    CheckAnswerRequest,
    CheckAnswerResponse,
    LessonCompleteResponse,
    LessonResponse,
    ModuleResponse,
    ProgressBrief,
    ProgressUpdate,
)
from backend.routers.streak import _award_xp, _extend_streak

router = APIRouter()


async def _get_module_or_404(module_id: str, db: AsyncSession) -> Module:
    result = await db.execute(select(Module).where(Module.id == module_id))
    mod = result.scalar_one_or_none()
    if not mod:
        raise HTTPException(status_code=404, detail="Module not found")
    return mod


async def _get_lesson_or_404(lesson_id: str, db: AsyncSession) -> Lesson:
    result = await db.execute(
        select(Lesson).where(Lesson.id == lesson_id).options(selectinload(Lesson.module))
    )
    les = result.scalar_one_or_none()
    if not les:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return les


# ─── Modules ─────────────────────────────────────────────


@router.get("/modules", response_model=list[ModuleResponse])
async def list_modules(
    subject: str = Query(None, description="Filter by subject, e.g. 'Programare'"),
    topic: str = Query(None, description="Filter by topic, e.g. 'Python — bazele'"),
    level: int = Query(None, ge=0, le=3, description="Filter by level 0-3"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return all modules, optionally filtered by subject/topic/level."""
    stmt = select(Module).options(selectinload(Module.lessons))
    if subject:
        stmt = stmt.where(Module.subject == subject)
    if topic:
        stmt = stmt.where(Module.topic == topic)
    if level is not None:
        stmt = stmt.where(Module.level == level)
    stmt = stmt.order_by(Module.subject, Module.topic, Module.level, Module.index)
    result = await db.execute(stmt)
    return [ModuleResponse.model_validate(m) for m in result.scalars().all()]


# ─── Lessons ─────────────────────────────────────────────


@router.get("/lessons/{lesson_id}", response_model=LessonResponse)
async def get_lesson(
    lesson_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return a lesson with the current user's progress."""
    lesson = await _get_lesson_or_404(lesson_id, db)

    # Fetch progress
    progress_result = await db.execute(
        select(UserProgress).where(
            UserProgress.user_id == user.id,
            UserProgress.lesson_id == lesson_id,
        )
    )
    progress = progress_result.scalar_one_or_none()

    resp = LessonResponse.model_validate(lesson)
    if progress:
        resp.progress = ProgressBrief.model_validate(progress)
    return resp


@router.post("/lessons/{lesson_id}/progress", response_model=ProgressBrief)
async def update_progress(
    lesson_id: str,
    body: ProgressUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update lesson progress percentage."""
    await _get_lesson_or_404(lesson_id, db)

    result = await db.execute(
        select(UserProgress).where(
            UserProgress.user_id == user.id,
            UserProgress.lesson_id == lesson_id,
        )
    )
    progress = result.scalar_one_or_none()

    if not progress:
        progress = UserProgress(user_id=user.id, lesson_id=lesson_id)
        db.add(progress)

    progress.progress_pct = body.progress_pct
    progress.attempts += 1

    await db.flush()
    return ProgressBrief.model_validate(progress)


@router.post("/lessons/{lesson_id}/complete", response_model=LessonCompleteResponse)
async def complete_lesson(
    lesson_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Mark a lesson as 100% complete. Awards XP and extends streak."""
    await _get_lesson_or_404(lesson_id, db)

    result = await db.execute(
        select(UserProgress).where(
            UserProgress.user_id == user.id,
            UserProgress.lesson_id == lesson_id,
        )
    )
    progress = result.scalar_one_or_none()

    if not progress:
        progress = UserProgress(user_id=user.id, lesson_id=lesson_id)
        db.add(progress)

    progress.progress_pct = 100
    progress.completed_at = None  # set by DB default
    progress.attempts += 1

    # Award XP
    xp_gained = settings.XP_PER_LESSON_COMPLETE
    user.xp_total += xp_gained
    await _award_xp(user, xp_gained, db)

    # Extend streak
    new_streak = await _extend_streak(user, db)

    await db.flush()

    return LessonCompleteResponse(
        progress=ProgressBrief.model_validate(progress),
        xp_gained=xp_gained,
        new_streak=new_streak,
    )


@router.post("/lessons/{lesson_id}/check", response_model=CheckAnswerResponse)
async def check_answer(
    lesson_id: str,
    body: CheckAnswerRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Validate a practice answer against the lesson's `practice.expected` definition.
    In v1, this is a simple comparison; v2 can use AI grading.
    """
    lesson = await _get_lesson_or_404(lesson_id, db)

    practice = lesson.practice or {}
    expected = practice.get("expected", {})
    answers = body.answers

    # Compare each key in expected
    all_correct = True
    feedback_parts = []
    for key, expected_val in expected.items():
        user_val = answers.get(key, "").strip().lower() if answers.get(key) else ""
        expected_lower = str(expected_val).strip().lower()
        if user_val == expected_lower:
            feedback_parts.append(f"'{key}': corect.")
        else:
            all_correct = False
            feedback_parts.append(f"'{key}': mai incearca.")

    if all_correct and answers:
        # Award small XP for correct answers
        user.xp_total += settings.XP_PER_CORRECT_ANSWER
        await _award_xp(user, settings.XP_PER_CORRECT_ANSWER, db)

    return CheckAnswerResponse(
        correct=all_correct,
        hint=practice.get("hint") if not all_correct else None,
        feedback=" ".join(feedback_parts) if feedback_parts else None,
    )
