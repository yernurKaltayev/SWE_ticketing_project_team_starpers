"""Orders, line items and attendees [P5]."""

import enum
import uuid
from datetime import datetime

from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import (
    Base,
    Currency,
    MoneyAmount,
    Timestamps,
    TrueByDefault,
    UUIDPrimaryKey,
    ZeroMoney,
    fk,
    pg_enum,
)


class OrderStatus(enum.StrEnum):
    pending = "pending"
    paid = "paid"
    free_confirmed = "free_confirmed"
    failed = "failed"
    expired = "expired"
    cancelled = "cancelled"
    refunded = "refunded"
    partially_refunded = "partially_refunded"


class Order(UUIDPrimaryKey, Timestamps, Currency, Base):
    __tablename__ = "orders"

    order_number: Mapped[str] = mapped_column(unique=True)
    event_id: Mapped[uuid.UUID] = fk("events.id")
    buyer_user_id: Mapped[uuid.UUID | None] = fk("users.id")
    buyer_email: Mapped[str]
    status: Mapped[OrderStatus] = mapped_column(
        pg_enum(OrderStatus, "order_status"), default=OrderStatus.pending, server_default="pending"
    )
    subtotal: Mapped[ZeroMoney]
    discount_amount: Mapped[ZeroMoney]
    processing_fee: Mapped[ZeroMoney]
    total: Mapped[ZeroMoney]
    promo_code_id: Mapped[uuid.UUID | None] = fk("promo_codes.id")
    idempotency_key: Mapped[str] = mapped_column(unique=True)
    expires_at: Mapped[datetime | None]  # NULL for free orders, which are confirmed at once
    is_simulated: Mapped[TrueByDefault]


class OrderItem(UUIDPrimaryKey, Timestamps, Currency, Base):
    __tablename__ = "order_items"

    order_id: Mapped[uuid.UUID] = fk("orders.id")
    ticket_type_id: Mapped[uuid.UUID] = fk("ticket_types.id")
    seat_id: Mapped[uuid.UUID | None] = fk("seats.id")
    section_name: Mapped[str | None]
    row_label: Mapped[str | None]
    seat_number: Mapped[int | None]
    unit_price: Mapped[MoneyAmount]
    quantity: Mapped[int]
    line_total: Mapped[MoneyAmount]


class Attendee(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "attendees"

    order_id: Mapped[uuid.UUID] = fk("orders.id")
    order_item_id: Mapped[uuid.UUID | None] = fk("order_items.id")
    full_name: Mapped[str]
    email: Mapped[str]
    phone: Mapped[str | None]
