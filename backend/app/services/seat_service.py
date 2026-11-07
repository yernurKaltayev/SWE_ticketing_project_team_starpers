"""P4 assigned-seat discovery, atomic multi-seat holds, release and expiry.

Integration boundaries:
* Requires the existing P2 Event and P3 TicketType / inventory service.
* P4 uses existing seat_holds (including legacy P0 rows) as its only seat
  reservation ledger. seat_hold_groups represents multi-seat checkout groups.
* Create/release commit in their service functions; confirm_hold deliberately
  DOES NOT commit, so P5 can atomically settle payment/order/tickets and mark seats sold.
* All mutating paths acquire the Event row lock FIRST to avoid deadlocks and
  serialize claims for the same event, with the DB unique index as a backstop.
"""

from __future__ import annotations

from datetime import datetime
from importlib import import_module
from uuid import UUID, uuid4

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, UnprocessableError
from app.models.event import Event, EventStatus, EventVisibility
from app.models.ticket_type import TicketType
from app.models.venue import Venue, VenueLayout
from app.schemas.seat_p4 import (
    HoldCreateP4,
    HoldResponseP4,
    LayoutSummaryP4,
    SeatMapP4,
    SeatP4,
    VenueSummaryP4,
)
from app.services.hold_policy_p4 import HOLD_DURATION, category_matches, now_utc
from app.services.ticket_type_service import (
    confirm_inventory,
    release_inventory,
    reserve_inventory,
)


def _venue_hierarchy():
    """Resolve existing P0 models without creating duplicate venue tables.

    Verify these class names and FK columns against backend/app/models/venue.py.
    """
    mod = import_module("app.models.venue")

    def pick(*names):
        for name in names:
            value = getattr(mod, name, None)
            if value is not None and hasattr(value, "__table__"):
                return value
        raise RuntimeError(f"P4 adapter: none of these venue models exists: {names}")

    section = pick("VenueSection", "Section", "SeatingSection")
    row = pick("VenueRow", "SeatRow", "Row", "SeatingRow")
    seat = pick("VenueSeat", "Seat", "SeatingSeat")
    for model, column in ((section, "layout_id"), (row, "section_id"), (seat, "row_id")):
        if not hasattr(model, column):
            raise RuntimeError(f"P4 adapter: {model.__name__}.{column} is required")
    return section, row, seat


def _value(obj, *keys, default=None):
    for key in keys:
        value = getattr(obj, key, None)
        if value is not None:
            return value
    return default


def _enum_value(value):
    return getattr(value, "value", value)


def _seat_out(seat, row, section, status: str) -> SeatP4:
    return SeatP4(
        id=seat.id,
        section=str(_value(section, "name", "label", default="Section")),
        row=str(_value(row, "name", "label", "number", default="Row")),
        label=str(_value(seat, "label", "number", "name", default=str(seat.id))),
        price_category=_value(seat, "price_category", default=_value(section, "price_category")),
        accessible=bool(_value(seat, "is_accessible", "accessible", default=False)),
        status=status,
    )


async def list_venues(db: AsyncSession) -> list[VenueSummaryP4]:
    venues = (await db.scalars(select(Venue).order_by(Venue.name, Venue.id))).all()
    return [
        VenueSummaryP4(id=v.id, name=v.name, address=_value(v, "address"), city=_value(v, "city"))
        for v in venues
    ]


async def get_venue(db: AsyncSession, venue_id: UUID) -> VenueSummaryP4:
    item = await db.get(Venue, venue_id)
    if item is None:
        raise NotFoundError("Venue not found.", code="venue_not_found")
    return VenueSummaryP4(
        id=item.id, name=item.name, address=_value(item, "address"), city=_value(item, "city")
    )


async def list_layouts(db: AsyncSession, venue_id: UUID) -> list[LayoutSummaryP4]:
    await get_venue(db, venue_id)
    layouts = (
        await db.scalars(
            select(VenueLayout).where(VenueLayout.venue_id == venue_id).order_by(VenueLayout.id)
        )
    ).all()
    return [
        LayoutSummaryP4(
            id=x.id, venue_id=x.venue_id, name=str(_value(x, "name", "label", default="Layout"))
        )
        for x in layouts
    ]


async def _published_event(db: AsyncSession, event_id: UUID, *, lock: bool = False) -> Event:
    stmt = select(Event).where(Event.id == event_id)
    if lock:
        stmt = stmt.with_for_update()
    event = await db.scalar(stmt)
    if (
        event is None
        or event.status != EventStatus.published
        or event.visibility != EventVisibility.public
    ):
        # Avoid leaking draft and private event IDs in the public seat API.
        raise NotFoundError("Event not found.", code="event_not_found")
    if _enum_value(event.seating_mode) != "assigned" or event.layout_id is None:
        raise ConflictError(
            "This event does not use assigned seating.", code="not_assigned_seating"
        )
    return event


async def _layout_seats(db: AsyncSession, layout_id: UUID):
    section, row, seat = _venue_hierarchy()
    stmt = (
        select(seat, row, section)
        .join(row, seat.row_id == row.id)
        .join(section, row.section_id == section.id)
        .where(section.layout_id == layout_id)
        .order_by(section.id, row.id, seat.id)
    )
    return (await db.execute(stmt)).all()


async def _seat_status(db: AsyncSession, event_id: UUID, now: datetime) -> dict[UUID, str]:
    """Read the single P0/P4 seat ledger; converted seats are sold."""
    rows = (
        await db.execute(
            text("""
        SELECT s.seat_id,
               CASE WHEN s.status = 'converted' THEN 'sold' ELSE 'held' END AS status
          FROM seat_holds s
          LEFT JOIN seat_hold_groups g ON g.id = s.hold_group_id
         WHERE s.event_id = :event_id
           AND (s.status = 'converted'
                OR (s.status = 'held' AND s.expires_at > :now
                    AND (s.hold_group_id IS NULL
                         OR (g.status = 'held' AND g.expires_at > :now))))
    """),
            {"event_id": event_id, "now": now},
        )
    ).all()
    return dict(rows)


async def seat_map(db: AsyncSession, event_id: UUID, now: datetime | None = None) -> SeatMapP4:
    now = now or now_utc()
    event = await _published_event(db, event_id)
    layout = await db.get(VenueLayout, event.layout_id)
    if layout is None or layout.venue_id != event.venue_id:
        raise UnprocessableError(
            "Event layout does not belong to venue.", code="invalid_event_layout"
        )
    reserved = await _seat_status(db, event.id, now)
    rows = await _layout_seats(db, layout.id)
    return SeatMapP4(
        event_id=event.id,
        venue_id=event.venue_id,
        layout_id=layout.id,
        seats=[_seat_out(s, r, sec, reserved.get(s.id, "available")) for s, r, sec in rows],
    )


async def _expire_event(
    db: AsyncSession, event_id: UUID, now: datetime, *, max_groups: int | None = None
) -> int:
    """Caller MUST have locked Event; release P3 inventory exactly once.

    The background worker can bound a pass; on-demand expiration clears every
    overdue group before a new seat claim so stale unique-index rows never
    block a legitimate request.
    """
    sql = """SELECT id FROM seat_hold_groups
         WHERE event_id = :event_id AND status = 'held' AND expires_at <= :now
         ORDER BY id"""
    params = {"event_id": event_id, "now": now}
    if max_groups is not None:
        if max_groups < 1:
            return 0
        sql += " LIMIT :limit"
        params["limit"] = max_groups
    sql += " FOR UPDATE"
    groups = (await db.execute(text(sql), params)).scalars().all()
    # P0 legacy rows were not grouped and have no ticket type to reconcile.
    # Release their stale unique-index claims as well.
    await db.execute(
        text("""
        UPDATE seat_holds SET status = 'expired', updated_at = now()
         WHERE event_id = :event_id AND hold_group_id IS NULL
           AND status = 'held' AND expires_at <= :now
    """),
        {"event_id": event_id, "now": now},
    )
    if not groups:
        return 0
    for group_id in groups:
        counts = (
            await db.execute(
                text("""
            SELECT ticket_type_id, COUNT(*) AS n FROM seat_holds
             WHERE hold_group_id = :hold_id AND status = 'held'
             GROUP BY ticket_type_id
        """),
                {"hold_id": group_id},
            )
        ).all()
        for ticket_id, quantity in counts:
            if not await release_inventory(db, ticket_id, int(quantity)):
                raise ConflictError(
                    "Reserved ticket inventory is inconsistent.", code="inventory_inconsistent"
                )
        await db.execute(
            text("""
            UPDATE seat_holds SET status = 'expired', updated_at = now()
             WHERE hold_group_id = :hold_id AND status = 'held'
        """),
            {"hold_id": group_id},
        )
        await db.execute(
            text("""
            UPDATE seat_hold_groups SET status = 'expired'
             WHERE id = :hold_id AND status = 'held'
        """),
            {"hold_id": group_id},
        )
    return len(groups)


async def create_hold(
    db: AsyncSession, event_id: UUID, user_id: UUID, data: HoldCreateP4, now: datetime | None = None
) -> HoldResponseP4:
    now = now or now_utc()
    # Lock ordering invariant: Event -> group -> inventory -> write rows.
    event = await _published_event(db, event_id, lock=True)
    await _expire_event(db, event.id, now)
    layout = await db.get(VenueLayout, event.layout_id)
    if layout is None or layout.venue_id != event.venue_id:
        raise UnprocessableError("Invalid event seating layout.", code="invalid_event_layout")
    ticket = await db.get(TicketType, data.ticket_type_id)
    if ticket is None or ticket.event_id != event.id:
        raise UnprocessableError(
            "Ticket type is not valid for this event.", code="ticket_type_mismatch"
        )
    if len(data.seat_ids) > ticket.max_per_order:
        raise UnprocessableError("Per-order ticket limit exceeded.", code="order_limit_exceeded")

    rows = await _layout_seats(db, layout.id)
    requested = set(data.seat_ids)
    selected = {s.id: (s, sec) for s, _r, sec in rows if s.id in requested}
    if len(selected) != len(requested):
        raise UnprocessableError(
            "Every seat must belong to the event layout.", code="invalid_seat_ids"
        )
    for seat_id in requested:
        seat, section = selected[seat_id]
        category = _value(seat, "price_category", default=_value(section, "price_category"))
        if not category_matches(_enum_value(category), _enum_value(ticket.price_category)):
            raise UnprocessableError(
                "Seat category and ticket price category differ.", code="price_category_mismatch"
            )
    occupied = await _seat_status(db, event.id, now)
    if any(sid in occupied for sid in requested):
        raise ConflictError(
            "At least one requested seat is held or sold.", code="seats_unavailable"
        )

    # P3 enforces availability, registration window, hidden/paid sales gates,
    # and all inventory changes within this same transaction.
    if not await reserve_inventory(db, event.id, ticket.id, len(requested), now=now):
        raise ConflictError(
            "Not enough ticket inventory is available.", code="inventory_unavailable"
        )

    hold_id = uuid4()
    expiry = now + HOLD_DURATION
    await db.execute(
        text("""
        INSERT INTO seat_hold_groups (id, event_id, user_id, status, expires_at)
        VALUES (:id, :event_id, :user_id, 'held', :expires_at)
    """),
        {"id": hold_id, "event_id": event.id, "user_id": user_id, "expires_at": expiry},
    )
    for seat_id in sorted(requested):
        await db.execute(
            text("""
            INSERT INTO seat_holds
                (id, hold_group_id, event_id, seat_id, ticket_type_id,
                 user_id, session_id, order_id, status, expires_at,
                 created_at, updated_at)
            VALUES
                (:id, :hold_id, :event_id, :seat_id, :ticket_type_id,
                 :user_id, NULL, NULL, 'held', :expires_at,
                 now(), now())
        """),
            {
                "id": uuid4(),
                "hold_id": hold_id,
                "event_id": event.id,
                "seat_id": seat_id,
                "ticket_type_id": ticket.id,
                "user_id": user_id,
                "expires_at": expiry,
            },
        )
    await db.commit()
    return HoldResponseP4(
        id=hold_id, event_id=event.id, seat_ids=sorted(requested), status="held", expires_at=expiry
    )


async def release_hold(
    db: AsyncSession, event_id: UUID, hold_id: UUID, user_id: UUID, now: datetime | None = None
) -> None:
    now = now or now_utc()
    # Release must work even if an event was unpublished or cancelled.
    event = await db.scalar(select(Event).where(Event.id == event_id).with_for_update())
    if event is None:
        raise NotFoundError("Event not found.", code="event_not_found")
    row = (
        await db.execute(
            text("""
        SELECT user_id, status, expires_at FROM seat_hold_groups
         WHERE id = :hold_id AND event_id = :event_id FOR UPDATE
    """),
            {"hold_id": hold_id, "event_id": event_id},
        )
    ).first()
    if row is None or row.user_id != user_id:
        raise NotFoundError("Hold not found.", code="hold_not_found")
    await _expire_event(db, event_id, now)
    if row.status in ("released", "expired") or row.expires_at <= now:
        await db.commit()
        return
    if row.status == "sold":
        raise ConflictError("Sold seats cannot be released as a hold.", code="hold_already_sold")
    counts = (
        await db.execute(
            text("""
        SELECT ticket_type_id, COUNT(*) FROM seat_holds
         WHERE hold_group_id = :hold_id AND status = 'held' GROUP BY ticket_type_id
    """),
            {"hold_id": hold_id},
        )
    ).all()
    for ticket_id, quantity in counts:
        if not await release_inventory(db, ticket_id, int(quantity)):
            raise ConflictError(
                "Reserved ticket inventory is inconsistent.", code="inventory_inconsistent"
            )
    await db.execute(
        text("""
        UPDATE seat_holds SET status = 'released', updated_at = now()
         WHERE hold_group_id = :hold_id AND status = 'held'
    """),
        {"hold_id": hold_id},
    )
    await db.execute(
        text("""
        UPDATE seat_hold_groups SET status = 'released'
         WHERE id = :hold_id AND status = 'held'
    """),
        {"hold_id": hold_id},
    )
    await db.commit()


async def confirm_hold(
    db: AsyncSession, event_id: UUID, hold_id: UUID, user_id: UUID, now: datetime | None = None
) -> None:
    """P5 hook. Only call AFTER payment/order validation, in the SAME transaction.

    Unlike create/release, this function intentionally DOES NOT commit.
    P5 must commit the seat sale, ticket creation and order atomically.
    """
    now = now or now_utc()
    await _published_event(db, event_id, lock=True)
    group = (
        await db.execute(
            text("""
        SELECT user_id, status, expires_at FROM seat_hold_groups
         WHERE id = :hold_id AND event_id = :event_id FOR UPDATE
    """),
            {"hold_id": hold_id, "event_id": event_id},
        )
    ).first()
    if group is None or group.user_id != user_id:
        raise NotFoundError("Hold not found.", code="hold_not_found")
    if group.status != "held" or group.expires_at <= now:
        raise ConflictError("Hold is not active.", code="hold_not_active")
    counts = (
        await db.execute(
            text("""
        SELECT ticket_type_id, COUNT(*) FROM seat_holds
         WHERE hold_group_id = :hold_id AND status = 'held' GROUP BY ticket_type_id
    """),
            {"hold_id": hold_id},
        )
    ).all()
    if not counts:
        raise ConflictError("Hold is missing its seats.", code="hold_empty")
    for ticket_id, quantity in counts:
        if not await confirm_inventory(db, ticket_id, int(quantity)):
            raise ConflictError(
                "Reserved ticket inventory is inconsistent.", code="inventory_inconsistent"
            )
    await db.execute(
        text("""
        UPDATE seat_holds SET status = 'converted', updated_at = now()
         WHERE hold_group_id = :hold_id AND status = 'held'
    """),
        {"hold_id": hold_id},
    )
    await db.execute(
        text("""
        UPDATE seat_hold_groups SET status = 'sold'
         WHERE id = :hold_id AND status = 'held'
    """),
        {"hold_id": hold_id},
    )


async def expire_due_holds(
    db: AsyncSession, *, limit: int = 100, now: datetime | None = None
) -> int:
    """Expire at most `limit` groups; event locks keep workers mutually safe.

    Caller should use a dedicated session. Commits once per affected event.
    """
    if limit < 1:
        raise ValueError("limit must be positive")
    now = now or now_utc()
    groups = (
        await db.execute(
            text("""
        SELECT event_id, COUNT(*) AS n FROM (
            SELECT event_id FROM seat_hold_groups
            WHERE status = 'held' AND expires_at <= :now
            ORDER BY expires_at, id LIMIT :limit
        ) AS due GROUP BY event_id ORDER BY event_id
    """),
            {"now": now, "limit": limit},
        )
    ).all()
    expired = 0
    for event_id, _ in groups:
        # No event-status requirement: a cancelled event still needs expiry cleanup.
        event = await db.scalar(select(Event).where(Event.id == event_id).with_for_update())
        if event is None:
            raise RuntimeError("Orphaned P4 hold: event not found")
        expired += await _expire_event(db, event_id, now, max_groups=limit - expired)
        await db.commit()
    return expired
