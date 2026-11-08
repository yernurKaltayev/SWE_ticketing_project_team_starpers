"""P5 checkout, free registrations, read access and paid-payment integration hooks.

All inventory and order writes share a DB transaction.  No card data is accepted.
P6 owns the sandbox payment endpoint and should call confirm_paid_order() or
fail_pending_order() from its signed, idempotent payment handler, then commit.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import secrets
import uuid
from collections import Counter
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import check_event_access
from app.core.errors import ConflictError, NotFoundError, UnprocessableError
from app.core.pagination import Page, PageParams, paginate
from app.models.event import Event, SeatingMode
from app.models.notification import NotificationType
from app.models.order import Attendee, Order, OrderItem, OrderStatus
from app.models.seat_hold import SeatHold, SeatHoldGroup, SeatHoldStatus
from app.models.ticket import Ticket, TicketStatus
from app.models.ticket_type import TicketType
from app.models.user import StaffRole, User
from app.models.venue import Seat, VenueRow, VenueSection
from app.schemas.order import AttendeeOut, OrderCreate, OrderItemOut, OrderOut
from app.schemas.ticket import SeatRef
from app.services import promo_service
from app.services.audit_service import audit
from app.services.hold_policy_p4 import HOLD_DURATION
from app.services.inventory_service import release_inventory
from app.services.notification_service import notify
from app.services.seat_service import confirm_hold
from app.services.ticket_service import issue_tickets, to_ticket_out
from app.services.ticket_type_service import (
    _paid_sales_active,
    _registration_open,
    _sales_open,
    confirm_inventory,
    refund_inventory,
    reserve_inventory,
)


def _request_keys(user_id: uuid.UUID, key: str, data: OrderCreate) -> tuple[str, str]:
    """Scope idempotency to buyer and hash the full request without a migration.

    Storing `v1:<scope>:<body>` in the existing unique idempotency_key column
    also detects an accidental reuse of the same client key for a different cart.
    """
    scope = hashlib.sha256(f"{user_id}:{key}".encode()).hexdigest()
    payload = json.dumps(data.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    body_hash = hashlib.sha256(payload.encode()).hexdigest()
    return f"v1:{scope}:", body_hash


def _clean_key(key: str | None) -> str:
    if key is None:
        return str(uuid.uuid4())
    key = key.strip()
    if not 1 <= len(key) <= 128 or any(ord(char) < 33 or ord(char) > 126 for char in key):
        raise UnprocessableError("Invalid Idempotency-Key header.", code="invalid_idempotency_key")
    return key


def _order_number() -> str:
    return f"BF-{datetime.now(UTC):%Y%m%d}-{secrets.token_hex(8).upper()}"


def _seat_ref(item: OrderItem) -> SeatRef | None:
    if item.seat_id is None:
        return None
    return SeatRef(
        seat_id=item.seat_id,
        section_name=item.section_name or "",
        row_label=item.row_label or "",
        seat_number=item.seat_number or 0,
    )


async def to_order_out(db: AsyncSession, order: Order) -> OrderOut:
    items = list(
        await db.scalars(
            select(OrderItem)
            .where(OrderItem.order_id == order.id)
            .order_by(OrderItem.created_at, OrderItem.id)
        )
    )
    tickets = list(
        await db.scalars(
            select(Ticket)
            .join(OrderItem, OrderItem.id == Ticket.order_item_id)
            .where(OrderItem.order_id == order.id)
            .order_by(Ticket.issued_at, Ticket.id)
        )
    )
    return OrderOut(
        id=order.id,
        order_number=order.order_number,
        status=order.status.value,
        subtotal=order.subtotal,
        discount_amount=order.discount_amount,
        processing_fee=order.processing_fee,
        total=order.total,
        currency=order.currency,
        is_simulated=order.is_simulated,
        items=[
            OrderItemOut(
                id=item.id,
                ticket_type_id=item.ticket_type_id,
                seat=_seat_ref(item),
                unit_price=item.unit_price,
                quantity=item.quantity,
                line_total=item.line_total,
            )
            for item in items
        ],
        tickets=await to_ticket_out(db, tickets) if tickets else [],
    )


async def _lock_event(db: AsyncSession, event_id: uuid.UUID) -> Event:
    event = await db.scalar(select(Event).where(Event.id == event_id).with_for_update())
    if event is None:
        raise NotFoundError("Event not found.", code="event_not_found")
    return event


async def _active_holds(
    db: AsyncSession,
    event: Event,
    user: User,
    data: OrderCreate,
    now: datetime,
) -> tuple[list[SeatHoldGroup], dict[uuid.UUID, SeatHold]]:
    if not data.hold_ids:
        raise UnprocessableError("Assigned seats require hold_ids from P4.", code="holds_required")
    groups: list[SeatHoldGroup] = []
    seat_map: dict[uuid.UUID, SeatHold] = {}
    for group_id in sorted(data.hold_ids):
        group = await db.scalar(
            select(SeatHoldGroup).where(SeatHoldGroup.id == group_id).with_for_update()
        )
        if group is None or group.event_id != event.id or group.user_id != user.id:
            raise NotFoundError("Seat hold not found.", code="hold_not_found")
        if group.status != "held" or group.expires_at <= now:
            raise ConflictError("Seat hold is no longer active.", code="hold_not_active")
        rows = list(
            await db.scalars(
                select(SeatHold).where(SeatHold.hold_group_id == group_id).with_for_update()
            )
        )
        if not rows:
            raise ConflictError("Seat hold has no seats.", code="hold_empty")
        for row in rows:
            if (
                row.status != SeatHoldStatus.held
                or row.expires_at <= now
                or row.order_id is not None
            ):
                raise ConflictError("A seat hold is no longer available.", code="hold_not_active")
            if row.seat_id in seat_map:
                raise ConflictError("A seat belongs to multiple holds.", code="duplicate_seat")
            seat_map[row.seat_id] = row
        groups.append(group)
    wanted = Counter(
        (item.ticket_type_id, seat_id) for item in data.items for seat_id in item.seat_ids
    )
    actual = Counter((seat.ticket_type_id, seat.seat_id) for seat in seat_map.values())
    if wanted != actual:
        raise UnprocessableError(
            "Seat IDs and hold groups do not match.", code="hold_seats_mismatch"
        )
    return groups, seat_map


async def _seat_locations(
    db: AsyncSession,
    seat_ids: Sequence[uuid.UUID],
    event: Event,
) -> dict[uuid.UUID, tuple[str, str, int]]:
    rows = (
        await db.execute(
            select(Seat, VenueRow, VenueSection)
            .join(VenueRow, Seat.row_id == VenueRow.id)
            .join(VenueSection, VenueRow.section_id == VenueSection.id)
            .where(Seat.id.in_(seat_ids), VenueSection.layout_id == event.layout_id)
        )
    ).all()
    result = {seat.id: (section.name, row.label, seat.number) for seat, row, section in rows}
    if len(result) != len(seat_ids):
        raise UnprocessableError("A held seat is not in the event layout.", code="invalid_seats")
    return result


async def create_order(
    db: AsyncSession,
    user: User,
    data: OrderCreate,
    idempotency_key: str | None,
    now: datetime | None = None,
) -> OrderOut:
    now = now or datetime.now(UTC)
    key = _clean_key(idempotency_key)
    prefix, body_hash = _request_keys(user.id, key, data)

    # Serializes same-user retries even if request bodies refer to different events.
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    existing = await db.scalar(select(Order).where(Order.idempotency_key.like(prefix + "%")))
    if existing is not None:
        if existing.idempotency_key != prefix + body_hash:
            raise ConflictError("This idempotency key belongs to another cart.", code="key_reused")
        return await to_order_out(db, existing)

    event = await _lock_event(db, data.event_id)
    if not _registration_open(event, now):
        raise ConflictError("Event registration is closed.", code="registration_closed")
    assigned = event.seating_mode == SeatingMode.assigned
    if assigned and event.layout_id is None:
        raise ConflictError("This event has no seating layout.", code="event_layout_missing")
    if not assigned and data.hold_ids:
        raise UnprocessableError("GA orders cannot use seat holds.", code="unexpected_hold_ids")

    tickets_by_id: dict[uuid.UUID, TicketType] = {}
    subtotal = 0
    for selection in data.items:
        ticket = await db.get(TicketType, selection.ticket_type_id)
        if ticket is None or ticket.event_id != event.id:
            raise NotFoundError("Ticket type not found for event.", code="ticket_type_not_found")
        if not _sales_open(event, ticket, now):
            raise ConflictError("Ticket sales are not open.", code="sales_closed")
        if selection.quantity > ticket.max_per_order:
            raise UnprocessableError(
                "Per-order ticket limit exceeded.", code="order_limit_exceeded"
            )
        if assigned and len(selection.seat_ids) != selection.quantity:
            raise UnprocessableError(
                "Assigned tickets require one seat per ticket.", code="seats_required"
            )
        if not assigned and selection.seat_ids:
            raise UnprocessableError("GA orders cannot select seats.", code="unexpected_seats")
        if ticket.price_amount < 0 or ticket.currency != "KZT":
            raise UnprocessableError(
                "Unsupported ticket price or currency.", code="invalid_ticket_price"
            )
        if not ticket.is_free and not _paid_sales_active(event):
            raise ConflictError("Paid sales are not active.", code="paid_sales_inactive")
        tickets_by_id[ticket.id] = ticket
        subtotal += ticket.price_amount * selection.quantity

    # P16: the discount is computed on the server from stored prices, before anything is
    # reserved; the redemption slot itself is claimed atomically once the order row exists.
    promo_quote: promo_service.PromoQuote | None = None
    if data.promo_code:
        lines = [
            (item.ticket_type_id, tickets_by_id[item.ticket_type_id].price_amount * item.quantity)
            for item in data.items
        ]
        try:
            promo_quote = await promo_service.quote(db, event.id, data.promo_code, lines, now)
        except promo_service.PromoRejected as exc:
            raise exc.as_error() from exc
    discount = promo_quote.discount if promo_quote else 0
    total = subtotal - discount

    groups: list[SeatHoldGroup] = []
    seat_holds: dict[uuid.UUID, SeatHold] = {}
    seat_details: dict[uuid.UUID, tuple[str, str, int]] = {}
    if assigned:
        groups, seat_holds = await _active_holds(db, event, user, data, now)
        seat_details = await _seat_locations(db, list(seat_holds), event)
    else:
        for item in sorted(data.items, key=lambda selection: selection.ticket_type_id):
            if not await reserve_inventory(db, event.id, item.ticket_type_id, item.quantity, now):
                raise ConflictError("Not enough ticket inventory.", code="inventory_unavailable")

    expires_at = min(group.expires_at for group in groups) if assigned else now + HOLD_DURATION
    is_free_order = total == 0
    order = Order(
        order_number=_order_number(),
        event_id=event.id,
        buyer_user_id=user.id,
        buyer_email=user.email,
        status=OrderStatus.free_confirmed if is_free_order else OrderStatus.pending,
        subtotal=subtotal,
        discount_amount=discount,
        processing_fee=0,
        total=total,
        promo_code_id=promo_quote.promo_code.id if promo_quote else None,
        idempotency_key=prefix + body_hash,
        expires_at=None if is_free_order else expires_at,
        is_simulated=True,
        currency="KZT",
    )
    db.add(order)
    await db.flush()
    created_order_id = order.id
    if promo_quote is not None:
        await promo_service.redeem(db, order, promo_quote, now)

    # Insert items and one-to-one attendee assignments in the same request order.
    next_attendee = iter(data.attendees)
    for selection in data.items:
        ticket = tickets_by_id[selection.ticket_type_id]
        seat_ids = selection.seat_ids if assigned else [None]
        for seat_id in seat_ids:
            quantity = 1 if seat_id is not None else selection.quantity
            location = seat_details.get(seat_id) if seat_id is not None else None
            new_order_item = OrderItem(
                order_id=created_order_id,
                ticket_type_id=ticket.id,
                seat_id=seat_id,
                section_name=location[0] if location else None,
                row_label=location[1] if location else None,
                seat_number=location[2] if location else None,
                unit_price=ticket.price_amount,
                quantity=quantity,
                line_total=ticket.price_amount * quantity,
                currency="KZT",
            )
            db.add(new_order_item)
            await db.flush()
            for _ in range(quantity):
                entry = next(next_attendee)
                db.add(
                    Attendee(
                        order_id=created_order_id,
                        order_item_id=new_order_item.id,
                        full_name=entry.full_name,
                        email=str(entry.email),
                        phone=None,
                    )
                )
    await db.flush()

    if assigned:
        for seat in seat_holds.values():
            seat.order_id = order.id
        await db.flush()
    if is_free_order:
        if assigned:
            for group in groups:
                await confirm_hold(db, event.id, group.id, user.id, now)
        else:
            for selection in data.items:
                if not await confirm_inventory(db, selection.ticket_type_id, selection.quantity):
                    raise ConflictError(
                        "Inventory could not be confirmed.", code="inventory_inconsistent"
                    )
        await issue_tickets(db, order)
        await notify(db, NotificationType.purchase_confirmation, user, {"order_id": str(order.id)})

    audit(
        db,
        action_type="order.created",
        entity_type="order",
        entity_id=order.id,
        event_id=event.id,
        actor=user,
        description="Created order",
        metadata={"status": order.status.value, "total_tiyn": order.total},
    )
    await db.commit()
    return await to_order_out(db, order)


async def _accessible_order(db: AsyncSession, user: User, order_id: uuid.UUID) -> Order:
    order = await db.get(Order, order_id)
    if order is None:
        raise NotFoundError("Order not found.", code="order_not_found")
    if order.buyer_user_id != user.id:
        await check_event_access(db, user, order.event_id, StaffRole.support)
    return order


async def get_order(db: AsyncSession, user: User, order_id: uuid.UUID) -> OrderOut:
    return await to_order_out(db, await _accessible_order(db, user, order_id))


async def list_user_orders(db: AsyncSession, user: User, params: PageParams) -> Page[OrderOut]:
    rows = await paginate(
        db,
        select(Order)
        .where(Order.buyer_user_id == user.id)
        .order_by(Order.created_at.desc(), Order.id.desc()),
        params,
    )
    return Page[OrderOut](
        items=[await to_order_out(db, order) for order in rows.items],
        total=rows.total,
        limit=rows.limit,
        offset=rows.offset,
    )


async def list_event_orders(
    db: AsyncSession,
    user: User,
    event_id: uuid.UUID,
    params: PageParams,
) -> Page[OrderOut]:
    await check_event_access(db, user, event_id, StaffRole.support)
    rows = await paginate(
        db,
        select(Order)
        .where(Order.event_id == event_id)
        .order_by(Order.created_at.desc(), Order.id.desc()),
        params,
    )
    return Page[OrderOut](
        items=[await to_order_out(db, order) for order in rows.items],
        total=rows.total,
        limit=rows.limit,
        offset=rows.offset,
    )


async def _attendees_query(
    db: AsyncSession,
    user: User,
    event_id: uuid.UUID,
    *,
    q: str | None = None,
    ticket_type_id: uuid.UUID | None = None,
    status: str | None = None,
    csv_export: bool = False,
):
    roles = (StaffRole.support,) if csv_export else (StaffRole.support, StaffRole.checkin)
    await check_event_access(db, user, event_id, *roles)
    stmt = (
        select(Attendee, TicketType.name, Ticket.status)
        .join(Order, Order.id == Attendee.order_id)
        .join(OrderItem, OrderItem.id == Attendee.order_item_id)
        .join(TicketType, TicketType.id == OrderItem.ticket_type_id)
        .outerjoin(Ticket, Ticket.attendee_id == Attendee.id)
        .where(Order.event_id == event_id)
        .order_by(Order.created_at.desc(), Attendee.created_at, Attendee.id)
    )
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(or_(Attendee.full_name.ilike(pattern), Attendee.email.ilike(pattern)))
    if ticket_type_id is not None:
        stmt = stmt.where(OrderItem.ticket_type_id == ticket_type_id)
    if status:
        if status == "pending":
            stmt = stmt.where(Ticket.id.is_(None))
        else:
            try:
                wanted = TicketStatus(status)
            except ValueError as exc:
                raise UnprocessableError(
                    "Invalid ticket status.", code="invalid_ticket_status"
                ) from exc
            stmt = stmt.where(Ticket.status == wanted)
    return stmt


def _attendee_out(
    row: tuple[Attendee, str, TicketStatus | None],
) -> AttendeeOut:
    attendee, type_name, ticket_status = row
    return AttendeeOut(
        id=attendee.id,
        order_id=attendee.order_id,
        full_name=attendee.full_name,
        email=attendee.email,
        ticket_type=type_name,
        ticket_status=ticket_status.value if ticket_status else "pending",
    )


async def list_attendees(
    db: AsyncSession,
    user: User,
    event_id: uuid.UUID,
    params: PageParams,
    *,
    q: str | None = None,
    ticket_type_id: uuid.UUID | None = None,
    status: str | None = None,
) -> Page[AttendeeOut]:
    stmt = await _attendees_query(
        db,
        user,
        event_id,
        q=q,
        ticket_type_id=ticket_type_id,
        status=status,
    )
    total = await db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    rows = (await db.execute(stmt.limit(params.limit).offset(params.offset))).all()
    return Page[AttendeeOut](
        items=[_attendee_out(row._t) for row in rows],
        total=total or 0,
        limit=params.limit,
        offset=params.offset,
    )


def _csv_safe(value: str) -> str:
    """Prevent formula evaluation when event organizers open exports in spreadsheets."""
    return "'" + value if value and value.lstrip().startswith(("=", "+", "-", "@")) else value


async def export_attendees_csv(
    db: AsyncSession,
    user: User,
    event_id: uuid.UUID,
    *,
    q: str | None = None,
    ticket_type_id: uuid.UUID | None = None,
    status: str | None = None,
) -> str:
    stmt = await _attendees_query(
        db,
        user,
        event_id,
        q=q,
        ticket_type_id=ticket_type_id,
        status=status,
        csv_export=True,
    )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        ("attendee_id", "order_id", "full_name", "email", "ticket_type", "ticket_status")
    )
    # Stream rows from PostgreSQL instead of loading the entire guest list into RAM.
    result = await db.stream(stmt)
    async for row in result:
        person = _attendee_out(row._t)
        writer.writerow(
            (
                str(person.id),
                str(person.order_id),
                _csv_safe(person.full_name),
                _csv_safe(str(person.email)),
                _csv_safe(person.ticket_type),
                person.ticket_status,
            )
        )
    return output.getvalue()


async def _cancel_free(db: AsyncSession, order: Order, actor: User) -> None:
    tickets = list(
        await db.scalars(
            select(Ticket)
            .join(OrderItem, OrderItem.id == Ticket.order_item_id)
            .where(OrderItem.order_id == order.id)
            .with_for_update()
        )
    )
    if any(ticket.status == TicketStatus.checked_in for ticket in tickets):
        raise ConflictError(
            "A checked-in registration cannot be cancelled.", code="already_checked_in"
        )
    items = list(await db.scalars(select(OrderItem).where(OrderItem.order_id == order.id)))
    for item in sorted(items, key=lambda i: (i.ticket_type_id, i.id)):
        if not await refund_inventory(db, item.ticket_type_id, item.quantity):
            raise ConflictError("Unable to restore event inventory.", code="inventory_inconsistent")
    for ticket in tickets:
        ticket.status = TicketStatus.cancelled
    holds = list(await db.scalars(select(SeatHold).where(SeatHold.order_id == order.id)))
    group_ids: set[uuid.UUID] = set()
    for hold in holds:
        if hold.status != SeatHoldStatus.converted:
            raise ConflictError("Seat sale is inconsistent.", code="seat_reservations_inconsistent")
        hold.status = SeatHoldStatus.released
        if hold.hold_group_id is not None:
            group_ids.add(hold.hold_group_id)
    for group_id in sorted(group_ids):
        group = await db.get(SeatHoldGroup, group_id)
        if group is not None and group.status == "sold":
            group.status = "released"
    await promo_service.release_promo(db, order)
    order.status = OrderStatus.cancelled
    audit(
        db,
        action_type="order.cancelled",
        entity_type="order",
        entity_id=order.id,
        event_id=order.event_id,
        actor=actor,
        description="Cancelled free registration",
    )


async def cancel_order(db: AsyncSession, user: User, order_id: uuid.UUID) -> OrderOut:
    visible = await _accessible_order(db, user, order_id)
    await _lock_event(db, visible.event_id)
    order = await db.scalar(select(Order).where(Order.id == order_id).with_for_update())
    if order is None:
        raise NotFoundError("Order not found.", code="order_not_found")
    if order.status == OrderStatus.cancelled:
        return await to_order_out(db, order)
    if order.status == OrderStatus.pending:
        await release_inventory(db, order, terminal_status=OrderStatus.cancelled)
        audit(
            db,
            action_type="order.cancelled",
            entity_type="order",
            entity_id=order.id,
            event_id=order.event_id,
            actor=user,
            description="Cancelled pending order",
        )
    elif order.status == OrderStatus.free_confirmed:
        await _cancel_free(db, order, user)
    else:
        raise ConflictError(
            "This order cannot be cancelled here; use P7 for paid refunds.",
            code="order_not_cancellable",
        )
    await db.commit()
    return await to_order_out(db, order)


async def confirm_paid_order(
    db: AsyncSession,
    order_id: uuid.UUID,
    now: datetime | None = None,
) -> Order:
    """P6 signed payment-success hook. Does not commit; caller owns the transaction.

    Must be invoked only AFTER a verified successful sandbox payment is persisted.
    Repeated successful callbacks return the already-paid order without double issuing.
    """
    now = now or datetime.now(UTC)
    visible = await db.get(Order, order_id)
    if visible is None:
        raise NotFoundError("Order not found.", code="order_not_found")
    await _lock_event(db, visible.event_id)
    order = await db.scalar(select(Order).where(Order.id == order_id).with_for_update())
    if order is None:
        raise NotFoundError("Order not found.", code="order_not_found")

    if order.status == OrderStatus.paid:
        return order
    if order.status != OrderStatus.pending:
        raise ConflictError("Order is not awaiting payment.", code="order_not_pending")
    if order.expires_at is None or order.expires_at <= now:
        raise ConflictError("Checkout reservation has expired.", code="order_expired")

    holds = list(
        await db.scalars(select(SeatHold).where(SeatHold.order_id == order.id).with_for_update())
    )
    if holds:
        groups = {hold.hold_group_id for hold in holds}
        if None in groups:
            raise ConflictError("Seat hold group missing.", code="seat_reservations_inconsistent")
        buyer_id = order.buyer_user_id
        if buyer_id is None:
            raise ConflictError(
                "Order has no buyer.",
                code="order_buyer_missing",
            )

        for group_id in sorted(group_id for group_id in groups if group_id is not None):
            await confirm_hold(db, order.event_id, group_id, buyer_id, now)
    items = list(await db.scalars(select(OrderItem).where(OrderItem.order_id == order.id)))
    for item in items:
        if item.seat_id is None and not await confirm_inventory(
            db, item.ticket_type_id, item.quantity
        ):
            raise ConflictError("Inventory could not be confirmed.", code="inventory_inconsistent")
    order.status = OrderStatus.paid
    await db.flush()
    await issue_tickets(db, order)
    if order.buyer_user_id is not None:
        user = await db.get(User, order.buyer_user_id)
        if user is not None:
            await notify(
                db, NotificationType.purchase_confirmation, user, {"order_id": str(order.id)}
            )
    audit(
        db,
        action_type="order.paid",
        entity_type="order",
        entity_id=order.id,
        event_id=order.event_id,
        description="Payment confirmed; tickets issued",
    )
    return order


async def fail_pending_order(db: AsyncSession, order_id: uuid.UUID) -> Order:
    """P6 failure hook; no commit so payment + inventory changes stay atomic."""
    order = await db.get(Order, order_id)
    if order is None:
        raise NotFoundError("Order not found.", code="order_not_found")
    await release_inventory(db, order, terminal_status=OrderStatus.failed)
    return order


async def expire_due_orders(
    db: AsyncSession,
    *,
    limit: int = 100,
    now: datetime | None = None,
) -> int:
    """Scheduled idempotent expiry. Works even if P4 has already expired a hold."""
    if limit < 1:
        raise ValueError("limit must be positive")
    now = now or datetime.now(UTC)
    # Read-only discovery; each order is rechecked and locked by release_inventory.
    ids = list(
        await db.scalars(
            select(Order.id)
            .where(
                Order.status == OrderStatus.pending,
                Order.expires_at.is_not(None),
                Order.expires_at <= now,
            )
            .order_by(Order.expires_at, Order.id)
            .limit(limit)
        )
    )
    expired = 0
    for order_id in ids:
        order = await db.get(Order, order_id)
        if order is None:
            continue
        await release_inventory(db, order, terminal_status=OrderStatus.expired)
        if order.status == OrderStatus.expired:
            expired += 1
        await db.commit()
    return expired
