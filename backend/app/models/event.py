"""Database-backed event/ticketing slice. Monetary amounts are whole KZT."""

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Event(Base, TimestampMixin):
    __tablename__ = "events"
    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="event_dates"),
        CheckConstraint(
            "status IN ('draft','published','cancelled','suspended')", name="event_status"
        ),
        CheckConstraint("visibility IN ('public','unlisted','private')", name="event_visibility"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    organizer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    organizer_name: Mapped[str] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    visibility: Mapped[str] = mapped_column(String(20), default="public")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    registration_starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    registration_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_sales_active: Mapped[bool] = mapped_column(Boolean, default=False)
    # Validated presentation metadata; transactional fields live in separate columns/tables.
    details: Mapped[dict] = mapped_column(JSON)
    activation: Mapped[dict | None] = mapped_column(JSON)


class TicketType(Base):
    __tablename__ = "ticket_types"
    __table_args__ = (
        CheckConstraint("price >= 0", name="ticket_price"),
        CheckConstraint("quantity > 0 AND sold >= 0 AND sold <= quantity", name="ticket_inventory"),
        CheckConstraint("per_order_limit BETWEEN 1 AND 20", name="ticket_order_limit"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    price: Mapped[int] = mapped_column(Integer)
    quantity: Mapped[int] = mapped_column(Integer)
    sold: Mapped[int] = mapped_column(Integer, default=0)
    per_order_limit: Mapped[int] = mapped_column(Integer, default=6)
    hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    sale_starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sale_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Order(Base, TimestampMixin):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="order_idempotency"),
        CheckConstraint("status IN ('paid','failed','refunded')", name="order_status"),
        CheckConstraint("subtotal >= 0 AND discount >= 0 AND total >= 0", name="order_amounts"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    buyer_name: Mapped[str] = mapped_column(String(255))
    buyer_email: Mapped[str] = mapped_column(String(255))
    # Immutable line-item price/name snapshots; never accepted from the checkout client.
    items: Mapped[list] = mapped_column(JSON)
    subtotal: Mapped[int] = mapped_column(BigInteger)
    discount: Mapped[int] = mapped_column(BigInteger)
    total: Mapped[int] = mapped_column(BigInteger)
    promo_code: Mapped[str | None] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20))
    idempotency_key: Mapped[str] = mapped_column(String(80))
    request_fingerprint: Mapped[str] = mapped_column(String(64))


class Ticket(Base):
    __tablename__ = "tickets"
    __table_args__ = (
        CheckConstraint(
            "status IN ('valid','checked_in','cancelled','refunded')", name="ticket_status"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(100), unique=True)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    ticket_type_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ticket_types.id"))
    ticket_type_name: Mapped[str] = mapped_column(String(120))
    holder_name: Mapped[str] = mapped_column(String(255))
    holder_email: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="valid")
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PromoCode(Base):
    __tablename__ = "promo_codes"
    __table_args__ = (
        UniqueConstraint("event_id", "code", name="promo_event_code"),
        CheckConstraint("value > 0", name="promo_value"),
        CheckConstraint("kind IN ('percent','fixed')", name="promo_kind"),
        CheckConstraint("kind != 'percent' OR value <= 100", name="promo_percent"),
        CheckConstraint(
            "max_redemptions > 0 AND redemptions >= 0 AND redemptions <= max_redemptions",
            name="promo_redemptions",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    code: Mapped[str] = mapped_column(String(20))
    kind: Mapped[str] = mapped_column(String(10))
    value: Mapped[int] = mapped_column(Integer)
    max_redemptions: Mapped[int] = mapped_column(Integer)
    redemptions: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    campaign_name: Mapped[str] = mapped_column(String(255), default="")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    actor: Mapped[str] = mapped_column(String(255))
    action: Mapped[str] = mapped_column(Text)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class StaffAssignment(Base):
    __tablename__ = "staff_assignments"

    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
