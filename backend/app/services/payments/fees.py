"""Configurable P6 amounts. A platform_settings row (managed by P11) wins over the env default."""

from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.money import Money
from app.models.setting import PlatformSetting

ACTIVATION_FEE_KEY = "activation_fee_amount"
PROCESSING_FEE_KEY = "processing_fee_percent"
PAYOUT_DELAY_KEY = "payout_delay_days"


async def _setting(db: AsyncSession, key: str) -> Any:
    row = await db.get(PlatformSetting, key)
    return None if row is None else row.value


async def activation_fee(db: AsyncSession) -> Money:
    value = await _setting(db, ACTIVATION_FEE_KEY)
    if isinstance(value, int) and not isinstance(value, bool) and value > 0:
        return Money(value)
    return Money(get_settings().activation_fee_amount)


async def processing_fee_percent(db: AsyncSession) -> Decimal:
    value = await _setting(db, PROCESSING_FEE_KEY)
    if value is not None and not isinstance(value, bool):
        try:
            percent = Decimal(str(value))
        except InvalidOperation:
            percent = None
        if percent is not None and 0 <= percent <= 100:
            return percent
    return get_settings().processing_fee_percent


async def processing_fee(db: AsyncSession, amount: Money) -> Money:
    """Platform fee on one ticket payment. Deducted from the organizer's payout, never added
    to the buyer's total (the SRS forbids a per-ticket service fee)."""
    return amount.percent(await processing_fee_percent(db))


async def payout_delay_days(db: AsyncSession) -> int:
    value = await _setting(db, PAYOUT_DELAY_KEY)
    if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
        return value
    return get_settings().payout_delay_days
