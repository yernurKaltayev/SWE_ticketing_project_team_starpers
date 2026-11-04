"""Platform settings and reported events [P11]."""

import enum
import uuid
from typing import Any

from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPrimaryKey, fk, pg_enum


class EventReportStatus(enum.StrEnum):
    open = "open"
    reviewed = "reviewed"
    dismissed = "dismissed"
    actioned = "actioned"


class PlatformSetting(Timestamps, Base):
    __tablename__ = "platform_settings"

    key: Mapped[str] = mapped_column(primary_key=True)
    value: Mapped[Any] = mapped_column(JSONB)
    updated_by: Mapped[uuid.UUID | None] = fk("users.id")


class EventReport(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "event_reports"

    event_id: Mapped[uuid.UUID] = fk("events.id")
    reporter_id: Mapped[uuid.UUID] = fk("users.id")
    reason: Mapped[str]
    status: Mapped[EventReportStatus] = mapped_column(
        pg_enum(EventReportStatus, "event_report_status"),
        default=EventReportStatus.open,
        server_default="open",
    )
