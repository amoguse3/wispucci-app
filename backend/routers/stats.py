"""
Unified Statistica endpoint — single fetch returns everything the
Statistica page renders: streak, XP, mastered concepts, recent activity,
mastery breakdown by subject, plus a 56-day heatmap.

Replaces the old "Vocabular" page on the frontend.
"""
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth_utils import get_current_user
from backend.database import get_db
from backend.models import (
    Lesson,
    Module,
    User,
    UserProgress,
    VocabWord,
    XpDaily,
)

router = APIRouter()


# Heatmap window — last 8 weeks (Sun–Sat in many UIs; here Mon–Sun).
HEATMAP_DAYS = 56


@router.get("/me/stats")
async def get_user_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Return the entire Statistica page payload in a single call.
    Subject-agnostic: the same shape works for programming, language, math.
    """
    # Use UTC consistently — server-local `date.today()` would race with
    # timezone-aware `added_at` / `last_seen_at` columns near midnight.
    today = datetime.now(timezone.utc).date()

    # ─── XP heatmap (last 56 days) ────────────────────────
    start_day = today - timedelta(days=HEATMAP_DAYS - 1)
    xp_rows = (
        await db.execute(
            select(XpDaily).where(
                XpDaily.user_id == user.id,
                XpDaily.day >= start_day,
                XpDaily.day <= today,
            )
        )
    ).scalars().all()
    xp_by_day = {r.day: r.xp for r in xp_rows}
    heatmap = []
    for i in range(HEATMAP_DAYS):
        d = start_day + timedelta(days=i)
        heatmap.append({"day": d.isoformat(), "xp": xp_by_day.get(d, 0)})

    # ─── Mastered concepts (formerly "Vocabular") ─────────
    # Treat the existing VocabWord rows as a generic "mastered concepts"
    # store: subject doesn't matter, only the tag.
    word_rows = (
        await db.execute(
            select(VocabWord).where(VocabWord.user_id == user.id)
        )
    ).scalars().all()

    by_tag = Counter(w.tag for w in word_rows)
    mastered_total = len(word_rows)
    new_today = sum(
        1 for w in word_rows
        if w.added_at and w.added_at.astimezone(timezone.utc).date() == today
    )

    recent_concepts = [
        {
            "id": w.id,
            "label": w.word,
            "definition": w.definition,
            "code_example": w.code_example,
            "tag": w.tag,
            "source_lesson_id": w.source_lesson_id,
            "added_at": w.added_at.isoformat() if w.added_at else None,
        }
        for w in sorted(
            word_rows,
            key=lambda x: x.added_at or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )[:24]
    ]

    # ─── Lesson progress + mastery per subject ────────────
    progress_rows = (
        await db.execute(
            select(UserProgress, Lesson, Module)
            .join(Lesson, Lesson.id == UserProgress.lesson_id)
            .join(Module, Module.id == Lesson.module_id)
            .where(UserProgress.user_id == user.id)
        )
    ).all()

    by_subject: dict[str, dict[str, int]] = {}
    for prog, _lesson, module in progress_rows:
        bucket = by_subject.setdefault(
            module.subject,
            {"started": 0, "completed": 0, "in_progress": 0},
        )
        bucket["started"] += 1
        if prog.progress_pct >= 100:
            bucket["completed"] += 1
        else:
            bucket["in_progress"] += 1

    subject_breakdown = [
        {"subject": k, **v}
        for k, v in sorted(by_subject.items(), key=lambda kv: -kv[1]["completed"])
    ]

    # ─── Recent activity (last 8 completed/in-progress lessons) ─
    recent_activity = []
    for prog, lesson, module in sorted(
        progress_rows,
        key=lambda t: t[0].last_seen_at or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )[:8]:
        recent_activity.append({
            "lesson_id": lesson.id,
            "lesson_title": lesson.title,
            "module_title": module.title,
            "subject": module.subject,
            "progress_pct": prog.progress_pct,
            "completed": prog.progress_pct >= 100,
            "last_seen_at": prog.last_seen_at.isoformat() if prog.last_seen_at else None,
        })

    # ─── Today / week XP ──────────────────────────────────
    week_start = today - timedelta(days=today.weekday())
    xp_today = sum(r.xp for r in xp_rows if r.day == today)
    xp_week = sum(r.xp for r in xp_rows if r.day >= week_start)

    return {
        "user": {
            "id": user.id,
            "display_name": (user.name or "").strip() or f"user_{user.id[:6]}",
            "current_subject": user.current_subject,
            "current_topic": user.current_topic,
            "current_level": user.current_level,
        },
        "streak": {
            "current": user.streak_days,
            "longest": user.longest_streak,
            "last_day": user.last_streak_day.isoformat() if user.last_streak_day else None,
        },
        "xp": {
            "today": xp_today,
            "week": xp_week,
            "total": user.xp_total,
        },
        "mastered": {
            "total": mastered_total,
            "by_tag": {tag: by_tag.get(tag, 0) for tag in ("new", "review", "known")},
            "new_today": new_today,
            "recent": recent_concepts,
        },
        "lessons": {
            "by_subject": subject_breakdown,
            "recent": recent_activity,
        },
        "heatmap": heatmap,
    }
