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
    generate_exercises,
    generate_explanation,
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

    result = await generate_course(
        subject=body.subject,
        topic=body.topic,
        level=body.level,
        lesson_count=4,
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

    # Create lessons with exercises
    lessons_out = []
    for i, les_data in enumerate(result.get("lessons", [])):
        body_text = les_data.get("body", "")
        exercises_raw = les_data.get("exercises", [])

        lesson = Lesson(
            module_id=module.id,
            index=i + 1,
            title=les_data.get("title", f"Lecția {i + 1}"),
            body=body_text,
            practice={
                "type": "mixed",
                "exercises": exercises_raw,
            },
        )
        db.add(lesson)
        await db.flush()

        lessons_out.append({
            "id": lesson.id,
            "index": lesson.index,
            "title": lesson.title,
            "exercises_count": len(exercises_raw),
        })

    await db.flush()

    return {
        "module_id": module.id,
        "title": module.title,
        "level": module.level,
        "lessons": lessons_out,
    }


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
