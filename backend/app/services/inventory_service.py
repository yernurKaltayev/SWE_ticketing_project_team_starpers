"""Order-level inventory release for P3/P4.

The caller owns the database transaction.
This function does not commit.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.models.order import Order, OrderItem, OrderStatus
from app.services.ticket_type_service import (
    release_inventory as release_ticket_quantity,
)


async def release_inventory(
    db: AsyncSession,
    order: Order,
    *,
    terminal_status: OrderStatus = OrderStatus.expired,
) -> None:
    """Release a pending general-admission order at most once."""

    if terminal_status not in {
        OrderStatus.expired,
        OrderStatus.cancelled,
        OrderStatus.failed,
    }:
        raise ValueError("Invalid terminal status for release")

    locked_order = await db.scalar(
        select(Order)
        .where(Order.id == order.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )

    if locked_order is None:
        raise NotFoundError("Order not found.", code="order_not_found")

    if locked_order.status in {
        OrderStatus.expired,
        OrderStatus.cancelled,
        OrderStatus.failed,
    }:
        return

    if locked_order.status != OrderStatus.pending:
        raise ConflictError(
            "Only pending orders can release reservations.",
            code="order_not_pending",
        )

    items = (
        await db.scalars(
            select(OrderItem)
            .where(OrderItem.order_id == locked_order.id)
            .order_by(OrderItem.ticket_type_id, OrderItem.id)
        )
    ).all()

    # Assigned seating needs additional seat-state handling.
    # Do not silently mark these reservations as released.
    if any(item.seat_id is not None for item in items):
        raise NotImplementedError("Assigned-seat release must be integrated with the seat model.")

    for item in items:
        released = await release_ticket_quantity(db, item.ticket_type_id, item.quantity)

        if not released:
            raise ConflictError(
                "Unable to release reserved inventory.",
                code="inventory_release_failed",
            )

    locked_order.status = terminal_status
    await db.flush()
