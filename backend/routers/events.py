"""
Events router — analytics telemetry endpoint.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth_utils import get_current_user
from backend.database import get_db
from backend.models import Event, User
from backend.schemas import EventCreate, OkResponse

router = APIRouter()


@router.post("/events", response_model=OkResponse)
async def track_event(
    body: EventCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Record a user event for analytics."""
    event = Event(
        user_id=user.id,
        type=body.type,
        payload=body.payload,
    )
    db.add(event)
    await db.flush()
    return OkResponse()
