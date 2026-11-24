"""Phone verification through a Telegram bot [P1].

The account page asks for a single-use deep link; the user presses Start in the bot and shares
their own contact; the worker (app/tasks/telegram_updates.py) matches it with the account phone.
"""

import secrets
from datetime import datetime, timedelta

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import ConflictError, ServiceUnavailableError
from app.core.security import hash_token
from app.db.base import utcnow
from app.models.user import PhoneVerification, User

TOKEN_LIFETIME = timedelta(minutes=15)


async def start(db: AsyncSession, user: User, settings: Settings) -> tuple[str, datetime]:
    """Open a verification request and return its t.me link and expiry. One open per user."""
    if not settings.telegram_enabled:
        raise ServiceUnavailableError(
            "Phone verification through Telegram is not set up.", code="telegram_unavailable"
        )
    if not user.phone:
        raise ConflictError("Add a phone number before verifying it.", code="phone_missing")
    now = utcnow()
    await db.execute(
        update(PhoneVerification)
        .where(PhoneVerification.user_id == user.id, PhoneVerification.used_at.is_(None))
        .values(used_at=now)
    )
    # Telegram start parameters allow 1-64 characters of A-Z, a-z, 0-9, _ and -.
    token = secrets.token_urlsafe(24)
    expires_at = now + TOKEN_LIFETIME
    db.add(PhoneVerification(user_id=user.id, token_hash=hash_token(token), expires_at=expires_at))
    await db.commit()
    return f"https://t.me/{settings.telegram_bot_username}?start={token}", expires_at
