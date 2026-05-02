"""
Streak & XP router — streak management, XP tracking, daily/weekly breakdown.
"""
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select, func as sqlfunc
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import APIRouter, Depends

from backend.auth_utils import get_current_user
from backend.config import settings as cfg
from backend.database import get_db
from backend.models import User, XpDaily
from backend.schemas import StreakResponse, XpWeekResponse

router = APIRouter()


# ─── Streak logic ────────────────────────────────────────


async def _extend_streak(user: User, db: AsyncSession) -> int:
    """
    Call whenever user completes a lesson.
    Returns the new streak value.
    """
    today = date.today()

    if user.last_streak_day is None:
        # First lesson ever
        user.last_streak_day = today
        user.streak_days = 1
        user.longest_streak = max(user.longest_streak, 1)
    elif user.last_streak_day == today:
        # Already did a lesson today; streak unchanged
        pass
    elif user.last_streak_day == today - timedelta(days=1):
        # Consecutive day
        user.last_streak_day = today
        user.streak_days += 1
        user.longest_streak = max(user.longest_streak, user.streak_days)
    else:
        # Streak broken
        user.last_streak_day = today
        user.streak_days = 1

    await db.flush()
    return user.streak_days


async def _award_xp(user: User, amount: int, db: AsyncSession) -> None:
    """Add XP to the daily tracking table."""
    today = date.today()

    result = await db.execute(
        select(XpDaily).where(
            XpDaily.user_id == user.id,
            XpDaily.day == today,
        )
    )
    daily = result.scalar_one_or_none()

    if daily:
        daily.xp += amount
    else:
        daily = XpDaily(user_id=user.id, day=today, xp=amount)
        db.add(daily)

    await db.flush()


# ─── Endpoints ───────────────────────────────────────────


@router.get("/streak", response_model=StreakResponse)
async def get_streak(user: User = Depends(get_current_user)):
    """Return current streak info."""
    return StreakResponse(
        streak_days=user.streak_days,
        longest_streak=user.longest_streak,
        last_streak_day=user.last_streak_day,
    )


@router.post("/streak/extend", response_model=StreakResponse)
async def extend_streak(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Manually extend streak. Usually called via /lessons/:id/complete instead."""
    await _extend_streak(user, db)
    return StreakResponse(
        streak_days=user.streak_days,
        longest_streak=user.longest_streak,
        last_streak_day=user.last_streak_day,
    )


@router.get("/xp/week", response_model=XpWeekResponse)
async def get_xp_week(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return XP breakdown: today, this week, and daily chart."""
    today = date.today()
    # Monday of current week
    week_start = today - timedelta(days=today.weekday())

    # Fetch this week's XP entries
    result = await db.execute(
        select(XpDaily).where(
            XpDaily.user_id == user.id,
            XpDaily.day >= week_start,
            XpDaily.day <= today,
        )
    )
    rows = result.scalars().all()

    # Today's XP
    xp_today = sum(r.xp for r in rows if r.day == today)

    # Week XP
    xp_week = sum(r.xp for r in rows)

    # By day breakdown
    by_day = [
        {
            "day": r.day.isoformat(),
            "xp": r.xp,
        }
        for r in sorted(rows, key=lambda x: x.day)
    ]

    return XpWeekResponse(
        xp_today=xp_today,
        xp_week=xp_week,
        xp_total=user.xp_total,
        by_day=by_day,
    )
