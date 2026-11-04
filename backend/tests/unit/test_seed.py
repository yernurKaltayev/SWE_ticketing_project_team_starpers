from sqlalchemy import func, select

from app.models import Event, PlatformSetting, Seat, User
from scripts.seed import seed


async def _counts(db) -> tuple[int, ...]:
    return tuple(
        [
            await db.scalar(select(func.count()).select_from(model))
            for model in (User, Seat, Event, PlatformSetting)
        ]
    )


async def test_seed_creates_demo_data_and_is_repeatable(db):
    await seed(db)
    first = await _counts(db)
    assert first == (2, 52, 1, 3)

    await seed(db)
    assert await _counts(db) == first
