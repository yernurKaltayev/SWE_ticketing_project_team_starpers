"""P3 ticket-type management and safe inventory operations.

Important transaction contract: reserve/release/confirm/refund/check_in DO NOT
commit. Callers must commit them in the same transaction as their order/ticket
changes. The write predicates prevent overselling on PostgreSQL under contention.
"""

import uuid
from datetime import UTC, datetime

from pydantic import ValidationError
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, UnprocessableError
from app.models.event import Event, EventStatus, EventVisibility
from app.models.ticket_type import TicketType
from app.models.user import User
from app.schemas.ticket_type_p3 import (
    EventAvailability,
    PublicTicketAvailability,
    TicketTypeCreate,
    TicketTypeOut,
    TicketTypeUpdate,
)
from app.services.audit_service import audit

CONFIG_FIELDS = (
    "name",
    "description",
    "price_amount",
    "currency",
    "quantity_total",
    "is_free",
    "sales_start",
    "sales_end",
    "max_per_order",
    "is_hidden",
    "price_category",
)


def _available(ticket: TicketType) -> int:
    # qty_sold is cumulative; refunded purchases restore capacity.
    return max(
        0, ticket.quantity_total - ticket.qty_reserved - ticket.qty_sold + ticket.qty_refunded
    )


def _ticket_out(ticket: TicketType) -> TicketTypeOut:
    return TicketTypeOut.model_validate(
        {
            **{key: getattr(ticket, key) for key in CONFIG_FIELDS},
            "id": ticket.id,
            "event_id": ticket.event_id,
            "qty_reserved": ticket.qty_reserved,
            "qty_sold": ticket.qty_sold,
            "qty_refunded": ticket.qty_refunded,
            "qty_checked_in": ticket.qty_checked_in,
            "qty_available": _available(ticket),
        }
    )


def _registration_open(event: Event, now: datetime) -> bool:
    return (
        event.status == EventStatus.published
        and now < event.starts_at
        and (event.registration_opens_at is None or now >= event.registration_opens_at)
        and (event.registration_closes_at is None or now < event.registration_closes_at)
    )


def _paid_sales_active(event: Event) -> bool:
    # Fail closed for new/unknown P6 states. Confirm exact enum in live repo.
    value = getattr(event.paid_sales_status, "value", event.paid_sales_status)
    return value in {"active", "enabled"}


def _sales_open(event: Event, ticket: TicketType, now: datetime) -> bool:
    return (
        _registration_open(event, now)
        and not ticket.is_hidden
        and (ticket.sales_start is None or now >= ticket.sales_start)
        and (ticket.sales_end is None or now < ticket.sales_end)
        and (ticket.is_free or _paid_sales_active(event))
    )


async def _lock_event(db: AsyncSession, event_id: uuid.UUID) -> Event:
    event = await db.scalar(select(Event).where(Event.id == event_id).with_for_update())
    if event is None:
        raise NotFoundError("Event not found.", code="event_not_found")
    return event


def _validate_against_event(event: Event, data: TicketTypeCreate) -> None:
    if event.status == EventStatus.cancelled:
        raise ConflictError("Cancelled events cannot be edited.", code="event_cancelled")
    if data.sales_start is not None and data.sales_start >= event.ends_at:
        raise UnprocessableError(
            "Sales cannot begin after the event ends.", code="invalid_sales_window"
        )
    if data.sales_end is not None and data.sales_end > event.ends_at:
        raise UnprocessableError(
            "Sales cannot end after the event ends.", code="invalid_sales_window"
        )


async def _total_other_capacity(
    db: AsyncSession, event_id: uuid.UUID, exclude_id: uuid.UUID | None = None
) -> int:
    stmt = select(func.coalesce(func.sum(TicketType.quantity_total), 0)).where(
        TicketType.event_id == event_id
    )
    if exclude_id is not None:
        stmt = stmt.where(TicketType.id != exclude_id)
    return int((await db.scalar(stmt)) or 0)


async def list_ticket_types(db: AsyncSession, event_id: uuid.UUID) -> list[TicketTypeOut]:
    items = (
        await db.scalars(
            select(TicketType)
            .where(TicketType.event_id == event_id)
            .order_by(TicketType.name, TicketType.id)
        )
    ).all()
    return [_ticket_out(item) for item in items]


async def create_ticket_type(
    db: AsyncSession, event_id: uuid.UUID, user: User, data: TicketTypeCreate
) -> TicketTypeOut:
    event = await _lock_event(db, event_id)
    _validate_against_event(event, data)
    if await _total_other_capacity(db, event_id) + data.quantity_total > event.capacity:
        raise UnprocessableError("Ticket totals exceed event capacity.", code="capacity_exceeded")
    item = TicketType(
        event_id=event_id,
        **data.model_dump(),
        qty_reserved=0,
        qty_sold=0,
        qty_refunded=0,
        qty_checked_in=0,
    )
    db.add(item)
    await db.flush()
    audit(
        db,
        action_type="ticket_type_created",
        entity_type="ticket_type",
        entity_id=item.id,
        event_id=event_id,
        actor=user,
        description="Created ticket type",
    )
    await db.commit()
    return _ticket_out(item)


async def update_ticket_type(
    db: AsyncSession,
    event_id: uuid.UUID,
    ticket_type_id: uuid.UUID,
    user: User,
    data: TicketTypeUpdate,
) -> TicketTypeOut:
    event = await _lock_event(db, event_id)
    item = await db.scalar(
        select(TicketType)
        .where(TicketType.id == ticket_type_id, TicketType.event_id == event_id)
        .with_for_update()
    )
    if item is None:
        raise NotFoundError("Ticket type not found.", code="ticket_type_not_found")
    changes = data.model_dump(exclude_unset=True)
    if not changes:
        return _ticket_out(item)
    try:
        merged = TicketTypeCreate.model_validate(
            {
                **{key: getattr(item, key) for key in CONFIG_FIELDS},
                **changes,
            }
        )
    except ValidationError as exc:
        raise UnprocessableError(
            "Invalid ticket configuration.", code="invalid_ticket_update"
        ) from exc
    _validate_against_event(event, merged)
    already_allocated = item.qty_reserved + item.qty_sold - item.qty_refunded
    if merged.quantity_total < already_allocated:
        raise ConflictError(
            "Quantity is below existing reservations and sales.", code="quantity_below_allocated"
        )
    if merged.quantity_total + await _total_other_capacity(db, event_id, item.id) > event.capacity:
        raise UnprocessableError("Ticket totals exceed event capacity.", code="capacity_exceeded")
    if (item.qty_reserved or item.qty_sold) and any(
        key in changes and changes[key] != getattr(item, key)
        for key in ("price_amount", "currency", "is_free")
    ):
        raise ConflictError(
            "Cannot change ticket pricing after reservations or sales.", code="price_locked"
        )
    for key in changes:
        setattr(item, key, getattr(merged, key))
    audit(
        db,
        action_type="ticket_type_updated",
        entity_type="ticket_type",
        entity_id=item.id,
        event_id=event_id,
        actor=user,
        description="Updated ticket type",
        metadata={"fields": sorted(changes)},
    )
    await db.commit()
    return _ticket_out(item)


async def public_availability(
    db: AsyncSession, event_id: uuid.UUID, now: datetime | None = None
) -> EventAvailability:
    event = await db.get(Event, event_id)
    if (
        event is None
        or event.status != EventStatus.published
        or event.visibility != EventVisibility.public
    ):
        raise NotFoundError("Event not found.", code="event_not_found")
    now = now or datetime.now(UTC)
    registration_open = _registration_open(event, now)
    items = (
        await db.scalars(
            select(TicketType)
            .where(TicketType.event_id == event_id, TicketType.is_hidden.is_(False))
            .order_by(TicketType.name, TicketType.id)
        )
    ).all()
    return EventAvailability(
        event_id=event_id,
        registration_open=registration_open,
        ticket_types=[
            PublicTicketAvailability(
                id=item.id,
                name=item.name,
                description=item.description,
                is_free=item.is_free,
                price_amount=item.price_amount,
                currency=item.currency,
                max_per_order=item.max_per_order,
                quantity_available=_available(item) if _sales_open(event, item, now) else 0,
                sales_open=_sales_open(event, item, now),
            )
            for item in items
        ],
    )


async def reserve_inventory(
    db: AsyncSession,
    event_id: uuid.UUID,
    ticket_type_id: uuid.UUID,
    quantity: int,
    now: datetime | None = None,
) -> bool:
    """Atomically reserve units; do not commit (checkout owns transaction)."""
    if quantity <= 0:
        raise UnprocessableError("Quantity must be positive.", code="invalid_quantity")
    event = await _lock_event(db, event_id)
    ticket = await db.scalar(
        select(TicketType)
        .where(TicketType.event_id == event_id, TicketType.id == ticket_type_id)
        .with_for_update()
    )
    if ticket is None:
        raise NotFoundError("Ticket type not found.", code="ticket_type_not_found")
    if quantity > ticket.max_per_order:
        raise UnprocessableError("Per-order ticket limit exceeded.", code="order_limit_exceeded")
    if not _sales_open(event, ticket, now or datetime.now(UTC)):
        raise ConflictError("Sales are not open for this ticket.", code="sales_closed")
    stmt = (
        update(TicketType)
        .where(
            TicketType.id == ticket_type_id,
            TicketType.event_id == event_id,
            TicketType.qty_reserved + TicketType.qty_sold - TicketType.qty_refunded + quantity
            <= TicketType.quantity_total,
        )
        .values(qty_reserved=TicketType.qty_reserved + quantity)
        .returning(TicketType.id)
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None


async def release_inventory(db: AsyncSession, ticket_type_id: uuid.UUID, quantity: int) -> bool:
    """Release an existing reservation; never allow counters to go negative."""
    if quantity <= 0:
        raise UnprocessableError("Quantity must be positive.", code="invalid_quantity")
    stmt = (
        update(TicketType)
        .where(TicketType.id == ticket_type_id, TicketType.qty_reserved >= quantity)
        .values(qty_reserved=TicketType.qty_reserved - quantity)
        .returning(TicketType.id)
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None


async def confirm_inventory(db: AsyncSession, ticket_type_id: uuid.UUID, quantity: int) -> bool:
    """Move reserved to sold, in the same transaction as confirmed payment/order."""
    if quantity <= 0:
        raise UnprocessableError("Quantity must be positive.", code="invalid_quantity")
    stmt = (
        update(TicketType)
        .where(TicketType.id == ticket_type_id, TicketType.qty_reserved >= quantity)
        .values(
            qty_reserved=TicketType.qty_reserved - quantity, qty_sold=TicketType.qty_sold + quantity
        )
        .returning(TicketType.id)
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None


async def refund_inventory(db: AsyncSession, ticket_type_id: uuid.UUID, quantity: int) -> bool:
    if quantity <= 0:
        raise UnprocessableError("Quantity must be positive.", code="invalid_quantity")
    stmt = (
        update(TicketType)
        .where(
            TicketType.id == ticket_type_id,
            TicketType.qty_sold - TicketType.qty_refunded - TicketType.qty_checked_in >= quantity,
        )
        .values(qty_refunded=TicketType.qty_refunded + quantity)
        .returning(TicketType.id)
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None


async def check_in_inventory(db: AsyncSession, ticket_type_id: uuid.UUID, quantity: int) -> bool:
    if quantity <= 0:
        raise UnprocessableError("Quantity must be positive.", code="invalid_quantity")
    stmt = (
        update(TicketType)
        .where(
            TicketType.id == ticket_type_id,
            TicketType.qty_sold - TicketType.qty_refunded - TicketType.qty_checked_in >= quantity,
        )
        .values(qty_checked_in=TicketType.qty_checked_in + quantity)
        .returning(TicketType.id)
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None
