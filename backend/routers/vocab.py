"""
Vocabulary router — CRUD for user's saved words.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth_utils import get_current_user
from backend.database import get_db
from backend.models import User, VocabWord
from backend.schemas import (
    OkResponse,
    VocabWordCreate,
    VocabWordResponse,
    VocabWordUpdate,
)

router = APIRouter()


async def _get_word_or_404(word_id: str, user: User, db: AsyncSession) -> VocabWord:
    result = await db.execute(
        select(VocabWord).where(
            VocabWord.id == word_id,
            VocabWord.user_id == user.id,
        )
    )
    word = result.scalar_one_or_none()
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")
    return word


@router.get("", response_model=list[VocabWordResponse])
async def list_vocab(
    filter: str = Query("all", alias="filter", pattern="^(all|new|known|review)$"),
    q: str = Query("", description="Search query — matches word OR definition"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List user's vocabulary with optional filter and search."""
    stmt = select(VocabWord).where(VocabWord.user_id == user.id)

    if filter != "all":
        stmt = stmt.where(VocabWord.tag == filter)

    if q:
        search = f"%{q.lower()}%"
        stmt = stmt.where(
            (VocabWord.word.ilike(search)) | (VocabWord.definition.ilike(search))
        )

    stmt = stmt.order_by(VocabWord.added_at.desc())
    result = await db.execute(stmt)
    return [VocabWordResponse.model_validate(w) for w in result.scalars().all()]


@router.post("", response_model=VocabWordResponse, status_code=201)
async def create_vocab(
    body: VocabWordCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Save a new word to vocabulary."""
    word = VocabWord(
        user_id=user.id,
        word=body.word,
        definition=body.definition,
        source_lesson_id=body.source_lesson_id or None,
        code_example=body.code_example,
        tag=body.tag,
    )
    db.add(word)
    await db.flush()
    return VocabWordResponse.model_validate(word)


@router.patch("/{word_id}", response_model=VocabWordResponse)
async def update_vocab(
    word_id: str,
    body: VocabWordUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update a vocabulary word (tag, definition)."""
    word = await _get_word_or_404(word_id, user, db)

    if body.tag is not None:
        word.tag = body.tag
    if body.definition is not None:
        word.definition = body.definition

    await db.flush()
    return VocabWordResponse.model_validate(word)


@router.delete("/{word_id}", response_model=OkResponse)
async def delete_vocab(
    word_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a vocabulary word."""
    word = await _get_word_or_404(word_id, user, db)
    await db.delete(word)
    return OkResponse()
