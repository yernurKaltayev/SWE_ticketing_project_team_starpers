"""`notify()`: the interface other parts call to notify a user [P9].

STUB until P9 lands. It only logs, so callers can already use it: a notification must never
block or fail the main request, so dropping one here is safe.
"""

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import NotificationType
from app.models.user import User

logger = logging.getLogger(__name__)


async def notify(
    db: AsyncSession,
    event_type: NotificationType,
    user: User,
    context: dict[str, Any],
) -> None:
    """Queue an in-app notification and email in the caller's transaction."""
    logger.info(
        "notification stub", extra={"notification_type": event_type.value, "user_id": str(user.id)}
    )
