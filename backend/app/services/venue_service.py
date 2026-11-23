"""Organizer-created venues [P2]. Venues are a shared catalogue: discovery filters by their
city, and calendars, PDF tickets and the staff app read their name and address."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.venue import Venue
from app.schemas.venue import VenueCreate


async def create_venue(db: AsyncSession, data: VenueCreate) -> tuple[Venue, bool]:
    """Return the venue and whether it was new. The same hall typed again, in any letter case,
    reuses the existing row so the shared list does not fill with copies."""
    existing = await db.scalar(
        select(Venue)
        .where(
            func.lower(Venue.name) == data.name.lower(),
            func.lower(Venue.address) == data.address.lower(),
            func.lower(Venue.city) == data.city.lower(),
        )
        .order_by(Venue.created_at, Venue.id)
        .limit(1)
    )
    if existing is not None:
        return existing, False
    venue = Venue(name=data.name, address=data.address, city=data.city)
    db.add(venue)
    await db.commit()
    await db.refresh(venue)
    return venue, True
