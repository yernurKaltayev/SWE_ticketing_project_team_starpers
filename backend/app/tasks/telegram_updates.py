"""Poll the BiletFlow Telegram bot and answer phone-verification messages [P1].

Runs every few seconds when TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME are set. The getUpdates
offset lives in memory: Telegram remembers which updates were confirmed (by asking for the next
offset), so after a restart at most the last batch comes back, and handle_update is safe to run
twice. Never logs the token.
"""

import logging
from typing import Any, Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import SessionFactory
from app.services.phone_verification import handle_update
from app.services.telegram import BotReply, TelegramApi, TelegramError

logger = logging.getLogger(__name__)

_offset: int | None = None


class BotApi(Protocol):
    async def get_updates(
        self, offset: int | None, wait_seconds: int = 0
    ) -> list[dict[str, Any]]: ...

    async def send_message(self, reply: BotReply) -> None: ...


async def poll_once(db: AsyncSession, api: BotApi, offset: int | None) -> int | None:
    """Handle one batch of updates and return the offset to ask for next."""
    try:
        updates = await api.get_updates(offset)
    except TelegramError as exc:
        logger.warning("telegram getUpdates failed", extra={"error": str(exc)})
        return offset
    for update in updates:
        update_id = update.get("update_id")
        if isinstance(update_id, int):
            offset = max(offset or 0, update_id + 1)
        try:
            replies = await handle_update(db, update)
        except Exception:
            await db.rollback()
            logger.exception("telegram update could not be handled")
            continue
        for reply in replies:
            try:
                await api.send_message(reply)
            except TelegramError as exc:
                logger.warning("telegram sendMessage failed", extra={"error": str(exc)})
    return offset


async def telegram_updates_job() -> None:
    global _offset
    settings = get_settings()
    if not settings.telegram_enabled or settings.telegram_bot_token is None:
        return
    api = TelegramApi(settings.telegram_bot_token.get_secret_value())
    try:
        async with SessionFactory() as db:
            _offset = await poll_once(db, api, _offset)
    finally:
        await api.aclose()
