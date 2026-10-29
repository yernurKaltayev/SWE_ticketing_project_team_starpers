from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.event import AuditLog, Event, StaffAssignment, Ticket, TicketType
from app.models.organizer import OrganizerProfile
from app.models.user import User, UserRole
from app.schemas.event import (
    ActivationRequest,
    AuditRead,
    EventRead,
    EventWrite,
    TicketTypeWrite,
)


def utc(value: datetime) -> datetime:
    return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)


def read_model(schema, row):
    values = {name: getattr(row, name) for name in schema.model_fields}
    values = {k: utc(v) if isinstance(v, datetime) else v for k, v in values.items()}
    return schema.model_validate(values)


def audit(db: AsyncSession, event: Event, user: User, action: str) -> None:
    db.add(AuditLog(event_id=event.id, actor=user.full_name, action=action, at=datetime.now(UTC)))


async def get_event(
    db: AsyncSession,
    event_id: UUID,
    user: User | None,
    *,
    manage: bool = False,
    lock: bool = False,
) -> Event:
    query = select(Event).where(Event.id == event_id)
    if lock:
        query = query.with_for_update()
    event = (await db.execute(query)).scalar_one_or_none()
    if event is None:
        raise HTTPException(404, "event not found")
    owner = user is not None and user.role == UserRole.organizer and user.id == event.organizer_id
    admin = user is not None and user.role == UserRole.platform_admin
    if manage:
        if not (owner or admin):
            raise HTTPException(403, "you do not manage this event")
    elif not (owner or admin) and (
        event.status not in {"published", "cancelled"} or event.visibility == "private"
    ):
        raise HTTPException(404, "event not found")
    return event


async def types_for(db: AsyncSession, event_id: UUID) -> list[TicketType]:
    return list(
        (
            await db.scalars(
                select(TicketType).where(TicketType.event_id == event_id).order_by(TicketType.id)
            )
        ).all()
    )


def type_read(row: TicketType) -> TicketTypeWrite:
    values = {name: getattr(row, name) for name in TicketTypeWrite.model_fields}
    values["id"] = str(row.id)
    for key in ("sale_starts_at", "sale_ends_at"):
        if values[key]:
            values[key] = utc(values[key])
    return TicketTypeWrite.model_validate(values)


async def event_read(db: AsyncSession, event: Event) -> EventRead:
    return EventRead.model_validate(
        {
            **event.details,
            "id": event.id,
            "organizer_id": event.organizer_id,
            "organizer_name": event.organizer_name,
            "title": event.title,
            "status": event.status,
            "visibility": event.visibility,
            "starts_at": utc(event.starts_at),
            "ends_at": utc(event.ends_at),
            "registration_starts_at": utc(event.registration_starts_at)
            if event.registration_starts_at
            else None,
            "registration_ends_at": utc(event.registration_ends_at)
            if event.registration_ends_at
            else None,
            "paid_sales_active": event.paid_sales_active,
            "ticket_types": [type_read(t) for t in await types_for(db, event.id)],
            "created_at": utc(event.created_at),
            "updated_at": utc(event.updated_at),
        }
    )


async def list_events(
    db: AsyncSession,
    user: User | None,
    *,
    scope: str = "public",
    q: str = "",
    city: str = "",
    category: str = "",
    limit: int = 100,
) -> list[EventRead]:
    query = select(Event)
    if scope == "public":
        query = query.where(
            Event.status == "published",
            Event.visibility == "public",
            Event.ends_at > datetime.now(UTC),
        ).order_by(Event.starts_at)
    elif scope == "mine":
        if user is None or user.role != UserRole.organizer:
            raise HTTPException(403, "organizers only")
        query = query.where(Event.organizer_id == user.id).order_by(Event.starts_at.desc())
    elif scope == "all":
        if user is None or user.role != UserRole.platform_admin:
            raise HTTPException(403, "platform admins only")
        query = query.order_by(Event.created_at.desc())
    else:
        raise HTTPException(422, "unknown event scope")
    if city:
        query = query.where(Event.details["city"].as_string() == city)
    if category:
        query = query.where(Event.details["category"].as_string() == category)
    if q.strip():
        pattern = f"%{q.strip()}%"
        query = query.where(
            or_(
                Event.title.ilike(pattern),
                Event.organizer_name.ilike(pattern),
                Event.details["summary"].as_string().ilike(pattern),
                Event.details["venue_name"].as_string().ilike(pattern),
            )
        )
    rows = (await db.scalars(query.limit(limit))).all()
    return [await event_read(db, row) for row in rows]


def editable(event: Event) -> None:
    if event.status in {"cancelled", "suspended"}:
        raise HTTPException(409, f"this event is {event.status}")


async def replace_types(
    db: AsyncSession,
    event: Event,
    values: list[TicketTypeWrite],
    *,
    creating: bool = False,
) -> None:
    existing = {str(t.id): t for t in await types_for(db, event.id)}
    kept = set()
    for value in values:
        row = existing.get(value.id) if not creating else None
        if value.id and not creating and row is None:
            raise HTTPException(422, "ticket type does not belong to this event")
        if row is None:
            row = TicketType(event_id=event.id, sold=0)
            db.add(row)
        else:
            kept.add(value.id)
        if value.quantity < row.sold:
            raise HTTPException(409, "quantity cannot be lower than tickets already sold")
        for name in TicketTypeWrite.model_fields:
            if name not in {"id", "sold"}:
                setattr(row, name, getattr(value, name))
    for key, row in existing.items():
        if key in kept:
            continue
        ticket = await db.scalar(select(Ticket.id).where(Ticket.ticket_type_id == row.id).limit(1))
        if row.sold > 0 or ticket is not None:
            raise HTTPException(
                409, "a ticket type with issued tickets must be hidden, not deleted"
            )
        await db.delete(row)


def apply_input(event: Event, data: EventWrite) -> None:
    column_names = {
        "title",
        "starts_at",
        "ends_at",
        "visibility",
        "registration_starts_at",
        "registration_ends_at",
    }
    for key in column_names:
        setattr(event, key, getattr(data, key))
    event.details = data.model_dump(mode="json", exclude=column_names | {"ticket_types"})
    event.updated_at = datetime.now(UTC)


async def create_event(db: AsyncSession, user: User, data: EventWrite) -> EventRead:
    if user.role != UserRole.organizer:
        raise HTTPException(403, "organizers only")
    profile = await db.scalar(select(OrganizerProfile).where(OrganizerProfile.user_id == user.id))
    event = Event(
        organizer_id=user.id,
        organizer_name=profile.display_name if profile else user.full_name,
        status="draft",
        paid_sales_active=False,
    )
    apply_input(event, data)
    db.add(event)
    await db.flush()
    await replace_types(db, event, data.ticket_types, creating=True)
    audit(db, event, user, "Created event as draft")
    await db.commit()
    await db.refresh(event)
    return await event_read(db, event)


async def update_event(db: AsyncSession, user: User, event_id: UUID, data: EventWrite) -> EventRead:
    event = await get_event(db, event_id, user, manage=True, lock=True)
    editable(event)
    await replace_types(db, event, data.ticket_types)
    apply_input(event, data)
    audit(db, event, user, "Edited event details and ticket types")
    await db.commit()
    await db.refresh(event)
    return await event_read(db, event)


async def set_types(db, user, event_id, data):
    event = await get_event(db, event_id, user, manage=True, lock=True)
    editable(event)
    await replace_types(db, event, data)
    event.updated_at = datetime.now(UTC)
    audit(db, event, user, "Updated ticket types")
    await db.commit()
    return [type_read(t) for t in await types_for(db, event.id)]


async def status_action(db, user, event_id, action):
    event = await get_event(db, event_id, user, manage=True, lock=True)
    editable(event)
    if action == "publish":
        if utc(event.starts_at) <= datetime.now(UTC):
            raise HTTPException(409, "cannot publish an event that has already started")
        event.status = "published"
    elif action == "unpublish":
        event.status = "draft"
    elif action == "cancel":
        from app.services.ticketing import refund_event_orders

        await refund_event_orders(db, event)
        event.status = "cancelled"
    else:
        raise HTTPException(422, "unknown status action")
    event.updated_at = datetime.now(UTC)
    audit(db, event, user, f"Event {action} (refunds simulated when cancelled)")
    await db.commit()
    await db.refresh(event)
    return await event_read(db, event)


async def duplicate_event(db, user, event_id):
    source = await get_event(db, event_id, user, manage=True)
    view = await event_read(db, source)
    data = EventWrite.model_validate(view.model_dump(include=set(EventWrite.model_fields)))
    data.title = source.title[:113] + " (copy)"
    for ticket in data.ticket_types:
        ticket.id, ticket.sold = "", 0
    # create_event always creates new IDs and draft status, without activation/orders/promos.
    return await create_event(db, user, data)


async def activate(db, user, event_id, data: ActivationRequest):
    event = await get_event(db, event_id, user, manage=True, lock=True)
    editable(event)
    if not user.is_email_verified:
        raise HTTPException(403, "verify your email before activating paid sales")
    if not any(t.price > 0 for t in await types_for(db, event.id)):
        raise HTTPException(409, "add a paid ticket type first")
    if not event.paid_sales_active:
        event.paid_sales_active = True
        event.activation = {
            "simulated": True,
            "feeKzt": settings.paid_activation_fee_kzt,
            "payoutAccountMasked": data.payout_iban[:4] + "…" + data.payout_iban[-4:],
            "termsAccepted": data.terms_accepted,
            "at": datetime.now(UTC).isoformat(),
        }
        audit(db, event, user, "Completed simulated Paid Sales Activation")
        await db.commit()
        await db.refresh(event)
    return await event_read(db, event)


async def suspend(db, user, event_id, suspended):
    if user.role != UserRole.platform_admin:
        raise HTTPException(403, "platform admins only")
    event = await get_event(db, event_id, user, manage=True, lock=True)
    if event.status == "cancelled":
        raise HTTPException(409, "a cancelled event cannot be reopened")
    if not suspended and event.status != "suspended":
        raise HTTPException(409, "event is not suspended")
    event.status = "suspended" if suspended else "draft"
    audit(db, event, user, "Suspended event" if suspended else "Returned suspended event to draft")
    await db.commit()
    await db.refresh(event)
    return await event_read(db, event)


async def history(db, user, event_id):
    await get_event(db, event_id, user, manage=True)
    rows = (
        await db.scalars(
            select(AuditLog).where(AuditLog.event_id == event_id).order_by(AuditLog.at.desc())
        )
    ).all()
    return [read_model(AuditRead, row) for row in rows]


async def sample_events(db, user):
    if settings.environment not in {"local", "test"}:
        raise HTTPException(403, "sample creation is available in development only")
    now = datetime.now(UTC)
    for title, category, city in (
        ("BiletFlow university meetup", "tech", "Astana"),
        ("BiletFlow live music demo", "music", "Almaty"),
    ):
        created = await create_event(
            db,
            user,
            EventWrite(
                title=title,
                summary="A sample event for the academic demo",
                description="Demo event",
                category=category,
                city=city,
                venue_name="University Hall",
                venue_address="Demo venue",
                starts_at=now + timedelta(days=14),
                ends_at=now + timedelta(days=14, hours=3),
                ticket_types=[TicketTypeWrite(name="General admission", quantity=50)],
            ),
        )
        await status_action(db, user, created.id, "publish")


async def assign_staff(db, user, event_id, email):
    event = await get_event(db, event_id, user, manage=True, lock=True)
    staff = await db.scalar(select(User).where(User.email == email.lower()))
    if staff is None or staff.role != UserRole.event_admin or not staff.is_active:
        raise HTTPException(422, "use an active, internally provisioned Event Admin account")
    if await db.get(StaffAssignment, (event.id, staff.id)) is None:
        db.add(StaffAssignment(event_id=event.id, user_id=staff.id))
        audit(db, event, user, f"Assigned Event Admin {staff.full_name}")
        await db.commit()
    return {"detail": "staff assigned"}


async def revoke_staff(db, user, event_id, staff_id):
    event = await get_event(db, event_id, user, manage=True, lock=True)
    await db.execute(
        delete(StaffAssignment).where(
            StaffAssignment.event_id == event.id,
            StaffAssignment.user_id == staff_id,
        )
    )
    audit(db, event, user, "Removed Event Admin assignment")
    await db.commit()
