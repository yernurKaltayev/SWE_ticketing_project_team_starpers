"""Organizer analytics [P13, SRS 4.15]: read-only aggregates over authoritative rows.

Definitions (also in docs/p13-analytics-implementation.md):
- Sale orders: paid, free_confirmed, refunded, partially_refunded. Pending, failed, expired and
  cancelled orders are not sales.
- Inventory numbers (sold, remaining, checked-in) are the current state of the event's tickets and
  ignore the date filter. Money and the time series follow the date filter (on order creation time).
- gross = ticket list price of sale orders; discounts = promo discounts; refunds = completed
  refunds; net = gross - discounts - refunds. The processing fee is a payout deduction, not part
  of these (P6).
- With `ticket_type_id`, order-level discounts and refunds are split by that type's share of the
  order subtotal (half-up), so filtered figures add up to the unfiltered ones.
- Days are in the event's time zone. Nothing here writes or locks (a test checks no rows change).
"""

import uuid
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, UnprocessableError
from app.models.event import Event
from app.models.order import Order, OrderItem, OrderStatus
from app.models.promo import PromoRedemption, PromoRedemptionStatus, PromotionalCampaign
from app.models.refund import Refund, RefundStatus
from app.models.ticket import Ticket, TicketStatus
from app.models.ticket_type import TicketType
from app.schemas.analytics import AnalyticsOut, CampaignStat, Point, Row

SALE_STATUSES = (
    OrderStatus.paid,
    OrderStatus.free_confirmed,
    OrderStatus.refunded,
    OrderStatus.partially_refunded,
)
LIVE_TICKETS = (TicketStatus.valid, TicketStatus.checked_in)
MAX_SERIES_DAYS = 366


def share(amount: int, part: int, whole: int) -> int:
    """`amount * part / whole`, rounded half-up to the tiyn; 0 when `whole` is 0."""
    if whole <= 0 or part <= 0:
        return 0
    value = Decimal(amount) * part / whole
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def percent(part: int, whole: int) -> float:
    return round(part * 100 / whole, 1) if whole > 0 else 0.0


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _zone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


async def event_analytics(
    db: AsyncSession,
    event: Event,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    ticket_type_id: uuid.UUID | None = None,
) -> AnalyticsOut:
    if date_from and date_to and _aware(date_from) > _aware(date_to):
        raise UnprocessableError("date_from must not be after date_to.", code="invalid_date_range")

    types = list(
        await db.scalars(
            select(TicketType).where(TicketType.event_id == event.id).order_by(TicketType.name)
        )
    )
    if ticket_type_id is not None and all(t.id != ticket_type_id for t in types):
        raise NotFoundError("Ticket type not found for event.", code="ticket_type_not_found")
    selected = [t for t in types if ticket_type_id in (None, t.id)]

    sold_by_type, checked_in_by_type = await _ticket_counts(db, event.id)
    sold = sum(sold_by_type.get(t.id, 0) for t in selected)
    checked_in = sum(checked_in_by_type.get(t.id, 0) for t in selected)
    reserved = sum(t.qty_reserved for t in selected)
    capacity = selected[0].quantity_total if ticket_type_id is not None else event.capacity

    money = await _money(db, event, selected, date_from, date_to)
    return AnalyticsOut(
        capacity=capacity,
        sold=sold,
        remaining=max(capacity - sold - reserved, 0),
        percent_sold=percent(sold, capacity),
        gross=money.gross,
        discounts=money.discounts,
        refunds=money.refunds,
        net=money.gross - money.discounts - money.refunds,
        sales_over_time=money.series(date_from, date_to),
        by_ticket_type=[
            Row(
                ticket_type_id=t.id,
                name=t.name,
                sold=sold_by_type.get(t.id, 0),
                revenue=money.type_revenue.get(t.id, 0),
            )
            for t in selected
        ],
        campaigns=await _campaigns(db, event.id, ticket_type_id, date_from, date_to),
        checked_in=checked_in,
        absent=max(sold - checked_in, 0),
        checkin_percent=percent(checked_in, sold),
    )


async def _ticket_counts(
    db: AsyncSession, event_id: uuid.UUID
) -> tuple[dict[uuid.UUID, int], dict[uuid.UUID, int]]:
    rows = await db.execute(
        select(
            Ticket.ticket_type_id,
            func.count(Ticket.id).filter(Ticket.status.in_(LIVE_TICKETS)),
            func.count(Ticket.id).filter(Ticket.status == TicketStatus.checked_in),
        )
        .where(Ticket.event_id == event_id)
        .group_by(Ticket.ticket_type_id)
    )
    sold: dict[uuid.UUID, int] = {}
    checked: dict[uuid.UUID, int] = {}
    for type_id, live, used in rows:
        sold[type_id] = int(live)
        checked[type_id] = int(used)
    return sold, checked


class _Money:
    def __init__(self, zone: ZoneInfo) -> None:
        self.zone = zone
        self.gross = 0
        self.discounts = 0
        self.refunds = 0
        self.type_revenue: dict[uuid.UUID, int] = defaultdict(int)
        self.days: dict[date, list[int]] = defaultdict(lambda: [0, 0])  # tickets, revenue

    def series(self, date_from: datetime | None, date_to: datetime | None) -> list[Point]:
        if not self.days and not (date_from and date_to):
            return []
        first = _aware(date_from).astimezone(self.zone).date() if date_from else min(self.days)
        last = (
            (_aware(date_to) - timedelta(microseconds=1)).astimezone(self.zone).date()
            if date_to
            else datetime.now(self.zone).date()
        )
        last = max(last, first)
        first = max(first, last - timedelta(days=MAX_SERIES_DAYS - 1))
        points = []
        day = first
        while day <= last:
            tickets, revenue = self.days.get(day, (0, 0))
            points.append(Point(date=day, tickets=tickets, revenue=revenue))
            day += timedelta(days=1)
        return points


async def _money(
    db: AsyncSession,
    event: Event,
    selected: list[TicketType],
    date_from: datetime | None,
    date_to: datetime | None,
) -> _Money:
    wanted = {t.id for t in selected}
    conditions = [Order.event_id == event.id, Order.status.in_(SALE_STATUSES)]
    if date_from:
        conditions.append(Order.created_at >= _aware(date_from))
    if date_to:
        conditions.append(Order.created_at < _aware(date_to))
    rows = (
        await db.execute(
            select(
                Order.id,
                Order.created_at,
                Order.subtotal,
                Order.discount_amount,
                OrderItem.ticket_type_id,
                OrderItem.quantity,
                OrderItem.line_total,
            )
            .join(OrderItem, OrderItem.order_id == Order.id)
            .where(and_(*conditions))
        )
    ).all()
    order_ids = {row.id for row in rows}
    refunded: dict[uuid.UUID, int] = {}
    if order_ids:
        refunded = {
            order_id: int(total)
            for order_id, total in await db.execute(
                select(Refund.order_id, func.sum(Refund.amount))
                .where(Refund.order_id.in_(order_ids), Refund.status == RefundStatus.completed)
                .group_by(Refund.order_id)
            )
        }

    money = _Money(_zone(event.timezone))
    orders: dict[uuid.UUID, list[Any]] = defaultdict(list)
    for row in rows:
        orders[row.id].append(row)
    for order_id, lines in orders.items():
        head = lines[0]
        chosen = [line for line in lines if line.ticket_type_id in wanted]
        part = sum(line.line_total for line in chosen)
        if not chosen:
            continue
        discount = share(head.discount_amount, part, head.subtotal)
        money.gross += part
        money.discounts += discount
        money.refunds += share(refunded.get(order_id, 0), part, head.subtotal)
        for line in chosen:
            line_discount = share(head.discount_amount, line.line_total, head.subtotal)
            money.type_revenue[line.ticket_type_id] += line.line_total - line_discount
        day = _aware(head.created_at).astimezone(money.zone).date()
        bucket = money.days[day]
        bucket[0] += sum(line.quantity for line in chosen)
        bucket[1] += part - discount
    return money


async def _campaigns(
    db: AsyncSession,
    event_id: uuid.UUID,
    ticket_type_id: uuid.UUID | None,
    date_from: datetime | None,
    date_to: datetime | None,
) -> list[CampaignStat]:
    conditions = [
        PromotionalCampaign.event_id == event_id,
        PromoRedemption.status == PromoRedemptionStatus.applied,
        Order.status.in_(SALE_STATUSES),
    ]
    if date_from:
        conditions.append(Order.created_at >= _aware(date_from))
    if date_to:
        conditions.append(Order.created_at < _aware(date_to))
    if ticket_type_id is not None:
        conditions.append(
            select(OrderItem.id)
            .where(OrderItem.order_id == Order.id, OrderItem.ticket_type_id == ticket_type_id)
            .exists()
        )
    rows = await db.execute(
        select(
            PromotionalCampaign.id,
            PromotionalCampaign.name,
            func.count(Order.id),
            func.coalesce(func.sum(Order.subtotal - Order.discount_amount), 0),
        )
        .join(PromoRedemption, PromoRedemption.campaign_id == PromotionalCampaign.id)
        .join(Order, Order.id == PromoRedemption.order_id)
        .where(and_(*conditions))
        .group_by(PromotionalCampaign.id, PromotionalCampaign.name)
        .order_by(PromotionalCampaign.name, PromotionalCampaign.id)
    )
    return [
        CampaignStat(campaign_id=cid, name=name, redemptions=int(count), revenue=int(revenue))
        for cid, name, count, revenue in rows
    ]
