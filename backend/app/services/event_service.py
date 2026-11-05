"""P2 event discovery and lifecycle operations.

Service functions own their transactions. Order-bearing event cancellations and image
uploads require cross-team integrations not yet available on master.
"""

import uuid
from copy import deepcopy
from datetime import UTC, datetime

from pydantic import ValidationError
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import check_event_access
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, UnprocessableError
from app.core.pagination import Page, PageParams, paginate
from app.models.event import Event, EventStatus, EventVisibility, PaidSalesStatus
from app.models.order import Order
from app.models.ticket_type import TicketType
from app.models.user import OrganizerProfile, User
from app.models.venue import Venue, VenueLayout
from app.schemas.event import EventCreate, EventOut, EventUpdate
from app.services.audit_service import audit

_EDITABLE_FIELDS = (
    "title",
    "description",
    "category",
    "venue_id",
    "layout_id",
    "starts_at",
    "ends_at",
    "timezone",
    "visibility",
    "seating_mode",
    "capacity",
    "registration_opens_at",
    "registration_closes_at",
)


def _out(event: Event, *, reveal_token: bool = False) -> EventOut:
    """Do not disclose unguessable share tokens in public lists/details."""
    value = EventOut.model_validate(
        {
            **{field: getattr(event, field) for field in _EDITABLE_FIELDS},
            "id": event.id,
            "status": event.status,
            "paid_sales_status": event.paid_sales_status,
            "share_token": event.share_token,
            "images": event.image_urls,
        }
    )
    return value if reveal_token else value.model_copy(update={"share_token": ""})


async def _validate_venue(
    db: AsyncSession, venue_id: uuid.UUID, layout_id: uuid.UUID | None
) -> None:
    if await db.get(Venue, venue_id) is None:
        raise NotFoundError("The venue was not found.", code="venue_not_found")
    if layout_id is not None:
        layout = await db.get(VenueLayout, layout_id)
        if layout is None or layout.venue_id != venue_id:
            raise UnprocessableError(
                "The selected layout must belong to the selected venue.",
                code="layout_venue_mismatch",
            )


async def _organizer_profile(db: AsyncSession, user: User) -> OrganizerProfile:
    profile = await db.scalar(select(OrganizerProfile).where(OrganizerProfile.user_id == user.id))
    if profile is None:
        raise ForbiddenError(
            "Create an organizer profile first.", code="organizer_profile_required"
        )
    return profile


async def create_event(db: AsyncSession, user: User, data: EventCreate) -> EventOut:
    profile = await _organizer_profile(db, user)
    await _validate_venue(db, data.venue_id, data.layout_id)
    event = Event(
        organizer_id=profile.id,
        **data.model_dump(),
        image_urls=[],
        refund_policy={},
        status=EventStatus.draft,
        paid_sales_status=PaidSalesStatus.disabled,
    )
    db.add(event)
    await db.flush()
    audit(
        db,
        action_type="event_created",
        entity_type="event",
        entity_id=event.id,
        event_id=event.id,
        actor=user,
        description="Created a draft event",
    )
    await db.commit()
    return _out(event, reveal_token=True)


async def public_events(
    db: AsyncSession,
    params: PageParams,
    *,
    q: str | None = None,
    category: str | None = None,
    city: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> Page[EventOut]:
    for field_name, value in (("date_from", date_from), ("date_to", date_to)):
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise UnprocessableError(
                f"{field_name} must include a UTC offset.", code="invalid_date_filter"
            )
    if date_from is not None and date_to is not None and date_from > date_to:
        raise UnprocessableError("date_from must not exceed date_to.", code="invalid_date_range")
    stmt = select(Event).where(
        Event.status == EventStatus.published,
        Event.visibility == EventVisibility.public,
    )
    if q:
        text = f"%{q.strip()}%"
        stmt = stmt.where(or_(Event.title.ilike(text), Event.description.ilike(text)))
    if category:
        stmt = stmt.where(Event.category.ilike(category.strip()))
    if city:
        stmt = stmt.join(Venue, Event.venue_id == Venue.id).where(Venue.city.ilike(city.strip()))
    if date_from:
        stmt = stmt.where(Event.starts_at >= date_from)
    if date_to:
        stmt = stmt.where(Event.starts_at <= date_to)
    page = await paginate(db, stmt.order_by(Event.starts_at, Event.id), params)
    return Page(
        items=[_out(event) for event in page.items],
        total=page.total,
        limit=page.limit,
        offset=page.offset,
    )


async def own_events(db: AsyncSession, user: User, params: PageParams) -> Page[EventOut]:
    profile = await _organizer_profile(db, user)
    page = await paginate(
        db,
        select(Event)
        .where(Event.organizer_id == profile.id)
        .order_by(Event.created_at.desc(), Event.id),
        params,
    )
    return Page(
        items=[_out(event, reveal_token=True) for event in page.items],
        total=page.total,
        limit=page.limit,
        offset=page.offset,
    )


async def event_details(db: AsyncSession, event_id: uuid.UUID, user: User | None) -> EventOut:
    event = await db.get(Event, event_id)
    if event is None:
        raise NotFoundError("The event was not found.", code="event_not_found")
    if event.status == EventStatus.published and event.visibility == EventVisibility.public:
        # A public read never exposes its token (even if the caller happens to be the organizer).
        return _out(event)
    if user is not None:
        try:
            await check_event_access(db, user, event_id)
        except ForbiddenError:
            pass
        else:
            return _out(event, reveal_token=True)
    # Hide non-public IDs and drafts from anyone without event access.
    raise NotFoundError("The event was not found.", code="event_not_found")


async def event_by_token(db: AsyncSession, token: str) -> EventOut:
    event = await db.scalar(select(Event).where(Event.share_token == token))
    if event is None or event.status != EventStatus.published:
        raise NotFoundError("The event was not found.", code="event_not_found")
    return _out(event, reveal_token=True)


async def _locked_event(db: AsyncSession, event_id: uuid.UUID) -> Event:
    # Synchronizes concurrent edits/publishes for the same event on PostgreSQL.
    event = await db.scalar(select(Event).where(Event.id == event_id).with_for_update())
    if event is None:
        raise NotFoundError("The event was not found.", code="event_not_found")
    return event


async def _ticket_quantity(db: AsyncSession, event_id: uuid.UUID) -> int:
    count = await db.scalar(
        select(func.coalesce(func.sum(TicketType.quantity_total), 0)).where(
            TicketType.event_id == event_id
        )
    )
    return int(count or 0)


async def _has_orders(db: AsyncSession, event_id: uuid.UUID) -> bool:
    statement = select(Order.id).where(Order.event_id == event_id).limit(1)
    return (await db.scalar(statement)) is not None


async def update_event(
    db: AsyncSession, event_id: uuid.UUID, user: User, data: EventUpdate
) -> EventOut:
    event = await _locked_event(db, event_id)
    if event.status == EventStatus.cancelled:
        raise ConflictError("Cancelled events cannot be edited.", code="event_cancelled")
    changes = data.model_dump(exclude_unset=True)
    if not changes:
        return _out(event, reveal_token=True)
    # A nullable PATCH schema is part of the agreed contract; preserve SQL NOT NULL rules.
    for key in changes:
        if changes[key] is None and key not in {
            "layout_id",
            "registration_opens_at",
            "registration_closes_at",
        }:
            raise UnprocessableError(f"{key} cannot be null.", code="null_event_field")
    current = {key: getattr(event, key) for key in _EDITABLE_FIELDS}
    try:
        merged = EventCreate.model_validate(current | changes)
    except ValidationError as exc:
        raise UnprocessableError(
            "The updated event configuration is invalid.",
            code="invalid_event_update",
            details=[
                {
                    "field": ".".join(map(str, err["loc"])),
                    "message": err["msg"],
                    "type": err["type"],
                }
                for err in exc.errors()
            ],
        ) from exc
    await _validate_venue(db, merged.venue_id, merged.layout_id)
    if "capacity" in changes and merged.capacity < await _ticket_quantity(db, event_id):
        raise UnprocessableError(
            "Capacity cannot be lower than the total configured ticket quantity.",
            code="capacity_below_ticket_quantity",
        )
    seating_changed = any(
        getattr(event, key) != changes[key]
        for key in {"venue_id", "layout_id", "seating_mode"} & changes.keys()
    )
    if seating_changed and await _has_orders(db, event_id):
        raise ConflictError(
            "Cannot change venue or seating after orders have been placed.",
            code="event_seating_locked",
        )
    original_capacity = event.capacity
    for key, value in changes.items():
        setattr(event, key, value)
    audit(
        db,
        action_type="event_updated",
        entity_type="event",
        entity_id=event.id,
        event_id=event.id,
        actor=user,
        description="Updated event configuration",
        metadata={
            "fields": sorted(changes),
            "capacity_from": original_capacity,
            "capacity_to": event.capacity,
        },
    )
    await db.commit()
    return _out(event, reveal_token=True)


async def publish_event(db: AsyncSession, event_id: uuid.UUID, user: User) -> EventOut:
    event = await _locked_event(db, event_id)
    if event.status != EventStatus.draft:
        raise ConflictError("Only draft events can be published.", code="invalid_event_status")
    quantity = await _ticket_quantity(db, event_id)
    if quantity < 1:
        raise UnprocessableError(
            "Create at least one ticket type before publishing.", code="ticket_type_required"
        )
    if event.capacity < quantity:
        raise UnprocessableError(
            "Event capacity must be at least the sum of ticket quantities.",
            code="capacity_below_ticket_quantity",
        )
    event.status = EventStatus.published
    audit(
        db,
        action_type="event_published",
        entity_type="event",
        entity_id=event.id,
        event_id=event.id,
        actor=user,
        description="Published event",
    )
    await db.commit()
    return _out(event, reveal_token=True)


async def unpublish_event(db: AsyncSession, event_id: uuid.UUID, user: User) -> EventOut:
    event = await _locked_event(db, event_id)
    if event.status != EventStatus.published:
        raise ConflictError(
            "Only published events can be unpublished.", code="invalid_event_status"
        )
    if await _has_orders(db, event_id):
        raise ConflictError(
            "An event with orders cannot be unpublished; use the cancellation/refund flow.",
            code="event_has_orders",
        )
    event.status = EventStatus.draft
    audit(
        db,
        action_type="event_unpublished",
        entity_type="event",
        entity_id=event.id,
        event_id=event.id,
        actor=user,
        description="Returned event to draft",
    )
    await db.commit()
    return _out(event, reveal_token=True)


async def duplicate_event(db: AsyncSession, event_id: uuid.UUID, user: User) -> EventOut:
    """Copy event and ticket-type configuration, never transactions or issued tickets."""
    source = await _locked_event(db, event_id)
    clone = Event(
        organizer_id=source.organizer_id,
        **{key: deepcopy(getattr(source, key)) for key in _EDITABLE_FIELDS},
        image_urls=deepcopy(source.image_urls),
        refund_policy=deepcopy(source.refund_policy),
        duplicated_from_id=source.id,
        status=EventStatus.draft,
        paid_sales_status=PaidSalesStatus.disabled,
    )
    db.add(clone)
    await db.flush()
    original_types = (
        await db.scalars(select(TicketType).where(TicketType.event_id == source.id))
    ).all()
    for item in original_types:
        db.add(
            TicketType(
                event_id=clone.id,
                name=item.name,
                description=item.description,
                price_amount=item.price_amount,
                currency=item.currency,
                quantity_total=item.quantity_total,
                is_free=item.is_free,
                sales_start=item.sales_start,
                sales_end=item.sales_end,
                max_per_order=item.max_per_order,
                is_hidden=item.is_hidden,
                price_category=item.price_category,
                qty_reserved=0,
                qty_sold=0,
                qty_refunded=0,
                qty_checked_in=0,
            )
        )
    audit(
        db,
        action_type="event_duplicated",
        entity_type="event",
        entity_id=clone.id,
        event_id=clone.id,
        actor=user,
        description="Duplicated event configuration",
        metadata={"original_event_id": str(source.id)},
    )
    await db.commit()
    return _out(clone, reveal_token=True)


async def cancel_event(db: AsyncSession, event_id: uuid.UUID, user: User) -> EventOut:
    """Cancel an event with no orders. Never leave purchases unrefunded."""
    event = await _locked_event(db, event_id)
    if event.status == EventStatus.cancelled:
        raise ConflictError("Event is already cancelled.", code="event_cancelled")
    if await _has_orders(db, event_id):
        raise ConflictError(
            "Event has orders; the P7 refund and P9 notification workflow must be "
            "integrated before it can be cancelled safely.",
            code="event_cancellation_requires_refund_flow",
        )
    event.status = EventStatus.cancelled
    event.cancelled_at = datetime.now(UTC)
    event.paid_sales_status = PaidSalesStatus.disabled
    audit(
        db,
        action_type="event_cancelled",
        entity_type="event",
        entity_id=event.id,
        event_id=event.id,
        actor=user,
        description="Cancelled an event with no orders",
    )
    await db.commit()
    return _out(event, reveal_token=True)
