"""
Auth router — signup, login, logout, password reset.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth_utils import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from backend.database import get_db
from backend.models import User
from backend.schemas import (
    LoginRequest,
    OkResponse,
    SignUpRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter()


@router.post("/signup", response_model=TokenResponse, status_code=201)
async def signup(body: SignUpRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user. Returns JWT token."""
    # Check if email already taken
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        email=body.email,
        name=body.name.strip(),
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    await db.flush()

    token = create_access_token(user.id)

    return TokenResponse(
        token=token,
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate and return JWT token."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(user.id)

    return TokenResponse(
        token=token,
        user=UserResponse.model_validate(user),
    )


@router.post("/logout", response_model=OkResponse)
async def logout(user: User = Depends(get_current_user)):
    """Logout is client-side (discard token). Server endpoint for analytics."""
    return OkResponse()


@router.post("/forgot", response_model=OkResponse)
async def forgot_password(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Placeholder for password reset email flow.
    In v1 simply confirms the email exists (avoids leaking user enumeration).
    """
    # Don't reveal if user exists — always return ok
    return OkResponse()


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return UserResponse.model_validate(user)
