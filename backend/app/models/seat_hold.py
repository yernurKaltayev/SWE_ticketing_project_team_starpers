"""Single canonical record for a seat hold (P0 / P4 / P5)."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Index, String, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPrimaryKey, fk, pg_enum


class SeatHoldStatus(enum.StrEnum):
    held = "held"
    converted = "converted"  # Sold/checked out, retained to prevent resale.
    released = "released"
    expired = "expired"


class SeatHoldGroup(UUIDPrimaryKey, Base):
    """One temporary checkout grouping one or more canonical seat_holds rows."""
    __tablename__ = "seat_hold_groups"
    __table_args__ = (
        Index("ix_seat_hold_groups_event_expires", "event_id", "expires_at",
              postgresql_where=text("status = 'held'")),
        CheckConstraint("status IN ('held', 'released', 'expired', 'sold')",
                        name="status"),
    )

    event_id: Mapped[uuid.UUID] = fk("events.id")
    user_id: Mapped[uuid.UUID] = fk("users.id")
    status: Mapped[str] = mapped_column(String(length=16), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),
                                                  nullable=False, server_default=func.now())


class SeatHold(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "seat_holds"
    __table_args__ = (
        Index(
            "uq_seat_holds_event_seat_active",
            "event_id", "seat_id", unique=True,
            postgresql_where=text("status IN ('held', 'converted')"),
        ),
        Index("ix_seat_holds_hold_group_id", "hold_group_id"),
        UniqueConstraint("hold_group_id", "seat_id", name="uq_seat_holds_group_seat"),
        CheckConstraint("user_id IS NOT NULL OR session_id IS NOT NULL", name="has_owner"),
        CheckConstraint("hold_group_id IS NULL OR ticket_type_id IS NOT NULL",
                        name="group_requires_ticket_type"),
    )

    event_id: Mapped[uuid.UUID] = fk("events.id")
    seat_id: Mapped[uuid.UUID] = fk("seats.id")
    session_id: Mapped[str | None]
    user_id: Mapped[uuid.UUID | None] = fk("users.id")
    order_id: Mapped[uuid.UUID | None] = fk("orders.id")
    # Optional for existing P0 seat holds; required for all P4-created holds.
    hold_group_id: Mapped[uuid.UUID | None] = fk("seat_hold_groups.id")
    ticket_type_id: Mapped[uuid.UUID | None] = fk("ticket_types.id")
    status: Mapped[SeatHoldStatus] = mapped_column(
        pg_enum(SeatHoldStatus, "seat_hold_status"),
        default=SeatHoldStatus.held,
        server_default="held",
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
