"""P6 periodic job: schedule payouts for finished events and mark due ones paid (simulated)."""

import logging

from app.db.session import SessionFactory
from app.services.payments.payout import run_payout_schedule

logger = logging.getLogger(__name__)


async def payouts_job() -> None:
    async with SessionFactory() as db:
        try:
            changed = await run_payout_schedule(db)
            if changed:
                logger.info("payout schedule updated", extra={"count": changed})
        except Exception:
            await db.rollback()
            logger.exception("payout job failed")
            raise
