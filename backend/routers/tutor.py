"""
AI Tutor router — powered by tutor_skills module.
Token-optimised, cached, structured. SSE streaming where needed.
"""
import json
import time
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth_utils import get_current_user
from backend.config import settings as cfg
from backend.database import get_db
from backend.models import (
    Lesson,
    Module,
    TutorConversation,
    TutorMessage,
    User,
)
from backend.schemas import (
    TutorBuildLessonRequest,
    TutorExplainRequest,
)
from backend.tutor_skills import (
    check_answer as skill_check_answer,
    generate_course,
    generate_course_outline,
    generate_exercises,
    generate_explanation,
    generate_lesson_content,
    generate_mini_test,
    generate_minigame,
    stream_explanation,
)

router = APIRouter()

# Rate-limiter
_tutor_rate_map: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(user_id: str) -> None:
    now = time.time()
    window = 3600
    slots = _tutor_rate_map[user_id]
    slots[:] = [t for t in slots if now - t < window]
    if len(slots) >= cfg.TUTOR_RATE_LIMIT_PER_HOUR:
        raise HTTPException(status_code=429, detail="Prea multe cereri. Încearcă mai târziu.")
    slots.append(now)


# ─── POST /api/tutor/explain ─────────────────────────────


@router.post("/explain")
async def explain(
    body: TutorExplainRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Stream an AI explanation for selected text via SSE."""
    _check_rate_limit(user.id)

    lesson_title = ""
    if body.lesson_id:
        result = await db.execute(select(Lesson).where(Lesson.id == body.lesson_id))
        lesson = result.scalar_one_or_none()
        if lesson:
            lesson_title = lesson.title

    # Create or reuse conversation
    conversation = None
    if body.conversation_id:
        result = await db.execute(
            select(TutorConversation).where(
                TutorConversation.id == body.conversation_id,
                TutorConversation.user_id == user.id,
            )
        )
        conversation = result.scalar_one_or_none()

    if not conversation:
        conversation = TutorConversation(
            user_id=user.id,
            lesson_id=body.lesson_id or None,
        )
        db.add(conversation)
        await db.flush()

    # Save user message
    user_msg = TutorMessage(
        conversation_id=conversation.id,
        role="user",
        content=body.selected_text,
        mode=body.mode,
        selected_text=body.selected_text,
    )
    db.add(user_msg)
    await db.flush()

    async def event_stream():
        # Buffer tokens into chunks of ~8 chars for smoother streaming
        buffer = ""
        full_text = ""
        async for token in stream_explanation(
            body.selected_text, body.mode, lesson_title, use_cache=True
        ):
            buffer += token
            full_text += token
            if len(buffer) >= 8:
                yield f"data: {json.dumps({'event': 'token', 'data': buffer})}\n\n"
                buffer = ""
        if buffer:
            yield f"data: {json.dumps({'event': 'token', 'data': buffer})}\n\n"
        yield f"data: {json.dumps({'event': 'done', 'data': {'conversation_id': conversation.id, 'full_text': full_text}})}\n\n"
        yield "data: [DONE]\n\n"

        # Save assistant message after streaming
        if full_text:
            m = TutorMessage(
                conversation_id=conversation.id,
                role="assistant",
                content=full_text,
                mode=body.mode,
                selected_text=body.selected_text,
            )
            db.add(m)
            await db.flush()

    return StreamingResponse(
        event_stream(),
        media_type="text/plain",
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
        },
    )


# ─── POST /api/tutor/lesson/build ────────────────────────


@router.post("/lesson/build")
async def build_lesson(
    body: TutorBuildLessonRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate a full module with lessons + exercises from a topic."""
    _check_rate_limit(user.id)

    # Use the tone preset from the user's settings (cald|prieten|profi).
    user_tone = "cald"
    try:
        if isinstance(user.settings, dict):
            user_tone = str(user.settings.get("tone") or "cald")
    except Exception:
        user_tone = "cald"

    result = await generate_course(
        subject=body.subject,
        topic=body.topic,
        level=body.level,
        lesson_count=4,
        tone=user_tone,
    )

    # Find next module index
    from sqlalchemy import func as sqlfunc
    r = await db.execute(
        select(sqlfunc.max(Module.index)).where(
            Module.subject == body.subject,
            Module.topic == body.topic,
            Module.level == body.level,
        )
    )
    max_idx = r.scalar() or 0
    next_idx = max_idx + 1

    # Create module
    module = Module(
        subject=body.subject,
        topic=body.topic,
        level=body.level,
        index=next_idx,
        title=result.get("title", f"{body.topic}"),
        summary=result.get("title", "")[:256],
        estimated_minutes=body.level * 5 + 10,
    )
    db.add(module)
    await db.flush()

    # Create lessons with exercises + optional mini-game per lesson
    lessons_out = []
    for i, les_data in enumerate(result.get("lessons", [])):
        body_text = les_data.get("body", "")
        exercises_raw = les_data.get("exercises", [])
        mini_game = les_data.get("mini_game") or None
        key_terms = les_data.get("key_terms") or []
        hook = les_data.get("hook") or ""

        lesson = Lesson(
            module_id=module.id,
            index=i + 1,
            title=les_data.get("title", f"Lecția {i + 1}"),
            body=body_text,
            practice={
                "type": "mixed",
                "hook": hook,
                "key_terms": key_terms,
                "exercises": exercises_raw,
                "mini_game": mini_game,
            },
        )
        db.add(lesson)
        await db.flush()

        lessons_out.append({
            "id": lesson.id,
            "index": lesson.index,
            "title": lesson.title,
            "exercises_count": len(exercises_raw),
            "has_mini_game": mini_game is not None,
        })

    await db.flush()

    return {
        "module_id": module.id,
        "title": module.title,
        "level": module.level,
        "lessons": lessons_out,
    }


# ─── POST /api/tutor/course/outline ──────────────────────
# Two-pass generation: STEP 1 — outline only.
# Generates module title + lesson titles + tags. Cheap (~250 out tokens,
# ~2-3s wall clock). Returns DB-backed lesson IDs the frontend can
# reference for the per-lesson generation step.


@router.post("/course/outline")
async def build_course_outline(
    body: TutorBuildLessonRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Fast first pass: returns module + empty lesson stubs (titles only)."""
    _check_rate_limit(user.id)

    user_tone = "cald"
    try:
        if isinstance(user.settings, dict):
            user_tone = str(user.settings.get("tone") or "cald")
    except Exception:
        user_tone = "cald"

    outline = await generate_course_outline(
        subject=body.subject,
        topic=body.topic,
        level=body.level,
        lesson_count=4,
        tone=user_tone,
    )

    from sqlalchemy import func as sqlfunc
    r = await db.execute(
        select(sqlfunc.max(Module.index)).where(
            Module.subject == body.subject,
            Module.topic == body.topic,
            Module.level == body.level,
        )
    )
    max_idx = r.scalar() or 0
    next_idx = max_idx + 1

    module = Module(
        subject=body.subject,
        topic=body.topic,
        level=body.level,
        index=next_idx,
        title=outline.get("title", body.topic),
        summary=outline.get("title", "")[:256],
        estimated_minutes=body.level * 5 + 10,
    )
    db.add(module)
    await db.flush()

    lesson_stubs = []
    for i, les in enumerate(outline.get("lessons", [])):
        lesson = Lesson(
            module_id=module.id,
            index=i + 1,
            title=les.get("title", f"Lecția {i + 1}"),
            body=None,
            practice={
                "type": "outline",
                "subject": les.get("subject", ""),
                "tags": les.get("tags", []),
                "minutes": les.get("minutes", 5),
            },
        )
        db.add(lesson)
        await db.flush()
        lesson_stubs.append({
            "id": lesson.id,
            "index": lesson.index,
            "title": lesson.title,
            "subject": les.get("subject", ""),
            "tags": les.get("tags", []),
            "minutes": les.get("minutes", 5),
            "ready": False,
        })

    await db.flush()

    return {
        "module_id": module.id,
        "title": module.title,
        "level": module.level,
        "subject": body.subject,
        "topic": body.topic,
        "lessons": lesson_stubs,
    }


# ─── POST /api/tutor/lesson/{lesson_id}/generate ─────────
# Two-pass generation: STEP 2 — fill in body + exercises + mini_game
# for ONE specific lesson. Idempotent: if the lesson already has a body
# the cached version is returned without burning more tokens.


@router.post("/lesson/{lesson_id}/generate")
async def generate_lesson(
    lesson_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Fill in a previously-stubbed lesson with full content."""
    lesson = (
        await db.execute(select(Lesson).where(Lesson.id == lesson_id))
    ).scalar_one_or_none()
    if not lesson:
        raise HTTPException(404, "Lesson not found")

    # Already generated → return cached.
    if lesson.body and (lesson.practice or {}).get("type") != "outline":
        return {
            "id": lesson.id,
            "index": lesson.index,
            "title": lesson.title,
            "body": lesson.body,
            "practice": lesson.practice,
            "cached": True,
        }

    _check_rate_limit(user.id)

    module = (
        await db.execute(select(Module).where(Module.id == lesson.module_id))
    ).scalar_one_or_none()
    if not module:
        raise HTTPException(404, "Module not found")

    # Find total lessons in module so we can tell the model
    # 'lesson 2 of 4' and get appropriate scaffolding.
    total_rows = await db.execute(select(Lesson).where(Lesson.module_id == module.id))
    total_lessons = len(total_rows.scalars().all()) or 1

    user_tone = "cald"
    try:
        if isinstance(user.settings, dict):
            user_tone = str(user.settings.get("tone") or "cald")
    except Exception:
        user_tone = "cald"

    outline_subject = ""
    outline_practice = lesson.practice or {}
    if isinstance(outline_practice, dict):
        outline_subject = str(outline_practice.get("subject") or "")

    # Mini-games on lesson 1 and last lesson — peak-end + first-impression.
    include_game = lesson.index in (1, total_lessons)

    content = await generate_lesson_content(
        subject=module.subject,
        topic=module.topic,
        level=module.level,
        lesson_title=lesson.title,
        lesson_subject=outline_subject or lesson.title,
        position=lesson.index,
        total=total_lessons,
        tone=user_tone,
        include_mini_game=include_game,
    )

    lesson.body = content.get("body", "")
    lesson.practice = {
        "type": "mixed",
        "hook": content.get("hook", ""),
        "key_terms": content.get("key_terms", []),
        "exercises": content.get("exercises", []),
        "mini_game": content.get("mini_game"),
        "subject": outline_subject,
    }
    db.add(lesson)
    await db.flush()

    return {
        "id": lesson.id,
        "index": lesson.index,
        "title": lesson.title,
        "body": lesson.body,
        "practice": lesson.practice,
        "cached": False,
    }


# ─── POST /api/tutor/test/build — mini-test every N lessons ──


@router.post("/test/build")
async def build_mini_test(
    module_id: str = Query(..., description="Module ID"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate a 5-question mixed mini-test from the most recent lessons in a module."""
    _check_rate_limit(user.id)

    module_row = (
        await db.execute(select(Module).where(Module.id == module_id))
    ).scalar_one_or_none()
    if not module_row:
        raise HTTPException(404, "Module not found")

    lesson_rows = (
        await db.execute(
            select(Lesson)
            .where(Lesson.module_id == module_id)
            .order_by(Lesson.index)
        )
    ).scalars().all()
    titles = [l.title for l in lesson_rows]

    user_tone = "cald"
    try:
        if isinstance(user.settings, dict):
            user_tone = str(user.settings.get("tone") or "cald")
    except Exception:
        user_tone = "cald"

    test = await generate_mini_test(
        subject=module_row.subject,
        topic=module_row.topic,
        recent_lesson_titles=titles,
        tone=user_tone,
    )

    return {
        "module_id": module_id,
        "title": test.get("title"),
        "questions": test.get("questions", []),
    }


# ─── POST /api/tutor/minigame ────────────────────────────


@router.post("/minigame")
async def build_minigame(
    lesson_id: str = Query(..., description="Lesson ID"),
    game_type: str = Query("auto", description="bug_hunter | code_assemble | output_predict | word_match | auto"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate a single mini-game tied to a lesson."""
    _check_rate_limit(user.id)

    lesson_row = (
        await db.execute(select(Lesson).where(Lesson.id == lesson_id))
    ).scalar_one_or_none()
    if not lesson_row:
        raise HTTPException(404, "Lesson not found")

    module_row = (
        await db.execute(select(Module).where(Module.id == lesson_row.module_id))
    ).scalar_one_or_none()
    if not module_row:
        raise HTTPException(404, "Module not found")

    user_tone = "cald"
    try:
        if isinstance(user.settings, dict):
            user_tone = str(user.settings.get("tone") or "cald")
    except Exception:
        user_tone = "cald"

    game = await generate_minigame(
        subject=module_row.subject,
        topic=module_row.topic,
        lesson_title=lesson_row.title,
        game_type=game_type,
        tone=user_tone,
    )
    return game


# ─── POST /api/tutor/exercises ───────────────────────────


@router.post("/exercises")
async def create_exercises(
    topic: str = Query(..., description="Topic name, e.g. 'Funcții cu parametri'"),
    level: int = Query(2, ge=0, le=3),
    focus: str = Query("", description="Specific area to focus on"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate 3-5 exercises for a topic. Returns structured exercise objects."""
    _check_rate_limit(user.id)

    exercises = await generate_exercises(topic=topic, level=level, focus=focus)

    return {
        "topic": topic,
        "level": level,
        "exercises": exercises,
    }


# ─── POST /api/tutor/check ───────────────────────────────


@router.post("/check")
async def check_exercise_answer(
    exercise_prompt: str = Query(..., description="The exercise question/prompt"),
    expected: str = Query(..., description="Expected correct answer"),
    answer: str = Query(..., description="User's answer"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """AI-evaluated answer check. Semantic matching, not exact string compare."""
    _check_rate_limit(user.id)

    result = await skill_check_answer(
        exercise_prompt=exercise_prompt,
        expected=expected,
        user_answer=answer,
    )

    return {
        "correct": result.get("correct", False),
        "feedback": result.get("feedback", ""),
        "hint": result.get("hint"),
    }
