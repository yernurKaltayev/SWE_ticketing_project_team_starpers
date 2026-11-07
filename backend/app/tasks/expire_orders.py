"""P5 periodic expiry job: pending checkouts cannot hold inventory indefinitely."""

import logging

from app.db.session import SessionFactory
from app.services.order_service import expire_due_orders

logger = logging.getLogger(__name__)


async def expire_orders_job() -> None:
    async with SessionFactory() as db:
        try:
            count = await expire_due_orders(db, limit=200)
            if count:
                logger.info("expired pending orders", extra={"count": count})
        except Exception:
            await db.rollback()
            logger.exception("pending-order expiry job failed")
            raise
