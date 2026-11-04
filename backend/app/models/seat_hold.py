"""Temporary seat holds [P4]."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Index, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPrimaryKey, fk, pg_enum


class SeatHoldStatus(enum.StrEnum):
    held = "held"
    converted = "converted"
    released = "released"
    expired = "expired"


class SeatHold(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "seat_holds"
    __table_args__ = (
        # Two concurrent checkouts cannot both hold a seat: the second INSERT fails.
        Index(
            "uq_seat_holds_event_seat_active",
            "event_id",
            "seat_id",
            unique=True,
            postgresql_where=text("status = 'held'"),
        ),
        CheckConstraint("user_id IS NOT NULL OR session_id IS NOT NULL", name="has_owner"),
    )

    event_id: Mapped[uuid.UUID] = fk("events.id")
    seat_id: Mapped[uuid.UUID] = fk("seats.id")
    session_id: Mapped[str | None]
    user_id: Mapped[uuid.UUID | None] = fk("users.id")
    order_id: Mapped[uuid.UUID | None] = fk("orders.id")
    status: Mapped[SeatHoldStatus] = mapped_column(
        pg_enum(SeatHoldStatus, "seat_hold_status"),
        default=SeatHoldStatus.held,
        server_default="held",
    )
    expires_at: Mapped[datetime]
