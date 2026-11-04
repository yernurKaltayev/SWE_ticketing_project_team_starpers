"""Check-in records [P15]."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import Index, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPrimaryKey, fk, pg_enum, utcnow


class CheckInResult(enum.StrEnum):
    accepted = "accepted"
    reverted = "reverted"


class CheckInRecord(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "checkin_records"
    __table_args__ = (
        # At most one live check-in per ticket; a reverted one may be followed by another.
        Index(
            "uq_checkin_records_ticket_active",
            "ticket_id",
            unique=True,
            postgresql_where=text("reverted_at IS NULL"),
        ),
    )

    ticket_id: Mapped[uuid.UUID] = fk("tickets.id")
    event_id: Mapped[uuid.UUID] = fk("events.id")
    staff_user_id: Mapped[uuid.UUID] = fk("users.id")
    checked_in_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
    reverted_at: Mapped[datetime | None]
    reverted_by: Mapped[uuid.UUID | None] = fk("users.id")
    revert_reason: Mapped[str | None]
    result: Mapped[CheckInResult] = mapped_column(
        pg_enum(CheckInResult, "checkin_result"),
        default=CheckInResult.accepted,
        server_default="accepted",
    )
