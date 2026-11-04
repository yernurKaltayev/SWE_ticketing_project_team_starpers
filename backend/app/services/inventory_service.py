"""`release_inventory()`: the interface used when an order does not complete [P3/P4]."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order


async def release_inventory(db: AsyncSession, order: Order) -> None:
    """Return the order's reserved quantities and seats. Safe to call more than once."""
    raise NotImplementedError("P3/P4 (Dos). Patch this in tests until it lands.")
