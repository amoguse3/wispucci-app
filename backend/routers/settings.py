"""
Settings router — user preferences (tone, pace, focus mode, etc.)
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth_utils import get_current_user
from backend.database import get_db
from backend.models import User
from backend.schemas import OkResponse, UserSettingsResponse, UserSettingsUpdate

router = APIRouter()

DEFAULT_SETTINGS = {
    "forceFocus": False,
    "silent": False,
    "tone": "cald",
    "pace": "normal",
    "embersIntensity": 60,
}


@router.get("/settings", response_model=UserSettingsResponse)
async def get_settings(user: User = Depends(get_current_user)):
    """Return user settings object."""
    s = user.settings or DEFAULT_SETTINGS
    # Merge with defaults so new keys always exist
    merged = {**DEFAULT_SETTINGS, **s}
    return UserSettingsResponse(settings=merged)


@router.put("/settings", response_model=UserSettingsResponse)
async def update_settings(
    body: UserSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update user settings — partial merge."""
    current = dict(user.settings or {})
    merged = {**DEFAULT_SETTINGS, **current}

    updates = body.model_dump(exclude_none=True)
    merged.update(updates)

    user.settings = merged
    await db.flush()

    return UserSettingsResponse(settings=merged)


@router.delete("/data", response_model=OkResponse)
async def reset_user_data(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Reset demo data: clear progress, vocab, conversations, events.
    Keep account but reset stats.
    """
    from sqlalchemy import delete as sqldel
    from backend.models import (
        Event,
        TutorConversation,
        TutorMessage,
        UserProgress,
        VocabWord,
        XpDaily,
    )

    uid = user.id

    # Delete all user-owned data
    for model in [UserProgress, VocabWord, TutorMessage, TutorConversation, Event, XpDaily]:
        await db.execute(sqldel(model).where(model.user_id == uid))

    # Reset stats
    user.streak_days = 0
    user.longest_streak = 0
    user.last_streak_day = None
    user.xp_total = 0
    user.settings = DEFAULT_SETTINGS

    await db.flush()
    return OkResponse()
