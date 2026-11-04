"""`apply_promo()`: the interface P5 calls during checkout [P16]."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order


async def apply_promo(db: AsyncSession, order: Order, code: str) -> int:
    """Atomically redeem `code` for `order` and return the discount in tiyn.

    Runs inside the order transaction. Raises an AppError if the code cannot be used.
    """
    raise NotImplementedError("P16 (Dima). Patch this in tests until it lands.")
