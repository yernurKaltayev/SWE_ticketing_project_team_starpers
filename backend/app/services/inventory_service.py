"""Idempotent release of P5 pending reservations, including P4 seat holds.

The caller owns the DB transaction.  P4 can independently expire a seat hold;
when that happens it has *already* returned inventory to P3.  This service
therefore returns only still-held seats and never double-decrements counters.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.models.event import Event
from app.models.order import Order, OrderItem, OrderStatus
from app.models.seat_hold import SeatHold, SeatHoldGroup, SeatHoldStatus
from app.services.promo_service import release_promo
from app.services.ticket_type_service import release_inventory as release_ticket_quantity


async def release_inventory(
    db: AsyncSession,
    order: Order,
    *,
    terminal_status: OrderStatus = OrderStatus.expired,
) -> None:
    if terminal_status not in {OrderStatus.expired, OrderStatus.cancelled, OrderStatus.failed}:
        raise ValueError("Invalid terminal status for inventory release")
    # Lock order and event in the same global order as checkout/P4: Event -> Order.
    event = await db.scalar(select(Event).where(Event.id == order.event_id).with_for_update())
    if event is None:
        raise NotFoundError("Event not found.", code="event_not_found")
    locked = await db.scalar(
        select(Order)
        .where(Order.id == order.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if locked is None:
        raise NotFoundError("Order not found.", code="order_not_found")
    if locked.status in {OrderStatus.expired, OrderStatus.cancelled, OrderStatus.failed}:
        return
    if locked.status != OrderStatus.pending:
        raise ConflictError(
            "Only pending orders can release reservations.", code="order_not_pending"
        )

    items = list(
        await db.scalars(
            select(OrderItem)
            .where(OrderItem.order_id == locked.id)
            .order_by(OrderItem.ticket_type_id, OrderItem.id)
        )
    )
    seats = list(
        await db.scalars(
            select(SeatHold)
            .where(SeatHold.order_id == locked.id)
            .order_by(SeatHold.ticket_type_id, SeatHold.id)
            .with_for_update()
        )
    )
    assigned_ids = {item.seat_id for item in items if item.seat_id is not None}
    if assigned_ids and assigned_ids != {seat.seat_id for seat in seats}:
        raise ConflictError(
            "Order's reserved seats are inconsistent.", code="seat_reservations_inconsistent"
        )

    for item in items:
        if item.seat_id is None and not await release_ticket_quantity(
            db, item.ticket_type_id, item.quantity
        ):
            raise ConflictError("Unable to release inventory.", code="inventory_release_failed")
    groups = set()
    for seat in seats:
        if seat.status == SeatHoldStatus.converted:
            raise ConflictError(
                "A pending order has a sold seat.", code="seat_reservations_inconsistent"
            )
        if seat.status == SeatHoldStatus.held:
            ticket_type_id = seat.ticket_type_id
            if ticket_type_id is None:
                raise ConflictError(
                    "Seat hold has no ticket type.",
                    code="seat_reservations_inconsistent",
                )

            if not await release_ticket_quantity(db, ticket_type_id, 1):
                raise ConflictError(
                    "Unable to release seat inventory.", code="inventory_release_failed"
                )
            seat.status = SeatHoldStatus.released
        if seat.hold_group_id is not None:
            groups.add(seat.hold_group_id)
    for group_id in sorted(groups):
        group = await db.get(SeatHoldGroup, group_id)
        if group is not None and group.status == "held":
            group.status = "released"
    # P16: a failed, expired or cancelled checkout gives its promo slot back.
    await release_promo(db, locked)
    locked.status = terminal_status
    await db.flush()
