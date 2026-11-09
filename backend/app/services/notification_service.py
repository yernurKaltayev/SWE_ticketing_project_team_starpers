"""`notify()`: the interface other parts call to notify a user [P9].

`notify()` only stores a row in the caller's transaction. The email is sent later by the
worker (`app/tasks/send_emails.py`), so no request ever waits on SMTP, and a notification is
saved only if the action that caused it commits.
"""

import logging
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.core.pagination import Page, PageParams, paginate
from app.db.base import utcnow
from app.models.notification import EmailStatus, Notification, NotificationType
from app.models.user import User
from app.services.notification_templates import render

logger = logging.getLogger(__name__)


async def notify(
    db: AsyncSession,
    event_type: NotificationType,
    user: User,
    context: dict[str, Any],
) -> Notification | None:
    """Queue an in-app notification and its email in the caller's transaction. Never raises.

    A savepoint keeps a failed insert from breaking the caller's transaction: losing one
    notification is acceptable, failing a checkout because of one is not.
    """
    try:
        async with db.begin_nested():
            title, body = await render(db, event_type, user, context)
            notification = Notification(
                user_id=user.id,
                type=event_type,
                title=title,
                body=body,
                payload=context,
                email_status=EmailStatus.pending,
            )
            db.add(notification)
            await db.flush()
        return notification
    except Exception:
        logger.exception(
            "notification could not be stored",
            extra={"notification_type": event_type.value, "user_id": str(user.id)},
        )
        return None


async def list_for_user(
    db: AsyncSession, user: User, params: PageParams, *, unread_only: bool = False
) -> Page[Any]:
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    stmt = stmt.order_by(Notification.created_at.desc(), Notification.id.desc())
    return await paginate(db, stmt, params)


async def mark_read(db: AsyncSession, user: User, notification_id: uuid.UUID) -> Notification:
    """Idempotent. Another user's notification is reported as missing, not forbidden."""
    notification = await db.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise NotFoundError("Notification not found.", code="notification_not_found")
    if notification.read_at is None:
        notification.read_at = utcnow()
        await db.commit()
    return notification
