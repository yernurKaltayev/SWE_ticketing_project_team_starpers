"""Issued tickets [P8]."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import Index, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPrimaryKey, fk, pg_enum, utcnow


class TicketStatus(enum.StrEnum):
    valid = "valid"
    checked_in = "checked_in"
    cancelled = "cancelled"
    refunded = "refunded"


class Ticket(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "tickets"
    __table_args__ = (
        # A sold seat cannot be sold twice. NULL seat_ids (general admission) never conflict.
        Index(
            "uq_tickets_event_seat_active",
            "event_id",
            "seat_id",
            unique=True,
            postgresql_where=text("status IN ('valid', 'checked_in')"),
        ),
    )

    ticket_number: Mapped[str] = mapped_column(unique=True)
    order_item_id: Mapped[uuid.UUID] = fk("order_items.id")
    event_id: Mapped[uuid.UUID] = fk("events.id")
    ticket_type_id: Mapped[uuid.UUID] = fk("ticket_types.id")
    attendee_id: Mapped[uuid.UUID] = fk("attendees.id")
    seat_id: Mapped[uuid.UUID | None] = fk("seats.id")
    section_name: Mapped[str | None]
    row_label: Mapped[str | None]
    seat_number: Mapped[int | None]
    qr_token: Mapped[str] = mapped_column(unique=True)
    status: Mapped[TicketStatus] = mapped_column(
        pg_enum(TicketStatus, "ticket_status"), default=TicketStatus.valid, server_default="valid"
    )
    issued_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
    pdf_object_key: Mapped[str | None]
