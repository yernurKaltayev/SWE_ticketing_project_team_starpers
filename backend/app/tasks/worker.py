"""Background worker. Run with `python -m app.tasks.worker`.

To add a job, write an async function in `app/tasks/` and add it to `JOBS`. Jobs must be safe
to run again after a crash, and open their own session from `SessionFactory`.
"""

import asyncio
import logging
import signal
from collections.abc import Awaitable, Callable

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.config import get_settings
from app.core.logging import configure_logging

logger = logging.getLogger(__name__)


async def heartbeat() -> None:
    logger.info("worker heartbeat")


# (job, interval in seconds)
JOBS: list[tuple[Callable[[], Awaitable[None]], int]] = [
    (heartbeat, 60),
]


def build_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="UTC")
    for job, seconds in JOBS:
        # max_instances=1: a slow run is skipped over, never overlapped by the next one.
        scheduler.add_job(job, "interval", seconds=seconds, max_instances=1, coalesce=True)
    return scheduler


async def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level, json_output=settings.log_json)

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    scheduler = build_scheduler()
    scheduler.start()
    logger.info("worker started", extra={"jobs": len(JOBS)})
    await stop.wait()
    scheduler.shutdown()
    logger.info("worker stopped")


if __name__ == "__main__":
    asyncio.run(main())
