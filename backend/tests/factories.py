"""Helpers that insert valid rows. Pass keyword arguments to override any column."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models import (
    Attendee,
    Event,
    Order,
    OrderItem,
    OrganizerProfile,
    Seat,
    StaffAssignment,
    Ticket,
    TicketType,
    User,
    Venue,
    VenueLayout,
    VenueRow,
    VenueSection,
)
from app.models.user import StaffRole, UserRole


def unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def auth_header(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


async def _save[T](db: AsyncSession, row: T) -> T:
    db.add(row)
    await db.flush()
    return row


async def make_user(db: AsyncSession, **overrides: Any) -> User:
    values: dict[str, Any] = {
        "email": f"{unique('user')}@example.com",
        "password_hash": "not-a-real-hash",
        "full_name": "Test User",
        "role": UserRole.attendee,
    }
    return await _save(db, User(**(values | overrides)))


async def make_organizer(db: AsyncSession) -> tuple[User, OrganizerProfile]:
    user = await make_user(db, role=UserRole.organizer)
    profile = OrganizerProfile(
        user_id=user.id,
        organization_name="Test Org",
        contact_email=user.email,
        contact_phone="+77000000000",
    )
    return user, await _save(db, profile)


async def make_event(
    db: AsyncSession, organizer: OrganizerProfile | None = None, **overrides: Any
) -> Event:
    if organizer is None:
        _, organizer = await make_organizer(db)
    venue = await _save(db, Venue(name="Hall", address="1 Abay Avenue", city="Almaty"))
    starts_at = datetime.now(UTC) + timedelta(days=7)
    values: dict[str, Any] = {
        "organizer_id": organizer.id,
        "title": "Test Event",
        "description": "Description",
        "category": "concert",
        "venue_id": venue.id,
        "starts_at": starts_at,
        "ends_at": starts_at + timedelta(hours=2),
        "timezone": "Asia/Almaty",
        "capacity": 100,
    }
    return await _save(db, Event(**(values | overrides)))


async def make_staff(db: AsyncSession, event: Event, role: StaffRole) -> User:
    user = await make_user(db)
    await _save(
        db, StaffAssignment(event_id=event.id, user_id=user.id, role=role, assigned_by=user.id)
    )
    return user


async def make_seat(db: AsyncSession, event: Event) -> Seat:
    layout = await _save(db, VenueLayout(venue_id=event.venue_id, name="Layout"))
    section = await _save(
        db, VenueSection(layout_id=layout.id, name="A", price_category="standard")
    )
    row = await _save(db, VenueRow(section_id=section.id, label="1", position=1))
    return await _save(db, Seat(row_id=row.id, number=1, price_category="standard"))


async def make_ticket_type(db: AsyncSession, event: Event, **overrides: Any) -> TicketType:
    values: dict[str, Any] = {"event_id": event.id, "name": "General", "quantity_total": 10}
    return await _save(db, TicketType(**(values | overrides)))


async def make_order(db: AsyncSession, event: Event, **overrides: Any) -> Order:
    values: dict[str, Any] = {
        "order_number": unique("ORD"),
        "event_id": event.id,
        "buyer_email": "buyer@example.com",
        "idempotency_key": unique("key"),
    }
    return await _save(db, Order(**(values | overrides)))


async def make_ticket(db: AsyncSession, event: Event, **overrides: Any) -> Ticket:
    ticket_type = await make_ticket_type(db, event)
    order = await make_order(db, event)
    item = await _save(
        db,
        OrderItem(
            order_id=order.id,
            ticket_type_id=ticket_type.id,
            unit_price=0,
            quantity=1,
            line_total=0,
        ),
    )
    attendee = await _save(
        db, Attendee(order_id=order.id, full_name="Guest", email="guest@example.com")
    )
    values: dict[str, Any] = {
        "ticket_number": unique("TKT"),
        "order_item_id": item.id,
        "event_id": event.id,
        "ticket_type_id": ticket_type.id,
        "attendee_id": attendee.id,
        "qr_token": unique("qr"),
    }
    return await _save(db, Ticket(**(values | overrides)))
