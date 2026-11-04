"""`issue_tickets()`: the interface P5/P6 call once an order is confirmed [P8]."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order
from app.models.ticket import Ticket


async def issue_tickets(db: AsyncSession, order: Order) -> list[Ticket]:
    """Create one ticket per attendee of a paid or free-confirmed order.

    Must be idempotent: a duplicate payment webhook must not create a second set.
    """
    raise NotImplementedError("P8 (Dima). Patch this in tests until it lands.")
