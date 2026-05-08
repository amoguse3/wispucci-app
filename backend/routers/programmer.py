"""
Programmer profile router — interactive analysis of what a learner has done.

Returns aggregated, programming-only stats so the user can see:
- modules and lessons completed
- top algorithms / concepts they've actually been exposed to (from
  lesson.practice.key_terms across completed lessons)
- a strength score and where they sit relative to peers
- an AI-suggested "next, more advanced" topic based on the most recent module

Subject-agnostic in spirit (the schema works for any subject) but currently
filtered to `Programare` since that's the active focus. The same shape can be
reused for "Linguist profile", "Math profile" later by changing the subject
filter on the SQL queries.
"""
from __future__ import annotations

import json
from collections import Counter
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func as sqlfunc, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth_utils import get_current_user
from backend.database import get_db
from backend.models import Lesson, Module, User, UserProgress
from backend.tutor_skills import _call_ai

router = APIRouter()


SUBJECT = "Programare"

# Strength formula tuned so a fresh user gets 0 and a moderately active user
# (a finished module + a few concepts mastered) hits the "intermediar" tier.
# We intentionally keep the math transparent so the UI can explain it later.
def _strength_score(lessons_done: int, modules_done: int, concepts: int, xp: int) -> int:
    return int(lessons_done * 6 + modules_done * 12 + concepts * 2 + xp * 0.05)


def _strength_tier(score: int) -> str:
    if score < 25:
        return "începător"
    if score < 80:
        return "intermediar"
    if score < 200:
        return "avansat"
    return "expert"


def _highest_completed_level(rows: list[tuple[int, int, int]]) -> int:
    """rows: list of (level, total_lessons, completed_lessons) per module."""
    best = 0
    for level, total, done in rows:
        if total and done >= total:
            best = max(best, int(level or 0))
    return best


@router.get("/me/programmer-profile")
async def get_programmer_profile(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Aggregated programming-only profile. Cheap: 3 SQL queries + an in-memory
    Counter over the user's completed lessons.
    """
    # All Programare modules the user has at least one progress row in.
    progress_q = await db.execute(
        select(UserProgress, Lesson, Module)
        .join(Lesson, Lesson.id == UserProgress.lesson_id)
        .join(Module, Module.id == Lesson.module_id)
        .where(
            UserProgress.user_id == user.id,
            Module.subject == SUBJECT,
        )
    )
    rows = progress_q.all()

    completed_lessons: list[tuple[Lesson, Module]] = []
    started_lessons: list[tuple[Lesson, Module]] = []
    for progress, lesson, module in rows:
        started_lessons.append((lesson, module))
        if progress.progress_pct >= 100 or progress.completed_at is not None:
            completed_lessons.append((lesson, module))

    # Lessons / modules completed.
    lessons_done = len(completed_lessons)
    modules_started = {m.id: m for _, m in started_lessons}

    # Total lessons per Programare module the user has touched, so we can
    # tell how many modules they actually finished.
    module_totals: dict[str, int] = {}
    if modules_started:
        totals_q = await db.execute(
            select(Lesson.module_id, sqlfunc.count(Lesson.id))
            .where(Lesson.module_id.in_(list(modules_started.keys())))
            .group_by(Lesson.module_id)
        )
        module_totals = {mid: int(c) for mid, c in totals_q.all()}

    completed_per_module: Counter[str] = Counter(m.id for _, m in completed_lessons)
    modules_done = sum(
        1 for mid, total in module_totals.items()
        if total and completed_per_module.get(mid, 0) >= total
    )

    # Algorithm / concept tally from key_terms across completed lessons.
    term_counter: Counter[str] = Counter()
    for lesson, _ in completed_lessons:
        practice = lesson.practice or {}
        if not isinstance(practice, dict):
            continue
        terms = practice.get("key_terms") or []
        if not isinstance(terms, list):
            continue
        for raw in terms:
            if not isinstance(raw, str):
                continue
            label = raw.strip()
            if not label:
                continue
            term_counter[label[:48]] += 1

    top_algorithms = [
        {"label": label, "count": count}
        for label, count in term_counter.most_common(8)
    ]
    concepts_total = len(term_counter)

    # Highest level the user has fully completed (0..3).
    level_rows: list[tuple[int, int, int]] = []
    for mid, mod in modules_started.items():
        level_rows.append(
            (int(mod.level or 0), module_totals.get(mid, 0), completed_per_module.get(mid, 0))
        )
    highest_level = _highest_completed_level(level_rows)

    # Peer comparison: among users with at least 1 Programare lesson started,
    # compute the user's percentile on xp_total. Single SQL query: count of
    # programming users with xp <= mine and the total programming-user count.
    peer_subq = (
        select(UserProgress.user_id)
        .join(Lesson, Lesson.id == UserProgress.lesson_id)
        .join(Module, Module.id == Lesson.module_id)
        .where(Module.subject == SUBJECT)
        .group_by(UserProgress.user_id)
    ).subquery()

    total_peers_row = await db.execute(
        select(sqlfunc.count(sqlfunc.distinct(peer_subq.c.user_id)))
    )
    total_peers = int(total_peers_row.scalar() or 0)

    if total_peers > 0:
        below_q = await db.execute(
            select(sqlfunc.count(sqlfunc.distinct(User.id)))
            .where(
                User.id.in_(select(peer_subq.c.user_id)),
                User.xp_total <= user.xp_total,
            )
        )
        peers_at_or_below = int(below_q.scalar() or 0)
        # Pct of peers I'm at-or-above (0..100).
        percentile = int(round((peers_at_or_below / total_peers) * 100))
    else:
        peers_at_or_below = 0
        percentile = 0

    # Pct who reached this user's highest_level.
    if highest_level > 0 and total_peers > 0:
        reached_q = await db.execute(
            select(sqlfunc.count(sqlfunc.distinct(UserProgress.user_id)))
            .join(Lesson, Lesson.id == UserProgress.lesson_id)
            .join(Module, Module.id == Lesson.module_id)
            .where(
                Module.subject == SUBJECT,
                Module.level >= highest_level,
                UserProgress.progress_pct >= 100,
            )
        )
        reached_count = int(reached_q.scalar() or 0)
        reached_pct = int(round((reached_count / max(1, total_peers)) * 100))
    else:
        reached_count = 0
        reached_pct = 0

    strength = _strength_score(lessons_done, modules_done, concepts_total, user.xp_total)

    # Latest module the user has progressed in (used by next-suggestion as a default).
    latest_module: Optional[Module] = None
    latest_started_at = None
    for progress, _, module in rows:
        ts = progress.last_seen_at
        if ts is not None and (latest_started_at is None or ts > latest_started_at):
            latest_started_at = ts
            latest_module = module

    return {
        "subject": SUBJECT,
        "lessons_completed": lessons_done,
        "lessons_started": len(started_lessons),
        "modules_completed": modules_done,
        "modules_started": len(modules_started),
        "concepts_total": concepts_total,
        "top_algorithms": top_algorithms,
        "current_level": highest_level,
        "strength": {
            "score": strength,
            "tier": _strength_tier(strength),
        },
        "peers": {
            "total": total_peers,
            "at_or_below": peers_at_or_below,
            "percentile": percentile,
            "reached_current_level": reached_count,
            "reached_current_level_pct": reached_pct,
        },
        "latest_module": (
            {
                "id": latest_module.id,
                "title": latest_module.title,
                "topic": latest_module.topic,
                "level": int(latest_module.level or 0),
            }
            if latest_module is not None else None
        ),
    }


# ─── Next-course suggestion ──────────────────────────────
# Cheap one-shot prompt (~150 in / ~120 out tokens). Used by the celebrate
# overlay after a module is finished to nudge the user toward something
# more advanced without breaking the flow.

_NEXT_SUGGESTION_SYSTEM = (
    "Ești Wispucci. Userul tocmai a terminat un curs. Recomanzi UN SINGUR "
    "topic mai avansat care construiește pe ce a învățat. Output STRICT JSON: "
    '{"topic":"...","level":2,"why":"...","skill":"..."}.\n'
    "topic: titlu scurt (max 56 char), începe cu un verb dacă se poate.\n"
    "level: 1=începător, 2=mediu, 3=avansat. Alege cu 1 mai sus decât cursul "
    "curent (max 3).\n"
    "why: 1 propoziție (max 18 cuvinte) care leagă topicul nou de ce-a învățat.\n"
    "skill: 1-3 cuvinte despre ce va putea face nou.\n"
    "DOAR JSON, fără text în plus, fără triple backticks."
)


def _fallback_suggestion(module: Module) -> dict:
    """Static-but-useful suggestion when AI call fails."""
    next_level = min(3, int(module.level or 1) + 1)
    return {
        "topic": f"{module.topic} — pas avansat",
        "level": next_level,
        "why": f"Construiești peste {module.topic}, dar cu mai multă profunzime.",
        "skill": "aplicație concretă",
    }


@router.get("/me/programmer-profile/next-suggestion")
async def next_suggestion(
    module_id: Optional[str] = Query(None, description="Module the user just finished. Defaults to most recent."),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Suggest a more advanced topic that builds on what the user just learned.
    Token-cheap: a single ~270-token DeepSeek call (~$0.0001).
    """
    module: Optional[Module] = None
    if module_id:
        module = (
            await db.execute(select(Module).where(Module.id == module_id))
        ).scalar_one_or_none()
        if module is None:
            raise HTTPException(404, "Module not found")
    else:
        # Default to the user's most recently progressed Programare module.
        latest_q = await db.execute(
            select(Module)
            .join(Lesson, Lesson.module_id == Module.id)
            .join(UserProgress, UserProgress.lesson_id == Lesson.id)
            .where(
                UserProgress.user_id == user.id,
                Module.subject == SUBJECT,
            )
            .order_by(desc(UserProgress.last_seen_at))
            .limit(1)
        )
        module = latest_q.scalars().first()
        if module is None:
            raise HTTPException(404, "No completed module to base a suggestion on")

    user_prompt = (
        f"Subject:{module.subject}\n"
        f"Topic curent:{module.topic}\n"
        f"Nivel curent:{int(module.level or 1)}\n"
        f"Userul a terminat un curs pe acest topic. Recomandă pasul următor."
    )

    suggestion: dict
    try:
        raw = await _call_ai(
            _NEXT_SUGGESTION_SYSTEM,
            user_prompt,
            json_mode=True,
            max_tokens=200,
        )
        parsed = json.loads(raw) if raw else {}
        if not isinstance(parsed, dict):
            parsed = {}
        topic = str(parsed.get("topic") or "").strip()
        if not topic:
            raise ValueError("empty topic")
        level = int(parsed.get("level") or (int(module.level or 1) + 1))
        level = max(1, min(3, level))
        suggestion = {
            "topic": topic[:80],
            "level": level,
            "why": str(parsed.get("why") or "").strip()[:240]
                or f"E pasul natural după {module.topic}.",
            "skill": str(parsed.get("skill") or "").strip()[:60]
                or "aplicație concretă",
        }
    except Exception:
        suggestion = _fallback_suggestion(module)

    return {
        "from": {
            "module_id": module.id,
            "topic": module.topic,
            "level": int(module.level or 0),
            "subject": module.subject,
        },
        "suggestion": suggestion,
    }
