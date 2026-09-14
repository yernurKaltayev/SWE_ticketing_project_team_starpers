import logging
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    create_access_token,
    generate_opaque_token,
    hash_opaque_token,
    hash_password,
    verify_password,
)
from app.models.token import RefreshToken, TokenPurpose, VerificationToken
from app.models.user import User
from app.schemas.auth import RegisterRequest, TokenPair

logger = logging.getLogger(__name__)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _as_utc(value: datetime) -> datetime:
    """SQLite returns naive datetimes where PostgreSQL returns aware ones."""
    return value if value.tzinfo else value.replace(tzinfo=UTC)


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == normalize_email(email)))
    return result.scalar_one_or_none()


async def issue_verification_token(
    db: AsyncSession, user: User, purpose: TokenPurpose
) -> str:
    ttl = (
        timedelta(hours=settings.verification_token_ttl_hours)
        if purpose is TokenPurpose.email_verification
        else timedelta(minutes=settings.password_reset_ttl_minutes)
    )
    raw_token = generate_opaque_token()
    db.add(
        VerificationToken(
            user_id=user.id,
            token_hash=hash_opaque_token(raw_token),
            purpose=purpose,
            expires_at=datetime.now(UTC) + ttl,
        )
    )
    await db.flush()
    # Until the transactional email provider is wired up (SRS 4.10), the token is logged so
    # the flow can be exercised locally.
    logger.info("issued %s token for %s: %s", purpose.value, user.email, raw_token)
    return raw_token


async def consume_verification_token(
    db: AsyncSession, raw_token: str, purpose: TokenPurpose
) -> User:
    result = await db.execute(
        select(VerificationToken).where(
            VerificationToken.token_hash == hash_opaque_token(raw_token),
            VerificationToken.purpose == purpose,
        )
    )
    token = result.scalar_one_or_none()
    now = datetime.now(UTC)
    if token is None or token.used_at is not None or _as_utc(token.expires_at) <= now:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid or expired token")

    token.used_at = now
    user = await db.get(User, token.user_id)
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid or expired token")
    return user


async def register_user(db: AsyncSession, data: RegisterRequest) -> tuple[User, str]:
    email = normalize_email(data.email)
    if await get_user_by_email(db, email) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")

    user = User(
        email=email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name.strip(),
        role=data.role,
    )
    db.add(user)
    await db.flush()
    raw_token = await issue_verification_token(db, user, TokenPurpose.email_verification)
    await db.commit()
    await db.refresh(user)
    return user, raw_token


async def issue_token_pair(db: AsyncSession, user: User) -> TokenPair:
    access_token, expires_in = create_access_token(user.id, user.role.value)
    raw_refresh = generate_opaque_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_opaque_token(raw_refresh),
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_ttl_days),
        )
    )
    await db.flush()
    return TokenPair(access_token=access_token, refresh_token=raw_refresh, expires_in=expires_in)


async def login(db: AsyncSession, email: str, password: str) -> TokenPair:
    user = await get_user_by_email(db, email)
    if user is None or not verify_password(password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "incorrect email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "account is disabled")

    pair = await issue_token_pair(db, user)
    await db.commit()
    return pair


async def rotate_refresh_token(db: AsyncSession, raw_token: str) -> TokenPair:
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == hash_opaque_token(raw_token))
    )
    stored = result.scalar_one_or_none()
    now = datetime.now(UTC)
    if stored is None or stored.revoked_at is not None or _as_utc(stored.expires_at) <= now:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired refresh token")

    user = await db.get(User, stored.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired refresh token")

    stored.revoked_at = now
    pair = await issue_token_pair(db, user)
    await db.commit()
    return pair


async def revoke_refresh_token(db: AsyncSession, raw_token: str) -> None:
    await db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.token_hash == hash_opaque_token(raw_token),
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(UTC))
    )
    await db.commit()


async def verify_email(db: AsyncSession, raw_token: str) -> User:
    user = await consume_verification_token(db, raw_token, TokenPurpose.email_verification)
    user.is_email_verified = True
    await db.commit()
    return user


async def resend_verification_email(db: AsyncSession, email: str) -> None:
    user = await get_user_by_email(db, email)
    if user is not None and not user.is_email_verified:
        await issue_verification_token(db, user, TokenPurpose.email_verification)
        await db.commit()


async def request_password_reset(db: AsyncSession, email: str) -> None:
    user = await get_user_by_email(db, email)
    if user is not None:
        await issue_verification_token(db, user, TokenPurpose.password_reset)
        await db.commit()


async def confirm_password_reset(db: AsyncSession, raw_token: str, new_password: str) -> None:
    user = await consume_verification_token(db, raw_token, TokenPurpose.password_reset)
    user.hashed_password = hash_password(new_password)
    # A password change ends every existing session.
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    await db.commit()
