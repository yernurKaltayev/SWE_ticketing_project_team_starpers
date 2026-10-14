import hashlib
import json
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.models.event import Event, Order, PromoCode, StaffAssignment, Ticket, TicketType
from app.models.user import UserRole
from app.schemas.event import (
    CheckoutRead,
    CheckoutRequest,
    OrderRead,
    OrderWithTickets,
    PriceQuote,
    PromoRead,
    PromoWrite,
    QuoteRequest,
    TicketRead,
    TicketWithEvent,
)
from app.services.events import audit, event_read, get_event, read_model, types_for, utc


async def usable_promo(db, event_id, code):
    if not code:
        return None
    promo = await db.scalar(
        select(PromoCode).where(
            PromoCode.event_id == event_id,
            PromoCode.code == code.strip().upper(),
        )
    )
    if promo is None or not promo.active or promo.redemptions >= promo.max_redemptions:
        raise HTTPException(422, "promo code is invalid or has reached its redemption limit")
    return promo


def on_sale(event, ticket_type, now):
    if event.status != "published" or utc(event.starts_at) <= now:
        raise HTTPException(409, "this event is not on sale")
    for start, end in (
        (event.registration_starts_at, event.registration_ends_at),
        (ticket_type.sale_starts_at, ticket_type.sale_ends_at),
    ):
        if (start and now < utc(start)) or (end and now >= utc(end)):
            raise HTTPException(409, "registration or ticket sales are closed")
    if ticket_type.price > 0 and not event.paid_sales_active:
        raise HTTPException(409, "paid ticket sales have not been activated")


async def pricing(db, event, selection, promo_code, *, require_selection=False):
    types = {t.id: t for t in await types_for(db, event.id)}
    items = []
    subtotal = 0
    now = datetime.now(UTC)
    for type_id, quantity in sorted(selection.items(), key=lambda item: str(item[0])):
        if quantity == 0:
            continue
        row = types.get(type_id)
        if row is None or row.hidden:
            raise HTTPException(422, "unknown or hidden ticket type")
        on_sale(event, row, now)
        if quantity > row.per_order_limit:
            raise HTTPException(
                422, f"at most {row.per_order_limit} tickets of this type per order"
            )
        if row.sold + quantity > row.quantity:
            raise HTTPException(409, "not enough tickets remaining")
        subtotal += row.price * quantity
        items.append((row, quantity))
    if require_selection and not items:
        raise HTTPException(422, "select at least one ticket")
    promo = await usable_promo(db, event.id, promo_code)
    discount = 0
    if promo:
        discount = (subtotal * promo.value + 50) // 100 if promo.kind == "percent" else promo.value
        discount = min(discount, subtotal)
    return (
        items,
        promo,
        PriceQuote(
            subtotal=subtotal,
            discount=discount,
            total=subtotal - discount,
            promo=read_model(PromoRead, promo) if promo else None,
        ),
    )


async def quote(db, user, event_id, data: QuoteRequest):
    event = await get_event(db, event_id, user)
    _, _, result = await pricing(db, event, data.selection, data.promo_code)
    return result


async def checkout_read(db, order):
    tickets = (await db.scalars(select(Ticket).where(Ticket.order_id == order.id))).all()
    return CheckoutRead(
        order=read_model(OrderRead, order),
        tickets=[read_model(TicketRead, t) for t in tickets],
    )


def fingerprint(event_id, data):
    payload = {"event": str(event_id), **data.model_dump(mode="json", exclude={"idempotency_key"})}
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def check_replay(order, digest):
    if order.request_fingerprint != digest:
        raise HTTPException(409, "idempotency key was already used for a different request")


async def checkout(db, user, event_id, data: CheckoutRequest):
    if not user.is_email_verified:
        raise HTTPException(403, "verify your email before checkout")
    digest = fingerprint(event_id, data)
    existing_query = select(Order).where(
        Order.user_id == user.id,
        Order.idempotency_key == data.idempotency_key,
    )
    existing = await db.scalar(existing_query)
    if existing:
        check_replay(existing, digest)
        return await checkout_read(db, existing)
    # All event edits, purchases, refunds, and cancellation take this same row lock on Postgres.
    event = await get_event(db, event_id, user, lock=True)
    if event.status != "published":
        raise HTTPException(409, "this event is not on sale")
    # A concurrent retry may have committed while this transaction waited for the event lock.
    existing = await db.scalar(existing_query)
    if existing:
        check_replay(existing, digest)
        return await checkout_read(db, existing)
    items, promo, total = await pricing(
        db,
        event,
        data.selection,
        data.promo_code,
        require_selection=True,
    )
    paid = total.total == 0 or data.outcome == "approve"
    order = Order(
        event_id=event.id,
        user_id=user.id,
        buyer_name=user.full_name,
        buyer_email=user.email,
        items=[
            {
                "ticketTypeId": str(row.id),
                "name": row.name,
                "quantity": quantity,
                "unitPrice": row.price,
            }
            for row, quantity in items
        ],
        subtotal=total.subtotal,
        discount=total.discount,
        total=total.total,
        promo_code=promo.code if promo else None,
        status="paid" if paid else "failed",
        idempotency_key=data.idempotency_key,
        request_fingerprint=digest,
    )
    try:
        if paid:
            for row, quantity in items:
                # Conditional inventory mutation is also an oversell guard on SQLite.
                result = await db.execute(
                    update(TicketType)
                    .where(
                        TicketType.id == row.id,
                        TicketType.sold + quantity <= TicketType.quantity,
                        TicketType.hidden.is_(False),
                    )
                    .values(sold=TicketType.sold + quantity)
                )
                if result.rowcount != 1:
                    raise HTTPException(409, "tickets were sold while you were checking out")
            if promo:
                result = await db.execute(
                    update(PromoCode)
                    .where(
                        PromoCode.id == promo.id,
                        PromoCode.active.is_(True),
                        PromoCode.redemptions < PromoCode.max_redemptions,
                    )
                    .values(redemptions=PromoCode.redemptions + 1)
                )
                if result.rowcount != 1:
                    raise HTTPException(409, "promo redemption limit reached")
        db.add(order)
        await db.flush()
        if paid:
            for row, quantity in items:
                for _ in range(quantity):
                    db.add(
                        Ticket(
                            code="ticket_" + secrets.token_urlsafe(32),
                            order_id=order.id,
                            event_id=event.id,
                            user_id=user.id,
                            ticket_type_id=row.id,
                            ticket_type_name=row.name,
                            holder_name=user.full_name,
                            holder_email=user.email,
                            status="valid",
                            issued_at=datetime.now(UTC),
                        )
                    )
        audit(
            db, event, user, f"Order {order.id}: {'confirmed' if paid else 'declined'} (simulated)"
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        existing = await db.scalar(existing_query)
        if existing is None:
            raise
        check_replay(existing, digest)
        return await checkout_read(db, existing)
    await db.refresh(order)
    return await checkout_read(db, order)


async def my_orders(db, user):
    orders = (
        await db.scalars(
            select(Order)
            .where(
                Order.user_id == user.id,
                Order.status != "failed",
            )
            .order_by(Order.created_at.desc())
        )
    ).all()
    result = []
    for order in orders:
        purchased = await checkout_read(db, order)
        event = await db.get(Event, order.event_id)
        result.append(
            OrderWithTickets(
                order=purchased.order,
                tickets=purchased.tickets,
                event=await event_read(db, event),
            )
        )
    return result


async def my_ticket(db, user, ticket_id):
    ticket = await db.scalar(
        select(Ticket).where(Ticket.id == ticket_id, Ticket.user_id == user.id)
    )
    if ticket is None:
        raise HTTPException(404, "ticket not found")
    event = await db.get(Event, ticket.event_id)
    return TicketWithEvent(ticket=read_model(TicketRead, ticket), event=await event_read(db, event))


async def refund_record(db, order, *, forced=False):
    tickets = (await db.scalars(select(Ticket).where(Ticket.order_id == order.id))).all()
    if not forced and any(t.status == "checked_in" for t in tickets):
        raise HTTPException(409, "a ticket in this order has already been used")
    order.status = "refunded"
    for ticket in tickets:
        ticket.status = "cancelled" if forced else "refunded"
    for item in order.items:
        result = await db.execute(
            update(TicketType)
            .where(
                TicketType.id == UUID(item["ticketTypeId"]),
                TicketType.sold >= item["quantity"],
            )
            .values(sold=TicketType.sold - item["quantity"])
        )
        if result.rowcount != 1:
            raise HTTPException(409, "inventory mismatch; refund was not applied")


async def refund_order(db, user, order_id):
    order = await db.scalar(select(Order).where(Order.id == order_id, Order.user_id == user.id))
    if order is None:
        raise HTTPException(404, "order not found")
    event = await db.scalar(select(Event).where(Event.id == order.event_id).with_for_update())
    await db.refresh(order)
    if order.status != "paid":
        raise HTTPException(409, "order is not refundable")
    if utc(event.starts_at) - datetime.now(UTC) < timedelta(hours=24):
        raise HTTPException(409, "refunds close 24 hours before the event starts")
    await refund_record(db, order)
    audit(db, event, user, f"Refunded order {order.id} (simulated)")
    await db.commit()


async def refund_event_orders(db, event):
    orders = (
        await db.scalars(
            select(Order).where(
                Order.event_id == event.id,
                Order.status == "paid",
            )
        )
    ).all()
    for order in orders:
        await refund_record(db, order, forced=True)


async def event_orders(db, user, event_id):
    await get_event(db, event_id, user, manage=True)
    rows = (
        await db.scalars(
            select(Order)
            .where(
                Order.event_id == event_id,
                Order.status != "failed",
            )
            .order_by(Order.created_at.desc())
        )
    ).all()
    return [read_model(OrderRead, row) for row in rows]


async def event_tickets(db, user, event_id):
    await get_event(db, event_id, user, manage=True)
    rows = (await db.scalars(select(Ticket).where(Ticket.event_id == event_id))).all()
    return [read_model(TicketRead, row) for row in rows]


async def event_promos(db, user, event_id):
    await get_event(db, event_id, user, manage=True)
    rows = (await db.scalars(select(PromoCode).where(PromoCode.event_id == event_id))).all()
    return [read_model(PromoRead, row) for row in rows]


async def create_promo(db, user, event_id, data: PromoWrite):
    event = await get_event(db, event_id, user, manage=True, lock=True)
    if await db.scalar(
        select(PromoCode.id).where(
            PromoCode.event_id == event.id,
            PromoCode.code == data.code,
        )
    ):
        raise HTTPException(409, "this code already exists for the event")
    promo = PromoCode(event_id=event.id, **data.model_dump(), redemptions=0, active=True)
    db.add(promo)
    audit(db, event, user, f"Created promo code {promo.code}")
    await db.commit()
    await db.refresh(promo)
    return read_model(PromoRead, promo)


async def set_promo_active(db, user, promo_id, active):
    promo = await db.get(PromoCode, promo_id)
    if promo is None:
        raise HTTPException(404, "promo not found")
    event = await get_event(db, promo.event_id, user, manage=True, lock=True)
    promo.active = active
    audit(db, event, user, f"{'Enabled' if active else 'Disabled'} promo code {promo.code}")
    await db.commit()


async def staff_events(db, user):
    if user.role != UserRole.event_admin:
        raise HTTPException(403, "Event Admins only")
    rows = (
        await db.scalars(
            select(Event)
            .join(
                StaffAssignment,
                StaffAssignment.event_id == Event.id,
            )
            .where(StaffAssignment.user_id == user.id)
            .order_by(Event.starts_at)
        )
    ).all()
    return [await event_read(db, row) for row in rows]


async def assigned_event(db, user, event_id):
    if (
        user.role != UserRole.event_admin
        or await db.get(StaffAssignment, (event_id, user.id)) is None
    ):
        raise HTTPException(403, "you are not assigned to this event")
    event = await db.scalar(select(Event).where(Event.id == event_id).with_for_update())
    if event is None or event.status != "published":
        raise HTTPException(409, "event is not active for check-in")
    return event


async def check_in(db, user, event_id, code):
    event = await assigned_event(db, user, event_id)
    if not code.startswith("ticket_"):
        raise HTTPException(400, "this is not an admission QR code")
    ticket = await db.scalar(select(Ticket).where(Ticket.event_id == event_id, Ticket.code == code))
    if ticket is None:
        raise HTTPException(404, "ticket not found for this event")
    result = await db.execute(
        update(Ticket)
        .where(
            Ticket.id == ticket.id,
            Ticket.status == "valid",
        )
        .values(status="checked_in")
    )
    if result.rowcount != 1:
        raise HTTPException(409, "ticket is already used, cancelled, or refunded")
    audit(db, event, user, f"Checked in ticket {ticket.id}")
    await db.commit()
    await db.refresh(ticket)
    return read_model(TicketRead, ticket)


async def undo_check_in(db, user, event_id, ticket_id):
    event = await assigned_event(db, user, event_id)
    result = await db.execute(
        update(Ticket)
        .where(
            Ticket.id == ticket_id,
            Ticket.event_id == event_id,
            Ticket.status == "checked_in",
        )
        .values(status="valid")
    )
    if result.rowcount != 1:
        raise HTTPException(409, "ticket is not checked in at this event")
    audit(db, event, user, f"Reversed check-in for ticket {ticket_id}")
    await db.commit()
