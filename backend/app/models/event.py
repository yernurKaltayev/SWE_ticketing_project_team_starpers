"""Events [P2]."""

import enum
import secrets
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JsonObject, Timestamps, UUIDPrimaryKey, fk, pg_enum


class EventStatus(enum.StrEnum):
    """Stored lifecycle. Upcoming/Active/Completed are derived from dates, never stored."""

    draft = "draft"
    published = "published"
    cancelled = "cancelled"


class EventVisibility(enum.StrEnum):
    public = "public"
    unlisted = "unlisted"
    private = "private"


class SeatingMode(enum.StrEnum):
    general_admission = "general_admission"
    assigned = "assigned"


class PaidSalesStatus(enum.StrEnum):
    disabled = "disabled"
    active = "active"
    suspended = "suspended"


def new_share_token() -> str:
    return secrets.token_urlsafe(16)


class Event(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "events"

    organizer_id: Mapped[uuid.UUID] = fk("organizer_profiles.id")
    title: Mapped[str]
    description: Mapped[str]
    category: Mapped[str]
    image_urls: Mapped[list[Any]] = mapped_column(JSONB, default=list, server_default=text("'[]'"))
    venue_id: Mapped[uuid.UUID] = fk("venues.id")
    layout_id: Mapped[uuid.UUID | None] = fk("venue_layouts.id")
    starts_at: Mapped[datetime]
    ends_at: Mapped[datetime]
    timezone: Mapped[str]  # IANA name, e.g. Asia/Almaty
    visibility: Mapped[EventVisibility] = mapped_column(
        pg_enum(EventVisibility, "event_visibility"),
        default=EventVisibility.public,
        server_default="public",
    )
    share_token: Mapped[str] = mapped_column(unique=True, default=new_share_token)
    status: Mapped[EventStatus] = mapped_column(
        pg_enum(EventStatus, "event_status"), default=EventStatus.draft, server_default="draft"
    )
    seating_mode: Mapped[SeatingMode] = mapped_column(
        pg_enum(SeatingMode, "seating_mode"),
        default=SeatingMode.general_admission,
        server_default="general_admission",
    )
    capacity: Mapped[int]
    registration_opens_at: Mapped[datetime | None]
    registration_closes_at: Mapped[datetime | None]
    paid_sales_status: Mapped[PaidSalesStatus] = mapped_column(
        pg_enum(PaidSalesStatus, "paid_sales_status"),
        default=PaidSalesStatus.disabled,
        server_default="disabled",
    )
    refund_policy: Mapped[JsonObject]
    cancelled_at: Mapped[datetime | None]
    duplicated_from_id: Mapped[uuid.UUID | None] = fk("events.id")
