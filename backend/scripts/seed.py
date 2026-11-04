"""Demo data: admin, organizer, one venue layout, a sample event and platform settings.

Run with `python -m scripts.seed`. Safe to run repeatedly: existing rows are left alone.
"""

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import DEFAULT_SEED_PASSWORD, get_settings
from app.core.logging import configure_logging
from app.core.money import Money
from app.core.security import hash_password
from app.db.session import SessionFactory, engine
from app.models import (
    Event,
    OrganizerProfile,
    PlatformSetting,
    Seat,
    TicketType,
    User,
    Venue,
    VenueLayout,
    VenueRow,
    VenueSection,
)
from app.models.event import EventStatus
from app.models.user import UserRole, VerificationStatus

logger = logging.getLogger(__name__)

SAMPLE_EVENT_TITLE = "BiletFlow Demo Concert"
VENUE_NAME = "Almaty Demo Hall"
LAYOUT_NAME = "Standard hall"
# (section, price category, row labels, seats per row)
SECTIONS = [
    ("Parterre", "standard", ["A", "B", "C", "D"], 10),
    ("VIP", "vip", ["V1", "V2"], 6),
]
# Placeholders until the open decisions in CLAUDE.md are settled. Editable by admins (P11).
DEFAULT_SETTINGS: dict[str, Any] = {
    "activation_fee_amount": Money.from_major(15_000).amount,
    "processing_fee_percent": "3",
    "hold_minutes": 10,
}


async def _ensure_user(db: AsyncSession, email: str, full_name: str, role: UserRole) -> User:
    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
            email=email,
            password_hash=hash_password(get_settings().seed_password.get_secret_value()),
            full_name=full_name,
            role=role,
            email_verified_at=datetime.now(UTC),
        )
        db.add(user)
        await db.flush()
    return user


async def _ensure_organizer(db: AsyncSession, user: User) -> OrganizerProfile:
    profile = await db.scalar(select(OrganizerProfile).where(OrganizerProfile.user_id == user.id))
    if profile is None:
        profile = OrganizerProfile(
            user_id=user.id,
            organization_name="Demo Events LLP",
            contact_email=user.email,
            contact_phone="+77000000000",
            verification_status=VerificationStatus.verified,
        )
        db.add(profile)
        await db.flush()
    return profile


async def _ensure_layout(db: AsyncSession) -> VenueLayout:
    venue = await db.scalar(select(Venue).where(Venue.name == VENUE_NAME))
    if venue is None:
        venue = Venue(name=VENUE_NAME, address="1 Abay Avenue", city="Almaty")
        db.add(venue)
        await db.flush()

    layout = await db.scalar(
        select(VenueLayout).where(VenueLayout.venue_id == venue.id, VenueLayout.name == LAYOUT_NAME)
    )
    if layout is not None:
        return layout

    layout = VenueLayout(venue_id=venue.id, name=LAYOUT_NAME)
    db.add(layout)
    await db.flush()
    for section_name, category, labels, seats_per_row in SECTIONS:
        section = VenueSection(layout_id=layout.id, name=section_name, price_category=category)
        db.add(section)
        await db.flush()
        for position, label in enumerate(labels, start=1):
            row = VenueRow(section_id=section.id, label=label, position=position)
            db.add(row)
            await db.flush()
            db.add_all(
                Seat(row_id=row.id, number=number, price_category=category)
                for number in range(1, seats_per_row + 1)
            )
    await db.flush()
    return layout


async def _ensure_event(
    db: AsyncSession, organizer: OrganizerProfile, layout: VenueLayout
) -> Event:
    event = await db.scalar(
        select(Event).where(Event.organizer_id == organizer.id, Event.title == SAMPLE_EVENT_TITLE)
    )
    if event is not None:
        return event

    capacity = sum(len(labels) * seats for _, _, labels, seats in SECTIONS)
    starts_at = (datetime.now(UTC) + timedelta(days=30)).replace(
        hour=14, minute=0, second=0, microsecond=0
    )
    event = Event(
        organizer_id=organizer.id,
        title=SAMPLE_EVENT_TITLE,
        description="A free sample event for trying out the platform.",
        category="concert",
        venue_id=layout.venue_id,
        layout_id=layout.id,
        starts_at=starts_at,
        ends_at=starts_at + timedelta(hours=2),
        timezone="Asia/Almaty",
        status=EventStatus.published,
        capacity=capacity,
    )
    db.add(event)
    await db.flush()
    db.add(
        TicketType(
            event_id=event.id, name="General admission", quantity_total=capacity, is_free=True
        )
    )
    await db.flush()
    return event


async def _ensure_settings(db: AsyncSession) -> None:
    for key, value in DEFAULT_SETTINGS.items():
        if await db.get(PlatformSetting, key) is None:
            db.add(PlatformSetting(key=key, value=value))
    await db.flush()


async def seed(db: AsyncSession) -> None:
    """Create whatever is missing, in the caller's transaction."""
    settings = get_settings()
    await _ensure_user(db, settings.seed_admin_email, "Platform Admin", UserRole.platform_admin)
    organizer_user = await _ensure_user(
        db, settings.seed_organizer_email, "Demo Organizer", UserRole.organizer
    )
    organizer = await _ensure_organizer(db, organizer_user)
    layout = await _ensure_layout(db)
    await _ensure_event(db, organizer, layout)
    await _ensure_settings(db)


async def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level, json_output=settings.log_json)
    if settings.is_production and (
        settings.seed_password.get_secret_value() == DEFAULT_SEED_PASSWORD
    ):
        raise SystemExit("Set SEED_PASSWORD before seeding a production database.")

    async with SessionFactory() as db:
        await seed(db)
        await db.commit()
    await engine.dispose()
    logger.info("seed complete", extra={"admin": settings.seed_admin_email})


if __name__ == "__main__":
    asyncio.run(main())
