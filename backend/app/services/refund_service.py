"""Cancellations and full refunds [P7, SRS 4.9].

- An authorized organizer (owner, manager staff, platform admin) refunds a paid order in full.
  The sandbox provider is called, a `Refund` row is written, the order becomes `refunded` and
  every ticket `refunded` at once, so check-in (P15) rejects it immediately. Inventory and
  assigned seats go back on sale.
- Free registrations are cancelled through P5 (`POST /orders/{id}/cancel`), not refunded.
- Cancelling an event (P2) calls `cancel_event_orders`: pending checkouts are released, free
  registrations cancelled and paid orders refunded, all in the cancelling transaction.

Refunds are full only (the SRS baseline); `partially_refunded` is not produced.
"""

from __future__ import annotations

import uuid
from collections import Counter
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import check_event_access
from app.core.errors import ConflictError, NotFoundError
from app.core.money import Money
from app.core.pagination import Page, PageParams, paginate
from app.models.event import Event
from app.models.notification import NotificationType
from app.models.order import Order, OrderItem, OrderStatus
from app.models.payment import Payment, PaymentKind, PaymentStatus
from app.models.refund import Refund, RefundStatus
from app.models.seat_hold import SeatHold, SeatHoldGroup, SeatHoldStatus
from app.models.ticket import Ticket, TicketStatus
from app.models.user import StaffRole, User
from app.schemas.event import RefundPolicyIn
from app.schemas.refund import RefundOut
from app.services import promo_service
from app.services.audit_service import audit
from app.services.inventory_service import release_inventory
from app.services.notification_service import notify
from app.services.payments import get_provider
from app.services.ticket_type_service import refund_inventory

EVENT_CANCELLED_REASON = "Event cancelled by the organizer"


def to_refund_out(refund: Refund) -> RefundOut:
    return RefundOut(
        id=refund.id,
        order_id=refund.order_id,
        amount=refund.amount,
        currency=refund.currency,
        reason=refund.reason,
        status=refund.status.value,
        completed_at=refund.completed_at,
    )


# --------------------------------------------------------------------------- policy


async def set_refund_policy(
    db: AsyncSession, user: User, event: Event, data: RefundPolicyIn
) -> Event:
    """Store the organizer's policy text. It is shown to attendees; refunds stay manual."""
    event.refund_policy = {
        "summary": data.summary,
        "refundable_until": data.refundable_until.isoformat() if data.refundable_until else None,
    }
    audit(
        db,
        action_type="refund_policy.updated",
        entity_type="event",
        entity_id=event.id,
        event_id=event.id,
        actor=user,
        description="Updated refund policy",
        metadata=event.refund_policy,
    )
    await db.commit()
    return event


# --------------------------------------------------------------------------- shared steps


async def _lock_order(db: AsyncSession, order_id: uuid.UUID) -> Order:
    visible = await db.get(Order, order_id)
    if visible is None:
        raise NotFoundError("Order not found.", code="order_not_found")
    # Same lock order as checkout and P5: Event -> Order.
    await db.execute(select(Event.id).where(Event.id == visible.event_id).with_for_update())
    order = await db.scalar(
        select(Order)
        .where(Order.id == order_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if order is None:
        raise NotFoundError("Order not found.", code="order_not_found")
    return order


async def _revoke_tickets(
    db: AsyncSession, order: Order, new_status: TicketStatus, *, allow_checked_in: bool
) -> None:
    """Invalidate the order's tickets and put unused inventory and seats back on sale."""
    tickets = list(
        await db.scalars(
            select(Ticket)
            .join(OrderItem, OrderItem.id == Ticket.order_item_id)
            .where(OrderItem.order_id == order.id)
            .with_for_update()
        )
    )
    if not allow_checked_in and any(t.status == TicketStatus.checked_in for t in tickets):
        raise ConflictError(
            "A ticket of this order was already used for entry.", code="already_checked_in"
        )
    # Checked-in tickets were admitted: they count as attended, not as returned inventory.
    unused = Counter(t.ticket_type_id for t in tickets if t.status == TicketStatus.valid)
    for ticket_type_id in sorted(unused):
        if not await refund_inventory(db, ticket_type_id, unused[ticket_type_id]):
            raise ConflictError("Unable to restore event inventory.", code="inventory_inconsistent")
    for ticket in tickets:
        if ticket.status in (TicketStatus.valid, TicketStatus.checked_in):
            ticket.status = new_status

    holds = list(
        await db.scalars(select(SeatHold).where(SeatHold.order_id == order.id).with_for_update())
    )
    group_ids: set[uuid.UUID] = set()
    for hold in holds:
        if hold.status == SeatHoldStatus.converted:
            hold.status = SeatHoldStatus.released
        if hold.hold_group_id is not None:
            group_ids.add(hold.hold_group_id)
    for group_id in sorted(group_ids):
        group = await db.get(SeatHoldGroup, group_id)
        if group is not None and group.status == "sold":
            group.status = "released"


async def _notify_buyer(
    db: AsyncSession, order: Order, kind: NotificationType, context: dict[str, str]
) -> None:
    if order.buyer_user_id is None:
        return
    buyer = await db.get(User, order.buyer_user_id)
    if buyer is not None:
        await notify(db, kind, buyer, context)


async def _refund_paid_order(
    db: AsyncSession,
    order: Order,
    actor: User | None,
    reason: str,
    *,
    allow_checked_in: bool,
    now: datetime,
) -> Refund:
    """Full refund of a locked, paid order. Does not commit."""
    payment = await db.scalar(
        select(Payment)
        .where(
            Payment.order_id == order.id,
            Payment.kind == PaymentKind.ticket,
            Payment.status == PaymentStatus.succeeded,
        )
        .order_by(Payment.created_at.desc())
        .limit(1)
    )
    if payment is None:
        raise ConflictError("The order has no captured payment.", code="payment_not_found")

    await _revoke_tickets(db, order, TicketStatus.refunded, allow_checked_in=allow_checked_in)
    result = await get_provider(payment.provider).refund(
        payment.provider_ref, Money(payment.amount, payment.currency)
    )
    if not result.succeeded:
        # Fail closed: nothing above is committed, the tickets stay valid.
        raise ConflictError(
            f"The payment provider refused the refund ({result.failure_reason}).",
            code="refund_failed",
        )
    refund = Refund(
        order_id=order.id,
        payment_id=payment.id,
        amount=payment.amount,
        currency=payment.currency,
        reason=reason,
        initiated_by=actor.id if actor else _system_actor(order),
        status=RefundStatus.completed,
        provider_ref=result.provider_ref,
        completed_at=now,
    )
    db.add(refund)
    order.status = OrderStatus.refunded
    await db.flush()
    audit(
        db,
        action_type="refund.completed",
        entity_type="refund",
        entity_id=refund.id,
        event_id=order.event_id,
        actor=actor,
        description=f"Full simulated refund of order {order.order_number}",
        metadata={
            "order_id": str(order.id),
            "payment_id": str(payment.id),
            "amount_tiyn": refund.amount,
            "reason": reason,
            "simulated": payment.is_simulated,
        },
    )
    await _notify_buyer(
        db,
        order,
        NotificationType.refund_completed,
        {"order_id": str(order.id), "refund_id": str(refund.id)},
    )
    return refund


def _system_actor(order: Order) -> uuid.UUID:
    # refunds.initiated_by is NOT NULL; a system refund is attributed to the buyer's own order.
    if order.buyer_user_id is None:
        raise ConflictError("Refund needs an initiating user.", code="refund_actor_missing")
    return order.buyer_user_id


# --------------------------------------------------------------------------- API


async def refund_order(db: AsyncSession, user: User, order_id: uuid.UUID, reason: str) -> RefundOut:
    order = await db.get(Order, order_id)
    if order is None:
        raise NotFoundError("Order not found.", code="order_not_found")
    await check_event_access(db, user, order.event_id, StaffRole.manager)
    order = await _lock_order(db, order_id)

    if order.status == OrderStatus.refunded:
        existing = await db.scalar(
            select(Refund)
            .where(Refund.order_id == order.id, Refund.status == RefundStatus.completed)
            .order_by(Refund.created_at.desc())
            .limit(1)
        )
        if existing is not None:
            return to_refund_out(existing)  # retried request: same refund, no second payout
    if order.status == OrderStatus.free_confirmed:
        raise ConflictError(
            "Free registrations are cancelled, not refunded: POST /orders/{id}/cancel.",
            code="free_order_use_cancel",
        )
    if order.status != OrderStatus.paid:
        raise ConflictError("Only paid orders can be refunded.", code="order_not_refundable")

    refund = await _refund_paid_order(
        db, order, user, reason, allow_checked_in=False, now=datetime.now(UTC)
    )
    await db.commit()
    return to_refund_out(refund)


async def list_refunds(db: AsyncSession, event: Event, params: PageParams) -> Page[RefundOut]:
    page = await paginate(
        db,
        select(Refund)
        .join(Order, Order.id == Refund.order_id)
        .where(Order.event_id == event.id)
        .order_by(Refund.created_at.desc(), Refund.id.desc()),
        params,
    )
    return Page[RefundOut](
        items=[to_refund_out(row) for row in page.items],
        total=page.total,
        limit=page.limit,
        offset=page.offset,
    )


# --------------------------------------------------------------------------- event cancellation


async def cancel_event_orders(db: AsyncSession, event: Event, actor: User) -> dict[str, int]:
    """Settle every order of an event that is being cancelled. Caller locks the event and
    commits. Checked-in tickets are refunded too: the event did not take place as sold."""
    now = datetime.now(UTC)
    counts = {"released": 0, "cancelled": 0, "refunded": 0}
    order_ids = list(
        await db.scalars(
            select(Order.id).where(Order.event_id == event.id).order_by(Order.created_at, Order.id)
        )
    )
    for order_id in order_ids:
        order = await db.scalar(
            select(Order)
            .where(Order.id == order_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if order is None:
            continue
        if order.status == OrderStatus.pending:
            await release_inventory(db, order, terminal_status=OrderStatus.cancelled)
            counts["released"] += 1
        elif order.status == OrderStatus.free_confirmed:
            await _revoke_tickets(db, order, TicketStatus.cancelled, allow_checked_in=True)
            await promo_service.release_promo(db, order)
            order.status = OrderStatus.cancelled
            counts["cancelled"] += 1
        elif order.status == OrderStatus.paid:
            await _refund_paid_order(
                db, order, actor, EVENT_CANCELLED_REASON, allow_checked_in=True, now=now
            )
            counts["refunded"] += 1
        else:
            continue
        await _notify_buyer(
            db, order, NotificationType.event_cancelled, {"event_id": str(event.id)}
        )
    return counts
