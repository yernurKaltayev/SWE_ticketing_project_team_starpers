"""P4 hold-expiration worker.

Every pass locks events before releasing expired holds and P3 inventory. A
separate process is needed in production; simply importing this file does not
schedule it. Run after deploying the DB migration:

    DATABASE_URL=postgresql+asyncpg://... python -m app.tasks.expire_holds --once
    DATABASE_URL=postgresql+asyncpg://... python -m app.tasks.expire_holds --interval 60

The caller may also inject the team's existing async_sessionmaker into
`run_expiration_pass` from its preferred scheduler.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
from collections.abc import Callable

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.services.seat_service import expire_due_holds

logger = logging.getLogger(__name__)


async def run_expiration_pass(session_factory: Callable[[], AsyncSession],
                              limit: int = 100) -> int:
    async with session_factory() as db:
        try:
            return await expire_due_holds(db, limit=limit)
        except Exception:
            await db.rollback()
            raise


async def main() -> None:
    parser = argparse.ArgumentParser(description="Expire old assigned-seat holds")
    parser.add_argument("--once", action="store_true", help="Run one pass then exit")
    parser.add_argument("--interval", type=int, default=60,
                        help="Delay between passes in seconds (default: 60)")
    parser.add_argument("--limit", type=int, default=100,
                        help="Maximum number of due groups scanned per pass")
    args = parser.parse_args()
    if args.interval < 1 or args.limit < 1:
        parser.error("--interval and --limit must be positive")

    url = os.environ.get("DATABASE_URL", "")
    if not url:
        parser.error("Set DATABASE_URL to the backend PostgreSQL database URL")
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if not url.startswith("postgresql+asyncpg://"):
        parser.error("This worker requires PostgreSQL with the asyncpg driver")

    engine = create_async_engine(url, pool_pre_ping=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        while True:
            try:
                expired = await run_expiration_pass(factory, limit=args.limit)
                logger.info("Expiration pass finished: %d hold groups expired", expired)
            except Exception:
                logger.exception("P4 expiration pass failed")
                if args.once:
                    raise
            if args.once:
                break
            await asyncio.sleep(args.interval)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
