"""Support cases and message threads [P10]."""

import enum
import uuid

from sqlalchemy import Index
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPrimaryKey, fk, pg_enum


class SupportAudience(enum.StrEnum):
    attendee_case = "attendee_case"
    organizer_case = "organizer_case"


class SupportCategory(enum.StrEnum):
    ticket_delivery = "ticket_delivery"
    payment = "payment"
    refund = "refund"
    seating = "seating"
    event_info = "event_info"
    check_in = "check_in"
    account = "account"
    technical = "technical"


class SupportStatus(enum.StrEnum):
    open = "open"
    in_progress = "in_progress"
    waiting_customer = "waiting_customer"
    resolved = "resolved"


class SupportCase(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "support_cases"

    requester_id: Mapped[uuid.UUID] = fk("users.id")
    audience: Mapped[SupportAudience] = mapped_column(pg_enum(SupportAudience, "support_audience"))
    category: Mapped[SupportCategory] = mapped_column(pg_enum(SupportCategory, "support_category"))
    status: Mapped[SupportStatus] = mapped_column(
        pg_enum(SupportStatus, "support_status"), default=SupportStatus.open, server_default="open"
    )
    assignee_id: Mapped[uuid.UUID | None] = fk("users.id")
    event_id: Mapped[uuid.UUID | None] = fk("events.id")
    order_id: Mapped[uuid.UUID | None] = fk("orders.id")
    ticket_id: Mapped[uuid.UUID | None] = fk("tickets.id")
    subject: Mapped[str]


class SupportMessage(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "support_messages"
    # Serves the polling query: messages of one case newer than a given one.
    __table_args__ = (Index("ix_support_messages_case_created", "case_id", "created_at"),)

    case_id: Mapped[uuid.UUID] = fk("support_cases.id", index=False)
    author_id: Mapped[uuid.UUID] = fk("users.id")
    body: Mapped[str]
