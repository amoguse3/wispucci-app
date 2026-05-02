"""
Leaderboard router — weekly + all-time XP rankings.

Privacy: returns `display_name` (user.name or first letter + "user_<short_id>")
instead of email. Users with empty `name` get a generated handle.
"""
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func as sqlfunc, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth_utils import get_current_user
from backend.database import get_db
from backend.models import User, XpDaily

router = APIRouter()


def _display_name(user: User) -> str:
    """Pick a privacy-safe handle. Never returns email."""
    if user.name and user.name.strip():
        return user.name.strip()
    return f"user_{user.id[:6]}"


@router.get("/leaderboard/weekly")
async def leaderboard_weekly(
    limit: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """
    Top users by XP earned this week (Mon–Sun, server timezone).
    Always returns the requester's row, even if outside the top.
    """
    today = datetime.now(timezone.utc).date()
    week_start = today - timedelta(days=today.weekday())

    # Sum XP per user in the current week.
    weekly_xp_subq = (
        select(
            XpDaily.user_id.label("uid"),
            sqlfunc.coalesce(sqlfunc.sum(XpDaily.xp), 0).label("week_xp"),
        )
        .where(XpDaily.day >= week_start, XpDaily.day <= today)
        .group_by(XpDaily.user_id)
        .subquery()
    )

    # Top N joined with user info.
    top_stmt = (
        select(User, weekly_xp_subq.c.week_xp)
        .join(weekly_xp_subq, weekly_xp_subq.c.uid == User.id)
        .order_by(desc(weekly_xp_subq.c.week_xp))
        .limit(limit)
    )
    top_rows = (await db.execute(top_stmt)).all()

    # Compute the requester's rank with a window function so the DB
    # returns 1 row instead of streaming every ranked user into memory.
    ranked_subq = (
        select(
            weekly_xp_subq.c.uid.label("uid"),
            weekly_xp_subq.c.week_xp.label("week_xp"),
            sqlfunc.row_number()
            .over(order_by=desc(weekly_xp_subq.c.week_xp))
            .label("rank"),
        )
    ).subquery()

    me_row = (
        await db.execute(
            select(ranked_subq.c.rank, ranked_subq.c.week_xp)
            .where(ranked_subq.c.uid == me.id)
        )
    ).first()

    me_rank: Optional[int] = int(me_row.rank) if me_row else None
    me_xp: int = int(me_row.week_xp) if me_row else 0

    return {
        "period": "weekly",
        "week_start": week_start.isoformat(),
        "top": [
            {
                "rank": i + 1,
                "user_id": user.id,
                "display_name": _display_name(user),
                "xp": int(week_xp),
                "streak_days": user.streak_days,
                "is_me": user.id == me.id,
            }
            for i, (user, week_xp) in enumerate(top_rows)
        ],
        "me": {
            "rank": me_rank,
            "user_id": me.id,
            "display_name": _display_name(me),
            "xp": me_xp,
            "streak_days": me.streak_days,
            "in_top": me_rank is not None and me_rank <= limit,
        },
    }


@router.get("/leaderboard/all-time")
async def leaderboard_all_time(
    limit: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """All-time XP leaderboard (uses users.xp_total)."""
    top_stmt = (
        select(User)
        .where(User.xp_total > 0)
        .order_by(desc(User.xp_total))
        .limit(limit)
    )
    top_rows = (await db.execute(top_stmt)).scalars().all()

    # Window function for requester rank — single-row fetch.
    ranked_subq = (
        select(
            User.id.label("uid"),
            sqlfunc.row_number()
            .over(order_by=desc(User.xp_total))
            .label("rank"),
        )
        .where(User.xp_total > 0)
    ).subquery()

    me_row = (
        await db.execute(
            select(ranked_subq.c.rank).where(ranked_subq.c.uid == me.id)
        )
    ).first()

    me_rank: Optional[int] = int(me_row.rank) if me_row else None

    return {
        "period": "all-time",
        "top": [
            {
                "rank": i + 1,
                "user_id": user.id,
                "display_name": _display_name(user),
                "xp": user.xp_total,
                "streak_days": user.streak_days,
                "longest_streak": user.longest_streak,
                "is_me": user.id == me.id,
            }
            for i, user in enumerate(top_rows)
        ],
        "me": {
            "rank": me_rank,
            "user_id": me.id,
            "display_name": _display_name(me),
            "xp": me.xp_total,
            "streak_days": me.streak_days,
            "longest_streak": me.longest_streak,
            "in_top": me_rank is not None and me_rank <= limit,
        },
    }
