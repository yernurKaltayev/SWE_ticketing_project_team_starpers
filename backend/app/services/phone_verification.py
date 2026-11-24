"""Phone verification through a Telegram bot [P1].

The account page asks for a single-use deep link; the user presses Start in the bot and shares
their own contact; the worker (app/tasks/telegram_updates.py) matches it with the account phone.
"""

import secrets
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import ConflictError, ServiceUnavailableError
from app.core.security import hash_token
from app.db.base import utcnow
from app.models.user import PhoneVerification, User
from app.schemas.common import normalize_kazakhstan_phone
from app.services.telegram import BotReply

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


# What the bot says, kk / ru / en on three lines (the bot cannot know the user's language).
MESSAGES: dict[str, tuple[str, str, str]] = {
    "ask_contact": (
        "BiletFlow телефонын растау үшін төмендегі «Нөмірімді бөлісу» батырмасын басыңыз.",
        "Чтобы подтвердить телефон в BiletFlow, нажмите кнопку «Поделиться номером» ниже.",
        "Tap “Share my number” below to verify your BiletFlow phone.",
    ),
    "verified": (
        "Телефоныңыз расталды. BiletFlow-қа орала аласыз.",
        "Ваш телефон подтверждён. Можно вернуться в BiletFlow.",
        "Your phone is verified. You can return to BiletFlow.",
    ),
    "mismatch": (
        "Бұл нөмір BiletFlow тіркелгісіндегі телефонға сәйкес келмейді.",
        "Этот номер не совпадает с телефоном в вашем аккаунте BiletFlow.",  # noqa: RUF001 - Cyrillic text
        "This number doesn't match the phone on your BiletFlow account. Share the right "
        "Telegram account, or change the phone in BiletFlow and try again.",
    ),
    "not_own_contact": (
        "Төмендегі батырма арқылы басқа адамның емес, өз контактіңізді бөлісіңіз.",
        "Поделитесь своим контактом кнопкой ниже, а не чужим.",  # noqa: RUF001 - Cyrillic text
        "Please share your own contact with the button below, not someone else's.",
    ),
    "link_invalid": (
        "Бұл сілтеме енді жарамсыз. BiletFlow тіркелгі бетінен жаңасын ашыңыз.",
        "Эта ссылка больше не действует. Откройте новую на странице аккаунта BiletFlow.",
        "This link is no longer valid. Open a new one from your BiletFlow account page.",
    ),
    "start_first": (
        "Алдымен BiletFlow тіркелгі бетіндегі растау сілтемесін ашыңыз.",
        "Сначала откройте ссылку подтверждения на странице аккаунта BiletFlow.",
        "Open the verification link from your BiletFlow account page first.",
    ),
    "help": (
        "Телефонды растау үшін BiletFlow тіркелгі бетіндегі сілтемені ашыңыз.",
        "Чтобы подтвердить телефон, откройте ссылку на странице аккаунта BiletFlow.",
        "To verify your phone, open the link from your BiletFlow account page.",
    ),
}


def _say(chat_id: int, key: str, *, ask_contact: bool = False) -> BotReply:
    return BotReply(chat_id=chat_id, text="\n".join(MESSAGES[key]), ask_contact=ask_contact)


async def handle_update(db: AsyncSession, update: dict[str, Any]) -> list[BotReply]:
    """Answer one Telegram update. Safe to run twice; malformed updates are ignored."""
    message = update.get("message") if isinstance(update, dict) else None
    if not isinstance(message, dict):
        return []
    chat, sender = message.get("chat"), message.get("from")
    if not isinstance(chat, dict) or not isinstance(sender, dict):
        return []
    chat_id, sender_id = chat.get("id"), sender.get("id")
    if not isinstance(chat_id, int) or not isinstance(sender_id, int):
        return []
    if chat.get("type", "private") != "private":
        return []  # never verify, or chat, in groups
    text, contact = message.get("text"), message.get("contact")
    if isinstance(text, str) and text.split(maxsplit=1)[:1] == ["/start"]:
        token = text.removeprefix("/start").strip()
        return [await _bind(db, chat_id, token) if token else _say(chat_id, "help")]
    if isinstance(contact, dict):
        return [await _check_contact(db, chat_id, sender_id, contact)]
    return [_say(chat_id, "help")]


async def _bind(db: AsyncSession, chat_id: int, token: str) -> BotReply:
    row = await db.scalar(
        select(PhoneVerification).where(
            PhoneVerification.token_hash == hash_token(token),
            PhoneVerification.used_at.is_(None),
            PhoneVerification.expires_at > utcnow(),
        )
    )
    if row is None:
        return _say(chat_id, "link_invalid")
    row.telegram_chat_id = chat_id
    await db.commit()
    return _say(chat_id, "ask_contact", ask_contact=True)


async def _check_contact(
    db: AsyncSession, chat_id: int, sender_id: int, contact: dict[str, Any]
) -> BotReply:
    now = utcnow()
    row = await db.scalar(
        select(PhoneVerification)
        .where(
            PhoneVerification.telegram_chat_id == chat_id,
            PhoneVerification.used_at.is_(None),
            PhoneVerification.expires_at > now,
        )
        .order_by(PhoneVerification.created_at.desc())
        .limit(1)
    )
    if row is None:
        # A re-delivered contact after a successful check: say so again rather than "start first".
        already = await db.scalar(
            select(User.id).where(
                User.telegram_chat_id == chat_id, User.phone_verified_at.is_not(None)
            )
        )
        return _say(chat_id, "verified" if already else "start_first")
    # Telegram fills user_id only for the sender's own contact shared with the button.
    if contact.get("user_id") != sender_id:
        return _say(chat_id, "not_own_contact", ask_contact=True)
    try:
        shared = normalize_kazakhstan_phone(str(contact.get("phone_number", "")))
    except ValueError:
        return _say(chat_id, "mismatch")
    user = await db.get(User, row.user_id)
    if user is None or shared != user.phone:
        return _say(chat_id, "mismatch")
    user.phone_verified_at = now
    user.telegram_chat_id = chat_id
    row.used_at = now
    await db.commit()
    return _say(chat_id, "verified")
