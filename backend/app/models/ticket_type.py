"""Ticket types and inventory counters [P3]."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import (
    Base,
    Counter,
    Currency,
    FalseByDefault,
    Timestamps,
    UUIDPrimaryKey,
    ZeroMoney,
    fk,
)


class TicketType(UUIDPrimaryKey, Timestamps, Currency, Base):
    __tablename__ = "ticket_types"
    __table_args__ = (
        CheckConstraint("qty_reserved + qty_sold <= quantity_total", name="not_oversold"),
        CheckConstraint(
            "qty_reserved >= 0 AND qty_sold >= 0 AND qty_refunded >= 0 AND qty_checked_in >= 0",
            name="counters_not_negative",
        ),
    )

    event_id: Mapped[uuid.UUID] = fk("events.id")
    name: Mapped[str]
    description: Mapped[str | None]
    price_amount: Mapped[ZeroMoney]
    quantity_total: Mapped[int]
    is_free: Mapped[FalseByDefault]
    sales_start: Mapped[datetime | None]
    sales_end: Mapped[datetime | None]
    max_per_order: Mapped[int] = mapped_column(default=10, server_default="10")
    is_hidden: Mapped[FalseByDefault]
    price_category: Mapped[str | None]
    qty_reserved: Mapped[Counter]
    qty_sold: Mapped[Counter]
    qty_refunded: Mapped[Counter]
    qty_checked_in: Mapped[Counter]
