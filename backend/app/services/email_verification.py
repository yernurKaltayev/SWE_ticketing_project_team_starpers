"""Single-use tokens sent by email, for address verification and password reset.

These emails bypass `notify()` on purpose. A notification is stored in the database, and the raw
token must exist only in the email: the database keeps its hash.
"""

import secrets
import uuid
from datetime import timedelta

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_token
from app.db.base import utcnow
from app.models.user import EmailToken, EmailTokenPurpose
from app.services.email_sender import send_email


def _lifetime(purpose: EmailTokenPurpose) -> timedelta:
    settings = get_settings()
    if purpose == EmailTokenPurpose.verify:
        return timedelta(hours=settings.email_verify_token_ttl_hours)
    return timedelta(minutes=settings.password_reset_token_ttl_minutes)


async def issue_email_token(
    db: AsyncSession, user_id: uuid.UUID, purpose: EmailTokenPurpose
) -> str:
    """Add a token to the caller's transaction, replacing any unused one. Returns the raw token."""
    now = utcnow()
    await db.execute(
        update(EmailToken)
        .where(
            EmailToken.user_id == user_id,
            EmailToken.purpose == purpose,
            EmailToken.used_at.is_(None),
        )
        .values(used_at=now)
    )
    token = secrets.token_urlsafe(32)
    db.add(
        EmailToken(
            user_id=user_id,
            purpose=purpose,
            token_hash=hash_token(token),
            expires_at=now + _lifetime(purpose),
        )
    )
    return token


async def consume_email_token(
    db: AsyncSession, token: str, purpose: EmailTokenPurpose
) -> uuid.UUID | None:
    """Spend a token and return its user, or None if it is unknown, used or expired.

    A single UPDATE, so of two concurrent requests with the same token only one succeeds.
    """
    now = utcnow()
    return await db.scalar(
        update(EmailToken)
        .where(
            EmailToken.token_hash == hash_token(token),
            EmailToken.purpose == purpose,
            EmailToken.used_at.is_(None),
            EmailToken.expires_at > now,
        )
        .values(used_at=now)
        .returning(EmailToken.user_id)
    )


def _link(path: str, token: str) -> str:
    return f"{get_settings().web_base_url.rstrip('/')}/{path}?token={token}"


async def send_verification_email(email: str, token: str) -> None:
    await send_email(
        email,
        "Confirm your BiletFlow email",
        "Welcome to BiletFlow. Open this link to confirm your email address:\n\n"
        f"{_link('verify-email', token)}\n\n"
        f"The link expires in {get_settings().email_verify_token_ttl_hours} hours. "
        "If you did not create an account, you can ignore this email.\n",
    )


async def send_password_reset_email(email: str, token: str) -> None:
    await send_email(
        email,
        "Reset your BiletFlow password",
        "Open this link to choose a new password:\n\n"
        f"{_link('reset-password', token)}\n\n"
        f"The link expires in {get_settings().password_reset_token_ttl_minutes} minutes. "
        "If you did not ask for this, you can ignore this email.\n",
    )
