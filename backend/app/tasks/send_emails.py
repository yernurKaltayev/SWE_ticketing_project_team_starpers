"""P9 job: email the notifications that `notify()` queued, with retries.

Each run takes a batch of pending rows with `FOR UPDATE SKIP LOCKED`, so two workers never
send the same email. A failed send stays pending and is retried on a later run, until
`notification_max_email_attempts` is reached and the row is marked failed.
"""

import logging
import smtplib

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import SessionFactory
from app.models.notification import EmailStatus, Notification
from app.models.user import User
from app.services import email_sender

logger = logging.getLogger(__name__)

BATCH_SIZE = 50


async def send_pending_emails(db: AsyncSession, limit: int = BATCH_SIZE) -> dict[str, int]:
    """Send one batch and commit. Returns counts of sent, retried and failed rows."""
    max_attempts = get_settings().notification_max_email_attempts
    rows = (
        await db.execute(
            select(Notification, User.email)
            .join(User, User.id == Notification.user_id)
            .where(Notification.email_status == EmailStatus.pending)
            .order_by(Notification.created_at)
            .limit(limit)
            .with_for_update(of=Notification, skip_locked=True)
        )
    ).all()

    counts = {"sent": 0, "retried": 0, "failed": 0}
    for notification, email in rows:
        notification.email_attempts += 1
        try:
            await email_sender.deliver_email(email, notification.title, notification.body)
        except (OSError, smtplib.SMTPException) as exc:
            if notification.email_attempts >= max_attempts:
                notification.email_status = EmailStatus.failed
                counts["failed"] += 1
                # The id only: the address and body are personal data.
                logger.error(
                    "notification email failed permanently",
                    extra={"notification_id": str(notification.id), "error": type(exc).__name__},
                )
            else:
                counts["retried"] += 1
                logger.warning(
                    "notification email failed, will retry",
                    extra={
                        "notification_id": str(notification.id),
                        "attempt": notification.email_attempts,
                        "error": type(exc).__name__,
                    },
                )
        else:
            notification.email_status = EmailStatus.sent
            counts["sent"] += 1
    await db.commit()
    return counts


async def send_emails_job() -> None:
    async with SessionFactory() as db:
        try:
            counts = await send_pending_emails(db)
            if any(counts.values()):
                logger.info("notification emails processed", extra=counts)
        except Exception:
            await db.rollback()
            logger.exception("notification email job failed")
            raise
