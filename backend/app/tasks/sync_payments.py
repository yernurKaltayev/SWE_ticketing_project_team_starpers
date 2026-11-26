"""P6 periodic job: settle Halyk test payments whose buyer never returned to the site."""

import logging

from app.db.session import SessionFactory
from app.services.payments.payment_service import sync_pending_payments

logger = logging.getLogger(__name__)


async def sync_payments_job() -> None:
    async with SessionFactory() as db:
        try:
            changed = await sync_pending_payments(db)
            if changed:
                logger.info("pending payments settled", extra={"count": changed})
        except Exception:
            await db.rollback()
            logger.exception("payment sync job failed")
            raise
