"""Title and plain-text body for each notification type [P9].

Callers pass only IDs in `context`. The readable details (order number, event title, amounts)
are looked up here, so callers never have to format text. A missing or unknown ID falls back
to a generic sentence: a notification must never fail because of a template.
"""

import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.money import Money
from app.models.event import Event
from app.models.notification import NotificationType
from app.models.order import Order
from app.models.payment import Payout
from app.models.refund import Refund
from app.models.user import User

Rendered = tuple[str, str]
Template = Callable[[AsyncSession, User, dict[str, Any]], Awaitable[Rendered]]

SIGNATURE = "\n\nThe BiletFlow team\n"


def _link(path: str) -> str:
    return f"{get_settings().web_base_url.rstrip('/')}/{path.lstrip('/')}"


def _uuid(value: Any) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


async def _get[T](db: AsyncSession, model: type[T], value: Any) -> T | None:
    row_id = _uuid(value)
    return None if row_id is None else await db.get(model, row_id)


async def _order_and_event(
    db: AsyncSession, context: dict[str, Any]
) -> tuple[Order | None, Event | None]:
    order = await _get(db, Order, context.get("order_id"))
    event_id = order.event_id if order is not None else context.get("event_id")
    return order, await _get(db, Event, event_id)


def _order_label(order: Order | None) -> str:
    return f"order {order.order_number}" if order is not None else "your order"


def _event_label(event: Event | None) -> str:
    return f'"{event.title}"' if event is not None else "your event"


def _greeting(user: User) -> str:
    return f"Hello {user.full_name},\n\n"


async def _purchase_confirmation(db: AsyncSession, user: User, ctx: dict[str, Any]) -> Rendered:
    order, event = await _order_and_event(db, ctx)
    lines = [f"Your {_order_label(order)} for {_event_label(event)} is confirmed."]
    if order is not None:
        lines.append(f"Total: {Money(order.total, order.currency)}.")
        lines.append(f"View it here: {_link(f'orders/{order.id}')}")
    return (
        f"Order confirmed: {event.title}" if event else "Order confirmed",
        _greeting(user) + "\n".join(lines) + SIGNATURE,
    )


async def _payment_failed(db: AsyncSession, user: User, ctx: dict[str, Any]) -> Rendered:
    order, event = await _order_and_event(db, ctx)
    return (
        "Payment failed",
        _greeting(user)
        + f"The payment for {_order_label(order)} ({_event_label(event)}) did not go through, "
        "and no tickets were issued. You can try again from the event page." + SIGNATURE,
    )


async def _ticket_delivery(db: AsyncSession, user: User, ctx: dict[str, Any]) -> Rendered:
    order, event = await _order_and_event(db, ctx)
    count = len(ctx.get("ticket_ids") or [])
    noun = "ticket" if count == 1 else "tickets"
    amount = f"{count} {noun}" if count else "Your tickets"
    return (
        f"Your tickets for {event.title}" if event else "Your tickets",
        _greeting(user) + f"{amount} for {_event_label(event)} are ready ({_order_label(order)}).\n"
        f"Open them, with the QR code and a printable PDF, here: {_link('tickets')}" + SIGNATURE,
    )


async def _event_update(db: AsyncSession, user: User, ctx: dict[str, Any]) -> Rendered:
    event = await _get(db, Event, ctx.get("event_id"))
    change = ctx.get("message") or "The organizer updated the event details."
    return (
        f"Update: {event.title}" if event else "Event update",
        _greeting(user) + f"{_event_label(event)} has changed. {change}" + SIGNATURE,
    )


async def _event_cancelled(db: AsyncSession, user: User, ctx: dict[str, Any]) -> Rendered:
    event = await _get(db, Event, ctx.get("event_id"))
    return (
        f"Cancelled: {event.title}" if event else "Event cancelled",
        _greeting(user)
        + f"{_event_label(event)} has been cancelled by the organizer. Your tickets are no longer "
        "valid. Paid orders are refunded in full and you will get a separate confirmation."
        + SIGNATURE,
    )


async def _refund_completed(db: AsyncSession, user: User, ctx: dict[str, Any]) -> Rendered:
    order, event = await _order_and_event(db, ctx)
    refund = await _get(db, Refund, ctx.get("refund_id"))
    amount = f" of {Money(refund.amount, refund.currency)}" if refund is not None else ""
    return (
        "Refund completed",
        _greeting(user)
        + f"A refund{amount} for {_order_label(order)} ({_event_label(event)}) is complete. "
        "The tickets in this order are no longer valid. This is a simulated payment: no real "
        "money was moved." + SIGNATURE,
    )


async def _payout_status(db: AsyncSession, user: User, ctx: dict[str, Any]) -> Rendered:
    payout = await _get(db, Payout, ctx.get("payout_id"))
    status = ctx.get("status") or (payout.status.value if payout else "updated")
    event = await _get(db, Event, payout.event_id) if payout is not None else None
    amount = f" of {Money(payout.net, payout.currency)}" if payout is not None else ""
    return (
        f"Payout {status}",
        _greeting(user) + f"Your payout{amount} for {_event_label(event)} is now {status}. "
        "Payouts are simulated: no real money was moved." + SIGNATURE,
    )


def _support_template(title: str, line: str) -> Template:
    async def render(db: AsyncSession, user: User, ctx: dict[str, Any]) -> Rendered:
        case = f" (case {ctx['case_id']})" if ctx.get("case_id") else ""
        status = f" Status: {ctx['status']}." if ctx.get("status") else ""
        return title, _greeting(user) + line + case + "." + status + SIGNATURE

    return render


async def _account_verification(db: AsyncSession, user: User, ctx: dict[str, Any]) -> Rendered:
    # The verification link itself is sent by email_verification.py and never stored here.
    return "Email confirmed", _greeting(user) + "Your email address is confirmed." + SIGNATURE


TEMPLATES: dict[NotificationType, Template] = {
    NotificationType.account_verification: _account_verification,
    NotificationType.purchase_confirmation: _purchase_confirmation,
    NotificationType.payment_failed: _payment_failed,
    NotificationType.ticket_delivery: _ticket_delivery,
    NotificationType.event_update: _event_update,
    NotificationType.event_cancelled: _event_cancelled,
    NotificationType.refund_completed: _refund_completed,
    NotificationType.payout_status: _payout_status,
    NotificationType.support_message: _support_template(
        "New support message", "There is a new reply in your support case"
    ),
    NotificationType.support_assigned: _support_template(
        "Support case assigned", "A support case was assigned to you"
    ),
    NotificationType.support_status: _support_template(
        "Support case updated", "The status of your support case changed"
    ),
}


async def render(
    db: AsyncSession, event_type: NotificationType, user: User, context: dict[str, Any]
) -> Rendered:
    return await TEMPLATES[event_type](db, user, context)
