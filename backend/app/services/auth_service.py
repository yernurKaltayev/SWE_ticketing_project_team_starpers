"""Registration, sign-in, token rotation and password reset [P1].

Argon2 is deliberately slow, so hashing runs in a thread: on the event loop it would stall every
other request.

Functions that create an email token return it, and the router sends the email after the response.
"""

import asyncio
import secrets
import uuid
from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ConflictError, ForbiddenError, UnauthorizedError, UnprocessableError
from app.core.security import create_access_token, hash_password, hash_token, verify_password
from app.db.base import utcnow
from app.models.user import EmailTokenPurpose, OrganizerProfile, RefreshToken, User, UserRole
from app.schemas.auth import RegisterIn, TokenOut
from app.services.email_verification import consume_email_token, issue_email_token

# Verified against when the email is unknown, so that a failed sign-in takes the same time whether
# or not the account exists.
_TIMING_HASH = hash_password(secrets.token_urlsafe(32))


def _invalid_refresh_token() -> UnauthorizedError:
    return UnauthorizedError(
        "The refresh token is invalid or expired.", code="invalid_refresh_token"
    )


def _invalid_email_token() -> UnprocessableError:
    return UnprocessableError("The link is invalid or has expired.", code="invalid_email_token")


def _issue_tokens(db: AsyncSession, user_id: uuid.UUID) -> TokenOut:
    refresh_token = secrets.token_urlsafe(32)
    lifetime = timedelta(days=get_settings().refresh_token_ttl_days)
    db.add(
        RefreshToken(
            user_id=user_id,
            token_hash=hash_token(refresh_token),
            expires_at=utcnow() + lifetime,
        )
    )
    return TokenOut(access_token=create_access_token(user_id), refresh_token=refresh_token)


async def _revoke_all_refresh_tokens(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )


async def register(db: AsyncSession, data: RegisterIn) -> tuple[User, str]:
    """Create the account, and the organizer profile that P2 hangs events on.

    Returns the user and their verification token. The profile starts from the account details;
    the organizer completes it with PATCH /organizers/me.
    """
    user = User(
        email=data.email,
        password_hash=await asyncio.to_thread(hash_password, data.password),
        full_name=data.full_name,
        role=UserRole(data.role),
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError as exc:  # also covers two concurrent registrations
        await db.rollback()
        raise ConflictError(
            "An account with this email already exists.", code="email_taken"
        ) from exc

    if user.role == UserRole.organizer:
        db.add(
            OrganizerProfile(
                user_id=user.id,
                organization_name=data.full_name,
                contact_email=data.email,
                contact_phone="",
            )
        )
    token = await issue_email_token(db, user.id, EmailTokenPurpose.verify)
    await db.commit()
    return user, token


async def login(db: AsyncSession, email: str, password: str) -> TokenOut:
    user = await db.scalar(select(User).where(User.email == email))
    password_hash = user.password_hash if user else _TIMING_HASH
    matches = await asyncio.to_thread(verify_password, password, password_hash)
    if user is None or not matches:
        raise UnauthorizedError("The email or password is incorrect.", code="invalid_credentials")

    # Checked after the password, so these answers reveal nothing to someone guessing.
    if user.is_suspended:
        raise ForbiddenError("This account is suspended.", code="account_suspended")
    if user.email_verified_at is None:
        raise ForbiddenError("Confirm your email before signing in.", code="email_not_verified")

    user.last_login_at = utcnow()
    tokens = _issue_tokens(db, user.id)
    await db.commit()
    return tokens


async def refresh(db: AsyncSession, refresh_token: str) -> TokenOut:
    """Rotate a refresh token. The single UPDATE means only one caller can spend it."""
    token_hash = hash_token(refresh_token)
    now = utcnow()
    user_id = await db.scalar(
        update(RefreshToken)
        .where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > now,
        )
        .values(revoked_at=now)
        .returning(RefreshToken.user_id)
    )
    if user_id is None:
        # A revoked token coming back means it leaked, or a client kept a stale copy. The two
        # cannot be told apart, so end every session. Committed here: raising discards the rest.
        reused_by = await db.scalar(
            select(RefreshToken.user_id).where(
                RefreshToken.token_hash == token_hash,
                RefreshToken.revoked_at.is_not(None),
                RefreshToken.expires_at > now,
            )
        )
        if reused_by is not None:
            await _revoke_all_refresh_tokens(db, reused_by)
            await db.commit()
        raise _invalid_refresh_token()

    user = await db.get_one(User, user_id)
    if user.is_suspended:
        raise ForbiddenError("This account is suspended.", code="account_suspended")

    tokens = _issue_tokens(db, user_id)
    await db.commit()
    return tokens


async def logout(db: AsyncSession, user: User, refresh_token: str) -> None:
    """Revoke the token if it is the caller's. Unknown tokens are ignored: the end state holds."""
    await db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.token_hash == hash_token(refresh_token),
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=utcnow())
    )
    await db.commit()


async def verify_email(db: AsyncSession, token: str) -> None:
    user_id = await consume_email_token(db, token, EmailTokenPurpose.verify)
    if user_id is None:
        raise _invalid_email_token()
    user = await db.get_one(User, user_id)
    user.email_verified_at = user.email_verified_at or utcnow()
    await db.commit()


async def resend_verification(db: AsyncSession, email: str) -> tuple[str, str] | None:
    """Return (address, token), or None if there is nothing to send."""
    user = await db.scalar(select(User).where(User.email == email))
    if user is None or user.email_verified_at is not None:
        return None
    token = await issue_email_token(db, user.id, EmailTokenPurpose.verify)
    await db.commit()
    return user.email, token


async def forgot_password(db: AsyncSession, email: str) -> tuple[str, str] | None:
    """Return (address, token), or None if the account does not exist."""
    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        return None
    token = await issue_email_token(db, user.id, EmailTokenPurpose.reset)
    await db.commit()
    return user.email, token


async def reset_password(db: AsyncSession, token: str, new_password: str) -> None:
    """Set the password and end all sessions: a reset may be recovering a stolen account.

    Access tokens already issued stay valid until they expire (`access_token_ttl_minutes`).
    """
    user_id = await consume_email_token(db, token, EmailTokenPurpose.reset)
    if user_id is None:
        raise _invalid_email_token()
    user = await db.get_one(User, user_id)
    user.password_hash = await asyncio.to_thread(hash_password, new_password)
    await _revoke_all_refresh_tokens(db, user_id)
    await db.commit()
