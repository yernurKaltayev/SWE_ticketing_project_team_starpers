"""Anonymize volunteer check-in accounts once their event is over or cancelled [P1]."""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import SessionFactory
from app.models.user import User
from app.services.volunteer_service import due_volunteer_ids, purge_volunteer

logger = logging.getLogger(__name__)


async def purge_due_volunteers(db: AsyncSession) -> int:
    """Purge every due volunteer, committing one at a time so one failure skips only that one."""
    purged = 0
    for user_id in await due_volunteer_ids(db):
        try:
            user = await db.get_one(User, user_id)
            await purge_volunteer(db, user, actor=None, reason="event_finished")
            await db.commit()
            purged += 1
        except Exception:
            await db.rollback()
            logger.exception("volunteer purge failed", extra={"user_id": str(user_id)})
    return purged


async def purge_volunteers_job() -> None:
    async with SessionFactory() as db:
        count = await purge_due_volunteers(db)
        if count:
            logger.info("anonymized volunteer accounts", extra={"count": count})
